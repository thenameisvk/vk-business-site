
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
 import './index.css'
 
// Bootstrap 5 CSS
import 'bootstrap/dist/css/bootstrap.min.css';

// Bootstrap 5 JS (Required for Dropdowns, Modals, Tooltips, Collapse, etc.)
import 'bootstrap/dist/js/bootstrap.bundle.min.js';

// Bootstrap Icons CSS
import 'bootstrap-icons/font/bootstrap-icons.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

