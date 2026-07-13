import React, { useEffect, useRef } from 'react';
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
import type { ClusterQueue, LocalQueue, ResourceFlavor, QueueTopologyNode } from '../../types/kueue';
import { parseQuantity } from '../../utils/quantity';

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

// Compute highest utilization % across all resources in a ClusterQueue (0–1).
function computeCQUtilization(cq: ClusterQueue): number {
  let maxPct = 0;
  for (const rg of cq.spec.resourceGroups ?? []) {
    for (const flavorSpec of rg.flavors) {
      const flavorUsage = (cq.status?.flavorsReservation ?? []).find((fu) => fu.name === flavorSpec.name);
      for (const resSpec of flavorSpec.resources) {
        const quota = parseQuantity(resSpec.nominalQuota);
        if (quota <= 0) continue;
        const used = parseQuantity(
          flavorUsage?.resources.find((r) => r.name === resSpec.name)?.total ?? '0',
        );
        maxPct = Math.max(maxPct, used / quota);
      }
    }
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

// Build a colored shape that optionally shows a pending badge and a fill-from-left utilization background.
const makeShape = (
  color: string,
  opts?: { badge?: boolean; utilBar?: boolean },
): React.FC<ShapeProps> => {
  const Shape: React.FC<ShapeProps> = ({ width, height, element }) => {
    useAnchor((el: Node) => new RectAnchor(el));
    const data = element.getData?.() as { pending?: number; utilizationPct?: number } | undefined;
    const pending = opts?.badge ? (data?.pending ?? 0) : 0;
    const utilPct = opts?.utilBar ? (data?.utilizationPct ?? 0) : 0;
    const fillColor = '#C9190B'; // Always red — matches legend; intensity conveyed by fill width
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
            {/* Muted background — shows remaining capacity */}
            <rect x={0} y={0} width={width} height={height} rx={8} fill={color} fillOpacity={0.25} stroke="none" />
            {/* Vibrant fill from left — shows used capacity */}
            {utilPct > 0 && (
              <rect
                x={0}
                y={0}
                width={width * utilPct}
                height={height}
                fill={fillColor}
                fillOpacity={0.8}
                stroke="none"
                clipPath={`url(#${clipId})`}
              />
            )}
            {/* Border */}
            <rect x={0} y={0} width={width} height={height} rx={8} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.5} />
          </>
        ) : (
          <rect x={0} y={0} width={width} height={height} rx={8} fill={color} stroke="none" />
        )}
        {pending > 0 && (
          <>
            <circle cx={width - 10} cy={10} r={9} fill="#EC7A08" stroke="white" strokeWidth={1.5} />
            <text
              x={width - 10}
              y={10}
              textAnchor="middle"
              dominantBaseline="central"
              fill="white"
              fontSize={pending > 99 ? 7 : 9}
              fontWeight="bold"
              style={{ userSelect: 'none' }}
            >
              {pending > 99 ? '99+' : pending}
            </text>
          </>
        )}
      </g>
    );
  };
  return Shape;
};

// Stable module-level shape instances.
const SHAPE_BY_KIND: Record<string, React.FC<ShapeProps>> = {
  [NODE_NAMESPACE]: makeShape(NODE_COLORS[NODE_NAMESPACE]),
  [NODE_LOCAL_QUEUE]: makeShape(NODE_COLORS[NODE_LOCAL_QUEUE], { badge: true }),
  [NODE_CLUSTER_QUEUE]: makeShape(NODE_COLORS[NODE_CLUSTER_QUEUE], { badge: true, utilBar: true }),
  [NODE_COHORT]: makeShape(NODE_COLORS[NODE_COHORT]),
  [NODE_FLAVOR]: makeShape(NODE_COLORS[NODE_FLAVOR]),
};

const getCustomShape = (element: Node): React.FC<ShapeProps> =>
  SHAPE_BY_KIND[element.getData()?.kind as string] ?? SHAPE_BY_KIND[NODE_CLUSTER_QUEUE];

// Edge component that renders a label from element data.
const LabeledEdge: React.FC<EdgeProps> = (props) => {
  const label = (props.element.getData?.() as { label?: string } | undefined)?.label ?? '';
  return <DefaultEdge {...props} label={label} />;
};

// Component factory — stable module-level reference.
const componentFactory: ComponentFactory = (kind) => {
  if (kind === ModelKind.graph) return withPanZoom({ zoomMin: 0.001 })(GraphComponent);
  if (kind === ModelKind.node) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return withSelection()((props: any) => (
      <DefaultNode {...props} truncateLength={22} getCustomShape={getCustomShape} showLabel />
    ));
  }
  if (kind === ModelKind.edge) return LabeledEdge;
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
  { kind: 'ResourceFlavor', color: NODE_COLORS[NODE_FLAVOR], desc: 'Hardware profile (GPU type, node type) that workloads are assigned to.' },
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
            Orange badge = pending workloads.
            ClusterQueue background fills left→right showing quota used (light red = empty, dark red = full).{' '}
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
  flavors: ResourceFlavor[];
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
      if (!ids || ids.length === 0) { onNodeSelect(null); return; }
      const element = controller.getElementById(ids[0]);
      if (!element || element.getKind() === ModelKind.graph) { onNodeSelect(null); return; }
      const data = element.getData?.();
      if (!data) return;
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
    const addedFlavors = new Set<string>();
    const addedEdges = new Set<string>();

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
        data: { kind: NODE_COHORT, name },
      });
    }

    // ClusterQueue nodes + edges to cohorts and flavors
    for (const cq of visibleCQs) {
      const cqId = `cq:${cq.metadata.name}`;
      const utilizationPct = computeCQUtilization(cq);
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
          utilizationPct,
        },
      });

      if (cq.spec.cohort) {
        const borrowLabel = computeBorrowingLabel(cq);
        edges.push({
          id: `e:${cqId}->cohort:${cq.spec.cohort}`,
          type: 'edge',
          source: cqId,
          target: `cohort:${cq.spec.cohort}`,
          data: borrowLabel ? { label: borrowLabel } : {},
        });
      }

      for (const rg of cq.spec.resourceGroups ?? []) {
        for (const fl of rg.flavors) {
          const flId = `flavor:${fl.name}`;
          if (!addedFlavors.has(fl.name)) {
            addedFlavors.add(fl.name);
            nodes.push({
              id: flId,
              type: NODE_FLAVOR,
              label: fl.name,
              shape: NodeShape.ellipse,
              width: 130,
              height: 50,
              data: { kind: NODE_FLAVOR, name: fl.name },
            });
          }
          const eid = `e:${cqId}->${flId}`;
          if (!addedEdges.has(eid)) {
            addedEdges.add(eid);
            edges.push({ id: eid, type: 'edge', source: cqId, target: flId });
          }
        }
      }
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

    // Detect structural changes (new/removed nodes or filter change) vs pure data refresh.
    const nodeIdKey = nodes.map((n) => n.id).sort().join(',');
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
