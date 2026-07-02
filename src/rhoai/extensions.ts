export const kueueAreaExtension = {
  type: 'app.area' as const,
  properties: {
    id: 'kueue',
    featureFlags: [],
  },
};

export const kueueCommunitySectionExtension = {
  type: 'app.navigation/section' as const,
  properties: {
    id: 'community-plugins',
    title: 'Community plugins',
    group: '9_plugins',
    iconRef: () => import('./KueueNavIcon'),
  },
};

export const kueueInfraNavExtension = {
  type: 'app.navigation/href' as const,
  properties: {
    id: 'kueue-infrastructure-nav',
    title: 'Kueue Infrastructure',
    href: '/kueue/infrastructure',
    section: 'community-plugins',
    label: 'Community',
  },
};

export const kueueWorkloadsNavExtension = {
  type: 'app.navigation/href' as const,
  properties: {
    id: 'kueue-workloads-nav',
    title: 'Kueue Workloads',
    href: '/kueue/workloads',
    section: 'community-plugins',
    label: 'Community',
  },
};

export const kueueInfraRouteExtension = {
  type: 'app.route' as const,
  properties: {
    path: '/kueue/infrastructure',
    component: () => import('../app/components/QueueInfrastructurePage'),
  },
};

export const kueueWorkloadsRouteExtension = {
  type: 'app.route' as const,
  properties: {
    path: '/kueue/workloads/*',
    component: () => import('../app/components/WorkloadsPage'),
  },
};

export const extensions = [
  kueueAreaExtension,
  kueueCommunitySectionExtension,
  kueueInfraNavExtension,
  kueueWorkloadsNavExtension,
  kueueInfraRouteExtension,
  kueueWorkloadsRouteExtension,
];

export default extensions;
