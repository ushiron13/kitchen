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

const CATEGORY_LABELS: Record<string, string> = {
  refrigerated: '冷蔵',
  frozen: '冷凍',
  pantry: '常温',
  ambient: '常温（長期）',
  seasoning: '調味料',
}

// ---- API helpers ----
function makeApi(apiKey: string) {
  const headers = { 'X-API-Key': apiKey, 'Content-Type': 'application/json' }

  return {
    async getFoods(): Promise<Food[]> {
      const r = await fetch('/api/v1/foods', { headers })
      if (!r.ok) throw new Error(await r.text())
      return r.json()
    },
    async createFood(payload: { name: string; category: string; default_shelf_days?: number }): Promise<Food> {
      const r = await fetch('/api/v1/foods', { method: 'POST', headers, body: JSON.stringify(payload) })
      if (!r.ok) throw new Error(await r.text())
      return r.json()
    },
    async getStock(): Promise<StockItem[]> {
      const r = await fetch('/api/v1/stock', { headers })
      if (!r.ok) throw new Error(await r.text())
      return r.json()
    },
    async createStock(payload: { food_id: number; quantity: number; unit: string; expiry_date?: string }): Promise<StockItem> {
      const r = await fetch('/api/v1/stock', { method: 'POST', headers, body: JSON.stringify(payload) })
      if (!r.ok) throw new Error(await r.text())
      return r.json()
    },
    async consumeStock(itemId: number, delta: number): Promise<StockItem> {
      const r = await fetch(`/api/v1/stock/${itemId}/transactions`, {
        method: 'POST', headers,
        body: JSON.stringify({ tx_type: 'consume', quantity_delta: -Math.abs(delta) }),
      })
      if (!r.ok) throw new Error(await r.text())
      return r.json()
    },
    async deleteStock(itemId: number): Promise<void> {
      const r = await fetch(`/api/v1/stock/${itemId}`, { method: 'DELETE', headers })
      if (!r.ok) throw new Error(await r.text())
    },
  }
}

// ---- Components ----
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

function AddFoodModal({ api, onClose, onCreated }: { api: ReturnType<typeof makeApi>, onClose: () => void, onCreated: (f: Food) => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('refrigerated')
  const [shelfDays, setShelfDays] = useState('')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const food = await api.createFood({
        name,
        category,
        ...(shelfDays ? { default_shelf_days: Number(shelfDays) } : {}),
      })
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
          <div>
            <div style={S.label}>食材名</div>
            <input style={S.input} value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div>
            <div style={S.label}>カテゴリ</div>
            <select style={S.input} value={category} onChange={e => setCategory(e.target.value)}>
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <div style={S.label}>デフォルト保存日数（任意）</div>
            <input style={S.input} type="number" min={1} value={shelfDays} onChange={e => setShelfDays(e.target.value)} />
          </div>
          {error && <div style={{ color: 'red', fontSize: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ ...S.btn('#888') }}>キャンセル</button>
            <button type="submit" style={S.btn()}>登録</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AddStockModal({ api, foods, onClose, onCreated }: { api: ReturnType<typeof makeApi>, foods: Food[], onClose: () => void, onCreated: () => void }) {
  const [foodId, setFoodId] = useState(foods[0]?.id?.toString() ?? '')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('個')
  const [expiry, setExpiry] = useState('')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.createStock({
        food_id: Number(foodId),
        quantity: Number(quantity),
        unit,
        ...(expiry ? { expiry_date: expiry } : {}),
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
            <div style={S.label}>食材</div>
            <select style={S.input} value={foodId} onChange={e => setFoodId(e.target.value)} required>
              {foods.map(f => <option key={f.id} value={f.id}>{f.name}（{CATEGORY_LABELS[f.category]}）</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 2 }}>
              <div style={S.label}>数量</div>
              <input style={S.input} type="number" min={0.01} step={0.01} value={quantity} onChange={e => setQuantity(e.target.value)} required />
            </div>
            <div style={{ flex: 1 }}>
              <div style={S.label}>単位</div>
              <input style={S.input} value={unit} onChange={e => setUnit(e.target.value)} required />
            </div>
          </div>
          <div>
            <div style={S.label}>消費期限（任意）</div>
            <input style={S.input} type="date" value={expiry} onChange={e => setExpiry(e.target.value)} />
          </div>
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

function StockPage({ api }: { api: ReturnType<typeof makeApi> }) {
  const [stock, setStock] = useState<StockItem[]>([])
  const [foods, setFoods] = useState<Food[]>([])
  const [modal, setModal] = useState<'food' | 'stock' | null>(null)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    try {
      const [s, f] = await Promise.all([api.getStock(), api.getFoods()])
      setStock(s)
      setFoods(f)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '読み込み失敗')
    }
  }, [api])

  useEffect(() => { reload() }, [reload])

  async function consume(item: StockItem) {
    const input = prompt(`消費数量を入力 (現在: ${item.quantity} ${item.unit})`)
    if (!input) return
    const delta = parseFloat(input)
    if (isNaN(delta) || delta <= 0) return
    try {
      await api.consumeStock(item.id, delta)
      reload()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'エラー')
    }
  }

  async function remove(item: StockItem) {
    if (!confirm(`「${item.food_name}」を在庫から削除しますか？`)) return
    await api.deleteStock(item.id)
    reload()
  }

  const today = new Date().toISOString().slice(0, 10)
  const expiringSoon = stock.filter(s => s.expiry_date && s.expiry_date <= new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10))

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
                <span style={{ marginLeft: 12, color: item.expiry_date < today ? '#e53935' : item.expiry_date <= new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) ? '#fb8c00' : '#888' }}>
                  期限: {item.expiry_date}
                </span>
              )}
              {item.location && <span style={{ marginLeft: 12, color: '#888' }}>{item.location}</span>}
            </div>
          </div>
        ))
      )}

      {modal === 'food' && (
        <AddFoodModal
          api={api}
          onClose={() => setModal(null)}
          onCreated={() => { reload(); setModal(null) }}
        />
      )}
      {modal === 'stock' && (
        <AddStockModal
          api={api}
          foods={foods}
          onClose={() => setModal(null)}
          onCreated={() => { reload(); setModal(null) }}
        />
      )}
    </div>
  )
}

function LoginForm({ onLogin }: { onLogin: (key: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ marginBottom: 8 }}>Kitchen Manager</h1>
        <p style={{ color: '#666', marginBottom: 20 }}>APIキーを入力してください</p>
        <form onSubmit={(e) => {
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

function App() {
  const [apiKey, setApiKey] = useState<string | null>(() => localStorage.getItem(API_KEY_STORAGE))

  if (!apiKey) return <LoginForm onLogin={setApiKey} />

  const api = makeApi(apiKey)
  return <StockPage api={api} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
