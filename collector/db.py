"""
Database layer — SQLite via aiosqlite.

All inserts use INSERT OR IGNORE on the unique epoch index so both
the UDP listener and the REST backfill are naturally idempotent.
"""

import time

import aiosqlite

from config import DB_PATH

_CREATE_OBSERVATIONS = """
CREATE TABLE IF NOT EXISTS observations (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    epoch                 INTEGER NOT NULL,
    source                TEXT    NOT NULL,
    wind_lull             REAL,
    wind_avg              REAL,
    wind_gust             REAL,
    wind_direction        INTEGER,
    wind_sample_interval  INTEGER,
    station_pressure      REAL,
    air_temperature       REAL,
    relative_humidity     REAL,
    illuminance           INTEGER,
    uv                    REAL,
    solar_radiation       REAL,
    rain_accumulated      REAL,
    precipitation_type    INTEGER,
    lightning_avg_distance INTEGER,
    lightning_count       INTEGER,
    battery               REAL,
    report_interval       INTEGER,
    inserted_at           INTEGER NOT NULL
);
"""

_CREATE_OBSERVATIONS_IDX1 = """
CREATE UNIQUE INDEX IF NOT EXISTS idx_observations_epoch
    ON observations(epoch);
"""

_CREATE_OBSERVATIONS_IDX2 = """
CREATE INDEX IF NOT EXISTS idx_observations_epoch_range
    ON observations(epoch DESC);
"""

_CREATE_RAPID_WIND = """
CREATE TABLE IF NOT EXISTS rapid_wind (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    epoch          INTEGER NOT NULL,
    wind_speed     REAL,
    wind_direction INTEGER,
    inserted_at    INTEGER NOT NULL
);
"""

_CREATE_RAPID_WIND_IDX = """
CREATE INDEX IF NOT EXISTS idx_rapid_wind_epoch
    ON rapid_wind(epoch DESC);
"""

_CREATE_LIGHTNING = """
CREATE TABLE IF NOT EXISTS lightning_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    epoch       INTEGER NOT NULL,
    distance    INTEGER,
    energy      INTEGER,
    inserted_at INTEGER NOT NULL
);
"""

_CREATE_LIGHTNING_IDX1 = """
CREATE UNIQUE INDEX IF NOT EXISTS idx_lightning_epoch
    ON lightning_events(epoch);
"""

_CREATE_LIGHTNING_IDX2 = """
CREATE INDEX IF NOT EXISTS idx_lightning_epoch_range
    ON lightning_events(epoch DESC);
"""

_CREATE_RAIN_EVENTS = """
CREATE TABLE IF NOT EXISTS rain_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    epoch       INTEGER NOT NULL,
    inserted_at INTEGER NOT NULL
);
"""

_CREATE_BACKFILL_LOG = """
CREATE TABLE IF NOT EXISTS backfill_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    completed_at INTEGER NOT NULL,
    days_fetched INTEGER NOT NULL,
    rows_inserted INTEGER NOT NULL
);
"""


async def init_schema() -> None:
    """Create all tables and indexes. Safe to call multiple times."""
    import os

    os.makedirs(os.path.dirname(DB_PATH) if os.path.dirname(DB_PATH) else ".", exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("PRAGMA journal_mode=WAL;")
        await db.execute("PRAGMA synchronous=NORMAL;")
        for stmt in (
            _CREATE_OBSERVATIONS,
            _CREATE_OBSERVATIONS_IDX1,
            _CREATE_OBSERVATIONS_IDX2,
            _CREATE_RAPID_WIND,
            _CREATE_RAPID_WIND_IDX,
            _CREATE_LIGHTNING,
            _CREATE_LIGHTNING_IDX1,
            _CREATE_LIGHTNING_IDX2,
            _CREATE_RAIN_EVENTS,
            _CREATE_BACKFILL_LOG,
        ):
            await db.execute(stmt)
        await db.commit()


async def insert_observation(obs: dict, source: str = "udp") -> None:
    now = int(time.time())
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT OR IGNORE INTO observations
                (epoch, source, wind_lull, wind_avg, wind_gust, wind_direction,
                 wind_sample_interval, station_pressure, air_temperature,
                 relative_humidity, illuminance, uv, solar_radiation,
                 rain_accumulated, precipitation_type, lightning_avg_distance,
                 lightning_count, battery, report_interval, inserted_at)
            VALUES
                (:epoch, :source, :wind_lull, :wind_avg, :wind_gust, :wind_direction,
                 :wind_sample_interval, :station_pressure, :air_temperature,
                 :relative_humidity, :illuminance, :uv, :solar_radiation,
                 :rain_accumulated, :precipitation_type, :lightning_avg_distance,
                 :lightning_count, :battery, :report_interval, :inserted_at)
            """,
            {**obs, "source": source, "inserted_at": now},
        )
        await db.commit()


async def insert_observation_batch(rows: list[dict], source: str = "rest") -> int:
    """Insert a batch of observation dicts. Returns count of rows inserted."""
    now = int(time.time())
    inserted = 0
    async with aiosqlite.connect(DB_PATH) as db:
        for obs in rows:
            cursor = await db.execute(
                """
                INSERT OR IGNORE INTO observations
                    (epoch, source, wind_lull, wind_avg, wind_gust, wind_direction,
                     wind_sample_interval, station_pressure, air_temperature,
                     relative_humidity, illuminance, uv, solar_radiation,
                     rain_accumulated, precipitation_type, lightning_avg_distance,
                     lightning_count, battery, report_interval, inserted_at)
                VALUES
                    (:epoch, :source, :wind_lull, :wind_avg, :wind_gust, :wind_direction,
                     :wind_sample_interval, :station_pressure, :air_temperature,
                     :relative_humidity, :illuminance, :uv, :solar_radiation,
                     :rain_accumulated, :precipitation_type, :lightning_avg_distance,
                     :lightning_count, :battery, :report_interval, :inserted_at)
                """,
                {**obs, "source": source, "inserted_at": now},
            )
            inserted += cursor.rowcount
        await db.commit()
    return inserted


async def insert_rapid_wind(epoch: int, speed: float, direction: int) -> None:
    now = int(time.time())
    cutoff = now - 86400  # keep only last 24h
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO rapid_wind (epoch, wind_speed, wind_direction, inserted_at) VALUES (?, ?, ?, ?)",
            (epoch, speed, direction, now),
        )
        await db.execute("DELETE FROM rapid_wind WHERE epoch < ?", (cutoff,))
        await db.commit()


async def insert_lightning(epoch: int, distance: int, energy: int) -> None:
    now = int(time.time())
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR IGNORE INTO lightning_events (epoch, distance, energy, inserted_at) VALUES (?, ?, ?, ?)",
            (epoch, distance, energy, now),
        )
        await db.commit()


async def insert_rain_event(epoch: int) -> None:
    now = int(time.time())
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO rain_events (epoch, inserted_at) VALUES (?, ?)",
            (epoch, now),
        )
        await db.commit()


async def backfill_needed() -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT COUNT(*) FROM backfill_log")
        row = await cursor.fetchone()
        return row[0] == 0


async def record_backfill(days_fetched: int, rows_inserted: int) -> None:
    now = int(time.time())
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO backfill_log (completed_at, days_fetched, rows_inserted) VALUES (?, ?, ?)",
            (now, days_fetched, rows_inserted),
        )
        await db.commit()


async def get_last_observation_epoch() -> int | None:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT epoch FROM observations ORDER BY epoch DESC LIMIT 1")
        row = await cursor.fetchone()
        return row[0] if row else None


async def get_row_count() -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT COUNT(*) FROM observations")
        row = await cursor.fetchone()
        return row[0]
