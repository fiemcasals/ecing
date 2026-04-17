from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
import shutil
import os
import uuid

from .. import models, schemas
from ..database import get_db
from ..services.geolocation import get_nearby_objects

router = APIRouter()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/pois/", response_model=schemas.POI)
def create_poi(
    name: str = Form(...),
    lat: float = Form(...),
    lon: float = Form(...),
    description: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    file_url = None
    file_type = None

    if file:
        file_extension = file.filename.split(".")[-1]
        unique_filename = f"{uuid.uuid4()}.{file_extension}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        file_url = f"/api/static/{unique_filename}"
        if file_extension.lower() in ['pdf']:
            file_type = 'pdf'
        elif file_extension.lower() in ['jpg', 'jpeg', 'png', 'gif']:
            file_type = 'image'

    db_poi = models.POI(
        name=name,
        lat=lat,
        lon=lon,
        description=description,
        file_url=file_url,
        file_type=file_type
    )
    db.add(db_poi)
    db.commit()
    db.refresh(db_poi)
    return db_poi


@router.get("/pois/", response_model=List[schemas.POI])
def read_pois(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    pois = db.query(models.POI).offset(skip).limit(limit).all()
    return pois


@router.get("/pois/nearby", response_model=List[schemas.POI])
def get_nearby_pois(lat: float, lon: float, max_distance: float = 0.5, db: Session = Depends(get_db)):
    all_pois = db.query(models.POI).all()
    nearby = get_nearby_objects(lat, lon, all_pois, max_distance)
    return nearby
