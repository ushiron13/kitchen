"""profile エンドポイントのテスト (F-05)"""
import pytest
from httpx import ASGITransport, AsyncClient

from src.main import app

API_KEY = "test-api-key"
HEADERS = {"X-API-Key": API_KEY}


@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


async def test_get_profile_default(client):
    r = await client.get("/api/v1/profile", headers=HEADERS)
    assert r.status_code == 200
    body = r.json()
    assert body["family_composition"] is None
    assert body["food_preferences"] is None
    assert body["allergies"] is None
    assert "updated_at" in body


async def test_update_profile(client):
    r = await client.put(
        "/api/v1/profile",
        json={
            "family_composition": "大人2名（夫婦）",
            "food_preferences": "夜は和食多め",
            "allergies": "えびアレルギー",
        },
        headers=HEADERS,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["family_composition"] == "大人2名（夫婦）"
    assert body["food_preferences"] == "夜は和食多め"
    assert body["allergies"] == "えびアレルギー"


async def test_update_profile_partial(client):
    await client.put(
        "/api/v1/profile",
        json={"family_composition": "大人2名"},
        headers=HEADERS,
    )
    r = await client.put(
        "/api/v1/profile",
        json={"food_preferences": "朝は簡単に"},
        headers=HEADERS,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["food_preferences"] == "朝は簡単に"


async def test_get_profile_after_update(client):
    await client.put(
        "/api/v1/profile",
        json={"family_composition": "大人3名"},
        headers=HEADERS,
    )
    r = await client.get("/api/v1/profile", headers=HEADERS)
    assert r.status_code == 200
    assert r.json()["family_composition"] == "大人3名"


async def test_profile_clear_field(client):
    await client.put(
        "/api/v1/profile",
        json={"allergies": "えびアレルギー"},
        headers=HEADERS,
    )
    r = await client.put(
        "/api/v1/profile",
        json={"allergies": None},
        headers=HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["allergies"] is None


async def test_profile_unauthorized(client):
    r = await client.get("/api/v1/profile")
    assert r.status_code == 401
