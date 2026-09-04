import os

# config.py reads these at import time; provide inert defaults so the suite
# runs without a .env file (CI) while a real .env still takes precedence.
os.environ.setdefault("WEATHERFLOW_TOKEN", "test-token")
os.environ.setdefault("STATION_ID", "0")
os.environ.setdefault("DEVICE_ID", "0")
