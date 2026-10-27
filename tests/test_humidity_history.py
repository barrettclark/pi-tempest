import time

import aiosqlite
import pytest

import config
from api.routers import history
from collector import db

_OBS_KEYS = [
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


def _obs(epoch: int, rh: float | None) -> dict:
    return {"epoch": epoch, **{k: None for k in _OBS_KEYS}, "relative_humidity": rh}


@pytest.fixture
async def seeded_db(tmp_path, monkeypatch):
    path = str(tmp_path / "humidity.db")
    monkeypatch.setattr(config, "DB_PATH", path)
    monkeypatch.setattr(db, "DB_PATH", path)
    await db.init_schema()

    now = int(time.time())
    # Freeze the clock for the rest of the test: get_humidity_history() computes
    # its own "since" from time.time(), and without this, seeding and the
    # assertion below could land in different 15-min buckets if the test runs
    # across a boundary.
    monkeypatch.setattr(time, "time", lambda: float(now))
    bucket = (now // 900) * 900
    await db.insert_observation_batch(
        [
            _obs(bucket, 40.0),
            _obs(bucket + 60, 60.0),  # same 15-min bucket: averages with the row above
            _obs(bucket - 3600, 90.0),  # within the 24h window, different bucket
            _obs(now - 25 * 3600, 10.0),  # outside the 24h window: must not appear
            _obs(bucket - 7200, None),  # null RH: excluded by the WHERE clause
        ]
    )
    return path, now


async def test_humidity_history_buckets_and_windows(seeded_db):
    path, now = seeded_db
    async with aiosqlite.connect(path) as conn:
        body = await history.get_humidity_history(hours=24, db=conn)
    pairs = dict(zip(body["labels"], body["humidity_pct"], strict=True))
    bucket = (now // 900) * 900
    assert pairs[bucket] == 50.0  # (40 + 60) / 2, same bucket averaged
    assert pairs[bucket - 3600] == 90.0
    assert len(body["labels"]) == 2  # the 25h-old row and the null-RH row are excluded
