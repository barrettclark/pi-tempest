import aiosqlite
import pytest

from collector import db

_OBS_FIELDS = (
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
)


def _obs(epoch: int, **overrides):
    """A fully-bound observation dict; insert_observation needs every column."""
    row = {"epoch": epoch, **{f: None for f in _OBS_FIELDS}}
    row.update(overrides)
    return row


@pytest.fixture
def _db_path(tmp_path, monkeypatch):
    path = tmp_path / "test.db"
    monkeypatch.setattr(db, "DB_PATH", str(path))
    return str(path)


async def test_init_schema_creates_tables(_db_path):
    await db.init_schema()
    async with aiosqlite.connect(_db_path) as conn:
        cursor = await conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        tables = {row[0] for row in await cursor.fetchall()}
    assert {
        "observations",
        "rapid_wind",
        "lightning_events",
        "rain_events",
        "backfill_log",
    } <= tables


async def test_init_schema_is_idempotent(_db_path):
    await db.init_schema()
    await db.init_schema()  # must not raise


async def test_insert_observation_roundtrips(_db_path):
    await db.init_schema()
    await db.insert_observation(_obs(1_700_000_000, air_temperature=21.5, relative_humidity=55))
    assert await db.get_row_count() == 1
    assert await db.get_last_observation_epoch() == 1_700_000_000


async def test_insert_observation_dedupes_on_epoch(_db_path):
    await db.init_schema()
    await db.insert_observation(_obs(1_700_000_000, air_temperature=21.5))
    await db.insert_observation(_obs(1_700_000_000, air_temperature=99.9))
    assert await db.get_row_count() == 1


async def test_insert_observation_batch_returns_insert_count(_db_path):
    await db.init_schema()
    rows = [_obs(1_700_000_000), _obs(1_700_000_060), _obs(1_700_000_000)]
    inserted = await db.insert_observation_batch(rows)
    assert inserted == 2
    assert await db.get_row_count() == 2


async def test_backfill_log_tracks_completion(_db_path):
    await db.init_schema()
    assert await db.backfill_needed() is True
    await db.record_backfill(days_fetched=30, rows_inserted=1234)
    assert await db.backfill_needed() is False
