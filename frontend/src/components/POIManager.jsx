import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function POIManager() {
    const [pois, setPois] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingPoi, setEditingPoi] = useState(null);
    const [formData, setFormData] = useState({ name: '', lat: '', lon: '', description: '' });
    const [newFile, setNewFile] = useState(null);
    const [removeFile, setRemoveFile] = useState(false);
    const [status, setStatus] = useState('');

    const fetchPois = async () => {
        try {
            const res = await axios.get('/api/pois/');
            setPois(res.data);
            setLoading(false);
        } catch (err) {
            console.error(err);
            setStatus("Error al cargar puntos");
        }
    };

    useEffect(() => {
        fetchPois();
    }, []);

    const handleDelete = async (id) => {
        if (!window.confirm("¿Estás seguro de eliminar este punto permanentemente?")) return;
        try {
            await axios.delete(`/api/pois/${id}`);
            fetchPois();
            setStatus("Punto eliminado");
        } catch (err) {
            setStatus("Error al eliminar");
        }
    };

    const startEdit = (poi) => {
        setEditingPoi(poi);
        setFormData({ name: poi.name, lat: poi.lat, lon: poi.lon, description: poi.description || '' });
        setNewFile(null);
        setRemoveFile(false);
        setStatus('');
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        const data = new FormData();
        data.append('name', formData.name);
        data.append('lat', formData.lat);
        data.append('lon', formData.lon);
        data.append('description', formData.description);
        data.append('remove_file', removeFile);
        if (newFile) data.append('file', newFile);

        try {
            await axios.put(`/api/pois/${editingPoi.id}`, data);
            setStatus("¡Actualizado!");
            setEditingPoi(null);
            fetchPois();
        } catch (err) {
            setStatus("Error al actualizar");
        }
    };

    if (loading) return <div className="manager-container">Cargando puntos...</div>;

    return (
        <div className="manager-container">
            <h2 style={{color: '#4ECDC4'}}>Gestión de Puntos de Interés</h2>
            {status && <p style={{color: '#FF6B6B', fontWeight: 'bold'}}>{status}</p>}
            
            <table className="poi-table">
                <thead>
                    <tr>
                        <th>Nombre</th>
                        <th>Coordenadas</th>
                        <th>Adjunto</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {pois.map(poi => (
                        <tr key={poi.id}>
                            <td>{poi.name}</td>
                            <td>{poi.lat.toFixed(5)}, {poi.lon.toFixed(5)}</td>
                            <td>
                                {poi.file_type === 'image' && <span title="Imagen">🖼️</span>}
                                {poi.file_type === 'video' && <span title="Video">🎥</span>}
                                {poi.file_type === 'pdf' && <span title="Documento">📄</span>}
                                {!poi.file_type && <span style={{opacity: 0.3}}>Ninguno</span>}
                            </td>
                            <td className="action-btns">
                                <button className="btn-edit" onClick={() => startEdit(poi)}>Editar</button>
                                <button className="btn-delete" onClick={() => handleDelete(poi.id)}>Borrar</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {editingPoi && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <button className="btn-close" onClick={() => setEditingPoi(null)}>X</button>
                        <h3 style={{color: '#4ECDC4', marginTop: 0}}>Editar Punto</h3>
                        <form onSubmit={handleUpdate}>
                            <div className="form-group">
                                <label>Nombre</label>
                                <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                            </div>
                            <div style={{display: 'flex', gap: '0.5rem'}}>
                                <div className="form-group" style={{flex: 1}}>
                                    <label>Latitud</label>
                                    <input required type="number" step="any" value={formData.lat} onChange={e => setFormData({...formData, lat: e.target.value})} />
                                </div>
                                <div className="form-group" style={{flex: 1}}>
                                    <label>Longitud</label>
                                    <input required type="number" step="any" value={formData.lon} onChange={e => setFormData({...formData, lon: e.target.value})} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Descripción</label>
                                <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
                            </div>

                            <div className="form-group" style={{background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px'}}>
                                <label>Multimedia Actual</label>
                                {editingPoi.file_url ? (
                                    <div className="media-preview">
                                        {editingPoi.file_type === 'image' && <img src={editingPoi.file_url} alt="preview" />}
                                        {editingPoi.file_type === 'video' && <video controls src={editingPoi.file_url} />}
                                        {editingPoi.file_type === 'pdf' && <span>📄 Documento PDF Guardado</span>}
                                        <div style={{marginTop: '0.5rem'}}>
                                            <input type="checkbox" checked={removeFile} onChange={e => setRemoveFile(e.target.checked)} /> 
                                            <span style={{fontSize: '0.8rem', marginLeft: '5px', color: '#FF6B6B'}}>Marcar para eliminar adjunto</span>
                                        </div>
                                    </div>
                                ) : <p style={{fontSize: '0.8rem', opacity: 0.6}}>Sin archivos adjuntos</p>}
                                
                                <label style={{marginTop: '1rem', display: 'block'}}>Subir nuevo (reemplaza actual)</label>
                                <input type="file" onChange={e => setNewFile(e.target.files[0])} accept="image/*,video/*,.pdf" />
                            </div>

                            <button type="submit" className="primary">Guardar Cambios</button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
