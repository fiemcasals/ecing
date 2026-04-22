import React, { useEffect, useState, useRef, useMemo } from 'react';
import axios from 'axios';
import { Canvas, useFrame } from '@react-three/fiber';
import { ARButton, XR, Controllers } from '@react-three/xr';
import { Text, Billboard, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { useCalibration } from '../context/CalibrationContext';

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

function POIMarker({ poi, anchorLoc, userPos, onClick }) {
    const coords = useMemo(() => {
        const { distance, bearing } = calculateDistanceAndBearing(anchorLoc.lat, anchorLoc.lon, poi.lat, poi.lon);
        const bearingRad = bearing * Math.PI / 180;
        return { x: distance * Math.sin(bearingRad), z: -distance * Math.cos(bearingRad), distance };
    }, [poi, anchorLoc]);

    const distToUser = Math.hypot(coords.x - userPos.x, coords.z - userPos.z);
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

function SceneContent({ pois, anchorLoc, camX, camZ, isCalibrated, worldRotation, onPoiClick }) {
    const worldRef = useRef();

    useFrame(() => {
        if (worldRef.current) {
            worldRef.current.position.set(-camX, -1.4, -camZ);
            worldRef.current.rotation.y = THREE.MathUtils.degToRad(worldRotation);
        }
    });

    return (
        <group ref={worldRef}>
            {isCalibrated && (
                <>
                    <Grid position={[0, -0.01, 0]} args={[400, 400]} cellColor="#4ecdc4" sectionColor="#4ecdc4" fadeDistance={100} infiniteGrid />
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
                        <ringGeometry args={[1, 1.1, 32]} />
                        <meshBasicMaterial color="#FF6B6B" transparent opacity={0.5} />
                    </mesh>
                    {pois.map(poi => (
                        <POIMarker key={poi.id} poi={poi} anchorLoc={anchorLoc} userPos={{x: camX, z: camZ}} onClick={() => onPoiClick(poi)} />
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
    const { isCalibrated, worldRotation, updateCalibration } = useCalibration();
    const [pois, setPois] = useState([]);
    const [status, setStatus] = useState("Obteniendo GPS...");
    const [activePoi, setActivePoi] = useState(null);
    const [xrSessionActive, setXrSessionActive] = useState(false);
    const sessionId = useMemo(() => `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, []);
    const addLog = (msg, meta = null) => {
        setDebugLogs(prev => [...prev, msg].slice(-6));
        axios.post(`/api/logs/`, {
            session_id: sessionId,
            message: msg,
            metadata: {
                ...meta,
                userAgent: navigator.userAgent,
                url: window.location.href,
                secure: window.isSecureContext
            }
        }).catch(err => console.error("Logging failed", err));
    };

    const [userLoc, setUserLoc] = useState(null);
    const [anchorLoc, setAnchorLoc] = useState(null);
    const [calibMode, setCalibMode] = useState(isCalibrated ? 'calibrated' : 'idle');
    const [walkData, setWalkData] = useState(null);
    const [camX, setCamX] = useState(0);
    const [camZ, setCamZ] = useState(0);

    // Initial diagnostics
    useEffect(() => {
        addLog("Scene Initialization Started");
        addLog(`WebXR Supported: ${'xr' in navigator}`);
        if ('xr' in navigator) {
            navigator.xr.isSessionSupported('immersive-ar').then(sup => {
                addLog(`immersive-ar Supported: ${sup}`);
            });
        }
    }, [sessionId]);

    // Detect if we are in a fully secure context (Valid SSL)
    const isSecure = window.isSecureContext; 

    useEffect(() => {
        let watchId;
        const fetchPOIs = async (lat, lon) => {
            try {
                const response = await axios.get(`/api/pois/nearby`, { params: { lat, lon, max_distance: 2.0 } });
                setPois(response.data);
                if (!isCalibrated) setStatus("GPS Listo. Camina para calibrar.");
                else setStatus("✅ Escena Alineada");
            } catch (err) { addLog(`Error Fetch: ${err.message}`); }
        };

        if ("geolocation" in navigator) {
            watchId = navigator.geolocation.watchPosition((pos) => {
                const { latitude, longitude } = pos.coords;
                setAnchorLoc(curr => {
                    if (!curr) { fetchPOIs(latitude, longitude); return { lat: latitude, lon: longitude }; }
                    return curr;
                });
                setUserLoc({ lat: latitude, lon: longitude });
            }, (err) => addLog(`GPS Error: ${err.message}`), { enableHighAccuracy: true });
        }
        return () => navigator.geolocation.clearWatch(watchId);
    }, [isCalibrated]);

    useEffect(() => {
        if (anchorLoc && userLoc) {
            const { distance, bearing } = calculateDistanceAndBearing(anchorLoc.lat, anchorLoc.lon, userLoc.lat, userLoc.lon);
            const bearingRad = bearing * Math.PI / 180;
            setCamX(distance * Math.sin(bearingRad));
            setCamZ(-distance * Math.cos(bearingRad));
        }
    }, [userLoc, anchorLoc]);

    useEffect(() => {
        const TARGET_WALK_DIST = 15;
        if (calibMode === 'walking' && walkData && userLoc) {
            const walkedDist = Math.hypot(camX - walkData.startX, camZ - walkData.startZ);
            if (walkedDist >= TARGET_WALK_DIST) {
                const { bearing } = calculateDistanceAndBearing(walkData.startLat, walkData.startLon, userLoc.lat, userLoc.lon);
                updateCalibration(-bearing);
                setCalibMode('calibrated');
                setStatus("✅ Calibración Exitosa");
                addLog("Distancia completada. Norte fijado.");
            }
        }
    }, [camX, camZ, calibMode, walkData, userLoc, updateCalibration]);

    return (
        <div style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            width: '100%', 
            height: '100%', 
            background: xrSessionActive ? 'transparent' : '#000',
            transition: 'background 0.5s ease'
        }}>
            {!isSecure && (
                <div style={{ position: 'absolute', top: '15%', left: '10%', right: '10%', background: 'rgba(255,0,0,0.95)', color: 'white', padding: '20px', borderRadius: '15px', zIndex: 10000, textAlign: 'center', boxShadow: '0 0 20px rgba(0,0,0,0.5)' }}>
                    <h2 style={{margin:0}}>⚠️ CONEXIÓN NO SEGURA</h2>
                    <p style={{fontSize:'0.9rem', margin:'10px 0'}}>Chrome no activará la cámara porque el certificado SSL de este sitio es inválido o falta (dice "No Seguro").</p>
                    <p style={{fontSize:'0.8rem', opacity: 0.8}}>Debes usar un certificado válido (Let's Encrypt) para que WebXR funcione.</p>
                </div>
            )}

            <ARButton 
                onError={(err) => addLog(`WebXR Error: ${err.message || 'Desconocido'}`)}
                onSessionStart={() => { setXrSessionActive(true); addLog("WebXR Session Started"); }}
                onSessionEnd={() => { setXrSessionActive(false); addLog("WebXR Session Ended"); }}
            />

            <Canvas 
                shadows 
                camera={{ fov: 70, near: 0.1, far: 1000 }}
                gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
                onCreated={({ gl }) => {
                    addLog("Renderer Created", {
                        vendor: gl.getContext().getParameter(gl.getContext().VENDOR),
                        renderer: gl.getContext().getParameter(gl.getContext().RENDERER)
                    });
                }}
            >
                <XR>
                    <Controllers />
                    <SceneContent 
                        pois={pois} anchorLoc={anchorLoc} camX={camX} camZ={camZ} 
                        isCalibrated={calibMode === 'calibrated'} 
                        worldRotation={worldRotation} onPoiClick={setActivePoi}
                    />
                </XR>
            </Canvas>

            <div className="ar-overlay" style={{ pointerEvents: 'none' }}>
                <div style={{ textAlign: 'center', pointerEvents: 'auto' }}>
                    <div style={{ background: 'rgba(0,0,0,0.85)', padding: '10px 20px', borderRadius: '20px', color: 'white', border: '1px solid #4ECDC4' }}>{status}</div>
                </div>

                {calibMode === 'idle' && anchorLoc && (
                    <div style={{ position: 'absolute', top: '100px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.9)', padding: '20px', borderRadius: '12px', pointerEvents: 'auto', textAlign: 'center', width: '85%', border: '2px solid #4ECDC4' }}>
                        <h3 style={{color: '#4ECDC4', marginTop: 0}}>Paso 1: Calibración</h3>
                        <p style={{fontSize: '0.9rem', color: '#ccc'}}>1. Apunta el celular hacia el frente.<br/>2. Camina 15 metros en línea recta sin girar.</p>
                        <button onClick={() => { setCalibMode('walking'); setWalkData({ startLat: userLoc.lat, startLon: userLoc.lon, startX: camX, startZ: camZ }); }} className="primary" style={{width:'100%', padding:'15px'}}>Iniciar Caminata (15m)</button>
                    </div>
                )}

                {calibMode === 'walking' && (
                    <div style={{ position: 'absolute', top: '100px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.9)', padding: '20px', borderRadius: '12px', color: 'white', textAlign: 'center', border: '2px solid #FF6B6B' }}>
                         <div style={{fontSize: '0.8rem', color: '#FF6B6B'}}>CALIBRANDO...</div>
                         <h1 style={{margin: '10px 0'}}>{Math.hypot(camX - walkData.startX, camZ - walkData.startZ).toFixed(1)} / 15m</h1>
                         <p style={{fontSize: '0.7rem'}}>Mantén el celular apuntando al frente</p>
                    </div>
                )}

                {activePoi && (
                    <div style={{ position: 'absolute', top: '15%', left: '5%', right: '5%', background: 'rgba(20,20,30,0.98)', border: '1px solid #4ECDC4', borderRadius: '15px', padding: '20px', pointerEvents: 'auto', maxHeight: '70vh', overflowY: 'auto' }}>
                        <h2 style={{ color: '#4ECDC4', marginTop: 0 }}>{activePoi.name}</h2>
                        <p style={{color: '#eee'}}>{activePoi.description}</p>
                        <button onClick={() => setActivePoi(null)} className="primary" style={{ marginTop: '20px', width:'100%' }}>Cerrar</button>
                    </div>
                )}

                <div style={{ position: 'absolute', bottom: '20px', right: '20px', background: 'rgba(0,0,0,0.85)', color: '#0f0', padding: '10px', fontSize: '10px', borderRadius: '4px', fontFamily: 'monospace', maxWidth: '200px' }}>
                    <strong style={{color:'#fff'}}>DEBUG CONSOLE</strong><br/>
                    {debugLogs.map((l, i) => <div key={i}>{l}</div>)}
                </div>
            </div>
        </div>
    );
}
