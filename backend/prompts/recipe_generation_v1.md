# recipe_generation_v1

以下の料理の詳細なレシピを生成してください。

## 料理名
{concept}

## 利用可能な食材
{estimated_ingredients}

## 条件
- 家庭で作りやすい手順で記述してください
- 手順はMarkdown形式で記述してください
- 食材の分量は2〜4人前で記述してください

## 出力形式
JSONのみ出力してください（説明・コードブロック記法は不要）:
{
  "name": "料理名",
  "instructions_md": "## 材料（2〜4人前）\n- ...\n\n## 手順\n1. ...",
  "cook_time_min": 30,
  "cost_estimate": "500円程度",
  "ingredients": [
    {"raw_name": "食材名", "quantity": 100.0, "unit": "g", "is_main": true}
  ]
}
