import json
import logging
from typing import Optional

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph
from typing_extensions import TypedDict

from src.core.config import settings

logger = logging.getLogger(__name__)

_HAIKU = "claude-haiku-4-5-20251001"
_SONNET = "claude-sonnet-4-6"

_FENCE_PREFIXES = ("```json", "```")


def _strip_fences(text: str) -> str:
    text = text.strip()
    for prefix in _FENCE_PREFIXES:
        if text.startswith(prefix):
            lines = text.split("\n")
            end = len(lines) - 1 if lines[-1].strip() == "```" else len(lines)
            return "\n".join(lines[1:end])
    return text


# ---------------------------------------------------------------------------
# Skeleton graph
# ---------------------------------------------------------------------------

class SkeletonState(TypedDict):
    stock_summary: str
    start_date: str
    days: int
    meal_types: list[str]
    preferences: str  # ユーザーの自然言語要望（例: "和食多め、30分以内"）
    prompt_text: str
    raw_response: str
    meals: list[dict]
    error: Optional[str]


def _build_skeleton_prompt(state: SkeletonState) -> SkeletonState:
    types_str = "、".join(state["meal_types"])
    pref_line = f"要望: {state['preferences']}\n" if state.get("preferences") else ""
    text = (
        f"在庫食材:\n{state['stock_summary']}\n\n"
        f"期間: {state['start_date']} から {state['days']} 日間\n"
        f"食事区分: {types_str}\n"
        f"{pref_line}"
        "\nJSON配列のみ出力してください:\n"
        '[{"served_date":"YYYY-MM-DD","meal_type":"dinner","concept":"料理名",'
        '"estimated_ingredients":["食材1"],"cook_time_min_estimate":30}]'
    )
    return {**state, "prompt_text": text}


def _call_skeleton_llm(state: SkeletonState) -> SkeletonState:
    llm = ChatAnthropic(
        model=_SONNET,
        api_key=settings.anthropic_api_key,
        temperature=0.7,
        max_tokens=2048,
    )
    messages = [
        SystemMessage(content=(
            "あなたは家庭の献立を提案するアシスタントです。"
            "JSONのみ出力し、説明やコードブロックは使わないでください。"
        )),
        HumanMessage(content=state["prompt_text"]),
    ]
    response = llm.invoke(messages)
    return {**state, "raw_response": str(response.content)}


def _parse_skeleton(state: SkeletonState) -> SkeletonState:
    text = _strip_fences(state["raw_response"])
    try:
        meals = json.loads(text)
        if not isinstance(meals, list):
            raise ValueError("Expected JSON array")
        return {**state, "meals": meals, "error": None}
    except Exception as exc:
        logger.warning("Skeleton parse error: %s\nraw=%s", exc, state["raw_response"][:200])
        return {**state, "meals": [], "error": str(exc)}


def build_skeleton_graph():
    g: StateGraph = StateGraph(SkeletonState)
    g.add_node("build_prompt", _build_skeleton_prompt)
    g.add_node("call_llm", _call_skeleton_llm)
    g.add_node("parse", _parse_skeleton)
    g.set_entry_point("build_prompt")
    g.add_edge("build_prompt", "call_llm")
    g.add_edge("call_llm", "parse")
    g.add_edge("parse", END)
    return g.compile()


# ---------------------------------------------------------------------------
# Recipe graph
# ---------------------------------------------------------------------------

class RecipeState(TypedDict):
    concept: str
    estimated_ingredients: list[str]
    prompt_text: str
    raw_response: str
    recipe: Optional[dict]
    error: Optional[str]


def _build_recipe_prompt(state: RecipeState) -> RecipeState:
    ingr_str = "、".join(state["estimated_ingredients"]) or "適宜"
    text = (
        f"料理名: {state['concept']}\n"
        f"利用可能な食材: {ingr_str}\n\n"
        "家庭で作りやすい2〜4人前のレシピをJSONのみで出力してください:\n"
        '{"name":"料理名","instructions_md":"## 材料\\n...\\n\\n## 手順\\n1. ...",'
        '"cook_time_min":30,"cost_estimate":"500円程度",'
        '"ingredients":[{"raw_name":"食材","quantity":100.0,"unit":"g","is_main":true}]}'
    )
    return {**state, "prompt_text": text}


def _call_recipe_llm(state: RecipeState) -> RecipeState:
    llm = ChatAnthropic(
        model=_SONNET,
        api_key=settings.anthropic_api_key,
        temperature=0.5,
        max_tokens=4096,
    )
    messages = [
        SystemMessage(content=(
            "あなたはプロの料理家です。家庭で実践できる詳細なレシピをJSON形式で出力してください。"
            "説明やコードブロックは使わず、JSONのみ出力してください。"
        )),
        HumanMessage(content=state["prompt_text"]),
    ]
    response = llm.invoke(messages)
    return {**state, "raw_response": str(response.content)}


def _parse_recipe(state: RecipeState) -> RecipeState:
    text = _strip_fences(state["raw_response"])
    try:
        recipe = json.loads(text)
        if not isinstance(recipe, dict):
            raise ValueError("Expected JSON object")
        return {**state, "recipe": recipe, "error": None}
    except Exception as exc:
        logger.warning("Recipe parse error: %s\nraw=%s", exc, state["raw_response"][:200])
        return {**state, "recipe": None, "error": str(exc)}


def build_recipe_graph():
    g: StateGraph = StateGraph(RecipeState)
    g.add_node("build_prompt", _build_recipe_prompt)
    g.add_node("call_llm", _call_recipe_llm)
    g.add_node("parse", _parse_recipe)
    g.set_entry_point("build_prompt")
    g.add_edge("build_prompt", "call_llm")
    g.add_edge("call_llm", "parse")
    g.add_edge("parse", END)
    return g.compile()
