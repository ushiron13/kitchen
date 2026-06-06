"""献立プラン API テスト (Phase 0c)"""
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from src.main import app
from tests.conftest import TEST_API_KEY

_MOCK_MEALS = [
    {
        "served_date": "2026-06-05",
        "meal_type": "dinner",
        "concept": "豚の生姜焼き",
        "estimated_ingredients": ["豚肉", "玉ねぎ", "生姜"],
        "cook_time_min_estimate": 20,
    }
]

_MOCK_SKELETON_RESULT = {
    "stock_summary": "",
    "start_date": "2026-06-05",
    "days": 1,
    "meal_types": ["dinner"],
    "preferences": "",
    "prompt_text": "",
    "raw_response": "",
    "meals": _MOCK_MEALS,
    "error": None,
}


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


def _mock_skeleton():
    mock_graph = AsyncMock()
    mock_graph.ainvoke.return_value = _MOCK_SKELETON_RESULT
    return mock_graph


async def test_create_meal_plan(client):
    with patch("src.api.v1.meal_plans.build_skeleton_graph", return_value=_mock_skeleton()):
        r = await client.post(
            "/api/v1/meal-plans",
            json={"start_date": "2026-06-05", "days": 1, "meal_types": ["dinner"]},
            headers={"X-API-Key": TEST_API_KEY},
        )
    assert r.status_code == 201
    body = r.json()
    assert body["start_date"] == "2026-06-05"
    assert body["end_date"] == "2026-06-05"
    assert len(body["meals"]) == 1
    assert body["meals"][0]["concept"] == "豚の生姜焼き"
    assert body["meals"][0]["estimated_ingredients"] == ["豚肉", "玉ねぎ", "生姜"]


async def test_create_meal_plan_multi_day(client):
    meals = [
        {
            "served_date": f"2026-06-0{i}",
            "meal_type": "dinner",
            "concept": f"料理{i}",
            "estimated_ingredients": [],
            "cook_time_min_estimate": 30,
        }
        for i in range(5, 8)
    ]
    mock_result = {**_MOCK_SKELETON_RESULT, "days": 3, "meals": meals}
    mock_graph = AsyncMock()
    mock_graph.ainvoke.return_value = mock_result

    with patch("src.api.v1.meal_plans.build_skeleton_graph", return_value=mock_graph):
        r = await client.post(
            "/api/v1/meal-plans",
            json={"start_date": "2026-06-05", "days": 3, "meal_types": ["dinner"]},
            headers={"X-API-Key": TEST_API_KEY},
        )
    assert r.status_code == 201
    body = r.json()
    assert body["end_date"] == "2026-06-07"
    assert len(body["meals"]) == 3


async def test_list_meal_plans(client):
    with patch("src.api.v1.meal_plans.build_skeleton_graph", return_value=_mock_skeleton()):
        await client.post(
            "/api/v1/meal-plans",
            json={"start_date": "2026-06-05", "days": 1},
            headers={"X-API-Key": TEST_API_KEY},
        )

    r = await client.get("/api/v1/meal-plans", headers={"X-API-Key": TEST_API_KEY})
    assert r.status_code == 200
    assert len(r.json()) == 1


async def test_get_meal_plan(client):
    with patch("src.api.v1.meal_plans.build_skeleton_graph", return_value=_mock_skeleton()):
        create_r = await client.post(
            "/api/v1/meal-plans",
            json={"start_date": "2026-06-05", "days": 1},
            headers={"X-API-Key": TEST_API_KEY},
        )
    plan_id = create_r.json()["id"]

    r = await client.get(f"/api/v1/meal-plans/{plan_id}", headers={"X-API-Key": TEST_API_KEY})
    assert r.status_code == 200
    assert r.json()["id"] == plan_id


async def test_get_meal_plan_not_found(client):
    r = await client.get("/api/v1/meal-plans/9999", headers={"X-API-Key": TEST_API_KEY})
    assert r.status_code == 404


async def test_delete_meal_plan(client):
    with patch("src.api.v1.meal_plans.build_skeleton_graph", return_value=_mock_skeleton()):
        create_r = await client.post(
            "/api/v1/meal-plans",
            json={"start_date": "2026-06-05", "days": 1, "meal_types": ["dinner"]},
            headers={"X-API-Key": TEST_API_KEY},
        )
    plan_id = create_r.json()["id"]

    r = await client.delete(f"/api/v1/meal-plans/{plan_id}", headers={"X-API-Key": TEST_API_KEY})
    assert r.status_code == 204

    r2 = await client.get(f"/api/v1/meal-plans/{plan_id}", headers={"X-API-Key": TEST_API_KEY})
    assert r2.status_code == 404


async def test_delete_meal_plan_not_found(client):
    r = await client.delete("/api/v1/meal-plans/9999", headers={"X-API-Key": TEST_API_KEY})
    assert r.status_code == 404


async def test_create_meal_plan_agent_error(client):
    mock_graph = AsyncMock()
    mock_graph.ainvoke.return_value = {**_MOCK_SKELETON_RESULT, "meals": [], "error": "LLM failed"}

    with patch("src.api.v1.meal_plans.build_skeleton_graph", return_value=mock_graph):
        r = await client.post(
            "/api/v1/meal-plans",
            json={"start_date": "2026-06-05", "days": 1},
            headers={"X-API-Key": TEST_API_KEY},
        )
    assert r.status_code == 502
