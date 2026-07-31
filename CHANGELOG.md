# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.2] - 2026-08-02

### Added

- Create Project modal accessible from the ProjectSelector dropdown footer, with Kubernetes-compliant resource name validation and auto-generation from display name
- Optimistic project addition via `addProject` in `useProjects` hook — newly created projects appear immediately without a full refresh
- Close-on-blur behavior for the ProjectSelector dropdown
- Unit tests for ProjectSelector, CreateProjectModal, and useProjects hook
- Helm chart `namespace` value (`cp-kueue-visualizer` default) with a `kueue-visualizer.namespace` helper, allowing namespace override via `--set namespace=<ns>`
- Namespace template (`namespace.yaml`) for automatic namespace creation when it differs from the release namespace
- Explicit namespace on all Helm chart resources (Deployment, Service, Route, ServiceAccount)

### Changed

- Default installation namespace changed from `kueue-project` to `cp-kueue-visualizer` across Helm chart, plugin.yaml, and README
- Corrected maintainer GitHub handle from `rlundber` to `RHRolun` in plugin.yaml

## [0.1.1] - 2026-07-21

### Added

- Cohort filter on the Workloads page: clicking "View workloads" from a Cohort detail panel now passes a `?cohort=` URL parameter, filtering workloads to that cohort's ClusterQueues
- Info alert banner on the Workloads page when a cohort filter is active, with a back-navigation link

### Changed

- Renamed Module Federation container from `kueuePlugin` to `kueueVisualizer` across webpack config, package.json, plugin.yaml, and README
- Made build/push and scan scripts executable

### Fixed

- Support for Kueue >= v0.10 `cohortName` field alongside the legacy `cohort` field on ClusterQueue specs

## [0.1.0] - 2026-07-20

### Added

- Queue Infrastructure page: interactive topology graph (LocalQueue → ClusterQueue → Cohort → ResourceFlavor) with PatternFly Topology
- Workloads page: filterable table with per-workload detail drawer
- Node detail panel: capacity bars, cohort borrowing ledger, preemption policy, flavor quotas
- Cohort borrowing edges with orange SVG path + pill label
- Utilization bars per ClusterQueue and Cohort node
- ProjectSelector component with localStorage-backed project persistence
- Helm chart for deployment (Namespace, Deployment, Service, ServiceAccount, Route)
- OpenShift Route for direct cluster access
- GitHub Actions CI/CD workflows
- Community plugin navigation section (shared `community-plugins` parent + `kueue` subsection)

[Unreleased]: https://github.com/rh-ai-community-plugins/kueue-visualizer/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/rh-ai-community-plugins/kueue-visualizer/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/rh-ai-community-plugins/kueue-visualizer/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/rh-ai-community-plugins/kueue-visualizer/releases/tag/v0.1.0
