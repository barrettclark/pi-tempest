"""
UDP listener — receives WeatherFlow Hub broadcasts on port 50222.

Packet types handled:
  obs_st       — full Tempest observation (~60s)
  rapid_wind   — 3-second wind snapshot
  evt_strike   — lightning strike event
  evt_precip   — precipitation start event

All other packet types are silently ignored.
"""

import asyncio
import json
import logging
import sys
import time

import config
from collector import db
from collector.backfill import run as run_backfill

log = logging.getLogger("tempest.udp")

SENSOR_TYPES = ("obs_st", "rapid_wind", "evt_strike", "evt_precip")
_MIN_EPOCH = 946_684_800  # 2000-01-01; rejects zeroed or garbage timestamps
_NUM_LIMIT = 1e9  # far beyond any real sensor value; keeps unit conversions finite
_FUTURE_SLACK_S = 300  # tolerate modest clock skew between hub and Pi

_tasks: set[asyncio.Task] = set()


def _parse_obs_st(obs_array: list) -> dict:
    """
    Map positional obs_st array to a named dict.
    Fields beyond index 17 are ignored.
    Any field that is None in the packet is preserved as None.
    """
    return {
        "epoch": obs_array[0],
        "wind_lull": obs_array[1],
        "wind_avg": obs_array[2],
        "wind_gust": obs_array[3],
        "wind_direction": obs_array[4],
        "wind_sample_interval": obs_array[5],
        "station_pressure": obs_array[6],
        "air_temperature": obs_array[7],
        "relative_humidity": obs_array[8],
        "illuminance": obs_array[9],
        "uv": obs_array[10],
        "solar_radiation": obs_array[11],
        "rain_accumulated": obs_array[12],
        "precipitation_type": obs_array[13],
        "lightning_avg_distance": obs_array[14],
        "lightning_count": obs_array[15],
        "battery": obs_array[16],
        "report_interval": obs_array[17] if len(obs_array) > 17 else None,
    }


def _is_number(v: object) -> bool:
    # Comparison is exact for huge ints and false for NaN, so no isfinite check is needed.
    return isinstance(v, (int, float)) and not isinstance(v, bool) and abs(v) <= _NUM_LIMIT


def _is_direction(v: object) -> bool:
    return isinstance(v, int) and not isinstance(v, bool) and 0 <= v <= 360


def _is_num_or_none(v: object) -> bool:
    return v is None or _is_number(v)


def _is_epoch(v: object) -> bool:
    return (
        isinstance(v, int)
        and not isinstance(v, bool)
        and _MIN_EPOCH <= v <= time.time() + _FUTURE_SLACK_S
    )


def _is_our_sensor(packet: dict) -> bool:
    serial = packet.get("serial_number")
    if not isinstance(serial, str):
        return False
    if config.TEMPEST_SERIAL:
        return serial == config.TEMPEST_SERIAL
    return serial.startswith("ST-")


class TempestProtocol(asyncio.DatagramProtocol):
    def __init__(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def connection_made(self, transport: asyncio.BaseTransport) -> None:
        self._transport = transport
        log.info("UDP socket open on port %d", config.UDP_PORT)

    def datagram_received(self, data: bytes, addr: tuple) -> None:
        try:
            packet = json.loads(data.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            log.debug("Malformed packet from %s: %s", addr, exc)
            return

        if not isinstance(packet, dict):
            log.debug("Non-object packet from %s", addr)
            return

        ptype = packet.get("type")

        if ptype in SENSOR_TYPES and not _is_our_sensor(packet):
            log.debug("Ignoring %s from unexpected device: %s", ptype, packet.get("serial_number"))
            return

        if ptype == "obs_st":
            self._spawn(self._handle_obs_st(packet))
        elif ptype == "rapid_wind":
            self._spawn(self._handle_rapid_wind(packet))
        elif ptype == "evt_strike":
            self._spawn(self._handle_evt_strike(packet))
        elif ptype == "evt_precip":
            self._spawn(self._handle_evt_precip(packet))
        elif ptype in ("device_status", "hub_status"):
            pass  # informational only
        else:
            log.debug("Unknown packet type: %s", ptype)

    def error_received(self, exc: Exception) -> None:
        log.error("UDP error: %s", exc)

    def connection_lost(self, exc: Exception | None) -> None:
        log.warning("UDP connection lost: %s", exc)

    def _spawn(self, coro) -> None:
        task = self._loop.create_task(coro)
        _tasks.add(task)
        task.add_done_callback(_tasks.discard)

    async def _handle_obs_st(self, packet: dict) -> None:
        obs_list = packet.get("obs")
        if not isinstance(obs_list, list) or not obs_list:
            return

        obs_array = obs_list[0]
        if not isinstance(obs_array, list) or len(obs_array) < 17:
            log.warning("obs_st array too short or malformed")
            return
        if not _is_epoch(obs_array[0]) or not all(_is_num_or_none(v) for v in obs_array[1:18]):
            log.warning("obs_st rejected: invalid epoch or non-numeric field")
            return
        if obs_array[4] is not None and not _is_direction(obs_array[4]):
            log.warning("obs_st rejected: wind direction must be an integer 0-360")
            return

        try:
            obs = _parse_obs_st(obs_array)
            await db.insert_observation(obs, source="udp")
            log.debug(
                "obs_st stored: epoch=%s temp=%.1f°C", obs["epoch"], obs["air_temperature"] or 0
            )
        except Exception as exc:
            log.error("Failed to store obs_st: %s", exc)

    async def _handle_rapid_wind(self, packet: dict) -> None:
        ob = packet.get("ob")
        if not isinstance(ob, list) or len(ob) < 3:
            return
        if not _is_epoch(ob[0]) or not (_is_number(ob[1]) and _is_direction(ob[2])):
            log.warning("rapid_wind rejected: invalid epoch, speed, or direction")
            return
        try:
            await db.insert_rapid_wind(
                epoch=ob[0],
                speed=ob[1],
                direction=ob[2],
            )
        except Exception as exc:
            log.error("Failed to store rapid_wind: %s", exc)

    async def _handle_evt_strike(self, packet: dict) -> None:
        evt = packet.get("evt")
        if not isinstance(evt, list) or len(evt) < 3:
            return
        if not _is_epoch(evt[0]) or not (_is_number(evt[1]) and _is_number(evt[2])):
            log.warning("evt_strike rejected: invalid epoch or non-numeric field")
            return
        try:
            await db.insert_lightning(
                epoch=evt[0],
                distance=evt[1],
                energy=evt[2],
            )
            log.debug("Lightning strike: dist=%skm energy=%s", evt[1], evt[2])
        except Exception as exc:
            log.error("Failed to store lightning: %s", exc)

    async def _handle_evt_precip(self, packet: dict) -> None:
        evt = packet.get("evt")
        if not isinstance(evt, list) or not evt or not _is_epoch(evt[0]):
            log.warning("evt_precip rejected: missing or invalid epoch")
            return
        epoch = evt[0]
        try:
            await db.insert_rain_event(epoch=epoch)
            log.debug("Rain event at epoch=%s", epoch)
        except Exception as exc:
            log.error("Failed to store rain event: %s", exc)


async def _backfill_if_needed() -> None:
    try:
        if await db.backfill_needed():
            log.info("No backfill record found — starting historic data backfill...")
            await run_backfill()
        else:
            log.info("Backfill already complete.")
    except Exception as exc:
        log.error("Backfill failed (continuing anyway): %s", exc)


async def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
        stream=sys.stdout,
    )
    # httpx logs full request URLs at INFO, which would print the API token.
    logging.getLogger("httpx").setLevel(logging.WARNING)

    log.info("Initializing database schema...")
    await db.init_schema()

    loop = asyncio.get_running_loop()

    log.info("Starting UDP listener on 0.0.0.0:%d...", config.UDP_PORT)
    await loop.create_datagram_endpoint(
        lambda: TempestProtocol(loop),
        local_addr=("0.0.0.0", config.UDP_PORT),
        allow_broadcast=True,
        reuse_port=True,
    )

    log.info("Listening for Tempest Hub broadcasts.")

    # Backfill runs beside the live listener so a slow REST pull never delays UDP.
    backfill = asyncio.create_task(_backfill_if_needed())
    _tasks.add(backfill)
    backfill.add_done_callback(_tasks.discard)

    # Run forever; systemd Restart=always handles crashes.
    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())
