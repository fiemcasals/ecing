import React, { useEffect, useState, useRef, useMemo } from 'react';
import axios from 'axios';
import { Canvas, useFrame } from '@react-three/fiber';
import { ARButton, XR, Controllers } from '@react-three/xr';
import * as THREE from 'three';

// --- MATHS ---
function calculateDistanceAndBearing(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
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
    const distance = R * c;

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1)*Math.sin(φ2) -
              Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
    let brng = Math.atan2(y, x);
    brng = (brng * 180 / Math.PI + 360) % 360;
    return { distance, bearing: brng };
}

// --- 3D COMPONENTS ---

function POIMarker({ poi, anchorLoc, userPos, onClick }) {
    const coords = useMemo(() => {
        const { distance, bearing } = calculateDistanceAndBearing(anchorLoc.lat, anchorLoc.lon, poi.lat, poi.lon);
        const bearingRad = bearing * Math.PI / 180;
        return {
            x: distance * Math.sin(bearingRad),
            z: -distance * Math.cos(bearingRad),
            distance
        };
    }, [poi, anchorLoc]);

    const distToUser = Math.hypot(coords.x - userPos.x, coords.z - userPos.z);
    const scale = Math.max(1, distToUser / 20);

    return (
        <group position={[coords.x, 0, coords.z]} scale={[scale, scale, scale]}>
            {/* Clickable area */}
            <mesh onClick={onClick} position={[0, 1.5, 0]}>
                <boxGeometry args={[2, 3, 0.5]} />
                <meshBasicMaterial transparent opacity={0} />
            </mesh>

            {/* Visual Flag */}
            <mesh position={[0, 0, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 3]} />
                <meshStandardMaterial color="white" />
            </mesh>
            <mesh position={[0.6, 1, 0]}>
                <planeGeometry args={[1.2, 0.8]} />
                <meshStandardMaterial color="#4ECDC4" side={THREE.DoubleSide} />
            </mesh>

            {/* Label Placeholder (WebXR handles text differently, using simple planes for now) */}
            <group position={[0, 2.2, 0]}>
                <mesh>
                    <planeGeometry args={[2.5, 0.8]} />
                    <meshStandardMaterial color="#1a1a2e" opacity={0.9} transparent />
                </mesh>
                {/* Visual substitute for a-text until we add Troika-three-text if needed */}
            </group>
        </group>
    );
}

function SceneContent({ pois, anchorLoc, userLoc, worldRotation, camX, camZ, calibMode, onPoiClick }) {
    const worldRef = useRef();

    useFrame((state) => {
        if (worldRef.current) {
            // Apply GPS translation and Calibration rotation
            // We move the world relative to XR origin (0,0,0 is where session started)
            worldRef.current.position.set(-camX, -0.2, -camZ);
            worldRef.current.rotation.y = THREE.MathUtils.degToRad(worldRotation);
        }
    });

    return (
        <group ref={worldRef}>
            {calibMode === 'calibrated' && (
                <>
                    <gridHelper args={[400, 100, 0x4ecdc4, 0x222222]} />
                    {pois.map(poi => (
                        <POIMarker 
                            key={poi.id} 
                            poi={poi} 
                            anchorLoc={anchorLoc} 
                            userPos={{x: camX, z: camZ}} 
                            onClick={() => onPoiClick(poi)} 
                        />
                    ))}
                </>
            )}
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} />
        </group>
    );
}

// --- MAIN COMPONENT ---

export default function ARScene() {
    const [pois, setPois] = useState([]);
    const [status, setStatus] = useState("Obteniendo GPS...");
    const [activePoi, setActivePoi] = useState(null);
    const [debugLogs, setDebugLogs] = useState(["WebXR Ready"]);
    const addLog = (msg) => setDebugLogs(prev => [...prev, msg].slice(-5));

    const [userLoc, setUserLoc] = useState(null);
    const [anchorLoc, setAnchorLoc] = useState(null);
    const [worldRotation, setWorldRotation] = useState(0);

    const [calibMode, setCalibMode] = useState('idle');
    const [walkData, setWalkData] = useState(null);

    // Meters from anchor
    const [camX, setCamX] = useState(0);
    const [camZ, setCamZ] = useState(0);

    useEffect(() => {
        let watchId;
        const fetchPOIs = async (lat, lon) => {
            try {
                const response = await axios.get(`/api/pois/nearby`, { params: { lat, lon, max_distance: 2.0 } });
                setPois(response.data);
                setStatus(response.data.length > 0 ? "GPS Fijado. Listo para calibrar." : "No hay puntos cerca.");
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
    }, []);

    // Update camX / camZ when userLoc changes
    useEffect(() => {
        if (anchorLoc && userLoc) {
            const { distance, bearing } = calculateDistanceAndBearing(anchorLoc.lat, anchorLoc.lon, userLoc.lat, userLoc.lon);
            const bearingRad = bearing * Math.PI / 180;
            setCamX(distance * Math.sin(bearingRad));
            setCamZ(-distance * Math.cos(bearingRad));
        }
    }, [userLoc, anchorLoc]);

    // Odometry Calibration
    useEffect(() => {
        if (calibMode === 'walking' && walkData && userLoc) {
            const walkedDist = Math.hypot(camX - walkData.startX, camZ - walkData.startZ);
            if (walkedDist >= 10) {
                const { bearing } = calculateDistanceAndBearing(walkData.startLat, walkData.startLon, userLoc.lat, userLoc.lon);
                // In WebXR, we assume initial forward is 0. Calibration sets rotation offset.
                setWorldRotation(-bearing);
                setCalibMode('calibrated');
                setStatus("✅ Calibrado");
            }
        }
    }, [camX, camZ, calibMode, walkData, userLoc]);

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%' }}>
            <ARButton />
            <Canvas>
                <XR>
                    <Controllers />
                    <SceneContent 
                        pois={pois} 
                        anchorLoc={anchorLoc} 
                        userLoc={userLoc} 
                        worldRotation={worldRotation} 
                        camX={camX} 
                        camZ={camZ} 
                        calibMode={calibMode}
                        onPoiClick={setActivePoi}
                    />
                </XR>
            </Canvas>

            {/* UI Overlay */}
            <div className="ar-overlay" style={{ pointerEvents: 'none' }}>
                <div style={{ textAlign: 'center', pointerEvents: 'auto' }}>
                    <div style={{ background: 'rgba(0,0,0,0.7)', padding: '10px 20px', borderRadius: '20px', color: 'white' }}>
                        {status}
                    </div>
                </div>

                {calibMode === 'idle' && anchorLoc && (
                    <div style={{ position: 'absolute', top: '100px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.8)', padding: '20px', borderRadius: '12px', pointerEvents: 'auto', textAlign: 'center', width: '80%' }}>
                        <h3>WebXR Geolocation</h3>
                        <p>Camina 10 metros en línea recta para orientar el mapa.</p>
                        <button onClick={() => {
                            setCalibMode('walking');
                            setWalkData({ startLat: userLoc.lat, startLon: userLoc.lon, startX: camX, startZ: camZ });
                        }} className="primary">Empezar Caminata</button>
                    </div>
                )}

                {calibMode === 'walking' && (
                    <div style={{ position: 'absolute', top: '100px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.8)', padding: '20px', borderRadius: '12px', color: 'white', textAlign: 'center' }}>
                         <h1>{Math.hypot(camX - walkData.startX, camZ - walkData.startZ).toFixed(1)} / 10m</h1>
                    </div>
                )}

                {activePoi && (
                    <div style={{ position: 'absolute', top: '20%', left: '5%', right: '5%', background: '#1a1a2e', padding: '20px', borderRadius: '15px', pointerEvents: 'auto', border: '1px solid #4ECDC4' }}>
                        <h2 style={{ color: '#4ECDC4' }}>{activePoi.name}</h2>
                        <p>{activePoi.description}</p>
                        {activePoi.file_url && activePoi.file_type === 'image' && <img src={activePoi.file_url} style={{ width: '100%' }} />}
                        {activePoi.file_url && activePoi.file_type === 'video' && <video src={activePoi.file_url} controls style={{ width: '100%' }} />}
                        <button onClick={() => setActivePoi(null)} className="primary" style={{ marginTop: '10px' }}>Cerrar</button>
                    </div>
                )}

                <div style={{ position: 'absolute', bottom: '20px', right: '20px', background: 'black', color: '#0f0', padding: '10px', fontSize: '10px' }}>
                    {debugLogs.map((l, i) => <div key={i}>{l}</div>)}
                    <hr />
                    X: {camX.toFixed(2)} Z: {camZ.toFixed(2)}
                </div>
            </div>
        </div>
    );
}
