import React, { useState } from 'react';
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
} from '@patternfly/react-core';
import { useWorkloads, useClusterQueues } from '../../hooks/useKueueResources';
import WorkloadTable from './WorkloadTable';
import WorkloadDrawer from './WorkloadDrawer';
import type { Workload, WorkloadPhase } from '../../types/kueue';

const PHASE_OPTIONS: WorkloadPhase[] = ['Pending', 'Admitted', 'Running', 'Finished', 'Failed'];

const WorkloadsPage: React.FC = () => {
  const { workloads, loading, error } = useWorkloads();
  const { clusterQueues } = useClusterQueues();
  const [selectedWorkload, setSelectedWorkload] = useState<Workload | null>(null);
  const [searchText, setSearchText] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<WorkloadPhase | ''>('');
  const [phaseOpen, setPhaseOpen] = useState(false);

  const filtered = workloads.filter((w) =>
    !searchText ||
    w.metadata.name.includes(searchText) ||
    (w.metadata.namespace ?? '').includes(searchText) ||
    w.spec.queueName.includes(searchText)
  );

  const panelContent = selectedWorkload ? (
    <WorkloadDrawer
      workload={selectedWorkload}
      allWorkloads={workloads}
      clusterQueues={clusterQueues}
      onClose={() => setSelectedWorkload(null)}
    />
  ) : undefined;

  return (
    <>
      <PageSection>
        <Title headingLevel="h1">Kueue Visualizer — Workloads</Title>
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
              <SearchInput
                placeholder="Search by name, namespace, or queue"
                value={searchText}
                onChange={(_, v) => setSearchText(v)}
                onClear={() => setSearchText('')}
              />
            </ToolbarItem>
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
