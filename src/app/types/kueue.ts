// Kueue API types for kueue.x-k8s.io/v1beta1

export interface KueueNamespace {
  name: string;
  labels: Record<string, string>;
}

export interface KubernetesResource {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    creationTimestamp: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
}

export interface KubernetesList<T> {
  apiVersion: string;
  kind: string;
  items: T[];
}

// --- ResourceFlavor ---

export interface ResourceFlavor extends KubernetesResource {
  spec: {
    nodeLabels?: Record<string, string>;
    nodeTaints?: Array<{ key: string; value?: string; effect: string }>;
    tolerations?: Array<{ key: string; operator: string; value?: string; effect: string }>;
  };
}

// --- ClusterQueue ---

export type PreemptionPolicy =
  | 'Never'
  | 'LowerPriority'
  | 'LowerOrNewerEqualPriority'
  | 'Any';

export interface FlavorQuota {
  name: string;
  resources: Array<{
    name: string;
    nominalQuota: string;
    borrowingLimit?: string;
    lendingLimit?: string;
  }>;
}

export interface ResourceGroup {
  coveredResources: string[];
  flavors: FlavorQuota[];
}

export interface FlavorUsage {
  name: string;
  resources: Array<{
    name: string;
    total: string;
    borrowed?: string;
  }>;
}

export interface ClusterQueue extends KubernetesResource {
  spec: {
    cohort?: string;
    queueingStrategy?: 'StrictFIFO' | 'BestEffortFIFO';
    resourceGroups: ResourceGroup[];
    preemption?: {
      reclaimWithinCohort: PreemptionPolicy;
      borrowWithinCohort?: {
        policy: 'Never' | 'LowerPriority';
        maxPriorityThreshold?: number;
      };
      withinClusterQueue: PreemptionPolicy;
    };
    stopPolicy?: 'None' | 'Hold' | 'HoldAndDrain';
  };
  status?: {
    conditions?: Condition[];
    flavorsReservation?: FlavorUsage[];
    flavorUsage?: FlavorUsage[];
    admittedWorkloads?: number;
    pendingWorkloads?: number;
    reservingWorkloads?: number;
  };
}

// --- LocalQueue ---

export interface LocalQueue extends KubernetesResource {
  spec: {
    clusterQueue: string;
    stopPolicy?: 'None' | 'Hold' | 'HoldAndDrain';
  };
  status?: {
    conditions?: Condition[];
    flavorsReservation?: FlavorUsage[];
    flavorUsage?: FlavorUsage[];
    admittedWorkloads?: number;
    pendingWorkloads?: number;
    reservingWorkloads?: number;
  };
}

// --- Workload ---

export interface PodSetRequest {
  name: string;
  resources: {
    requests: Record<string, string>;
  };
}

export interface PodSetAssignment {
  name: string;
  flavors: Record<string, string>;
  resourceUsage: Record<string, string>;
  clusterQueue?: string;
}

export interface Condition {
  type: string;
  status: 'True' | 'False' | 'Unknown';
  reason: string;
  message: string;
  lastTransitionTime: string;
}

export type WorkloadPhase = 'Pending' | 'Admitted' | 'Running' | 'Finished' | 'Failed';

export interface Workload extends KubernetesResource {
  spec: {
    queueName: string;
    priorityClassName?: string;
    priority?: number;
    podSets: Array<{
      name: string;
      count: number;
      template: {
        spec: {
          containers: Array<{
            name: string;
            resources?: {
              requests?: Record<string, string>;
              limits?: Record<string, string>;
            };
          }>;
        };
      };
    }>;
  };
  status?: {
    admission?: {
      clusterQueue: string;
      podSetAssignments: PodSetAssignment[];
    };
    conditions?: Condition[];
    reclaimablePods?: Array<{ name: string; count: number }>;
    admissionChecks?: Array<{ name: string; state: string; message: string }>;
    startTime?: string;
    finishedAt?: string;
  };
}

// --- Derived / UI types ---

export type NodeKind = 'Namespace' | 'LocalQueue' | 'ClusterQueue' | 'Cohort' | 'ResourceFlavor';

export interface NamespaceNode {
  name: string;
  namespace: string;
}

export interface QueueTopologyNode {
  id: string;
  kind: NodeKind;
  name: string;
  namespace?: string;
  data: NamespaceNode | LocalQueue | ClusterQueue | ResourceFlavor | CohortNode;
}

export interface CohortNode {
  name: string;
  clusterQueues: string[];
}

export interface WorkloadQueueInfo {
  workload: Workload;
  phase: WorkloadPhase;
  queuePosition: number | null;
  isBorrowing: boolean;
  borrowingFrom: string | null;
  workloadsAhead: number;
}
