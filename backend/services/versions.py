import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.versions import Versions

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class VersionsService:
    """Service layer for Versions operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any], user_id: Optional[str] = None) -> Optional[Versions]:
        """Create a new versions"""
        try:
            if user_id:
                data['user_id'] = user_id
            obj = Versions(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created versions with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating versions: {str(e)}")
            raise

    async def check_ownership(self, obj_id: int, user_id: str) -> bool:
        """Check if user owns this record"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            return obj is not None
        except Exception as e:
            logger.error(f"Error checking ownership for versions {obj_id}: {str(e)}")
            return False

    async def get_by_id(self, obj_id: int, user_id: Optional[str] = None) -> Optional[Versions]:
        """Get versions by ID (user can only see their own records)"""
        try:
            query = select(Versions).where(Versions.id == obj_id)
            if user_id:
                query = query.where(Versions.user_id == user_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching versions {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        user_id: Optional[str] = None,
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of versionss (user can only see their own records)"""
        try:
            query = select(Versions)
            count_query = select(func.count(Versions.id))
            
            if user_id:
                query = query.where(Versions.user_id == user_id)
                count_query = count_query.where(Versions.user_id == user_id)
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Versions, field):
                        query = query.where(getattr(Versions, field) == value)
                        count_query = count_query.where(getattr(Versions, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Versions, field_name):
                        query = query.order_by(getattr(Versions, field_name).desc())
                else:
                    if hasattr(Versions, sort):
                        query = query.order_by(getattr(Versions, sort))
            else:
                query = query.order_by(Versions.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching versions list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any], user_id: Optional[str] = None) -> Optional[Versions]:
        """Update versions (requires ownership)"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            if not obj:
                logger.warning(f"Versions {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key) and key != 'user_id':
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated versions {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating versions {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int, user_id: Optional[str] = None) -> bool:
        """Delete versions (requires ownership)"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            if not obj:
                logger.warning(f"Versions {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted versions {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting versions {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Versions]:
        """Get versions by any field"""
        try:
            if not hasattr(Versions, field_name):
                raise ValueError(f"Field {field_name} does not exist on Versions")
            result = await self.db.execute(
                select(Versions).where(getattr(Versions, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching versions by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Versions]:
        """Get list of versionss filtered by field"""
        try:
            if not hasattr(Versions, field_name):
                raise ValueError(f"Field {field_name} does not exist on Versions")
            result = await self.db.execute(
                select(Versions)
                .where(getattr(Versions, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Versions.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching versionss by {field_name}: {str(e)}")
            raise