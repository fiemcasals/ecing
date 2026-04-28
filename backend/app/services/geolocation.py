from math import cos, sqrt, radians

def get_nearby_objects(user_lat, user_lon, db_objects, max_distance_km=0.5):
    """
    Esta función filtra qué objetos están cerca del usuario.
    ADVERTENCIA: Usa una aproximación plana (Euclidiana). Para Realidad Aumentada (AR) 
    es solo un filtro inicial; no sirve para el posicionamiento visual exacto.
    """
    nearby = []
    
    # 1. Convertimos la latitud a radianes.
    # El coseno (usado abajo) necesita radianes para calcular cuánto se "encogen"
    # los grados de longitud a medida que te alejas del Ecuador.
    lat_rad = radians(user_lat)
    
    for obj in db_objects:
        # 2. Calculamos la diferencia de posición en un plano 2D (Kilómetros).
        # 111.3 es una constante aproximada de km por cada grado de la Tierra.
        
        # Diferencia en el eje X (Longitud / Este-Oeste):
        # Multiplicamos por cos(lat_rad) para corregir la curvatura de la Tierra.
        dx = 111.3 * (user_lon - obj.lon) * cos(lat_rad)
        
        # Diferencia en el eje Y (Latitud / Norte-Sur):
        dy = 111.3 * (user_lat - obj.lat)
        
        # 3. Teorema de Pitágoras para hallar la distancia real en línea recta.
        # IMPORTANTE PARA AR: Este cálculo solo da la DISTANCIA (módulo).
        # Al elevar al cuadrado y sumar, se pierde la dirección (el ángulo/rumbo),
        # por eso la AR no sabe hacia dónde mirar basándose solo en este resultado.
        distance = sqrt(dx*dx + dy*dy) 
        
        # 4. Si la distancia es menor al límite (0.5 km = 500m), lo incluimos.
        if distance < max_distance_km:
            nearby.append(obj)
            
    return nearby
