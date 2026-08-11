"""
Thin async httpx wrapper for the WeatherFlow REST API.

Handles rate-limit responses (HTTP 429) with exponential backoff.
"""

import asyncio
import logging
import time

import httpx

import config

log = logging.getLogger("tempest.rest")

_BASE = config.WEATHERFLOW_API_BASE
_TOKEN = config.TOKEN


async def get_observations(
    device_id: int,
    time_start: int,
    time_end: int,
    bucket: int = 1,
) -> list[list]:
    """
    Fetch observations for a device over a time range.

    Returns the raw list-of-lists from the 'obs' key, or [] on error.
    bucket=1 means 1-minute resolution (the finest available).
    """
    url = f"{_BASE}/observations/device/{device_id}"
    params = {
        "token": _TOKEN,
        "time_start": time_start,
        "time_end": time_end,
    }
    # WeatherFlow's API returns obs: null when an explicit bucket=1 is sent,
    # even though 1-minute buckets are the default when the param is omitted.
    if bucket != 1:
        params["bucket"] = bucket

    for attempt in range(5):
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(url, params=params)

            if resp.status_code == 429:
                wait = 60 * (2 ** attempt)
                log.warning("Rate limited (429). Waiting %ds before retry %d...", wait, attempt + 1)
                await asyncio.sleep(wait)
                continue

            resp.raise_for_status()
            data = resp.json()
            return data.get("obs") or []

        except httpx.HTTPStatusError as exc:
            log.error("HTTP error fetching observations: %s", exc)
            return []
        except httpx.RequestError as exc:
            wait = 5 * (2 ** attempt)
            log.warning("Request error (%s). Retrying in %ds...", exc, wait)
            await asyncio.sleep(wait)

    log.error("Giving up on observations fetch after 5 attempts.")
    return []


async def get_station_info(station_id: int) -> dict:
    """Fetch station metadata (timezone, devices, etc.)."""
    url = f"{_BASE}/stations/{station_id}"
    params = {"token": _TOKEN}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()
        stations = data.get("stations", [])
        return stations[0] if stations else {}
    except Exception as exc:
        log.error("Failed to fetch station info: %s", exc)
        return {}
