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
import type { ClusterQueue } from '../../types/kueue';
import { buildCohortMap } from '../../hooks/useKueueResources';
import { parseQuantity } from '../../utils/quantity';

interface CohortLedgerProps {
  clusterQueues: ClusterQueue[];
}

interface LedgerRow {
  cohort: string;
  clusterQueue: string;
  resource: string;
  flavor: string;
  nominal: string;
  used: string;
  borrowed: string;
  lendingLimit: string;
}

const CohortLedger: React.FC<CohortLedgerProps> = ({ clusterQueues }) => {
  const cohortMap = buildCohortMap(clusterQueues);

  if (cohortMap.size === 0) {
    return (
      <EmptyState>
        <EmptyStateBody>No cohorts configured. ClusterQueues without a cohort cannot borrow or lend resources.</EmptyStateBody>
      </EmptyState>
    );
  }

  const rows: LedgerRow[] = [];

  for (const [cohortName, cqNames] of cohortMap) {
    for (const cqName of cqNames) {
      const cq = clusterQueues.find((c) => c.metadata.name === cqName);
      if (!cq) continue;

      for (const rg of cq.spec.resourceGroups) {
        for (const flavor of rg.flavors) {
          for (const res of flavor.resources) {
            const usageEntry = cq.status?.flavorUsage
              ?.find((fu) => fu.name === flavor.name)
              ?.resources.find((r) => r.name === res.name);

            rows.push({
              cohort: cohortName,
              clusterQueue: cqName,
              resource: res.name,
              flavor: flavor.name,
              nominal: res.nominalQuota,
              used: usageEntry?.total ?? '0',
              borrowed: usageEntry?.borrowed ?? '0',
              lendingLimit: res.lendingLimit ?? '∞',
            });
          }
        }
      }
    }
  }

  return (
    <Table aria-label="Cohort Borrowing Ledger" variant="compact">
      <Thead>
        <Tr>
          <Th>Cohort</Th>
          <Th>ClusterQueue</Th>
          <Th>Flavor</Th>
          <Th>Resource</Th>
          <Th>Nominal</Th>
          <Th>Used</Th>
          <Th>Borrowed</Th>
          <Th>Lending limit</Th>
          <Th>Status</Th>
        </Tr>
      </Thead>
      <Tbody>
        {rows.map((row, i) => {
          const borrowed = parseQuantity(row.borrowed);
          const isBorrowing = borrowed > 0;
          const used = parseQuantity(row.used);
          const nominal = parseQuantity(row.nominal);
          const isLending = used < nominal && cohortMap.get(row.cohort)!.length > 1;

          return (
            <Tr key={i}>
              <Td><Label color="purple" isCompact>{row.cohort}</Label></Td>
              <Td><Label color="blue" isCompact>{row.clusterQueue}</Label></Td>
              <Td><Label color="green" isCompact>{row.flavor}</Label></Td>
              <Td>{row.resource}</Td>
              <Td>{row.nominal}</Td>
              <Td>{row.used}</Td>
              <Td>
                {isBorrowing
                  ? <Label color="yellow" isCompact>{row.borrowed}</Label>
                  : <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>0</span>}
              </Td>
              <Td>{row.lendingLimit}</Td>
              <Td>
                {isBorrowing && <Label color="yellow" isCompact>Borrowing</Label>}
                {isLending && !isBorrowing && <Label color="blue" isCompact>Lending available</Label>}
                {!isBorrowing && !isLending && <Label color="grey" isCompact>Within nominal</Label>}
              </Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  );
};

export default CohortLedger;
