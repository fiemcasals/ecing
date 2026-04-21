import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import UploadForm from './components/UploadForm';
import ARScene from './components/ARScene';
import POIManager from './components/POIManager';
import { CalibrationProvider } from './context/CalibrationContext';
import './index.css';

function App() {
  return (
    <CalibrationProvider>
      <Router>
        <div className="app-container">
          <nav className="main-nav">
            <Link to="/" className="nav-link">📍 Subir</Link>
            <Link to="/gestionar" className="nav-link">📋 Gestionar</Link>
            <Link to="/ar" className="nav-link highlight">📱 Ver en RA</Link>
          </nav>
          <Routes>
            <Route path="/" element={<UploadForm />} />
            <Route path="/ar" element={<ARScene />} />
            <Route path="/gestionar" element={<POIManager />} />
          </Routes>
        </div>
      </Router>
    </CalibrationProvider>
  );
}

export default App;
