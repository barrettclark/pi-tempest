import pytest
from api.routers.aqi import _parse_airnow_response


def test_parse_picks_highest_aqi():
    data = [
        {"ParameterName": "PM2.5", "AQI": 42, "Category": {"Name": "Good"}},
        {"ParameterName": "OZONE", "AQI": 35, "Category": {"Name": "Good"}},
    ]
    result = _parse_airnow_response(data)
    assert result["aqi"] == 42
    assert result["category"] == "Good"
    assert result["pm25_aqi"] == 42
    assert result["ozone_aqi"] == 35


def test_parse_empty_returns_nones():
    result = _parse_airnow_response([])
    assert result["aqi"] is None
    assert result["category"] is None


def test_parse_missing_pollutant_is_none():
    data = [{"ParameterName": "PM2.5", "AQI": 10, "Category": {"Name": "Good"}}]
    result = _parse_airnow_response(data)
    assert result["ozone_aqi"] is None
    assert result["pm25_aqi"] == 10
