import React, { useEffect, useState, useRef, useMemo } from 'react';
import axios from 'axios';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ARButton, XR, Controllers } from '@react-three/xr';
import { Text, Billboard, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { useCalibration } from '../context/CalibrationContext';
import { createPortal } from 'react-dom';

const API_URL = ""; 

// --- MATHS ---
function calculateDistanceAndBearing(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
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

// --- 3D COMPONENTS ---

function POIMarker({ poi, anchorLoc, userPos, maxDistance, onClick }) {
    const coords = useMemo(() => {
        const { distance, bearing } = calculateDistanceAndBearing(anchorLoc.lat, anchorLoc.lon, poi.lat, poi.lon);
        const bearingRad = bearing * Math.PI / 180;
        return { x: distance * Math.sin(bearingRad), z: -distance * Math.cos(bearingRad), distance };
    }, [poi, anchorLoc]);

    const distToUser = Math.hypot(coords.x - userPos.x, coords.z - userPos.z);
    
    // Clipping based on user-set maxDistance (converted from km to m)
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

function SceneContent({ pois, anchorLoc, camX, camZ, isCalibrated, calibMode, worldRotation, maxDistance, onPoiClick }) {
    const worldRef = useRef();
    const { camera } = useThree();

    useFrame(() => {
        if (worldRef.current && isCalibrated) {
            const angleRad = THREE.MathUtils.degToRad(worldRotation);
            const cosA = Math.cos(angleRad);
            const sinA = Math.sin(angleRad);
            
            // Current GPS position of user relative to anchor
            const gpsX = camX;
            const gpsZ = camZ;
            
            // Rotate GPS offset into XR space
            const rotatedX = gpsX * cosA - gpsZ * sinA;
            const rotatedZ = gpsX * sinA + gpsZ * cosA;

            // Anchor the world group so that its internal (rotatedX, rotatedZ) 
            // point is physically located at the camera's current XR position.
            // This translates the entire ground-aligned map to the user's location.
            worldRef.current.position.set(
                camera.position.x - rotatedX, 
                -1.4, // Baseline height
                camera.position.z - rotatedZ
            );
            worldRef.current.rotation.y = angleRad;
        }
    });

    return (
        <group ref={worldRef}>
            {(isCalibrated && calibMode === 'calibrated') && (
                <>
                    {/* Grid set to 1m squares for visual verification */}
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
                            userPos={{x: camX, z: camZ}} 
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

// --- MAIN COMPONENT ---

export default function ARScene() {
    const { isCalibrated, worldRotation, updateCalibration, savedPoints, addSavedPoint, calibSteps, setCalibSteps, resetCalibration } = useCalibration();
    const [pois, setPois] = useState([]);
    const [status, setStatus] = useState("Obteniendo GPS...");
    const [activePoi, setActivePoi] = useState(null);
    const [xrSessionActive, setXrSessionActive] = useState(false);
    const [debugLogs, setDebugLogs] = useState(["WebXR Diagnostics Active"]);
    const sessionId = useMemo(() => `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, []);
    
    const [userLoc, setUserLoc] = useState({ lat: 0, lon: 0, accuracy: 0 });
    const [anchorLoc, setAnchorLoc] = useState(null);
    const [calibMode, setCalibMode] = useState(isCalibrated ? 'calibrated' : 'idle');
    const [camX, setCamX] = useState(0);
    const [camZ, setCamZ] = useState(0);
    const [maxDistance, setMaxDistance] = useState(2.0);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showSavedPointsModal, setShowSavedPointsModal] = useState(false);
    const [showNewHitoModal, setShowNewHitoModal] = useState(false);
    const [showStats, setShowStats] = useState(false);
    const [overlayElement, setOverlayElement] = useState(null);
    const xrCameraRef = useRef({ x: 0, y: 0, z: 0 });

    const addLog = (msg, meta = null) => {
        setDebugLogs(prev => [...prev, msg].slice(-6));
        axios.post(`/api/logs/`, {
            session_id: sessionId, message: msg,
            metadata: { ...meta, userAgent: navigator.userAgent, url: window.location.href, secure: window.isSecureContext }
        }).catch(() => {});
    };

    const XRTracker = () => {
        const { camera } = useThree();
        useFrame(() => {
            xrCameraRef.current = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
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

    useEffect(() => {
        let watchId;
        const fetchPOIs = async (lat, lon) => {
            try {
                const response = await axios.get(`/api/pois/nearby`, { params: { lat, lon, max_distance: maxDistance } });
                setPois(response.data);
                setStatus(isCalibrated ? "✅ Escena Alineada" : "GPS Listo. Calibra para ver objetos.");
            } catch (err) { addLog(`Error Fetch: ${err.message}`); }
        };

        if ("geolocation" in navigator) {
            watchId = navigator.geolocation.watchPosition((pos) => {
                const { latitude, longitude, accuracy } = pos.coords;
                setUserLoc({ lat: latitude, lon: longitude, accuracy });
                if (!anchorLoc) {
                    setAnchorLoc({ lat: latitude, lon: longitude });
                    fetchPOIs(latitude, longitude);
                }
            }, (err) => addLog(`GPS Error: ${err.message}`), { enableHighAccuracy: true });
        }
        return () => navigator.geolocation.clearWatch(watchId);
    }, [anchorLoc, isCalibrated, maxDistance]);

    useEffect(() => {
        if (anchorLoc && userLoc) {
            const { distance, bearing } = calculateDistanceAndBearing(anchorLoc.lat, anchorLoc.lon, userLoc.lat, userLoc.lon);
            const bearingRad = bearing * Math.PI / 180;
            setCamX(distance * Math.sin(bearingRad));
            setCamZ(-distance * Math.cos(bearingRad));
        }
    }, [userLoc, anchorLoc]);

    // HANDLERS PARA CALIBRACIÓN MANUAL
    const handleSelectHito = (hito) => {
        if (!calibSteps.pointA) {
            // Primer Punto (Ancla)
            const newPointA = {
                lat: hito.lat,
                lon: hito.lon,
                xrX: xrCameraRef.current.x,
                xrZ: xrCameraRef.current.z
            };
            setCalibSteps({ ...calibSteps, pointA: newPointA });
            setAnchorLoc({ lat: hito.lat, lon: hito.lon });
            addLog(`Punto A fijado en ${hito.name}`);
            setShowSavedPointsModal(false);
        } else {
            // Segundo Punto (Orientación)
            const newPointB = {
                lat: hito.lat,
                lon: hito.lon,
                xrX: xrCameraRef.current.x,
                xrZ: xrCameraRef.current.z
            };
            
            // 1. Rumbo Geográfico (GPS)
            const { bearing: gpsBearing } = calculateDistanceAndBearing(
                calibSteps.pointA.lat, calibSteps.pointA.lon,
                newPointB.lat, newPointB.lon
            );

            // 2. Rumbo XR (Medido por la cámara)
            const xrVec = {
                x: newPointB.xrX - calibSteps.pointA.xrX,
                z: newPointB.xrZ - calibSteps.pointA.xrZ
            };
            const xrBearingRad = Math.atan2(xrVec.x, -xrVec.z);
            const xrBearingDeg = (xrBearingRad * 180 / Math.PI + 360) % 360;

            // 3. Alineación
            const finalRotation = gpsBearing - xrBearingDeg;
            updateCalibration(finalRotation);
            setCalibMode('calibrated');
            setCalibSteps({ ...calibSteps, pointB: newPointB });
            addLog(`Calibración completa: ${finalRotation.toFixed(1)}°`);
            setShowSavedPointsModal(false);
        }
    };

    const handleCreateHito = (e) => {
        e.preventDefault();
        const name = e.target.name.value;
        const lat = parseFloat(e.target.lat.value);
        const lon = parseFloat(e.target.lon.value);
        if (name && !isNaN(lat) && !isNaN(lon)) {
            addSavedPoint({ name, lat, lon });
            setShowNewHitoModal(false);
            addLog(`Hito guardado: ${name}`);
        }
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: xrSessionActive ? 'transparent' : '#000' }}>
            {overlayElement && (
                <ARButton 
                    sessionInit={{ optionalFeatures: ['local-floor', 'dom-overlay'], domOverlay: { root: overlayElement } }}
                    onSessionStart={() => setXrSessionActive(true)}
                    onSessionEnd={() => setXrSessionActive(false)}
                />
            )}

            <Canvas shadows camera={{ fov: 70, near: 0.1, far: 1000 }} gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}>
                <XR>
                    <Controllers />
                    <XRTracker />
                    <SceneContent 
                        pois={pois} anchorLoc={anchorLoc} camX={camX} camZ={camZ} 
                        isCalibrated={isCalibrated} worldRotation={worldRotation} 
                        maxDistance={maxDistance} onPoiClick={setActivePoi}
                    />
                </XR>
            </Canvas>

            <div className="ar-overlay" ref={setOverlayElement} style={{ pointerEvents: 'none' }}>
                {/* BOTONES PRINCIPALES */}
                {xrSessionActive && (
                    <div style={{ position: 'absolute', bottom: '100px', width: '100%', display: 'flex', justifyContent: 'space-around', pointerEvents: 'auto' }}>
                        <button onClick={() => setShowCreateModal(true)} style={{ background: '#4ECDC4', border: 'none', borderRadius: '50%', width: '60px', height: '60px', fontSize: '24px' }}>➕</button>
                        <button onClick={takeScreenshot} style={{ background: 'rgba(255,255,255,0.2)', border: '2px solid white', borderRadius: '50%', width: '60px', height: '60px', fontSize: '24px' }}>📸</button>
                        <button onClick={() => setShowSavedPointsModal(true)} style={{ background: '#FF6B6B', border: 'none', borderRadius: '50%', width: '60px', height: '60px', fontSize: '24px', color: 'white' }}>📍</button>
                    </div>
                )}

                {/* STATUS BAR */}
                <div style={{ textAlign: 'center', pointerEvents: 'auto', marginTop: '20px' }}>
                    <div style={{ background: 'rgba(0,0,0,0.85)', display: 'inline-block', padding: '10px 20px', borderRadius: '20px', color: 'white', border: '1px solid #4ECDC4' }} onClick={() => setShowStats(!showStats)}>
                        {!xrSessionActive 
                            ? "Paso 1: Toca 'Enter AR' abajo" 
                            : (isCalibrated ? "✅ Escena Alineada" : "Paso 2: Toca el icono 📍 para alinear")}
                    </div>
                </div>

                {/* MODAL SELECCIÓN DE HITOS (CALIBRACIÓN) */}
                {showSavedPointsModal && (
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(20,20,30,0.98)', border: '2px solid #FF6B6B', borderRadius: '15px', padding: '20px', pointerEvents: 'auto', width: '90%', zIndex: 20000 }}>
                        <h3 style={{ color: '#FF6B6B', marginTop: 0, textAlign: 'center' }}>{!calibSteps.pointA ? "PASO 1: Seleccionar Punto A" : "PASO 2: Seleccionar Punto B"}</h3>
                        <p style={{ color: '#ccc', fontSize: '0.85rem', textAlign: 'center', marginBottom: '15px' }}>
                            <strong>Instrucciones:</strong> Apoye el celular con la cámara apuntando al suelo, y seleccione el punto correspondiente una vez el celular en posición.
                        </p>
                        
                        <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '15px' }}>
                            {savedPoints.map(p => (
                                <button key={p.id} onClick={() => handleSelectHito(p)} style={{ width: '100%', padding: '12px', marginBottom: '8px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '8px', textAlign: 'left' }}>
                                    {p.name} <span style={{fontSize: '0.7rem', color: '#888'}}>({p.lat.toFixed(5)}, {p.lon.toFixed(5)})</span>
                                </button>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => setShowNewHitoModal(true)} style={{ flex: 1, padding: '10px', background: 'transparent', color: '#4ECDC4', border: '1px solid #4ECDC4', borderRadius: '8px' }}>+ Nuevo Hito</button>
                            <button onClick={() => setShowSavedPointsModal(false)} style={{ flex: 1, padding: '10px', background: '#444', color: 'white', border: 'none', borderRadius: '8px' }}>Cerrar</button>
                        </div>
                        {calibSteps.pointA && <button onClick={resetCalibration} style={{ width: '100%', marginTop: '10px', padding: '10px', background: 'rgba(255,0,0,0.2)', border: '1px solid red', color: 'red', borderRadius: '8px' }}>Reiniciar Calibración</button>}
                    </div>
                )}

                {/* MODAL NUEVO HITO */}
                {showNewHitoModal && (
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(20,20,30,0.98)', border: '2px solid #4ECDC4', borderRadius: '15px', padding: '20px', pointerEvents: 'auto', width: '85%', zIndex: 21000 }}>
                        <h2 style={{ color: '#4ECDC4', marginTop: 0 }}>Nuevo Hito Maestro</h2>
                        <form onSubmit={handleCreateHito}>
                            <input name="name" placeholder="Nombre (ej: Esquina Norte)" required style={{ width: '100%', padding: '12px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #444', background: '#222', color: 'white' }} />
                            <input name="lat" placeholder="Latitud" required defaultValue={userLoc.lat?.toFixed(6)} style={{ width: '100%', padding: '12px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #444', background: '#222', color: 'white' }} />
                            <input name="lon" placeholder="Longitud" required defaultValue={userLoc.lon?.toFixed(6)} style={{ width: '100%', padding: '12px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #444', background: '#222', color: 'white' }} />
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button type="button" onClick={() => setShowNewHitoModal(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #666', background: 'transparent', color: 'white' }}>Cancelar</button>
                                <button type="submit" style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: '#4ECDC4', color: '#1a1a2e', fontWeight: 'bold' }}>Guardar</button>
                            </div>
                        </form>
                    </div>
                )}

                {/* RESTO DE MODALES (STATS, CREATE POI, DETALLE) */}
                {showStats && (
                    <div style={{ position: 'absolute', top: '80px', left: '20px', background: 'rgba(0,0,0,0.9)', color: '#0f0', padding: '10px', fontSize: '11px', borderRadius: '8px', pointerEvents: 'auto', border: '1px solid #4ECDC4', fontFamily: 'monospace', width: '220px' }}>
                        <div>GPS PREC: {userLoc.accuracy?.toFixed(1)}m</div>
                        <div>MUNDO ROT: {worldRotation?.toFixed(1)}°</div>
                        <div>PASO CALIB: {calibSteps.pointA ? "1 OK, FALTA 2" : "0 OK"}</div>
                    </div>
                )}

                {activePoi && (
                    <div style={{ position: 'absolute', top: '15%', left: '5%', right: '5%', background: 'rgba(20,20,30,0.98)', border: '1px solid #4ECDC4', borderRadius: '15px', padding: '20px', pointerEvents: 'auto', maxHeight: '70vh', overflowY: 'auto' }}>
                        <h2 style={{ color: '#4ECDC4', marginTop: 0 }}>{activePoi.name}</h2>
                        <p style={{color: '#eee'}}>{activePoi.description}</p>
                        <button onClick={() => setActivePoi(null)} className="primary" style={{ marginTop: '20px', width:'100%' }}>Cerrar</button>
                    </div>
                )}

                {showCreateModal && (
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(20,20,30,0.98)', border: '1px solid #4ECDC4', borderRadius: '15px', padding: '20px', pointerEvents: 'auto', width: '85%', zIndex: 20000 }}>
                        <h2 style={{ color: '#4ECDC4', marginTop: 0 }}>Crear Punto de Interés</h2>
                        <input id="new-poi-name" placeholder="Nombre" style={{ width: '100%', padding: '12px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #444', background: '#222', color: 'white' }} />
                        <textarea id="new-poi-desc" placeholder="Descripción" style={{ width: '100%', padding: '12px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #444', background: '#222', color: 'white', height: '80px' }} />
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => setShowCreateModal(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #666', background: 'transparent', color: 'white' }}>Cancelar</button>
                            <button onClick={() => handleCreatePOI({ name: document.getElementById('new-poi-name').value, description: document.getElementById('new-poi-desc').value })} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: '#4ECDC4', color: '#1a1a2e', fontWeight: 'bold' }}>Guardar</button>
                        </div>
                    </div>
                )}

                <div style={{ position: 'absolute', bottom: '20px', right: '20px', background: 'rgba(0,0,0,0.85)', color: '#0f0', padding: '10px', fontSize: '10px', borderRadius: '4px', fontFamily: 'monospace', maxWidth: '200px' }}>
                    {debugLogs.map((l, i) => <div key={i}>{l}</div>)}
                </div>
            </div>
        </div>
    );
}
