import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
} from '@patternfly/react-table';
import { Label, EmptyState, EmptyStateBody, Button } from '@patternfly/react-core';
import type { Workload, ClusterQueue, LocalQueue, WorkloadPhase } from '../../types/kueue';
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
  localQueues: LocalQueue[];
  topOwnerMap: Map<string, { kind: string; name: string }>;
  phaseFilter: WorkloadPhase | '';
  onSelect: (w: Workload) => void;
  selectedWorkload: Workload | null;
}

const WorkloadTable: React.FC<WorkloadTableProps> = ({
  workloads,
  clusterQueues,
  localQueues,
  topOwnerMap,
  phaseFilter,
  onSelect,
  selectedWorkload,
}) => {
  const navigate = useNavigate();
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
          <Th>Type</Th>
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
              <Td>
                {(() => {
                  const top = topOwnerMap.get(`${w.metadata.namespace}/${w.metadata.name}`);
                  const displayName = top?.name
                    ?? w.metadata.annotations?.['kueue.x-k8s.io/job-owner-name']
                    ?? w.metadata.ownerReferences?.find((r) => r.controller)?.name
                    ?? w.metadata.ownerReferences?.[0]?.name;
                  return displayName ? (
                    <>
                      {displayName}
                      <span style={{ color: '#6a6e73', fontSize: '0.78em', marginLeft: '0.4rem' }}>
                        ({w.metadata.name})
                      </span>
                    </>
                  ) : w.metadata.name;
                })()}
              </Td>
              <Td>
                {(() => {
                  const top = topOwnerMap.get(`${w.metadata.namespace}/${w.metadata.name}`);
                  if (top) return top.kind;
                  const gvk = w.metadata.annotations?.['kueue.x-k8s.io/job-owner-gvk'];
                  const kind = gvk?.match(/Kind=(\w+)/)?.[1]
                    ?? w.metadata.ownerReferences?.find((r) => r.controller)?.kind
                    ?? w.metadata.ownerReferences?.[0]?.kind;
                  return kind ?? <span style={{ color: '#6a6e73' }}>—</span>;
                })()}
              </Td>
              <Td>{w.metadata.namespace ?? '—'}</Td>
              <Td>
                {localQueues.some(
                  (lq) => lq.metadata.name === w.spec.queueName && lq.metadata.namespace === w.metadata.namespace,
                ) ? (
                  <Button
                    variant="link"
                    isInline
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(
                        `/kueue/infrastructure?ns=${encodeURIComponent(w.metadata.namespace ?? '')}&lq=${encodeURIComponent(w.spec.queueName)}`,
                      );
                    }}
                  >
                    {w.spec.queueName}
                  </Button>
                ) : (
                  <span
                    title={`LocalQueue "${w.spec.queueName}" does not exist in namespace "${w.metadata.namespace}"`}
                    style={{ color: '#EC7A08', cursor: 'help' }}
                  >
                    {w.spec.queueName} ⚠
                  </span>
                )}
              </Td>
              <Td>
                {(() => {
                  const admittedCQ = w.status?.admission?.clusterQueue;
                  if (admittedCQ) return <Label color="red" isCompact>{admittedCQ}</Label>;
                  const lq = localQueues.find(
                    (l) => l.metadata.name === w.spec.queueName && l.metadata.namespace === w.metadata.namespace,
                  );
                  const inferredCQ = lq?.spec.clusterQueue;
                  return inferredCQ
                    ? <><Label color="red" isCompact variant="outline">{inferredCQ}</Label></>
                    : <span style={{ color: '#6a6e73' }}>—</span>;
                })()}
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
