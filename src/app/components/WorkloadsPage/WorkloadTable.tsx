import React from 'react';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
} from '@patternfly/react-table';
import { Label, EmptyState, EmptyStateBody } from '@patternfly/react-core';
import type { Workload, ClusterQueue, WorkloadPhase } from '../../types/kueue';
import { getWorkloadPhase, computeWorkloadQueueInfo } from '../../hooks/useKueueResources';

const PHASE_COLORS: Record<WorkloadPhase, 'grey' | 'blue' | 'green' | 'red' | 'orange'> = {
  Pending: 'orange',
  Admitted: 'blue',
  Running: 'green',
  Finished: 'grey',
  Failed: 'red',
};

interface WorkloadTableProps {
  workloads: Workload[];
  clusterQueues: ClusterQueue[];
  phaseFilter: WorkloadPhase | '';
  onSelect: (w: Workload) => void;
  selectedWorkload: Workload | null;
}

const WorkloadTable: React.FC<WorkloadTableProps> = ({
  workloads,
  clusterQueues,
  phaseFilter,
  onSelect,
  selectedWorkload,
}) => {
  const rows = workloads
    .map((w) => ({ w, info: computeWorkloadQueueInfo(w, workloads, clusterQueues) }))
    .filter(({ info }) => !phaseFilter || info.phase === phaseFilter)
    .sort((a, b) => {
      // Sort: Pending first by queue position, then by creation time
      if (a.info.phase === 'Pending' && b.info.phase !== 'Pending') return -1;
      if (b.info.phase === 'Pending' && a.info.phase !== 'Pending') return 1;
      if (a.info.queuePosition !== null && b.info.queuePosition !== null) {
        return a.info.queuePosition - b.info.queuePosition;
      }
      return new Date(b.w.metadata.creationTimestamp).getTime()
        - new Date(a.w.metadata.creationTimestamp).getTime();
    });

  if (rows.length === 0) {
    return (
      <EmptyState>
        <EmptyStateBody>No workloads found matching the current filters.</EmptyStateBody>
      </EmptyState>
    );
  }

  return (
    <Table aria-label="Workloads" variant="compact">
      <Thead>
        <Tr>
          <Th>Name</Th>
          <Th>Namespace</Th>
          <Th>Local Queue</Th>
          <Th>ClusterQueue</Th>
          <Th>Phase</Th>
          <Th>Queue position</Th>
          <Th>Borrowing</Th>
          <Th>Priority</Th>
          <Th>Created</Th>
        </Tr>
      </Thead>
      <Tbody>
        {rows.map(({ w, info }) => {
          const isSelected = selectedWorkload?.metadata.name === w.metadata.name
            && selectedWorkload?.metadata.namespace === w.metadata.namespace;

          return (
            <Tr
              key={`${w.metadata.namespace}/${w.metadata.name}`}
              selected={isSelected}
              onRowClick={() => onSelect(w)}
              style={{ cursor: 'pointer' }}
            >
              <Td>{w.metadata.name}</Td>
              <Td>{w.metadata.namespace ?? '—'}</Td>
              <Td>{w.spec.queueName}</Td>
              <Td>
                {w.status?.admission?.clusterQueue
                  ? <Label color="red" isCompact>{w.status.admission.clusterQueue}</Label>
                  : <span style={{ color: '#6a6e73' }}>—</span>}
              </Td>
              <Td>
                <Label color={PHASE_COLORS[info.phase]} isCompact>{info.phase}</Label>
              </Td>
              <Td>
                {info.queuePosition !== null
                  ? `#${info.queuePosition} (${info.workloadsAhead} ahead)`
                  : '—'}
              </Td>
              <Td>
                {info.isBorrowing
                  ? <Label color="orange" isCompact>Yes{info.borrowingFrom ? ` from ${info.borrowingFrom}` : ''}</Label>
                  : <span style={{ color: '#6a6e73' }}>No</span>}
              </Td>
              <Td>{w.spec.priority ?? w.spec.priorityClassName ?? '—'}</Td>
              <Td>{new Date(w.metadata.creationTimestamp).toLocaleString()}</Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  );
};

export default WorkloadTable;
