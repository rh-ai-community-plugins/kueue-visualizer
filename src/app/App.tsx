import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import CommunityBanner from './components/CommunityBanner';
import QueueInfrastructurePage from './components/QueueInfrastructurePage';
import WorkloadsPage from './components/WorkloadsPage';

const App: React.FC = () => (
  <div className="community-plugin-layout">
    {/* [SHARED] Do not remove — all community plugins must display the CommunityBanner */}
    <CommunityBanner />
    <div className="community-plugin-content">
      <Routes>
        <Route path="/" element={<Navigate to="infrastructure" replace />} />
        <Route path="infrastructure" element={<QueueInfrastructurePage />} />
        <Route path="workloads/*" element={<WorkloadsPage />} />
      </Routes>
    </div>
  </div>
);

export default App;
