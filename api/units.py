"""Unit conversion and derived weather calculations."""

import math


def c_to_f(c: float | None) -> float | None:
    if c is None:
        return None
    return round(c * 9 / 5 + 32, 1)


def ms_to_mph(ms: float | None) -> float | None:
    if ms is None:
        return None
    return round(ms * 2.23694, 1)


def mb_to_inhg(mb: float | None) -> float | None:
    if mb is None:
        return None
    return round(mb * 0.02953, 3)


def mm_to_in(mm: float | None) -> float:
    if mm is None:
        return 0.0
    return round(mm * 0.0393701, 3)


def dew_point_f(temp_c: float | None, rh: float | None) -> float | None:
    """Magnus formula dew point, returned in °F."""
    if temp_c is None or rh is None or rh <= 0:
        return None
    a, b = 17.625, 243.04
    alpha = math.log(rh / 100.0) + (a * temp_c) / (b + temp_c)
    dp_c = (b * alpha) / (a - alpha)
    return c_to_f(dp_c)


def feels_like_f(temp_c: float | None, rh: float | None, wind_ms: float | None) -> float | None:
    """
    NWS heat index above 80°F, wind chill below 50°F, otherwise actual temp.
    """
    if temp_c is None:
        return None
    temp_f = c_to_f(temp_c)

    if temp_f >= 80 and rh is not None:
        # Rothfusz heat index
        hi = (
            -42.379
            + 2.04901523 * temp_f
            + 10.14333127 * rh
            - 0.22475541 * temp_f * rh
            - 0.00683783 * temp_f**2
            - 0.05481717 * rh**2
            + 0.00122874 * temp_f**2 * rh
            + 0.00085282 * temp_f * rh**2
            - 0.00000199 * temp_f**2 * rh**2
        )
        return round(hi, 1)

    if temp_f <= 50 and wind_ms is not None:
        wind_mph = ms_to_mph(wind_ms) or 0
        if wind_mph >= 3:
            wc = 35.74 + 0.6215 * temp_f - 35.75 * wind_mph**0.16 + 0.4275 * temp_f * wind_mph**0.16
            return round(wc, 1)

    return temp_f


_CARDINALS = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
]


def degrees_to_cardinal(deg: int | None) -> str | None:
    if deg is None:
        return None
    idx = round(deg / 22.5) % 16
    return _CARDINALS[idx]
