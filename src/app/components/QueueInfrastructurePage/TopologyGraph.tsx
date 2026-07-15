import React, { useEffect, useRef } from 'react';
import { observer } from 'mobx-react';
import { observable, action } from 'mobx';
import {
  Visualization,
  VisualizationProvider,
  VisualizationSurface,
  useVisualizationController,
  ModelKind,
  withPanZoom,
  withSelection,
  DefaultNode,
  DefaultEdge,
  ComponentFactory,
  Graph,
  Layout,
  Node,
  GraphComponent,
  DagreLayout,
  LEFT_TO_RIGHT,
  TopologyView,
  TopologyControlBar,
  createTopologyControlButtons,
  defaultControlButtonsOptions,
  NodeShape,
  GRAPH_LAYOUT_END_EVENT,
  SELECTION_EVENT,
  RectAnchor,
  useAnchor,
} from '@patternfly/react-topology';
import type { ShapeProps, NodeModel, EdgeModel, EdgeProps } from '@patternfly/react-topology';
import type { ClusterQueue, LocalQueue, QueueTopologyNode } from '../../types/kueue';
import { parseQuantity } from '../../utils/quantity';

// Module-level MobX observable for selection state.
// Using this instead of relying on withSelection() → ShapeProps because:
// - VisualizationSurface `state` prop only syncs to controller on mount (not on updates)
// - DefaultNode may not always forward `selected` to custom shapes via getCustomShape
// - observer() Shapes that read selectionStore.selectedId will re-render automatically
const selectionStore = observable({ selectedId: null as string | null });
const setSelectedId = action((id: string | null) => { selectionStore.selectedId = id; });

const NODE_NAMESPACE = 'Namespace';
const NODE_LOCAL_QUEUE = 'LocalQueue';
const NODE_CLUSTER_QUEUE = 'ClusterQueue';
const NODE_COHORT = 'Cohort';
const NODE_FLAVOR = 'ResourceFlavor';

const NODE_COLORS: Record<string, string> = {
  [NODE_NAMESPACE]: '#EC7A08',
  [NODE_LOCAL_QUEUE]: '#0066CC',
  [NODE_CLUSTER_QUEUE]: '#C9190B',
  [NODE_COHORT]: '#6A0080',
  [NODE_FLAVOR]: '#3E8635',
};

// Compute scheduled fraction (own workloads / nominal) for the most-saturated resource in a CQ.
function computeCQScheduledPct(cq: ClusterQueue): number {
  let best = 0;
  for (const rg of cq.spec.resourceGroups ?? []) {
    for (const flavorSpec of rg.flavors) {
      const flavorUsage = cq.status?.flavorsReservation?.find((fu) => fu.name === flavorSpec.name);
      for (const resSpec of flavorSpec.resources) {
        const quota = parseQuantity(resSpec.nominalQuota);
        if (quota <= 0) continue;
        const resUsage = flavorUsage?.resources.find((r) => r.name === resSpec.name);
        const totalUsed = parseQuantity(resUsage?.total ?? '0');
        const borrowed = parseQuantity(resUsage?.borrowed ?? '0');
        const ownUsed = Math.max(0, totalUsed - borrowed);
        best = Math.max(best, Math.min(1, ownUsed / quota));
      }
    }
  }
  return best;
}

// Per-flavor::resource cohort lending pool snapshot.
// contribution_i = min(spare_i, lendingLimit_i); totalBorrowed = sum of all members' borrowed.
type CohortPool = Map<string, { totalPool: number; totalBorrowed: number }>;

function buildCohortPool(cohortName: string, cqs: ClusterQueue[]): CohortPool {
  const pool: CohortPool = new Map();
  for (const cq of cqs.filter((q) => q.spec.cohort === cohortName)) {
    for (const rg of cq.spec.resourceGroups ?? []) {
      for (const fl of rg.flavors) {
        for (const res of fl.resources) {
          const key = `${fl.name}::${res.name}`;
          const quota = parseQuantity(res.nominalQuota);
          const lendingLimit = res.lendingLimit ? parseQuantity(res.lendingLimit) : 0;
          const fu = cq.status?.flavorsReservation?.find((f) => f.name === fl.name);
          const ru = fu?.resources.find((r) => r.name === res.name);
          const ownUsed = Math.max(0, parseQuantity(ru?.total ?? '0') - parseQuantity(ru?.borrowed ?? '0'));
          const contribution = Math.min(Math.max(0, quota - ownUsed), lendingLimit);
          const borrowed = parseQuantity(ru?.borrowed ?? '0');
          const prev = pool.get(key) ?? { totalPool: 0, totalBorrowed: 0 };
          pool.set(key, { totalPool: prev.totalPool + contribution, totalBorrowed: prev.totalBorrowed + borrowed });
        }
      }
    }
  }
  return pool;
}

// Compute the fraction of this CQ's nominal that is actually being lent right now.
// Only non-zero when siblings are actively borrowing. Distributed proportionally by contribution.
function computeCQLentPct(cq: ClusterQueue, pool: CohortPool): number {
  let best = 0;
  for (const rg of cq.spec.resourceGroups ?? []) {
    for (const fl of rg.flavors) {
      for (const res of fl.resources) {
        const key = `${fl.name}::${res.name}`;
        const quota = parseQuantity(res.nominalQuota);
        if (quota <= 0) continue;
        const lendingLimit = res.lendingLimit ? parseQuantity(res.lendingLimit) : 0;
        if (lendingLimit <= 0) continue;
        const { totalPool, totalBorrowed } = pool.get(key) ?? { totalPool: 0, totalBorrowed: 0 };
        if (totalBorrowed <= 0) continue; // nobody is borrowing — no green bar
        const fu = cq.status?.flavorsReservation?.find((f) => f.name === fl.name);
        const ru = fu?.resources.find((r) => r.name === res.name);
        const ownUsed = Math.max(0, parseQuantity(ru?.total ?? '0') - parseQuantity(ru?.borrowed ?? '0'));
        const contribution = Math.min(Math.max(0, quota - ownUsed), lendingLimit);
        const actuallyLent = totalPool > 0 ? contribution * (totalBorrowed / totalPool) : 0;
        best = Math.max(best, actuallyLent / quota);
      }
    }
  }
  return Math.min(best, 1);
}

// Compute cohort utilization using per-(flavor::resource) ratio, then take the max.
// Same approach as CQ bars — avoids mixing CPU and memory units in a single sum.
function computeCohortUtilization(cohortName: string, cqs: ClusterQueue[]): number {
  const members = cqs.filter((q) => q.spec.cohort === cohortName);
  const nominalMap = new Map<string, number>();
  const usedMap = new Map<string, number>();
  for (const cq of members) {
    for (const rg of cq.spec.resourceGroups ?? []) {
      for (const fl of rg.flavors) {
        for (const res of fl.resources) {
          const key = `${fl.name}::${res.name}`;
          nominalMap.set(key, (nominalMap.get(key) ?? 0) + parseQuantity(res.nominalQuota));
        }
      }
    }
    for (const fu of cq.status?.flavorsReservation ?? []) {
      for (const res of fu.resources) {
        const key = `${fu.name}::${res.name}`;
        usedMap.set(key, (usedMap.get(key) ?? 0) + parseQuantity(res.total ?? '0'));
      }
    }
  }
  let maxPct = 0;
  for (const [key, nominal] of nominalMap) {
    if (nominal > 0) maxPct = Math.max(maxPct, (usedMap.get(key) ?? 0) / nominal);
  }
  return Math.min(maxPct, 1);
}

// Produce a compact edge label for CQ → Cohort borrowing, e.g. "↗ 4 GPU".
function computeBorrowingLabel(cq: ClusterQueue): string | undefined {
  const parts: string[] = [];
  for (const fu of cq.status?.flavorsReservation ?? []) {
    for (const res of fu.resources) {
      if (res.borrowed && res.borrowed !== '0') {
        const short =
          res.name.toLowerCase().includes('gpu') ? 'GPU'
          : res.name === 'cpu' ? 'CPU'
          : res.name === 'memory' ? 'MEM'
          : (res.name.split('/').pop() ?? res.name);
        parts.push(`${res.borrowed} ${short}`);
      }
    }
  }
  if (parts.length === 0) return undefined;
  return `↗ ${parts.slice(0, 2).join(', ')}${parts.length > 2 ? '…' : ''}`;
}

// Build a colored shape with optional utilization bar, pending badge, and label rendered inside.
// Rendering the label inside the shape (instead of relying on DefaultNode's external label)
// gives consistent appearance regardless of hover/selection state.
const makeShape = (
  color: string,
  opts?: { badge?: boolean; utilBar?: boolean },
): React.FC<ShapeProps> => {
  const Shape: React.FC<ShapeProps> = observer(({ width, height, element }) => {
    useAnchor((el: Node) => new RectAnchor(el));
    // Read selection from module-level MobX observable — guaranteed to re-render on change.
    const selected = selectionStore.selectedId === element.getId();
    const data = element.getData?.() as { pending?: number; scheduledPct?: number; lentPct?: number; utilizationPct?: number } | undefined;
    const pending = opts?.badge ? (data?.pending ?? 0) : 0;
    // scheduledPct = own workloads; lentPct = lent to cohort pool; utilizationPct = simple single value (cohort)
    const scheduledPct = opts?.utilBar ? (data?.scheduledPct ?? data?.utilizationPct ?? 0) : 0;
    const lentPct = opts?.utilBar ? (data?.lentPct ?? 0) : 0;
    const rawLabel = element.getLabel?.() ?? '';
    // Truncate label to fit inside the node box (~6.6px per char at font-size 11)
    const maxChars = Math.max(4, Math.floor((width - 16) / 6.6));
    const displayLabel = rawLabel.length > maxChars ? rawLabel.slice(0, maxChars - 1) + '…' : rawLabel;
    const clipId = `util-clip-${element.getId()}`;

    return (
      <g>
        {opts?.utilBar ? (
          <>
            <defs>
              <clipPath id={clipId}>
                <rect x={0} y={0} width={width} height={height} rx={8} />
              </clipPath>
            </defs>
            {/* Base background — moderate opacity so label stays readable even at 0% fill */}
            <rect x={0} y={0} width={width} height={height} rx={8} fill={color} fillOpacity={0.45} stroke="none" />
            {/* Scheduled segment */}
            {scheduledPct > 0 && (
              <rect x={0} y={0} width={width * scheduledPct} height={height}
                fill={color} fillOpacity={0.95} stroke="none" clipPath={`url(#${clipId})`} />
            )}
            {/* Lent-to-cohort segment (green) */}
            {lentPct > 0 && (
              <rect x={width * scheduledPct} y={0} width={width * lentPct} height={height}
                fill="#3E8635" fillOpacity={0.95} stroke="none" clipPath={`url(#${clipId})`} />
            )}
            {/* Border */}
            <rect x={0} y={0} width={width} height={height} rx={8} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.6} />
          </>
        ) : (
          <rect x={0} y={0} width={width} height={height} rx={8} fill={color} stroke="none" />
        )}
        {/* Label rendered inside the shape — avoids DefaultNode's hover-sensitive label background */}
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          stroke="rgba(0,0,0,0.35)"
          strokeWidth={0.4}
          paintOrder="stroke"
          fontSize={11}
          fontWeight={selected ? 700 : 500}
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {displayLabel}
        </text>
        {/* Selection ring: bright white border on the node edge, colored inset ring just inside */}
        {selected && (
          <>
            <rect x={0} y={0} width={width} height={height} rx={8} fill="none" stroke="white" strokeWidth={5} />
            <rect x={3} y={3} width={width - 6} height={height - 6} rx={5} fill="none" stroke={color} strokeWidth={2} strokeOpacity={1} />
          </>
        )}
        {/* Pending badge */}
        {pending > 0 && (
          <>
            <circle cx={width - 10} cy={10} r={9} fill="#EC7A08" stroke="white" strokeWidth={1.5} />
            <text
              x={width - 10} y={10} textAnchor="middle" dominantBaseline="central"
              fill="white" fontSize={pending > 99 ? 7 : 9} fontWeight="bold"
              style={{ userSelect: 'none' }}
            >
              {pending > 99 ? '99+' : pending}
            </text>
          </>
        )}
      </g>
    );
  });
  return Shape;
};

// Stable module-level shape instances.
const SHAPE_BY_KIND: Record<string, React.FC<ShapeProps>> = {
  [NODE_NAMESPACE]: makeShape(NODE_COLORS[NODE_NAMESPACE]),
  [NODE_LOCAL_QUEUE]: makeShape(NODE_COLORS[NODE_LOCAL_QUEUE], { badge: true }),
  [NODE_CLUSTER_QUEUE]: makeShape(NODE_COLORS[NODE_CLUSTER_QUEUE], { badge: true, utilBar: true }),
  [NODE_COHORT]: makeShape(NODE_COLORS[NODE_COHORT], { utilBar: true }),
  [NODE_FLAVOR]: makeShape(NODE_COLORS[NODE_FLAVOR]),
};

const getCustomShape = (element: Node): React.FC<ShapeProps> =>
  SHAPE_BY_KIND[element.getData()?.kind as string] ?? SHAPE_BY_KIND[NODE_CLUSTER_QUEUE];

// Plain edge (no label).
const PlainEdge: React.FC<EdgeProps> = (props) => <DefaultEdge {...props} />;

// Borrowing edge — draws an orange SVG path + inline arrowhead + pill label.
const BorrowingEdge: React.FC<EdgeProps> = observer((props) => {
  const { element } = props;
  const label = (element.getData?.() as { label?: string } | undefined)?.label ?? '';
  const startPoint = element.getStartPoint?.();
  const endPoint = element.getEndPoint?.();
  if (!startPoint || !endPoint) return null;
  const bendpoints = element.getBendpoints?.() ?? [];
  const allPoints = [startPoint, ...bendpoints, endPoint];

  // Find the longest segment — place label at its midpoint.
  let bestLen = -1;
  let midX = (startPoint.x + endPoint.x) / 2;
  let midY = (startPoint.y + endPoint.y) / 2;
  for (let i = 0; i < allPoints.length - 1; i++) {
    const dx = allPoints[i + 1].x - allPoints[i].x;
    const dy = allPoints[i + 1].y - allPoints[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > bestLen) { bestLen = len; midX = (allPoints[i].x + allPoints[i + 1].x) / 2; midY = (allPoints[i].y + allPoints[i + 1].y) / 2; }
  }

  // Inline arrowhead — avoids unreliable url(#marker) in nested SVG groups.
  const arrowSize = 10;
  const prev = allPoints[allPoints.length - 2];
  const angle = Math.atan2(endPoint.y - prev.y, endPoint.x - prev.x);
  const tip = endPoint;
  const left = { x: tip.x - arrowSize * Math.cos(angle - Math.PI / 6), y: tip.y - arrowSize * Math.sin(angle - Math.PI / 6) };
  const right = { x: tip.x - arrowSize * Math.cos(angle + Math.PI / 6), y: tip.y - arrowSize * Math.sin(angle + Math.PI / 6) };
  // Shorten last segment so the line ends at the base of the arrowhead.
  const shortenedEnd = { x: tip.x - arrowSize * Math.cos(angle), y: tip.y - arrowSize * Math.sin(angle) };
  const pathPoints = [...allPoints.slice(0, -1), shortenedEnd];
  const pathD = pathPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <g>
      {/* Orange edge line */}
      <path d={pathD} stroke="#EC7A08" strokeWidth={2.5} fill="none" />
      {/* Inline arrowhead polygon */}
      <polygon points={`${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`} fill="#EC7A08" />
      {/* Pill label centered on longest segment */}
      {label && (
        <g transform={`translate(${midX}, ${midY})`}>
          <rect x={-34} y={-9} width={68} height={18} rx={9} fill="#EC7A08" />
          <text textAnchor="middle" dominantBaseline="central" fill="white" fontSize={10} fontWeight="bold">
            {label}
          </text>
        </g>
      )}
    </g>
  );
});

// IMPORTANT: This MUST be a stable module-level constant, not created inside componentFactory.
// PF topology calls componentFactory on every render cycle. If withSelection()() were called
// inline inside the factory, React would see a new component type on each render, unmount the
// old instance, and mount a fresh one — resetting selected=false every frame.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TopologyNodeComponent = withSelection()((props: any) => (
  <DefaultNode {...props} truncateLength={100} getCustomShape={getCustomShape} showLabel={false} />
));

const componentFactory: ComponentFactory = (kind, type) => {
  if (kind === ModelKind.graph) return withPanZoom({ zoomMin: 0.001 })(GraphComponent);
  if (kind === ModelKind.node) return TopologyNodeComponent;
  if (kind === ModelKind.edge) {
    if (type === 'edge-borrow') return BorrowingEdge;
    return PlainEdge;
  }
  return undefined;
};

const layoutFactory = (_type: string, graph: Graph): Layout =>
  new DagreLayout(graph, {
    rankdir: LEFT_TO_RIGHT,
    nodesep: 60,
    ranksep: 80,
    marginx: 20,
    marginy: 20,
  });

// --- Legend ---

const LEGEND_ENTRIES = [
  { kind: 'Namespace', color: NODE_COLORS[NODE_NAMESPACE], desc: 'Kueue-managed namespace. Entry point for workload submission.' },
  { kind: 'LocalQueue', color: NODE_COLORS[NODE_LOCAL_QUEUE], desc: 'Namespace-scoped queue. Users submit workloads here; maps to a ClusterQueue.' },
  { kind: 'ClusterQueue', color: NODE_COLORS[NODE_CLUSTER_QUEUE], desc: 'Cluster-wide resource pool with defined quotas. Admits workloads from LocalQueues.' },
  { kind: 'Cohort', color: NODE_COLORS[NODE_COHORT], desc: 'Group of ClusterQueues that can lend/borrow resources from each other.' },
];

const TopologyLegend: React.FC = () => {
  const [open, setOpen] = React.useState(true);
  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 10,
        background: '#fff',
        border: '1px solid #d2d2d2',
        borderRadius: 4,
        minWidth: 210,
        maxWidth: 290,
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        fontSize: '0.82em',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '5px 10px',
          cursor: 'pointer',
          borderBottom: open ? '1px solid #d2d2d2' : 'none',
          userSelect: 'none',
        }}
        onClick={() => setOpen(!open)}
      >
        <strong>Legend</strong>
        <span style={{ color: '#6a6e73', fontSize: '0.9em' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ padding: '8px 10px' }}>
          {LEGEND_ENTRIES.map((e) => (
            <div key={e.kind} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: 6 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  background: e.color,
                  flexShrink: 0,
                  marginTop: 2,
                }}
              />
              <div>
                <strong>{e.kind}</strong>
                <div style={{ color: '#6a6e73', lineHeight: 1.3 }}>{e.desc}</div>
              </div>
            </div>
          ))}
          <div style={{ color: '#6a6e73', borderTop: '1px solid #d2d2d2', paddingTop: 6, marginTop: 2 }}>
            Orange badge = pending workloads. Fill shows utilization:{' '}
            <span style={{ color: '#C9190B', fontWeight: 600 }}>■</span> scheduled,{' '}
            <span style={{ color: '#3E8635', fontWeight: 600 }}>■</span> lent to cohort pool.{' '}
            <strong>↗</strong> = active borrowing.
          </div>
        </div>
      )}
    </div>
  );
};

// --- Props ---

interface TopologyGraphProps {
  clusterQueues: ClusterQueue[];
  localQueues: LocalQueue[];
  selectedNodeId: string | null;
  filterNamespace: string;
  onNodeSelect: (node: QueueTopologyNode | null) => void;
}

// --- Inner component (uses topology context) ---

const TopologyGraphInner: React.FC<TopologyGraphProps> = ({
  clusterQueues,
  localQueues,
  selectedNodeId,
  filterNamespace,
  onNodeSelect,
 }) => {
  const controller = useVisualizationController();
  // Track previous structural state so data-only refreshes don't trigger re-layout (which resets zoom/pan).
  const prevFilterNs = useRef<string | undefined>(undefined);
  const prevNodeIds = useRef<string>('');

  useEffect(() => {
    const onLayoutEnd = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => controller.getGraph().fit(80));
      });
    };
    controller.addEventListener(GRAPH_LAYOUT_END_EVENT, onLayoutEnd);
    return () => { controller.removeEventListener(GRAPH_LAYOUT_END_EVENT, onLayoutEnd); };
  }, [controller]);

  useEffect(() => {
    const handler = (ids: string[]) => {
      if (!ids || ids.length === 0) { setSelectedId(null); onNodeSelect(null); return; }
      const element = controller.getElementById(ids[0]);
      if (!element || element.getKind() === ModelKind.graph) { setSelectedId(null); onNodeSelect(null); return; }
      const data = element.getData?.();
      if (!data) return;
      setSelectedId(element.getId());
      onNodeSelect({
        id: element.getId(),
        kind: data.kind,
        name: data.name,
        namespace: data.namespace,
        data: data.resource ?? { name: data.name, clusterQueues: [] },
      });
    };
    controller.addEventListener(SELECTION_EVENT, handler);
    return () => { controller.removeEventListener(SELECTION_EVENT, handler); };
  }, [controller, onNodeSelect]);

  useEffect(() => {
    const nodes: NodeModel[] = [];
    const edges: EdgeModel[] = [];

    const visibleLQs = filterNamespace
      ? localQueues.filter((lq) => lq.metadata.namespace === filterNamespace)
      : localQueues;
    const visibleCQNames = new Set(visibleLQs.map((lq) => lq.spec.clusterQueue));
    const visibleCQs = filterNamespace
      ? clusterQueues.filter((cq) => visibleCQNames.has(cq.metadata.name))
      : clusterQueues;

    // Cohort nodes
    const cohortNames = Array.from(
      new Set(visibleCQs.map((cq) => cq.spec.cohort).filter((c): c is string => Boolean(c))),
    );
    for (const name of cohortNames) {
      nodes.push({
        id: `cohort:${name}`,
        type: NODE_COHORT,
        label: name,
        shape: NodeShape.hexagon,
        width: 130,
        height: 55,
        data: { kind: NODE_COHORT, name, utilizationPct: computeCohortUtilization(name, visibleCQs) },
      });
    }

    // Pre-compute cohort lending pools (needed for accurate lentPct per CQ).
    const cohortPoolCache = new Map<string, CohortPool>();
    for (const name of cohortNames) {
      cohortPoolCache.set(name, buildCohortPool(name, visibleCQs));
    }

    // ClusterQueue nodes + edges to cohorts and flavors
    for (const cq of visibleCQs) {
      const cqId = `cq:${cq.metadata.name}`;
      const scheduledPct = computeCQScheduledPct(cq);
      const pool = cq.spec.cohort ? (cohortPoolCache.get(cq.spec.cohort) ?? new Map()) : new Map<string, {totalPool:number;totalBorrowed:number}>();
      const lentPct = computeCQLentPct(cq, pool);
      nodes.push({
        id: cqId,
        type: NODE_CLUSTER_QUEUE,
        label: cq.metadata.name,
        shape: NodeShape.rect,
        width: 160,
        height: 55,
        data: {
          kind: NODE_CLUSTER_QUEUE,
          name: cq.metadata.name,
          resource: cq,
          pending: cq.status?.pendingWorkloads ?? 0,
          scheduledPct,
          lentPct,
        },
      });

      if (cq.spec.cohort) {
        const borrowLabel = computeBorrowingLabel(cq);
        edges.push({
          id: `e:${cqId}->cohort:${cq.spec.cohort}`,
          type: borrowLabel ? 'edge-borrow' : 'edge',
          source: cqId,
          target: `cohort:${cq.spec.cohort}`,
          data: borrowLabel ? { label: borrowLabel } : {},
        });
      }

      // ResourceFlavor nodes are intentionally omitted from the graph —
      // they create many-to-many crossing edges. Flavor quota details are
      // shown in the ClusterQueue detail panel instead.
    }

    // Namespace and LocalQueue nodes
    const allNamespaces = Array.from(
      new Set(visibleLQs.map((lq) => lq.metadata.namespace ?? '')),
    );
    for (const ns of allNamespaces) {
      nodes.push({
        id: `ns:${ns}`,
        type: NODE_NAMESPACE,
        label: ns,
        shape: NodeShape.stadium,
        width: 140,
        height: 50,
        data: { kind: NODE_NAMESPACE, name: ns, namespace: ns },
      });
    }

    for (const lq of visibleLQs) {
      const lqId = `lq:${lq.metadata.namespace}:${lq.metadata.name}`;
      const cqId = `cq:${lq.spec.clusterQueue}`;
      const nsId = `ns:${lq.metadata.namespace ?? ''}`;
      nodes.push({
        id: lqId,
        type: NODE_LOCAL_QUEUE,
        label: lq.metadata.name,
        shape: NodeShape.rect,
        width: 140,
        height: 50,
        data: {
          kind: NODE_LOCAL_QUEUE,
          name: lq.metadata.name,
          namespace: lq.metadata.namespace,
          resource: lq,
          pending: lq.status?.pendingWorkloads ?? 0,
        },
      });
      edges.push({ id: `e:${nsId}->${lqId}`, type: 'edge', source: nsId, target: lqId });
      edges.push({ id: `e:${lqId}->${cqId}`, type: 'edge', source: lqId, target: cqId });
    }

    // Detect structural changes (new/removed nodes, filter change, or borrowing state change) vs pure data refresh.
    const borrowingEdgeIds = edges.filter((e) => e.type === 'edge-borrow').map((e) => e.id).sort().join(',');
    const nodeIdKey = nodes.map((n) => n.id).sort().join(',') + '|' + borrowingEdgeIds;
    const isStructural = filterNamespace !== prevFilterNs.current || nodeIdKey !== prevNodeIds.current;
    prevFilterNs.current = filterNamespace;
    prevNodeIds.current = nodeIdKey;

    // Merge mode (true) preserves zoom/pan; full rebuild (false) re-runs layout + auto-fits.
    controller.fromModel(
      { graph: { id: 'kueue-topology', type: 'graph', layout: 'Dagre' }, nodes, edges },
      !isStructural,
    );
  }, [clusterQueues, localQueues, filterNamespace, controller]);

  const controlButtons = createTopologyControlButtons({
    ...defaultControlButtonsOptions,
    legend: false,
    zoomInCallback: () => controller.getGraph().scaleBy(4 / 3),
    zoomOutCallback: () => controller.getGraph().scaleBy(3 / 4),
    fitToScreenCallback: () => controller.getGraph().fit(80),
    resetViewCallback: () => controller.getGraph().fit(80),
  });

  return (
    <div style={{ position: 'relative' }}>
      <TopologyView
        style={{ height: '520px', border: '1px solid #d2d2d2', borderRadius: '4px' }}
        controlBar={<TopologyControlBar controlButtons={controlButtons} />}
      >
        <VisualizationSurface state={{ selectedIds: selectedNodeId ? [selectedNodeId] : [] }} />
      </TopologyView>
      <TopologyLegend />
    </div>
  );
};

// Outer component holds a stable Visualization ref.
const TopologyGraph: React.FC<TopologyGraphProps> = (props) => {
  const controllerRef = useRef<Visualization | null>(null);

  if (!controllerRef.current) {
    const controller = new Visualization();
    controller.registerLayoutFactory(layoutFactory);
    controller.registerComponentFactory(componentFactory);
    controllerRef.current = controller;
  }

  return (
    <VisualizationProvider controller={controllerRef.current}>
      <TopologyGraphInner {...props} />
    </VisualizationProvider>
  );
};

export default TopologyGraph;
