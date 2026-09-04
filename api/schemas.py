"""Pydantic response models."""

from pydantic import BaseModel


class RapidWind(BaseModel):
    epoch: int
    speed_mph: float
    direction_deg: int


class CurrentResponse(BaseModel):
    epoch: int
    timestamp_local: str
    temperature_f: float | None
    feels_like_f: float | None
    dew_point_f: float | None
    humidity_pct: float | None
    pressure_inhg: float | None
    pressure_trend: str
    wind_avg_mph: float | None
    wind_gust_mph: float | None
    wind_lull_mph: float | None
    wind_direction_deg: int | None
    wind_direction_cardinal: str | None
    rain_today_in: float
    rain_rate_in_hr: float | None
    uv_index: float | None
    solar_radiation_wm2: float | None
    lightning_count_1h: int
    lightning_last_epoch: int | None
    lightning_last_distance_km: int | None
    battery_v: float | None
    rapid_wind: RapidWind | None


class TimeSeriesResponse(BaseModel):
    labels: list[int]
    datasets: dict[str, list[float | None]]


class RainResponse(BaseModel):
    hourly_labels: list[int]
    hourly_rain_in: list[float]
    daily_labels: list[int]
    daily_rain_in: list[float]


class StatusResponse(BaseModel):
    db_row_count: int
    last_obs_epoch: int | None
    last_obs_age_seconds: int | None
    backfill_complete: bool


class AqiResponse(BaseModel):
    aqi: int | None
    category: str | None
    pm25_aqi: int | None
    ozone_aqi: int | None
    fetched_at: int


class MoonResponse(BaseModel):
    phase_name: str
    emoji: str
    illumination_pct: float
    moonrise: str | None
    moonset: str | None
    next_full_moon: str
    next_new_moon: str
    computed_at: int
    sunrise: str | None = None
    sunset: str | None = None
    day_length: str | None = None
