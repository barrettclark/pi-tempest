"""Pydantic response models."""

from typing import Optional
from pydantic import BaseModel


class RapidWind(BaseModel):
    epoch: int
    speed_mph: float
    direction_deg: int


class CurrentResponse(BaseModel):
    epoch: int
    timestamp_local: str
    temperature_f: Optional[float]
    feels_like_f: Optional[float]
    dew_point_f: Optional[float]
    humidity_pct: Optional[float]
    pressure_inhg: Optional[float]
    pressure_trend: str
    wind_avg_mph: Optional[float]
    wind_gust_mph: Optional[float]
    wind_lull_mph: Optional[float]
    wind_direction_deg: Optional[int]
    wind_direction_cardinal: Optional[str]
    rain_today_in: float
    rain_rate_in_hr: Optional[float]
    uv_index: Optional[float]
    solar_radiation_wm2: Optional[float]
    lightning_count_1h: int
    lightning_last_epoch: Optional[int]
    lightning_last_distance_km: Optional[int]
    battery_v: Optional[float]
    rapid_wind: Optional[RapidWind]


class TimeSeriesResponse(BaseModel):
    labels: list[int]
    datasets: dict[str, list[Optional[float]]]


class RainResponse(BaseModel):
    hourly_labels: list[int]
    hourly_rain_in: list[float]
    daily_labels: list[int]
    daily_rain_in: list[float]


class StatusResponse(BaseModel):
    db_row_count: int
    last_obs_epoch: Optional[int]
    last_obs_age_seconds: Optional[int]
    backfill_complete: bool


class AqiResponse(BaseModel):
    aqi: Optional[int]
    category: Optional[str]
    pm25_aqi: Optional[int]
    ozone_aqi: Optional[int]
    fetched_at: int


class MoonResponse(BaseModel):
    phase_name: str
    emoji: str
    illumination_pct: float
    moonrise: Optional[str]
    moonset: Optional[str]
    next_full_moon: str
    next_new_moon: str
    computed_at: int
