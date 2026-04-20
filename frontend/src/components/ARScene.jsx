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
    const [lockedLoc, setLockedLoc] = useState(null); // Para congelar la posición post-calibración y evitar jitter

    // Estados de Calibración
    const [selectedCalibPoiId, setSelectedCalibPoiId] = useState("");
    const [isCalibrated, setIsCalibrated] = useState(false);
    const [worldRotation, setWorldRotation] = useState(0);

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
                            ? `Se encontraron ${response.data.length} puntos cercanos.` 
                            : "No hay puntos cercanos registrados.");
                    }
                }
            } catch (err) {
                if (isMounted) setStatus("Error al cargar puntos: " + err.message);
                addLog(`Error FETCH: ${err.message}`);
            }
        };

        if ("geolocation" in navigator) {
            // Vigilar posición constante
            watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    const { latitude, longitude } = pos.coords;
                    if (isMounted) {
                        setUserLoc(currentLoc => {
                            if (!currentLoc) {
                                fetchPOIs(latitude, longitude);
                            }
                            return { lat: latitude, lon: longitude };
                        });
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
            addLog("Sin soporte GPS.");
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

    const handleCalibrate = () => {
        if (!selectedCalibPoiId) { addLog('Err: Sin ID seleccionado'); return; }
        if (!userLoc) { addLog('Err: Sin UserLoc'); return; }
        if (!cameraRef.current) { addLog('Err: Sin CameraRef'); return; }
        
        const refPoi = pois.find(p => p.id === parseInt(selectedCalibPoiId));
        if (!refPoi) return;

        // 1. Obtener ángulo hacia donde mira la cámara en este instante.
        const cameraEl = cameraRef.current;
        let camYaw = 0;
        
        try {
            if (cameraEl.object3D) {
                // A-Frame (Vanilla) actualiza object3D.rotation en radianes constantemente.
                // Usar getAttribute es un error porque no se refresca visualmente durante la ejecución para ganar rendimiento.
                const radY = cameraEl.object3D.rotation.y;
                camYaw = radY * (180 / Math.PI); // Convertir rads a grados
            }
        } catch (e) {
            addLog("Err leyendo rot Y nativa.");
        }

        // 2. Calcular bearing geográfico del usuario hacia el POI
        const { distance, bearing } = calculateDistanceAndBearing(userLoc.lat, userLoc.lon, refPoi.lat, refPoi.lon);

        addLog(`Calib: ${refPoi.name}`);
        addLog(`Yaw:${camYaw.toFixed(1)}, Brng:${bearing.toFixed(1)}`);

        // 3. Compensación de la brújula (Rotar todo el contenedor de POIs)
        const currentWorldOffset = (bearing + camYaw) % 360;
        
        setWorldRotation(currentWorldOffset);
        // CONGELAR la posición GPS
        setLockedLoc(userLoc);
        
        setIsCalibrated(true);
        setStatus(`✅ Calibrado. Offset: ${Math.round(currentWorldOffset)}°`);
        addLog(`OFFSET FIJADO: ${Math.round(currentWorldOffset)}°`);
    };

    const handleRecalibrate = () => {
        setIsCalibrated(false);
        setLockedLoc(null);
        setStatus("Modo brújula libre repuesto.");
    };

    const API_URL = "";

    // Determinamos qué ubicación usar para todos los cálculos. Si nos calibramos, ignoramos el GPS en vivo y nos quedamos fijos.
    const activeLoc = lockedLoc || userLoc;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', overflow: 'hidden' }}>
            <div className="ar-overlay" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 99999, pointerEvents: 'none' }}>
                
                {/* Status banner */}
                <div style={{ marginTop: 'env(safe-area-inset-top, 20px)', width: '100%', textAlign: 'center' }}>
                    <div style={{ background: 'rgba(0,0,0,0.7)', padding: '0.8rem 1.2rem', borderRadius: '20px', color: 'white', display: 'inline-block', backdropFilter: 'blur(5px)', fontSize: '0.9rem', pointerEvents: 'auto' }}>
                        {status}
                    </div>
                </div>
                
                {/* Cuadro de Calibración */}
                {!isCalibrated && pois.length > 0 && (
                    <div style={{ position: 'absolute', top: '5rem', right: '1rem', background: 'rgba(0,0,0,0.8)', padding: '1rem', borderRadius: '8px', color: 'white', maxWidth: '250px', pointerEvents: 'auto', border: '1px solid #4ECDC4' }}>
                        <h4 style={{ margin: '0 0 10px 0', color: '#4ECDC4' }}>Fijar Referencia</h4>
                        <p style={{ fontSize: '0.8rem', margin: '0 0 10px 0' }}>Para corregir la ubicación, mira un punto físico con el círculo central y fíjalo.</p>
                        <select 
                            value={selectedCalibPoiId} 
                            onChange={e => setSelectedCalibPoiId(e.target.value)}
                            style={{ width: '100%', padding: '8px', marginBottom: '10px', background: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px' }}
                        >
                            <option value="">-- Seleccionar punto --</option>
                            {pois.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <button 
                            onClick={handleCalibrate}
                            disabled={!selectedCalibPoiId}
                            style={{ width: '100%', padding: '10px', background: selectedCalibPoiId ? '#4ECDC4' : '#555', color: '#111', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: selectedCalibPoiId ? 'pointer' : 'not-allowed' }}
                        >
                            Fijar Referencia
                        </button>
                    </div>
                )}
                
                {isCalibrated && (
                     <div style={{ position: 'absolute', top: '5rem', right: '1rem', pointerEvents: 'auto' }}>
                        <button 
                            onClick={handleRecalibrate}
                            style={{ padding: '8px 12px', background: 'rgba(255,107,107,0.8)', color: 'white', border: '1px solid white', borderRadius: '4px', fontWeight: 'bold' }}
                        >
                            🔄 Recalibrar
                        </button>
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
                
                {/* Panel de Debug Móvil */}
                <div style={{ position: 'absolute', bottom: '1rem', right: '1rem', background: 'rgba(0,0,0,0.85)', padding: '0.8rem', borderRadius: '8px', color: '#0f0', fontSize: '0.7rem', pointerEvents: 'none', zIndex: 9998, maxWidth: '180px', fontFamily: 'monospace' }}>
                    <strong style={{color: '#fff'}}>DEBUG CONSOLE {lockedLoc && "(LOC. BLOCK)"}</strong><br/>
                    {debugLogs.map((log, i) => <div key={i}>{log}</div>)}
                    <hr style={{borderColor: '#0f0'}}/>
                    {activeLoc && pois.length > 0 && (() => {
                         const fp = pois[0];
                         const { distance, bearing } = calculateDistanceAndBearing(activeLoc.lat, activeLoc.lon, fp.lat, fp.lon);
                         return (
                             <div>
                                P0: {fp.name}<br/>
                                D: {distance.toFixed(1)}m<br/>
                                B: {bearing.toFixed(1)}°<br/>
                                X:{ (distance * Math.sin(bearing * Math.PI/180)).toFixed(1) } Z:{( -distance * Math.cos(bearing * Math.PI/180)).toFixed(1) }
                             </div>
                         );
                    })()}
                </div>
            </div>

            {/* A-Frame Scene */}
            <a-scene
                vr-mode-ui="enabled: false"
                arjs="sourceType: webcam; videoTexture: true; debugUIEnabled: false;"
                renderer="antialias: true; alpha: true"
                cursor="raycaster: objects: [clickhandler]"
                raycaster="objects: [clickhandler]"
            >
                <a-camera ref={cameraRef} id="main-camera" look-controls="touchEnabled: false" camera="far: 150000; fov: 80;">
                    <a-cursor
                      color={isCalibrated ? "#FFFFFF" : "#4ECDC4"}
                      fuse="false"
                      raycaster="objects: [clickhandler]"
                      position="0 0 -1"
                      geometry="primitive: ring; radiusInner: 0.02; radiusOuter: 0.03"
                      material={`color: ${isCalibrated ? '#FFFFFF' : '#4ECDC4'}; shader: flat; opacity: 0.7`}>
                    </a-cursor>
                </a-camera>
                
                {/* Contenedor principal de Puntos. Su rotación anclada se actualiza en la calibración */}
                <a-entity rotation={`0 ${worldRotation} 0`}>
                    {pois.map(poi => {
                        let positionStr = "0 1.6 0";
                        let entityScale = 2; 
                        
                        if (activeLoc) {
                            const { distance, bearing } = calculateDistanceAndBearing(activeLoc.lat, activeLoc.lon, poi.lat, poi.lon);
                            const bearingRad = bearing * Math.PI / 180;
                            
                            const x = distance * Math.sin(bearingRad);
                            const z = -distance * Math.cos(bearingRad);
                            positionStr = `${x} 1.6 ${z}`;
                            
                            entityScale = Math.max(2, distance / 15);
                        }

                        return (
                            <a-entity
                                key={poi.id}
                                position={positionStr}
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
                                
                                <a-cylinder color={poi.id === parseInt(selectedCalibPoiId) && isCalibrated ? "#FFFFFF" : "#CCCCCC"} height="2" radius="0.05" position="0 -1 0"></a-cylinder>
                                <a-plane color={poi.id === parseInt(selectedCalibPoiId) && isCalibrated ? "#4ECDC4" : "#FF6B6B"} height="1" width="1.5" position="0.75 0 0" material="side: double"></a-plane>
                                
                                <a-plane color="#1a1a2e" height="0.8" width="2.5" position="0 1.5 0" material="opacity: 0.9; side: double">
                                     <a-text value={poi.name} align="center" color={poi.id === parseInt(selectedCalibPoiId) && isCalibrated ? "#4ECDC4" : "white"} scale="0.8 0.8 0.8" position="0 0.1 0.01"></a-text>
                                     <a-text value={isCalibrated && poi.id === parseInt(selectedCalibPoiId) ? "PUNTO DE REFERENCIA" : "Mirame y tocame para info"} align="center" color={poi.id === parseInt(selectedCalibPoiId) && isCalibrated ? "#4ECDC4" : "white"} scale="0.3 0.3 0.3" position="0 -0.25 0.01"></a-text>
                                </a-plane>
                            </a-entity>
                        );
                    })}
                </a-entity>
            </a-scene>
        </div>
    );
}
