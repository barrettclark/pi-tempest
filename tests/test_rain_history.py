from datetime import datetime
from zoneinfo import ZoneInfo

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


def _obs(epoch: int, rain_mm: float) -> dict:
    return {"epoch": epoch, **{k: None for k in _OBS_KEYS}, "rain_accumulated": rain_mm}


@pytest.fixture
async def seeded_db(tmp_path, monkeypatch):
    path = str(tmp_path / "rain.db")
    monkeypatch.setattr(config, "DB_PATH", path)
    monkeypatch.setattr(db, "DB_PATH", path)
    await db.init_schema()

    tz = ZoneInfo(config.TIMEZONE)
    month_start = int(
        datetime.now(tz).replace(day=1, hour=0, minute=0, second=0, microsecond=0).timestamp()
    )
    await db.insert_observation_batch(
        [
            _obs(month_start + 3600, 2.54),  # this month: 0.10"
            _obs(month_start - 3600, 25.4),  # last month: must not count
        ]
    )
    return path


async def test_month_to_date_counts_only_this_month_on_fallback(seeded_db, monkeypatch):
    async def wf_down():
        raise RuntimeError("upstream down")

    monkeypatch.setattr(history, "_fetch_wf_stats", wf_down)
    async with aiosqlite.connect(seeded_db) as conn:
        body = await history.get_rain_history(db=conn)
    assert body["rain_month_in"] == 0.10
    # In January the "last month" row falls in the previous year and is excluded.
    last_month_in_year = datetime.now(ZoneInfo(config.TIMEZONE)).month != 1
    expected_year = 0.10 + (1.0 if last_month_in_year else 0.0)
    assert body["rain_year_in"] == pytest.approx(expected_year, abs=0.01)


async def test_month_to_date_uses_weatherflow_stats_when_available(seeded_db, monkeypatch):
    today = datetime.now(ZoneInfo(config.TIMEZONE))
    this_month = today.strftime("%Y-%m-01")
    last_month = "2000-01-15"

    def day_row(date_str: str, rain_mm: float) -> list:
        row: list = [date_str] + [None] * 28
        row[28] = rain_mm
        return row

    async def wf_ok():
        return {
            "stats_day": [day_row(this_month, 5.08), day_row(last_month, 99.0)],
        }

    monkeypatch.setattr(history, "_fetch_wf_stats", wf_ok)
    async with aiosqlite.connect(seeded_db) as conn:
        body = await history.get_rain_history(db=conn)
    assert body["rain_month_in"] == 0.20
