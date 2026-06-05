import os
import time
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import text

from src.core.config import settings
from src.core.database import async_session
from src.core.security import verify_api_key

router = APIRouter(prefix="/health", tags=["Health"])
_start_time = time.time()


@router.get("/live", include_in_schema=True)
async def live():
    """backend プロセス生存確認（認証不要）"""
    return {
        "status": "alive",
        "uptime_sec": int(time.time() - _start_time),
        "version": "0.1.0",
    }


@router.get("/ready", dependencies=[Depends(verify_api_key)])
async def ready():
    """DB・NAS接続を含む準備完了確認"""
    checks: dict = {}

    # DB
    try:
        async with async_session() as session:
            await session.execute(text("SELECT 1"))
        checks["db"] = {"ok": True}
    except Exception as e:
        checks["db"] = {"ok": False, "error": str(e)}

    # NAS
    nas_path = Path(settings.nas_images_path)
    nas_ok = nas_path.exists()
    checks["nas_mount"] = {
        "ok": nas_ok,
        "writable": nas_ok and os.access(nas_path, os.W_OK),
    }

    all_ok = all(v.get("ok", False) for v in checks.values())
    return {
        "status": "ready" if all_ok else "degraded",
        "checks": checks,
    }
