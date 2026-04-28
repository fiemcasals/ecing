from sqlalchemy import create_engine # Importa el motor para conectar con la base de datos
from sqlalchemy.orm import sessionmaker, declarative_base # Importa herramientas para crear sesiones y clases base
import os # Importa la librería para interactuar con el sistema operativo

# Define la URL de la base de datos, priorizando variables de entorno (útil para Docker/Producción)
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@db:5432/ar_database")

# Imprime la URL en la consola para verificar a qué base de datos nos estamos conectando al iniciar
print(f"Connecting to database: {DATABASE_URL}")

# Crea la conexión física (Engine) con la base de datos usando la URL definida
engine = create_engine(DATABASE_URL)

# Configura una fábrica de sesiones (SessionLocal). No guarda cambios automáticamente (autocommit=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Crea la clase Base de la cual heredarán todos los modelos de tablas (POI, User, etc.)
Base = declarative_base()

# Función generadora para gestionar la apertura y cierre automático de la base de datos
def get_db():
    db = SessionLocal() # Crea una nueva sesión de trabajo
    try:
        yield db # Entrega la sesión a la función de la API que la necesite
    finally:
        db.close() # Se asegura de cerrar la conexión siempre, incluso si hubo un error
