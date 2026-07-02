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
import type { ShapeProps, NodeModel, EdgeModel } from '@patternfly/react-topology';
import type { ClusterQueue, LocalQueue, ResourceFlavor, QueueTopologyNode } from '../../types/kueue';

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

// Pre-built stable shape components per kind — stable references prevent React remounting.
// Use the function form of useAnchor to satisfy TypeScript's AnchorConstructor signature.
const makeColorShape = (color: string): React.FC<ShapeProps> => {
  const Shape: React.FC<ShapeProps> = ({ width, height }) => {
    useAnchor((el: Node) => new RectAnchor(el));
    return (
      <rect x={0} y={0} width={width} height={height} rx={8} fill={color} stroke="none" />
    );
  };
  return Shape;
};

const SHAPE_BY_KIND: Record<string, React.FC<ShapeProps>> = {
  [NODE_NAMESPACE]: makeColorShape(NODE_COLORS[NODE_NAMESPACE]),
  [NODE_LOCAL_QUEUE]: makeColorShape(NODE_COLORS[NODE_LOCAL_QUEUE]),
  [NODE_CLUSTER_QUEUE]: makeColorShape(NODE_COLORS[NODE_CLUSTER_QUEUE]),
  [NODE_COHORT]: makeColorShape(NODE_COLORS[NODE_COHORT]),
  [NODE_FLAVOR]: makeColorShape(NODE_COLORS[NODE_FLAVOR]),
};

const getCustomShape = (element: Node): React.FC<ShapeProps> =>
  SHAPE_BY_KIND[element.getData()?.kind as string] ?? SHAPE_BY_KIND[NODE_CLUSTER_QUEUE];

// Component factory — stable module-level reference, no recreation on render.
const componentFactory: ComponentFactory = (kind) => {
  if (kind === ModelKind.graph) {
    return withPanZoom()(GraphComponent);
  }
  if (kind === ModelKind.node) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return withSelection()((props: any) => (
      <DefaultNode {...props} truncateLength={22} getCustomShape={getCustomShape} showLabel />
    ));
  }
  if (kind === ModelKind.edge) {
    return DefaultEdge;
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

interface TopologyGraphProps {
  clusterQueues: ClusterQueue[];
  localQueues: LocalQueue[];
  flavors: ResourceFlavor[];
  selectedNodeId: string | null;
  filterNamespace: string;
  onNodeSelect: (node: QueueTopologyNode | null) => void;
}

const TopologyGraphInner: React.FC<TopologyGraphProps> = ({
  clusterQueues,
  localQueues,
  selectedNodeId,
  filterNamespace,
  onNodeSelect,
}) => {
  const controller = useVisualizationController();

  // Fit to screen after the layout engine finishes positioning nodes.
  // We defer via rAF twice: once to let React flush the SVG to the DOM,
  // once more to let the browser measure the container dimensions before fit().
  useEffect(() => {
    const onLayoutEnd = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => controller.getGraph().fit(80));
      });
    };
    controller.addEventListener(GRAPH_LAYOUT_END_EVENT, onLayoutEnd);
    return () => { controller.removeEventListener(GRAPH_LAYOUT_END_EVENT, onLayoutEnd); };
  }, [controller]);

  // Listen for node selection events (fires with array of selected IDs).
  useEffect(() => {
    const handler = (ids: string[]) => {
      if (!ids || ids.length === 0) {
        onNodeSelect(null);
        return;
      }
      const element = controller.getElementById(ids[0]);
      if (!element || element.getKind() === ModelKind.graph) {
        onNodeSelect(null);
        return;
      }
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

  // Build the graph model whenever data or namespace filter changes.
  useEffect(() => {
    const nodes: NodeModel[] = [];
    const edges: EdgeModel[] = [];
    const addedFlavors = new Set<string>();
    const addedEdges = new Set<string>();

    // When a namespace is selected, limit to LQs in that namespace, then derive
    // which CQs/cohorts/flavors are reachable so the graph stays connected.
    const visibleLQs = filterNamespace
      ? localQueues.filter((lq) => lq.metadata.namespace === filterNamespace)
      : localQueues;
    const visibleCQNames = new Set(visibleLQs.map((lq) => lq.spec.clusterQueue));
    const visibleCQs = filterNamespace
      ? clusterQueues.filter((cq) => visibleCQNames.has(cq.metadata.name))
      : clusterQueues;

    // Cohort nodes (derived from CQ specs)
    const cohortNames = Array.from(
      new Set(visibleCQs.map((cq) => cq.spec.cohort).filter((c): c is string => Boolean(c)))
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
      nodes.push({
        id: cqId,
        type: NODE_CLUSTER_QUEUE,
        label: cq.metadata.name,
        shape: NodeShape.rect,
        width: 160,
        height: 55,
        data: { kind: NODE_CLUSTER_QUEUE, name: cq.metadata.name, resource: cq },
      });

      if (cq.spec.cohort) {
        edges.push({
          id: `e:${cqId}->cohort:${cq.spec.cohort}`,
          type: 'edge',
          source: cqId,
          target: `cohort:${cq.spec.cohort}`,
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

    // One namespace node per unique namespace, one LQ node per actual LocalQueue.
    // Namespaces point to their individual LQ nodes (one-to-many).
    const allNamespaces = Array.from(new Set(visibleLQs.map((lq) => lq.metadata.namespace ?? '')));
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
        },
      });
      edges.push({ id: `e:${nsId}->${lqId}`, type: 'edge', source: nsId, target: lqId });
      edges.push({ id: `e:${lqId}->${cqId}`, type: 'edge', source: lqId, target: cqId });
    }

    controller.fromModel(
      { graph: { id: 'kueue-topology', type: 'graph', layout: 'Dagre' }, nodes, edges },
      false
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
    <TopologyView
      style={{ height: '520px', border: '1px solid #d2d2d2', borderRadius: '4px' }}
      controlBar={<TopologyControlBar controlButtons={controlButtons} />}
    >
      <VisualizationSurface state={{ selectedIds: selectedNodeId ? [selectedNodeId] : [] }} />
    </TopologyView>
  );
};

// Outer component holds a stable Visualization ref — never recreated on re-render.
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
