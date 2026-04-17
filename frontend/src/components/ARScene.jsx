import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function ARScene() {
    const [pois, setPois] = useState([]);
    const [status, setStatus] = useState("Obteniendo GPS para buscar puntos cercanos...");
    const [activePoi, setActivePoi] = useState(null);

    useEffect(() => {
        let isMounted = true;
        
        const fetchPOIs = async (lat, lon) => {
            try {
                const API_URL = "";
                const response = await axios.get(`${API_URL}/api/pois/nearby`, {
                    params: { lat, lon, max_distance: 2.0 }
                });
                if (isMounted) {
                    setPois(response.data);
                    setStatus(response.data.length > 0 
                        ? `Se encontraron ${response.data.length} puntos cercanos.` 
                        : "No hay puntos cercanos registrados.");
                }
            } catch (err) {
                if (isMounted) setStatus("Error al cargar puntos: " + err.message);
            }
        };

        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
                (pos) => fetchPOIs(pos.coords.latitude, pos.coords.longitude),
                (err) => { if (isMounted) setStatus("Error GPS: " + err.message + ". Activa permisos."); },
                { enableHighAccuracy: true }
            );
        } else {
            setStatus("GPS no soportado");
        }

        return () => { isMounted = false; };
    }, []);

    useEffect(() => {
        const handlePoiClick = (e) => {
            const id = parseInt(e.detail);
            const p = pois.find(x => x.id === id);
            if (p) setActivePoi(p);
        };
        window.addEventListener('poi-clicked', handlePoiClick);
        return () => window.removeEventListener('poi-clicked', handlePoiClick);
    }, [pois]);
    const API_URL = "";

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', overflow: 'hidden' }}>
            <div className="ar-overlay">
                <div style={{ background: 'rgba(0,0,0,0.5)', padding: '0.8rem', borderRadius: '8px', color: 'white', display: 'inline-block', backdropFilter: 'blur(5px)' }}>
                    {status}
                </div>
                {activePoi && (
                    <div style={{ position: 'absolute', bottom: '2rem', left: '1rem', right: '1rem', zIndex: 1001, maxHeight: '80vh', overflowY: 'auto' }} className="ar-info">
                        <h3>{activePoi.name}</h3>
                        <p>{activePoi.description}</p>
                        {activePoi.file_url && activePoi.file_type === 'pdf' && (
                            <a href={`${API_URL}${activePoi.file_url}`} target="_blank" rel="noreferrer" className="btn-doc">📄 Ver Documento PDF</a>
                        )}
                        {activePoi.file_url && activePoi.file_type === 'image' && (
                            <img src={`${API_URL}${activePoi.file_url}`} alt={activePoi.name} style={{width: '100%', maxHeight: '40vh', objectFit: 'contain', borderRadius: '8px', marginTop: '0.5rem'}} />
                        )}
                        <button onClick={() => setActivePoi(null)} style={{background: 'rgba(255,255,255,0.1)', border:'1px solid white', color: 'white', padding: '0.7rem', marginTop: '1rem', borderRadius: '6px', width: '100%', cursor:'pointer', fontWeight:'bold'}}>Cerrar</button>
                    </div>
                )}
            </div>

            {/* A-Frame Scene */}
            <a-scene
                vr-mode-ui="enabled: false"
                arjs="sourceType: webcam; videoTexture: true; debugUIEnabled: false;"
                renderer="antialias: true; alpha: true"
                cursor="raycaster: objects: [clickhandler]"
                raycaster="objects: [clickhandler]"
            >
                <a-camera gps-new-camera="gpsMinDistance: 1; positionMinAccuracy: 100" rotation-reader>
                    {/* Retícula visual en pantalla para clickear */}
                    <a-cursor
                      color="#4ECDC4"
                      fuse="false"
                      raycaster="objects: [clickhandler]"
                      position="0 0 -1"
                      geometry="primitive: ring; radiusInner: 0.02; radiusOuter: 0.03"
                      material="color: #4ECDC4; shader: flat; opacity: 0.7">
                    </a-cursor>
                </a-camera>
                
                {pois.map(poi => (
                    <a-entity
                        key={poi.id}
                        data-id={poi.id}
                        clickhandler=""
                        gps-new-entity-place={`latitude: ${poi.lat}; longitude: ${poi.lon};`}
                        look-at="[gps-new-camera]"
                        scale="2 2 2"
                    >
                        {/* Poste */}
                        <a-cylinder color="#CCCCCC" height="2" radius="0.05" position="0 -1 0"></a-cylinder>
                        {/* Bandera */}
                        <a-plane color="#FF6B6B" height="1" width="1.5" position="0.75 0 0" material="side: double"></a-plane>
                        
                        {/* El cartel arriba de la bandera */}
                        <a-plane color="#1a1a2e" height="0.8" width="2.5" position="0 1.5 0" material="opacity: 0.9; side: double">
                             <a-text 
                                value={poi.name} 
                                align="center" 
                                color="#4ECDC4" 
                                scale="0.8 0.8 0.8" 
                                position="0 0.1 0.01">
                             </a-text>
                             <a-text 
                                value="Mirame y tocame para ver info" 
                                align="center" 
                                color="white" 
                                scale="0.3 0.3 0.3" 
                                position="0 -0.25 0.01">
                             </a-text>
                        </a-plane>
                    </a-entity>
                ))}
            </a-scene>
        </div>
    );
}
