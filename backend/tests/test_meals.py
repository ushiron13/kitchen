"""食事・レシピ生成 API テスト (Phase 0c)"""
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from src.main import app
from tests.conftest import TEST_API_KEY

_MOCK_RECIPE = {
    "name": "豚の生姜焼き",
    "instructions_md": "## 材料（2人前）\n- 豚肉 200g\n\n## 手順\n1. 切る\n2. 焼く",
    "cook_time_min": 20,
    "cost_estimate": "500円程度",
    "ingredients": [
        {"raw_name": "豚肉", "quantity": 200.0, "unit": "g", "is_main": True},
        {"raw_name": "玉ねぎ", "quantity": 1.0, "unit": "個", "is_main": False},
    ],
}


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
async def meal_id(client):
    """テスト用の献立プランと食事を作成して meal_id を返す。"""
    mock_meals = [
        {
            "served_date": "2026-06-05",
            "meal_type": "dinner",
            "concept": "豚の生姜焼き",
            "estimated_ingredients": ["豚肉", "玉ねぎ"],
            "cook_time_min_estimate": 20,
        }
    ]
    mock_result = {
        "stock_summary": "", "start_date": "2026-06-05", "days": 1,
        "meal_types": ["dinner"], "preferences": "", "prompt_text": "", "raw_response": "",
        "meals": mock_meals, "error": None,
    }
    mock_graph = AsyncMock()
    mock_graph.ainvoke.return_value = mock_result

    with patch("src.api.v1.meal_plans.build_skeleton_graph", return_value=mock_graph):
        r = await client.post(
            "/api/v1/meal-plans",
            json={"start_date": "2026-06-05", "days": 1},
            headers={"X-API-Key": TEST_API_KEY},
        )
    return r.json()["meals"][0]["id"]


async def test_generate_recipe(client, meal_id):
    mock_result = {
        "concept": "豚の生姜焼き",
        "estimated_ingredients": ["豚肉"],
        "prompt_text": "", "raw_response": "",
        "recipe": _MOCK_RECIPE, "error": None,
    }
    mock_graph = AsyncMock()
    mock_graph.ainvoke.return_value = mock_result

    with patch("src.api.v1.meals.build_recipe_graph", return_value=mock_graph):
        r = await client.post(
            f"/api/v1/meals/{meal_id}/recipe",
            headers={"X-API-Key": TEST_API_KEY},
        )
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "豚の生姜焼き"
    assert body["cook_time_min"] == 20
    assert len(body["ingredients"]) == 2
    assert body["ingredients"][0]["is_main"] is True


async def test_generate_recipe_meal_not_found(client):
    r = await client.post(
        "/api/v1/meals/9999/recipe",
        headers={"X-API-Key": TEST_API_KEY},
    )
    assert r.status_code == 404


async def test_generate_recipe_agent_error(client, meal_id):
    mock_result = {
        "concept": "豚の生姜焼き", "estimated_ingredients": [],
        "prompt_text": "", "raw_response": "",
        "recipe": None, "error": "parse failed",
    }
    mock_graph = AsyncMock()
    mock_graph.ainvoke.return_value = mock_result

    with patch("src.api.v1.meals.build_recipe_graph", return_value=mock_graph):
        r = await client.post(
            f"/api/v1/meals/{meal_id}/recipe",
            headers={"X-API-Key": TEST_API_KEY},
        )
    assert r.status_code == 502


async def test_get_recipe(client, meal_id):
    mock_result = {
        "concept": "豚の生姜焼き", "estimated_ingredients": [],
        "prompt_text": "", "raw_response": "",
        "recipe": _MOCK_RECIPE, "error": None,
    }
    mock_graph = AsyncMock()
    mock_graph.ainvoke.return_value = mock_result

    with patch("src.api.v1.meals.build_recipe_graph", return_value=mock_graph):
        create_r = await client.post(
            f"/api/v1/meals/{meal_id}/recipe",
            headers={"X-API-Key": TEST_API_KEY},
        )
    recipe_id = create_r.json()["id"]

    r = await client.get(f"/api/v1/recipes/{recipe_id}", headers={"X-API-Key": TEST_API_KEY})
    assert r.status_code == 200
    assert r.json()["id"] == recipe_id
    assert r.json()["name"] == "豚の生姜焼き"


async def test_get_recipe_not_found(client):
    r = await client.get("/api/v1/recipes/9999", headers={"X-API-Key": TEST_API_KEY})
    assert r.status_code == 404


async def test_delete_meal(client, meal_id):
    r = await client.delete(f"/api/v1/meals/{meal_id}", headers={"X-API-Key": TEST_API_KEY})
    assert r.status_code == 204

    r2 = await client.post(f"/api/v1/meals/{meal_id}/recipe", headers={"X-API-Key": TEST_API_KEY})
    assert r2.status_code == 404


async def test_delete_meal_not_found(client):
    r = await client.delete("/api/v1/meals/9999", headers={"X-API-Key": TEST_API_KEY})
    assert r.status_code == 404


async def test_update_meal_status(client, meal_id):
    r = await client.patch(
        f"/api/v1/meals/{meal_id}/status",
        json={"status": "cooked"},
        headers={"X-API-Key": TEST_API_KEY},
    )
    assert r.status_code == 204

    r2 = await client.patch(
        f"/api/v1/meals/{meal_id}/status",
        json={"status": "skipped"},
        headers={"X-API-Key": TEST_API_KEY},
    )
    assert r2.status_code == 204

    r3 = await client.patch(
        f"/api/v1/meals/{meal_id}/status",
        json={"status": "planned"},
        headers={"X-API-Key": TEST_API_KEY},
    )
    assert r3.status_code == 204


async def test_update_meal_status_invalid(client, meal_id):
    r = await client.patch(
        f"/api/v1/meals/{meal_id}/status",
        json={"status": "unknown"},
        headers={"X-API-Key": TEST_API_KEY},
    )
    assert r.status_code == 422


async def test_update_meal_status_not_found(client):
    r = await client.patch(
        "/api/v1/meals/9999/status",
        json={"status": "cooked"},
        headers={"X-API-Key": TEST_API_KEY},
    )
    assert r.status_code == 404
