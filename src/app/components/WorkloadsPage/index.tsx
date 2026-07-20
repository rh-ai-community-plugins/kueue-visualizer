import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  PageSection,
  Title,
  Spinner,
  Alert,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  SearchInput,
  Select,
  SelectOption,
  SelectList,
  MenuToggle,
  Drawer,
  DrawerContent,
  DrawerContentBody,
  Button,
} from '@patternfly/react-core';
import {
  useWorkloads,
  useClusterQueues,
  useLocalQueues,
  useWorkloadTopOwner,
} from '../../hooks/useKueueResources';
import { useLastSelectedProject } from '../../hooks/useLastSelectedProject';
import { ProjectSelector } from '../ProjectSelector';
import WorkloadTable from './WorkloadTable';
import WorkloadDrawer from './WorkloadDrawer';
import type { Workload, WorkloadPhase } from '../../types/kueue';

const PHASE_OPTIONS: WorkloadPhase[] = ['Pending', 'Admitted', 'Running', 'Finished', 'Failed'];

const WorkloadsPage: React.FC = () => {
  const [searchParams] = useSearchParams();

  const { workloads, loading, error } = useWorkloads();
  const { clusterQueues } = useClusterQueues();
  const { localQueues } = useLocalQueues();
  const topOwnerMap = useWorkloadTopOwner(workloads);

  // Shared project selection — persisted via localStorage key 'rhoai.last-selected-project'
  // so the selected project is remembered when navigating back from the Infrastructure page.
  const [selectedProject, setSelectedProject] = useLastSelectedProject();
  const nsFilter = selectedProject ?? '';

  const [selectedWorkload, setSelectedWorkload] = useState<Workload | null>(null);
  const [searchText, setSearchText] = useState(() => searchParams.get('queue') ?? '');
  const [cqFilter, setCqFilter] = useState(() => searchParams.get('cq') ?? '');
  const [phaseFilter, setPhaseFilter] = useState<WorkloadPhase | ''>('');
  const [phaseOpen, setPhaseOpen] = useState(false);

  // Sync inbound ?ns= URL param to shared project selection (e.g. from Infrastructure page links).
  useEffect(() => {
    const nsParam = searchParams.get('ns');
    if (nsParam && nsParam !== selectedProject) {
      setSelectedProject(nsParam);
    }
  }, []); // eslint-disable-line -- intentional: only run on mount to sync ?ns= URL param

  const filtered = workloads.filter((w) => {
    if (nsFilter && w.metadata.namespace !== nsFilter) return false;
    if (cqFilter) {
      const admittedCQ = w.status?.admission?.clusterQueue;
      if (admittedCQ !== cqFilter) {
        const lq = localQueues.find(
          (l) => l.metadata.name === w.spec.queueName && l.metadata.namespace === w.metadata.namespace,
        );
        if (lq?.spec.clusterQueue !== cqFilter) return false;
      }
    }
    if (
      searchText &&
      !w.metadata.name.includes(searchText) &&
      !(w.metadata.namespace ?? '').includes(searchText) &&
      !w.spec.queueName.includes(searchText)
    ) {
      return false;
    }
    return true;
  });

  const panelContent = selectedWorkload ? (
    <WorkloadDrawer
      workload={selectedWorkload}
      allWorkloads={workloads}
      clusterQueues={clusterQueues}
      localQueues={localQueues}
      topOwner={topOwnerMap.get(`${selectedWorkload.metadata.namespace}/${selectedWorkload.metadata.name}`)}
      onClose={() => setSelectedWorkload(null)}
    />
  ) : undefined;

  return (
    <>
      <PageSection>
        <Title headingLevel="h1">Workloads</Title>
      </PageSection>

      {error && (
        <PageSection>
          <Alert variant="danger" title="Failed to load workloads" isInline>{error}</Alert>
        </PageSection>
      )}

      <PageSection>
        <Toolbar>
          <ToolbarContent>
            <ToolbarItem>
              <ProjectSelector
                selectedProject={selectedProject}
                onSelect={setSelectedProject}
              />
            </ToolbarItem>
            <ToolbarItem>
              <SearchInput
                placeholder="Search by name, namespace, or queue"
                value={searchText}
                onChange={(_, v) => setSearchText(v)}
                onClear={() => setSearchText('')}
              />
            </ToolbarItem>
            {cqFilter && (
              <ToolbarItem>
                <span style={{ fontSize: '0.85em' }}>
                  ClusterQueue: <strong>{cqFilter}</strong>{' '}
                  <Button variant="link" isInline onClick={() => setCqFilter('')}>✕</Button>
                </span>
              </ToolbarItem>
            )}
            <ToolbarItem>
              <Select
                isOpen={phaseOpen}
                onOpenChange={setPhaseOpen}
                onSelect={(_, v) => { setPhaseFilter(v as WorkloadPhase | ''); setPhaseOpen(false); }}
                toggle={(ref) => (
                  <MenuToggle ref={ref} onClick={() => setPhaseOpen(!phaseOpen)}>
                    {phaseFilter || 'All phases'}
                  </MenuToggle>
                )}
              >
                <SelectList>
                  <SelectOption value="">All phases</SelectOption>
                  {PHASE_OPTIONS.map((p) => (
                    <SelectOption key={p} value={p}>{p}</SelectOption>
                  ))}
                </SelectList>
              </Select>
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>
      </PageSection>

      <PageSection padding={{ default: 'noPadding' }}>
        <Drawer isExpanded={!!selectedWorkload} position="right">
          <DrawerContent panelContent={panelContent}>
            <DrawerContentBody style={{ padding: '1rem' }}>
              {loading ? (
                <Spinner aria-label="Loading workloads" />
              ) : (
                <WorkloadTable
                  workloads={filtered}
                  clusterQueues={clusterQueues}
                  localQueues={localQueues}
                  topOwnerMap={topOwnerMap}
                  phaseFilter={phaseFilter}
                  onSelect={setSelectedWorkload}
                  selectedWorkload={selectedWorkload}
                />
              )}
            </DrawerContentBody>
          </DrawerContent>
        </Drawer>
      </PageSection>
    </>
  );
};

export default WorkloadsPage;
