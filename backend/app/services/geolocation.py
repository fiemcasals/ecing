from math import cos, sqrt, radians

def get_nearby_objects(user_lat, user_lon, db_objects, max_distance_km=0.5):
    nearby = []
    # Convertimos latitudes a radianes para cos(user_lat)
    lat_rad = radians(user_lat)
    
    for obj in db_objects:
        # Cálculo de distancia simple (Euclidiana aproximada para distancias cortas)
        dx = 111.3 * (user_lon - obj.lon) * cos(lat_rad)
        dy = 111.3 * (user_lat - obj.lat)
        distance = sqrt(dx*dx + dy*dy) 
        
        if distance < max_distance_km:
            nearby.append(obj)
    return nearby
