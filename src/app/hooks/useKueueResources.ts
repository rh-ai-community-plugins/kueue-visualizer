import { useState, useEffect, useCallback, useRef } from 'react';
import { useK8sResources } from './useK8sResources';
import type {
  ClusterQueue,
  LocalQueue,
  ResourceFlavor,
  Workload,
  WorkloadQueueInfo,
  WorkloadPhase,
  FlavorUsage,
  KueueNamespace,
} from '../types/kueue';

// Paths passed to useK8sResources — no /api/k8s prefix (the hook adds it)
const KUEUE_BASE = '/apis/kueue.x-k8s.io/v1beta1';
const CORE_BASE = '/api/v1';
const APPS_BASE = '/apis/apps/v1';

// Full prefix for direct fetch() calls (resolveTopOwner, useKueueNamespaces)
const K8S = '/api/k8s';

// --- Auto-refresh ---

export function useInterval(callback: () => void, delayMs: number): void {
  const savedCallback = useRef(callback);
  useEffect(() => { savedCallback.current = callback; }, [callback]);
  useEffect(() => {
    const id = setInterval(() => savedCallback.current(), delayMs);
    return () => clearInterval(id);
  }, [delayMs]);
}

// --- Individual resource hooks ---

export function useClusterQueues() {
  const { items: clusterQueues, loading, error, refresh } =
    useK8sResources<ClusterQueue>(`${KUEUE_BASE}/clusterqueues`);
  return { clusterQueues, loading, error, refresh };
}

export function useLocalQueues(namespace?: string) {
  const path = namespace
    ? `${KUEUE_BASE}/namespaces/${namespace}/localqueues`
    : `${KUEUE_BASE}/localqueues`;
  const { items: localQueues, loading, error, refresh } =
    useK8sResources<LocalQueue>(path);
  return { localQueues, loading, error, refresh };
}

export function useResourceFlavors() {
  const { items: flavors, loading, error, refresh } =
    useK8sResources<ResourceFlavor>(`${KUEUE_BASE}/resourceflavors`);
  return { flavors, loading, error, refresh };
}

export function useWorkloads(namespace?: string) {
  const path = namespace
    ? `${KUEUE_BASE}/namespaces/${namespace}/workloads`
    : `${KUEUE_BASE}/workloads`;
  const { items: workloads, loading, error, refresh } =
    useK8sResources<Workload>(path);
  return { workloads, loading, error, refresh };
}

export function useKueueNamespaces() {
  const [namespaces, setNamespaces] = useState<KueueNamespace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`${K8S}${CORE_BASE}/namespaces?labelSelector=kueue-managed%3Dtrue`, { signal: controller.signal }).then((r) => r.json()),
      fetch(`${K8S}${CORE_BASE}/namespaces?labelSelector=kueue.openshift.io%2Fmanaged%3Dtrue`, { signal: controller.signal }).then((r) => r.json()),
    ])
      .then(([res1, res2]) => {
        const seen = new Set<string>();
        const merged: KueueNamespace[] = [];
        for (const ns of [...(res1.items ?? []), ...(res2.items ?? [])]) {
          if (!seen.has(ns.metadata.name)) {
            seen.add(ns.metadata.name);
            merged.push({
              name: ns.metadata.name,
              labels: ns.metadata.labels ?? {},
            });
          }
        }
        setNamespaces(merged);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (e.name === 'AbortError') return;
        setError(e.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refresh();
    return () => controllerRef.current?.abort();
  }, [refresh]);

  return { namespaces, loading, error, refresh };
}

// --- Owner chain resolution ---
// Walks the full ownerReference chain upwards until reaching a resource with no owner
// (or an unknown/CRD kind that can't be fetched further).
// Returns a Map<"<ns>/<workload-name>", { kind, name }> with the top-level resource.

// Known intermediate K8s resources and their API paths. Anything not listed (CRDs etc.)
// is considered a "user-facing" top-level resource and stops the traversal.
const TRAVERSABLE_PATHS: Record<string, string> = {
  Pod:        `${K8S}${CORE_BASE}/namespaces/{ns}/pods/{name}`,
  ReplicaSet: `${K8S}${APPS_BASE}/namespaces/{ns}/replicasets/{name}`,
  Deployment: `${K8S}${APPS_BASE}/namespaces/{ns}/deployments/{name}`,
  StatefulSet:`${K8S}${APPS_BASE}/namespaces/{ns}/statefulsets/{name}`,
  DaemonSet:  `${K8S}${APPS_BASE}/namespaces/{ns}/daemonsets/{name}`,
  Job:        `${K8S}/apis/batch/v1/namespaces/{ns}/jobs/{name}`,
  CronJob:    `${K8S}/apis/batch/v1/namespaces/{ns}/cronjobs/{name}`,
};

async function resolveTopOwner(
  ns: string,
  kind: string,
  name: string,
  depth = 0,
): Promise<{ kind: string; name: string }> {
  if (depth > 8) return { kind, name };
  const urlTemplate = TRAVERSABLE_PATHS[kind];
  if (!urlTemplate) return { kind, name }; // CRD / user-facing resource — stop
  try {
    const url = urlTemplate.replace('{ns}', ns).replace('{name}', encodeURIComponent(name));
    const res = await fetch(url);
    if (!res.ok) return { kind, name };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = await res.json() as { metadata?: { ownerReferences?: any[] } };
    const ownerRef = (obj.metadata?.ownerReferences ?? []).find((r) => r.controller)
      ?? obj.metadata?.ownerReferences?.[0];
    if (!ownerRef) return { kind, name }; // No parent — this is the top
    return resolveTopOwner(ns, ownerRef.kind as string, ownerRef.name as string, depth + 1);
  } catch {
    return { kind, name };
  }
}

export function useWorkloadTopOwner(
  workloads: Workload[],
): Map<string, { kind: string; name: string }> {
  const [ownerMap, setOwnerMap] = useState<Map<string, { kind: string; name: string }>>(new Map());

  useEffect(() => {
    const entries = workloads.flatMap((w) => {
      const gvk = w.metadata.annotations?.['kueue.x-k8s.io/job-owner-gvk'] ?? '';
      const ownerKind = gvk.match(/Kind=(\w+)/)?.[1]
        ?? w.metadata.ownerReferences?.find((r) => r.controller)?.kind
        ?? w.metadata.ownerReferences?.[0]?.kind;
      const ownerName = w.metadata.annotations?.['kueue.x-k8s.io/job-owner-name']
        ?? w.metadata.ownerReferences?.find((r) => r.controller)?.name
        ?? w.metadata.ownerReferences?.[0]?.name;
      if (!ownerKind || !ownerName || !w.metadata.namespace) return [];
      return [{
        workloadKey: `${w.metadata.namespace}/${w.metadata.name}`,
        ns: w.metadata.namespace,
        ownerKind,
        ownerName,
      }];
    });

    if (entries.length === 0) return;

    Promise.all(
      entries.map(({ workloadKey, ns, ownerKind, ownerName }) =>
        resolveTopOwner(ns, ownerKind, ownerName)
          .then((top) => [workloadKey, top] as const),
      ),
    ).then((results) => setOwnerMap(new Map(results)));
  }, [workloads]);

  return ownerMap;
}

// --- Derived data ---

export function getWorkloadPhase(workload: Workload): WorkloadPhase {
  const conditions = workload.status?.conditions ?? [];
  const finished = conditions.find((c) => c.type === 'Finished');
  if (finished?.status === 'True') {
    return finished.reason === 'Failed' ? 'Failed' : 'Finished';
  }
  const admitted = conditions.find((c) => c.type === 'Admitted');
  if (admitted?.status === 'True') {
    return workload.status?.startTime ? 'Running' : 'Admitted';
  }
  return 'Pending';
}

export function computeWorkloadQueueInfo(
  workload: Workload,
  allWorkloads: Workload[],
  clusterQueues: ClusterQueue[],
): WorkloadQueueInfo {
  const phase = getWorkloadPhase(workload);
  const admittedCQ = workload.status?.admission?.clusterQueue;

  // Queue position: count Pending workloads in same LocalQueue that were created earlier
  // or have higher priority (lower number = higher priority in Kueue)
  let workloadsAhead = 0;
  let queuePosition: number | null = null;

  if (phase === 'Pending') {
    const peers = allWorkloads.filter(
      (w) =>
        w.spec.queueName === workload.spec.queueName &&
        w.metadata.namespace === workload.metadata.namespace &&
        getWorkloadPhase(w) === 'Pending' &&
        w.metadata.name !== workload.metadata.name,
    );
    workloadsAhead = peers.filter((w) => {
      const wPriority = w.spec.priority ?? 0;
      const thisPriority = workload.spec.priority ?? 0;
      if (wPriority !== thisPriority) return wPriority > thisPriority;
      const tDiff =
        new Date(w.metadata.creationTimestamp).getTime() -
        new Date(workload.metadata.creationTimestamp).getTime();
      if (tDiff !== 0) return tDiff < 0;
      // Stable tiebreaker when timestamps are equal (K8s timestamps are second-resolution)
      return w.metadata.name < workload.metadata.name;
    }).length;
    queuePosition = workloadsAhead + 1;
  }

  // Borrow detection: compare admitted resources against nominalQuota
  let isBorrowing = false;
  let borrowingFrom: string | null = null;

  if (admittedCQ) {
    const cq = clusterQueues.find((q) => q.metadata.name === admittedCQ);
    if (cq?.status?.flavorsReservation && cq.spec.resourceGroups) {
      isBorrowing = detectBorrowing(cq.status.flavorsReservation, cq);
      if (isBorrowing) {
        borrowingFrom = cq.spec.cohort ?? null;
      }
    }
  }

  return { workload, phase, queuePosition, isBorrowing, borrowingFrom, workloadsAhead };
}

function detectBorrowing(usage: FlavorUsage[], cq: ClusterQueue): boolean {
  for (const flavorUsage of usage) {
    const flavorName = flavorUsage.name;
    for (const rg of cq.spec.resourceGroups) {
      const flavorSpec = rg.flavors.find((f) => f.name === flavorName);
      if (!flavorSpec) continue;
      for (const resourceUsage of flavorUsage.resources) {
        if (resourceUsage.borrowed && resourceUsage.borrowed !== '0') {
          return true;
        }
      }
    }
  }
  return false;
}

// --- Cohort helpers ---

export function buildCohortMap(clusterQueues: ClusterQueue[]): Map<string, string[]> {
  const cohorts = new Map<string, string[]>();
  for (const cq of clusterQueues) {
    const cohort = cq.spec.cohort;
    if (cohort) {
      const members = cohorts.get(cohort) ?? [];
      members.push(cq.metadata.name);
      cohorts.set(cohort, members);
    }
  }
  return cohorts;
}
