import asyncio
import json
import time

import pytest

import config
from collector import db
from collector.udp_listener import TempestProtocol, _tasks

_NOW = int(time.time())


def _obs_array(epoch=_NOW, **overrides):
    arr = [epoch, 0.1, 1.0, 2.0, 180, 3, 1000.0, 20.0, 50.0, 1000, 3.0, 100, 0.0, 0, 0, 0, 2.7, 1]
    for idx, val in overrides.items():
        arr[int(idx)] = val
    return arr


def _obs_packet(serial="ST-00000512", arr=None):
    packet = {"type": "obs_st", "obs": [arr if arr is not None else _obs_array()]}
    if serial is not None:
        packet["serial_number"] = serial
    return packet


@pytest.fixture
def inserted(monkeypatch):
    rows: list[dict] = []

    async def fake_insert(obs, source="udp"):
        rows.append(obs)

    monkeypatch.setattr(db, "insert_observation", fake_insert)
    return rows


async def _deliver(packet) -> None:
    proto = TempestProtocol(asyncio.get_running_loop())
    raw = packet if isinstance(packet, bytes) else json.dumps(packet).encode()
    proto.datagram_received(raw, ("192.168.1.50", 50222))
    if _tasks:
        await asyncio.gather(*list(_tasks))


@pytest.mark.parametrize(
    "packet",
    [
        pytest.param(_obs_packet(serial=None), id="missing-serial"),
        pytest.param(_obs_packet(serial="HB-00000001"), id="hub-serial"),
        pytest.param(_obs_packet(arr=_obs_array(epoch=_NOW + 86400 * 365)), id="future-epoch"),
        pytest.param(_obs_packet(arr=_obs_array(epoch=0)), id="zero-epoch"),
        pytest.param(_obs_packet(arr=_obs_array(epoch=True)), id="bool-epoch"),
        pytest.param(_obs_packet(arr=_obs_array(epoch=str(_NOW))), id="string-epoch"),
        pytest.param(_obs_packet(arr=_obs_array(**{"7": "20.0"})), id="string-temperature"),
        pytest.param(_obs_packet(arr=_obs_array()[:16]), id="short-array"),
        pytest.param(_obs_packet(arr=_obs_array(**{"4": 12.5})), id="fractional-direction"),
        pytest.param(_obs_packet(arr=_obs_array(**{"7": 1e308})), id="huge-float"),
        pytest.param({"type": "obs_st", "obs": "nope"}, id="obs-not-list"),
        pytest.param(b"[1, 2, 3]", id="non-object-json"),
    ],
)
async def test_obs_st_rejects_bad_packets(inserted, packet):
    await _deliver(packet)
    assert inserted == []


async def test_obs_st_accepts_valid_packet(inserted):
    await _deliver(_obs_packet())
    assert len(inserted) == 1
    assert inserted[0]["epoch"] == _NOW
    assert inserted[0]["report_interval"] == 1


async def test_serial_override_is_exact_match(inserted, monkeypatch):
    monkeypatch.setattr(config, "TEMPEST_SERIAL", "ST-00000512")
    await _deliver(_obs_packet(serial="ST-00000999"))
    assert inserted == []
    await _deliver(_obs_packet(serial="ST-00000512"))
    assert len(inserted) == 1


@pytest.fixture
def events(monkeypatch):
    calls: dict[str, list] = {"wind": [], "lightning": [], "rain": []}

    async def wind(epoch, speed, direction):
        calls["wind"].append((epoch, speed, direction))

    async def lightning(epoch, distance, energy):
        calls["lightning"].append((epoch, distance, energy))

    async def rain(epoch):
        calls["rain"].append(epoch)

    monkeypatch.setattr(db, "insert_rapid_wind", wind)
    monkeypatch.setattr(db, "insert_lightning", lightning)
    monkeypatch.setattr(db, "insert_rain_event", rain)
    return calls


@pytest.mark.parametrize(
    "packet",
    [
        pytest.param({"type": "rapid_wind", "ob": [_NOW, None, 180]}, id="wind-null-speed"),
        pytest.param({"type": "rapid_wind", "ob": [_NOW, 1.0, None]}, id="wind-null-direction"),
        pytest.param({"type": "evt_strike", "evt": [_NOW, None, 0]}, id="strike-null-distance"),
        pytest.param({"type": "evt_strike", "evt": [_NOW, 5, None]}, id="strike-null-energy"),
        pytest.param({"type": "rapid_wind", "ob": [_NOW, 10**400, 180]}, id="wind-huge-int"),
        pytest.param({"type": "rapid_wind", "ob": [_NOW, 1e308, 180]}, id="wind-huge-float"),
        pytest.param({"type": "rapid_wind", "ob": [_NOW, 1.0, 12.5]}, id="wind-fractional-dir"),
        pytest.param({"type": "rapid_wind", "ob": [_NOW, 1.0, 361]}, id="wind-dir-out-of-range"),
        pytest.param({"type": "evt_strike", "evt": [_NOW, 5, 2**63]}, id="strike-int64-overflow"),
        pytest.param({"type": "evt_precip"}, id="precip-missing-evt"),
        pytest.param({"type": "evt_precip", "evt": []}, id="precip-empty-evt"),
        pytest.param({"type": "evt_precip", "evt": "now"}, id="precip-string-evt"),
    ],
)
async def test_event_packets_reject_missing_or_null_fields(events, packet):
    await _deliver({**packet, "serial_number": "ST-00000512"})
    assert events == {"wind": [], "lightning": [], "rain": []}


async def test_precip_accepts_valid_event(events):
    await _deliver({"type": "evt_precip", "serial_number": "ST-00000512", "evt": [_NOW]})
    assert events["rain"] == [_NOW]


async def test_rapid_wind_accepts_valid_packet(events):
    await _deliver({"type": "rapid_wind", "serial_number": "ST-00000512", "ob": [_NOW, 1.5, 270]})
    assert events["wind"] == [(_NOW, 1.5, 270)]


async def test_strike_accepts_valid_packet(events):
    await _deliver({"type": "evt_strike", "serial_number": "ST-00000512", "evt": [_NOW, 5, 1000]})
    assert events["lightning"] == [(_NOW, 5, 1000)]
