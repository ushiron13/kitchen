from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.stock import StockItem, StockTransaction
from src.schemas.stock import StockCreate, StockUpdate, TxCreate


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


class StockRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, data: StockCreate) -> StockItem:
        now = _now()
        item = StockItem(
            food_id=data.food_id,
            quantity=0.0,  # トリガーで更新されるため初期値 0
            unit=data.unit,
            expiry_date=data.expiry_date,
            purchased_date=data.purchased_date,
            opened=1 if data.opened else 0,
            location=data.location,
            notes=data.notes,
            created_at=now,
            updated_at=now,
        )
        self.session.add(item)
        await self.session.flush()

        # 初回入庫トランザクション（SQLite トリガーが quantity を加算）
        tx = StockTransaction(
            stock_item_id=item.id,
            tx_type="in",
            quantity_delta=data.quantity,
            created_at=now,
        )
        self.session.add(tx)
        await self.session.flush()
        await self.session.refresh(item)
        return item

    async def get(self, item_id: int) -> Optional[StockItem]:
        stmt = (
            select(StockItem)
            .where(StockItem.id == item_id)
            .options(selectinload(StockItem.food))
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list(
        self,
        category: Optional[str] = None,
        food_id: Optional[int] = None,
    ) -> list[StockItem]:
        from src.models.food import FoodMaster

        stmt = (
            select(StockItem)
            .join(StockItem.food)
            .options(selectinload(StockItem.food))
            .order_by(StockItem.expiry_date.asc().nulls_last(), StockItem.id)
        )
        if food_id is not None:
            stmt = stmt.where(StockItem.food_id == food_id)
        if category:
            stmt = stmt.where(FoodMaster.category == category)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def update(self, item_id: int, data: StockUpdate) -> Optional[StockItem]:
        item = await self.get(item_id)
        if item is None:
            return None
        update_data = data.model_dump(exclude_unset=True)
        if "opened" in update_data:
            update_data["opened"] = 1 if update_data["opened"] else 0
        for field, value in update_data.items():
            setattr(item, field, value)
        item.updated_at = _now()
        await self.session.flush()
        await self.session.refresh(item)
        return item

    async def record_transaction(self, item_id: int, data: TxCreate) -> Optional[StockItem]:
        item = await self.get(item_id)
        if item is None:
            return None
        tx = StockTransaction(
            stock_item_id=item_id,
            tx_type=data.tx_type,
            quantity_delta=data.quantity_delta,
            reason=data.reason,
            created_at=_now(),
        )
        self.session.add(tx)
        await self.session.flush()
        await self.session.refresh(item)
        return item

    async def delete(self, item_id: int) -> bool:
        item = await self.session.get(StockItem, item_id)
        if item is None:
            return False
        await self.session.delete(item)
        await self.session.flush()
        return True
