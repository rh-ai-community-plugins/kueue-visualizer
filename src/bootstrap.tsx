import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router } from 'react-router-dom';
import '@patternfly/react-core/dist/styles/base.css';
import '@patternfly/react-topology/dist/esm/css/topology-components.css';
import App from './app/App';

const root = ReactDOM.createRoot(document.getElementById('root')!);

root.render(
  <React.StrictMode>
    {/* [PLUGIN-SPECIFIC] basename must match route prefix — standalone dev only */}
    <Router basename="/kueue">
      <App />
    </Router>
  </React.StrictMode>,
);
