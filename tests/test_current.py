import pytest
from api.routers.current import _compute_rain_rate_in_hr
from api import units


def test_rain_rate_half_mm_per_minute():
    # 0.5mm in a 1-minute interval → 30mm/hr → ~1.181 in/hr
    result = _compute_rain_rate_in_hr(rain_mm=0.5, report_interval_min=1)
    assert result == pytest.approx(units.mm_to_in(30.0), rel=0.01)


def test_rain_rate_zero_returns_none():
    assert _compute_rain_rate_in_hr(rain_mm=0.0, report_interval_min=1) is None


def test_rain_rate_none_rain_returns_none():
    assert _compute_rain_rate_in_hr(rain_mm=None, report_interval_min=1) is None


def test_rain_rate_two_minute_interval():
    # 1mm in a 2-minute interval → 30mm/hr
    result = _compute_rain_rate_in_hr(rain_mm=1.0, report_interval_min=2)
    assert result == pytest.approx(units.mm_to_in(30.0), rel=0.01)
