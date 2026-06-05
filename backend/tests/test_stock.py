"""stock エンドポイントのテスト (Phase 0b)"""
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


@pytest.fixture
async def food_id(client):
    r = await client.post(
        "/api/v1/foods",
        json={"name": "テスト用食材", "category": "refrigerated"},
        headers=HEADERS,
    )
    return r.json()["id"]


async def test_create_stock(client, food_id):
    r = await client.post(
        "/api/v1/stock",
        json={"food_id": food_id, "quantity": 2.0, "unit": "個", "expiry_date": "2026-12-31"},
        headers=HEADERS,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["quantity"] == 2.0
    assert body["food_name"] == "テスト用食材"
    assert body["opened"] is False


async def test_create_stock_invalid_food(client):
    r = await client.post(
        "/api/v1/stock",
        json={"food_id": 99999, "quantity": 1.0, "unit": "個"},
        headers=HEADERS,
    )
    assert r.status_code == 422


async def test_list_stock(client, food_id):
    await client.post(
        "/api/v1/stock",
        json={"food_id": food_id, "quantity": 1.0, "unit": "本"},
        headers=HEADERS,
    )
    r = await client.get("/api/v1/stock", headers=HEADERS)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


async def test_list_stock_filter(client, food_id):
    await client.post(
        "/api/v1/stock",
        json={"food_id": food_id, "quantity": 1.0, "unit": "g"},
        headers=HEADERS,
    )
    r = await client.get(f"/api/v1/stock?food_id={food_id}", headers=HEADERS)
    assert r.status_code == 200
    assert all(s["food_id"] == food_id for s in r.json())


async def test_record_transaction_consume(client, food_id):
    create_r = await client.post(
        "/api/v1/stock",
        json={"food_id": food_id, "quantity": 5.0, "unit": "個"},
        headers=HEADERS,
    )
    item_id = create_r.json()["id"]
    r = await client.post(
        f"/api/v1/stock/{item_id}/transactions",
        json={"tx_type": "consume", "quantity_delta": -2.0, "reason": "夕食に使用"},
        headers=HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["quantity"] == pytest.approx(3.0)


async def test_update_stock(client, food_id):
    create_r = await client.post(
        "/api/v1/stock",
        json={"food_id": food_id, "quantity": 1.0, "unit": "袋"},
        headers=HEADERS,
    )
    item_id = create_r.json()["id"]
    r = await client.patch(
        f"/api/v1/stock/{item_id}",
        json={"opened": True, "location": "冷蔵庫上段"},
        headers=HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["opened"] is True
    assert r.json()["location"] == "冷蔵庫上段"


async def test_delete_stock(client, food_id):
    create_r = await client.post(
        "/api/v1/stock",
        json={"food_id": food_id, "quantity": 1.0, "unit": "個"},
        headers=HEADERS,
    )
    item_id = create_r.json()["id"]
    r = await client.delete(f"/api/v1/stock/{item_id}", headers=HEADERS)
    assert r.status_code == 204
    r2 = await client.get(f"/api/v1/stock/{item_id}", headers=HEADERS)
    assert r2.status_code == 404


async def test_stock_not_found(client):
    r = await client.get("/api/v1/stock/99999", headers=HEADERS)
    assert r.status_code == 404
