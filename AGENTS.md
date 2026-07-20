# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is `kueue-plugin`, a community plugin for the **Red Hat OpenShift AI (RHOAI) Dashboard** that provides visibility into Kueue workload scheduling. It uses Webpack 5 Module Federation to expose remote modules that the RHOAI dashboard host application loads at runtime.

## Build & Development Commands

```bash
npm run start:dev     # Dev server on port 9500 with HMR
npm run build         # Production build to dist/
npm test              # Run all tests (Jest + jsdom)
npm run test:watch    # Watch mode
npm run test:coverage # Tests with coverage report
npm run lint          # ESLint on src/ + markdownlint on **/*.md
npm run validate      # typecheck + lint + test
```

## Architecture

### Module Federation Plugin System

The plugin exposes two remote modules to the RHOAI dashboard host via Webpack Module Federation (configured in `config/webpack.common.js`):

- **`./extensions`** (`src/rhoai/extensions.ts`) — Defines six extension points:
  - `app.navigation/section` — `community-plugins` shared parent section (with `CommunityNavIcon`)
  - `app.area` — registers the `kueue` feature area
  - `app.navigation/section` — `kueue` plugin subsection (with `KueueNavIcon`)
  - `app.navigation/href` (x2) — "Queue Infrastructure" and "Workloads" nav items under the `kueue` section
  - `app.route` — mounts the App component with wildcard routing at `/kueue/*`
- **`./Icon`** (`src/rhoai/KueueNavIcon.tsx`) — SVG icon for the plugin's nav subsection.

Shared singletons (react, react-dom, react-router-dom, @patternfly/react-core, @openshift/dynamic-plugin-sdk) are provided by the host and not bundled into the plugin.

### Pages

- **Queue Infrastructure** (`src/app/components/QueueInfrastructurePage/`) — Topology graph, node detail panel, cohort borrowing ledger, namespaces table.
- **Workloads** (`src/app/components/WorkloadsPage/`) — Filterable workload table with detail drawer.

### Data Fetching

`src/app/hooks/useKueueResources.ts` — fetches Kueue CRDs via the dashboard's `/api/k8s/*` pass-through proxy. Uses AbortController for cleanup on unmount.

### Key Types

`src/app/types/kueue.ts` — TypeScript types for ClusterQueue, LocalQueue, Workload, ResourceFlavor, Cohort.

### Entry Point Chain

`src/index.ts` → dynamic import → `src/bootstrap.tsx` (React 18 root render). The dynamic import is required for Module Federation to resolve shared dependencies before the app renders.

### Webpack Configs

- `config/webpack.common.js` — Shared config: entry point, loaders, Module Federation, path alias `~` → `./src`
- `config/webpack.dev.js` — Dev server on port 9500, proxies `/kueue` to dashboard at `localhost:8443`
- `config/webpack.prod.js` — Output to `dist/`, CSS extraction

### Scripts

- `scripts/build-push.sh` — Builds and pushes the container image to Quay.io. Auto-computes the next version from git tags if not provided.
- `scripts/scan-image.sh` — Builds the container image locally and scans for vulnerabilities using Trivy.
- `scripts/sync-chart-version.js` — Syncs the version from root `package.json` into `chart/Chart.yaml` and `plugin.yaml`. Runs automatically via npm's `version` lifecycle hook.

### Deployment

- **Container**: Multi-stage build in `Containerfile` — UBI9 Node 22 builder → UBI9 Nginx 1.24 serving `dist/` on port 8080 as UID 1001.
- **Helm chart**: `chart/` deploys Deployment + Service + ClusterRole + ClusterRoleBinding + ServiceAccount + OpenShift Route.

### CI/CD Workflows

- `.github/workflows/ci.yml` — Runs typecheck, lint, and tests on push/PR to `main`.
- `.github/workflows/build-push.yml` — Builds and pushes the container image to Quay.io. Manually triggered via `workflow_dispatch` with a version input.

## Key Conventions

- Path alias: `~` maps to `./src` (webpack). Use `~` in source code imports.
- UI components use **PatternFly 6** (`@patternfly/react-core`, `@patternfly/react-icons`, `@patternfly/react-topology`).
- Plugin-specific identifiers are annotated with `[PLUGIN-SPECIFIC]` comments; shared conventions use `[SHARED]`.
- MobX `observer` is required on topology components that read MobX-tracked state (PF topology uses MobX internally).
