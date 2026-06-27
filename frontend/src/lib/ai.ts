import Anthropic from '@anthropic-ai/sdk'

const SONNET = 'claude-sonnet-4-6'

function makeClient(apiKey: string) {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
}

function stripFences(text: string): string {
  const trimmed = text.trim()
  for (const prefix of ['```json', '```']) {
    if (trimmed.startsWith(prefix)) {
      const lines = trimmed.split('\n')
      const end = lines[lines.length - 1].trim() === '```' ? lines.length - 1 : lines.length
      return lines.slice(1, end).join('\n')
    }
  }
  return trimmed
}

function extractJsonArray(raw: string): unknown[] {
  const text = stripFences(raw)
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed
  } catch { /* fall through */ }
  const m = text.match(/\[[\s\S]*\]/)
  if (m) {
    try { return JSON.parse(m[0]) as unknown[] } catch { /* fall through */ }
  }
  return []
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const text = stripFences(raw)
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch { /* fall through */ }
  const m = text.match(/\{[\s\S]*\}/)
  if (m) {
    try { return JSON.parse(m[0]) as Record<string, unknown> } catch { /* fall through */ }
  }
  return null
}

function getText(client_response: Anthropic.Message): string {
  const block = client_response.content[0]
  return block.type === 'text' ? block.text : ''
}

// ---------------------------------------------------------------------------
// 献立スケルトン生成
// ---------------------------------------------------------------------------

export interface MealSkeleton {
  served_date: string
  meal_type: string
  concept: string
  estimated_ingredients: string[]
  cook_time_min_estimate: number | null
}

export async function generateMealPlan(
  apiKey: string,
  params: {
    stockSummary: string
    startDate: string
    days: number
    mealTypes: string[]
    preferences: string
    profileText: string
  },
): Promise<MealSkeleton[]> {
  const client = makeClient(apiKey)
  const { stockSummary, startDate, days, mealTypes, preferences, profileText } = params

  const typesStr = mealTypes.join('、')
  const prefLine = preferences ? `今回の要望: ${preferences}\n` : ''
  const profileLine = profileText ? `家族プロファイル:\n${profileText}\n\n` : ''

  const prompt =
    profileLine +
    `在庫食材:\n${stockSummary}\n\n` +
    `期間: ${startDate} から ${days} 日間\n` +
    `食事区分: ${typesStr}\n` +
    prefLine +
    '\nJSON配列のみ出力してください:\n' +
    '[{"served_date":"YYYY-MM-DD","meal_type":"dinner","concept":"料理名",' +
    '"estimated_ingredients":["食材1"],"cook_time_min_estimate":30}]'

  const response = await client.messages.create({
    model: SONNET,
    max_tokens: 4096,
    temperature: 0.7,
    system:
      'あなたは家庭の献立を提案するアシスタントです。' +
      'プロファイルに記載された家族の嗜好・アレルギーを必ず考慮してください。' +
      'JSONのみ出力し、説明やコードブロックは使わないでください。',
    messages: [{ role: 'user', content: prompt }],
  })

  return extractJsonArray(getText(response)) as MealSkeleton[]
}

// ---------------------------------------------------------------------------
// レシピ生成
// ---------------------------------------------------------------------------

export interface RecipeResult {
  name: string
  instructions_md: string
  cook_time_min: number | null
  cost_estimate: string | null
  ingredients: Array<{
    raw_name: string
    quantity: number | null
    unit: string | null
    is_main: boolean
  }>
}

const RECIPE_FORMAT =
  '## 材料（2〜4人前）\n' +
  '- 食材名: 分量・単位\n\n' +
  '## 下準備（省略可）\n' +
  '- 下準備の手順\n\n' +
  '## 手順\n' +
  '1. 手順の説明\n\n' +
  '## Tips（省略可）\n' +
  '- コツや補足'

const RECIPE_EXAMPLE = JSON.stringify({
  name: '豚の生姜焼き',
  instructions_md:
    '## 材料（2〜4人前）\n- 豚ロース薄切り: 300g\n- 玉ねぎ: 1/2個\n- しょうゆ: 大さじ2\n\n' +
    '## 手順\n1. 豚肉は食べやすい大きさに切る\n2. 玉ねぎは薄切りにする\n3. フライパンで炒めて完成',
  cook_time_min: 20,
  cost_estimate: '600円程度',
  ingredients: [
    { raw_name: '豚ロース薄切り', quantity: 300, unit: 'g', is_main: true },
    { raw_name: '玉ねぎ', quantity: 0.5, unit: '個', is_main: false },
  ],
})

async function callRecipeLLM(
  apiKey: string,
  concept: string,
  estimatedIngredients: string[],
): Promise<RecipeResult | null> {
  const client = makeClient(apiKey)
  const ingrStr = estimatedIngredients.join('、') || '適宜'

  const prompt =
    `料理名: ${concept}\n` +
    `利用可能な食材: ${ingrStr}\n\n` +
    '家庭で作りやすい2〜4人前のレシピをJSONで出力してください。\n' +
    'instructions_md は必ず以下のフォーマットに従ってください:\n\n' +
    RECIPE_FORMAT + '\n\n' +
    '出力例:\n' + RECIPE_EXAMPLE

  const response = await client.messages.create({
    model: SONNET,
    max_tokens: 4096,
    temperature: 0.5,
    system:
      'あなたはプロの料理家です。家庭で実践できる詳細なレシピをJSON形式で出力してください。' +
      "instructions_md のセクション見出しは必ず ## を使い、材料は '- 食材名: 分量・単位' 形式、" +
      "手順は '1. ' から始まる番号リスト形式で統一してください。" +
      '説明やコードブロックは使わず、JSONのみ出力してください。',
    messages: [{ role: 'user', content: prompt }],
  })

  return extractJsonObject(getText(response)) as RecipeResult | null
}

export async function generateRecipeFromConcept(
  apiKey: string,
  concept: string,
  estimatedIngredients: string[],
): Promise<RecipeResult> {
  const result = await callRecipeLLM(apiKey, concept, estimatedIngredients)
  if (!result) throw new Error('レシピの生成に失敗しました')
  return result
}

export async function generateSuggestedRecipes(
  apiKey: string,
  foodNames: string[],
  count: number,
): Promise<RecipeResult[]> {
  const results: RecipeResult[] = []
  for (let i = 0; i < count; i++) {
    const concept = i === 0 ? foodNames.join('・') : `${foodNames.join('・')} アレンジ${i}`
    const result = await callRecipeLLM(apiKey, concept, foodNames)
    if (result) results.push(result)
  }
  return results
}
