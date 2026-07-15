import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  PageSection,
  Title,
  Spinner,
  Alert,
  Split,
  SplitItem,
  Stack,
  StackItem,
  Select,
  SelectOption,
  SelectList,
  MenuToggle,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  SearchInput,
  Divider,
} from '@patternfly/react-core';
import {
  useClusterQueues,
  useLocalQueues,
  useResourceFlavors,
  useKueueNamespaces,
} from '../../hooks/useKueueResources';
import TopologyGraph from './TopologyGraph';
import NodeDetailPanel from './NodeDetailPanel';
import CohortLedger from './CohortLedger';
import NamespacesPanel from './NamespacesPanel';
import type { QueueTopologyNode, LocalQueue } from '../../types/kueue';

const QueueInfrastructurePage: React.FC = () => {
  const [searchParams] = useSearchParams();

  const { clusterQueues, loading: cqLoading, error: cqError } = useClusterQueues();
  const { localQueues, loading: lqLoading, error: lqError } = useLocalQueues();
  const { flavors, loading: flLoading, error: flError } = useResourceFlavors();
  const { namespaces, loading: nsLoading, error: nsError } = useKueueNamespaces();

  const [selectedNode, setSelectedNode] = useState<QueueTopologyNode | null>(null);
  // Pre-populate namespace filter from URL param (e.g. coming from Workloads page).
  const [filterNamespace, setFilterNamespace] = useState(() => searchParams.get('ns') ?? '');
  const [nsSelectOpen, setNsSelectOpen] = useState(false);
  const [nsSearch, setNsSearch] = useState('');

  // Auto-select a LocalQueue node when navigated here via ?lq= param (e.g. from Workloads table).
  const lqParam = searchParams.get('lq') ?? '';
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (!lqParam || autoSelectedRef.current || localQueues.length === 0) return;
    const lq = localQueues.find(
      (l: LocalQueue) => l.metadata.name === lqParam && l.metadata.namespace === filterNamespace,
    );
    if (lq) {
      setSelectedNode({
        id: `lq:${lq.metadata.namespace}:${lq.metadata.name}`,
        kind: 'LocalQueue',
        name: lq.metadata.name,
        namespace: lq.metadata.namespace,
        data: lq,
      });
      autoSelectedRef.current = true;
    }
  }, [localQueues, lqParam, filterNamespace]);

  const loading = cqLoading || lqLoading || flLoading || nsLoading;
  const error = cqError ?? lqError ?? flError ?? nsError;

  const namespaceOptions = namespaces.map((ns) => ns.name).sort();

  return (
    <>
      <PageSection>
        <Title headingLevel="h1">Kueue Visualizer — Queue Infrastructure</Title>
      </PageSection>

      {error && (
        <PageSection>
          <Alert variant="danger" title="Failed to load Kueue resources" isInline>
            {error}
          </Alert>
        </PageSection>
      )}

      {loading ? (
        <PageSection>
          <Spinner aria-label="Loading queue resources" />
        </PageSection>
      ) : (
        <>
          <PageSection padding={{ default: 'noPadding' }}>
            <Toolbar>
              <ToolbarContent>
                <ToolbarItem>
                  <Select
                    isOpen={nsSelectOpen}
                    onOpenChange={(o) => { setNsSelectOpen(o); if (!o) setNsSearch(''); }}
                    onSelect={(_, v) => {
                      setFilterNamespace(v as string);
                      setNsSelectOpen(false);
                      setNsSearch('');
                    }}
                    toggle={(ref) => (
                      <MenuToggle ref={ref} onClick={() => setNsSelectOpen(!nsSelectOpen)}>
                        {filterNamespace || 'All namespaces'}
                      </MenuToggle>
                    )}
                  >
                    <div style={{ padding: '8px 12px' }}>
                      <SearchInput
                        placeholder="Filter namespaces…"
                        value={nsSearch}
                        onChange={(_, v) => setNsSearch(v)}
                        onClear={() => setNsSearch('')}
                      />
                    </div>
                    <Divider />
                    <SelectList>
                      <SelectOption value="">All namespaces</SelectOption>
                      {namespaceOptions
                        .filter((ns) => ns.toLowerCase().includes(nsSearch.toLowerCase()))
                        .map((ns) => (
                          <SelectOption key={ns} value={ns}>{ns}</SelectOption>
                        ))}
                    </SelectList>
                  </Select>
                </ToolbarItem>
              </ToolbarContent>
            </Toolbar>
          </PageSection>

          <PageSection>
            <Split hasGutter>
              <SplitItem isFilled>
                <TopologyGraph
                  clusterQueues={clusterQueues}
                  localQueues={localQueues}

                  filterNamespace={filterNamespace}
                  onNodeSelect={setSelectedNode}
                  selectedNodeId={selectedNode?.id ?? null}
                />
              </SplitItem>
              {selectedNode && (
                <SplitItem style={{ width: '380px', minWidth: '380px', maxHeight: '520px', overflowY: 'auto' }}>
                  <NodeDetailPanel
                    node={selectedNode}
                    clusterQueues={clusterQueues}
                    onClose={() => setSelectedNode(null)}
                  />
                </SplitItem>
              )}
            </Split>
          </PageSection>

          <PageSection>
            <Stack hasGutter>
              <StackItem>
                <Title headingLevel="h2">Kueue-Managed Namespaces</Title>
              </StackItem>
              <StackItem>
                <NamespacesPanel
                  namespaces={namespaces}
                  localQueues={localQueues}
                  clusterQueues={clusterQueues}
                />
              </StackItem>
            </Stack>
          </PageSection>

          <PageSection>
            <Stack hasGutter>
              <StackItem>
                <Title headingLevel="h2">Cohort Borrowing Ledger</Title>
              </StackItem>
              <StackItem>
                <CohortLedger clusterQueues={clusterQueues} />
              </StackItem>
            </Stack>
          </PageSection>
        </>
      )}
    </>
  );
};

export default QueueInfrastructurePage;
