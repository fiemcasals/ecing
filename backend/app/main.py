from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os
import time

from .database import engine, Base
from .api import endpoints

# Intenta crear tablas, con un retardo para dar tiempo a Postgres
for _ in range(5):
    try:
        Base.metadata.create_all(bind=engine)
        print("Database tables created.")
        break
    except Exception as e:
        print(f"Waiting for database... error: {e}")
        time.sleep(3)


app = FastAPI(title="AR Geolocation API")

# Manejo de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/api/static", StaticFiles(directory=UPLOAD_DIR), name="static")

app.include_router(endpoints.router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "API de Realidad Aumentada funcionando correctamente"}
