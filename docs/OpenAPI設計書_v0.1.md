# OpenAPI設計書 v0.3

<document_meta>
- **対応文書**: 要件定義書_v0.3.md, データモデル詳細設計書_v0.3.md
- **OpenAPI仕様バージョン**: 3.1.0
- **作成日**: 2026-05-22
- **更新日**: 2026-06-05（設計反映書_v0.4 §1.3, §2, §3 を取り込み、Phase 0c 実装と整合）
</document_meta>

---

## 0. 本書の構成

| 章 | 内容 |
|----|------|
| 1 | 設計方針 |
| 2 | 認証・セキュリティ |
| 3 | 共通仕様（バージョニング、ページネーション、エラー、日時） |
| 4 | リソース一覧とエンドポイント設計 |
| 5 | エージェント自然言語インターフェース |
| 6 | 主要ユースケースのフロー例 |
| 7 | OpenAPI仕様（YAML完全版） |
| 8 | 未確定事項 |

---

## 1. 設計方針

| # | 方針 | 根拠 |
|---|------|------|
| 1 | RESTful、リソース指向URL | 標準的、認知負荷低 |
| 2 | アクションはサブリソース or 動詞エンドポイント（`/meals/{id}/consume` 等） | CRUDで表せない操作の表現 |
| 3 | レスポンスは `application/json`、エラーは RFC 7807 (problem+json) | 標準準拠 |
| 4 | 日時は ISO 8601 + UTC オフセット込みで返却 | データモデル設計書 第8章 |
| 5 | リスト系は cursor + limit ベースのページネーション | offset は大量データで遅い |
| 6 | バージョニングは URL パスで（`/api/v1/`） | 明示的、シンプル |
| 7 | API キー認証（`X-API-Key` ヘッダ） | LAN内利用前提、シンプル防御 |
| 8 | エンドポイント命名は英語複数形リソース、kebab-case | 慣例 |

---

## 2. 認証・セキュリティ

### 2.1 認証方式
- **API キー方式**: HTTPヘッダ `X-API-Key: <key>`
- 家族で1キーを共有（D-05 共有アカウント方針）
- キーは自宅PC上の `.env` で管理、家族端末にPWA初回アクセス時に保存
- ローテーション: 設定ファイルを更新して全コンテナ再起動

### 2.2 セキュリティ考慮
- LAN内限定（D-04）
- HTTPS（mkcert で家庭用証明書）
- リバースプロキシ（Caddy）でレートリミット適用
- 機微情報をURLクエリに乗せない

### 2.3 補足
- MVP では認証はキーのみ。Phase 2 でマルチユーザー識別を導入する際に Cookie ベースのセッションへ移行検討

---

## 3. 共通仕様

### 3.1 URLバージョニング
- ベースパス: `/api/v1`
- 例: `GET /api/v1/inventory`

### 3.2 ページネーション
- クエリパラメータ:
  - `limit`: 1ページの件数（デフォルト 20、最大 100）
  - `cursor`: 次ページ取得用カーソル（前ページのレスポンスから取得）
- レスポンス共通エンベロープ:
  ```json
  {
    "items": [ ... ],
    "next_cursor": "abc123",  // null なら末尾
    "total_estimated": 100     // optional
  }
  ```

### 3.3 エラーモデル（RFC 7807）
```json
{
  "type": "/problems/inventory-not-found",
  "title": "Inventory item not found",
  "status": 404,
  "detail": "stock_item id=999 does not exist",
  "instance": "/api/v1/inventory/999"
}
```

主要なエラー種別:
| status | type | 用途 |
|--------|------|-----|
| 400 | validation-error | バリデーション失敗 |
| 401 | unauthorized | APIキー欠落・不正 |
| 404 | not-found | リソース不存在 |
| 409 | conflict | 状態競合（既に completed な meal_plan を再 complete 等） |
| 422 | unprocessable-entity | 業務ルール違反 |
| 429 | rate-limited | レート制限 |
| 500 | internal-error | サーバー側エラー |

### 3.4 日時形式
- 入出力ともに ISO 8601 + UTCオフセット: `2026-05-22T15:00:00+09:00`
- 日付のみ: `YYYY-MM-DD`

### 3.5 ID形式
- 整数（SQLite AUTOINCREMENT に対応）

---

## 4. リソース一覧とエンドポイント設計

### 4.1 リソースグループ
| グループ | 主なリソース |
|---------|------------|
| マスタ | foods, food_aliases, family_profiles |
| 在庫 | inventory（stock_item）, stock_transactions |
| レシピ | recipes, recipe_ratings |
| 献立 | meal_plans, meals, meal_ratings |
| 買い物 | shopping_lists, shopping_items |
| エージェント | agent/chat |

### 4.2 エンドポイント一覧（サマリ）

#### 4.2.1 食材マスタ・エイリアス
| Method | Path | 説明 |
|--------|------|-----|
| GET | /foods | 食材マスタ一覧（検索可: `?q=鶏`） |
| POST | /foods | 食材マスタ追加（shopping_item からの昇格動線含む / R-07） |
| GET | /foods/{food_id} | 詳細 |
| PATCH | /foods/{food_id} | 更新 |
| DELETE | /foods/{food_id} | 削除（参照あれば409） |
| GET | /foods/{food_id}/aliases | エイリアス一覧 |
| POST | /foods/{food_id}/aliases | エイリアス追加 |
| DELETE | /food-aliases/{alias_id} | エイリアス削除 |

#### 4.2.2 家族プロファイル
| Method | Path | 説明 |
|--------|------|-----|
| GET | /family-profiles | 一覧 |
| GET | /family-profiles/{id} | 詳細 |
| PATCH | /family-profiles/{id} | 嗜好・アレルゲン更新 |

#### 4.2.3 在庫
| Method | Path | 説明 |
|--------|------|-----|
| GET | /inventory | 在庫一覧（フィルタ: `category`, `expiring_within_days`） |
| POST | /inventory | 在庫追加（quantity を含めて 'in' トランザクションも自動生成） |
| GET | /inventory/expiring | 期限切迫品（`?days=3`） |
| GET | /inventory/{id} | 詳細 |
| PATCH | /inventory/{id} | quantity以外の属性更新（location/notes/opened/expiry_date） |
| DELETE | /inventory/{id} | 削除（要 quantity=0 or force） |
| POST | /inventory/{id}/transactions | トランザクション記録（in/out/consume/waste/adjust） |
| GET | /inventory/{id}/transactions | トランザクション履歴 |

#### 4.2.4 レシピ
| Method | Path | 説明 |
|--------|------|-----|
| GET | /recipes | 一覧（フィルタ: `q`, `cook_time_max`, `favorite_only`, `include_archived`） |
| POST | /recipes | 手動作成 or LLM生成リクエスト |
| GET | /recipes/{id} | 詳細 |
| PATCH | /recipes/{id} | 部分更新（is_favorite 等） |
| POST | /recipes/{id}/archive | アーカイブ（is_archived=1） |
| POST | /recipes/{id}/unarchive | アーカイブ解除 |
| POST | /recipes/suggest | 食材指定レシピ提案（F-MEAL-11） |
| POST | /recipes/suggest-by-expiry | 期限切迫品ベースの提案 |
| POST | /recipes/{id}/ratings | 評価追加・更新（UPSERT） |
| GET | /recipes/{id}/ratings | 評価一覧 |

#### 4.2.5 献立計画・meal
| Method | Path | 説明 |
|--------|------|-----|
| GET | /meal-plans | 一覧 |
| POST | /meal-plans | 計画生成（LLM呼び出しを伴う） |
| GET | /meal-plans/{id} | 詳細 |
| PATCH | /meal-plans/{id} | notes 等の更新 |
| POST | /meal-plans/{id}/complete | 完了化（補助関数呼び出し） |
| POST | /meal-plans/{id}/cancel | キャンセル |
| GET | /meal-plans/{id}/meals | 計画内のmeal一覧 |
| GET | /meal-plans/{id}/shopping-list | 関連買い物リスト取得 |
| GET | /meals/{id} | meal詳細 |
| PATCH | /meals/{id} | meal更新（recipe差し替え等） |
| POST | /meals/{id}/consume | 調理完了 → 在庫消費 |
| POST | /meals/{id}/skip | スキップ |
| POST | /meals/{id}/ratings | 評価 |

#### 4.2.6 買い物リスト
| Method | Path | 説明 |
|--------|------|-----|
| GET | /shopping-lists | 一覧 |
| GET | /shopping-lists/{id} | 詳細 |
| POST | /shopping-lists | 単独作成（meal_plan 紐付け任意） |
| PATCH | /shopping-lists/{id} | status 等の更新 |
| POST | /shopping-lists/{id}/items | 項目追加（食材マスタ参照 or 自由入力） |
| PATCH | /shopping-lists/{id}/items/{item_id} | purchased チェック等 |
| DELETE | /shopping-lists/{id}/items/{item_id} | 項目削除 |

#### 4.2.7 エージェント
| Method | Path | 説明 |
|--------|------|-----|
| POST | /agent/chat | 自然言語入力をルーティング、最適なエージェントへ |

---

## 5. エージェント自然言語インターフェース

`POST /api/v1/agent/chat` は LangGraph のインテントルーター（Haiku）にメッセージを渡し、適切なエージェントを起動する統合エンドポイント。

リクエスト:
```json
{
  "message": "来週の献立を提案して。鶏もも肉が期限切れそう",
  "session_id": "abc-123",  // 会話継続用、省略可
  "context": {                // 追加コンテキスト、省略可
    "current_meal_plan_id": 42
  }
}
```

レスポンス:
```json
{
  "session_id": "abc-123",
  "intent": "meal_plan_generation",
  "agent": "meal_planner",
  "result": {
    "meal_plan_id": 43,
    "summary": "7日間の献立を作成しました..."
  },
  "follow_up_suggestions": [
    "買い物リストを表示",
    "別の鶏肉レシピを提案"
  ]
}
```

> エージェントが内部で他のエンドポイント相当の処理を実行する場合もあるが、外部APIとしては /agent/chat 1本で隠蔽。フロントは結果オブジェクトを見て表示を切り替える。

---

## 6. 主要ユースケースのフロー例

### 6.1 在庫登録 → 期限切迫レシピ提案 → 調理消費

```
1. POST /api/v1/inventory
   { "food_id": 12, "quantity": 300, "unit": "g", "expiry_date": "2026-05-25" }
   → 201 Created { "id": 100, ... }

2. POST /api/v1/recipes/suggest-by-expiry
   { "days": 3, "limit": 3 }
   → 200 OK { "recipes": [...], "from_db": 1, "from_llm": 2 }

3. POST /api/v1/meal-plans  (任意: 直接 meal を作る場合は skip)
   { "start_date": "2026-05-26", "end_date": "2026-06-01", ... }

4. POST /api/v1/meals/{id}/consume
   → 200 OK { "consumed_items": [...] }
   内部で複数 stock_transaction が記録され、stock_item.quantity が連動更新
```

### 6.2 1週間献立生成 → 買い物リスト確認 → 購入チェック

```
1. POST /api/v1/meal-plans
   { "start_date": "2026-05-26", "preferences": "和食多め, 平日は30分以内" }
   → 202 Accepted { "meal_plan_id": 43, "status": "generating" }  // 非同期想定
   or
   → 200 OK { "meal_plan_id": 43, ... }                            // 同期完了

2. GET /api/v1/meal-plans/43/shopping-list
   → 200 OK { "items": [...] }

3. PATCH /api/v1/shopping-lists/8/items/15
   { "purchased": true }
```

---

## 7. OpenAPI仕様（YAML完全版）

> 以下をそのまま `openapi.yaml` として保存可能。Swagger UI / Redoc / openapi-generator 等で利用できる。

```yaml
openapi: 3.1.0
info:
  title: 在庫管理・献立提案エージェントシステム API
  version: 0.1.0
  description: |
    家庭内LAN上で動作する、在庫管理と献立提案エージェントのREST API。
    対応データモデル: データモデル詳細設計書 v0.3
  contact:
    name: 開発者
servers:
  - url: https://kitchen.local/api/v1
    description: 自宅PC（LAN内）

security:
  - ApiKeyAuth: []

components:
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key

  schemas:
    # ===== 共通 =====
    Problem:
      type: object
      properties:
        type: { type: string }
        title: { type: string }
        status: { type: integer }
        detail: { type: string }
        instance: { type: string }
      required: [type, title, status]

    PaginationEnvelope:
      type: object
      properties:
        items:
          type: array
          items: {}
        next_cursor:
          type: string
          nullable: true
        total_estimated:
          type: integer
          nullable: true

    # ===== Food =====
    FoodCategory:
      type: string
      enum: [refrigerated, frozen, pantry, ambient, seasoning]

    Food:
      type: object
      properties:
        id: { type: integer }
        name: { type: string }
        category: { $ref: '#/components/schemas/FoodCategory' }
        default_shelf_days: { type: integer, nullable: true }
        created_at: { type: string, format: date-time }
        updated_at: { type: string, format: date-time }
      required: [id, name, category]

    FoodCreate:
      type: object
      properties:
        name: { type: string }
        category: { $ref: '#/components/schemas/FoodCategory' }
        default_shelf_days: { type: integer, nullable: true }
      required: [name, category]

    FoodAlias:
      type: object
      properties:
        id: { type: integer }
        food_id: { type: integer }
        alias: { type: string }
        source: { type: string, enum: [manual, llm_inferred] }
        confidence: { type: number, nullable: true }
        created_at: { type: string, format: date-time }
      required: [id, food_id, alias, source]

    FoodAliasCreate:
      type: object
      properties:
        alias: { type: string }
        source: { type: string, enum: [manual, llm_inferred], default: manual }
        confidence: { type: number, nullable: true }
      required: [alias]

    # ===== FamilyProfile =====
    FamilyProfile:
      type: object
      properties:
        id: { type: integer }
        label: { type: string }
        preferences:
          type: object
          properties:
            likes: { type: array, items: { type: string } }
            dislikes: { type: array, items: { type: string } }
            preferred_cuisines: { type: array, items: { type: string } }
        allergens:
          type: object
          properties:
            allergens: { type: array, items: { type: string } }
            severity: { type: string }
        created_at: { type: string, format: date-time }
        updated_at: { type: string, format: date-time }
      required: [id, label]

    FamilyProfileUpdate:
      type: object
      properties:
        label: { type: string }
        preferences: { type: object }
        allergens: { type: object }

    # ===== Inventory =====
    StockItem:
      type: object
      properties:
        id: { type: integer }
        food_id: { type: integer }
        food_name: { type: string, description: "JOIN結果。便宜上含める" }
        quantity: { type: number }
        unit: { type: string }
        expiry_date: { type: string, format: date, nullable: true }
        opened: { type: boolean }
        location: { type: string, nullable: true }
        notes: { type: string, nullable: true }
        created_at: { type: string, format: date-time }
        updated_at: { type: string, format: date-time }
      required: [id, food_id, quantity, unit, opened]

    StockItemCreate:
      type: object
      properties:
        food_id: { type: integer }
        quantity: { type: number, minimum: 0 }
        unit: { type: string }
        expiry_date: { type: string, format: date, nullable: true }
        opened: { type: boolean, default: false }
        location: { type: string, nullable: true }
        notes: { type: string, nullable: true }
      required: [food_id, quantity, unit]

    StockItemUpdate:
      type: object
      properties:
        unit: { type: string }
        expiry_date: { type: string, format: date, nullable: true }
        opened: { type: boolean }
        location: { type: string, nullable: true }
        notes: { type: string, nullable: true }
      description: "quantity の変更は POST /inventory/{id}/transactions で行う"

    StockTransaction:
      type: object
      properties:
        id: { type: integer }
        stock_item_id: { type: integer }
        tx_type: { type: string, enum: [in, out, consume, waste, adjust] }
        quantity_delta: { type: number, description: "正:増加、負:減少" }
        meal_id: { type: integer, nullable: true }
        reason: { type: string, nullable: true }
        created_at: { type: string, format: date-time }
      required: [id, stock_item_id, tx_type, quantity_delta]

    StockTransactionCreate:
      type: object
      properties:
        tx_type: { type: string, enum: [in, out, consume, waste, adjust] }
        quantity_delta: { type: number }
        meal_id: { type: integer, nullable: true }
        reason: { type: string, nullable: true }
      required: [tx_type, quantity_delta]

    # ===== Recipe =====
    Recipe:
      type: object
      properties:
        id: { type: integer }
        name: { type: string }
        instructions_md: { type: string, description: "Markdown形式の調理手順" }
        cook_time_min: { type: integer, nullable: true }
        cost_estimate: { type: string, nullable: true }
        image_path: { type: string, nullable: true }
        source: { type: string, enum: [llm, external, manual] }
        external_id: { type: string, nullable: true }
        is_favorite: { type: boolean }
        is_archived: { type: boolean }
        reuse_count: { type: integer }
        metadata: { type: object, nullable: true }
        ingredients:
          type: array
          items: { $ref: '#/components/schemas/RecipeIngredient' }
        created_at: { type: string, format: date-time }
        updated_at: { type: string, format: date-time }
      required: [id, name, instructions_md, source, is_favorite, is_archived]

    RecipeIngredient:
      type: object
      properties:
        id: { type: integer }
        recipe_id: { type: integer }
        food_id: { type: integer, nullable: true }
        food_name: { type: string, nullable: true, description: "JOIN結果" }
        raw_name: { type: string, nullable: true, description: "LLM生表記、food_id未解決時に使用" }
        quantity: { type: number, nullable: true }
        unit: { type: string, nullable: true }
        is_main: { type: boolean }
        notes: { type: string, nullable: true }

    RecipeCreate:
      type: object
      properties:
        name: { type: string }
        instructions_md: { type: string }
        cook_time_min: { type: integer, nullable: true }
        cost_estimate: { type: string, nullable: true }
        source: { type: string, enum: [llm, external, manual], default: manual }
        ingredients:
          type: array
          items:
            type: object
            properties:
              food_id: { type: integer, nullable: true }
              raw_name: { type: string, nullable: true }
              quantity: { type: number, nullable: true }
              unit: { type: string, nullable: true }
              is_main: { type: boolean, default: false }
              notes: { type: string, nullable: true }
      required: [name, instructions_md, ingredients]

    RecipeUpdate:
      type: object
      properties:
        name: { type: string }
        instructions_md: { type: string }
        cook_time_min: { type: integer, nullable: true }
        cost_estimate: { type: string, nullable: true }
        is_favorite: { type: boolean }

    RecipeSuggestRequest:
      type: object
      properties:
        ingredient_food_ids: { type: array, items: { type: integer } }
        ingredient_names: { type: array, items: { type: string }, description: "未解決名でもOK、内部でエイリアス解決" }
        limit: { type: integer, default: 3, maximum: 10 }
        cook_time_max_min: { type: integer, nullable: true }
      anyOf:
        - required: [ingredient_food_ids]
        - required: [ingredient_names]

    RecipeSuggestResponse:
      type: object
      properties:
        recipes:
          type: array
          items: { $ref: '#/components/schemas/Recipe' }
        from_db: { type: integer, description: "既存DBから取得した件数" }
        from_llm: { type: integer, description: "LLMで新規生成した件数" }
        unresolved_ingredients: { type: array, items: { type: string }, description: "解決できなかった食材名" }

    RecipeRating:
      type: object
      properties:
        id: { type: integer }
        recipe_id: { type: integer }
        profile_id: { type: integer }
        score: { type: integer, minimum: 1, maximum: 5 }
        comment: { type: string, nullable: true }
        created_at: { type: string, format: date-time }

    # ===== MealPlan / Meal =====
    MealStatus:
      type: string
      enum: [planned, cooked, skipped]

    MealPlanStatus:
      type: string
      enum: [draft, confirmed, completed, cancelled]

    MealType:
      type: string
      enum: [breakfast, lunch, dinner, snack]

    MealPlan:
      type: object
      properties:
        id: { type: integer }
        start_date: { type: string, format: date }
        end_date: { type: string, format: date }
        status: { $ref: '#/components/schemas/MealPlanStatus' }
        notes: { type: string, nullable: true }
        meals:
          type: array
          items: { $ref: '#/components/schemas/Meal' }
        created_at: { type: string, format: date-time }
        updated_at: { type: string, format: date-time }
      required: [id, start_date, end_date, status]

    MealPlanCreate:
      type: object
      properties:
        start_date: { type: string, format: date }
        days: { type: integer, minimum: 1, maximum: 14, default: 7, description: "献立生成日数（end_date は自動算出）" }
        preferences: { type: string, nullable: true, description: "LLMへの自然言語要望（例: 和食多め、30分以内）" }
        meal_types: { type: array, items: { $ref: '#/components/schemas/MealType' }, default: [dinner] }
      required: [start_date]

    Meal:
      type: object
      properties:
        id: { type: integer }
        meal_plan_id: { type: integer, nullable: true }
        recipe_id: { type: integer, nullable: true, description: "詳細レシピ生成済みなら設定" }
        recipe:
          $ref: '#/components/schemas/Recipe'
          nullable: true
        served_date: { type: string, format: date }
        meal_type: { $ref: '#/components/schemas/MealType' }
        status: { $ref: '#/components/schemas/MealStatus' }
        # v0.4 新規フィールド（設計反映書 C-02）
        concept: { type: string, nullable: true, description: "料理コンセプト（例: 豚の生姜焼き）" }
        estimated_ingredients:
          type: array
          nullable: true
          description: "スケルトン段階の材料推定（文字列配列）"
          items: { type: string }
        cook_time_min_estimate: { type: integer, nullable: true, description: "概算調理時間（分）" }
        detail_status:
          type: string
          enum: [concept_only, full_recipe]
          nullable: true
          description: "概要のみか詳細レシピ生成済みか（recipe_id の有無から派生）"
        notes: { type: string, nullable: true }

    MealRating:
      type: object
      properties:
        id: { type: integer }
        meal_id: { type: integer }
        profile_id: { type: integer }
        score: { type: integer, minimum: 1, maximum: 5 }
        comment: { type: string, nullable: true }

    # ===== Shopping =====
    ShoppingList:
      type: object
      properties:
        id: { type: integer }
        meal_plan_id: { type: integer, nullable: true }
        name: { type: string, nullable: true }
        status: { type: string, enum: [draft, active, completed] }
        items:
          type: array
          items: { $ref: '#/components/schemas/ShoppingItem' }
        created_at: { type: string, format: date-time }
        updated_at: { type: string, format: date-time }

    ShoppingItem:
      type: object
      properties:
        id: { type: integer }
        list_id: { type: integer }
        food_id: { type: integer, nullable: true }
        food_name: { type: string, nullable: true }
        name: { type: string, nullable: true, description: "food_id NULL時の自由入力" }
        quantity: { type: number, nullable: true }
        unit: { type: string, nullable: true }
        purchased: { type: boolean }
        notes: { type: string, nullable: true }
        needs_review: { type: boolean, description: "単位違いで要確認の場合 true" }

    ShoppingItemCreate:
      type: object
      properties:
        food_id: { type: integer, nullable: true }
        name: { type: string, nullable: true }
        quantity: { type: number, nullable: true }
        unit: { type: string, nullable: true }
        notes: { type: string, nullable: true }
      anyOf:
        - required: [food_id]
        - required: [name]

    # ===== Agent =====
    AgentChatRequest:
      type: object
      properties:
        message: { type: string }
        session_id: { type: string, nullable: true }
        context: { type: object, nullable: true }
      required: [message]

    AgentChatResponse:
      type: object
      properties:
        session_id: { type: string }
        intent: { type: string }
        agent: { type: string }
        result: { type: object }
        follow_up_suggestions:
          type: array
          items: { type: string }

# ============================================================
# Paths
# ============================================================
paths:

  # ===== Foods =====
  /foods:
    get:
      summary: 食材マスタ一覧
      tags: [Foods]
      parameters:
        - { name: q, in: query, schema: { type: string }, description: 食材名部分一致 }
        - { name: category, in: query, schema: { $ref: '#/components/schemas/FoodCategory' } }
        - { name: limit, in: query, schema: { type: integer, default: 20 } }
        - { name: cursor, in: query, schema: { type: string } }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/PaginationEnvelope'
                  - type: object
                    properties:
                      items:
                        type: array
                        items: { $ref: '#/components/schemas/Food' }
    post:
      summary: 食材マスタ追加
      tags: [Foods]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/FoodCreate' }
      responses:
        '201':
          description: 作成成功
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Food' }
        '409':
          description: 同名食材が既存
          content:
            application/problem+json:
              schema: { $ref: '#/components/schemas/Problem' }

  /foods/{food_id}:
    get:
      summary: 食材マスタ詳細
      tags: [Foods]
      parameters:
        - { name: food_id, in: path, required: true, schema: { type: integer } }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Food' }
        '404':
          description: 未存在
    patch:
      summary: 食材マスタ更新
      tags: [Foods]
      parameters:
        - { name: food_id, in: path, required: true, schema: { type: integer } }
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/FoodCreate' }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Food' }
    delete:
      summary: 食材マスタ削除
      tags: [Foods]
      parameters:
        - { name: food_id, in: path, required: true, schema: { type: integer } }
      responses:
        '204': { description: 削除成功 }
        '409':
          description: 参照あり（recipe/stock等）

  /foods/{food_id}/aliases:
    get:
      summary: エイリアス一覧
      tags: [Foods]
      parameters:
        - { name: food_id, in: path, required: true, schema: { type: integer } }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/FoodAlias' }
    post:
      summary: エイリアス追加
      tags: [Foods]
      parameters:
        - { name: food_id, in: path, required: true, schema: { type: integer } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/FoodAliasCreate' }
      responses:
        '201':
          description: 作成成功

  /food-aliases/{alias_id}:
    delete:
      summary: エイリアス削除
      tags: [Foods]
      parameters:
        - { name: alias_id, in: path, required: true, schema: { type: integer } }
      responses:
        '204': { description: 削除成功 }

  # ===== Family Profiles =====
  /family-profiles:
    get:
      summary: 家族プロファイル一覧
      tags: [FamilyProfiles]
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/FamilyProfile' }

  /family-profiles/{profile_id}:
    get:
      tags: [FamilyProfiles]
      parameters:
        - { name: profile_id, in: path, required: true, schema: { type: integer } }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/FamilyProfile' }
    patch:
      tags: [FamilyProfiles]
      parameters:
        - { name: profile_id, in: path, required: true, schema: { type: integer } }
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/FamilyProfileUpdate' }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/FamilyProfile' }

  # ===== Inventory =====
  /inventory:
    get:
      summary: 在庫一覧
      tags: [Inventory]
      parameters:
        - { name: category, in: query, schema: { $ref: '#/components/schemas/FoodCategory' } }
        - { name: expiring_within_days, in: query, schema: { type: integer } }
        - { name: limit, in: query, schema: { type: integer, default: 50 } }
        - { name: cursor, in: query, schema: { type: string } }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/PaginationEnvelope'
                  - type: object
                    properties:
                      items:
                        type: array
                        items: { $ref: '#/components/schemas/StockItem' }
    post:
      summary: 在庫追加
      description: |
        stock_item を作成し、初期 'in' トランザクションも自動INSERTする。
        サーバー側でトランザクション境界を保証。
      tags: [Inventory]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/StockItemCreate' }
      responses:
        '201':
          description: 作成成功
          content:
            application/json:
              schema: { $ref: '#/components/schemas/StockItem' }

  /inventory/expiring:
    get:
      summary: 期限切迫品取得
      tags: [Inventory]
      parameters:
        - { name: days, in: query, schema: { type: integer, default: 3 } }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/StockItem' }

  /inventory/{stock_id}:
    get:
      tags: [Inventory]
      parameters:
        - { name: stock_id, in: path, required: true, schema: { type: integer } }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/StockItem' }
    patch:
      tags: [Inventory]
      parameters:
        - { name: stock_id, in: path, required: true, schema: { type: integer } }
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/StockItemUpdate' }
      responses:
        '200': { description: OK }
    delete:
      tags: [Inventory]
      parameters:
        - { name: stock_id, in: path, required: true, schema: { type: integer } }
        - { name: force, in: query, schema: { type: boolean, default: false } }
      responses:
        '204': { description: 削除成功 }
        '409': { description: quantity > 0 で force=false }

  /inventory/{stock_id}/transactions:
    get:
      tags: [Inventory]
      parameters:
        - { name: stock_id, in: path, required: true, schema: { type: integer } }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/StockTransaction' }
    post:
      summary: トランザクション記録（在庫増減）
      tags: [Inventory]
      parameters:
        - { name: stock_id, in: path, required: true, schema: { type: integer } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/StockTransactionCreate' }
      responses:
        '201':
          description: 記録成功
          content:
            application/json:
              schema: { $ref: '#/components/schemas/StockTransaction' }

  # ===== Recipes =====
  /recipes:
    get:
      tags: [Recipes]
      parameters:
        - { name: q, in: query, schema: { type: string } }
        - { name: cook_time_max, in: query, schema: { type: integer } }
        - { name: favorite_only, in: query, schema: { type: boolean } }
        - { name: include_archived, in: query, schema: { type: boolean, default: false } }
        - { name: limit, in: query, schema: { type: integer, default: 20 } }
        - { name: cursor, in: query, schema: { type: string } }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/PaginationEnvelope'
                  - type: object
                    properties:
                      items:
                        type: array
                        items: { $ref: '#/components/schemas/Recipe' }
    post:
      tags: [Recipes]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/RecipeCreate' }
      responses:
        '201':
          description: 作成成功
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Recipe' }

  /recipes/{recipe_id}:
    get:
      tags: [Recipes]
      parameters:
        - { name: recipe_id, in: path, required: true, schema: { type: integer } }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Recipe' }
    patch:
      tags: [Recipes]
      parameters:
        - { name: recipe_id, in: path, required: true, schema: { type: integer } }
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/RecipeUpdate' }
      responses:
        '200': { description: OK }

  /recipes/{recipe_id}/archive:
    post:
      tags: [Recipes]
      parameters:
        - { name: recipe_id, in: path, required: true, schema: { type: integer } }
      responses:
        '200': { description: アーカイブ完了 }

  /recipes/{recipe_id}/unarchive:
    post:
      tags: [Recipes]
      parameters:
        - { name: recipe_id, in: path, required: true, schema: { type: integer } }
      responses:
        '200': { description: 復元完了 }

  /recipes/suggest:
    post:
      summary: 食材指定レシピ提案（F-MEAL-11）
      tags: [Recipes]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/RecipeSuggestRequest' }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/RecipeSuggestResponse' }

  /recipes/suggest-by-expiry:
    post:
      summary: 期限切迫品ベースのレシピ提案
      tags: [Recipes]
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                days: { type: integer, default: 3 }
                limit: { type: integer, default: 3 }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/RecipeSuggestResponse' }

  /recipes/{recipe_id}/ratings:
    get:
      tags: [Recipes]
      parameters:
        - { name: recipe_id, in: path, required: true, schema: { type: integer } }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/RecipeRating' }
    post:
      summary: 評価を追加 or 更新（UPSERT）
      tags: [Recipes]
      parameters:
        - { name: recipe_id, in: path, required: true, schema: { type: integer } }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                profile_id: { type: integer }
                score: { type: integer, minimum: 1, maximum: 5 }
                comment: { type: string, nullable: true }
              required: [profile_id, score]
      responses:
        '200': { description: OK }
        '201': { description: 新規作成 }

  # ===== MealPlans =====
  /meal-plans:
    get:
      tags: [MealPlans]
      parameters:
        - { name: status, in: query, schema: { $ref: '#/components/schemas/MealPlanStatus' } }
        - { name: limit, in: query, schema: { type: integer, default: 20 } }
        - { name: cursor, in: query, schema: { type: string } }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/MealPlan' }
    post:
      summary: 献立計画生成（スケルトン、LLM呼び出し）
      description: |
        LLM(Sonnet)で指定日数分の献立スケルトンを生成する。
        各 meal には concept, estimated_ingredients, cook_time_min_estimate が含まれる。
        詳細レシピ（recipe_id）は別途 POST /meals/{id}/recipe でオンデマンド生成。
        想定応答時間: 15-25秒。タイムアウト: 60秒。
      tags: [MealPlans]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/MealPlanCreate' }
      responses:
        '201':
          description: スケルトン生成完了（詳細レシピは含まれない）
          content:
            application/json:
              schema: { $ref: '#/components/schemas/MealPlan' }
        '502':
          description: LLMエージェントエラー

  /meal-plans/{plan_id}:
    get:
      tags: [MealPlans]
      parameters:
        - { name: plan_id, in: path, required: true, schema: { type: integer } }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/MealPlan' }
    patch:
      tags: [MealPlans]
      parameters:
        - { name: plan_id, in: path, required: true, schema: { type: integer } }
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                notes: { type: string }
      responses:
        '200': { description: OK }

  /meal-plans/{plan_id}/complete:
    post:
      summary: 計画完了化（補助関数 complete_meal_plan）
      tags: [MealPlans]
      parameters:
        - { name: plan_id, in: path, required: true, schema: { type: integer } }
        - { name: force, in: query, schema: { type: boolean, default: false } }
      responses:
        '200': { description: 完了化成功 }
        '409': { description: planned が残っており force=false }

  /meal-plans/{plan_id}/cancel:
    post:
      tags: [MealPlans]
      parameters:
        - { name: plan_id, in: path, required: true, schema: { type: integer } }
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                reason: { type: string }
      responses:
        '200': { description: キャンセル成功 }

  /meal-plans/{plan_id}/meals:
    get:
      tags: [MealPlans]
      parameters:
        - { name: plan_id, in: path, required: true, schema: { type: integer } }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/Meal' }

  /meal-plans/{plan_id}/shopping-list:
    get:
      tags: [MealPlans]
      parameters:
        - { name: plan_id, in: path, required: true, schema: { type: integer } }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ShoppingList' }

  # ===== Meals =====
  /meals/{meal_id}:
    get:
      tags: [Meals]
      parameters:
        - { name: meal_id, in: path, required: true, schema: { type: integer } }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Meal' }
    patch:
      tags: [Meals]
      parameters:
        - { name: meal_id, in: path, required: true, schema: { type: integer } }
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                recipe_id: { type: integer, nullable: true }
                notes: { type: string }
      responses:
        '200': { description: OK }

  /meals/{meal_id}/recipe:
    post:
      summary: meal の詳細レシピをオンデマンド生成
      description: |
        meal の concept と estimated_ingredients を元に詳細レシピを生成する。
        既存DB に類似レシピがあれば再利用（reuse_count++）、なければ Sonnet で新規生成。
        生成後 meal.recipe_id を設定する。
        想定応答時間: 5-10秒。
      tags: [Meals]
      parameters:
        - { name: meal_id, in: path, required: true, schema: { type: integer } }
      responses:
        '201':
          description: 生成成功
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Recipe' }
        '404':
          description: meal 未存在
        '502':
          description: LLMエージェントエラー

  /meals/{meal_id}/consume:
    post:
      summary: 調理完了 → 在庫消費
      description: |
        meal.status を 'cooked' に更新し、レシピ材料分の在庫を消費する。
        サーバー側でDBトランザクションとして処理（複数 stock_transaction INSERT + meal UPDATE）。
        単位違いで在庫マッチできない材料は warnings に列挙される。
      tags: [Meals]
      parameters:
        - { name: meal_id, in: path, required: true, schema: { type: integer } }
      responses:
        '200':
          description: 消費成功
          content:
            application/json:
              schema:
                type: object
                properties:
                  meal: { $ref: '#/components/schemas/Meal' }
                  consumed_items:
                    type: array
                    items: { $ref: '#/components/schemas/StockTransaction' }
                  warnings:
                    type: array
                    items: { type: string }

  /meals/{meal_id}/skip:
    post:
      tags: [Meals]
      parameters:
        - { name: meal_id, in: path, required: true, schema: { type: integer } }
      responses:
        '200': { description: スキップ成功 }

  /meals/{meal_id}/ratings:
    post:
      tags: [Meals]
      parameters:
        - { name: meal_id, in: path, required: true, schema: { type: integer } }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                profile_id: { type: integer }
                score: { type: integer, minimum: 1, maximum: 5 }
                comment: { type: string, nullable: true }
              required: [profile_id, score]
      responses:
        '200': { description: OK }
        '201': { description: 新規作成 }

  # ===== Shopping Lists =====
  /shopping-lists:
    get:
      tags: [ShoppingLists]
      parameters:
        - { name: status, in: query, schema: { type: string, enum: [draft, active, completed] } }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/ShoppingList' }
    post:
      tags: [ShoppingLists]
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                meal_plan_id: { type: integer, nullable: true }
                name: { type: string, nullable: true }
      responses:
        '201':
          description: 作成成功
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ShoppingList' }

  /shopping-lists/{list_id}:
    get:
      tags: [ShoppingLists]
      parameters:
        - { name: list_id, in: path, required: true, schema: { type: integer } }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ShoppingList' }
    patch:
      tags: [ShoppingLists]
      parameters:
        - { name: list_id, in: path, required: true, schema: { type: integer } }
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                status: { type: string }
                name: { type: string }
      responses:
        '200': { description: OK }

  /shopping-lists/{list_id}/items:
    post:
      tags: [ShoppingLists]
      parameters:
        - { name: list_id, in: path, required: true, schema: { type: integer } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/ShoppingItemCreate' }
      responses:
        '201':
          description: 作成成功
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ShoppingItem' }

  /shopping-lists/{list_id}/items/{item_id}:
    patch:
      tags: [ShoppingLists]
      parameters:
        - { name: list_id, in: path, required: true, schema: { type: integer } }
        - { name: item_id, in: path, required: true, schema: { type: integer } }
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                purchased: { type: boolean }
                quantity: { type: number }
                unit: { type: string }
                notes: { type: string }
      responses:
        '200': { description: OK }
    delete:
      tags: [ShoppingLists]
      parameters:
        - { name: list_id, in: path, required: true, schema: { type: integer } }
        - { name: item_id, in: path, required: true, schema: { type: integer } }
      responses:
        '204': { description: 削除成功 }

  # ===== Health =====（設計反映書 C-03）
  /health:
    get:
      summary: 単純な生存確認（認証不要）
      security: []
      tags: [Health]
      responses:
        '200':
          description: OK
          content:
            text/plain:
              schema: { type: string, example: "OK" }

  /api/v1/health/live:
    get:
      summary: backend プロセス生存確認（認証不要）
      security: []
      tags: [Health]
      responses:
        '200':
          description: 生存
          content:
            application/json:
              schema:
                type: object
                properties:
                  status: { type: string, example: "alive" }
                  uptime_sec: { type: integer }
                  version: { type: string }

  /api/v1/health/ready:
    get:
      summary: 依存システムを含めた準備完了確認
      tags: [Health]
      responses:
        '200':
          description: 準備完了
          content:
            application/json:
              schema:
                type: object
                properties:
                  status: { type: string, enum: [ready, degraded, not_ready] }
                  checks:
                    type: object
                    properties:
                      db: { type: object, properties: { ok: { type: boolean }, latency_ms: { type: integer } } }
                      llm: { type: object, properties: { ok: { type: boolean } } }
                      nas_mount: { type: object, properties: { ok: { type: boolean }, writable: { type: boolean } } }
        '503':
          description: 準備未完了

  # ===== Admin =====（設計反映書 C-01）
  /admin/normalize-food-aliases:
    post:
      summary: 食材名正規化バッチを起動
      description: recipe_ingredient.food_id IS NULL の行を Haiku で正規化する。cron からの定期実行が主用途。
      tags: [Admin]
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                limit: { type: integer, default: 50 }
                confidence_threshold: { type: number, default: 0.7 }
      responses:
        '200':
          description: 処理結果
          content:
            application/json:
              schema:
                type: object
                properties:
                  processed_count: { type: integer }
                  matched_to_existing: { type: integer }
                  new_aliases_created: { type: integer }
                  flagged_for_review: { type: integer }
                  duration_ms: { type: integer }

  /admin/llm-cost-summary:
    get:
      summary: LLM呼出履歴サマリ（Phase 2 実装予定）
      tags: [Admin]
      parameters:
        - { name: from, in: query, schema: { type: string, format: date } }
        - { name: to, in: query, schema: { type: string, format: date } }
      responses:
        '200':
          description: サマリ
          content:
            application/json:
              schema:
                type: object
                properties:
                  period: { type: object }
                  total_calls: { type: integer }
                  total_cost_yen_estimate: { type: number }
                  by_model: { type: object }

  # ===== Agent =====
  /agent/chat:
    post:
      summary: エージェント自然言語インターフェース
      description: |
        LangGraphのインテントルーター（Haiku）で意図解析し、適切なエージェントを起動する統合エンドポイント。
        内部で他エンドポイントの操作を実行する場合もある。
      tags: [Agent]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/AgentChatRequest' }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/AgentChatResponse' }
```

---

## 8. 未確定事項（要決定）

| # | 論点 | 現在の前提 | 要決定理由 |
|---|------|----------|----------|
| API-01 | 認証方式 | X-API-Key（共有1キー） | LAN内とはいえ無認証にするか、もう少し堅くするかの選択肢あり |
| API-02 | meal-plan 生成の同期/非同期 | 同期前提 | LLM 30秒程度なら同期でOK。タイムアウト次第で非同期化検討 |
| API-03 | エージェントAPI（/agent/chat）と個別REST APIの使い分け | 両方提供 | フロント実装でどちらを主に使うか、設計時に明確化 |
| API-04 | レート制限値 | Caddy で設定 | 家庭内利用なので緩めでOK、具体値は後で |
| API-05 | レスポンスの埋め込み深度 | meal_plan に meals[] を埋め込む | 大規模化したら別エンドポイントに分離 |
| API-06 | 部分応答（GraphQL的な fields パラメータ） | サポートしない | YAGNI判断 |

---

## 9. 次のアクション

1. ~~OpenAPI定義作成~~ ✅本書
2. ~~未確定事項（API-01〜API-06）の意思決定~~ ✅（API-02: 同期確定、API-03: REST主体）
3. ~~LangGraph ステートグラフ設計~~ ✅
4. ~~docker-compose.yml の骨組み~~ ✅
5. PoC 実装
   - ~~Phase 0a〜0c~~ ✅（2026-06-05完了）
   - **Phase 1: PWA MVP** ← 次はここ
   - Phase 2: 離乳食対応、画像認識、LLM最適化

## Phase 0c 実装済みエンドポイント（2026-06-05）

| メソッド | パス | ステータス |
|---------|-----|---------|
| POST | `/api/v1/meal-plans` | ✅ 実装済み |
| GET | `/api/v1/meal-plans` | ✅ 実装済み |
| GET | `/api/v1/meal-plans/{id}` | ✅ 実装済み |
| POST | `/api/v1/meals/{id}/recipe` | ✅ 実装済み |
| GET | `/api/v1/recipes/{id}` | ✅ 実装済み |
