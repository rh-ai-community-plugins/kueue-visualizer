# Kueue Plugin for RHOAI Dashboard

A community plugin for the Red Hat OpenShift AI (RHOAI) Dashboard that provides visibility into Kueue workload scheduling — queue topology, capacity, preemption policies, workload status, cohort borrowing, and resource flavor mapping.

## Features

**Queue Infrastructure page**
- Interactive topology graph: LocalQueue → ClusterQueue → Cohort, with ResourceFlavors as leaf nodes
- Click any node for a detail panel: capacity bars, preemption policy, flavor quotas
- Kueue-managed namespaces table (expandable per-namespace LocalQueue breakdown)
- Cohort borrowing ledger: nominal vs. used vs. borrowed per resource dimension

**Workloads page**
- Filterable workload table with queue position, borrow status, and priority
- Per-workload drawer: scheduling status, flavor assignments, lifecycle timeline, condition warnings

---

## Architecture

This plugin uses [Module Federation](https://webpack.js.org/concepts/module-federation/) — the same mechanism RHOAI uses internally for its own sub-plugins (modelRegistry, genAi, mlflow, etc.). The plugin is a separately deployed React app that the RHOAI dashboard backend proxies to and injects into the browser at runtime. No changes to the dashboard source code are required.

### How RHOAI loads Module Federation plugins

This is the chain we reverse-engineered from the running dashboard pod:

```
federation-config ConfigMap
    ↓  (mounted as env var)
MODULE_FEDERATION_CONFIG on rhods-dashboard Deployment
    ↓  (read by Node.js backend at startup)
Backend registers /_mf/{name} proxy routes → proxies to your service
    ↓  (on every page request)
Backend renders index.html, filling <?- mfRemotesJson ?> with plugin list
    ↓  (in the browser)
<script id="mf-remotes-json"> parsed by frontend JS
    ↓
Frontend dynamically fetches /_mf/kueuePlugin/remoteEntry.js
    ↓
Module Federation loads ./extensions → registers nav item + route in the dashboard
```

Key files inside the dashboard pod (`/usr/src/app`):
- `packages/app-config/dist/module-federation.js` — parses `MODULE_FEDERATION_CONFIG`
- `backend/dist/routes/module-federation.js` — registers `/_mf/{name}` proxy routes
- `frontend/public/index.html` — contains `<?- mfRemotesJson ?>` server-side template

### Why the ConfigMap approach doesn't work

The `federation-config` ConfigMap is owned by the `default-dashboard` Dashboard CR, which is in turn owned by the `default-dsc` DataScienceCluster CR. The ODH operator reconciles the ConfigMap back to its desired state within seconds of any manual change. Setting `managementState: Unmanaged` on the Dashboard CR annotation is not honored in RHOAI 3.4.0.

### The working approach: set the env var directly on the Deployment

Instead of modifying the ConfigMap, set `MODULE_FEDERATION_CONFIG` as a plain env var value directly on the `rhods-dashboard` Deployment. This overrides the `configMapKeyRef` and survives ConfigMap reconciliation. The operator reconciles the Deployment less aggressively (only on Dashboard CR generation changes), so the value persists across normal operation.

---

## Prerequisites

- RHOAI 3.4.0+ cluster with `oc` access
- Kueue installed on the cluster
- Helm 3
- Podman or Docker

---

## Build & Push

```bash
cd kueue-plugin
npm install
npm run build

podman build . -t quay.io/<your-org>/kueue-plugin:0.1
podman push quay.io/<your-org>/kueue-plugin:0.1
```

---

## Deploy

### 1. Helm install

```bash
# Export your active kubeconfig context (needed if helm can't resolve the context name)
oc config view --minify --raw > /tmp/active-kubeconfig.yaml

helm install kueue-plugin ./chart \
  --namespace kueue-project \
  --create-namespace \
  --set image.repository=quay.io/<your-org>/kueue-plugin \
  --set image.tag=0.1 \
  --kubeconfig /tmp/active-kubeconfig.yaml
```

This creates:
- `Deployment` + `Service` (ClusterIP on port 8080)
- `ClusterRole` + `ClusterRoleBinding` granting `get/list/watch` on Kueue resources and namespaces
- `ServiceAccount`
- `Route` (TLS edge termination) — for direct access and as fallback

### 2. Register with the RHOAI dashboard

Get the current `MODULE_FEDERATION_CONFIG` from the running ConfigMap, append the kueuePlugin entry, and set it directly on the Deployment:

```bash
# 1. Fetch and extend the config
oc get configmap federation-config \
  -n redhat-ods-applications \
  -o jsonpath='{.data.module-federation-config\.json}' \
| python3 -c "
import json, sys
config = json.load(sys.stdin)
config.append({
  'name': 'kueuePlugin',
  'remoteEntry': '/remoteEntry.js',
  'authorize': False,
  'tls': False,
  'service': {
    'name': 'kueue-plugin-kueue-plugin',
    'namespace': 'kueue-project',
    'port': 8080
  }
})
print(json.dumps(config))
" > /tmp/mf-config-extended.json

# 2. Set it directly on the Deployment (bypasses the ConfigMap)
oc set env deployment/rhods-dashboard \
  -n redhat-ods-applications \
  "MODULE_FEDERATION_CONFIG=$(cat /tmp/mf-config-extended.json)"
```

The dashboard will roll out new pods automatically. After rollout (~2 min), reload the RHOAI dashboard — **Kueue: Queue Infrastructure** and **Kueue: Workloads** will appear in the sidebar.

### 3. Verify

```bash
# Check the env var is set with kueuePlugin present
oc set env deployment/rhods-dashboard -n redhat-ods-applications --list \
  | grep MODULE_FEDERATION_CONFIG \
  | python3 -c "import json,sys; d=json.loads(sys.stdin.read().split('=',1)[1]); print([e['name'] for e in d])"

# Check the backend proxy route is reachable (redirects to OAuth without a session, which is correct)
curl -sk https://rh-ai.apps.<your-cluster>/_mf/kueuePlugin/remoteEntry.js | head -c 100
```

---

## Upgrade

To update the plugin image:

```bash
podman build . -t quay.io/<your-org>/kueue-plugin:0.2
podman push quay.io/<your-org>/kueue-plugin:0.2

helm upgrade kueue-plugin ./chart \
  --namespace kueue-project \
  --set image.repository=quay.io/<your-org>/kueue-plugin \
  --set image.tag=0.2 \
  --kubeconfig /tmp/active-kubeconfig.yaml
```

The `MODULE_FEDERATION_CONFIG` env var on the Deployment does not need to be re-applied on image upgrades — only if the service name or namespace changes.

---

## Re-applying after operator reconciliation

If the RHOAI operator reconciles the `rhods-dashboard` Deployment (e.g. after a RHOAI upgrade or DataScienceCluster change), it may restore `MODULE_FEDERATION_CONFIG` from the ConfigMap, dropping the kueuePlugin entry. Re-run step 2 above to restore it.

A long-term fix requires the ODH operator to support an extension point in `federation-config` for community plugins. This is tracked as TBD in the [rh-ai-community-plugins charter](https://github.com/rh-ai-community-plugins/charter).

---

## RBAC

The Helm chart creates a `ClusterRole` granting read-only access to:

```yaml
- apiGroups: [kueue.x-k8s.io]
  resources: [localqueues, clusterqueues, workloads, resourceflavors]
  verbs: [get, list, watch]
- apiGroups: [""]
  resources: [namespaces]
  verbs: [get, list, watch]
```

---

## Security

The plugin follows OpenShift `restricted-v2` SCC requirements:
- `runAsNonRoot: true` (pod level) — OpenShift assigns a UID from the namespace's valid range
- `allowPrivilegeEscalation: false` (container level)
- `capabilities.drop: ["ALL"]` (container level)
- `seccompProfile.type: RuntimeDefault` (container level)

---

## License

Apache-2.0
