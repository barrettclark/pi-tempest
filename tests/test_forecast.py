import pytest

from api.routers.forecast import _convert_daily


def test_convert_daily_temps():
    day = {
        "air_temp_high": 25.0,
        "air_temp_low": 10.0,
        "day_start_local": 1000000,
        "conditions": "Clear",
        "icon": "clear-day",
        "precip_probability": 10,
        "precip": 2.0,
        "wind_avg": 5.0,
        "wind_direction": 90,
        "wind_direction_cardinal": "E",
    }
    result = _convert_daily(day)
    assert result["high_f"] == pytest.approx(77.0, abs=0.1)
    assert result["low_f"] == pytest.approx(50.0, abs=0.1)
    assert result["precip_prob_pct"] == 10
    assert result["wind_avg_mph"] == pytest.approx(11.2, abs=0.1)
    assert result["icon"] == "clear-day"


def test_convert_daily_null_temps():
    day = {
        "air_temp_high": None,
        "air_temp_low": None,
        "day_start_local": 1000000,
        "conditions": None,
        "icon": None,
        "precip_probability": 0,
        "precip": None,
        "wind_avg": None,
        "wind_direction": None,
        "wind_direction_cardinal": None,
    }
    result = _convert_daily(day)
    assert result["high_f"] is None
    assert result["low_f"] is None
    assert result["precip_in"] == 0.0
