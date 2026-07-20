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
  SearchInput,
  Divider,
} from '@patternfly/react-core';
import {
  useClusterQueues,
  useLocalQueues,
  useInterval,
} from '../../hooks/useKueueResources';
import { useLastSelectedProject } from '../../hooks/useLastSelectedProject';
import { useProjects } from '../../hooks/useProjects';
import { ProjectSelector } from '../ProjectSelector';
import TopologyGraph from './TopologyGraph';
import NodeDetailPanel from './NodeDetailPanel';
import CohortLedger from './CohortLedger';
import NamespacesPanel from './NamespacesPanel';
import type { QueueTopologyNode, LocalQueue, ClusterQueue } from '../../types/kueue';

const REFRESH_INTERVAL_MS = 30_000;

const QueueInfrastructurePage: React.FC = () => {
  const [searchParams] = useSearchParams();

  const { clusterQueues, loading: cqLoading, error: cqError, refresh: refreshCQ } = useClusterQueues();
  const { localQueues, loading: lqLoading, error: lqError, refresh: refreshLQ } = useLocalQueues();

  // Shared project selection — persisted to localStorage key 'rhoai.last-selected-project'
  // so selection is remembered when navigating between Infrastructure and Workloads pages.
  const [selectedProject, setSelectedProject] = useLastSelectedProject();
  const filterNamespace = selectedProject ?? '';

  // Limit "All projects" view to the namespaces the user actually has access to.
  // kueue-batch-user-role is cluster-scoped, so cluster-wide API calls would otherwise
  // return data from every namespace on the cluster.
  const { projects } = useProjects();
  const userNamespaces = new Set(projects.map((p) => p.metadata.name));
  const visibleLocalQueues = filterNamespace
    ? localQueues
    : localQueues.filter((lq) => userNamespaces.has(lq.metadata.namespace ?? ''));

  // Derive kueue-managed namespaces from local queues — any namespace with a local queue
  // is effectively kueue-managed. Always scoped to the user's own projects regardless of
  // the project dropdown (which only affects the topology graph).
  const userLocalQueues = localQueues.filter((lq) => userNamespaces.has(lq.metadata.namespace ?? ''));
  const namespaces = Array.from(
    new Set(userLocalQueues.map((lq) => lq.metadata.namespace).filter(Boolean) as string[])
  ).map((name) => ({ name, labels: {} }));

  const [selectedNode, setSelectedNode] = useState<QueueTopologyNode | null>(null);
  const [filterCQ, setFilterCQ] = useState('');
  const [cqSelectOpen, setCqSelectOpen] = useState(false);
  const [cqSearch, setCqSearch] = useState('');

  // Sync inbound ?ns= URL param to shared project selection (e.g. navigating from Workloads table).
  useEffect(() => {
    const nsParam = searchParams.get('ns');
    if (nsParam && nsParam !== selectedProject) {
      setSelectedProject(nsParam);
    }
  }, []); // eslint-disable-line -- intentional: only run on mount to sync ?ns= URL param

  // Auto-refresh every 30 seconds without a full page reload
  useInterval(() => {
    refreshCQ();
    refreshLQ();
  }, REFRESH_INTERVAL_MS);

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

  const loading = cqLoading || lqLoading;
  const accessDenied = (cqError ?? lqError)?.startsWith('403');
  const error = accessDenied ? null : (cqError ?? lqError);

  // Only show spinner on initial load — background refreshes happen silently
  // so the topology graph zoom/pan state is preserved.
  const hasData = clusterQueues.length > 0 || visibleLocalQueues.length > 0;
  const isInitialLoad = loading && !hasData;

  const cqOptions = clusterQueues.map((cq) => cq.metadata.name).sort();

  return (
    <>
      {accessDenied && (
        <PageSection>
          <Alert variant="info" title="Kueue access required" isInline>
            Your account does not have permission to read Kueue resources. Ask a cluster admin to
            grant you the <strong>kueue-batch-user-role</strong> ClusterRole.
            In a future RHOAI release this will be granted automatically when distributed workloads
            access is enabled for your account.
          </Alert>
        </PageSection>
      )}
      {error && (
        <PageSection>
          <Alert variant="danger" title="Failed to load Kueue resources" isInline>
            {error}
          </Alert>
        </PageSection>
      )}

      {isInitialLoad ? (
        <PageSection>
          <Spinner aria-label="Loading queue resources" />
        </PageSection>
      ) : (
        <>
          <PageSection>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <Title headingLevel="h1" style={{ margin: 0, whiteSpace: 'nowrap' }}>
                Queue Infrastructure
              </Title>

              {/* Project filter — hello-world ProjectSelector with localStorage persistence */}
              <ProjectSelector
                selectedProject={selectedProject}
                onSelect={setSelectedProject}
              />

              {/* ClusterQueue filter */}
              <Select
                isOpen={cqSelectOpen}
                onOpenChange={(o) => { setCqSelectOpen(o); if (!o) setCqSearch(''); }}
                onSelect={(_, v) => {
                  setFilterCQ(v as string);
                  setCqSelectOpen(false);
                  setCqSearch('');
                }}
                toggle={(ref) => (
                  <MenuToggle ref={ref} onClick={() => setCqSelectOpen(!cqSelectOpen)}>
                    {filterCQ || 'All cluster queues'}
                  </MenuToggle>
                )}
              >
                <div style={{ padding: '8px 12px' }}>
                  <SearchInput
                    placeholder="Filter cluster queues…"
                    value={cqSearch}
                    onChange={(_, v) => setCqSearch(v)}
                    onClear={() => setCqSearch('')}
                  />
                </div>
                <Divider />
                <SelectList>
                  <SelectOption value="">All cluster queues</SelectOption>
                  {cqOptions
                    .filter((cq) => cq.toLowerCase().includes(cqSearch.toLowerCase()))
                    .map((cq) => (
                      <SelectOption key={cq} value={cq}>{cq}</SelectOption>
                    ))}
                </SelectList>
              </Select>
            </div>

            <Split hasGutter>
              <SplitItem isFilled>
                <TopologyGraph
                  clusterQueues={clusterQueues}
                  localQueues={visibleLocalQueues}
                  filterNamespace={filterNamespace}
                  filterCQ={filterCQ}
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
                    onSelectCQ={(cqName) => {
                      const cq = clusterQueues.find((q) => q.metadata.name === cqName);
                      if (cq) {
                        setSelectedNode({
                          id: `cq:${cqName}`,
                          kind: 'ClusterQueue',
                          name: cqName,
                          data: cq as ClusterQueue,
                        });
                      }
                    }}
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
                  localQueues={userLocalQueues}
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
