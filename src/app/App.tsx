import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import QueueInfrastructurePage from './components/QueueInfrastructurePage';
import WorkloadsPage from './components/WorkloadsPage';

const App: React.FC = () => (
  <Routes>
    <Route path="/" element={<Navigate to="/kueue/infrastructure" replace />} />
    <Route path="/kueue" element={<Navigate to="/kueue/infrastructure" replace />} />
    <Route path="/kueue/infrastructure" element={<QueueInfrastructurePage />} />
    <Route path="/kueue/workloads" element={<WorkloadsPage />} />
    <Route path="/kueue/workloads/:namespace/:name" element={<WorkloadsPage />} />
  </Routes>
);

export default App;
