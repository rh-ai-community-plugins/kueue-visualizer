import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  Button,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  Label,
  Progress,
  ProgressSize,
  Tabs,
  Tab,
  TabTitleText,
  Stack,
  StackItem,
  Title,
  Divider,
  Tooltip,
} from '@patternfly/react-core';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';
import { OutlinedQuestionCircleIcon } from '@patternfly/react-icons';
import type { ClusterQueue, LocalQueue, QueueTopologyNode } from '../../types/kueue';
import { parseQuantity } from '../../utils/quantity';

interface NodeDetailPanelProps {
  node: QueueTopologyNode;
  clusterQueues: ClusterQueue[];
  onClose: () => void;
  onSelectCQ?: (cqName: string) => void;
}

const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({ node, clusterQueues, onClose, onSelectCQ }) => {
  const [activeTab, setActiveTab] = React.useState(0);

  return (
    <Card>
      <CardHeader
        actions={{ actions: <Button variant="plain" onClick={onClose} aria-label="Close">✕</Button> }}
      >
        <CardTitle>
          <Stack>
            <StackItem>
              <Label color={kindColor(node.kind)} isCompact>{node.kind}</Label>
            </StackItem>
            <StackItem>
              <Title headingLevel="h3">{node.name}</Title>
              {node.namespace && (
                <span style={{ color: 'var(--pf-t--global--text--color--subtle)', fontSize: '0.85em' }}>project: {node.namespace}</span>
              )}
            </StackItem>
          </Stack>
        </CardTitle>
      </CardHeader>

      <CardBody>
        {node.kind === 'ClusterQueue' && (
          <ClusterQueueDetail cq={node.data as ClusterQueue} clusterQueues={clusterQueues} activeTab={activeTab} setActiveTab={setActiveTab} />
        )}
        {node.kind === 'LocalQueue' && (
          <LocalQueueDetail lq={node.data as LocalQueue} clusterQueues={clusterQueues} />
        )}
        {node.kind === 'ResourceFlavor' && (
          <FlavorDetail flavorName={node.name} clusterQueues={clusterQueues} />
        )}
        {node.kind === 'Cohort' && (
          <CohortDetail cohortName={node.name} clusterQueues={clusterQueues} onSelectCQ={onSelectCQ} />
        )}
      </CardBody>
    </Card>
  );
};

// --- ClusterQueue detail ---

const ClusterQueueDetail: React.FC<{
  cq: ClusterQueue;
  clusterQueues: ClusterQueue[];
  activeTab: number;
  setActiveTab: (t: number) => void;
}> = ({ cq, clusterQueues, activeTab, setActiveTab }) => {
  const navigate = useNavigate();
  return (
  <Stack hasGutter>
    <StackItem>
      <Button
        variant="secondary"
        onClick={() => navigate(`/kueue/workloads?cq=${encodeURIComponent(cq.metadata.name)}`)}
      >
        View workloads →
      </Button>
    </StackItem>
    <StackItem>
  <Tabs activeKey={activeTab} onSelect={(_, k) => setActiveTab(Number(k))}>
    <Tab eventKey={0} title={<TabTitleText>Capacity</TabTitleText>}>
      <Stack hasGutter style={{ paddingTop: 'var(--pf-t--global--spacer--sm)' }}>
        {/* Workload counts — prominent, scannable */}
        <StackItem>
          <div style={{ display: 'flex', gap: 'var(--pf-t--global--spacer--lg)', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.72em', color: 'var(--pf-t--global--text--color--subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Admitted</div>
              <div style={{ fontSize: '1.5em', fontWeight: 700, lineHeight: 1.2 }}>{cq.status?.admittedWorkloads ?? 0}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.72em', color: 'var(--pf-t--global--text--color--subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending</div>
              <div style={{ fontSize: '1.5em', fontWeight: 700, lineHeight: 1.2, color: (cq.status?.pendingWorkloads ?? 0) > 0 ? 'var(--pf-t--global--color--status--warning--default)' : 'inherit' }}>
                {cq.status?.pendingWorkloads ?? 0}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.72em', color: 'var(--pf-t--global--text--color--subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Strategy</div>
              <div style={{ fontSize: '0.82em', marginTop: 'var(--pf-t--global--spacer--xs)' }}>{cq.spec.queueingStrategy ?? 'BestEffortFIFO'}</div>
            </div>
          </div>
        </StackItem>
        {/* Resource quota utilization */}
        {(cq.status?.flavorsReservation ?? []).length > 0 ? (
          <>
            <StackItem><Divider /></StackItem>
            {(cq.status?.flavorsReservation ?? []).map((fu) => (
              <StackItem key={fu.name}>
                <div style={{ fontSize: '0.78em', color: 'var(--pf-t--global--text--color--subtle)', marginBottom: 'var(--pf-t--global--spacer--xs)' }}>
                  Flavor: <strong style={{ color: 'var(--pf-t--global--text--color--regular)' }}>{fu.name}</strong>
                </div>
                {fu.resources.map((r) => (
                  <UsageBar key={r.name} label={r.name} used={r.total} borrowed={r.borrowed} cq={cq} flavorName={fu.name} clusterQueues={clusterQueues} />
                ))}
              </StackItem>
            ))}
          </>
        ) : (
          <StackItem>
            <span style={{ fontSize: '0.85em', color: 'var(--pf-t--global--text--color--subtle)' }}>No active resource reservations.</span>
          </StackItem>
        )}
      </Stack>
    </Tab>

    <Tab eventKey={1} title={<TabTitleText>Preemption</TabTitleText>}>
      <Stack hasGutter style={{ paddingTop: 'var(--pf-t--global--spacer--md)' }}>
        {cq.spec.preemption ? (
          <DescriptionList isCompact>
            <DescriptionListGroup>
              <DescriptionListTerm>
                Within ClusterQueue
                <HelpTip content="Can this queue preempt its own lower-priority workloads to admit new ones? 'Never' = no preemption within this queue." />
              </DescriptionListTerm>
              <DescriptionListDescription>
                <PreemptionLabel policy={cq.spec.preemption.withinClusterQueue} />
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>
                Reclaim within cohort
                <HelpTip content="Can this queue preempt workloads in sibling ClusterQueues to reclaim quota it lent out? 'Never' = once lent, can't force it back. 'LowerPriority' = reclaim by preempting lower-priority jobs. 'Any' = reclaim regardless of priority." />
              </DescriptionListTerm>
              <DescriptionListDescription>
                <PreemptionLabel policy={cq.spec.preemption.reclaimWithinCohort} />
              </DescriptionListDescription>
            </DescriptionListGroup>
            {cq.spec.preemption.borrowWithinCohort && (
              <DescriptionListGroup>
                <DescriptionListTerm>
                  Borrow within cohort
                  <HelpTip content="Can this queue preempt lower-priority workloads in sibling ClusterQueues in order to borrow their quota? 'Never' = only passively borrow unused quota, no preemption. 'LowerPriority' = may preempt lower-priority jobs in siblings to borrow." />
                </DescriptionListTerm>
                <DescriptionListDescription>
                  <PreemptionLabel policy={cq.spec.preemption.borrowWithinCohort.policy} />
                  {cq.spec.preemption.borrowWithinCohort.maxPriorityThreshold !== undefined && (
                    <span style={{ fontSize: '0.85em', color: 'var(--pf-t--global--text--color--subtle)', marginLeft: 'var(--pf-t--global--spacer--xs)' }}>
                      (only preempts workloads with priority ≤ {cq.spec.preemption.borrowWithinCohort.maxPriorityThreshold})
                    </span>
                  )}
                </DescriptionListDescription>
              </DescriptionListGroup>
            )}
          </DescriptionList>
        ) : (
          <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>No preemption configured (Never)</span>
        )}
      </Stack>
    </Tab>

    <Tab eventKey={2} title={<TabTitleText>Flavors</TabTitleText>}>
      <Stack hasGutter style={{ paddingTop: 'var(--pf-t--global--spacer--md)' }}>
        {cq.spec.resourceGroups.map((rg, i) => (
          <StackItem key={i}>
            {rg.flavors.map((fl) => (
              <div key={fl.name} style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--pf-t--global--spacer--sm)', marginBottom: 'var(--pf-t--global--spacer--xs)' }}>
                  <Label color="green" isCompact>{fl.name}</Label>
                  <span style={{ fontSize: '0.75em', color: 'var(--pf-t--global--text--color--subtle)' }}>
                    covers: {rg.coveredResources.join(', ')}
                  </span>
                </div>
                <Table aria-label={`${fl.name} quotas`} variant="compact" borders>
                  <Thead>
                    <Tr>
                      <Th>Resource</Th>
                      <Th>
                        Nominal
                        <HelpTip content="This queue's guaranteed quota. Workloads up to this amount are always admissible (if not used by others)." />
                      </Th>
                      <Th>
                        Borrow max
                        <HelpTip content="How much extra this queue can take from the cohort pool on top of its nominal quota (if the pool has spare capacity)." />
                      </Th>
                      <Th>
                        Lend max
                        <HelpTip content="How much of its spare nominal quota this queue contributes to the cohort pool for others to borrow." />
                      </Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {fl.resources.map((res) => (
                      <Tr key={res.name}>
                        <Td>{res.name}</Td>
                        <Td>{res.nominalQuota}</Td>
                        <Td style={{ color: res.borrowingLimit ? 'var(--pf-t--global--color--status--warning--default)' : 'var(--pf-t--global--text--color--subtle)' }}>
                          {res.borrowingLimit ? `+${res.borrowingLimit}` : '—'}
                        </Td>
                        <Td style={{ color: res.lendingLimit === '0' ? 'var(--pf-t--global--text--color--subtle)' : res.lendingLimit ? 'var(--pf-t--global--color--status--success--default)' : 'var(--pf-t--global--text--color--subtle)' }}>
                          {res.lendingLimit === '0' ? 'none' : res.lendingLimit ? res.lendingLimit : '—'}
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </div>
            ))}
          </StackItem>
        ))}
      </Stack>
    </Tab>
  </Tabs>
    </StackItem>
  </Stack>
  );
};

// --- LocalQueue detail ---

const LocalQueueDetail: React.FC<{ lq: LocalQueue; clusterQueues: ClusterQueue[] }> = ({ lq, clusterQueues }) => {
  const navigate = useNavigate();
  const cq = clusterQueues.find((c) => c.metadata.name === lq.spec.clusterQueue);
  return (
    <Stack hasGutter>
      <StackItem>
        <Button
          variant="secondary"
          onClick={() =>
            navigate(
              `/kueue/workloads?ns=${encodeURIComponent(lq.metadata.namespace ?? '')}&queue=${encodeURIComponent(lq.metadata.name)}`,
            )
          }
        >
          View workloads →
        </Button>
      </StackItem>
      <StackItem>
        <DescriptionList isCompact>
          <DescriptionListGroup>
            <DescriptionListTerm>Bound to ClusterQueue</DescriptionListTerm>
            <DescriptionListDescription>
              <Label color="blue" isCompact>{lq.spec.clusterQueue}</Label>
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>Cohort</DescriptionListTerm>
            <DescriptionListDescription>
              {cq?.spec.cohort ? <Label color="purple" isCompact>{cq.spec.cohort}</Label> : '—'}
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>Admitted workloads</DescriptionListTerm>
            <DescriptionListDescription>{lq.status?.admittedWorkloads ?? 0}</DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>Pending workloads</DescriptionListTerm>
            <DescriptionListDescription>{lq.status?.pendingWorkloads ?? 0}</DescriptionListDescription>
          </DescriptionListGroup>
        </DescriptionList>
      </StackItem>
    </Stack>
  );
};

// --- ResourceFlavor detail ---

const FlavorDetail: React.FC<{ flavorName: string; clusterQueues: ClusterQueue[] }> = ({ flavorName, clusterQueues }) => {
  const queuesWithFlavor = clusterQueues.filter((cq) =>
    cq.spec.resourceGroups.some((rg) => rg.flavors.some((fl) => fl.name === flavorName)),
  );
  return (
    <Stack hasGutter>
      <StackItem>
        <strong>Available in ClusterQueues:</strong>
      </StackItem>
      {queuesWithFlavor.length === 0 && <StackItem><span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>None</span></StackItem>}
      {queuesWithFlavor.map((cq) => {
        const quotas = cq.spec.resourceGroups
          .flatMap((rg) => rg.flavors.filter((fl) => fl.name === flavorName))
          .flatMap((fl) => fl.resources);
        return (
          <StackItem key={cq.metadata.name}>
            <Label color="blue" isCompact>{cq.metadata.name}</Label>
            {quotas.map((res) => (
              <div key={res.name} style={{ fontSize: '0.85em', paddingLeft: 'var(--pf-t--global--spacer--md)' }}>
                {res.name}: {res.nominalQuota}
                {res.borrowingLimit && ` (borrow≤${res.borrowingLimit})`}
              </div>
            ))}
          </StackItem>
        );
      })}
    </Stack>
  );
};

// --- Cohort detail ---

function isMemberLending(cq: ClusterQueue, members: ClusterQueue[]): boolean {
  // A member is actively lending if at least one sibling is borrowing AND
  // this member has spare capacity within its lendingLimit for any flavor::resource.
  const siblingsAreBorrowing = members.some(
    (m) =>
      m.metadata.name !== cq.metadata.name &&
      (m.status?.flavorsReservation ?? []).some((fu) =>
        fu.resources.some((r) => parseQuantity(r.borrowed ?? '0') > 0),
      ),
  );
  if (!siblingsAreBorrowing) return false;

  for (const rg of cq.spec.resourceGroups ?? []) {
    for (const fl of rg.flavors) {
      for (const res of fl.resources) {
        const ll = res.lendingLimit;
        if (!ll || ll === '0') continue;
        if (parseQuantity(ll) <= 0) continue;
        const nomVal = parseQuantity(res.nominalQuota);
        const fu = cq.status?.flavorsReservation?.find((f) => f.name === fl.name);
        const ru = fu?.resources.find((r) => r.name === res.name);
        const ownUsed = Math.max(0, parseQuantity(ru?.total ?? '0') - parseQuantity(ru?.borrowed ?? '0'));
        if (ownUsed < nomVal) return true;
      }
    }
  }
  return false;
}

const CohortDetail: React.FC<{ cohortName: string; clusterQueues: ClusterQueue[]; onSelectCQ?: (cqName: string) => void }> = ({ cohortName, clusterQueues, onSelectCQ }) => {
  const navigate = useNavigate();
  const members = clusterQueues.filter((cq) => cq.spec.cohort === cohortName);

  // Aggregate per flavor::resource across all members.
  const nominalMap = new Map<string, number>();
  const usedMap = new Map<string, number>();
  const borrowedTotalMap = new Map<string, number>();

  for (const cq of members) {
    for (const rg of cq.spec.resourceGroups ?? []) {
      for (const fl of rg.flavors) {
        for (const res of fl.resources) {
          const key = `${fl.name}::${res.name}`;
          nominalMap.set(key, (nominalMap.get(key) ?? 0) + parseQuantity(res.nominalQuota));
        }
      }
    }
    for (const fu of cq.status?.flavorsReservation ?? []) {
      for (const res of fu.resources) {
        const key = `${fu.name}::${res.name}`;
        usedMap.set(key, (usedMap.get(key) ?? 0) + parseQuantity(res.total ?? '0'));
        borrowedTotalMap.set(key, (borrowedTotalMap.get(key) ?? 0) + parseQuantity(res.borrowed ?? '0'));
      }
    }
  }

  const poolKeys = Array.from(nominalMap.keys());

  const fmt = (val: number, key: string): string => {
    const res = key.split('::')[1];
    if (res === 'memory') {
      if (val >= 1073741824) return `${(val / 1073741824).toFixed(1)}Gi`;
      if (val >= 1048576) return `${(val / 1048576).toFixed(0)}Mi`;
      return `${val}`;
    }
    return val % 1 === 0 ? String(val) : val.toFixed(2);
  };

  return (
    <Stack hasGutter>
      <StackItem>
        <Button
          variant="secondary"
          onClick={() => navigate(`/kueue/workloads?cohort=${encodeURIComponent(cohortName)}`)}
        >
          View workloads →
        </Button>
      </StackItem>
      {/* ── Total quota pool — unchanged ── */}
      {poolKeys.length > 0 && (
        <StackItem>
          <div style={{ fontSize: '0.85em', fontWeight: 600, marginBottom: 'var(--pf-t--global--spacer--sm)', color: 'var(--pf-t--global--text--color--regular)' }}>
            Total quota pool
            <HelpTip content="Sum of all members' nominal quotas. Shows how much of the combined pool is in use." />
          </div>
          {poolKeys.map((key) => {
            const [flavorName, resName] = key.split('::');
            const nominal = nominalMap.get(key) ?? 0;
            const used = usedMap.get(key) ?? 0;
            const borrowed = borrowedTotalMap.get(key) ?? 0;
            const pct = nominal > 0 ? Math.min(100, Math.round((used / nominal) * 100)) : 0;
            return (
              <div key={key} style={{ marginBottom: 'var(--pf-t--global--spacer--sm)' }}>
                <div style={{ fontSize: '0.82em', color: 'var(--pf-t--global--text--color--subtle)', marginBottom: 'var(--pf-t--global--spacer--xs)' }}>
                  <strong style={{ color: 'var(--pf-t--global--text--color--regular)' }}>{flavorName}</strong> · {resName}
                  {': '}{fmt(used, key)} / {fmt(nominal, key)}
                  {borrowed > 0 && (
                    <Label color="yellow" isCompact style={{ marginLeft: 'var(--pf-t--global--spacer--xs)' }}>
                      {fmt(borrowed, key)} borrowed
                    </Label>
                  )}
                </div>
                <Progress value={pct} size={ProgressSize.sm} aria-label={`${resName} cohort usage`} />
              </div>
            );
          })}
        </StackItem>
      )}

      <StackItem><Divider /></StackItem>

      {/* ── Per-member overview — clean card layout ── */}
      <StackItem>
        <div style={{ fontSize: '0.85em', fontWeight: 600, marginBottom: 'var(--pf-t--global--spacer--sm)', color: 'var(--pf-t--global--text--color--regular)' }}>
          Members ({members.length})
        </div>
        {members.map((cq) => {
          const borrowParts: string[] = [];
          for (const fu of cq.status?.flavorsReservation ?? []) {
            for (const res of fu.resources) {
              const b = parseQuantity(res.borrowed ?? '0');
              if (b > 0) borrowParts.push(`${res.borrowed} ${res.name.split('/').pop()}`);
            }
          }
          const isBorrowing = borrowParts.length > 0;
          const isLending = isMemberLending(cq, members);
          const pending = cq.status?.pendingWorkloads ?? 0;
          const clickable = !!onSelectCQ;

          return (
            <div
              key={cq.metadata.name}
              onClick={() => onSelectCQ?.(cq.metadata.name)}
              style={{
                padding: 'var(--pf-t--global--spacer--sm) var(--pf-t--global--spacer--sm)',
                marginBottom: 'var(--pf-t--global--spacer--sm)',
                border: `1px solid ${isBorrowing ? 'var(--pf-t--color--gold--40, #F0AB00)' : isLending ? 'var(--pf-t--global--color--status--success--default)' : 'var(--pf-t--global--border--color--default)'}`,
                borderRadius: 6,
                background: isBorrowing ? 'rgba(240,171,0,0.06)' : isLending ? 'rgba(62,134,53,0.04)' : 'var(--pf-t--global--background--color--secondary--default)',
                cursor: clickable ? 'pointer' : 'default',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--pf-t--global--spacer--xs)' }}>
                <Label color="blue" isCompact>{cq.metadata.name}</Label>
                <div style={{ display: 'flex', gap: 'var(--pf-t--global--spacer--sm)', alignItems: 'center' }}>
                  {isBorrowing && (
                    <span style={{ color: 'var(--pf-t--color--gold--40, #795600)', fontSize: '0.85em', fontWeight: 600 }}>
                      ↗ {borrowParts.join(', ')}
                    </span>
                  )}
                  {isLending && (
                    <span style={{ color: 'var(--pf-t--global--color--status--success--default)', fontSize: '0.85em', fontWeight: 600 }}>
                      ↙ lending
                    </span>
                  )}
                  {clickable && (
                    <span style={{ color: 'var(--pf-t--global--text--color--subtle)', fontSize: '0.75em' }}>→</span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--pf-t--global--spacer--lg)' }}>
                <div>
                  <div style={{ fontSize: '0.72em', color: 'var(--pf-t--global--text--color--subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Admitted</div>
                  <div style={{ fontSize: '1.25em', fontWeight: 700 }}>{cq.status?.admittedWorkloads ?? 0}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72em', color: 'var(--pf-t--global--text--color--subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pending</div>
                  <div style={{ fontSize: '1.25em', fontWeight: 700, color: pending > 0 ? 'var(--pf-t--global--color--status--warning--default)' : 'inherit' }}>
                    {pending}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </StackItem>
    </Stack>
  );
};

// --- Helpers ---

const UsageBar: React.FC<{
  label: string;
  used: string;
  borrowed?: string;
  cq: ClusterQueue;
  flavorName: string;
  clusterQueues: ClusterQueue[];
}> = ({ label, used, borrowed, cq, flavorName, clusterQueues }) => {
  const flavorSpec = cq.spec.resourceGroups
    .flatMap((rg) => rg.flavors.filter((fl) => fl.name === flavorName))
    .flatMap((fl) => fl.resources)
    .find((r) => r.name === label);

  const nominalStr = flavorSpec?.nominalQuota ?? '0';
  const borrowingLimitStr = flavorSpec?.borrowingLimit;
  const lendingLimitStr = flavorSpec?.lendingLimit;

  const usedVal = parseQuantity(used);
  const nominalVal = parseQuantity(nominalStr);
  const borrowedVal = parseQuantity(borrowed ?? '0');
  const borrowingLimitVal = borrowingLimitStr ? parseQuantity(borrowingLimitStr) : 0;
  const lendingLimitVal = lendingLimitStr ? parseQuantity(lendingLimitStr) : 0;

  const ownUsedVal = Math.max(0, usedVal - borrowedVal);
  const borrowPct = borrowingLimitVal > 0 ? Math.min(100, Math.round((borrowedVal / borrowingLimitVal) * 100)) : 0;

  // Compute actual lent: what this CQ is currently lending to the cohort pool.
  // Only non-zero when siblings are actively borrowing; distributed proportionally by contribution.
  let lentVal = 0;
  if (cq.spec.cohort && lendingLimitVal > 0) {
    const cohortMembers = clusterQueues.filter((q) => q.spec.cohort === cq.spec.cohort);
    let totalPool = 0;
    let totalBorrowed = 0;
    for (const member of cohortMembers) {
      const mRes = member.spec.resourceGroups
        .flatMap((rg) => rg.flavors.filter((fl) => fl.name === flavorName))
        .flatMap((fl) => fl.resources)
        .find((r) => r.name === label);
      if (!mRes) continue;
      const mNominal = parseQuantity(mRes.nominalQuota);
      const mLL = mRes.lendingLimit ? parseQuantity(mRes.lendingLimit) : 0;
      const mFu = member.status?.flavorsReservation?.find((f) => f.name === flavorName);
      const mRu = mFu?.resources.find((r) => r.name === label);
      const mOwnUsed = Math.max(0, parseQuantity(mRu?.total ?? '0') - parseQuantity(mRu?.borrowed ?? '0'));
      totalPool += Math.min(Math.max(0, mNominal - mOwnUsed), mLL);
      totalBorrowed += parseQuantity(mRu?.borrowed ?? '0');
    }
    if (totalBorrowed > 0 && totalPool > 0) {
      const spareVal = Math.max(0, nominalVal - ownUsedVal);
      const contribution = Math.min(spareVal, lendingLimitVal);
      lentVal = contribution * (totalBorrowed / totalPool);
    }
  }

  const isBorrowing = borrowedVal > 0;
  const canBorrow = borrowingLimitVal > 0;

  const fmtVal = (v: number): string => {
    if (label === 'memory') {
      if (v >= 1073741824) return `${(v / 1073741824).toFixed(1)}Gi`;
      if (v >= 1048576) return `${(v / 1048576).toFixed(0)}Mi`;
      return `${v}`;
    }
    return v % 1 === 0 ? String(v) : v.toFixed(2);
  };

  // Pct of nominal for each stacked segment
  const ownPctOfNominal  = nominalVal > 0 ? Math.min(100, (ownUsedVal / nominalVal) * 100) : 0;
  const lentPctOfNominal = nominalVal > 0 ? Math.min(100, (lentVal    / nominalVal) * 100) : 0;

  return (
    <div style={{ marginTop: 'var(--pf-t--global--spacer--sm)', marginBottom: 'var(--pf-t--global--spacer--sm)' }}>
      {/* ── Row 1: Nominal quota — stacked bar (red=scheduled, green=lent) ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', marginBottom: 'var(--pf-t--global--spacer--xs)', flexWrap: 'wrap', gap: 'var(--pf-t--global--spacer--xs)' }}>
        <span style={{ fontWeight: 500, color: 'var(--pf-t--global--text--color--regular)' }}>{label}</span>
        <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>
          {fmtVal(ownUsedVal)} scheduled
          {lentVal > 0 && (
            <span style={{ color: 'var(--pf-t--global--color--status--success--default)' }}> + {fmtVal(lentVal)} lent</span>
          )}
          {' / '}{fmtVal(nominalVal)} nominal
          <HelpTip content={`Scheduled (blue): quota used by this queue's own admitted workloads.${lentVal > 0 ? ` Lent (green): spare nominal contributed to the cohort pool — may already be borrowed by another queue. Together they equal the ${fmtVal(nominalVal)} nominal total.` : ''}`} />
        </span>
      </div>
      {/* Stacked bar: [blue: own scheduled | green: lent to pool | grey: free] */}
      <div style={{ height: 10, borderRadius: 5, overflow: 'hidden', display: 'flex', background: 'var(--pf-t--global--background--color--secondary--default)' }}>
        {ownPctOfNominal > 0 && (
          <div style={{ width: `${ownPctOfNominal}%`, background: 'var(--pf-t--color--blue--40)', flexShrink: 0 }} />
        )}
        {lentPctOfNominal > 0 && (
          <div style={{ width: `${lentPctOfNominal}%`, background: 'var(--pf-t--color--green--40)', flexShrink: 0 }} />
        )}
      </div>
      {/* Mini legend — only shown when lending is active */}
      {lentVal > 0 && (
        <div style={{ display: 'flex', gap: 'var(--pf-t--global--spacer--sm)', fontSize: '0.72em', color: 'var(--pf-t--global--text--color--subtle)', marginTop: 'var(--pf-t--global--spacer--xs)' }}>
          <span>
            <span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--pf-t--color--blue--40)', borderRadius: 2, marginRight: 3, verticalAlign: 'middle' }} />
            scheduled
          </span>
          <span>
            <span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--pf-t--color--green--40)', borderRadius: 2, marginRight: 3, verticalAlign: 'middle' }} />
            lent to cohort
          </span>
        </div>
      )}

      {/* ── Row 2: Borrowing (only if borrowingLimit is set) ── */}
      {canBorrow && (
        <div style={{ marginTop: 'var(--pf-t--global--spacer--sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78em', marginBottom: 'var(--pf-t--global--spacer--xs)' }}>
            <span style={{ color: isBorrowing ? 'var(--pf-t--color--gold--40, #795600)' : 'var(--pf-t--global--text--color--subtle)' }}>
              {isBorrowing ? '↗ borrowing' : 'borrowing capacity'}
            </span>
            <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>
              {fmtVal(borrowedVal)} / {fmtVal(borrowingLimitVal)} limit
              {isBorrowing && (
                <Tooltip content="Borrowed quota can be reclaimed by the lending ClusterQueue if it needs the resources back (based on its reclaimWithinCohort policy), which would preempt these workloads.">
                  <span style={{ color: 'var(--pf-t--global--color--status--danger--default)', cursor: 'help', marginLeft: 'var(--pf-t--global--spacer--xs)', fontWeight: 600 }}>⚠ preemptable</span>
                </Tooltip>
              )}
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--pf-t--global--background--color--secondary--default)', overflow: 'hidden' }}>
            {borrowPct > 0 && (
              <div style={{ width: `${borrowPct}%`, height: '100%', background: 'var(--pf-t--color--gold--40, #F0AB00)' }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const PreemptionLabel: React.FC<{ policy: string }> = ({ policy }) => {
  const color: 'grey' | 'orange' | 'red' = policy === 'Never' ? 'grey' : policy === 'LowerPriority' ? 'orange' : 'red';
  return <Label color={color} isCompact>{policy}</Label>;
};

const HelpTip: React.FC<{ content: string }> = ({ content }) => (
  <Tooltip content={content} position="right">
    <OutlinedQuestionCircleIcon
      style={{ marginLeft: 'var(--pf-t--global--spacer--xs)', verticalAlign: 'middle', cursor: 'help', color: 'var(--pf-t--global--text--color--subtle)' }}
      aria-label={content}
    />
  </Tooltip>
);

function kindColor(kind: string): 'teal' | 'blue' | 'purple' | 'green' | 'grey' {
  const map: Record<string, 'teal' | 'blue' | 'purple' | 'green' | 'grey'> = {
    LocalQueue: 'teal',
    ClusterQueue: 'blue',
    Cohort: 'purple',
    ResourceFlavor: 'green',
  };
  return map[kind] ?? 'grey';
}

export default NodeDetailPanel;
