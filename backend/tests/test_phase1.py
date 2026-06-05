"""Phase 1 テスト: 買い物リスト / レシピ再利用 / レシピ検索 / レシピ提案"""
import json
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from src.main import app
from tests.conftest import TEST_API_KEY

_MOCK_RECIPE = {
    "name": "豚の生姜焼き",
    "instructions_md": "## 手順\n1. 切る\n2. 焼く",
    "cook_time_min": 20,
    "cost_estimate": "500円程度",
    "ingredients": [
        {"raw_name": "豚肉", "quantity": 200.0, "unit": "g", "is_main": True},
        {"raw_name": "玉ねぎ", "quantity": 1.0, "unit": "個", "is_main": False},
    ],
}

_MOCK_SKELETON_RESULT = {
    "stock_summary": "", "start_date": "2026-06-05", "days": 1,
    "meal_types": ["dinner"], "preferences": "", "prompt_text": "", "raw_response": "",
    "meals": [
        {
            "served_date": "2026-06-05", "meal_type": "dinner",
            "concept": "豚の生姜焼き",
            "estimated_ingredients": ["豚肉", "玉ねぎ", "生姜"],
            "cook_time_min_estimate": 20,
        }
    ],
    "error": None,
}


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
async def plan_and_meal(client):
    """献立プランとその中の meal_id を返す。"""
    mock_graph = AsyncMock()
    mock_graph.ainvoke.return_value = _MOCK_SKELETON_RESULT
    with patch("src.api.v1.meal_plans.build_skeleton_graph", return_value=mock_graph):
        r = await client.post(
            "/api/v1/meal-plans",
            json={"start_date": "2026-06-05", "days": 1},
            headers={"X-API-Key": TEST_API_KEY},
        )
    body = r.json()
    return body["id"], body["meals"][0]["id"]


# ---- 買い物リスト ----

async def test_shopping_list_no_stock(client, plan_and_meal):
    plan_id, _ = plan_and_meal
    r = await client.get(f"/api/v1/meal-plans/{plan_id}/shopping-list", headers={"X-API-Key": TEST_API_KEY})
    assert r.status_code == 200
    body = r.json()
    assert body["meal_plan_id"] == plan_id
    items = body["items"]
    # 在庫ゼロなので全てin_stock=False
    assert len(items) == 3  # 豚肉, 玉ねぎ, 生姜
    assert all(not i["in_stock"] for i in items)
    names = {i["name"] for i in items}
    assert "豚肉" in names and "玉ねぎ" in names and "生姜" in names


async def test_shopping_list_with_stock(client, plan_and_meal):
    plan_id, _ = plan_and_meal

    # 豚肉の食材マスタと在庫を登録
    await client.post("/api/v1/foods", json={"name": "豚肉", "category": "refrigerated"}, headers={"X-API-Key": TEST_API_KEY})
    food_r = await client.get("/api/v1/foods", headers={"X-API-Key": TEST_API_KEY})
    food_id = food_r.json()[0]["id"]
    await client.post(
        "/api/v1/stock",
        json={"food_id": food_id, "quantity": 300.0, "unit": "g"},
        headers={"X-API-Key": TEST_API_KEY},
    )

    r = await client.get(f"/api/v1/meal-plans/{plan_id}/shopping-list", headers={"X-API-Key": TEST_API_KEY})
    assert r.status_code == 200
    items = {i["name"]: i for i in r.json()["items"]}
    assert items["豚肉"]["in_stock"] is True
    assert items["豚肉"]["stock_quantity"] == 300.0
    assert items["玉ねぎ"]["in_stock"] is False


async def test_shopping_list_not_found(client):
    r = await client.get("/api/v1/meal-plans/9999/shopping-list", headers={"X-API-Key": TEST_API_KEY})
    assert r.status_code == 404


# ---- レシピ再利用 ----

async def test_recipe_reuse(client, plan_and_meal):
    """同名レシピが既存なら LLM を呼ばず再利用し reuse_count が増える。"""
    _, meal_id = plan_and_meal

    mock_result = {
        "concept": "豚の生姜焼き", "estimated_ingredients": ["豚肉"],
        "prompt_text": "", "raw_response": "", "recipe": _MOCK_RECIPE, "error": None,
    }
    mock_graph = AsyncMock()
    mock_graph.ainvoke.return_value = mock_result

    with patch("src.api.v1.meals.build_recipe_graph", return_value=mock_graph):
        r1 = await client.post(f"/api/v1/meals/{meal_id}/recipe", headers={"X-API-Key": TEST_API_KEY})
    assert r1.status_code == 201
    recipe_id_1 = r1.json()["id"]
    assert r1.json()["reuse_count"] == 0

    # 2回目のプランと meal を作成（同名コンセプト）
    mock_skeleton_graph = AsyncMock()
    mock_skeleton_graph.ainvoke.return_value = _MOCK_SKELETON_RESULT
    with patch("src.api.v1.meal_plans.build_skeleton_graph", return_value=mock_skeleton_graph):
        r = await client.post(
            "/api/v1/meal-plans",
            json={"start_date": "2026-06-06", "days": 1},
            headers={"X-API-Key": TEST_API_KEY},
        )
    meal_id_2 = r.json()["meals"][0]["id"]

    # LLM は呼ばれないはず（reuse）
    with patch("src.api.v1.meals.build_recipe_graph") as mock_no_call:
        r2 = await client.post(f"/api/v1/meals/{meal_id_2}/recipe", headers={"X-API-Key": TEST_API_KEY})
    mock_no_call.assert_not_called()
    assert r2.status_code == 201
    assert r2.json()["id"] == recipe_id_1
    assert r2.json()["reuse_count"] == 1


# ---- レシピ検索 ----

async def test_list_recipes_empty(client):
    r = await client.get("/api/v1/recipes", headers={"X-API-Key": TEST_API_KEY})
    assert r.status_code == 200
    assert r.json() == []


async def test_list_recipes_with_query(client, plan_and_meal):
    _, meal_id = plan_and_meal
    mock_result = {
        "concept": "豚の生姜焼き", "estimated_ingredients": [],
        "prompt_text": "", "raw_response": "", "recipe": _MOCK_RECIPE, "error": None,
    }
    mock_graph = AsyncMock()
    mock_graph.ainvoke.return_value = mock_result
    with patch("src.api.v1.meals.build_recipe_graph", return_value=mock_graph):
        await client.post(f"/api/v1/meals/{meal_id}/recipe", headers={"X-API-Key": TEST_API_KEY})

    r = await client.get("/api/v1/recipes?q=生姜焼き", headers={"X-API-Key": TEST_API_KEY})
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["name"] == "豚の生姜焼き"

    r2 = await client.get("/api/v1/recipes?q=存在しない料理", headers={"X-API-Key": TEST_API_KEY})
    assert r2.json() == []


async def test_list_recipes_food_name_filter(client, plan_and_meal):
    _, meal_id = plan_and_meal
    mock_result = {
        "concept": "豚の生姜焼き", "estimated_ingredients": [],
        "prompt_text": "", "raw_response": "", "recipe": _MOCK_RECIPE, "error": None,
    }
    mock_graph = AsyncMock()
    mock_graph.ainvoke.return_value = mock_result
    with patch("src.api.v1.meals.build_recipe_graph", return_value=mock_graph):
        await client.post(f"/api/v1/meals/{meal_id}/recipe", headers={"X-API-Key": TEST_API_KEY})

    r = await client.get("/api/v1/recipes?food_name=豚肉", headers={"X-API-Key": TEST_API_KEY})
    assert r.status_code == 200
    assert len(r.json()) == 1


# ---- レシピ提案 (F-MEAL-11) ----

async def test_suggest_recipes(client):
    mock_result = {
        "concept": "豚肉・玉ねぎ", "estimated_ingredients": ["豚肉", "玉ねぎ"],
        "prompt_text": "", "raw_response": "", "recipe": _MOCK_RECIPE, "error": None,
    }
    mock_graph = AsyncMock()
    mock_graph.ainvoke.return_value = mock_result

    with patch("src.api.v1.recipes.build_recipe_graph", return_value=mock_graph):
        r = await client.post(
            "/api/v1/recipes/suggest",
            json={"food_names": ["豚肉", "玉ねぎ"], "count": 1},
            headers={"X-API-Key": TEST_API_KEY},
        )
    assert r.status_code == 201
    body = r.json()
    assert len(body) == 1
    assert body[0]["name"] == "豚の生姜焼き"


async def test_suggest_recipes_agent_error(client):
    mock_graph = AsyncMock()
    mock_graph.ainvoke.return_value = {
        "concept": "", "estimated_ingredients": [],
        "prompt_text": "", "raw_response": "", "recipe": None, "error": "fail",
    }
    with patch("src.api.v1.recipes.build_recipe_graph", return_value=mock_graph):
        r = await client.post(
            "/api/v1/recipes/suggest",
            json={"food_names": ["豚肉"], "count": 1},
            headers={"X-API-Key": TEST_API_KEY},
        )
    assert r.status_code == 502
