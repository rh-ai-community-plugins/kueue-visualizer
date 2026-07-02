import { useState, useEffect, useCallback } from 'react';
import type {
  ClusterQueue,
  LocalQueue,
  ResourceFlavor,
  Workload,
  KubernetesList,
  WorkloadQueueInfo,
  WorkloadPhase,
  FlavorUsage,
  KueueNamespace,
} from '../types/kueue';

const KUEUE_API = '/api/k8s/apis/kueue.x-k8s.io/v1beta1';
const CORE_API = '/api/k8s/api/v1';

async function fetchKueue<T>(path: string): Promise<T[]> {
  const res = await fetch(`${KUEUE_API}${path}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${path}: ${res.status} ${res.statusText}`);
  }
  const list: KubernetesList<T> = await res.json();
  return list.items ?? [];
}

// --- Individual resource hooks ---

export function useClusterQueues() {
  const [clusterQueues, setClusterQueues] = useState<ClusterQueue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchKueue<ClusterQueue>('/clusterqueues')
      .then((items) => { setClusterQueues(items); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { clusterQueues, loading, error, refresh };
}

export function useLocalQueues(namespace?: string) {
  const [localQueues, setLocalQueues] = useState<LocalQueue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const path = namespace
    ? `/namespaces/${namespace}/localqueues`
    : '/localqueues';

  const refresh = useCallback(() => {
    setLoading(true);
    fetchKueue<LocalQueue>(path)
      .then((items) => { setLocalQueues(items); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [path]);

  useEffect(() => { refresh(); }, [refresh]);

  return { localQueues, loading, error, refresh };
}

export function useResourceFlavors() {
  const [flavors, setFlavors] = useState<ResourceFlavor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchKueue<ResourceFlavor>('/resourceflavors')
      .then((items) => { setFlavors(items); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { flavors, loading, error, refresh };
}

export function useWorkloads(namespace?: string) {
  const [workloads, setWorkloads] = useState<Workload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const path = namespace
    ? `/namespaces/${namespace}/workloads`
    : '/workloads';

  const refresh = useCallback(() => {
    setLoading(true);
    fetchKueue<Workload>(path)
      .then((items) => { setWorkloads(items); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [path]);

  useEffect(() => { refresh(); }, [refresh]);

  return { workloads, loading, error, refresh };
}

export function useKueueNamespaces() {
  const [namespaces, setNamespaces] = useState<KueueNamespace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    // Fetch namespaces matching either Kueue managed label
    Promise.all([
      fetch(`${CORE_API}/namespaces?labelSelector=kueue-managed%3Dtrue`).then((r) => r.json()),
      fetch(`${CORE_API}/namespaces?labelSelector=kueue.openshift.io%2Fmanaged%3Dtrue`).then((r) => r.json()),
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
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { namespaces, loading, error, refresh };
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
      return new Date(w.metadata.creationTimestamp) < new Date(workload.metadata.creationTimestamp);
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
