import time

import httpx
import pytest

import config
from api.routers import aqi, forecast

_REAL_ASYNC_CLIENT = httpx.AsyncClient


@pytest.fixture
def mock_upstream(monkeypatch):
    def install(handler):
        transport = httpx.MockTransport(handler)
        monkeypatch.setattr(
            httpx, "AsyncClient", lambda **kw: _REAL_ASYNC_CLIENT(transport=transport, **kw)
        )

    return install


@pytest.fixture
def fresh_caches(monkeypatch):
    monkeypatch.setattr(forecast, "_cache", {"data": None, "fetched_at": 0})
    monkeypatch.setattr(aqi, "_cache", {"data": None, "fetched_at": 0})


_FORECAST_OK = {
    "forecast": {
        "hourly": [{"time": int(time.time()) + 3600, "air_temperature": 20.0}],
        "daily": [{"day_start_local": 1, "air_temp_high": 25.0, "air_temp_low": 10.0}],
    }
}


async def test_forecast_failure_is_not_cached(mock_upstream, fresh_caches):
    mock_upstream(lambda req: httpx.Response(500))
    body = await forecast.get_forecast()
    assert body["hourly"] == [] and body["daily"] == []
    assert forecast._cache["data"] is None
    assert forecast._cache["fetched_at"] == 0


async def test_forecast_keeps_last_good_data_on_failure(mock_upstream, fresh_caches, caplog):
    mock_upstream(lambda req: httpx.Response(200, json=_FORECAST_OK))
    good = await forecast.get_forecast()
    assert len(good["hourly"]) == 1

    # Expire the cache, then fail upstream.
    forecast._cache["fetched_at"] -= forecast._CACHE_TTL + 1
    expired_at = forecast._cache["fetched_at"]
    mock_upstream(lambda req: httpx.Response(500))
    stale = await forecast.get_forecast()
    assert stale["hourly"] == good["hourly"]
    assert stale["daily"] == good["daily"]
    assert stale["fetched_at"] == int(expired_at)
    assert config.TOKEN not in caplog.text


_AQI_OK = [{"parameterName": "PM2.5", "nowcastAQI": 42, "aqiCategoryName": "Good"}]


async def test_aqi_failure_is_not_cached(mock_upstream, fresh_caches):
    mock_upstream(lambda req: httpx.Response(503))
    body = await aqi.get_aqi()
    assert body.aqi is None
    assert body.fetched_at == 0
    assert aqi._cache["data"] is None


async def test_aqi_keeps_last_good_data_and_redacts_key(
    mock_upstream, fresh_caches, monkeypatch, caplog
):
    monkeypatch.setattr(config, "AIRNOW_API_KEY", "secret-airnow-key")
    mock_upstream(lambda req: httpx.Response(200, json=_AQI_OK))
    good = await aqi.get_aqi()
    assert good.aqi == 42

    aqi._cache["fetched_at"] -= aqi._CACHE_TTL + 1
    expired_at = aqi._cache["fetched_at"]
    mock_upstream(lambda req: httpx.Response(500))
    stale = await aqi.get_aqi()
    assert stale.aqi == 42
    assert stale.fetched_at == expired_at
    assert "secret-airnow-key" not in caplog.text


async def test_aqi_requests_ziplatlong_endpoint(mock_upstream, fresh_caches):
    seen: list[httpx.Request] = []

    def handler(req):
        seen.append(req)
        return httpx.Response(200, json=_AQI_OK)

    mock_upstream(handler)
    await aqi.get_aqi()
    assert seen[0].url.path == "/aq/observation/current/ziplatlong/"
    assert seen[0].url.params["zipCode"] == "75019"
