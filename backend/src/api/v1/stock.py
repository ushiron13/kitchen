from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_session
from src.core.security import verify_api_key
from src.repositories.stock import StockRepository
from src.schemas.stock import StockCreate, StockRead, StockUpdate, TxCreate

router = APIRouter(
    prefix="/stock",
    tags=["Stock"],
    dependencies=[Depends(verify_api_key)],
)


def _to_read(item) -> StockRead:
    return StockRead(
        id=item.id,
        food_id=item.food_id,
        food_name=item.food.name,
        food_category=item.food.category,
        default_shelf_days=item.food.default_shelf_days,
        quantity=item.quantity,
        unit=item.unit,
        expiry_date=item.expiry_date,
        purchased_date=item.purchased_date,
        opened=bool(item.opened),
        location=item.location,
        notes=item.notes,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.post("", response_model=StockRead, status_code=status.HTTP_201_CREATED)
async def create_stock(
    data: StockCreate,
    session: AsyncSession = Depends(get_session),
) -> StockRead:
    repo = StockRepository(session)
    try:
        item = await repo.create(data)
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid food_id",
        )
    item = await repo.get(item.id)
    return _to_read(item)


@router.get("", response_model=list[StockRead])
async def list_stock(
    category: Optional[str] = None,
    food_id: Optional[int] = None,
    session: AsyncSession = Depends(get_session),
) -> list[StockRead]:
    repo = StockRepository(session)
    items = await repo.list(category=category, food_id=food_id)
    return [_to_read(i) for i in items]


@router.get("/{item_id}", response_model=StockRead)
async def get_stock(
    item_id: int,
    session: AsyncSession = Depends(get_session),
) -> StockRead:
    repo = StockRepository(session)
    item = await repo.get(item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stock item not found")
    return _to_read(item)


@router.patch("/{item_id}", response_model=StockRead)
async def update_stock(
    item_id: int,
    data: StockUpdate,
    session: AsyncSession = Depends(get_session),
) -> StockRead:
    repo = StockRepository(session)
    item = await repo.update(item_id, data)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stock item not found")
    await session.commit()
    item = await repo.get(item_id)
    return _to_read(item)


@router.post("/{item_id}/transactions", response_model=StockRead)
async def record_transaction(
    item_id: int,
    data: TxCreate,
    session: AsyncSession = Depends(get_session),
) -> StockRead:
    """消費・廃棄・調整などの在庫変動を記録する。quantity は SQLite トリガーが自動更新する。"""
    repo = StockRepository(session)
    item = await repo.record_transaction(item_id, data)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stock item not found")
    await session.commit()
    item = await repo.get(item_id)
    return _to_read(item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stock(
    item_id: int,
    session: AsyncSession = Depends(get_session),
) -> None:
    repo = StockRepository(session)
    deleted = await repo.delete(item_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stock item not found")
    await session.commit()
