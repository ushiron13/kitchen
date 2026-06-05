# 🥘 Kitchen Manager

家庭用在庫管理・献立提案エージェントシステム

## 技術スタック

| レイヤー | 採用技術 |
|---------|---------|
| フロントエンド | React 18 + TypeScript + Vite (PWA) |
| バックエンド | FastAPI + SQLAlchemy (async) |
| エージェント | LangGraph + Claude (Sonnet/Haiku) |
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

## ロードマップ

- **Phase 0a** ✅ プロジェクトスキャフォールド、health エンドポイント
- **Phase 0b** 🔲 在庫 CRUD 最小実装
- **Phase 0c** 🔲 スケルトン献立提案 + レシピ詳細生成
- **Phase 1** 🔲 PWA MVP（家族日常利用可能）
- **Phase 2** 🔲 離乳食対応、画像認識、LLM 最適化

---

## ドキュメント

設計書は `docs/` (または別リポジトリ) を参照。
