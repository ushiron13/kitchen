.PHONY: help install migrate seed dev test lint docker-up docker-down docker-dev docker-logs

help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "  install    uv sync (backend依存解決)"
	@echo "  migrate    Alembicマイグレーション実行"
	@echo "  seed       シードデータ投入"
	@echo "  dev        FastAPI をローカルで起動 (hot-reload)"
	@echo "  test       pytestを実行"
	@echo "  lint       ruff + mypy"
	@echo "  docker-up  本番構成で起動"
	@echo "  docker-dev 開発構成で起動 (hot-reload)"
	@echo "  docker-down  コンテナ停止"
	@echo "  docker-logs  ログ表示"

install:
	cd backend && uv sync

migrate:
	cd backend && uv run alembic upgrade head

seed:
	cd backend && uv run python -m src.scripts.seed_data

dev:
	cd backend && uv run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload

test:
	cd backend && uv run pytest tests/ -v --cov=src

lint:
	cd backend && uv run ruff check src/ && uv run ruff format --check src/ && uv run mypy src/

docker-up:
	docker compose up -d

docker-dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

docker-migrate:
	docker compose exec backend uv run alembic upgrade head

docker-backup:
	docker compose exec scheduler /scripts/backup_sqlite.sh
