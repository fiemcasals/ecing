from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
import shutil
import os
import uuid
import datetime

# Los dos puntos (..) significan "sube una carpeta hacia arriba" (Relative Import).
# Actualmente estamos en la carpeta 'api' (app/api/endpoints.py).
# Al usar '..', Python retrocede a la carpeta principal 'app' y busca allí los archivos 'models.py' y 'schemas.py'.
from .. import models, schemas
from ..database import get_db
from ..services.geolocation import get_nearby_objects

# Crea una instancia de APIRouter que agrupa y gestiona todas las rutas (endpoints) de esta sección (ej: /pois/)
router = APIRouter() 

# Define el nombre del directorio local donde se guardarán los archivos multimedia (imágenes, videos, pdfs) subidos por los usuarios
UPLOAD_DIR = "uploads"
LOGS_BASE_DIR = "logs"
# Crea el directorio especificado en UPLOAD_DIR si no existe. 
# exist_ok=True evita que el programa lance un error en caso de que la carpeta ya estuviera creada previamente.
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(LOGS_BASE_DIR, exist_ok=True)

# Define una ruta (endpoint) que responde a peticiones HTTP POST en la URL "/pois/". 
# Se usa para crear nuevos Puntos de Interés (POI). El response_model indica que la respuesta será formateada y validada según el esquema schemas.POI.
@router.post("/pois/", response_model=schemas.POI)
def create_poi(
    # 'str' indica que esperamos que 'name' sea una cadena de texto (string).
    # 'Form(...)' le dice a FastAPI que este dato no vendrá en un formato JSON clásico, sino como un campo de formulario web (multipart/form-data).
    # Los puntos suspensivos '...' significan que este campo es estrictamente obligatorio. Si no se envía el 'name', la API devolverá un error.
    name: str = Form(...),
    lat: float = Form(...),
    lon: float = Form(...),
    description: Optional[str] = Form(None),
    # 'Optional[UploadFile]' significa que el parámetro puede recibir un archivo ('UploadFile') O puede estar vacío ('None').
    # 'UploadFile' es una clase especial de FastAPI diseñada para manejar archivos. Su gran ventaja es que no colapsa la memoria RAM del servidor si un usuario sube un video muy pesado, ya que lo guarda temporalmente en el disco.
    # 'File(None)' indica que este dato proviene de una subida de archivos del formulario. El 'None' adentro establece el valor por defecto: si el usuario no envía ninguna foto/video, el valor será None y no dará error (es decir, hace que el campo sea verdaderamente opcional).
    file: Optional[UploadFile] = File(None),
    # 'Session' es solo una ayuda de tipado (Type Hint) que le dice al editor que 'db' será una conexión a la base de datos (de SQLAlchemy).
    # 'Depends(get_db)' es la magia de la "Inyección de Dependencias" de FastAPI. Le dice al framework:
    # "Antes de ejecutar esta función, por favor ejecuta la función get_db(). Abre una conexión segura a la base de datos, entrégamela en la variable 'db' para que pueda guardar/leer cosas, y cuando yo termine de responderle al usuario, encárgate tú de cerrar la conexión de forma segura".
    db: Session = Depends(get_db)
):
    """
    Crea un nuevo Punto de Interés (POI).
    
    Nota sobre JSON vs Formulario Web (multipart/form-data):
    - JSON (application/json): Es excelente para enviar texto estructurado ligero (ej. {"name": "Parque", "lat": -34.6}). Sin embargo, NO soporta el envío eficiente de archivos binarios (como imágenes o videos).
    - Formulario Web (multipart/form-data): Es el formato estándar de los navegadores cuando se usa una etiqueta <form> con un archivo adjunto. Permite enviar en una misma petición tanto campos de texto (name, lat, lon) como archivos binarios (file). Como este endpoint permite subir una imagen/video, se DEBE usar este formato y por eso declaramos los parámetros con Form() y File() en lugar de un esquema Pydantic tradicional.
    """
    file_url = None
    file_type = None

    if file:
        # Extrae la extensión del archivo (ej: 'jpg', 'pdf'). Desglose de la línea:
        # 1. file.filename: Obtiene el nombre original (ej: "mi_foto.vacaciones.JPG")
        # 2. .split("."): Corta el texto cada vez que hay un punto y crea una lista (ej: ["mi_foto", "vacaciones", "JPG"])
        # 3. [-1]: En Python, el índice -1 significa "el último elemento de la lista". Esto es crucial porque un archivo puede llamarse "reporte.final.pdf" (con varios puntos). Usar [-1] asegura que siempre agarremos la extensión real (la última parte) y no algo en el medio.
        # 4. .lower(): Convierte el resultado a minúsculas (ej: "JPG" a "jpg") para que sea más fácil compararlo después.
        file_extension = file.filename.split(".")[-1].lower()
        # 'uuid' (Universally Unique Identifier) genera un código de texto único e irrepetible en el mundo (ej: "550e8400-e29b-41d4-a716-446655440000").
        # 'uuid4()' específicamente genera ese código de forma completamente aleatoria.
        # Hacemos esto para RENOMBRAR el archivo. Si dos usuarios distintos suben una foto llamada "imagen.jpg", si no le cambiáramos el nombre, la segunda foto sobreescribiría y borraría a la primera. Al usar uuid, nos aseguramos de que cada archivo tenga un nombre de sistema único que nunca va a chocar con otro.
        unique_filename = f"{uuid.uuid4()}.{file_extension}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)
        
        # Aquí es donde realmente se GUARDA físicamente el archivo en el disco duro del servidor.
        # 'with open(..., "wb") as buffer': Abre (o crea) un archivo vacío en la ruta indicada. "wb" significa "Write Binary" (Escribir en Binario), porque las fotos y videos no son texto, son datos binarios. El 'with' se asegura de cerrar el archivo automáticamente al terminar.
        # 'shutil.copyfileobj(...)': Copia el contenido del archivo que mandó el usuario hacia nuestro nuevo archivo vacío. Lo hace "por partes" (streaming), por lo que si el archivo pesa 1GB, no consume 1GB de RAM, sino que lo va leyendo y escribiendo de a pedacitos de forma muy eficiente.
        with open(file_path, "wb") as buffer:
            # ¿Por qué 'file.file' y no solo 'file'?
            # - 'file' (la variable de nuestro endpoint) es un objeto complejo de FastAPI (tipo UploadFile). Tiene cosas extra como 'file.filename' o 'file.content_type'.
            # - 'file.file' accede a un atributo interno de ese objeto. Ese atributo es el archivo "crudo" real (los bytes puros de la imagen/video) que Python y shutil entienden. Si le pasamos solo 'file', shutil se confundiría porque no sabría qué hacer con los metadatos de FastAPI.
            shutil.copyfileobj(file.file, buffer) 
            #shutil (Shell Utilities): Es una biblioteca estándar de Python que provee operaciones con archivos y colecciones de archivos de alto nivel (como copiar, mover, borrar, comprimir, etc.) de manera eficiente y multiplataforma.
        
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
    # ¿Qué es la "Sesión" (db)? Imagina que la base de datos es la bóveda del banco (fija y permanente), y la sesión es tu "carrito de compras" o área de trabajo temporal en la memoria RAM.
    # 'db.add(db_poi)': No guarda los datos en el disco duro todavía. Simplemente agarra el objeto 'db_poi' que acabamos de crear y lo mete en el "carrito".
    # Hacemos esto porque podríamos querer agregar o modificar muchas cosas a la vez, y queremos que todas se guarden juntas al final o que ninguna se guarde si ocurre un error (Transacción).
    db.add(db_poi)
    db.commit()
    # Una vez confirmado el guardado ('commit'), 'db.refresh(db_poi)' es como pedirle a la base de datos: "Oye, ya lo guardaste, ¿me devuelves la versión final de ese registro?", actualizando tu variable en memoria con cualquier dato nuevo que se haya generado automáticamente (como un ID incremental o un timestamp).
    db.refresh(db_poi)
    # ¿Por qué retornamos el objeto si ya se guardó? 
    # Porque el Frontend (la aplicación del celular o la web) está esperando una respuesta a su petición POST.
    # Al retornar 'db_poi', FastAPI lo convierte en JSON y se lo envía de vuelta al celular. Esto es súper útil porque el celular ahora recibe el nuevo 'id' que le asignó la base de datos y la 'file_url' generada con el UUID, pudiendo mostrar el punto en el mapa inmediatamente sin tener que hacer una segunda petición para descargarlo.
    return db_poi


@router.get("/pois/", response_model=List[schemas.POI]) #response_model=: Es un parámetro que se le pasa al decorador de la ruta (@router.get) para indicarle a FastAPI qué tipo de datos va a devolver exactamente esta función. List indica que va a ser una lista.schemas.POI indica que los elementos de la lista van a ser objetos de tipo POI. 
def read_pois(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):#skip le dice cuantos registros se va a saltear, al tener cero, empieza desde el principio. limit le dice cuantos registros se van a traer. db es la sesión de la base de datos.
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

@router.post("/logs/")
def receive_logs(entry: schemas.LogEntry): # entry es el objeto que se envia para acceder a esta funcion. cuando llamo a /logs/ le mando el objeto
    # Log to console for real-time visibility (docker logs)
    print(f"--- LOG RECV [{entry.session_id}] ---")
    print(f"Message: {entry.message}")
    if entry.metadata:
        print(f"Metadata: {entry.metadata}")
    
    session_dir = os.path.join(LOGS_BASE_DIR, entry.session_id)
    os.makedirs(session_dir, exist_ok=True)
    
    log_file = os.path.join(session_dir, "events.log")
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    try:
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] {entry.message}\n")
            if entry.metadata:
                f.write(f"    Metadata: {entry.metadata}\n")
    except Exception as e:
        print(f"FAILED TO WRITE LOG FILE: {e}")
            
    return {"status": "ok"}
