"""GET /api/current — latest observation + derived fields."""

import time
from datetime import datetime, timezone, timedelta
from typing import Optional

import aiosqlite
from fastapi import APIRouter, Depends

import config
from api.deps import get_db
from api.schemas import CurrentResponse, RapidWind
from api import units

router = APIRouter()

# America/Chicago offset (handles CDT/CST automatically via stdlib)
try:
    from zoneinfo import ZoneInfo
    _TZ = ZoneInfo(config.TIMEZONE)
except Exception:
    _TZ = timezone(timedelta(hours=-5))  # fallback to CST


def _local_iso(epoch: int) -> str:
    dt = datetime.fromtimestamp(epoch, tz=_TZ)
    return dt.isoformat()


async def _pressure_trend(db: aiosqlite.Connection) -> str:
    """Compute pressure trend over last 3 hours."""
    three_hours_ago = int(time.time()) - 10800
    cursor = await db.execute(
        """
        SELECT epoch, station_pressure FROM observations
        WHERE epoch >= ? AND station_pressure IS NOT NULL
        ORDER BY epoch ASC
        """,
        (three_hours_ago,),
    )
    rows = await cursor.fetchall()
    if len(rows) < 2:
        return "steady"

    first_mb = rows[0]["station_pressure"]
    last_mb = rows[-1]["station_pressure"]
    delta_inhg_per_hr = units.mb_to_inhg(last_mb - first_mb) or 0
    hours_elapsed = (rows[-1]["epoch"] - rows[0]["epoch"]) / 3600
    if hours_elapsed < 0.1:
        return "steady"
    rate = delta_inhg_per_hr / hours_elapsed
    if rate > 0.02:
        return "rising"
    if rate < -0.02:
        return "falling"
    return "steady"


async def _rain_today(db: aiosqlite.Connection) -> float:
    """Sum rain_accumulated since local midnight."""
    now_local = datetime.now(tz=_TZ)
    midnight_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    midnight_epoch = int(midnight_local.timestamp())
    cursor = await db.execute(
        """
        SELECT SUM(rain_accumulated) FROM observations
        WHERE epoch >= ? AND rain_accumulated IS NOT NULL
        """,
        (midnight_epoch,),
    )
    row = await cursor.fetchone()
    total_mm = row[0] or 0.0
    return units.mm_to_in(total_mm)


async def _lightning_1h(db: aiosqlite.Connection) -> tuple[int, Optional[int], Optional[int]]:
    """Returns (count_1h, last_epoch, last_distance_km)."""
    one_hour_ago = int(time.time()) - 3600
    cursor = await db.execute(
        "SELECT COUNT(*) FROM lightning_events WHERE epoch >= ?",
        (one_hour_ago,),
    )
    row = await cursor.fetchone()
    count = row[0]

    cursor = await db.execute(
        "SELECT epoch, distance FROM lightning_events ORDER BY epoch DESC LIMIT 1"
    )
    last = await cursor.fetchone()
    if last:
        return count, last["epoch"], last["distance"]
    return count, None, None


@router.get("/current", response_model=CurrentResponse)
async def get_current(db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute(
        """
        SELECT * FROM observations ORDER BY epoch DESC LIMIT 1
        """
    )
    row = await cursor.fetchone()
    if row is None:
        return CurrentResponse(
            epoch=0,
            timestamp_local="—",
            temperature_f=None, feels_like_f=None, dew_point_f=None,
            humidity_pct=None, pressure_inhg=None, pressure_trend="steady",
            wind_avg_mph=None, wind_gust_mph=None, wind_lull_mph=None,
            wind_direction_deg=None, wind_direction_cardinal=None,
            rain_today_in=0.0, uv_index=None, solar_radiation_wm2=None,
            lightning_count_1h=0, lightning_last_epoch=None,
            lightning_last_distance_km=None, battery_v=None, rapid_wind=None,
        )

    # Rapid wind (most recent)
    rw_cursor = await db.execute(
        "SELECT epoch, wind_speed, wind_direction FROM rapid_wind ORDER BY epoch DESC LIMIT 1"
    )
    rw_row = await rw_cursor.fetchone()
    rapid_wind = None
    if rw_row:
        rapid_wind = RapidWind(
            epoch=rw_row["epoch"],
            speed_mph=units.ms_to_mph(rw_row["wind_speed"]) or 0,
            direction_deg=rw_row["wind_direction"] or 0,
        )

    trend = await _pressure_trend(db)
    rain_today = await _rain_today(db)
    lightning_count, lightning_last_epoch, lightning_last_dist = await _lightning_1h(db)

    temp_c = row["air_temperature"]
    rh = row["relative_humidity"]
    wind_ms = row["wind_avg"]

    return CurrentResponse(
        epoch=row["epoch"],
        timestamp_local=_local_iso(row["epoch"]),
        temperature_f=units.c_to_f(temp_c),
        feels_like_f=units.feels_like_f(temp_c, rh, wind_ms),
        dew_point_f=units.dew_point_f(temp_c, rh),
        humidity_pct=rh,
        pressure_inhg=units.mb_to_inhg(row["station_pressure"]),
        pressure_trend=trend,
        wind_avg_mph=units.ms_to_mph(wind_ms),
        wind_gust_mph=units.ms_to_mph(row["wind_gust"]),
        wind_lull_mph=units.ms_to_mph(row["wind_lull"]),
        wind_direction_deg=row["wind_direction"],
        wind_direction_cardinal=units.degrees_to_cardinal(row["wind_direction"]),
        rain_today_in=rain_today,
        uv_index=row["uv"],
        solar_radiation_wm2=row["solar_radiation"],
        lightning_count_1h=lightning_count,
        lightning_last_epoch=lightning_last_epoch,
        lightning_last_distance_km=lightning_last_dist,
        battery_v=row["battery"],
        rapid_wind=rapid_wind,
    )
