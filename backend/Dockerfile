FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# uv インストール
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# 依存解決
FROM base AS deps
COPY pyproject.toml .
RUN uv sync --no-dev --no-install-project

# ランタイム
FROM deps AS runtime
COPY alembic.ini .
COPY alembic/ ./alembic/
COPY src/ ./src/
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
