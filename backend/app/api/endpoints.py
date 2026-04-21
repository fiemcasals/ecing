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
        file_extension = file.filename.split(".")[-1].lower()
        unique_filename = f"{uuid.uuid4()}.{file_extension}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        file_url = f"/api/static/{unique_filename}"
        if file_extension in ['pdf']:
            file_type = 'pdf'
        elif file_extension in ['jpg', 'jpeg', 'png', 'gif']:
            file_type = 'image'
        elif file_extension in ['mp4', 'webm', 'mov']:
            file_type = 'video'

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

@router.put("/pois/{poi_id}", response_model=schemas.POI)
def update_poi(
    poi_id: int,
    name: str = Form(...),
    lat: float = Form(...),
    lon: float = Form(...),
    description: Optional[str] = Form(None),
    remove_file: bool = Form(False),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    db_poi = db.query(models.POI).filter(models.POI.id == poi_id).first()
    if not db_poi:
        raise HTTPException(status_code=404, detail="POI not found")
    
    db_poi.name = name
    db_poi.lat = lat
    db_poi.lon = lon
    db_poi.description = description

    # Handle file removal or update
    if remove_file or file:
        if db_poi.file_url:
            old_filename = db_poi.file_url.split("/")[-1]
            old_path = os.path.join(UPLOAD_DIR, old_filename)
            if os.path.exists(old_path):
                os.remove(old_path)
            db_poi.file_url = None
            db_poi.file_type = None

    if file:
        file_extension = file.filename.split(".")[-1].lower()
        unique_filename = f"{uuid.uuid4()}.{file_extension}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        db_poi.file_url = f"/api/static/{unique_filename}"
        if file_extension in ['pdf']:
            db_poi.file_type = 'pdf'
        elif file_extension in ['jpg', 'jpeg', 'png', 'gif']:
            db_poi.file_type = 'image'
        elif file_extension in ['mp4', 'webm', 'mov']:
            db_poi.file_type = 'video'

    db.commit()
    db.refresh(db_poi)
    return db_poi

@router.delete("/pois/all")
def delete_all_pois(db: Session = Depends(get_db)):
    # Clean up physical files too
    all_pois = db.query(models.POI).all()
    for poi in all_pois:
        if poi.file_url:
            filename = poi.file_url.split("/")[-1]
            path = os.path.join(UPLOAD_DIR, filename)
            if os.path.exists(path):
                os.remove(path)
                
    deleted_count = db.query(models.POI).delete()
    db.commit()
    return {"message": f"Successfully deleted {deleted_count} POIs"}

@router.delete("/pois/{poi_id}")
def delete_poi(poi_id: int, db: Session = Depends(get_db)):
    db_poi = db.query(models.POI).filter(models.POI.id == poi_id).first()
    if not db_poi:
        raise HTTPException(status_code=404, detail="POI not found")
    
    if db_poi.file_url:
        filename = db_poi.file_url.split("/")[-1]
        path = os.path.join(UPLOAD_DIR, filename)
        if os.path.exists(path):
            os.remove(path)
            
    db.delete(db_poi)
    db.commit()
    return {"message": "POI deleted successfully"}
