import pytest
from api.routers.moon import _phase_from_age, compute_moon


@pytest.mark.parametrize("age,expected_phase", [
    (0.5,  "New Moon"),
    (3.0,  "Waxing Crescent"),
    (8.0,  "First Quarter"),
    (11.0, "Waxing Gibbous"),
    (15.5, "Full Moon"),
    (19.0, "Waning Gibbous"),
    (23.0, "Last Quarter"),
    (27.0, "Waning Crescent"),
])
def test_phase_from_age(age, expected_phase):
    name, _ = _phase_from_age(age)
    assert name == expected_phase


def test_compute_moon_illumination_in_range():
    result = compute_moon()
    assert 0.0 <= result["illumination_pct"] <= 100.0


def test_compute_moon_has_required_keys():
    result = compute_moon()
    for key in ("phase_name", "emoji", "illumination_pct", "moonrise", "moonset",
                "next_full_moon", "next_new_moon"):
        assert key in result
