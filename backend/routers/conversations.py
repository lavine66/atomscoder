import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.conversations import ConversationsService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/conversations", tags=["conversations"])


# ---------- Pydantic Schemas ----------
class ConversationsData(BaseModel):
    """Entity data schema (for create/update)"""
    project_id: int
    role: str
    content: str


class ConversationsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    project_id: Optional[int] = None
    role: Optional[str] = None
    content: Optional[str] = None


class ConversationsResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    project_id: int
    role: str
    content: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ConversationsListResponse(BaseModel):
    """List response schema"""
    items: List[ConversationsResponse]
    total: int
    skip: int
    limit: int


class ConversationsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[ConversationsData]


class ConversationsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: ConversationsUpdateData


class ConversationsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[ConversationsBatchUpdateItem]


class ConversationsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=ConversationsListResponse)
async def query_conversationss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query conversationss with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying conversationss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = ConversationsService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")
        
        result = await service.get_list(
            skip=skip, 
            limit=limit,
            query_dict=query_dict,
            sort=sort,
            user_id=str(current_user.id),
        )
        logger.debug(f"Found {result['total']} conversationss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying conversationss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=ConversationsListResponse)
async def query_conversationss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query conversationss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying conversationss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = ConversationsService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")

        result = await service.get_list(
            skip=skip,
            limit=limit,
            query_dict=query_dict,
            sort=sort
        )
        logger.debug(f"Found {result['total']} conversationss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying conversationss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=ConversationsResponse)
async def get_conversations(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single conversations by ID (user can only see their own records)"""
    logger.debug(f"Fetching conversations with id: {id}, fields={fields}")
    
    service = ConversationsService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Conversations with id {id} not found")
            raise HTTPException(status_code=404, detail="Conversations not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching conversations {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=ConversationsResponse, status_code=201)
async def create_conversations(
    data: ConversationsData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new conversations"""
    logger.debug(f"Creating new conversations with data: {data}")
    
    service = ConversationsService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create conversations")
        
        logger.info(f"Conversations created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating conversations: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating conversations: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[ConversationsResponse], status_code=201)
async def create_conversationss_batch(
    request: ConversationsBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple conversationss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} conversationss")
    
    service = ConversationsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump(), user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} conversationss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[ConversationsResponse])
async def update_conversationss_batch(
    request: ConversationsBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple conversationss in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} conversationss")
    
    service = ConversationsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} conversationss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=ConversationsResponse)
async def update_conversations(
    id: int,
    data: ConversationsUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing conversations (requires ownership)"""
    logger.debug(f"Updating conversations {id} with data: {data}")

    service = ConversationsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Conversations with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Conversations not found")
        
        logger.info(f"Conversations {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating conversations {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating conversations {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_conversationss_batch(
    request: ConversationsBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple conversationss by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} conversationss")
    
    service = ConversationsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} conversationss successfully")
        return {"message": f"Successfully deleted {deleted_count} conversationss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_conversations(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single conversations by ID (requires ownership)"""
    logger.debug(f"Deleting conversations with id: {id}")
    
    service = ConversationsService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Conversations with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Conversations not found")
        
        logger.info(f"Conversations {id} deleted successfully")
        return {"message": "Conversations deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting conversations {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")