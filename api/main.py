"""
FastAPI application factory.

Routes:
  GET  /api/current          — latest observation + derived fields
  GET  /api/history/temperature
  GET  /api/history/rain
  GET  /api/history/pressure
  GET  /api/history/wind
  GET  /api/history/solar
  GET  /api/history/lightning
  GET  /api/forecast         — hourly 24h + daily 7d from WeatherFlow
  GET  /api/aqi              — AirNow.gov AQI for Coppell TX
  GET  /api/moon             — moon phase, rise/set, upcoming phases
  GET  /api/status           — health check
  POST /api/exit             — kill the kiosk browser (Chromium)
  GET  /                     — serves static/index.html
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from api.routers import aqi, current, forecast, history, moon, status

log = logging.getLogger("tempest.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    from collector.db import init_schema

    await init_schema()
    log.info("Database schema ready.")
    yield


app = FastAPI(title="Tempest Weather Dashboard", lifespan=lifespan)

app.include_router(current.router, prefix="/api")
app.include_router(history.router, prefix="/api/history")
app.include_router(forecast.router, prefix="/api")
app.include_router(aqi.router, prefix="/api")
app.include_router(moon.router, prefix="/api")
app.include_router(status.router, prefix="/api")


_LOOPBACK = {"127.0.0.1", "::1"}
_background: set[asyncio.Task] = set()


@app.post("/api/exit")
async def exit_kiosk(request: Request):
    """Kill the Chromium kiosk browser so the desktop becomes accessible. Loopback only."""
    if request.client is None or request.client.host not in _LOOPBACK:
        raise HTTPException(status_code=403)
    task = asyncio.create_task(_kill_browser())
    _background.add(task)
    task.add_done_callback(_background.discard)
    return JSONResponse({"ok": True})


async def _kill_browser():
    await asyncio.sleep(0.5)  # let the HTTP response flush before the browser dies
    proc = await asyncio.create_subprocess_exec("pkill", "-f", "/usr/lib/chromium/chromium")
    await proc.wait()


_static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
if os.path.isdir(_static_dir):
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")
