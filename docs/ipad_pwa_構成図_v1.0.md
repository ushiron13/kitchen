# iPad PWA 移行 構成図 v1.0

<document_meta>
- **作成日**: 2026-06-27
- **対応要件定義書**: ipad_pwa_要件定義書_v1.0.md
- **対象ブランチ**: feature/ipad-pwa-migration
</document_meta>

---

## 1. 新旧システム全体構成の比較

### 旧構成（サーバーあり）

```mermaid
graph TB
    subgraph Client["クライアント"]
        iPad1["iPad / スマホ"]
    end

    subgraph Home["自宅LAN"]
        subgraph Server["自宅PC（常時稼働）"]
            Caddy["Caddy (HTTPS)"]
            API["FastAPI"]
            Agent["LangGraph"]
            DB[("SQLite")]
        end
        NAS["NAS (バックアップ)"]
    end

    subgraph Internet["インターネット"]
        Claude["Claude API"]
    end

    iPad1 -.LAN only.-> Caddy
    Caddy --> API
    API <--> Agent
    Agent <--> DB
    Agent -.-> Claude

    style Server fill:#ffeeba
    style DB fill:#f8d7da
```

### 新構成（サーバーなし）

```mermaid
graph TB
    subgraph iPad["iPad（ブラウザ内）"]
        PWA["Kitchen Manager PWA\n(React + Vite)"]
        IDB[("IndexedDB\n(Dexie.js)\n在庫・献立・レシピ")]
        SW["Service Worker\n(オフライン対応)"]
        SDK["Anthropic JS SDK\n(AI 直接呼び出し)"]
    end

    subgraph GitHub["GitHub"]
        Pages["GitHub Pages\n(静的ファイル配信)"]
        Actions["GitHub Actions\n(CI/CD)"]
    end

    subgraph Internet["インターネット"]
        Claude["Claude API\n(Sonnet / Haiku)"]
    end

    PWA <--> IDB
    PWA <--> SW
    PWA --> SDK
    SDK -.HTTPS.-> Claude
    Pages -.初回ロード.-> PWA
    Actions --> Pages

    style PWA fill:#d4edda
    style IDB fill:#cce5ff
    style SW fill:#fff3cd
    style Pages fill:#e2e3e5
```

---

## 2. コンポーネント構成図

```mermaid
graph TD
    subgraph Frontend["frontend/ (React + Vite)"]
        subgraph UI["UI レイヤー"]
            App["App コンポーネント\n(タブ切り替え・API キー管理)"]
            Stock["在庫管理タブ"]
            MealPlan["献立タブ"]
            Recipes["レシピタブ"]
            Profile["プロファイルタブ"]
            Settings["設定画面\n(API キー入力・エクスポート/インポート)"]
        end

        subgraph DataLayer["データ層 (lib/db.ts)"]
            Dexie["Dexie.js\n(IndexedDB ラッパー)"]
            Schema["スキーマ定義\nfoods / stockItems / mealPlans\n/ meals / recipes / profile"]
        end

        subgraph AILayer["AI 層 (lib/ai.ts)"]
            AnthropicSDK["@anthropic-ai/sdk"]
            MealGen["献立生成関数\n(旧 build_skeleton_graph 相当)"]
            RecipeGen["レシピ生成関数\n(旧 recipe_agent 相当)"]
        end

        subgraph PWALayer["PWA 層"]
            VitePWA["vite-plugin-pwa"]
            Workbox["Workbox\n(静的アセットキャッシュ)"]
        end
    end

    App --> Stock
    App --> MealPlan
    App --> Recipes
    App --> Profile
    App --> Settings

    Stock --> Dexie
    MealPlan --> Dexie
    MealPlan --> MealGen
    Recipes --> Dexie
    Recipes --> RecipeGen
    Profile --> Dexie

    MealGen --> AnthropicSDK
    RecipeGen --> AnthropicSDK
    RecipeGen -.レシピ再利用.-> Dexie

    VitePWA --> Workbox

    style Dexie fill:#cce5ff
    style AnthropicSDK fill:#d4edda
    style VitePWA fill:#fff3cd
```

---

## 3. データフロー図

### 3.1 在庫操作フロー（完全オフライン動作）

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant UI as React UI
    participant Dexie as Dexie.js (IndexedDB)

    User->>UI: 食材名・数量・期限を入力
    UI->>Dexie: db.stockItems.add({ ... })
    Dexie-->>UI: 登録完了（新 ID）
    UI-->>User: 在庫一覧に即時反映

    Note over UI,Dexie: サーバー通信なし。ネットワーク不要。
```

### 3.2 献立提案フロー（オンライン必須）

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant UI as React UI
    participant Dexie as Dexie.js
    participant AI as lib/ai.ts
    participant Claude as Claude API (Sonnet)

    User->>UI: 献立生成ボタンをタップ
    UI->>Dexie: db.stockItems.toArray()
    Dexie-->>UI: 在庫リスト
    UI->>Dexie: db.profile.get(1)
    Dexie-->>UI: 家族プロファイル
    UI->>AI: generateMealPlan(stockItems, profile, days, mealTypes)
    AI->>Claude: messages.create({ model: 'claude-sonnet-4-6', ... })
    Claude-->>AI: 献立 JSON
    AI-->>UI: パース済み献立データ
    UI->>Dexie: db.mealPlans.add(plan)
    UI->>Dexie: db.meals.bulkAdd(meals)
    Dexie-->>UI: 保存完了
    UI-->>User: 献立カレンダー表示

    Note over AI,Claude: ネットワーク必須。オフライン時はエラー表示。
```

### 3.3 レシピ生成フロー（DB 再利用 → 不足時のみ AI）

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant UI as React UI
    participant Dexie as Dexie.js
    participant AI as lib/ai.ts
    participant Claude as Claude API (Sonnet)

    User->>UI: 「レシピ生成」ボタン
    UI->>AI: generateRecipe(mealConcept, stockItems)
    AI->>Dexie: db.recipes.where('name').startsWithIgnoreCase(concept)
    alt 既存レシピがヒット
        Dexie-->>AI: 既存レシピ
        AI-->>UI: 既存レシピ（API 呼び出しなし）
    else ヒットなし
        AI->>Claude: messages.create({ ... })
        Claude-->>AI: レシピ詳細 JSON
        AI->>Dexie: db.recipes.add(newRecipe)
        Dexie-->>AI: 保存完了
        AI-->>UI: 新規レシピ
    end
    UI-->>User: レシピ表示
```

### 3.4 エクスポート / インポートフロー（デバイス間データ移行）

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant UI as React UI
    participant Dexie as Dexie.js (IndexedDB)

    Note over User,Dexie: エクスポート（バックアップ）
    User->>UI: 「データをエクスポート」ボタン
    UI->>Dexie: 全テーブルを toArray()
    Dexie-->>UI: 全データ
    UI-->>User: kitchen_backup_YYYYMMDD.json をダウンロード

    Note over User,Dexie: インポート（別デバイス or 復元）
    User->>UI: JSON ファイルを選択してインポート
    UI->>UI: JSON をパース・バリデーション
    UI->>Dexie: db.transaction('rw', ...) で全テーブルに bulkPut
    Dexie-->>UI: インポート完了
    UI-->>User: 「XX件のデータをインポートしました」
```

---

## 4. IndexedDB スキーマ（Dexie.js）

```mermaid
erDiagram
    foods {
        number id PK "++id (autoincrement)"
        string name
        string category
        number default_shelf_days
        string created_at
        string updated_at
    }

    stockItems {
        number id PK "++id"
        number food_id FK
        number quantity
        string unit
        string expiry_date
        string purchased_date
        boolean opened
        string location
        string created_at
        string updated_at
    }

    stockTransactions {
        number id PK "++id"
        number stock_item_id FK
        string tx_type "consume / add / adjust"
        number quantity_delta
        string created_at
    }

    mealPlans {
        number id PK "++id"
        string start_date
        string end_date
        string status
        string notes
        string created_at
        string updated_at
    }

    meals {
        number id PK "++id"
        number meal_plan_id FK
        number recipe_id
        string served_date
        string meal_type "breakfast / lunch / dinner / snack"
        string status "planned / cooked / skipped"
        string concept
        string estimated_ingredients "JSON 文字列"
        number cook_time_min_estimate
        string notes
        string created_at
        string updated_at
    }

    recipes {
        number id PK "++id"
        string name
        string instructions_md
        number cook_time_min
        string cost_estimate
        boolean is_favorite
        number reuse_count
        string created_at
        string updated_at
    }

    recipeIngredients {
        number id PK "++id"
        number recipe_id FK
        number food_id
        string raw_name
        number quantity
        string unit
        boolean is_main
        string notes
    }

    profile {
        number id PK "固定値 1"
        string family_composition
        string food_preferences
        string allergies
        string updated_at
    }

    foods ||--o{ stockItems : "food_id"
    stockItems ||--o{ stockTransactions : "stock_item_id"
    mealPlans ||--|{ meals : "meal_plan_id"
    meals }o--o| recipes : "recipe_id"
    recipes ||--|{ recipeIngredients : "recipe_id"
    foods ||--o{ recipeIngredients : "food_id"
```

**Dexie インデックス定義（主要）**:

| テーブル | インデックス | 用途 |
|---------|------------|------|
| `stockItems` | `food_id`, `expiry_date` | カテゴリ絞り込み・期限切迫検索 |
| `meals` | `meal_plan_id`, `served_date` | プラン別・日付別取得 |
| `recipes` | `name`, `is_favorite`, `reuse_count` | 名前検索・お気に入り・再利用順ソート |
| `recipeIngredients` | `recipe_id`, `food_id` | レシピ別食材取得・食材指定検索 |

---

## 5. デプロイ構成図（GitHub Pages + Actions）

```mermaid
graph LR
    subgraph Dev["開発環境 (WSL2)"]
        Code["ソースコード編集"]
        LocalDev["vite dev server\n(動作確認)"]
    end

    subgraph GitHub["GitHub"]
        Repo["リポジトリ\nmain ブランチ"]
        Actions["GitHub Actions\n.github/workflows/deploy.yml"]
        Pages["GitHub Pages\nghttps://username.github.io/kitchen"]
    end

    subgraph iPad["iPad"]
        Safari["Safari\n(初回アクセス)"]
        HomeApp["ホーム画面アプリ\n(PWA インストール済み)"]
        SW["Service Worker\n(静的アセットをキャッシュ)"]
    end

    Code -->|git push| Repo
    Repo -->|trigger| Actions
    Actions -->|vite build + deploy| Pages
    Pages -.HTTPS.-> Safari
    Safari -->|ホーム画面に追加| HomeApp
    Pages -.初回ロード.-> SW
    SW -.オフライン時に提供| HomeApp

    style Pages fill:#e2e3e5
    style HomeApp fill:#d4edda
    style SW fill:#fff3cd
```

### GitHub Actions ワークフロー概要

```yaml
# .github/workflows/deploy.yml (予定)
on:
  push:
    branches: [main]

jobs:
  deploy:
    steps:
      - checkout
      - setup Node.js
      - npm ci (frontend/)
      - npm run build (vite build → dist/)
      - deploy dist/ to gh-pages branch
```

---

## 6. オンライン / オフライン 動作マトリクス

| 機能 | オンライン | オフライン（ネット接続なし） |
|------|-----------|--------------------------|
| 在庫の閲覧・追加・編集・削除 | ✅ | ✅（IndexedDB がローカルに存在） |
| レシピの閲覧 | ✅ | ✅（IndexedDB に保存済みのもの） |
| 献立プランの閲覧 | ✅ | ✅（IndexedDB に保存済みのもの） |
| 献立の AI 生成 | ✅ | ❌（Claude API 接続が必要） |
| レシピの AI 生成 | ✅ | ❌（Claude API 接続が必要） |
| 既存レシピの再利用 | ✅ | ✅（IndexedDB ヒット時） |
| 家族プロファイルの編集 | ✅ | ✅ |
| データエクスポート | ✅ | ✅ |
| データインポート | ✅ | ✅ |
| アプリ自体の読み込み | ✅ | ✅（Service Worker キャッシュ） |

> **まとめ**: 日常操作（在庫確認・更新・既存レシピ閲覧）は完全オフライン動作。AI 生成系のみインターネット接続が必要。

---

## 7. 移行前後の技術スタック比較

| 項目 | 移行前 | 移行後 |
|------|--------|-------|
| フロントエンド | React + Vite + TypeScript | 同左（変更なし） |
| PWA | vite-plugin-pwa + Workbox | 同左（キャッシュ戦略のみ変更） |
| データ永続化 | SQLite (Python aiosqlite) | **Dexie.js (IndexedDB)** |
| API サーバー | FastAPI (Python) | **廃止** |
| エージェント | LangGraph (Python) | **廃止** |
| AI SDK | langchain-anthropic (Python) | **@anthropic-ai/sdk (TypeScript)** |
| リバースプロキシ | Caddy + mkcert | **廃止（GitHub Pages が HTTPS 提供）** |
| ホスティング | 自宅 PC (Docker Compose) | **GitHub Pages（静的ファイル）** |
| CI/CD | 手動 docker-compose up | **GitHub Actions（push → 自動デプロイ）** |
| アクセス範囲 | 家庭内 LAN のみ | **インターネット接続があればどこでも** |
| バックアップ | NAS 日次自動バックアップ | **手動 JSON エクスポート** |
