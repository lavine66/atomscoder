import logging
import os
import httpx

logger = logging.getLogger(__name__)


class ObjectStorageService:
    """Service for interacting with object storage"""

    def __init__(self):
        self.base_url = os.environ.get("OBJECT_STORAGE_URL", "")
        self.api_key = os.environ.get("OBJECT_STORAGE_API_KEY", "")

    async def upload_content(
        self,
        bucket_name: str,
        object_key: str,
        content: bytes,
        content_type: str = "text/html",
    ) -> str:
        """Upload content to object storage and return public URL"""
        try:
            # Use the storage upload endpoint
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.put(
                    f"{self.base_url}/storage/v1/object/{bucket_name}/{object_key}",
                    content=content,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": content_type,
                        "x-upsert": "true",
                    },
                )
                response.raise_for_status()

            # Return the public URL
            public_url = f"{self.base_url}/storage/v1/object/public/{bucket_name}/{object_key}"
            return public_url
        except Exception as e:
            logger.error(f"Upload error: {e}")
            raise