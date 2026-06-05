"""foods エンドポイントのテスト (Phase 0b)"""
import pytest
from httpx import AsyncClient, ASGITransport

from src.main import app

API_KEY = "test-api-key"
HEADERS = {"X-API-Key": API_KEY}


@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


async def test_create_food(client):
    r = await client.post(
        "/api/v1/foods",
        json={"name": "鶏もも肉", "category": "refrigerated", "default_shelf_days": 3},
        headers=HEADERS,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "鶏もも肉"
    assert body["category"] == "refrigerated"
    assert body["id"] > 0


async def test_create_food_duplicate_name(client):
    payload = {"name": "重複食材", "category": "pantry"}
    await client.post("/api/v1/foods", json=payload, headers=HEADERS)
    r = await client.post("/api/v1/foods", json=payload, headers=HEADERS)
    assert r.status_code == 409


async def test_list_foods(client):
    await client.post(
        "/api/v1/foods",
        json={"name": "白米", "category": "pantry"},
        headers=HEADERS,
    )
    r = await client.get("/api/v1/foods", headers=HEADERS)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


async def test_list_foods_filter_category(client):
    await client.post(
        "/api/v1/foods",
        json={"name": "冷凍餃子", "category": "frozen"},
        headers=HEADERS,
    )
    r = await client.get("/api/v1/foods?category=frozen", headers=HEADERS)
    assert r.status_code == 200
    assert all(f["category"] == "frozen" for f in r.json())


async def test_get_food_not_found(client):
    r = await client.get("/api/v1/foods/99999", headers=HEADERS)
    assert r.status_code == 404


async def test_update_food(client):
    create_r = await client.post(
        "/api/v1/foods",
        json={"name": "更新用食材", "category": "pantry"},
        headers=HEADERS,
    )
    food_id = create_r.json()["id"]
    r = await client.patch(
        f"/api/v1/foods/{food_id}",
        json={"default_shelf_days": 7},
        headers=HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["default_shelf_days"] == 7


async def test_delete_food(client):
    create_r = await client.post(
        "/api/v1/foods",
        json={"name": "削除用食材", "category": "ambient"},
        headers=HEADERS,
    )
    food_id = create_r.json()["id"]
    r = await client.delete(f"/api/v1/foods/{food_id}", headers=HEADERS)
    assert r.status_code == 204
    r2 = await client.get(f"/api/v1/foods/{food_id}", headers=HEADERS)
    assert r2.status_code == 404


async def test_unauthorized(client):
    r = await client.get("/api/v1/foods")
    assert r.status_code == 401
