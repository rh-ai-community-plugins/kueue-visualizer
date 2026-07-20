import React, { useState } from 'react';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
} from '@patternfly/react-table';
import {
  Label,
  LabelGroup,
  EmptyState,
  EmptyStateBody,
} from '@patternfly/react-core';
import type { KueueNamespace, LocalQueue, ClusterQueue } from '../../types/kueue';

interface NamespacesPanelProps {
  namespaces: KueueNamespace[];
  localQueues: LocalQueue[];
  clusterQueues: ClusterQueue[];
}


const NamespacesPanel: React.FC<NamespacesPanelProps> = ({ namespaces, localQueues, clusterQueues }) => {
  const [expandedNs, setExpandedNs] = useState<string | null>(null);

  if (namespaces.length === 0) {
    return (
      <EmptyState>
        <EmptyStateBody>
          No kueue-managed namespaces found. Namespaces appear here once they have a LocalQueue configured.
        </EmptyStateBody>
      </EmptyState>
    );
  }

  return (
    <Table aria-label="Kueue-managed namespaces" variant="compact">
      <Thead>
        <Tr>
          <Th />
          <Th>Namespace</Th>
          <Th>Local queues</Th>
          <Th>ClusterQueues (via local queues)</Th>
          <Th>Admitted / Pending workloads</Th>
        </Tr>
      </Thead>
      <Tbody>
        {namespaces.map((ns) => {
          const nsLocalQueues = localQueues.filter((lq) => lq.metadata.namespace === ns.name);
          const clusterQueueNames = [...new Set(nsLocalQueues.map((lq) => lq.spec.clusterQueue))];
          const nsClusterQueues = clusterQueues.filter((cq) => clusterQueueNames.includes(cq.metadata.name));
          const admitted = nsLocalQueues.reduce((sum, lq) => sum + (lq.status?.admittedWorkloads ?? 0), 0);
          const pending = nsLocalQueues.reduce((sum, lq) => sum + (lq.status?.pendingWorkloads ?? 0), 0);
          const isExpanded = expandedNs === ns.name;

          return (
            <React.Fragment key={ns.name}>
              <Tr>
                <Td
                  expand={{
                    rowIndex: namespaces.indexOf(ns),
                    isExpanded,
                    onToggle: () => setExpandedNs(isExpanded ? null : ns.name),
                    expandId: `expand-${ns.name}`,
                  }}
                />
                <Td>
                  <strong>{ns.name}</strong>
                </Td>
                <Td>
                  {nsLocalQueues.length === 0 ? (
                    <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>None</span>
                  ) : (
                    <LabelGroup>
                      {nsLocalQueues.map((lq) => (
                        <Label key={lq.metadata.name} color="cyan" isCompact>
                          {lq.metadata.name}
                        </Label>
                      ))}
                    </LabelGroup>
                  )}
                </Td>
                <Td>
                  {nsClusterQueues.length === 0 ? (
                    <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>—</span>
                  ) : (
                    <LabelGroup>
                      {nsClusterQueues.map((cq) => (
                        <Label key={cq.metadata.name} color="blue" isCompact>
                          {cq.metadata.name}
                          {cq.spec.cohort && (
                            <span style={{ marginLeft: '0.3rem', opacity: 0.7 }}>
                              ({cq.spec.cohort})
                            </span>
                          )}
                        </Label>
                      ))}
                    </LabelGroup>
                  )}
                </Td>
                <Td>
                  {admitted > 0 && (
                    <Label color="green" isCompact style={{ marginRight: '0.25rem' }}>
                      {admitted} admitted
                    </Label>
                  )}
                  {pending > 0 && (
                    <Label color="orange" isCompact>{pending} pending</Label>
                  )}
                  {admitted === 0 && pending === 0 && (
                    <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>0</span>
                  )}
                </Td>
              </Tr>

              {isExpanded && (
                <Tr isExpanded>
                  <Td colSpan={5}>
                    <Table aria-label={`${ns.name} local queue detail`} variant="compact">
                      <Thead>
                        <Tr>
                          <Th>Local queue</Th>
                          <Th>ClusterQueue</Th>
                          <Th>Cohort</Th>
                          <Th>Admitted</Th>
                          <Th>Pending</Th>
                          <Th>Stop policy</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {nsLocalQueues.length === 0 ? (
                          <Tr>
                            <Td colSpan={5} style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>
                              No LocalQueues in this namespace
                            </Td>
                          </Tr>
                        ) : (
                          nsLocalQueues.map((lq) => {
                            const cq = clusterQueues.find((c) => c.metadata.name === lq.spec.clusterQueue);
                            return (
                              <Tr key={lq.metadata.name}>
                                <Td><Label color="cyan" isCompact>{lq.metadata.name}</Label></Td>
                                <Td><Label color="blue" isCompact>{lq.spec.clusterQueue}</Label></Td>
                                <Td>
                                  {cq?.spec.cohort
                                    ? <Label color="purple" isCompact>{cq.spec.cohort}</Label>
                                    : <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>—</span>}
                                </Td>
                                <Td>{lq.status?.admittedWorkloads ?? 0}</Td>
                                <Td>{lq.status?.pendingWorkloads ?? 0}</Td>
                                <Td>{lq.spec.stopPolicy ?? 'None'}</Td>
                              </Tr>
                            );
                          })
                        )}
                      </Tbody>
                    </Table>
                  </Td>
                </Tr>
              )}
            </React.Fragment>
          );
        })}
      </Tbody>
    </Table>
  );
};

export default NamespacesPanel;
