import React, { useState } from 'react';
import axios from 'axios';

export default function UploadForm() {
    const [formData, setFormData] = useState({ name: '', lat: '', lon: '', description: '' });
    const [file, setFile] = useState(null);
    const [status, setStatus] = useState('');

    const handleGPS = () => {
        if ("geolocation" in navigator) {
            setStatus("Obteniendo GPS...");
            navigator.geolocation.getCurrentPosition((pos) => {
                setFormData(prev => ({ ...prev, lat: pos.coords.latitude, lon: pos.coords.longitude }));
                setStatus("GPS obtenido correctamente");
            }, (err) => setStatus("Error al obtener GPS: " + err.message),
            { enableHighAccuracy: true });
        } else {
            setStatus("GPS no soportado en este dispositivo");
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
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
            <form onSubmit={handleSubmit}>
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
                    <label>Adjuntar PDF o Imagen (Opcional)</label>
                    <input type="file" onChange={e => setFile(e.target.files[0])} accept="image/*,.pdf" />
                </div>

                <button type="submit" className="primary">Guardar Punto</button>
                {status && <p style={{marginTop: '1rem', color: status.includes('Error') ? '#ff4444' : '#4ECDC4', fontWeight: 'bold'}}>{status}</p>}
            </form>
        </div>
    );
}
