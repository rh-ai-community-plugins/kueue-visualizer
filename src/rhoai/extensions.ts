// [SHARED] Common section for all community plugins — never changes across plugins.
// Do not change the id or name: all community plugins share this section
// so they appear grouped together in the dashboard sidebar.
export const communityPluginsSectionExtension = {
  type: 'app.navigation/section' as const,
  properties: {
    id: 'community-plugins', // [SHARED] common section for all community plugins
    title: 'Community plugins', // [SHARED]
    group: '9_plugins', // [SHARED]
    iconRef: () => import(/* webpackMode: "eager" */ './CommunityNavIcon'),
  },
};

// [PLUGIN-SPECIFIC] Everything below is specific to this plugin

export const kueueAreaExtension = {
  type: 'app.area' as const,
  properties: {
    id: 'kueue', // [PLUGIN-SPECIFIC] unique area ID
    featureFlags: [] as string[],
  },
};

export const kueueSectionExtension = {
  type: 'app.navigation/section' as const,
  properties: {
    id: 'kueue', // [PLUGIN-SPECIFIC] unique nav section ID
    title: 'Kueue', // [PLUGIN-SPECIFIC] display name in sidebar
    group: '1_kueue', // [PLUGIN-SPECIFIC] sort key within community-plugins
    section: 'community-plugins', // [SHARED] must match communityPluginsSectionExtension.id
    iconRef: () => import(/* webpackMode: "eager" */ '~/rhoai/KueueNavIcon'),
  },
};

export const kueueInfraNavExtension = {
  type: 'app.navigation/href' as const,
  properties: {
    id: 'kueue-infrastructure-nav', // [PLUGIN-SPECIFIC] unique nav item ID
    title: 'Queue Infrastructure',
    href: '/kueue/infrastructure', // [PLUGIN-SPECIFIC] must match route prefix
    section: 'kueue', // [PLUGIN-SPECIFIC] references this plugin's section ID
    path: '/kueue/infrastructure/*', // [PLUGIN-SPECIFIC] route-matching pattern
  },
};

export const kueueWorkloadsNavExtension = {
  type: 'app.navigation/href' as const,
  properties: {
    id: 'kueue-workloads-nav', // [PLUGIN-SPECIFIC] unique nav item ID
    title: 'Workloads',
    href: '/kueue/workloads', // [PLUGIN-SPECIFIC] must match route prefix
    section: 'kueue', // [PLUGIN-SPECIFIC] references this plugin's section ID
    path: '/kueue/workloads/*', // [PLUGIN-SPECIFIC] route-matching pattern
  },
};

export const kueueRouteExtension = {
  type: 'app.route' as const,
  properties: {
    path: '/kueue/*', // [PLUGIN-SPECIFIC] top-level route prefix
    component: () => import(/* webpackMode: "eager" */ '~/app/App'),
  },
};

export const extensions = [
  communityPluginsSectionExtension,
  kueueAreaExtension,
  kueueSectionExtension,
  kueueInfraNavExtension,
  kueueWorkloadsNavExtension,
  kueueRouteExtension,
];

export default extensions;
