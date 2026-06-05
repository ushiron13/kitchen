# Docker Compose 設計書 v0.1

<document_meta>
- **対応文書**: 要件定義書_v0.3.md, システム構成図_v0.3.md, OpenAPI設計書_v0.2.md, LangGraphステートグラフ設計書_v0.1.md
- **作成日**: 2026-05-24
- **想定環境**: Docker Engine 24+, Docker Compose v2
</document_meta>

---

## 0. 本書の構成

| 章 | 内容 |
|----|------|
| 1 | サービス構成と責務 |
| 2 | ディレクトリ構造 |
| 3 | docker-compose.yml |
| 4 | 各サービスの Dockerfile / 設定 |
| 5 | 環境変数 (.env) |
| 6 | ボリューム・NAS連携 |
| 7 | 初期セットアップ手順 |
| 8 | 運用コマンド |
| 9 | 検討事項 |
| 10 | 次のアクション |

---

## 1. サービス構成と責務

| サービス名 | イメージ/ビルド | 役割 |
|-----------|--------------|------|
| **caddy** | `caddy:2-alpine` | リバースプロキシ、HTTPS終端、PWA静的配信、`/api/*` を backend へ転送 |
| **backend** | カスタムビルド（FastAPI + LangGraph） | API サーバ、エージェント実行、DB操作 |
| **scheduler** | カスタムビルド（Alpine + crond） | 日次バックアップ、食材名正規化バッチ |

> **MVPでは frontend 専用コンテナを設けず、Caddy で PWA 静的ファイルを直接配信**（シンプル化）。
> 開発中は別途 Vite dev server を起動。

### 1.1 サービス間通信

```
[家族端末] ──HTTPS──> [caddy] ──> /        → PWA静的
                              ──> /api/*  → [backend:8000]

[backend] ──> [SQLite (host volume)]
            ──> [NAS (bind mount)]
            ──> [Claude API (Internet)]

[scheduler] ──cron─> SQLiteバックアップ → [NAS]
                  ──cron─> POST /api/v1/admin/normalize-food → [backend]
```

---

## 2. ディレクトリ構造

```
kitchen/                          # プロジェクトルート
├── docker-compose.yml
├── .env                          # 実際の秘匿値（gitignore）
├── .env.example                  # テンプレート
├── README.md
├── data/                         # ★ PCローカルSSD（永続化）
│   └── app.db                    # SQLite本体
├── nas-mount/                    # ★ NAS のバインドマウントポイント
│   ├── backups/                  # SQLite日次バックアップ
│   └── recipe_images/            # レシピ画像
├── caddy/
│   ├── Caddyfile
│   └── certs/                    # mkcert生成（家族端末にCAインストール必要）
│       ├── kitchen.local.pem
│       └── kitchen.local-key.pem
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/                  # マイグレーション
│   ├── prompts/                  # LangGraph用プロンプト
│   │   ├── intent_classifier_v1.md
│   │   ├── meal_skeleton_v1.md
│   │   ├── recipe_generation_v1.md
│   │   ├── food_normalization_v1.md
│   │   └── meal_plan_validation_v1.md
│   └── src/
│       ├── main.py               # FastAPI エントリ
│       ├── api/                  # ルーター
│       ├── agents/               # LangGraph サブグラフ
│       ├── tools/                # LangChain ツール
│       ├── repositories/         # DB アクセス層
│       ├── models/               # Pydantic/SQLAlchemy
│       └── core/                 # 設定、ロガー等
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   ├── public/
│   └── dist/                     # ビルド成果物、Caddy がマウント
└── scheduler/
    ├── Dockerfile
    ├── crontab
    └── scripts/
        ├── backup_sqlite.sh
        └── normalize_food.sh
```

---

## 3. docker-compose.yml

```yaml
name: kitchen

services:
  caddy:
    image: caddy:2-alpine
    container_name: kitchen-caddy
    restart: unless-stopped
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - ./caddy/certs:/etc/caddy/certs:ro
      - caddy_data:/data
      - caddy_config:/config
      - ./frontend/dist:/srv/kitchen:ro
    networks:
      - kitchen-net
    depends_on:
      backend:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--spider", "http://localhost:80/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: kitchen-backend
    restart: unless-stopped
    environment:
      # 秘匿（.env から注入）
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      KITCHEN_API_KEY: ${KITCHEN_API_KEY}
      LANGCHAIN_TRACING_V2: ${LANGCHAIN_TRACING_V2:-false}
      LANGCHAIN_API_KEY: ${LANGCHAIN_API_KEY:-}
      LANGCHAIN_PROJECT: kitchen-agent
      # パス・設定
      DB_PATH: /data/app.db
      NAS_IMAGES_PATH: /nas/recipe_images
      PROMPTS_DIR: /app/prompts
      LOG_LEVEL: INFO
      TZ: Asia/Tokyo
      # CORS / セキュリティ
      ALLOWED_ORIGINS: https://kitchen.local
    volumes:
      - ./data:/data                                # SQLite本体（PCローカル）
      - ${NAS_MOUNT_PATH:-./nas-mount}:/nas         # NAS（バックアップ・画像）
      - ./backend/prompts:/app/prompts:ro
    networks:
      - kitchen-net
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s

  scheduler:
    build:
      context: ./scheduler
      dockerfile: Dockerfile
    container_name: kitchen-scheduler
    restart: unless-stopped
    environment:
      DB_PATH: /data/app.db
      NAS_BACKUP_PATH: /nas/backups
      BACKEND_URL: http://backend:8000
      KITCHEN_API_KEY: ${KITCHEN_API_KEY}
      TZ: Asia/Tokyo
    volumes:
      - ./data:/data
      - ${NAS_MOUNT_PATH:-./nas-mount}:/nas
    networks:
      - kitchen-net
    depends_on:
      backend:
        condition: service_healthy

networks:
  kitchen-net:
    driver: bridge

volumes:
  caddy_data:
  caddy_config:
```

---

## 4. 各サービスの Dockerfile / 設定

### 4.1 caddy/Caddyfile

```caddyfile
{
    # グローバル設定
    email admin@kitchen.local
    auto_https off  # LAN内のみ、Let's Encrypt 不要
}

kitchen.local, kitchen.local:443 {
    tls /etc/caddy/certs/kitchen.local.pem /etc/caddy/certs/kitchen.local-key.pem

    # API: backend に転送
    handle_path /api/* {
        reverse_proxy backend:8000 {
            # API-02: meal-plan 同期生成のため長めのタイムアウト
            transport http {
                read_timeout 90s
                write_timeout 90s
                response_header_timeout 90s
                dial_timeout 5s
            }

            # ヘッダー伝達
            header_up X-Real-IP {remote_host}
        }
    }

    # ヘルスチェック（認証不要、外部監視用）
    handle /health {
        respond "OK" 200
    }

    # PWA 静的配信（SPA フォールバック付き）
    handle {
        root * /srv/kitchen
        try_files {path} /index.html
        file_server

        # キャッシュ制御
        header {
            # 静的アセットは長期キャッシュ
            ?Cache-Control "public, max-age=31536000, immutable"
        }
        # index.html だけは no-cache
        @html path *.html
        header @html Cache-Control "no-cache"
    }

    # ログ
    log {
        output stdout
        format json
    }
}
```

> **Phase 2 検討**: Caddy本体だけではレート制限が弱い。本格的にやるなら `caddy-ratelimit` モジュールをビルドに含める。MVPでは家庭利用前提で省略。

### 4.2 backend/Dockerfile

```dockerfile
# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# 必要なシステムパッケージ
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# ===== Dependencies =====
FROM base AS deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ===== Final =====
FROM deps AS runtime
COPY alembic.ini ./
COPY alembic/ ./alembic/
COPY src/ ./src/

EXPOSE 8000

CMD ["uvicorn", "src.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--timeout-keep-alive", "120", \
     "--proxy-headers"]
```

### 4.3 backend/requirements.txt（主要パッケージ）

```
fastapi>=0.110
uvicorn[standard]>=0.27
pydantic>=2.6
pydantic-settings>=2.2
sqlalchemy>=2.0
alembic>=1.13
aiosqlite>=0.20
langgraph>=0.2
langchain>=0.2
langchain-anthropic>=0.1
langchain-core>=0.2
anthropic>=0.34
tenacity>=8.2
python-dotenv>=1.0
httpx>=0.27
```

### 4.4 scheduler/Dockerfile

```dockerfile
FROM alpine:3.19

RUN apk add --no-cache curl sqlite tzdata bash

ENV TZ=Asia/Tokyo

# crond用ディレクトリ
RUN mkdir -p /etc/periodic/15min \
             /etc/periodic/hourly \
             /etc/periodic/daily

COPY crontab /etc/crontabs/root
COPY scripts/ /scripts/
RUN chmod +x /scripts/*.sh

# crond をフォアグラウンドで起動、ログレベル 2
CMD ["crond", "-f", "-l", "2"]
```

### 4.5 scheduler/crontab

```cron
# m h dom mon dow command

# 毎日 02:00 にSQLiteバックアップ
0 2 * * * /scripts/backup_sqlite.sh >> /proc/1/fd/1 2>&1

# 毎日 03:00 に食材名正規化バッチ
0 3 * * * /scripts/normalize_food.sh >> /proc/1/fd/1 2>&1
```

### 4.6 scheduler/scripts/backup_sqlite.sh

```bash
#!/bin/bash
set -euo pipefail

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${NAS_BACKUP_PATH}"
BACKUP_FILE="${BACKUP_DIR}/app_${DATE}.db"

# バックアップディレクトリが存在しなければ作成
mkdir -p "${BACKUP_DIR}"

# SQLite online backup（WAL対応）
sqlite3 "${DB_PATH}" ".backup '${BACKUP_FILE}'"

# 圧縮
gzip "${BACKUP_FILE}"

# 30日より古いバックアップを削除
find "${BACKUP_DIR}" -name "app_*.db.gz" -mtime +30 -delete

echo "[$(date -Iseconds)] Backup completed: ${BACKUP_FILE}.gz"
```

### 4.7 scheduler/scripts/normalize_food.sh

```bash
#!/bin/bash
set -euo pipefail

# 食材名正規化バッチをトリガー
RESPONSE=$(curl -sS -X POST "${BACKEND_URL}/api/v1/admin/normalize-food-aliases" \
    -H "X-API-Key: ${KITCHEN_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{}')

echo "[$(date -Iseconds)] Normalization triggered: ${RESPONSE}"
```

---

## 5. 環境変数 (.env)

### 5.1 .env.example

```bash
# ========================================
# Anthropic / LLM
# ========================================
ANTHROPIC_API_KEY=sk-ant-...

# ========================================
# システム API キー（家族で共有）
# 生成例: openssl rand -hex 32
# ========================================
KITCHEN_API_KEY=PUT_RANDOM_32CHAR_HEX_HERE

# ========================================
# LangSmith オブザーバビリティ（任意）
# ========================================
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=ls-...

# ========================================
# パス
# ========================================
# NASのマウントポイント（ホスト側）
# 例: /mnt/nas/kitchen
NAS_MOUNT_PATH=./nas-mount
```

### 5.2 セキュリティ運用

- `.env` は `.gitignore` で除外
- `KITCHEN_API_KEY` は `openssl rand -hex 32` で生成
- ローテーション時: `.env` 更新 → `docker compose up -d` でコンテナ再作成

---

## 6. ボリューム・NAS連携

### 6.1 PC ローカルSSD

| パス（ホスト）| パス（コンテナ）| 用途 |
|-------------|---------------|------|
| `./data` | `/data` | SQLite本体（backend, scheduler） |
| `./caddy/certs` | `/etc/caddy/certs` | TLS 証明書（caddy） |
| `./frontend/dist` | `/srv/kitchen` | PWA静的ファイル（caddy） |
| `./backend/prompts` | `/app/prompts` | LLMプロンプト（backend） |

### 6.2 NAS（バインドマウント）

**ホスト側で NAS をマウント** → docker-compose でバインドマウント。

#### NFS の場合（推奨、Linux ホスト）
```bash
# /etc/fstab に追記
192.168.1.10:/volume1/kitchen /mnt/nas/kitchen nfs rw,hard,intr,noatime 0 0
```

#### SMB/CIFS の場合
```bash
# /etc/fstab に追記
//192.168.1.10/kitchen /mnt/nas/kitchen cifs username=kitchen,credentials=/etc/nas-creds,iocharset=utf8,vers=3.0 0 0
```

#### .env で指定
```bash
NAS_MOUNT_PATH=/mnt/nas/kitchen
```

### 6.3 NAS 上のディレクトリ構造

```
/mnt/nas/kitchen/        # ホスト側マウントポイント
├── backups/             # SQLite日次バックアップ（gzip圧縮）
│   ├── app_20260524_020000.db.gz
│   ├── app_20260523_020000.db.gz
│   └── ...
└── recipe_images/       # レシピ画像
    ├── 001.jpg
    └── ...
```

### 6.4 Caddy 名義のボリューム

`caddy_data`, `caddy_config` は Docker 名義ボリューム。Caddy 内部の状態（証明書情報のキャッシュ等）に使用。マウント不要。

---

## 7. 初期セットアップ手順

### 7.1 前提条件
- 自宅PC: Linux（Ubuntu/Debian推奨）or macOS or Windows + WSL2
- Docker Engine 24+ / Docker Compose v2 インストール済み
- NAS が同一LAN に存在し、NFS or SMB で共有公開済み

### 7.2 ステップバイステップ

#### STEP 1: リポジトリ取得・初期化
```bash
git clone <repo-url> kitchen
cd kitchen
cp .env.example .env
```

#### STEP 2: 秘匿値の設定
```bash
# Anthropic API キーを取得して .env に記入
# システムAPIキーを生成
echo "KITCHEN_API_KEY=$(openssl rand -hex 32)" >> .env

# （任意）LangSmith のキーを設定
```

#### STEP 3: NAS マウント設定
```bash
# fstab で永続マウント設定後
sudo mount -a
ls /mnt/nas/kitchen  # マウント確認
```

#### STEP 4: TLS 証明書発行（mkcert）
```bash
# mkcert インストール（Ubuntu）
sudo apt install libnss3-tools
brew install mkcert  # macOS
# Windows: scoop install mkcert

mkcert -install
cd caddy/certs
mkcert kitchen.local
# kitchen.local.pem / kitchen.local-key.pem が生成される

# ルートCAの場所を確認
mkcert -CAROOT
# → 出力されたパスにある rootCA.pem を家族のスマホ/PCに信頼設定
```

#### STEP 5: hosts / DNS 設定
ルータ側で `kitchen.local` → 自宅PCのIPアドレス、を解決できるよう設定。
ルータが対応しない場合は AdGuard Home などを併用。

#### STEP 6: フロントエンドビルド
```bash
cd frontend
npm install
npm run build
# → frontend/dist/ が生成される
cd ..
```

#### STEP 7: DBマイグレーション
```bash
# 初回のみ
docker compose run --rm backend alembic upgrade head
docker compose run --rm backend python -m src.scripts.seed_data
```

#### STEP 8: コンテナ起動
```bash
docker compose up -d
docker compose ps
docker compose logs -f
```

#### STEP 9: 動作確認
```bash
# ホストから
curl -k https://kitchen.local/health
# → OK

# 家族端末（同一Wi-Fi）から https://kitchen.local をブラウザで開く
# 初回ログイン画面で KITCHEN_API_KEY を入力
```

---

## 8. 運用コマンド

### 8.1 起動・停止・再起動
```bash
docker compose up -d              # 起動
docker compose down               # 停止
docker compose restart backend    # 単体再起動
```

### 8.2 ログ確認
```bash
docker compose logs -f                  # 全サービス
docker compose logs -f backend          # backend のみ
docker compose logs --tail=100 caddy    # 直近100行
```

### 8.3 マイグレーション
```bash
docker compose run --rm backend alembic upgrade head
docker compose run --rm backend alembic downgrade -1
docker compose run --rm backend alembic revision -m "add_xxx"
```

### 8.4 バックアップ手動実行
```bash
docker compose exec scheduler /scripts/backup_sqlite.sh
```

### 8.5 リストア
```bash
# 1. コンテナ停止
docker compose stop backend scheduler

# 2. 既存DBを退避、バックアップを展開
cp data/app.db data/app.db.bak
gunzip -c /mnt/nas/kitchen/backups/app_YYYYMMDD_HHMMSS.db.gz > data/app.db

# 3. 再起動
docker compose start backend scheduler
```

### 8.6 SQLite 直接アクセス
```bash
docker compose exec backend sqlite3 /data/app.db
```

### 8.7 イメージ更新
```bash
docker compose build --no-cache backend
docker compose up -d backend
```

---

## 9. 検討事項

| # | 論点 | 推奨 |
|---|------|------|
| DC-01 | TLS の発行方式 | mkcert (familiar、家族端末にCA配布が必要) / Caddy `tls internal` (Caddy自身が内部CAになる、より自動的) | **mkcert** が安定 |
| DC-02 | frontend を独立コンテナにするか | YES / NO | **NO（MVPはCaddyが直接配信）**、Phase 2 で別container検討 |
| DC-03 | レート制限 | Caddy のみ / nginx 追加 / caddy-ratelimit モジュール | **MVPはレート制限なし**、家庭利用前提 |
| DC-04 | scheduler の代替 | crond / ofelia (Docker専用cron) / Kubernetes Cronjob | **MVPは crond**、シンプル |
| DC-05 | ログの長期保管 | stdout のみ / Loki / ファイル | **MVPは stdout + Docker logs**、Phase 2 で Loki 検討 |
| DC-06 | バックアップ頻度 | 日次 / 6時間ごと / リアルタイム | **MVPは日次**、家族規模なら十分 |
| DC-07 | NAS マウント方式 | NFS / SMB | **NFS推奨**（性能、Linux相性）。Synology等の場合はSMBも可 |
| DC-08 | API ヘルスチェック実装 | 単純 200返し / DB接続確認 / LLM 接続確認 | **MVPは DB接続確認**まで |

---

## 10. 次のアクション

1. ~~docker-compose 設計~~ ✅本書
2. DC-01〜DC-08 の意思決定（多くは推奨案で進められる）
3. **PoC実装着手**
   - Phase 0a: docker-compose 起動確認、DBマイグレーション、Hello World API
   - Phase 0b: 在庫CRUD最小実装（手動入力）
   - Phase 0c: LangGraph 献立提案サブグラフ単体実装
4. PWAの実装着手（並行可）
5. シードデータ整備（食材マスタ100件）
6. プロンプトファイル整備（5種類のテンプレート）

---

## 付録A: 起動順序とヘルスチェック依存関係

```
[start]
  │
  ├── backend が起動
  │     ├── DB マイグレーション確認
  │     ├── /health 応答開始 ⇒ healthy
  │     │
  │     ├──> caddy が起動（depends_on backend healthy）
  │     │     ├── PWA静的配信開始
  │     │     ├── /api/* リバプロ開始
  │     │
  │     └──> scheduler が起動（depends_on backend healthy）
  │           └── crond 開始（2:00、3:00 に処理）
  │
[end]
```

## 付録B: トラブルシューティング

| 症状 | 確認ポイント |
|------|-------------|
| `https://kitchen.local` にアクセスできない | DNS解決、ルータ/AdGuard設定、`ping kitchen.local` |
| 「証明書が信頼されていません」 | 家族端末にmkcertのrootCAを再インストール |
| API キーが認証失敗 | `.env` の `KITCHEN_API_KEY` と PWA保存値が一致するか |
| meal-plan 生成が504 | LLM応答遅延、Anthropic API のステータス確認、`docker logs backend` |
| バックアップが失敗 | NAS マウント状態、書込権限、`docker compose exec scheduler /scripts/backup_sqlite.sh` 手動実行 |
| LangSmith に記録されない | `LANGCHAIN_TRACING_V2=true` と `LANGCHAIN_API_KEY` の設定確認 |
