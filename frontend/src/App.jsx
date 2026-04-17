import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import UploadForm from './components/UploadForm';
import ARScene from './components/ARScene';
import './index.css';

function App() {
  return (
    <Router>
      <div className="app-container">
        <nav className="main-nav">
          <Link to="/" className="nav-link">📍 Subir Puntos</Link>
          <Link to="/ar" className="nav-link highlight">📱 Ver en RA</Link>
        </nav>
        <Routes>
          <Route path="/" element={<UploadForm />} />
          <Route path="/ar" element={<ARScene />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
