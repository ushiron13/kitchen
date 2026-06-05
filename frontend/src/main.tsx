import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const KITCHEN_API_KEY_KEY = 'kitchen_api_key'

function App() {
  const apiKey = localStorage.getItem(KITCHEN_API_KEY_KEY)

  if (!apiKey) {
    return (
      <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
        <h1>🥘 Kitchen Manager</h1>
        <p>APIキーを入力してください</p>
        <form onSubmit={(e) => {
          e.preventDefault()
          const key = (e.currentTarget.elements.namedItem('key') as HTMLInputElement).value
          localStorage.setItem(KITCHEN_API_KEY_KEY, key)
          window.location.reload()
        }}>
          <input name="key" type="password" placeholder="X-API-Key" style={{ width: 300 }} />
          <button type="submit">保存</button>
        </form>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>🥘 Kitchen Manager</h1>
      <p>Phase 0a: セットアップ完了 ✅</p>
      <p style={{ color: 'gray', fontSize: 12 }}>Phase 0b 以降でUIを構築します</p>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
