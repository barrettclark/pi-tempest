"""GET /api/status — health check used by kiosk autostart script."""

import time

import aiosqlite
from fastapi import APIRouter, Depends

from api.deps import get_db
from api.schemas import StatusResponse

router = APIRouter()


@router.get("/status", response_model=StatusResponse)
async def get_status(db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute("SELECT COUNT(*) FROM observations")
    row = await cursor.fetchone()
    assert row is not None  # COUNT always returns a row
    row_count = row[0]

    cursor = await db.execute("SELECT epoch FROM observations ORDER BY epoch DESC LIMIT 1")
    last = await cursor.fetchone()
    last_epoch = last[0] if last else None
    age = int(time.time()) - last_epoch if last_epoch else None

    cursor = await db.execute("SELECT COUNT(*) FROM backfill_log")
    bf_row = await cursor.fetchone()
    assert bf_row is not None  # COUNT always returns a row
    backfill_complete = bf_row[0] > 0

    return StatusResponse(
        db_row_count=row_count,
        last_obs_epoch=last_epoch,
        last_obs_age_seconds=age,
        backfill_complete=backfill_complete,
    )
