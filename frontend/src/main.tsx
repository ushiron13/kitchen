import { StrictMode, useState, useEffect, useCallback } from 'react'
import { createRoot } from 'react-dom/client'

const API_KEY_STORAGE = 'kitchen_api_key'

// ---- Types ----
interface Food {
  id: number
  name: string
  category: string
  default_shelf_days: number | null
}

interface StockItem {
  id: number
  food_id: number
  food_name: string
  food_category: string
  quantity: number
  unit: string
  expiry_date: string | null
  opened: boolean
  location: string | null
}

interface Meal {
  id: number
  meal_plan_id: number
  recipe_id: number | null
  served_date: string
  meal_type: string
  status: string
  concept: string | null
  estimated_ingredients: string[]
  cook_time_min_estimate: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface MealPlan {
  id: number
  start_date: string
  end_date: string
  status: string
  notes: string | null
  meals: Meal[]
  created_at: string
  updated_at: string
}

interface RecipeIngredient {
  id: number
  food_id: number | null
  raw_name: string | null
  quantity: number | null
  unit: string | null
  is_main: boolean
  notes: string | null
}

interface Recipe {
  id: number
  name: string
  instructions_md: string
  cook_time_min: number | null
  cost_estimate: string | null
  is_favorite: boolean
  reuse_count: number
  ingredients: RecipeIngredient[]
  created_at: string
  updated_at: string
}

interface ShoppingItem {
  name: string
  in_stock: boolean
  stock_quantity: number | null
  stock_unit: string | null
}

interface ShoppingList {
  meal_plan_id: number
  items: ShoppingItem[]
}

const CATEGORY_LABELS: Record<string, string> = {
  refrigerated: '冷蔵',
  frozen: '冷凍',
  pantry: '常温',
  ambient: '常温（長期）',
  seasoning: '調味料',
}

const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: '朝食',
  lunch: '昼食',
  dinner: '夕食',
  snack: 'おやつ',
}

// ---- API helpers ----
function makeApi(apiKey: string) {
  const headers = { 'X-API-Key': apiKey, 'Content-Type': 'application/json' }

  async function req<T>(url: string, init?: RequestInit): Promise<T> {
    const r = await fetch(url, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } })
    if (!r.ok) throw new Error(await r.text())
    return r.json()
  }

  return {
    // Stock
    getFoods: () => req<Food[]>('/api/v1/foods'),
    createFood: (p: { name: string; category: string; default_shelf_days?: number }) =>
      req<Food>('/api/v1/foods', { method: 'POST', body: JSON.stringify(p) }),
    getStock: () => req<StockItem[]>('/api/v1/stock'),
    createStock: (p: { food_id: number; quantity: number; unit: string; expiry_date?: string }) =>
      req<StockItem>('/api/v1/stock', { method: 'POST', body: JSON.stringify(p) }),
    consumeStock: (itemId: number, delta: number) =>
      req<StockItem>(`/api/v1/stock/${itemId}/transactions`, {
        method: 'POST',
        body: JSON.stringify({ tx_type: 'consume', quantity_delta: -Math.abs(delta) }),
      }),
    deleteStock: (itemId: number) =>
      fetch(`/api/v1/stock/${itemId}`, { method: 'DELETE', headers }).then(r => { if (!r.ok) throw new Error() }),

    // Meal Plans
    createMealPlan: (p: { start_date: string; days: number; meal_types: string[]; preferences?: string }) =>
      req<MealPlan>('/api/v1/meal-plans', { method: 'POST', body: JSON.stringify(p) }),
    getMealPlans: () => req<MealPlan[]>('/api/v1/meal-plans'),
    getMealPlan: (id: number) => req<MealPlan>(`/api/v1/meal-plans/${id}`),
    getShoppingList: (planId: number) => req<ShoppingList>(`/api/v1/meal-plans/${planId}/shopping-list`),

    // Recipes
    generateRecipe: (mealId: number) =>
      req<Recipe>(`/api/v1/meals/${mealId}/recipe`, { method: 'POST' }),
    getRecipe: (id: number) => req<Recipe>(`/api/v1/recipes/${id}`),
    listRecipes: (q?: string, foodName?: string) => {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (foodName) params.set('food_name', foodName)
      return req<Recipe[]>(`/api/v1/recipes?${params}`)
    },
    suggestRecipes: (foodNames: string[], count = 1) =>
      req<Recipe[]>('/api/v1/recipes/suggest', {
        method: 'POST',
        body: JSON.stringify({ food_names: foodNames, count }),
      }),
  }
}

type Api = ReturnType<typeof makeApi>

// ---- Styles ----
const S = {
  card: { background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: '12px 16px', marginBottom: 8 } as React.CSSProperties,
  label: { fontSize: 11, color: '#888', marginBottom: 2 } as React.CSSProperties,
  input: { border: '1px solid #ccc', borderRadius: 4, padding: '6px 8px', width: '100%', boxSizing: 'border-box' as const, fontSize: 14 },
  btn: (color = '#1976d2') => ({
    background: color, color: '#fff', border: 'none', borderRadius: 4,
    padding: '7px 14px', cursor: 'pointer', fontSize: 13,
  } as React.CSSProperties),
  badge: (cat: string) => {
    const colors: Record<string, string> = {
      refrigerated: '#e3f2fd', frozen: '#e8eaf6', pantry: '#fff8e1',
      ambient: '#f3e5f5', seasoning: '#e8f5e9',
    }
    return { background: colors[cat] ?? '#f5f5f5', borderRadius: 4, padding: '2px 6px', fontSize: 11, marginLeft: 6 } as React.CSSProperties
  },
}

// ---- Stock Components ----
function AddFoodModal({ api, onClose, onCreated }: { api: Api; onClose: () => void; onCreated: (f: Food) => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('refrigerated')
  const [shelfDays, setShelfDays] = useState('')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const food = await api.createFood({ name, category, ...(shelfDays ? { default_shelf_days: Number(shelfDays) } : {}) })
      onCreated(food)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '登録失敗')
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: 320 }}>
        <h3 style={{ margin: '0 0 16px' }}>食材マスター登録</h3>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><div style={S.label}>食材名</div><input style={S.input} value={name} onChange={e => setName(e.target.value)} required /></div>
          <div>
            <div style={S.label}>カテゴリ</div>
            <select style={S.input} value={category} onChange={e => setCategory(e.target.value)}>
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div><div style={S.label}>デフォルト保存日数（任意）</div><input style={S.input} type="number" min={1} value={shelfDays} onChange={e => setShelfDays(e.target.value)} /></div>
          {error && <div style={{ color: 'red', fontSize: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={S.btn('#888')}>キャンセル</button>
            <button type="submit" style={S.btn()}>登録</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AddStockModal({ api, foods, onClose, onCreated }: { api: Api; foods: Food[]; onClose: () => void; onCreated: () => void }) {
  const [foodId, setFoodId] = useState(foods[0]?.id?.toString() ?? '')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('個')
  const [expiry, setExpiry] = useState('')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.createStock({ food_id: Number(foodId), quantity: Number(quantity), unit, ...(expiry ? { expiry_date: expiry } : {}) })
      onCreated()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '登録失敗')
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: 320 }}>
        <h3 style={{ margin: '0 0 16px' }}>在庫追加</h3>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={S.label}>食材</div>
            <select style={S.input} value={foodId} onChange={e => setFoodId(e.target.value)} required>
              {foods.map(f => <option key={f.id} value={f.id}>{f.name}（{CATEGORY_LABELS[f.category]}）</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 2 }}><div style={S.label}>数量</div><input style={S.input} type="number" min={0.01} step={0.01} value={quantity} onChange={e => setQuantity(e.target.value)} required /></div>
            <div style={{ flex: 1 }}><div style={S.label}>単位</div><input style={S.input} value={unit} onChange={e => setUnit(e.target.value)} required /></div>
          </div>
          <div><div style={S.label}>消費期限（任意）</div><input style={S.input} type="date" value={expiry} onChange={e => setExpiry(e.target.value)} /></div>
          {error && <div style={{ color: 'red', fontSize: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={S.btn('#888')}>キャンセル</button>
            <button type="submit" style={S.btn()}>追加</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function StockPage({ api }: { api: Api }) {
  const [stock, setStock] = useState<StockItem[]>([])
  const [foods, setFoods] = useState<Food[]>([])
  const [modal, setModal] = useState<'food' | 'stock' | null>(null)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    try {
      const [s, f] = await Promise.all([api.getStock(), api.getFoods()])
      setStock(s); setFoods(f)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : '読み込み失敗') }
  }, [api])

  useEffect(() => { reload() }, [reload])

  async function consume(item: StockItem) {
    const input = prompt(`消費数量を入力 (現在: ${item.quantity} ${item.unit})`)
    if (!input) return
    const delta = parseFloat(input)
    if (isNaN(delta) || delta <= 0) return
    try { await api.consumeStock(item.id, delta); reload() }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'エラー') }
  }

  async function remove(item: StockItem) {
    if (!confirm(`「${item.food_name}」を在庫から削除しますか？`)) return
    await api.deleteStock(item.id); reload()
  }

  const today = new Date().toISOString().slice(0, 10)
  const warnDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  const expiringSoon = stock.filter(s => s.expiry_date && s.expiry_date <= warnDate)

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 12px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>在庫管理</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={S.btn('#555')} onClick={() => setModal('food')}>+ 食材登録</button>
          <button style={S.btn()} onClick={() => setModal('stock')} disabled={foods.length === 0}>+ 在庫追加</button>
        </div>
      </div>
      {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
      {expiringSoon.length > 0 && (
        <div style={{ background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>
          ⚠ 期限切れ間近: {expiringSoon.map(s => s.food_name).join('、')}
        </div>
      )}
      {stock.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>在庫がありません</div>
      ) : (
        stock.map(item => (
          <div key={item.id} style={{ ...S.card, opacity: item.expiry_date && item.expiry_date < today ? 0.6 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontWeight: 600 }}>{item.food_name}</span>
                <span style={S.badge(item.food_category)}>{CATEGORY_LABELS[item.food_category] ?? item.food_category}</span>
                {item.opened && <span style={{ ...S.badge('seasoning'), marginLeft: 4 }}>開封済</span>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={S.btn('#43a047')} onClick={() => consume(item)}>消費</button>
                <button style={S.btn('#e53935')} onClick={() => remove(item)}>削除</button>
              </div>
            </div>
            <div style={{ marginTop: 4, fontSize: 13, color: '#555' }}>
              {item.quantity} {item.unit}
              {item.expiry_date && (
                <span style={{ marginLeft: 12, color: item.expiry_date < today ? '#e53935' : item.expiry_date <= warnDate ? '#fb8c00' : '#888' }}>
                  期限: {item.expiry_date}
                </span>
              )}
              {item.location && <span style={{ marginLeft: 12, color: '#888' }}>{item.location}</span>}
            </div>
          </div>
        ))
      )}
      {modal === 'food' && <AddFoodModal api={api} onClose={() => setModal(null)} onCreated={() => { reload(); setModal(null) }} />}
      {modal === 'stock' && <AddStockModal api={api} foods={foods} onClose={() => setModal(null)} onCreated={() => { reload(); setModal(null) }} />}
    </div>
  )
}

// ---- Recipe Modal ----
function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let listBuf: string[] = []
  let listType: 'ul' | 'ol' | null = null

  function flushList() {
    if (listBuf.length === 0) return
    const Tag = listType!
    elements.push(
      <Tag key={elements.length} style={{ margin: '4px 0 4px 20px', padding: 0 }}>
        {listBuf.map((t, i) => <li key={i} style={{ marginBottom: 2 }}>{t}</li>)}
      </Tag>
    )
    listBuf = []; listType = null
  }

  for (const line of lines) {
    if (/^#{1,3}\s/.test(line)) {
      flushList()
      elements.push(<h4 key={elements.length} style={{ margin: '10px 0 4px', fontSize: 14 }}>{line.replace(/^#+\s/, '')}</h4>)
    } else if (/^\d+\.\s/.test(line)) {
      if (listType === 'ul') flushList()
      listType = 'ol'
      listBuf.push(line.replace(/^\d+\.\s/, ''))
    } else if (/^[-*]\s/.test(line)) {
      if (listType === 'ol') flushList()
      listType = 'ul'
      listBuf.push(line.replace(/^[-*]\s/, ''))
    } else {
      flushList()
      if (line.trim()) elements.push(<p key={elements.length} style={{ margin: '4px 0', fontSize: 13 }}>{line}</p>)
    }
  }
  flushList()
  return <div>{elements}</div>
}

function RecipeModal({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const mains = recipe.ingredients.filter(i => i.is_main)
  const subs = recipe.ingredients.filter(i => !i.is_main)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, overflowY: 'auto', padding: '20px 12px' }}>
      <div style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 560, padding: 24, position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>✕</button>
        <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>{recipe.name}</h2>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#666', marginBottom: 16 }}>
          {recipe.cook_time_min && <span>⏱ {recipe.cook_time_min}分</span>}
          {recipe.cost_estimate && <span>💴 {recipe.cost_estimate}</span>}
          {recipe.reuse_count > 0 && <span>♻️ 再利用 {recipe.reuse_count}回</span>}
        </div>
        {recipe.ingredients.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>材料</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {mains.map(i => (
                <span key={i.id} style={{ background: '#e3f2fd', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>
                  {i.raw_name}{i.quantity ? ` ${i.quantity}${i.unit ?? ''}` : ''}
                </span>
              ))}
              {subs.map(i => (
                <span key={i.id} style={{ background: '#f5f5f5', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>
                  {i.raw_name}{i.quantity ? ` ${i.quantity}${i.unit ?? ''}` : ''}
                </span>
              ))}
            </div>
          </div>
        )}
        <div style={{ borderTop: '1px solid #eee', paddingTop: 12 }}>
          <SimpleMarkdown text={recipe.instructions_md} />
        </div>
      </div>
    </div>
  )
}

// ---- Meal Plan Page ----
function CreatePlanForm({ api, onCreated }: { api: Api; onCreated: (p: MealPlan) => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [startDate, setStartDate] = useState(today)
  const [days, setDays] = useState(7)
  const [mealTypes, setMealTypes] = useState(['dinner'])
  const [preferences, setPreferences] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const allTypes = ['breakfast', 'lunch', 'dinner', 'snack']

  function toggleType(t: string) {
    setMealTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (mealTypes.length === 0) { setError('食事区分を選択してください'); return }
    setLoading(true); setError('')
    try {
      const plan = await api.createMealPlan({ start_date: startDate, days, meal_types: mealTypes, preferences: preferences || undefined })
      onCreated(plan)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '生成失敗')
    } finally { setLoading(false) }
  }

  return (
    <form onSubmit={submit} style={{ ...S.card, marginBottom: 16 }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>新しい献立プランを作成</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ flex: '1 1 140px' }}>
          <div style={S.label}>開始日</div>
          <input style={S.input} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
        </div>
        <div style={{ flex: '0 0 80px' }}>
          <div style={S.label}>日数</div>
          <input style={S.input} type="number" min={1} max={14} value={days} onChange={e => setDays(Number(e.target.value))} />
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={S.label}>食事区分</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          {allTypes.map(t => (
            <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={mealTypes.includes(t)} onChange={() => toggleType(t)} />
              {MEAL_TYPE_LABELS[t]}
            </label>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={S.label}>要望（任意）</div>
        <input style={S.input} placeholder="例: 和食多め、30分以内" value={preferences} onChange={e => setPreferences(e.target.value)} maxLength={500} />
      </div>
      {error && <div style={{ color: 'red', fontSize: 12, marginBottom: 8 }}>{error}</div>}
      <button type="submit" style={S.btn()} disabled={loading}>
        {loading ? '生成中…（最大30秒）' : 'AIで献立を生成'}
      </button>
    </form>
  )
}

function MealCard({ meal, api }: { meal: Meal; api: Api }) {
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadRecipe() {
    if (meal.recipe_id && !recipe) {
      try { setRecipe(await api.getRecipe(meal.recipe_id)) } catch { /* ignore */ }
    }
  }

  useEffect(() => { loadRecipe() }, [meal.recipe_id])

  async function generate() {
    setLoading(true); setError('')
    try {
      const r = await api.generateRecipe(meal.id)
      setRecipe(r)
    } catch (err: unknown) { setError(err instanceof Error ? err.message : '生成失敗') }
    finally { setLoading(false) }
  }

  return (
    <>
      <div style={{ background: '#fafafa', border: '1px solid #e8e8e8', borderRadius: 6, padding: '8px 12px', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 2 }}>{MEAL_TYPE_LABELS[meal.meal_type] ?? meal.meal_type}</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{meal.concept ?? '（未設定）'}</div>
            {meal.estimated_ingredients && meal.estimated_ingredients.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {meal.estimated_ingredients.map((ing, i) => (
                  <span key={i} style={{ background: '#e8f5e9', borderRadius: 3, padding: '1px 5px', fontSize: 11 }}>{ing}</span>
                ))}
              </div>
            )}
            {meal.cook_time_min_estimate && (
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>⏱ 約{meal.cook_time_min_estimate}分</div>
            )}
            {error && <div style={{ color: 'red', fontSize: 11, marginTop: 4 }}>{error}</div>}
          </div>
          <div>
            {recipe ? (
              <button style={{ ...S.btn('#1565c0'), fontSize: 12, padding: '5px 10px' }} onClick={() => setRecipe(recipe)}>
                レシピ詳細
              </button>
            ) : (
              <button style={{ ...S.btn('#388e3c'), fontSize: 12, padding: '5px 10px' }} onClick={generate} disabled={loading}>
                {loading ? '生成中…' : 'レシピ生成'}
              </button>
            )}
          </div>
        </div>
      </div>
      {recipe && <RecipeModal recipe={recipe} onClose={() => setRecipe(null)} />}
    </>
  )
}

function MealPlanPage({ api }: { api: Api }) {
  const [plans, setPlans] = useState<MealPlan[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    try {
      const ps = await api.getMealPlans()
      setPlans(ps)
      if (ps.length > 0 && selectedId === null) setSelectedId(ps[0].id)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : '読み込み失敗') }
  }, [api, selectedId])

  useEffect(() => { reload() }, [reload])

  const selected = plans.find(p => p.id === selectedId)

  function groupByDate(meals: Meal[]): Record<string, Meal[]> {
    const map: Record<string, Meal[]> = {}
    for (const m of meals) {
      if (!map[m.served_date]) map[m.served_date] = []
      map[m.served_date].push(m)
    }
    return map
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 12px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>献立プラン</h2>
        <button style={S.btn(showForm ? '#888' : '#1976d2')} onClick={() => setShowForm(v => !v)}>
          {showForm ? '閉じる' : '+ 新規作成'}
        </button>
      </div>
      {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
      {showForm && (
        <CreatePlanForm
          api={api}
          onCreated={plan => {
            setPlans(prev => [plan, ...prev])
            setSelectedId(plan.id)
            setShowForm(false)
          }}
        />
      )}
      {plans.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>献立プランがありません</div>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <div style={S.label}>プランを選択</div>
            <select
              style={S.input}
              value={selectedId ?? ''}
              onChange={e => setSelectedId(Number(e.target.value))}
            >
              {plans.map(p => (
                <option key={p.id} value={p.id}>
                  {p.start_date} 〜 {p.end_date}（{p.meals.length}食）
                </option>
              ))}
            </select>
          </div>
          {selected && (() => {
            const byDate = groupByDate(selected.meals)
            const dates = Object.keys(byDate).sort()
            return (
              <div>
                {dates.map(date => (
                  <div key={date} style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#555', borderBottom: '1px solid #eee', paddingBottom: 4, marginBottom: 8 }}>
                      {date}（{['日', '月', '火', '水', '木', '金', '土'][new Date(date + 'T00:00:00').getDay()]}）
                    </div>
                    {byDate[date].map(meal => (
                      <MealCard key={meal.id} meal={meal} api={api} />
                    ))}
                  </div>
                ))}
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}

// ---- Shopping Page ----
function ShoppingPage({ api }: { api: Api }) {
  const [plans, setPlans] = useState<MealPlan[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [list, setList] = useState<ShoppingList | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getMealPlans().then(ps => {
      setPlans(ps)
      if (ps.length > 0) setSelectedId(ps[0].id)
    }).catch(() => {})
  }, [api])

  useEffect(() => {
    if (selectedId === null) return
    setLoading(true)
    api.getShoppingList(selectedId)
      .then(l => { setList(l); setError('') })
      .catch(e => setError(e instanceof Error ? e.message : '読み込み失敗'))
      .finally(() => setLoading(false))
  }, [selectedId, api])

  const needed = list?.items.filter(i => !i.in_stock) ?? []
  const have = list?.items.filter(i => i.in_stock) ?? []

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 12px', fontFamily: 'sans-serif' }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 20 }}>買い物リスト</h2>
      {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
      {plans.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>献立プランを先に作成してください</div>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <div style={S.label}>プランを選択</div>
            <select style={S.input} value={selectedId ?? ''} onChange={e => setSelectedId(Number(e.target.value))}>
              {plans.map(p => (
                <option key={p.id} value={p.id}>{p.start_date} 〜 {p.end_date}</option>
              ))}
            </select>
          </div>
          {loading && <div style={{ textAlign: 'center', color: '#888', padding: 20 }}>読み込み中…</div>}
          {!loading && list && (
            <>
              {needed.length === 0 ? (
                <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: 8, padding: '10px 16px', fontSize: 13, marginBottom: 12 }}>
                  在庫不足の食材はありません
                </div>
              ) : (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, color: '#c62828' }}>
                    購入が必要な食材（{needed.length}件）
                  </div>
                  {needed.map(item => (
                    <div key={item.name} style={{ ...S.card, borderLeft: '3px solid #ef5350', marginBottom: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600 }}>{item.name}</span>
                        <span style={{ background: '#ffebee', color: '#c62828', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}>在庫なし</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {have.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, color: '#2e7d32' }}>
                    在庫あり（{have.length}件）
                  </div>
                  {have.map(item => (
                    <div key={item.name} style={{ ...S.card, borderLeft: '3px solid #66bb6a', marginBottom: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{item.name}</span>
                        <span style={{ background: '#e8f5e9', color: '#2e7d32', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}>
                          {item.stock_quantity} {item.stock_unit}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

// ---- Navigation ----
type Page = 'stock' | 'meal' | 'shopping'

function BottomNav({ page, setPage }: { page: Page; setPage: (p: Page) => void }) {
  const tabs: { id: Page; label: string; icon: string }[] = [
    { id: 'stock', label: '在庫', icon: '🥕' },
    { id: 'meal', label: '献立', icon: '🍽' },
    { id: 'shopping', label: '買い物', icon: '🛒' },
  ]
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: '#fff', borderTop: '1px solid #e0e0e0',
      display: 'flex', height: 56, zIndex: 50,
    }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => setPage(t.id)}
          style={{
            flex: 1, background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 2, fontSize: 10, color: page === t.id ? '#1976d2' : '#888',
            fontWeight: page === t.id ? 600 : 400,
          }}
        >
          <span style={{ fontSize: 20 }}>{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  )
}

// ---- Login ----
function LoginForm({ onLogin }: { onLogin: (key: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ marginBottom: 8 }}>Kitchen Manager</h1>
        <p style={{ color: '#666', marginBottom: 20 }}>APIキーを入力してください</p>
        <form onSubmit={e => {
          e.preventDefault()
          const key = (e.currentTarget.elements.namedItem('key') as HTMLInputElement).value.trim()
          if (key) { localStorage.setItem(API_KEY_STORAGE, key); onLogin(key) }
        }} style={{ display: 'flex', gap: 8 }}>
          <input name="key" type="password" placeholder="X-API-Key" style={{ ...S.input, width: 260 }} />
          <button type="submit" style={S.btn()}>ログイン</button>
        </form>
      </div>
    </div>
  )
}

// ---- App ----
function App() {
  const [apiKey, setApiKey] = useState<string | null>(() => localStorage.getItem(API_KEY_STORAGE))
  const [page, setPage] = useState<Page>('stock')

  if (!apiKey) return <LoginForm onLogin={setApiKey} />

  const api = makeApi(apiKey)
  return (
    <div style={{ paddingBottom: 56 }}>
      {page === 'stock' && <StockPage api={api} />}
      {page === 'meal' && <MealPlanPage api={api} />}
      {page === 'shopping' && <ShoppingPage api={api} />}
      <BottomNav page={page} setPage={setPage} />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
