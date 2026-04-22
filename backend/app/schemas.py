from pydantic import BaseModel
from typing import Optional

class POIBase(BaseModel):
    name: str
    lat: float
    lon: float
    description: Optional[str] = None

class POICreate(POIBase):
    pass

class POI(POIBase):
    id: int
    file_url: Optional[str] = None
    file_type: Optional[str] = None

    class Config:
        from_attributes = True

class LogEntry(BaseModel):
    session_id: str
    message: str
    metadata: Optional[dict] = None
