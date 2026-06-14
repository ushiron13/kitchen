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
  default_shelf_days: number | null
  quantity: number
  unit: string
  expiry_date: string | null
  purchased_date: string | null
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

interface UserProfile {
  family_composition: string | null
  food_preferences: string | null
  allergies: string | null
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
    updateFood: (id: number, p: { name?: string; category?: string; default_shelf_days?: number | null }) =>
      req<Food>(`/api/v1/foods/${id}`, { method: 'PATCH', body: JSON.stringify(p) }),
    deleteFood: (id: number) =>
      fetch(`/api/v1/foods/${id}`, { method: 'DELETE', headers }).then(async r => {
        if (!r.ok) {
          try { const b = await r.json(); throw new Error(b.detail ?? '削除失敗') }
          catch (e) { if (e instanceof Error) throw e; throw new Error('削除失敗') }
        }
      }),
    getStock: () => req<StockItem[]>('/api/v1/stock'),
    createStock: (p: { food_id: number; quantity: number; unit: string; expiry_date?: string; purchased_date?: string; category?: string }) =>
      req<StockItem>('/api/v1/stock', { method: 'POST', body: JSON.stringify(p) }),
    updateStock: (id: number, p: { quantity?: number; unit?: string; expiry_date?: string | null; purchased_date?: string | null; category?: string | null }) =>
      req<StockItem>(`/api/v1/stock/${id}`, { method: 'PATCH', body: JSON.stringify(p) }),
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
    deleteMealPlan: (planId: number) =>
      fetch(`/api/v1/meal-plans/${planId}`, { method: 'DELETE', headers }).then(r => { if (!r.ok) throw new Error() }),
    deleteMeal: (mealId: number) =>
      fetch(`/api/v1/meals/${mealId}`, { method: 'DELETE', headers }).then(r => { if (!r.ok) throw new Error() }),
    updateMealStatus: (mealId: number, s: 'planned' | 'cooked' | 'skipped') =>
      fetch(`/api/v1/meals/${mealId}/status`, { method: 'PATCH', headers, body: JSON.stringify({ status: s }) })
        .then(r => { if (!r.ok) throw new Error() }),
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

    // Profile
    getProfile: () => req<UserProfile>('/api/v1/profile'),
    updateProfile: (p: { family_composition?: string | null; food_preferences?: string | null; allergies?: string | null }) =>
      req<UserProfile>('/api/v1/profile', { method: 'PUT', body: JSON.stringify(p) }),
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
function EditFoodModal({ api, food, onClose, onUpdated }: { api: Api; food: Food; onClose: () => void; onUpdated: (f: Food) => void }) {
  const [name, setName] = useState(food.name)
  const [category, setCategory] = useState(food.category)
  const [shelfDays, setShelfDays] = useState(food.default_shelf_days?.toString() ?? '')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const updated = await api.updateFood(food.id, {
        name,
        category,
        default_shelf_days: shelfDays ? Number(shelfDays) : null,
      })
      onUpdated(updated)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '更新失敗')
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: 320 }}>
        <h3 style={{ margin: '0 0 16px' }}>食材マスター編集</h3>
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
            <button type="submit" style={S.btn()}>保存</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditStockModal({ api, item, onClose, onUpdated }: { api: Api; item: StockItem; onClose: () => void; onUpdated: () => void }) {
  const [quantity, setQuantity] = useState(item.quantity.toString())
  const [unit, setUnit] = useState(item.unit)
  const [expiry, setExpiry] = useState(item.expiry_date ?? '')
  const [purchased, setPurchased] = useState(item.purchased_date ?? '')
  const [category, setCategory] = useState(item.food_category ?? '')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.updateStock(item.id, {
        quantity: Number(quantity),
        unit,
        expiry_date: expiry || null,
        purchased_date: purchased || null,
        category: category || null,
      })
      onUpdated()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '更新失敗')
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: 320 }}>
        <h3 style={{ margin: '0 0 4px' }}>在庫編集</h3>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>{item.food_name}</div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 2 }}><div style={S.label}>数量</div><input style={S.input} type="number" min={0} step={0.01} value={quantity} onChange={e => setQuantity(e.target.value)} required /></div>
            <div style={{ flex: 1 }}><div style={S.label}>単位</div><input style={S.input} value={unit} onChange={e => setUnit(e.target.value)} required /></div>
          </div>
          <div>
            <div style={S.label}>保管場所</div>
            <select style={S.input} value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">── デフォルト ──</option>
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div><div style={S.label}>購入日（任意）</div><input style={S.input} type="date" value={purchased} onChange={e => setPurchased(e.target.value)} /></div>
          <div><div style={S.label}>消費期限（任意）</div><input style={S.input} type="date" value={expiry} onChange={e => setExpiry(e.target.value)} /></div>
          {error && <div style={{ color: 'red', fontSize: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={S.btn('#888')}>キャンセル</button>
            <button type="submit" style={S.btn()}>保存</button>
          </div>
        </form>
      </div>
    </div>
  )
}

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
  const today = new Date().toISOString().slice(0, 10)
  const [foodName, setFoodName] = useState('')
  const [category, setCategory] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('個')
  const [purchased, setPurchased] = useState(today)
  const [expiry, setExpiry] = useState('')
  const [error, setError] = useState('')

  const selectedFood = foods.find(f => f.name === foodName)

  useEffect(() => {
    if (selectedFood) setCategory(selectedFood.category)
  }, [selectedFood])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedFood) { setError('食材名を正確に入力してください'); return }
    try {
      await api.createStock({
        food_id: selectedFood.id,
        quantity: Number(quantity),
        unit,
        ...(purchased ? { purchased_date: purchased } : {}),
        ...(expiry ? { expiry_date: expiry } : {}),
        ...(category ? { category } : {}),
      })
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
            <div style={S.label}>食材（入力で絞り込み）</div>
            <input
              style={S.input}
              list="food-datalist-add"
              value={foodName}
              onChange={e => setFoodName(e.target.value)}
              placeholder="例: 豚バラ肉"
              required
            />
            <datalist id="food-datalist-add">
              {foods.map(f => <option key={f.id} value={f.name} />)}
            </datalist>
          </div>
          <div>
            <div style={S.label}>保管場所（食材デフォルトを上書き可）</div>
            <select style={S.input} value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">── デフォルト ──</option>
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 2 }}><div style={S.label}>数量</div><input style={S.input} type="number" min={0.01} step={0.01} value={quantity} onChange={e => setQuantity(e.target.value)} required /></div>
            <div style={{ flex: 1 }}><div style={S.label}>単位</div><input style={S.input} value={unit} onChange={e => setUnit(e.target.value)} required /></div>
          </div>
          <div><div style={S.label}>購入日（任意）</div><input style={S.input} type="date" value={purchased} onChange={e => setPurchased(e.target.value)} /></div>
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
  const [editFood, setEditFood] = useState<Food | null>(null)
  const [editStock, setEditStock] = useState<StockItem | null>(null)
  const [showFoods, setShowFoods] = useState(false)
  const [foodError, setFoodError] = useState<Record<number, string>>({})
  const [filterCat, setFilterCat] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'expiry' | 'name'>('expiry')
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

  async function removeStock(item: StockItem) {
    if (!confirm(`「${item.food_name}」を在庫から削除しますか？`)) return
    await api.deleteStock(item.id); reload()
  }

  async function removeFood(food: Food) {
    if (!confirm(`「${food.name}」を食材マスターから削除しますか？`)) return
    try {
      await api.deleteFood(food.id)
      setFoods(prev => prev.filter(f => f.id !== food.id))
      setFoodError(prev => { const n = { ...prev }; delete n[food.id]; return n })
    } catch (e: unknown) {
      setFoodError(prev => ({ ...prev, [food.id]: e instanceof Error ? e.message : '削除失敗' }))
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const warnDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)

  function getShelfDeadline(item: StockItem): string | null {
    if (item.expiry_date) return item.expiry_date
    if (item.purchased_date && item.default_shelf_days) {
      const d = new Date(item.purchased_date + 'T00:00:00')
      d.setDate(d.getDate() + item.default_shelf_days)
      return d.toISOString().slice(0, 10)
    }
    return null
  }

  function getDaysLeft(deadline: string): number {
    const diff = new Date(deadline + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()
    return Math.ceil(diff / 86400000)
  }

  const expiringSoon = stock.filter(s => {
    const dl = getShelfDeadline(s)
    return dl && dl <= warnDate
  })

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 12px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>在庫管理</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={S.btn('#555')} onClick={() => setModal('food')}>+ 食材登録</button>
          <button style={S.btn('#78909c')} onClick={() => setShowFoods(v => !v)}>食材一覧{showFoods ? ' ▲' : ' ▼'}</button>
          <button style={S.btn()} onClick={() => setModal('stock')} disabled={foods.length === 0}>+ 在庫追加</button>
        </div>
      </div>

      {showFoods && (
        <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: '8px 12px', marginBottom: 16, background: '#fafafa' }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#555', marginBottom: 8 }}>食材マスター（{foods.length}件）</div>
          {foods.length === 0 ? (
            <div style={{ color: '#aaa', fontSize: 13 }}>食材が登録されていません</div>
          ) : (
            foods.map(food => (
              <div key={food.id}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <div>
                    <span style={{ fontSize: 13 }}>{food.name}</span>
                    <span style={S.badge(food.category)}>{CATEGORY_LABELS[food.category] ?? food.category}</span>
                    {food.default_shelf_days && <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>{food.default_shelf_days}日</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button style={{ ...S.btn('#1976d2'), fontSize: 11, padding: '3px 8px' }} onClick={() => setEditFood(food)}>編集</button>
                    <button style={{ ...S.btn('#e53935'), fontSize: 11, padding: '3px 8px' }} onClick={() => removeFood(food)}>削除</button>
                  </div>
                </div>
                {foodError[food.id] && <div style={{ color: '#e53935', fontSize: 11, padding: '2px 0 4px' }}>{foodError[food.id]}</div>}
              </div>
            ))
          )}
        </div>
      )}

      {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
      {expiringSoon.length > 0 && (
        <div style={{ background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>
          ⚠ 期限切れ間近: {expiringSoon.map(s => s.food_name).join('、')}
        </div>
      )}
      {stock.length > 0 && (() => {
        const usedCats = [...new Set(stock.map(s => s.food_category))]
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            <button
              onClick={() => setFilterCat(null)}
              style={{ padding: '4px 10px', borderRadius: 12, fontSize: 12, border: 'none', cursor: 'pointer', background: filterCat === null ? '#1976d2' : '#f0f0f0', color: filterCat === null ? '#fff' : '#555' }}
            >すべて</button>
            {Object.entries(CATEGORY_LABELS)
              .filter(([v]) => usedCats.includes(v))
              .map(([v, l]) => (
                <button key={v}
                  onClick={() => setFilterCat(v === filterCat ? null : v)}
                  style={{ padding: '4px 10px', borderRadius: 12, fontSize: 12, border: 'none', cursor: 'pointer', background: filterCat === v ? '#1976d2' : '#f0f0f0', color: filterCat === v ? '#fff' : '#555' }}
                >{l}</button>
              ))
            }
            <button
              onClick={() => setSortBy(s => s === 'expiry' ? 'name' : 'expiry')}
              style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 12, fontSize: 12, border: '1px solid #ccc', cursor: 'pointer', background: '#fff', color: '#555' }}
            >{sortBy === 'expiry' ? '期限順' : '名前順'}</button>
          </div>
        )
      })()}

      {(() => {
        const filtered = stock
          .filter(s => !filterCat || s.food_category === filterCat)
          .sort((a, b) => {
            if (sortBy === 'name') return a.food_name.localeCompare(b.food_name, 'ja')
            if (!a.expiry_date && !b.expiry_date) return 0
            if (!a.expiry_date) return 1
            if (!b.expiry_date) return -1
            return a.expiry_date.localeCompare(b.expiry_date)
          })
        return filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>
            {filterCat ? `「${CATEGORY_LABELS[filterCat]}」の在庫がありません` : '在庫がありません'}
          </div>
        ) : filtered.map(item => {
            const deadline = getShelfDeadline(item)
            const daysLeft = deadline ? getDaysLeft(deadline) : null
            const isExpired = daysLeft !== null && daysLeft < 0
            const isWarn = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3
            return (
              <div key={item.id} style={{ ...S.card, opacity: isExpired ? 0.6 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{item.food_name}</span>
                    <span style={S.badge(item.food_category)}>{CATEGORY_LABELS[item.food_category] ?? item.food_category}</span>
                    {item.opened && <span style={{ ...S.badge('seasoning'), marginLeft: 4 }}>開封済</span>}
                    {daysLeft !== null && (
                      <span style={{
                        marginLeft: 6, fontSize: 11, fontWeight: 600,
                        color: isExpired ? '#e53935' : isWarn ? '#fb8c00' : '#888',
                      }}>
                        {isExpired ? `期限切れ(${Math.abs(daysLeft)}日前)` : daysLeft === 0 ? '今日まで' : `あと${daysLeft}日`}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={S.btn('#43a047')} onClick={() => consume(item)}>消費</button>
                    <button style={S.btn('#1565c0')} onClick={() => setEditStock(item)}>編集</button>
                    <button style={S.btn('#e53935')} onClick={() => removeStock(item)}>削除</button>
                  </div>
                </div>
                <div style={{ marginTop: 4, fontSize: 13, color: '#555' }}>
                  {item.quantity} {item.unit}
                  {item.expiry_date && (
                    <span style={{ marginLeft: 12, color: isExpired ? '#e53935' : isWarn ? '#fb8c00' : '#888' }}>
                      期限: {item.expiry_date}
                    </span>
                  )}
                  {!item.expiry_date && item.purchased_date && item.default_shelf_days && (
                    <span style={{ marginLeft: 12, color: '#aaa' }}>
                      購入: {item.purchased_date}（目安{item.default_shelf_days}日）
                    </span>
                  )}
                  {item.location && <span style={{ marginLeft: 12, color: '#888' }}>{item.location}</span>}
                </div>
              </div>
            )
          })
      })()}
      {modal === 'food' && <AddFoodModal api={api} onClose={() => setModal(null)} onCreated={f => { setFoods(prev => [...prev, f]); setModal(null) }} />}
      {modal === 'stock' && <AddStockModal api={api} foods={foods} onClose={() => setModal(null)} onCreated={() => { reload(); setModal(null) }} />}
      {editFood && (
        <EditFoodModal
          api={api}
          food={editFood}
          onClose={() => setEditFood(null)}
          onUpdated={f => { setFoods(prev => prev.map(x => x.id === f.id ? f : x)); setEditFood(null) }}
        />
      )}
      {editStock && (
        <EditStockModal
          api={api}
          item={editStock}
          onClose={() => setEditStock(null)}
          onUpdated={() => { reload(); setEditStock(null) }}
        />
      )}
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

const STATUS_COLORS: Record<string, string> = { planned: '#e0e0e0', cooked: '#4caf50', skipped: '#9e9e9e' }

function MealCard({ meal, api, onDelete }: { meal: Meal; api: Api; onDelete: () => void }) {
  const [loadedRecipe, setLoadedRecipe] = useState<Recipe | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentStatus, setCurrentStatus] = useState(meal.status)

  async function toggleStatus(next: 'cooked' | 'skipped') {
    const newStatus = currentStatus === next ? 'planned' : next
    try {
      await api.updateMealStatus(meal.id, newStatus)
      setCurrentStatus(newStatus)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '更新失敗')
    }
  }

  async function handleDelete() {
    if (!confirm(`「${meal.concept ?? '未設定'}」を削除しますか？`)) return
    try {
      await api.deleteMeal(meal.id)
      onDelete()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '削除失敗')
    }
  }

  // B-01: meal.recipe_id が真のステート。ローカルの recipe 状態に依存しない
  async function openRecipe() {
    if (loadedRecipe) { setShowModal(true); return }
    setLoading(true)
    try {
      const r = await api.getRecipe(meal.recipe_id!)
      setLoadedRecipe(r)
      setShowModal(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '読み込み失敗')
    } finally { setLoading(false) }
  }

  async function generate() {
    setLoading(true); setError('')
    try {
      const r = await api.generateRecipe(meal.id)
      setLoadedRecipe(r)
      setShowModal(true)
    } catch (err: unknown) { setError(err instanceof Error ? err.message : '生成失敗') }
    finally { setLoading(false) }
  }

  return (
    <>
      <div style={{
        background: '#fafafa',
        border: `1px solid ${currentStatus === 'cooked' ? '#a5d6a7' : currentStatus === 'skipped' ? '#e0e0e0' : '#e8e8e8'}`,
        borderRadius: 6, padding: '8px 12px', marginBottom: 6,
        opacity: currentStatus === 'skipped' ? 0.7 : 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 2 }}>{MEAL_TYPE_LABELS[meal.meal_type] ?? meal.meal_type}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{meal.concept ?? '（未設定）'}</span>
              {meal.recipe_id && (
                <span style={{ background: '#e8f5e9', color: '#2e7d32', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>レシピ済</span>
              )}
            </div>
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
            <div style={{ display: 'flex', gap: 5, marginTop: 7, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: '#aaa' }}>実施:</span>
              <button
                style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, border: 'none', cursor: 'pointer', background: currentStatus === 'cooked' ? STATUS_COLORS.cooked : '#f0f0f0', color: currentStatus === 'cooked' ? '#fff' : '#666' }}
                onClick={() => toggleStatus('cooked')} disabled={loading}
              >{currentStatus === 'cooked' ? '✓ 作った' : '作った'}</button>
              <button
                style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, border: 'none', cursor: 'pointer', background: currentStatus === 'skipped' ? STATUS_COLORS.skipped : '#f0f0f0', color: currentStatus === 'skipped' ? '#fff' : '#666' }}
                onClick={() => toggleStatus('skipped')} disabled={loading}
              >{currentStatus === 'skipped' ? '✓ スキップ' : 'スキップ'}</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
            {meal.recipe_id ? (
              <button style={{ ...S.btn('#1565c0'), fontSize: 12, padding: '5px 10px' }} onClick={openRecipe} disabled={loading}>
                {loading ? '読み込み中…' : 'レシピを見る'}
              </button>
            ) : (
              <button style={{ ...S.btn('#388e3c'), fontSize: 12, padding: '5px 10px' }} onClick={generate} disabled={loading}>
                {loading ? '生成中…' : 'レシピを生成する'}
              </button>
            )}
            <button style={{ ...S.btn('#e53935'), fontSize: 11, padding: '3px 8px' }} onClick={handleDelete} disabled={loading}>
              削除
            </button>
          </div>
        </div>
      </div>
      {showModal && loadedRecipe && <RecipeModal recipe={loadedRecipe} onClose={() => setShowModal(false)} />}
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

  async function handleDeletePlan(planId: number) {
    const plan = plans.find(p => p.id === planId)
    if (!plan) return
    if (!confirm(`プラン「${plan.start_date} 〜 ${plan.end_date}」を削除しますか？\n配下の全献立も削除されます。`)) return
    try {
      await api.deleteMealPlan(planId)
      const next = plans.filter(p => p.id !== planId)
      setPlans(next)
      setSelectedId(next.length > 0 ? next[0].id : null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '削除失敗')
    }
  }

  function handleMealDeleted(planId: number, mealId: number) {
    setPlans(prev => prev.map(p =>
      p.id === planId ? { ...p, meals: p.meals.filter(m => m.id !== mealId) } : p
    ))
  }

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
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                style={{ ...S.input, flex: 1 }}
                value={selectedId ?? ''}
                onChange={e => setSelectedId(Number(e.target.value))}
              >
                {plans.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.start_date} 〜 {p.end_date}（{p.meals.length}食）
                  </option>
                ))}
              </select>
              {selectedId !== null && (
                <button
                  style={{ ...S.btn('#e53935'), whiteSpace: 'nowrap', fontSize: 13 }}
                  onClick={() => handleDeletePlan(selectedId)}
                >
                  プラン削除
                </button>
              )}
            </div>
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
                      <MealCard key={meal.id} meal={meal} api={api} onDelete={() => handleMealDeleted(selected.id, meal.id)} />
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

// ---- Profile Page ----
function ProfilePage({ api }: { api: Api }) {
  const [family, setFamily] = useState('')
  const [prefs, setPrefs] = useState('')
  const [allergies, setAllergies] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getProfile()
      .then(p => {
        setFamily(p.family_composition ?? '')
        setPrefs(p.food_preferences ?? '')
        setAllergies(p.allergies ?? '')
        setSavedAt(p.updated_at)
      })
      .catch(e => setError(e instanceof Error ? e.message : '読み込み失敗'))
      .finally(() => setLoading(false))
  }, [api])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const p = await api.updateProfile({
        family_composition: family || null,
        food_preferences: prefs || null,
        allergies: allergies || null,
      })
      setSavedAt(p.updated_at)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存失敗')
    } finally { setSaving(false) }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>読み込み中…</div>

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 12px', fontFamily: 'sans-serif' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>プロファイル設定</h2>
      <p style={{ margin: '0 0 20px', fontSize: 12, color: '#888' }}>
        献立生成時に自動で反映されます。毎回の「要望」欄は一時的な追加要望のみに使えます。
      </p>
      {error && <div style={{ color: 'red', marginBottom: 12, fontSize: 13 }}>{error}</div>}
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>家族構成</div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>例: 大人2名（夫婦）、子供なし</div>
          <input
            style={S.input}
            value={family}
            onChange={e => setFamily(e.target.value)}
            placeholder="大人2名（30代夫婦）"
            maxLength={200}
          />
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>食事傾向・嗜好</div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>例: 朝は簡単に、夜は和食多め、週2回魚を食べたい</div>
          <textarea
            style={{ ...S.input, height: 80, resize: 'vertical' as const }}
            value={prefs}
            onChange={e => setPrefs(e.target.value)}
            placeholder="朝は簡単に済ませたい。夜は和食を多めに。調理時間は30分以内が好ましい。"
            maxLength={500}
          />
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>アレルギー・禁忌食材</div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>例: えび・かにアレルギー、パクチー嫌い</div>
          <input
            style={S.input}
            value={allergies}
            onChange={e => setAllergies(e.target.value)}
            placeholder="なし"
            maxLength={200}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="submit" style={S.btn()} disabled={saving}>
            {saving ? '保存中…' : '保存する'}
          </button>
          {savedAt && <span style={{ fontSize: 12, color: '#888' }}>最終更新: {savedAt.slice(0, 16)}</span>}
        </div>
      </form>
    </div>
  )
}

// ---- Navigation ----
type Page = 'stock' | 'meal' | 'shopping' | 'profile'

function BottomNav({ page, setPage }: { page: Page; setPage: (p: Page) => void }) {
  const tabs: { id: Page; label: string; icon: string }[] = [
    { id: 'stock', label: '在庫', icon: '🥕' },
    { id: 'meal', label: '献立', icon: '🍽' },
    { id: 'shopping', label: '買い物', icon: '🛒' },
    { id: 'profile', label: '設定', icon: '⚙' },
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
      {page === 'profile' && <ProfilePage api={api} />}
      <BottomNav page={page} setPage={setPage} />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
