import logging
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from services.projects import ProjectsService
from services.object_storage import ObjectStorageService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/publish", tags=["publish"])


class FileItem(BaseModel):
    filename: str
    content: str
    type: str = "html"


class PublishRequest(BaseModel):
    project_id: int
    files: List[FileItem]


class PublishResponse(BaseModel):
    url: str
    project_id: int


@router.post("/deploy", response_model=PublishResponse)
async def publish_project(
    data: PublishRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Publish project files to object storage and return public URL"""
    try:
        project_service = ProjectsService(db)
        project = await project_service.get_by_id(data.project_id, user_id=current_user.id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        storage_service = ObjectStorageService()
        base_path = f"projects/{current_user.id}/{data.project_id}"

        published_url = ""
        for file_item in data.files:
            object_key = f"{base_path}/{file_item.filename}"
            content_type = "text/html"
            if file_item.type == "css":
                content_type = "text/css"
            elif file_item.type == "js":
                content_type = "application/javascript"
            elif file_item.type == "json":
                content_type = "application/json"

            url = await storage_service.upload_content(
                bucket_name="published-projects",
                object_key=object_key,
                content=file_item.content.encode("utf-8"),
                content_type=content_type,
            )
            if file_item.filename == "index.html":
                published_url = url

        # Update project with published URL
        await project_service.update(
            data.project_id,
            {"published_url": published_url},
            user_id=current_user.id
        )
        await db.commit()

        return PublishResponse(url=published_url, project_id=data.project_id)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Publish error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to publish project: {str(e)}")