from api.routers.aqi import _parse_airnow_response


def test_parse_picks_highest_aqi():
    data = [
        {"parameterName": "PM2.5", "nowcastAQI": 42, "aqiCategoryName": "Good"},
        {"parameterName": "OZONE", "nowcastAQI": 35, "aqiCategoryName": "Good"},
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
    data = [{"parameterName": "PM2.5", "nowcastAQI": 10, "aqiCategoryName": "Good"}]
    result = _parse_airnow_response(data)
    assert result["ozone_aqi"] is None
    assert result["pm25_aqi"] == 10


def test_parse_null_aqi_does_not_crash():
    data = [
        {"parameterName": "PM2.5", "nowcastAQI": None, "aqiCategoryName": None},
        {"parameterName": "OZONE", "nowcastAQI": 20, "aqiCategoryName": "Good"},
    ]
    result = _parse_airnow_response(data)
    assert result["aqi"] == 20
    assert result["pm25_aqi"] is None
