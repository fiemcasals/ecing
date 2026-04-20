import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';

// Función para calcular distancia y rumble (Geográfico) entre 2 coordenadas (Haversine)
function calculateDistanceAndBearing(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Radio de la tierra en metros
    // Castear a floats para evitar que JSON strings rompan la math con NaN
    const fLat1 = parseFloat(lat1), fLon1 = parseFloat(lon1);
    const fLat2 = parseFloat(lat2), fLon2 = parseFloat(lon2);

    const φ1 = fLat1 * Math.PI/180;
    const φ2 = fLat2 * Math.PI/180;
    const Δφ = (fLat2-fLat1) * Math.PI/180;
    const Δλ = (fLon2-fLon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // en metros

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1)*Math.sin(φ2) -
              Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
    let brng = Math.atan2(y, x);
    brng = (brng * 180 / Math.PI + 360) % 360; // en grados (0=N, 90=E, 180=S, 270=W)
    return { distance, bearing: brng };
}

export default function ARScene() {
    const [pois, setPois] = useState([]);
    const [status, setStatus] = useState("Obteniendo GPS para buscar puntos cercanos...");
    const [activePoi, setActivePoi] = useState(null);
    
    // Debug panel
    const [debugLogs, setDebugLogs] = useState(["Iniciando AR..."]);
    const addLog = (msg) => setDebugLogs(prev => [...prev, msg].slice(-5));
    
    // GPS Tracker constante
    const [userLoc, setUserLoc] = useState(null);
    const [anchorLoc, setAnchorLoc] = useState(null); // Primer GPS que fija el punto 0,0,0 del multiverso
    const [worldRotation, setWorldRotation] = useState(0); // Offset rotacional del Rig de la cámara
    
    // UI states
    const [isCalibrated, setIsCalibrated] = useState(false);
    const cameraRef = useRef(null);

    useEffect(() => {
        let isMounted = true;
        let watchId;
        
        const fetchPOIs = async (lat, lon) => {
            try {
                const API_URL = "";
                addLog(`Buscando POIs coords: ${lat.toFixed(3)}, ${lon.toFixed(3)}`);
                const response = await axios.get(`${API_URL}/api/pois/nearby`, {
                    params: { lat, lon, max_distance: 2.0 }
                });
                if (isMounted) {
                    setPois(response.data);
                    if (!status.includes("Calibrada")) {
                        setStatus(response.data.length > 0 
                            ? `Se encontraron ${response.data.length} puntos. Suelo fijado.` 
                            : "No hay puntos cercanos registrados.");
                    }
                }
            } catch (err) {
                if (isMounted) setStatus("Error FETCH: " + err.message);
                addLog(`Error FETCH: ${err.message}`);
            }
        };

        if ("geolocation" in navigator) {
            watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    const { latitude, longitude } = pos.coords;
                    if (isMounted) {
                        setAnchorLoc(currAnchor => {
                            // Definimos el origen de la grilla 3D la primera vez
                            if (!currAnchor) {
                                fetchPOIs(latitude, longitude);
                                return { lat: latitude, lon: longitude };
                            }
                            return currAnchor;
                        });
                        setUserLoc({ lat: latitude, lon: longitude });
                    }
                },
                (err) => { 
                    if (isMounted) setStatus("Error GPS: " + err.message); 
                    addLog(`Error GPS: ${err.message}`);
                },
                { enableHighAccuracy: true, maximumAge: 0, timeout: 27000 }
            );
        } else {
            setStatus("GPS no soportado");
        }

        return () => { 
            isMounted = false; 
            if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
        };
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

    // Función auxiliar para las nuevas posiciones en la grilla anclada
    const getLocalCoords = (targetLat, targetLon, originLat, originLon) => {
        const { distance, bearing } = calculateDistanceAndBearing(originLat, originLon, targetLat, targetLon);
        const bearingRad = bearing * Math.PI / 180;
        return {
            x: distance * Math.sin(bearingRad),
            z: -distance * Math.cos(bearingRad),
            distance
        };
    };

    const handleAutoCalibrate = () => {
        setIsCalibrated(true);
        setStatus("✅ Grilla fijada. Usa las flechas para alinearla al mundo físico.");
        addLog("INICIO CALIBRACION MANUAL");
    };

    const tuneRotation = (deg) => {
        setWorldRotation(prev => (prev + deg) % 360);
    };

    const API_URL = "";

    // Calcular la posición actual del usuario (cámara) relativa al anchor 0,0,0
    let camX = 0, camZ = 0;
    if (anchorLoc && userLoc) {
        const coords = getLocalCoords(userLoc.lat, userLoc.lon, anchorLoc.lat, anchorLoc.lon);
        camX = coords.x;
        camZ = coords.z;
    }

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', overflow: 'hidden' }}>
            <div className="ar-overlay" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 99999, pointerEvents: 'none' }}>
                
                <div style={{ marginTop: 'env(safe-area-inset-top, 20px)', width: '100%', textAlign: 'center' }}>
                    <div style={{ background: 'rgba(0,0,0,0.7)', padding: '0.8rem 1.2rem', borderRadius: '20px', color: 'white', display: 'inline-block', backdropFilter: 'blur(5px)', fontSize: '0.9rem', pointerEvents: 'auto' }}>
                        {status}
                    </div>
                </div>
                
                {/* Cuadro de Inicio de Calibración */}
                {!isCalibrated && anchorLoc && (
                    <div style={{ position: 'absolute', top: '5rem', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.8)', padding: '1rem', borderRadius: '8px', color: 'white', pointerEvents: 'auto', border: '1px solid #4ECDC4', textAlign: 'center' }}>
                        <h4 style={{ margin: '0 0 10px 0', color: '#4ECDC4' }}>Fijar Entorno 3D</h4>
                        <p style={{ fontSize: '0.8rem', margin: '0 0 10px 0' }}>Estás parado en el centro de la grilla.<br/>Presiona para desplegar banderas.</p>
                        <button 
                            onClick={handleAutoCalibrate}
                            style={{ padding: '10px 20px', background: '#4ECDC4', color: '#111', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        >
                            Ver Mundo AR
                        </button>
                    </div>
                )}
                
                {/* Controles de Alineación Fina - Reemplaza el apuntado cruzado */}
                {isCalibrated && (
                     <div style={{ position: 'absolute', bottom: '5rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '15px', pointerEvents: 'auto', alignItems: 'center' }}>
                         <div style={{ background: 'rgba(0,0,0,0.6)', padding: '5px', borderRadius: '8px', color: 'white', fontSize: '0.7rem', position: 'absolute', top: '-25px', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>Alineación de Brújula</div>
                        <button onClick={() => tuneRotation(-5)} style={{ padding: '12px 18px', background: 'rgba(20,20,40,0.8)', color: '#4ECDC4', border: '2px solid #4ECDC4', borderRadius: '8px', fontWeight: 'bold', fontSize: '1.2rem' }}>⟲ Giros Izq</button>
                        <button onClick={() => tuneRotation(5)} style={{ padding: '12px 18px', background: 'rgba(20,20,40,0.8)', color: '#4ECDC4', border: '2px solid #4ECDC4', borderRadius: '8px', fontWeight: 'bold', fontSize: '1.2rem' }}>Giro Der ⟳</button>
                    </div>
                )}

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
                
                <div style={{ position: 'absolute', bottom: '1rem', right: '1rem', background: 'rgba(0,0,0,0.85)', padding: '0.8rem', borderRadius: '8px', color: '#0f0', fontSize: '0.7rem', pointerEvents: 'none', zIndex: 9998, maxWidth: '180px', fontFamily: 'monospace' }}>
                    <strong style={{color: '#fff'}}>RIGID ARCH DEBUG</strong><br/>
                    {debugLogs.map((log, i) => <div key={i}>{log}</div>)}
                    <hr style={{borderColor: '#0f0'}}/>
                    <div>
                        Offset Angular: {worldRotation}°<br/>
                        Cam Translate:<br/>
                        X: {camX.toFixed(3)} Z: {camZ.toFixed(3)}
                    </div>
                </div>
            </div>

            <a-scene
                vr-mode-ui="enabled: false"
                arjs="sourceType: webcam; videoTexture: true; debugUIEnabled: false;"
                renderer="antialias: true; alpha: true"
                cursor="raycaster: objects: [clickhandler]"
                raycaster="objects: [clickhandler]"
            >
                {/* 
                  NUEVA ARQUITECTURA (RIGID GRID):
                  El Contenedor del mundo entero (Grid de lineas y POIs) se dibuja 1 sola vez en coordenadas estáticas (0,0,0).
                  Es la CÁMARA la que se mueve translacionalmente usando el 'Camera Rig'. 
                  El offset de la brújula solo se aplica para rotar a la Cámara, garantizando coherencia rotacional al caminar.
                */}
                <a-entity id="cameraRig" position={`${camX} 0 ${camZ}`} rotation={`0 ${worldRotation} 0`}>
                    <a-camera ref={cameraRef} id="main-camera" look-controls="touchEnabled: false" camera="far: 150000; fov: 80;">
                        <a-cursor
                          color="#4ECDC4"
                          fuse="false"
                          raycaster="objects: [clickhandler]"
                          position="0 0 -1"
                          geometry="primitive: ring; radiusInner: 0.02; radiusOuter: 0.03"
                          material="color: #4ECDC4; shader: flat; opacity: 0.7">
                        </a-cursor>
                    </a-camera>
                </a-entity>
                
                <a-entity id="world-container">
                    {/* Visual Grid a ras del mundo real */}
                    {isCalibrated && anchorLoc && (
                        <a-plane 
                            position="0 0 0" 
                            rotation="-90 0 0" 
                            width="200" 
                            height="200" 
                            color="#4ECDC4" 
                            wireframe="true" 
                            segments-width="100" 
                            segments-height="100" 
                            material="opacity: 0.3; wireframeLinewidth: 2;">
                        </a-plane>
                    )}

                    {isCalibrated && anchorLoc && pois.map(poi => {
                        // Coordenadas fijadas en vida real respecto al punto ancla Central
                        const coords = getLocalCoords(poi.lat, poi.lon, anchorLoc.lat, anchorLoc.lon);
                        const entityScale = Math.max(2, coords.distance / 15);

                        return (
                            <a-entity
                                key={poi.id}
                                position={`${coords.x} 1.6 ${coords.z}`}
                                look-at="#main-camera"
                                scale={`${entityScale} ${entityScale} ${entityScale}`}
                            >
                                <a-box 
                                    class="clickable"
                                    data-id={poi.id}
                                    clickhandler=""
                                    position="0 0.5 0" 
                                    width="3" 
                                    height="3" 
                                    depth="0.5" 
                                    material="opacity: 0.0; transparent: true">
                                </a-box>
                                
                                <a-cylinder color="#FFFFFF" height="2" radius="0.05" position="0 -1 0"></a-cylinder>
                                <a-plane color="#4ECDC4" height="1" width="1.5" position="0.75 0 0" material="side: double"></a-plane>
                                
                                <a-plane color="#1a1a2e" height="0.8" width="2.5" position="0 1.5 0" material="opacity: 0.9; side: double">
                                     <a-text value={poi.name} align="center" color="#4ECDC4" scale="0.8 0.8 0.8" position="0 0.1 0.01"></a-text>
                                     <a-text value="Toca para Detalles" align="center" color="#FFFFFF" scale="0.3 0.3 0.3" position="0 -0.25 0.01"></a-text>
                                </a-plane>
                            </a-entity>
                        );
                    })}
                </a-entity>
            </a-scene>
        </div>
    );
}
