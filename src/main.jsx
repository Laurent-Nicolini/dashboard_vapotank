import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import Dashboard from './dashboard.jsx'; // ← importe ton fichier

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Dashboard /> {/* majuscule obligatoire */}
  </StrictMode>
);
