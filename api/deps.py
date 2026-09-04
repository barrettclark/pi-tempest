"""Shared FastAPI dependencies."""

from collections.abc import AsyncGenerator

import aiosqlite

from config import DB_PATH


async def get_db() -> AsyncGenerator[aiosqlite.Connection, None]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        yield db
