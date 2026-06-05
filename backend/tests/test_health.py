"""Health エンドポイントのテスト (Phase 0a)"""
import pytest
from httpx import AsyncClient, ASGITransport

from src.main import app


@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


async def test_root_health(client):
    r = await client.get("/health")
    assert r.status_code == 200


async def test_live(client):
    r = await client.get("/api/v1/health/live")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "alive"
    assert "uptime_sec" in body
