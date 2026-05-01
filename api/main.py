"""
FastAPI application factory.

Routes:
  GET /api/current          — latest observation + derived fields
  GET /api/history/temperature
  GET /api/history/rain
  GET /api/history/pressure
  GET /api/history/wind
  GET /api/history/solar
  GET /api/history/lightning
  GET /api/status           — health check
  GET /                     — serves static/index.html
"""

from contextlib import asynccontextmanager
import logging
import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from api.routers import current, history, status, forecast

log = logging.getLogger("tempest.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure DB schema is ready (idempotent) when the API starts
    from collector.db import init_schema
    await init_schema()
    log.info("Database schema ready.")
    yield


app = FastAPI(title="Tempest Weather Dashboard", lifespan=lifespan)

app.include_router(current.router, prefix="/api")
app.include_router(history.router, prefix="/api/history")
app.include_router(forecast.router, prefix="/api")
app.include_router(status.router, prefix="/api")

# Static files last so API routes take precedence
_static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
if os.path.isdir(_static_dir):
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")
