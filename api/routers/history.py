"""
GET /api/history/* — time-series data for chart panels.

All responses return epoch timestamps as labels (JS converts to local time).
Down-sampling uses GROUP BY bucket to cap point counts.
"""

import time
from typing import Optional

import aiosqlite
from fastapi import APIRouter, Depends, Query

from api.deps import get_db
from api import units

router = APIRouter()


def _round_none(v, digits=1) -> Optional[float]:
    return round(v, digits) if v is not None else None


@router.get("/temperature")
async def get_temperature_history(
    hours: int = Query(default=24, ge=1, le=168),
    db: aiosqlite.Connection = Depends(get_db),
):
    since = int(time.time()) - hours * 3600
    # 5-minute buckets → max 2016 points for 7d
    bucket_size = 300
    cursor = await db.execute(
        """
        SELECT
            (epoch / :b) * :b AS bucket,
            AVG(air_temperature)  AS temp_c,
            AVG(relative_humidity) AS rh
        FROM observations
        WHERE epoch >= :since
          AND air_temperature IS NOT NULL
        GROUP BY bucket
        ORDER BY bucket ASC
        """,
        {"b": bucket_size, "since": since},
    )
    rows = await cursor.fetchall()

    labels, temp_f, dew_f = [], [], []
    for row in rows:
        labels.append(row[0])
        t = row[1]
        rh = row[2]
        temp_f.append(_round_none(units.c_to_f(t)))
        dew_f.append(_round_none(units.dew_point_f(t, rh)))

    return {"labels": labels, "temperature_f": temp_f, "dew_point_f": dew_f}


@router.get("/rain")
async def get_rain_history(db: aiosqlite.Connection = Depends(get_db)):
    from datetime import datetime
    from zoneinfo import ZoneInfo
    import config as _config

    now = int(time.time())
    since_hourly = now - 86400       # last 24h for hourly
    since_daily  = now - 30 * 86400  # last 30 days for daily

    local_tz  = ZoneInfo(_config.TIMEZONE)
    now_local = datetime.now(tz=local_tz)
    month_start = int(now_local.replace(day=1, hour=0, minute=0, second=0, microsecond=0).timestamp())
    year_start  = int(now_local.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0).timestamp())

    # Hourly buckets
    cursor = await db.execute(
        """
        SELECT
            (epoch / 3600) * 3600 AS bucket,
            SUM(rain_accumulated) AS total_mm
        FROM observations
        WHERE epoch >= :since AND rain_accumulated IS NOT NULL
        GROUP BY bucket
        ORDER BY bucket ASC
        """,
        {"since": since_hourly},
    )
    hourly_rows = await cursor.fetchall()

    # Daily buckets
    cursor = await db.execute(
        """
        SELECT
            (epoch / 86400) * 86400 AS bucket,
            SUM(rain_accumulated) AS total_mm
        FROM observations
        WHERE epoch >= :since AND rain_accumulated IS NOT NULL
        GROUP BY bucket
        ORDER BY bucket ASC
        """,
        {"since": since_daily},
    )
    daily_rows = await cursor.fetchall()

    # Monthly total
    cursor = await db.execute(
        "SELECT SUM(rain_accumulated) FROM observations WHERE epoch >= :since AND rain_accumulated IS NOT NULL",
        {"since": month_start},
    )
    row = await cursor.fetchone()
    rain_month_in = round(units.mm_to_in(row[0] or 0), 2)

    # Yearly total
    cursor = await db.execute(
        "SELECT SUM(rain_accumulated) FROM observations WHERE epoch >= :since AND rain_accumulated IS NOT NULL",
        {"since": year_start},
    )
    row = await cursor.fetchone()
    rain_year_in = round(units.mm_to_in(row[0] or 0), 2)

    return {
        "hourly_labels":  [r[0] for r in hourly_rows],
        "hourly_rain_in": [round(units.mm_to_in(r[1]), 3) for r in hourly_rows],
        "daily_labels":   [r[0] for r in daily_rows],
        "daily_rain_in":  [round(units.mm_to_in(r[1]), 3) for r in daily_rows],
        "rain_month_in":  rain_month_in,
        "rain_year_in":   rain_year_in,
    }


@router.get("/pressure")
async def get_pressure_history(
    hours: int = Query(default=6, ge=1, le=48),
    db: aiosqlite.Connection = Depends(get_db),
):
    since = int(time.time()) - hours * 3600
    bucket_size = 900  # 15-minute buckets
    cursor = await db.execute(
        """
        SELECT
            (epoch / :b) * :b AS bucket,
            AVG(station_pressure) AS avg_mb
        FROM observations
        WHERE epoch >= :since AND station_pressure IS NOT NULL
        GROUP BY bucket
        ORDER BY bucket ASC
        """,
        {"b": bucket_size, "since": since},
    )
    rows = await cursor.fetchall()
    return {
        "labels":        [r[0] for r in rows],
        "pressure_inhg": [_round_none(units.mb_to_inhg(r[1]), 3) for r in rows],
    }


@router.get("/wind")
async def get_wind_history(
    hours: int = Query(default=24, ge=1, le=168),
    db: aiosqlite.Connection = Depends(get_db),
):
    since = int(time.time()) - hours * 3600
    bucket_size = 900  # 15-minute buckets
    cursor = await db.execute(
        """
        SELECT
            (epoch / :b) * :b AS bucket,
            AVG(wind_avg)  AS avg_ms,
            MAX(wind_gust) AS max_gust_ms,
            MIN(wind_lull) AS min_lull_ms
        FROM observations
        WHERE epoch >= :since
        GROUP BY bucket
        ORDER BY bucket ASC
        """,
        {"b": bucket_size, "since": since},
    )
    rows = await cursor.fetchall()
    return {
        "labels":         [r[0] for r in rows],
        "wind_avg_mph":   [_round_none(units.ms_to_mph(r[1])) for r in rows],
        "wind_gust_mph":  [_round_none(units.ms_to_mph(r[2])) for r in rows],
        "wind_lull_mph":  [_round_none(units.ms_to_mph(r[3])) for r in rows],
    }


@router.get("/solar")
async def get_solar_history(db: aiosqlite.Connection = Depends(get_db)):
    """Today's solar radiation and UV, from midnight local time."""
    from datetime import datetime
    from zoneinfo import ZoneInfo
    import config
    now_local = datetime.now(tz=ZoneInfo(config.TIMEZONE))
    midnight = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    since = int(midnight.timestamp())

    bucket_size = 300  # 5-minute buckets
    cursor = await db.execute(
        """
        SELECT
            (epoch / :b) * :b AS bucket,
            AVG(solar_radiation) AS avg_solar,
            AVG(uv)              AS avg_uv
        FROM observations
        WHERE epoch >= :since
        GROUP BY bucket
        ORDER BY bucket ASC
        """,
        {"b": bucket_size, "since": since},
    )
    rows = await cursor.fetchall()
    return {
        "labels":               [r[0] for r in rows],
        "solar_radiation_wm2":  [_round_none(r[1]) for r in rows],
        "uv_index":             [_round_none(r[2]) for r in rows],
    }


@router.get("/lightning")
async def get_lightning_history(
    hours: int = Query(default=24, ge=1, le=8760),
    db: aiosqlite.Connection = Depends(get_db),
):
    since = int(time.time()) - hours * 3600
    cursor = await db.execute(
        """
        SELECT
            (epoch / 3600) * 3600 AS bucket,
            COUNT(*)               AS strike_count,
            AVG(distance)          AS avg_dist_km
        FROM lightning_events
        WHERE epoch >= :since
        GROUP BY bucket
        ORDER BY bucket ASC
        """,
        {"since": since},
    )
    rows = await cursor.fetchall()
    return {
        "labels":          [r[0] for r in rows],
        "strike_count":    [r[1] for r in rows],
        "avg_distance_km": [_round_none(r[2]) for r in rows],
    }
