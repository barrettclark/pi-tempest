"""Shared FastAPI dependencies."""

import aiosqlite

from config import DB_PATH


async def get_db() -> aiosqlite.Connection:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        yield db
