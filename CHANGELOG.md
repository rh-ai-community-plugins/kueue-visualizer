# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - Unreleased

### Added

- Queue Infrastructure page: interactive topology graph (LocalQueue → ClusterQueue → Cohort → ResourceFlavor) with PatternFly Topology
- Workloads page: filterable table with per-workload detail drawer
- Node detail panel: capacity bars, cohort borrowing ledger, preemption policy, flavor quotas
- Cohort borrowing edges with orange SVG path + pill label
- Utilization bars per ClusterQueue and Cohort node
- ProjectSelector component with localStorage-backed project persistence
- Helm chart with ClusterRole for read-only Kueue RBAC
- OpenShift Route for direct cluster access
- GitHub Actions CI/CD workflows
- Community plugin navigation section (shared `community-plugins` parent + `kueue` subsection)

[Unreleased]: https://github.com/rh-ai-community-plugins/kueue-plugin/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/rh-ai-community-plugins/kueue-plugin/releases/tag/v0.1.0
