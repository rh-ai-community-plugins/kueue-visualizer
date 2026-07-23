# Kueue Plugin for RHOAI Dashboard

A community plugin for the Red Hat OpenShift AI (RHOAI) Dashboard that provides visibility into Kueue workload scheduling — queue topology, capacity, preemption policies, workload status, cohort borrowing, and resource flavor mapping.

## Features

### Queue Infrastructure page

- Interactive topology graph: LocalQueue → ClusterQueue → Cohort, with ResourceFlavors as leaf nodes
- Click any node for a detail panel: capacity bars, preemption policy, flavor quotas
- Cohort borrowing ledger: nominal vs. used vs. borrowed per resource dimension
- Namespaces table with per-namespace LocalQueue breakdown

### Workloads page

- Filterable workload table with queue position, borrow status, and priority
- Per-workload drawer: scheduling status, flavor assignments, lifecycle timeline, condition warnings

---

## Quick Start

### Deploy on an Existing Dashboard

**Prerequisites:** Helm 3, `oc` CLI access, Kueue installed on the cluster, access to `redhat-ods-applications` namespace (requires cluster-admin).

#### 1. Install the plugin

```bash
helm install kueue-visualizer chart/ \
  --namespace cp-kueue-visualizer \
  --create-namespace
```

This creates a Deployment, Service, ServiceAccount, and an OpenShift Route.

#### 2. Register with the RHOAI Dashboard

Retrieve the current Module Federation configuration, append the kueueVisualizer entry, and apply it directly to the dashboard Deployment:

```bash
oc get configmap federation-config \
  -n redhat-ods-applications \
  -o jsonpath='{.data.module-federation-config\.json}' \
| python3 -c "
import json, sys
config = json.load(sys.stdin)
config.append({
  'name': 'kueueVisualizer',
  'backend': {
    'remoteEntry': '/remoteEntry.js',
    'authorize': False,
    'tls': False,
    'service': {
      'name': 'kueue-visualizer',
      'namespace': 'cp-kueue-visualizer',
      'port': 8080
    }
  }
})
print(json.dumps(config))
" > /tmp/mf-config-extended.json

oc set env deployment/rhods-dashboard \
  -n redhat-ods-applications \
  "MODULE_FEDERATION_CONFIG=$(cat /tmp/mf-config-extended.json)"
```

New dashboard pods roll out automatically. After roughly two minutes, reload the RHOAI dashboard — **Kueue > Queue Infrastructure** and **Kueue > Workloads** appear in the sidebar under **Community plugins**.

#### 3. Verify

```bash
oc set env deployment/rhods-dashboard -n redhat-ods-applications --list \
  | grep '^MODULE_FEDERATION_CONFIG=' \
  | python3 -c "import json,sys; d=json.loads(sys.stdin.read().split('=',1)[1].strip()); print('\n'.join(e['name'] for e in d))"
```

You should see `kueueVisualizer` in the output.

---

## Build & Push

```bash
npm install
npm run build

# Build and push (auto-computes next version from git tags)
./scripts/build-push.sh

# Or with an explicit version
./scripts/build-push.sh 0.2.0
```

Or via Make:

```bash
make image-push VERSION=0.2.0
```

---

## Deploy Custom Image

```bash
helm install kueue-visualizer chart/ \
  --namespace cp-kueue-visualizer \
  --create-namespace \
  --set image.repository=quay.io/<your-org>/kueue-visualizer \
  --set image.tag=0.2.0
```

---

## Upgrade

```bash
helm upgrade kueue-visualizer chart/ \
  --namespace cp-kueue-visualizer \
  --set image.repository=quay.io/rh-ai-community-plugins/kueue-visualizer \
  --set image.tag=0.2.0
```

The `MODULE_FEDERATION_CONFIG` env var on the dashboard Deployment only needs to be re-applied if the service name or namespace changes.

---

## Re-applying after operator reconciliation

If the RHOAI operator reconciles the `rhods-dashboard` Deployment (e.g. after a RHOAI upgrade), it may restore `MODULE_FEDERATION_CONFIG` from the ConfigMap, dropping the kueueVisualizer entry. Re-run step 2 above to restore it.

---

## Development

```bash
npm install
npm run start:dev     # Dev server on port 9500
npm test              # Run tests
npm run lint          # ESLint + markdownlint
npm run typecheck     # TypeScript type check
npm run validate      # typecheck + lint + test
```

---

## RBAC

The plugin uses the RHOAI dashboard's `/api/k8s` proxy, which makes API calls impersonating the logged-in user. No additional ClusterRole is created by the Helm chart.

Users need read access to Kueue resources to use this plugin. This is provided by Kueue's built-in **`kueue-batch-user-role`** ClusterRole, which grants `get/list/watch` on `clusterqueues`, `localqueues`, and `workloads`.

### Granting access

In a future RHOAI release, this role will be granted automatically when a user is given distributed workloads access via the RHOAI dashboard. Until then, a cluster admin must grant it manually:

```bash
oc adm policy add-cluster-role-to-user kueue-batch-user-role <username>
```

Or for all users in a group:

```bash
oc adm policy add-cluster-role-to-group kueue-batch-user-role <group-name>
```

Users without this role will see an explanatory message in the plugin instead of an error.

---

## Security

The plugin follows OpenShift `restricted-v2` SCC requirements:

- `runAsNonRoot: true` (pod level)
- `allowPrivilegeEscalation: false` (container level)
- `capabilities.drop: ["ALL"]` (container level)
- `seccompProfile.type: RuntimeDefault` (container level)

---

## License

Apache-2.0
