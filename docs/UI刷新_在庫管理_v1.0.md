# 在庫管理 UI 刷新 実装計画 v1.0

<document_meta>
- **作成日**: 2026-06-20
- **ステータス**: 実装完了（ae60c63）
- **起点**: ユーザー要望（2026-06-20 モバイル操作改善・調味料分離）
- **対象ブランチ**: feature/F-11-12-recipe-markdown（develop へマージ後に着手）
</document_meta>

---

## 0. 課題と方針

| 課題 | 現状 | 方針 |
|------|------|------|
| モバイルで編集ステップが多い | カード → モーダル → キーボード → 完了 | 3レベル操作でほぼモーダルレスに |
| 調味料と食材が混在 | 単一リスト | タブ分割（食材 / 調味料） |
| 調味料の数量管理が不要 | 数量・期限を全食材に適用 | 調味料は「あり/なし」のみ |

**スキーマ変更なし**。既存の `food_master.category = 'seasoning'` と `stock_item` をそのまま活用する。

---

## 1. 画面構成

```
在庫管理
├── [食材] タブ  ← デフォルト
│   ├── カテゴリフィルタチップ（冷蔵 / 冷凍 / 常温 / 常温（長期））
│   ├── 期限切れアラート
│   └── 食材カード一覧（3レベル操作）
└── [調味料] タブ
    ├── [+ 調味料登録] ボタン
    └── 調味料チェックリスト（あり/なし トグル）
```

---

## 2. 食材カード（3レベル操作）

### ビジュアル

```
┌─────────────────────────────────────────┐
│ 豚バラ肉  [冷蔵]  あと2日               │
│                                         │
│  ─   [ 300 g ]   ＋         [編集…]   │
│       ↑ タップで直接編集                 │
└─────────────────────────────────────────┘
```

### レベル別操作

| レベル | 操作 | 実装 | キーボード | モーダル |
|--------|------|------|-----------|---------|
| L1 | `−` / `＋` ボタン | quantity を ±step だけ PATCH | なし | なし |
| L2 | 数量テキストをタップ | その場を `<input>` に切替、blur で PATCH | 出る（インライン） | なし |
| L3 | `編集…` ボタン | 既存 EditStockModal を開く | 状況による | あり |

### ステップサイズ（L1 の1回分）

```typescript
function getStep(unit: string): number {
  if (['g', 'ml'].includes(unit)) return 100
  if (['kg', 'L'].includes(unit)) return 0.1
  return 1   // 個・本・袋・枚・缶 など
}
```

`−` で quantity - step が 0 未満になる場合はボタンを disable する。

### L2 インライン編集の詳細

- 数量テキストをタップ → `<input type="number">` に切り替え、同サイズで表示
- `onBlur` または `Enter` キーで `PATCH /api/v1/stock/{id}` を送信
- `Escape` キーまたは値が不変の場合はキャンセル（元の表示に戻す）
- 送信中はスピナーを表示し、`<input>` を disabled に

---

## 3. 調味料タブ（あり/なし）

### ビジュアル

```
[食材]  [調味料]               + 調味料登録

☑ しょうゆ
☑ みりん
☑ 砂糖
☐ 塩          ← グレー（在庫なし）
☑ ごま油
☑ 酢
☐ 料理酒      ← グレー（在庫なし）
```

### データモデルのマッピング

| UI 状態 | データ状態 |
|---------|-----------|
| ☑ あり | `stock_item` が存在（quantity > 0） |
| ☐ なし | `stock_item` が存在しない |

### トグル操作

| 操作 | 処理 |
|------|------|
| ☑ → ☐（なし にする） | `DELETE /api/v1/stock/{item.id}` |
| ☐ → ☑（あり にする） | `POST /api/v1/stock` `{ food_id, quantity: 1, unit: '本' }` |

**「なし→あり」時のデフォルト値**: quantity=1, unit='本' を使用。調味料の数量は管理しないため値は意味を持たず、あり/なし フラグとして機能すれば十分。

### 調味料登録

既存の `AddFoodModal` を category='seasoning' 固定で流用する（新規コンポーネント不要）。

---

## 4. API 利用（変更なし）

バックエンドの変更は**不要**。すべて既存エンドポイントで実現する。

| 操作 | エンドポイント | 備考 |
|------|--------------|------|
| L1 `−` ボタン | `PATCH /api/v1/stock/{id}` `{ quantity: current - step }` | 既存 updateStock |
| L1 `＋` ボタン | `PATCH /api/v1/stock/{id}` `{ quantity: current + step }` | 同上 |
| L2 インライン編集 | `PATCH /api/v1/stock/{id}` `{ quantity: newValue }` | 同上 |
| 調味料 あり→なし | `DELETE /api/v1/stock/{id}` | 既存 deleteStock |
| 調味料 なし→あり | `POST /api/v1/stock` | 既存 createStock |
| 食材フィルタ | クライアントサイドフィルタ | category ≠ seasoning |
| 調味料リスト | クライアントサイドフィルタ | category = seasoning |

---

## 5. フロントエンドの実装詳細

### 新規コンポーネント

| コンポーネント | 役割 |
|--------------|------|
| `StockCard` | 食材カード（L1 ボタン + L2 インライン編集 + L3 編集ボタン）|
| `SeasoningTab` | 調味料チェックリスト全体 |
| `SeasoningRow` | 1行（チェックボックス + 食材名、トグル操作） |

### StockPage の変更点

- タブ状態 `activeTab: 'food' | 'seasoning'` を追加
- 食材フィルタチップから `seasoning` を除外
- `StockCard` を `StockPage` 内の既存カード描画と差し替え
- 既存 `EditStockModal` / `AddStockModal` / `EditFoodModal` / `AddFoodModal` はそのまま流用

### データフロー

```
reload() → getStock() + getFoods()
         ↓
foods.filter(category ≠ seasoning) → 食材タブ
foods.filter(category = seasoning) → 調味料タブ
  + stock を突き合わせて あり/なし を判定
```

---

## 6. 実装順序

1. `StockCard` コンポーネント（L1 ボタン + L2 インライン）
2. `StockPage` にタブ切り替えを追加、食材タブで `StockCard` を使用
3. `SeasoningRow` + `SeasoningTab` を実装
4. `StockPage` の調味料タブに `SeasoningTab` を組み込み
5. 動作確認（モバイル画面サイズ）、`npm run build`

---

## 7. スコープ外（今回やらないこと）

- バックエンドの変更
- 調味料のデフォルト単位フィールド追加（`food_master` に `default_unit` は追加しない）
- 調味料プリセットリスト（登録は手動）
- `−` ボタンでのトランザクション履歴記録（quantity を直接 PATCH するため）
