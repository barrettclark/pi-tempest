import asyncio

import httpx
import pytest

import api.main as main


@pytest.fixture
def no_kill(monkeypatch):
    calls: list[bool] = []

    async def fake_kill():
        calls.append(True)

    monkeypatch.setattr(main, "_kill_browser", fake_kill)
    return calls


@pytest.mark.parametrize(
    "client_ip,status",
    [("192.168.1.50", 403), ("127.0.0.1", 200)],
)
async def test_exit_is_loopback_only(no_kill, client_ip, status):
    transport = httpx.ASGITransport(app=main.app, client=(client_ip, 5555))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/exit")
    assert resp.status_code == status
    if main._background:
        await asyncio.gather(*main._background)
    assert len(no_kill) == (1 if status == 200 else 0)
