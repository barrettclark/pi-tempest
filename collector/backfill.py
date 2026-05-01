"""
Historic backfill — fetches up to BACKFILL_DAYS of data from the
WeatherFlow REST API and inserts it into the local SQLite database.

Runs once on first startup (guarded by the backfill_log table).
Fetches day-by-day to avoid triggering rate limits and to give
progress visibility in the logs.
"""

import asyncio
import logging
import time

import config
from collector import db
from collector.rest_client import get_observations

log = logging.getLogger("tempest.backfill")

# obs_st REST API array has the same positional layout as the UDP packet.
# The REST /observations/device endpoint returns obs arrays in the same format.
_FIELD_MAP = [
    "epoch",
    "wind_lull",
    "wind_avg",
    "wind_gust",
    "wind_direction",
    "wind_sample_interval",
    "station_pressure",
    "air_temperature",
    "relative_humidity",
    "illuminance",
    "uv",
    "solar_radiation",
    "rain_accumulated",
    "precipitation_type",
    "lightning_avg_distance",
    "lightning_count",
    "battery",
    "report_interval",
]


def _array_to_dict(obs_array: list) -> dict | None:
    """Convert a positional REST obs array to a named dict."""
    if not obs_array or obs_array[0] is None:
        return None
    result = {}
    for i, field in enumerate(_FIELD_MAP):
        result[field] = obs_array[i] if i < len(obs_array) else None
    return result


async def run() -> None:
    """
    Fetch BACKFILL_DAYS of history from the REST API.
    Skips the backfill if a backfill_log record already exists.
    """
    if not await db.backfill_needed():
        log.info("Backfill already complete — skipping.")
        return

    days = config.BACKFILL_DAYS
    device_id = config.DEVICE_ID
    now = int(time.time())

    log.info("Starting %d-day backfill for device %d...", days, device_id)
    total_inserted = 0

    # Fetch one day at a time to stay within rate limits.
    for day_offset in range(days, 0, -1):
        day_end = now - (day_offset - 1) * 86400
        day_start = day_end - 86400

        log.info(
            "Fetching day %d/%d (epoch %d → %d)...",
            days - day_offset + 1, days, day_start, day_end,
        )

        obs_arrays = await get_observations(
            device_id=device_id,
            time_start=day_start,
            time_end=day_end,
            bucket=1,
        )

        if not obs_arrays:
            log.warning("No observations returned for day offset %d", day_offset)
            # Small pause before next request even on empty response
            await asyncio.sleep(1)
            continue

        rows = []
        for arr in obs_arrays:
            parsed = _array_to_dict(arr)
            if parsed:
                rows.append(parsed)

        if rows:
            inserted = await db.insert_observation_batch(rows, source="rest")
            total_inserted += inserted
            log.info("  Inserted %d/%d rows (total so far: %d)", inserted, len(rows), total_inserted)

        # Brief pause between day-requests to be a good API citizen
        await asyncio.sleep(2)

    if total_inserted > 0:
        await db.record_backfill(days_fetched=days, rows_inserted=total_inserted)
        log.info("Backfill complete. %d total rows inserted.", total_inserted)
    else:
        log.warning(
            "Backfill fetched 0 rows from the REST API — historical data unavailable. "
            "Will retry on next restart. Live UDP collection is active."
        )
