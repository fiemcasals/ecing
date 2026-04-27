import React, { useState } from 'react';
import axios from 'axios';
import { useCalibration } from '../context/CalibrationContext';
import { useNavigate } from 'react-router-dom';

export default function UploadForm() {
    const { isCalibrated } = useCalibration();
    const navigate = useNavigate();
    const [formData, setFormData] = useState({ name: '', lat: '', lon: '', description: '' });
    const [file, setFile] = useState(null);
    const [status, setStatus] = useState('');

    const handleGPS = () => {
        if (!isCalibrated) {
            setStatus("⚠️ Debes calibrar primero en la pestaña de RA.");
            return;
        }
        if ("geolocation" in navigator) {
            setStatus("Obteniendo GPS con alta precisión...");
            navigator.geolocation.getCurrentPosition((pos) => {
                setFormData(prev => ({ ...prev, lat: pos.coords.latitude, lon: pos.coords.longitude }));
                setStatus(`📍 GPS Fijado (Precisión: ${pos.coords.accuracy.toFixed(1)}m)`);
            }, (err) => setStatus("Error al obtener GPS: " + err.message),
            { enableHighAccuracy: true });
        } else {
            setStatus("GPS no soportado en este dispositivo");
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isCalibrated) {
            alert("Por favor, calibra el sistema caminando 15m antes de subir un punto.");
            return;
        }
        setStatus("Subiendo datos...");
        
        const data = new FormData();
        data.append('name', formData.name);
        data.append('lat', formData.lat);
        data.append('lon', formData.lon);
        if (formData.description) data.append('description', formData.description);
        if (file) data.append('file', file);

        try {
            await axios.post(`/api/pois/`, data);
            setStatus("¡Punto guardado exitosamente!");
            setFormData({ name: '', lat: '', lon: '', description: '' });
            setFile(null);
        } catch (error) {
            setStatus("Error al guardar: " + error.message);
        }
    };

    return (
        <div className="upload-container">
            <h2 style={{marginTop: 0, color: '#4ECDC4'}}>Añadir Nuevo Punto (POI)</h2>
            
            {!isCalibrated ? (
                <div style={{ background: 'rgba(255,107,107,0.1)', border: '1px solid #FF6B6B', padding: '15px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center' }}>
                    <p style={{ color: '#FF6B6B', fontWeight: 'bold', margin: '0 0 10px 0' }}>⚠️ SE REQUIERE CALIBRACIÓN</p>
                    <p style={{ fontSize: '0.85rem', color: '#ccc', margin: '0 0 15px 0' }}>Para que los puntos aparezcan en su lugar exacto, debes alinear el sistema en la pestaña RA (usando la caminata o los hitos maestros).</p>
                    <button onClick={() => navigate('/ar')} className="primary" style={{ background: '#FF6B6B' }}>Ir a Calibrar / Alinear 📍</button>
                </div>
            ) : (
                <div style={{ background: 'rgba(78,205,196,0.1)', border: '1px solid #4ECDC4', padding: '10px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center', color: '#4ECDC4', fontSize: '0.9rem' }}>
                    ✅ Sistema Alineado y Listo
                </div>
            )}

            <form onSubmit={handleSubmit} style={{ opacity: isCalibrated ? 1 : 0.5, pointerEvents: isCalibrated ? 'auto' : 'none' }}>
                <div className="form-group">
                    <label>Nombre del Lugar / Indicador</label>
                    <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Ej: Suelo Blando" />
                </div>
                
                <div className="form-group">
                    <label>Coordenadas (Lat, Lon)</label>
                    <div style={{display: 'flex', gap: '0.5rem'}}>
                        <input required type="number" step="any" value={formData.lat} onChange={e => setFormData({...formData, lat: e.target.value})} placeholder="Latitud" />
                        <input required type="number" step="any" value={formData.lon} onChange={e => setFormData({...formData, lon: e.target.value})} placeholder="Longitud" />
                    </div>
                    <button type="button" onClick={handleGPS} style={{background: '#444', color: 'white', border: 'none', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer', marginTop: '0.5rem'}}>📍 Usar mi ubicación actual</button>
                </div>

                <div className="form-group">
                    <label>Detalle / Descripción</label>
                    <textarea rows="3" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Información adicional visible en la RA..." />
                </div>

                <div className="form-group">
                    <label>Adjuntar Multimedia (Opcional)</label>
                    <input type="file" onChange={e => setFile(e.target.files[0])} accept="image/*,video/*" />
                </div>

                <button type="submit" className="primary" disabled={!isCalibrated}>Guardar Punto</button>
                {status && <p style={{marginTop: '1rem', color: status.includes('Error') || status.includes('⚠️') ? '#ff4444' : '#4ECDC4', fontWeight: 'bold'}}>{status}</p>}
                
                <hr style={{margin: '2rem 0', borderColor: '#4ECDC4', opacity: 0.2}} />
                
                <button type="button" onClick={async () => {
                    if (window.confirm("¿ESTAS SEGURO? Se borrarán todos los POIs de la base de datos.")) {
                        try {
                            const res = await axios.delete('/api/pois/all');
                            setStatus(res.data.message);
                        } catch (err) {
                            setStatus("Error al limpiar DB: " + err.message);
                        }
                    }
                }} style={{background: '#661111', color: 'white', border: 'none', padding: '1rem', borderRadius: '4px', cursor: 'pointer', width: '100%', fontWeight: 'normal', fontSize: '0.8rem'}}>
                    🗑️ LIMPIAR TODA LA BASE DE DATOS
                </button>
            </form>
        </div>
    );
}
