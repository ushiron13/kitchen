# 🥘 Kitchen Manager

家庭用在庫管理・献立提案エージェントシステム

## 技術スタック

| レイヤー | 採用技術 |
|---------|---------|
| フロントエンド | React 18 + TypeScript + Vite (PWA) |
| バックエンド | FastAPI + SQLAlchemy (async) |
| エージェント | LangGraph + Claude (Sonnet) |
| DB | SQLite (PCローカル) + NAS バックアップ |
| インフラ | Docker Compose + Caddy (HTTPS) |
| CI | GitHub Actions |

## クイックスタート（WSL2 + uv）

### 前提条件

- Windows 11 + WSL2 (Ubuntu 22.04+)
- Docker Desktop with WSL2 integration 有効
- Python 3.12+ in WSL2
- Node.js 20+ in WSL2
- uv: `curl -LsSf https://astral.sh/uv/install.sh | sh`
- mkcert: `sudo apt install libnss3-tools && brew install mkcert` or via npm

> ⚠️ プロジェクトは必ず WSL2 のホームディレクトリに clone すること。
> `/mnt/c/...` など Windows 側は Docker ボリュームのパフォーマンスが大幅低下する。

### 1. リポジトリ取得

```bash
cd ~  # WSL2 のホーム
git clone <your-repo-url> kitchen
cd kitchen
```

### 2. 環境変数設定

```bash
cp .env.example .env
# .env を編集:
#   ANTHROPIC_API_KEY=sk-ant-...
#   KITCHEN_API_KEY=$(openssl rand -hex 32)
```

### 3. TLS 証明書発行（初回のみ）

```bash
mkcert -install
cd caddy/certs
mkcert kitchen.local
# → kitchen.local.pem / kitchen.local-key.pem が生成される
cd ../..

# ルートCAをスマホ/PCに配布
mkcert -CAROOT  # rootCA.pem の場所を表示
```

### 4. DNS 設定

ルータ or hosts ファイル (`/etc/hosts` in WSL2 / Windows both) に追加:
```
192.168.x.xxx  kitchen.local  # 自宅PCのIPアドレス
```

### 5. Backend セットアップ

```bash
make install    # uv sync
make migrate    # Alembic マイグレーション
```

### 6. Frontend ビルド

```bash
cd frontend
npm install
npm run build
cd ..
```

### 7. Docker 起動

```bash
make docker-up
# または開発モード（バックエンド hot-reload）
make docker-dev
```

### 8. 動作確認

```bash
# Backend ヘルスチェック
curl http://localhost:8000/health

# API ドキュメント
open https://kitchen.local/api/docs
```

---

## 開発フロー

### ブランチ戦略

```
main          ← リリース済み安定版
develop       ← 開発統合ブランチ（PR/マージ先）
feature/F-XX  ← 機能ブランチ（develop から派生）
docs/         ← ドキュメント更新専用
```

### バックエンド開発（ローカル直実行）

```bash
make dev  # uvicorn hot-reload
# .env の DB_PATH=./data/app.db でローカルSQLiteを使用
```

### VS Code タスク

| タスク | 説明 |
|--------|-----|
| Backend: install | uv sync |
| Backend: migrate | alembic upgrade head |
| Docker: up (dev) | ホットリロード付きで起動 |

### テスト

```bash
make test
make lint
```

---

## API エンドポイント（Phase 2 時点）

> すべてのエンドポイントは `X-API-Key` ヘッダー認証が必要（`/health` 除く）。

### 食材・在庫

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/v1/foods` | 食材マスタ一覧（`?category=` フィルタ可） |
| POST | `/api/v1/foods` | 食材マスタ登録 |
| PATCH | `/api/v1/foods/{id}` | 食材マスタ編集（名前・カテゴリ等） |
| DELETE | `/api/v1/foods/{id}` | 食材削除（在庫参照があれば 409） |
| GET | `/api/v1/stock` | 在庫一覧（`?category=` / `?food_id=` フィルタ可） |
| POST | `/api/v1/stock` | 在庫追加 |
| PATCH | `/api/v1/stock/{id}` | 在庫編集（数量・単位・消費期限） |
| POST | `/api/v1/stock/{id}/transactions` | 消費・廃棄など記録 |
| DELETE | `/api/v1/stock/{id}` | 在庫削除 |

### 献立プラン

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/v1/meal-plans` | 在庫から献立スケルトン生成（LLM, ~25秒） |
| GET | `/api/v1/meal-plans` | 献立プラン一覧 |
| GET | `/api/v1/meal-plans/{id}` | 献立プラン取得（meals 含む） |
| DELETE | `/api/v1/meal-plans/{id}` | プラン + 全 meal を削除（cascade） |
| GET | `/api/v1/meal-plans/{id}/shopping-list` | 買い物リスト生成 |

### 献立（Meal）

| メソッド | パス | 説明 |
|---------|------|------|
| PATCH | `/api/v1/meals/{id}/status` | 実施状態更新（planned/cooked/skipped） |
| DELETE | `/api/v1/meals/{id}` | 個別 meal 削除 |
| POST | `/api/v1/meals/{id}/recipe` | レシピ詳細生成（LLM）または再利用 |

### レシピ

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/v1/recipes/{id}` | レシピ取得 |
| GET | `/api/v1/recipes` | レシピ一覧（`?q=` / `?food_name=` 検索可） |
| POST | `/api/v1/recipes/suggest` | 在庫食材からレシピ提案（LLM） |

### ヘルス

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/v1/health/live` | プロセス生存確認（認証不要） |
| GET | `/api/v1/health/ready` | DB 疎通確認 |

### 献立生成の使い方

```bash
# 1. 在庫から7日分の夕食スケルトンを生成
curl -s -X POST https://kitchen.local/api/v1/meal-plans \
  -H "X-API-Key: $KITCHEN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"start_date":"2026-06-06","days":7,"meal_types":["dinner"],"preferences":"和食多め"}' | jq .

# 2. 取得した meal_id のレシピ詳細を生成
curl -s -X POST https://kitchen.local/api/v1/meals/1/recipe \
  -H "X-API-Key: $KITCHEN_API_KEY" | jq .

# 3. 実際に作ったか記録
curl -s -X PATCH https://kitchen.local/api/v1/meals/1/status \
  -H "X-API-Key: $KITCHEN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"cooked"}'
```

---

## ロードマップ

### 完了済み

- **Phase 0a** ✅ プロジェクトスキャフォールド、health エンドポイント
- **Phase 0b** ✅ 在庫 CRUD 最小実装
- **Phase 0c** ✅ スケルトン献立提案 + レシピ詳細生成 + PWA UI
- **Phase 1 hotfix** ✅ B-01〜B-03 バグ修正
- **Phase 2（進行中）**
  - ✅ F-06: 献立プラン・個別献立の削除
  - ✅ F-01: 食材マスター・在庫の編集・削除 UI
  - ✅ F-02: 食材カテゴリ絞り込み・並び替え
  - ✅ F-04: レシピ「生成/参照」ボタンの明確分離
  - ✅ F-07: 献立の実施記録（作った/スキップ）+ 好み蓄積スキーマ

### 未着手

- **Phase 2 残**
  - F-05: ユーザープロファイル（固定嗜好・家族構成）
  - F-03: 食材の保存日数目安表示
- **Phase 3（計画中）**
  - F-08: 好み学習に基づく献立提案改善
    - `meal.status` + `meal_feedback` の蓄積データを LLM プロンプトに注入
    - スキップ傾向の高い食材・コンセプトを自動的に避ける
  - 離乳食対応、画像認識、LLM コスト最適化

---

## ドキュメント

| ファイル | 内容 |
|---------|------|
| `docs/要件定義書_v0.3.md` | 機能要件・非機能要件 |
| `docs/設計反映書_v0.4.md` | Critical 3件の設計変更（C-01〜C-03） |
| `docs/データモデル詳細設計書_v0.3.md` | ER図・テーブル仕様・DDL（v0.5追記含む） |
| `docs/OpenAPI設計書_v0.1.md` | API スキーマ定義 |
| `docs/LangGraphステートグラフ設計書_v0.1.md` | LangGraph 設計 |
| `docs/システム構成図_v0.3.md` | インフラ・シーケンス図 |
| `docs/改善バックログ_v1.0.md` | 機能改善・バグトラッキング |
