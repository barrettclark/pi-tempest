import os
from dotenv import load_dotenv

load_dotenv()

TOKEN = os.environ["WEATHERFLOW_TOKEN"]
STATION_ID = int(os.environ["STATION_ID"])
DEVICE_ID = int(os.environ["DEVICE_ID"])
DB_PATH = os.environ.get("DB_PATH", "data/tempest.db")
UDP_PORT = int(os.environ.get("UDP_PORT", "50222"))
API_HOST = os.environ.get("API_HOST", "127.0.0.1")
API_PORT = int(os.environ.get("API_PORT", "8000"))
TIMEZONE = os.environ.get("TZ", "America/Chicago")

WEATHERFLOW_API_BASE = "https://swd.weatherflow.com/swd/rest"
BACKFILL_DAYS = 30
