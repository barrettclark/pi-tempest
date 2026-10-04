import asyncio
import json
import time

import pytest

import config
from collector import db
from collector.udp_listener import TempestProtocol, _tasks

_NOW = int(time.time())


def _obs_array(epoch=_NOW, **overrides):
    arr = [epoch, 0.1, 1.0, 2.0, 180, 3, 1000.0, 20.0, 50.0, 1000, 3.0, 100, 0.0, 0, 0, 0, 2.7, 1]
    for idx, val in overrides.items():
        arr[int(idx)] = val
    return arr


def _obs_packet(serial="ST-00000512", arr=None):
    packet = {"type": "obs_st", "obs": [arr if arr is not None else _obs_array()]}
    if serial is not None:
        packet["serial_number"] = serial
    return packet


@pytest.fixture
def inserted(monkeypatch):
    rows: list[dict] = []

    async def fake_insert(obs, source="udp"):
        rows.append(obs)

    monkeypatch.setattr(db, "insert_observation", fake_insert)
    return rows


async def _deliver(packet) -> None:
    proto = TempestProtocol(asyncio.get_running_loop())
    raw = packet if isinstance(packet, bytes) else json.dumps(packet).encode()
    proto.datagram_received(raw, ("192.168.1.50", 50222))
    if _tasks:
        await asyncio.gather(*list(_tasks))


@pytest.mark.parametrize(
    "packet",
    [
        pytest.param(_obs_packet(serial=None), id="missing-serial"),
        pytest.param(_obs_packet(serial="HB-00000001"), id="hub-serial"),
        pytest.param(_obs_packet(arr=_obs_array(epoch=_NOW + 86400 * 365)), id="future-epoch"),
        pytest.param(_obs_packet(arr=_obs_array(epoch=0)), id="zero-epoch"),
        pytest.param(_obs_packet(arr=_obs_array(epoch=True)), id="bool-epoch"),
        pytest.param(_obs_packet(arr=_obs_array(epoch=str(_NOW))), id="string-epoch"),
        pytest.param(_obs_packet(arr=_obs_array(**{"7": "20.0"})), id="string-temperature"),
        pytest.param(_obs_packet(arr=_obs_array()[:16]), id="short-array"),
        pytest.param({"type": "obs_st", "obs": "nope"}, id="obs-not-list"),
        pytest.param(b"[1, 2, 3]", id="non-object-json"),
    ],
)
async def test_obs_st_rejects_bad_packets(inserted, packet):
    await _deliver(packet)
    assert inserted == []


async def test_obs_st_accepts_valid_packet(inserted):
    await _deliver(_obs_packet())
    assert len(inserted) == 1
    assert inserted[0]["epoch"] == _NOW
    assert inserted[0]["report_interval"] == 1


async def test_serial_override_is_exact_match(inserted, monkeypatch):
    monkeypatch.setattr(config, "TEMPEST_SERIAL", "ST-00000512")
    await _deliver(_obs_packet(serial="ST-00000999"))
    assert inserted == []
    await _deliver(_obs_packet(serial="ST-00000512"))
    assert len(inserted) == 1
