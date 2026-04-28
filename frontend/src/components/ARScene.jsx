import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ARButton, XR, Controllers } from '@react-three/xr';
import { Text, Billboard, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { useCalibration } from '../context/CalibrationContext';
import { createPortal } from 'react-dom';

const API_URL = ""; 

// --- MATHS: Haversine para distancia y bearing precisos ---
function calculateDistanceAndBearing(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Radio de la Tierra en metros
    const fLat1 = parseFloat(lat1), fLon1 = parseFloat(lon1);
    const fLat2 = parseFloat(lat2), fLon2 = parseFloat(lon2);
    const φ1 = fLat1 * Math.PI/180;
    const φ2 = fLat2 * Math.PI/180;
    const Δφ = (fLat2-fLat1) * Math.PI/180;
    const Δλ = (fLon2-fLon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const distance = R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
    let brng = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    return { distance, bearing: brng };
}

// --- 3D: Marcador de POI ---
function POIMarker({ poi, anchorLoc, userLocalPos, maxDistance, onClick }) {
    // Posición del POI relativa al ancla GPS (en metros)
    const coords = useMemo(() => {
        const { distance, bearing } = calculateDistanceAndBearing(anchorLoc.lat, anchorLoc.lon, poi.lat, poi.lon);
        const bearingRad = bearing * Math.PI / 180;
        return { x: distance * Math.sin(bearingRad), z: -distance * Math.cos(bearingRad), distance };
    }, [poi, anchorLoc]);

    // Distancia del usuario al POI (ambos en espacio local del mundo)
    const distToUser = Math.hypot(coords.x - userLocalPos.x, coords.z - userLocalPos.z);
    
    if (distToUser > maxDistance * 1000) return null;

    const scale = Math.min(3, Math.max(1, distToUser / 20));

    return (
        <group position={[coords.x, 0, coords.z]} scale={[scale, scale, scale]}>
            <Billboard position={[0, 1.5, 0]}>
                <mesh position={[0, -0.5, 0]}>
                    <cylinderGeometry args={[0.02, 0.02, 2]} />
                    <meshStandardMaterial color="white" />
                </mesh>
                <mesh position={[0, 0, 0]} onClick={onClick}>
                    <planeGeometry args={[2, 1.2]} />
                    <meshStandardMaterial color="#1a1a2e" opacity={0.9} transparent />
                </mesh>
                <Text position={[0, 0.25, 0.05]} fontSize={0.2} color="#4ECDC4" anchorX="center" anchorY="middle" maxWidth={1.8}>{poi.name}</Text>
                <Text position={[0, -0.05, 0.05]} fontSize={0.15} color="#FF6B6B" anchorX="center" anchorY="middle">{`${distToUser.toFixed(1)} m`}</Text>
                <Text position={[0, -0.35, 0.05]} fontSize={0.1} color="white" anchorX="center" anchorY="middle">Toca para detalles</Text>
            </Billboard>
        </group>
    );
}

// --- 3D: Contenido de la escena ---
function SceneContent({ pois, anchorLoc, isCalibrated, worldRotation, worldAnchorXR, maxDistance, onPoiClick, onUserLocalPosUpdate, userLocalPos }) {
    const worldRef = useRef();
    const { camera } = useThree();
    const lastPosUpdate = useRef(0);

    useFrame((state) => {
        if (!worldRef.current || !isCalibrated || !worldAnchorXR) return;

        // Posicionar el mundo UNA VEZ y dejarlo fijo.
        // El mundo se ancla a la posición XR donde el usuario estaba al calibrar.
        const angleRad = THREE.MathUtils.degToRad(worldRotation);
        worldRef.current.position.set(worldAnchorXR.x, -1.4, worldAnchorXR.z);
        worldRef.current.rotation.y = angleRad;

        // Cada 300ms, calcular la posición local del usuario para distancias en POIMarker
        const now = state.clock.getElapsedTime();
        if (now - lastPosUpdate.current > 0.3) {
            lastPosUpdate.current = now;
            const localPos = worldRef.current.worldToLocal(camera.position.clone());
            onUserLocalPosUpdate({ x: localPos.x, z: localPos.z });
        }
    });

    return (
        <group ref={worldRef}>
            {isCalibrated && (
                <>
                    <Grid position={[0, -0.01, 0]} args={[400, 400]} cellColor="#4ecdc4" sectionColor="#4ecdc4" fadeDistance={100} sectionSize={10} cellSize={1} infiniteGrid />
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
                        <ringGeometry args={[1, 1.1, 32]} />
                        <meshBasicMaterial color="#FF6B6B" transparent opacity={0.5} />
                    </mesh>
                    {pois.map(poi => (
                        <POIMarker 
                            key={poi.id} 
                            poi={poi} 
                            anchorLoc={anchorLoc} 
                            userLocalPos={userLocalPos}
                            maxDistance={maxDistance}
                            onClick={() => onPoiClick(poi)} 
                        />
                    ))}
                </>
            )}
            <ambientLight intensity={0.8} />
            <pointLight position={[10, 10, 10]} intensity={1} />
        </group>
    );
}

// --- COMPONENTE PRINCIPAL ---
export default function ARScene() {
    const { isCalibrated, worldRotation, updateCalibration, resetCalibration } = useCalibration();
    const [pois, setPois] = useState([]);
    const [status, setStatus] = useState("Obteniendo GPS...");
    const [activePoi, setActivePoi] = useState(null);
    const [xrSessionActive, setXrSessionActive] = useState(false);
    const [debugLogs, setDebugLogs] = useState(["Diagnóstico WebXR activo"]);
    const sessionId = useMemo(() => `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, []);
    
    const [userLoc, setUserLoc] = useState({ lat: 0, lon: 0, accuracy: 0 });
    const [anchorLoc, setAnchorLoc] = useState(null);
    const [maxDistance, setMaxDistance] = useState(2.0);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showStats, setShowStats] = useState(false);
    const [overlayElement, setOverlayElement] = useState(null);

    // --- Calibración por caminata ---
    const [calibPhase, setCalibPhase] = useState(isCalibrated ? 'calibrated' : 'idle');
    const [walkDistance, setWalkDistance] = useState(0);
    const calibStartRef = useRef(null); // { gps: {lat,lon}, xr: {x,z} }
    const xrCameraRef = useRef({ x: 0, y: 0, z: 0 });
    const worldAnchorXRRef = useRef(null); // Posición XR del ancla (fija tras calibración)
    const [worldAnchorXR, setWorldAnchorXR] = useState(null);
    const userLocalPosRef = useRef({ x: 0, z: 0 });
    const [userLocalPos, setUserLocalPos] = useState({ x: 0, z: 0 });

    const WALK_TARGET = 10; // metros a caminar para calibrar

    const addLog = (msg, meta = null) => {
        setDebugLogs(prev => [...prev, msg].slice(-6));
        axios.post(`/api/logs/`, {
            session_id: sessionId, message: msg,
            metadata: { ...meta, userAgent: navigator.userAgent, url: window.location.href, secure: window.isSecureContext }
        }).catch(() => {});
    };

    // Tracker XR: actualiza la posición de la cámara y la distancia caminada
    const XRTracker = () => {
        const { camera } = useThree();
        useFrame(() => {
            xrCameraRef.current = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
            
            // Durante calibración, calcular distancia caminada
            if (calibPhase === 'walking' && calibStartRef.current) {
                const dx = camera.position.x - calibStartRef.current.xr.x;
                const dz = camera.position.z - calibStartRef.current.xr.z;
                const dist = Math.sqrt(dx*dx + dz*dz);
                setWalkDistance(dist);
            }
        });
        return null;
    };

    const takeScreenshot = () => {
        const canvas = document.querySelector('canvas');
        if (canvas) {
            try {
                const dataURL = canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.download = `ar-capture-${Date.now()}.png`;
                link.href = dataURL;
                link.click();
                addLog("✅ Captura exitosa");
            } catch (err) { addLog(`❌ Error captura: ${err.message}`); }
        }
    };

    // GPS Watcher: obtener ubicación y anclar al iniciar
    useEffect(() => {
        let watchId;
        if ("geolocation" in navigator) {
            watchId = navigator.geolocation.watchPosition((pos) => {
                const { latitude, longitude, accuracy } = pos.coords;
                setUserLoc({ lat: latitude, lon: longitude, accuracy });
                
                // Fijar ancla GPS solo la primera vez
                if (!anchorLoc) {
                    setAnchorLoc({ lat: latitude, lon: longitude });
                    addLog(`📍 Ancla GPS fijada (±${accuracy.toFixed(0)}m)`);
                }
            }, (err) => addLog(`GPS Error: ${err.message}`), { enableHighAccuracy: true });
        }
        return () => { if (watchId) navigator.geolocation.clearWatch(watchId); };
    }, []);

    // Fetch POIs cuando tenemos ancla
    useEffect(() => {
        if (!anchorLoc) return;
        const fetchPOIs = async () => {
            try {
                const response = await axios.get(`/api/pois/nearby`, { params: { lat: anchorLoc.lat, lon: anchorLoc.lon, max_distance: maxDistance } });
                setPois(response.data);
                addLog(`Cargados ${response.data.length} POIs`);
            } catch (err) { addLog(`Error Fetch: ${err.message}`); }
        };
        fetchPOIs();
    }, [anchorLoc, maxDistance]);

    // --- HANDLERS DE CALIBRACIÓN ---
    const startCalibration = useCallback(() => {
        if (!anchorLoc) {
            addLog("⚠️ Esperando GPS...");
            return;
        }
        // Tomar GPS fresco como ancla
        setAnchorLoc({ lat: userLoc.lat, lon: userLoc.lon });
        calibStartRef.current = {
            gps: { lat: userLoc.lat, lon: userLoc.lon },
            xr: { x: xrCameraRef.current.x, z: xrCameraRef.current.z }
        };
        setWalkDistance(0);
        setCalibPhase('walking');
        addLog(`🚶 Caminá ${WALK_TARGET}m en línea recta`);
    }, [anchorLoc, userLoc]);

    const finishCalibration = useCallback(() => {
        if (!calibStartRef.current) return;

        const startGPS = calibStartRef.current.gps;
        const startXR = calibStartRef.current.xr;
        const endGPS = { lat: userLoc.lat, lon: userLoc.lon };
        const endXR = { x: xrCameraRef.current.x, z: xrCameraRef.current.z };

        // Bearing GPS (ángulo geográfico entre punto A y B)
        const { bearing: gpsBearing } = calculateDistanceAndBearing(
            startGPS.lat, startGPS.lon, endGPS.lat, endGPS.lon
        );

        // Bearing XR (ángulo de movimiento en espacio XR)
        const xrDx = endXR.x - startXR.x;
        const xrDz = endXR.z - startXR.z;
        const xrBearingRad = Math.atan2(xrDx, -xrDz);
        const xrBearingDeg = (xrBearingRad * 180 / Math.PI + 360) % 360;

        // Rotación del mundo = diferencia entre rumbo GPS y rumbo XR
        const rotation = gpsBearing - xrBearingDeg;
        
        // Anclar el mundo a la posición XR donde empezó la calibración
        const anchor = { x: startXR.x, y: -1.4, z: startXR.z };
        worldAnchorXRRef.current = anchor;
        setWorldAnchorXR(anchor);

        updateCalibration(rotation);
        setCalibPhase('calibrated');
        addLog(`✅ Calibrado: ${rotation.toFixed(1)}° | GPS bearing: ${gpsBearing.toFixed(1)}° | XR bearing: ${xrBearingDeg.toFixed(1)}°`);
    }, [userLoc, updateCalibration]);

    const handleResetCalibration = useCallback(() => {
        resetCalibration();
        calibStartRef.current = null;
        worldAnchorXRRef.current = null;
        setWorldAnchorXR(null);
        setCalibPhase('idle');
        setWalkDistance(0);
        // Re-anclar GPS a posición actual
        setAnchorLoc({ lat: userLoc.lat, lon: userLoc.lon });
        addLog("🔄 Calibración reiniciada");
    }, [resetCalibration, userLoc]);

    // Auto-finish calibration when target distance reached
    useEffect(() => {
        if (calibPhase === 'walking' && walkDistance >= WALK_TARGET) {
            finishCalibration();
        }
    }, [calibPhase, walkDistance, finishCalibration]);

    // Restaurar worldAnchorXR si ya estaba calibrado (recarga de página)
    useEffect(() => {
        if (isCalibrated && !worldAnchorXR && xrSessionActive) {
            // Re-calibrar porque no tenemos la posición XR de la sesión anterior
            addLog("⚠️ Sesión anterior detectada, recalibrando...");
            handleResetCalibration();
        }
    }, [isCalibrated, worldAnchorXR, xrSessionActive]);

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: xrSessionActive ? 'transparent' : '#000' }}>
            {overlayElement && (
                <ARButton 
                    sessionInit={{ optionalFeatures: ['local-floor', 'dom-overlay'], domOverlay: { root: overlayElement } }}
                    onSessionStart={() => setXrSessionActive(true)}
                    onSessionEnd={() => { setXrSessionActive(false); handleResetCalibration(); }}
                />
            )}

            <Canvas shadows camera={{ fov: 70, near: 0.1, far: 1000 }} gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}>
                <XR>
                    <Controllers />
                    <XRTracker />
                    <SceneContent 
                        pois={pois} anchorLoc={anchorLoc}
                        isCalibrated={isCalibrated && !!worldAnchorXR} 
                        worldRotation={worldRotation} 
                        worldAnchorXR={worldAnchorXR}
                        maxDistance={maxDistance} 
                        onPoiClick={setActivePoi}
                        onUserLocalPosUpdate={setUserLocalPos}
                        userLocalPos={userLocalPos}
                    />
                </XR>
            </Canvas>

            <div className="ar-overlay" ref={setOverlayElement} style={{ pointerEvents: 'none' }}>
                {/* STATUS BAR */}
                <div style={{ textAlign: 'center', pointerEvents: 'auto', marginTop: '20px' }}>
                    <div style={{ background: 'rgba(0,0,0,0.85)', display: 'inline-block', padding: '10px 20px', borderRadius: '20px', color: 'white', border: `1px solid ${isCalibrated ? '#4ECDC4' : '#FF6B6B'}` }} onClick={() => setShowStats(!showStats)}>
                        {!xrSessionActive 
                            ? "Paso 1: Toca 'Enter AR' abajo" 
                            : calibPhase === 'calibrated' 
                                ? "✅ Escena Alineada"
                                : calibPhase === 'walking'
                                    ? `🚶 Caminando: ${walkDistance.toFixed(1)}m / ${WALK_TARGET}m`
                                    : "Paso 2: Toca 'Calibrar' abajo"}
                    </div>
                </div>

                {/* BOTONES PRINCIPALES - Solo en XR */}
                {xrSessionActive && (
                    <div style={{ position: 'absolute', bottom: '100px', width: '100%', display: 'flex', justifyContent: 'space-around', pointerEvents: 'auto' }}>
                        {calibPhase !== 'calibrated' && calibPhase !== 'walking' && (
                            <button onClick={startCalibration} style={{ background: '#FF6B6B', border: 'none', borderRadius: '25px', padding: '15px 25px', fontSize: '16px', color: 'white', fontWeight: 'bold' }}>
                                🧭 Calibrar
                            </button>
                        )}
                        {calibPhase === 'walking' && (
                            <div style={{ background: 'rgba(0,0,0,0.8)', borderRadius: '15px', padding: '15px 25px', border: '2px solid #FF6B6B', textAlign: 'center' }}>
                                <div style={{ color: '#FF6B6B', fontWeight: 'bold', fontSize: '18px' }}>🚶 Caminá en línea recta</div>
                                <div style={{ color: 'white', fontSize: '24px', marginTop: '5px' }}>{walkDistance.toFixed(1)}m / {WALK_TARGET}m</div>
                                <div style={{ background: '#333', borderRadius: '10px', height: '8px', marginTop: '8px', overflow: 'hidden' }}>
                                    <div style={{ background: '#4ECDC4', height: '100%', width: `${Math.min(100, (walkDistance/WALK_TARGET)*100)}%`, transition: 'width 0.3s' }} />
                                </div>
                            </div>
                        )}
                        {calibPhase === 'calibrated' && (
                            <>
                                <button onClick={() => setShowCreateModal(true)} style={{ background: '#4ECDC4', border: 'none', borderRadius: '50%', width: '60px', height: '60px', fontSize: '24px' }}>➕</button>
                                <button onClick={takeScreenshot} style={{ background: 'rgba(255,255,255,0.2)', border: '2px solid white', borderRadius: '50%', width: '60px', height: '60px', fontSize: '24px' }}>📸</button>
                                <button onClick={handleResetCalibration} style={{ background: '#FF6B6B', border: 'none', borderRadius: '50%', width: '60px', height: '60px', fontSize: '18px', color: 'white' }}>🔄</button>
                            </>
                        )}
                    </div>
                )}

                {/* STATS PANEL */}
                {showStats && (
                    <div style={{ position: 'absolute', top: '80px', left: '20px', background: 'rgba(0,0,0,0.9)', color: '#0f0', padding: '10px', fontSize: '11px', borderRadius: '8px', pointerEvents: 'auto', border: '1px solid #4ECDC4', fontFamily: 'monospace', width: '220px' }}>
                        <div>GPS PREC: {userLoc.accuracy?.toFixed(1)}m</div>
                        <div>MUNDO ROT: {worldRotation?.toFixed(1)}°</div>
                        <div>FASE: {calibPhase}</div>
                        <div>ANCLA: {anchorLoc ? `${anchorLoc.lat.toFixed(5)}, ${anchorLoc.lon.toFixed(5)}` : 'N/A'}</div>
                        <div>POIs: {pois.length}</div>
                        <div>POS LOCAL: ({userLocalPos.x.toFixed(1)}, {userLocalPos.z.toFixed(1)})</div>
                    </div>
                )}

                {/* DETALLE DE POI */}
                {activePoi && (
                    <div style={{ position: 'absolute', top: '15%', left: '5%', right: '5%', background: 'rgba(20,20,30,0.98)', border: '1px solid #4ECDC4', borderRadius: '15px', padding: '20px', pointerEvents: 'auto', maxHeight: '70vh', overflowY: 'auto' }}>
                        <h2 style={{ color: '#4ECDC4', marginTop: 0 }}>{activePoi.name}</h2>
                        <p style={{color: '#eee'}}>{activePoi.description}</p>
                        <button onClick={() => setActivePoi(null)} className="primary" style={{ marginTop: '20px', width:'100%' }}>Cerrar</button>
                    </div>
                )}

                {/* MODAL CREAR POI */}
                {showCreateModal && (
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(20,20,30,0.98)', border: '1px solid #4ECDC4', borderRadius: '15px', padding: '20px', pointerEvents: 'auto', width: '85%', zIndex: 20000 }}>
                        <h2 style={{ color: '#4ECDC4', marginTop: 0 }}>Crear Punto de Interés</h2>
                        <input id="new-poi-name" placeholder="Nombre" style={{ width: '100%', padding: '12px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #444', background: '#222', color: 'white' }} />
                        <textarea id="new-poi-desc" placeholder="Descripción" style={{ width: '100%', padding: '12px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #444', background: '#222', color: 'white', height: '80px' }} />
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => setShowCreateModal(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #666', background: 'transparent', color: 'white' }}>Cancelar</button>
                            <button onClick={async () => {
                                const name = document.getElementById('new-poi-name').value;
                                const desc = document.getElementById('new-poi-desc').value;
                                if (!name) return;
                                try {
                                    const data = new FormData();
                                    data.append('name', name);
                                    data.append('lat', userLoc.lat);
                                    data.append('lon', userLoc.lon);
                                    if (desc) data.append('description', desc);
                                    await axios.post('/api/pois/', data);
                                    addLog(`✅ POI "${name}" creado`);
                                    setShowCreateModal(false);
                                    // Refetch POIs
                                    const response = await axios.get(`/api/pois/nearby`, { params: { lat: anchorLoc.lat, lon: anchorLoc.lon, max_distance: maxDistance } });
                                    setPois(response.data);
                                } catch (err) { addLog(`❌ Error: ${err.message}`); }
                            }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: '#4ECDC4', color: '#1a1a2e', fontWeight: 'bold' }}>Guardar</button>
                        </div>
                    </div>
                )}

                {/* CONSOLA DE DEPURACIÓN */}
                <div style={{ position: 'absolute', bottom: '20px', right: '20px', background: 'rgba(0,0,0,0.85)', color: '#0f0', padding: '10px', fontSize: '10px', borderRadius: '4px', fontFamily: 'monospace', maxWidth: '200px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>CONSOLA DE DEPURACIÓN</div>
                    {debugLogs.map((l, i) => <div key={i}>{l}</div>)}
                </div>
            </div>
        </div>
    );
}
