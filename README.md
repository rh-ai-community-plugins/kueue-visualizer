# Kueue Plugin for RHOAI Dashboard

A community plugin for the Red Hat OpenShift AI (RHOAI) Dashboard that provides visibility into Kueue workload scheduling — queue topology, capacity, preemption policies, workload status, cohort borrowing, and resource flavor mapping.

## Features

**Queue Infrastructure page**

- Interactive topology graph: LocalQueue → ClusterQueue → Cohort, with ResourceFlavors as leaf nodes
- Click any node for a detail panel: capacity bars, preemption policy, flavor quotas
- Cohort borrowing ledger: nominal vs. used vs. borrowed per resource dimension
- Namespaces table with per-namespace LocalQueue breakdown

**Workloads page**

- Filterable workload table with queue position, borrow status, and priority
- Per-workload drawer: scheduling status, flavor assignments, lifecycle timeline, condition warnings

---

## Quick Start

### Deploy on an Existing Dashboard

**Prerequisites:** Helm 3, `oc` CLI access, Kueue installed on the cluster, access to `redhat-ods-applications` namespace (requires cluster-admin).

#### 1. Install the plugin

```bash
helm install kueue-plugin chart/ \
  --namespace kueue-project \
  --create-namespace
```

This creates a Deployment, Service, ClusterRole + ClusterRoleBinding (read-only Kueue resources), ServiceAccount, and an OpenShift Route.

#### 2. Register with the RHOAI Dashboard

Retrieve the current Module Federation configuration, append the kueuePlugin entry, and apply it directly to the dashboard Deployment:

```bash
oc get configmap federation-config \
  -n redhat-ods-applications \
  -o jsonpath='{.data.module-federation-config\.json}' \
| python3 -c "
import json, sys
config = json.load(sys.stdin)
config.append({
  'name': 'kueuePlugin',
  'backend': {
    'remoteEntry': '/remoteEntry.js',
    'authorize': False,
    'tls': False,
    'service': {
      'name': 'kueue-plugin',
      'namespace': 'kueue-project',
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

You should see `kueuePlugin` in the output.

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
helm install kueue-plugin chart/ \
  --namespace kueue-project \
  --create-namespace \
  --set image.repository=quay.io/<your-org>/kueue-plugin \
  --set image.tag=0.2.0
```

---

## Upgrade

```bash
helm upgrade kueue-plugin chart/ \
  --namespace kueue-project \
  --set image.repository=quay.io/rh-ai-community-plugins/kueue-plugin \
  --set image.tag=0.2.0
```

The `MODULE_FEDERATION_CONFIG` env var on the dashboard Deployment only needs to be re-applied if the service name or namespace changes.

---

## Re-applying after operator reconciliation

If the RHOAI operator reconciles the `rhods-dashboard` Deployment (e.g. after a RHOAI upgrade), it may restore `MODULE_FEDERATION_CONFIG` from the ConfigMap, dropping the kueuePlugin entry. Re-run step 2 above to restore it.

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

The Helm chart creates a ClusterRole granting read-only access to:

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

- `runAsNonRoot: true` (pod level)
- `allowPrivilegeEscalation: false` (container level)
- `capabilities.drop: ["ALL"]` (container level)
- `seccompProfile.type: RuntimeDefault` (container level)

---

## License

Apache-2.0
