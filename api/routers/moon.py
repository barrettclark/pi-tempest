"""GET /api/moon — moon phase, rise/set, and upcoming phases via ephem."""

import time
import logging
from datetime import timezone
from zoneinfo import ZoneInfo

import ephem
from fastapi import APIRouter

import config
from api.schemas import MoonResponse

log = logging.getLogger("tempest.moon")
router = APIRouter()

# Cache until midnight local time — phase doesn't change intra-day
_cache: dict = {"data": None, "cache_date": None}


def _phase_from_age(age_days: float) -> tuple[str, str]:
    if age_days < 1.84:  return "New Moon",        "🌑"
    if age_days < 7.38:  return "Waxing Crescent",  "🌒"
    if age_days < 9.22:  return "First Quarter",    "🌓"
    if age_days < 14.76: return "Waxing Gibbous",   "🌔"
    if age_days < 16.61: return "Full Moon",        "🌕"
    if age_days < 22.15: return "Waning Gibbous",   "🌖"
    if age_days < 23.99: return "Last Quarter",     "🌗"
    return "Waning Crescent", "🌘"


def _ephem_to_local(ephem_date, tz: ZoneInfo) -> str:
    dt = ephem.Date(ephem_date).datetime().replace(tzinfo=timezone.utc).astimezone(tz)
    return dt.strftime("%-I:%M %p")


def compute_moon() -> dict:
    tz = ZoneInfo(config.TIMEZONE)
    now = ephem.now()

    obs = ephem.Observer()
    obs.lat = config.LAT
    obs.lon = config.LON
    obs.date = now
    obs.pressure = 0
    obs.horizon = "-0:34"

    moon = ephem.Moon()
    moon.compute(obs)

    age_days = float(now - ephem.previous_new_moon(now))
    phase_name, emoji = _phase_from_age(age_days)

    try:
        moonrise = _ephem_to_local(obs.next_rising(moon), tz)
    except (ephem.NeverUpError, ephem.AlwaysUpError):
        moonrise = None

    try:
        moonset = _ephem_to_local(obs.next_setting(moon), tz)
    except (ephem.NeverUpError, ephem.AlwaysUpError):
        moonset = None

    tz_obj = ZoneInfo(config.TIMEZONE)
    next_full = ephem.next_full_moon(now)
    next_new = ephem.next_new_moon(now)

    full_dt = ephem.Date(next_full).datetime().replace(tzinfo=timezone.utc).astimezone(tz_obj)
    new_dt = ephem.Date(next_new).datetime().replace(tzinfo=timezone.utc).astimezone(tz_obj)

    return {
        "phase_name": phase_name,
        "emoji": emoji,
        "illumination_pct": round(moon.phase, 1),
        "moonrise": moonrise,
        "moonset": moonset,
        "next_full_moon": full_dt.strftime("%b %-d"),
        "next_new_moon": new_dt.strftime("%b %-d"),
    }


@router.get("/moon", response_model=MoonResponse)
async def get_moon():
    tz = ZoneInfo(config.TIMEZONE)
    today = time.strftime("%Y-%m-%d", time.localtime())
    if _cache["data"] is None or _cache["cache_date"] != today:
        log.info("Computing moon data...")
        _cache["data"] = compute_moon()
        _cache["cache_date"] = today
    return MoonResponse(computed_at=int(time.time()), **_cache["data"])
