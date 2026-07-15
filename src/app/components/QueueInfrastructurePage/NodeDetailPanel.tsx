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
import type { ClusterQueue, LocalQueue, QueueTopologyNode, FlavorUsage } from '../../types/kueue';
import { parseQuantity } from '../../utils/quantity';

interface NodeDetailPanelProps {
  node: QueueTopologyNode;
  clusterQueues: ClusterQueue[];
  onClose: () => void;
}

const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({ node, clusterQueues, onClose }) => {
  const [activeTab, setActiveTab] = React.useState(0);

  return (
    <Card isFullHeight>
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
                <span style={{ color: '#6a6e73', fontSize: '0.85em' }}>ns: {node.namespace}</span>
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
          <CohortDetail cohortName={node.name} clusterQueues={clusterQueues} />
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
      <Stack hasGutter style={{ paddingTop: '0.75rem' }}>
        {/* Workload counts — prominent, scannable */}
        <StackItem>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.72em', color: '#6a6e73', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Admitted</div>
              <div style={{ fontSize: '1.5em', fontWeight: 700, lineHeight: 1.2 }}>{cq.status?.admittedWorkloads ?? 0}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.72em', color: '#6a6e73', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending</div>
              <div style={{ fontSize: '1.5em', fontWeight: 700, lineHeight: 1.2, color: (cq.status?.pendingWorkloads ?? 0) > 0 ? '#EC7A08' : 'inherit' }}>
                {cq.status?.pendingWorkloads ?? 0}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.72em', color: '#6a6e73', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Strategy</div>
              <div style={{ fontSize: '0.82em', marginTop: '0.2em' }}>{cq.spec.queueingStrategy ?? 'BestEffortFIFO'}</div>
            </div>
          </div>
        </StackItem>
        {/* Resource quota utilization */}
        {(cq.status?.flavorsReservation ?? []).length > 0 ? (
          <>
            <StackItem><Divider /></StackItem>
            {(cq.status?.flavorsReservation ?? []).map((fu) => (
              <StackItem key={fu.name}>
                <div style={{ fontSize: '0.78em', color: '#6a6e73', marginBottom: '0.3rem' }}>
                  Flavor: <strong style={{ color: '#151515' }}>{fu.name}</strong>
                </div>
                {fu.resources.map((r) => (
                  <UsageBar key={r.name} label={r.name} used={r.total} borrowed={r.borrowed} cq={cq} flavorName={fu.name} clusterQueues={clusterQueues} />
                ))}
              </StackItem>
            ))}
          </>
        ) : (
          <StackItem>
            <span style={{ fontSize: '0.85em', color: '#6a6e73' }}>No active resource reservations.</span>
          </StackItem>
        )}
      </Stack>
    </Tab>

    <Tab eventKey={1} title={<TabTitleText>Preemption</TabTitleText>}>
      <Stack hasGutter style={{ paddingTop: '1rem' }}>
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
                    <span style={{ fontSize: '0.85em', color: '#6a6e73', marginLeft: 6 }}>
                      (only preempts workloads with priority ≤ {cq.spec.preemption.borrowWithinCohort.maxPriorityThreshold})
                    </span>
                  )}
                </DescriptionListDescription>
              </DescriptionListGroup>
            )}
          </DescriptionList>
        ) : (
          <span style={{ color: '#6a6e73' }}>No preemption configured (Never)</span>
        )}
      </Stack>
    </Tab>

    <Tab eventKey={2} title={<TabTitleText>Flavors</TabTitleText>}>
      <Stack hasGutter style={{ paddingTop: '1rem' }}>
        {cq.spec.resourceGroups.map((rg, i) => (
          <StackItem key={i}>
            {rg.flavors.map((fl) => (
              <div key={fl.name} style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  <Label color="green" isCompact>{fl.name}</Label>
                  <span style={{ fontSize: '0.75em', color: '#6a6e73' }}>
                    covers: {rg.coveredResources.join(', ')}
                  </span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82em' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #d2d2d2' }}>
                      <th style={{ textAlign: 'left', padding: '3px 6px', color: '#6a6e73', fontWeight: 500 }}>Resource</th>
                      <th style={{ textAlign: 'right', padding: '3px 6px', color: '#6a6e73', fontWeight: 500 }}>
                        Nominal
                        <HelpTip content="This queue's guaranteed quota. Workloads up to this amount are always admissible (if not used by others)." />
                      </th>
                      <th style={{ textAlign: 'right', padding: '3px 6px', color: '#6a6e73', fontWeight: 500 }}>
                        Borrow max
                        <HelpTip content="How much extra this queue can take from the cohort pool on top of its nominal quota (if the pool has spare capacity)." />
                      </th>
                      <th style={{ textAlign: 'right', padding: '3px 6px', color: '#6a6e73', fontWeight: 500 }}>
                        Lend max
                        <HelpTip content="How much of its spare nominal quota this queue contributes to the cohort pool for others to borrow." />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {fl.resources.map((res) => (
                      <tr key={res.name} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '4px 6px', fontWeight: 500 }}>{res.name}</td>
                        <td style={{ textAlign: 'right', padding: '4px 6px' }}>{res.nominalQuota}</td>
                        <td style={{ textAlign: 'right', padding: '4px 6px', color: res.borrowingLimit ? '#EC7A08' : '#6a6e73' }}>
                          {res.borrowingLimit ? `+${res.borrowingLimit}` : '—'}
                        </td>
                        <td style={{ textAlign: 'right', padding: '4px 6px', color: res.lendingLimit === '0' ? '#6a6e73' : res.lendingLimit ? '#3E8635' : '#6a6e73' }}>
                          {res.lendingLimit === '0' ? 'none' : res.lendingLimit ? res.lendingLimit : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
              <Label color="red" isCompact>{lq.spec.clusterQueue}</Label>
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
      {queuesWithFlavor.length === 0 && <StackItem><span style={{ color: '#6a6e73' }}>None</span></StackItem>}
      {queuesWithFlavor.map((cq) => {
        const quotas = cq.spec.resourceGroups
          .flatMap((rg) => rg.flavors.filter((fl) => fl.name === flavorName))
          .flatMap((fl) => fl.resources);
        return (
          <StackItem key={cq.metadata.name}>
            <Label color="red" isCompact>{cq.metadata.name}</Label>
            {quotas.map((res) => (
              <div key={res.name} style={{ fontSize: '0.85em', paddingLeft: '1rem' }}>
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

const CohortDetail: React.FC<{ cohortName: string; clusterQueues: ClusterQueue[] }> = ({ cohortName, clusterQueues }) => {
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

  // Per-member lending contribution per flavor::resource:
  // contribution_i = min(max(0, nominal_i - ownUsed_i), lendingLimit_i)
  // where ownUsed_i = total_i - borrowed_i (usage from own nominal only)
  type MemberLending = {
    cqName: string;
    contributions: Map<string, number>; // key -> contribution value
    borrowing: Map<string, number>;     // key -> borrowed value
  };

  const memberLending: MemberLending[] = members.map((cq) => {
    const contributions = new Map<string, number>();
    const borrowing = new Map<string, number>();

    for (const rg of cq.spec.resourceGroups ?? []) {
      for (const fl of rg.flavors) {
        for (const res of fl.resources) {
          const key = `${fl.name}::${res.name}`;
          const nominal = parseQuantity(res.nominalQuota);
          const lendingLimit = res.lendingLimit ? parseQuantity(res.lendingLimit) : 0;
          const fuEntry = cq.status?.flavorsReservation?.find((fu) => fu.name === fl.name);
          const resEntry = fuEntry?.resources.find((r) => r.name === res.name);
          const totalUsed = parseQuantity(resEntry?.total ?? '0');
          const borrowed = parseQuantity(resEntry?.borrowed ?? '0');
          const ownUsed = Math.max(0, totalUsed - borrowed);
          const spare = Math.max(0, nominal - ownUsed);
          contributions.set(key, Math.min(spare, lendingLimit));
          if (borrowed > 0) borrowing.set(key, borrowed);
        }
      }
    }
    return { cqName: cq.metadata.name, contributions, borrowing };
  });

  return (
    <Stack hasGutter>
      {/* ── Total quota usage bars ── */}
      {poolKeys.length > 0 && (
        <StackItem>
          <div style={{ fontSize: '0.78em', fontWeight: 600, marginBottom: '0.5rem', color: '#151515' }}>
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
              <div key={key} style={{ marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.78em', color: '#6a6e73', marginBottom: '0.15rem' }}>
                  <strong style={{ color: '#151515' }}>{flavorName}</strong> · {resName}
                  {': '}{fmt(used, key)} / {fmt(nominal, key)}
                  {borrowed > 0 && (
                    <Label color="orange" isCompact style={{ marginLeft: 6 }}>
                      {fmt(borrowed, key)} borrowed across cohort
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

      {/* ── Lending pool breakdown ── */}
      <StackItem>
        <div style={{ fontSize: '0.78em', fontWeight: 600, marginBottom: '0.4rem', color: '#151515' }}>
          Lending pool
          <HelpTip content="Each member contributes spare quota (up to its lendingLimit) to a shared pool. Other members can borrow from this pool. Contribution = min(nominalQuota − ownUsed, lendingLimit)." />
        </div>
        {poolKeys.map((key) => {
          const [flavorName, resName] = key.split('::');
          const totalPool = memberLending.reduce((s, m) => s + (m.contributions.get(key) ?? 0), 0);
          const totalLent = borrowedTotalMap.get(key) ?? 0;
          const available = Math.max(0, totalPool - totalLent);
          const poolPct = totalPool > 0 ? Math.min(100, Math.round((totalLent / totalPool) * 100)) : 0;

          return (
            <div key={key} style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.78em', color: '#6a6e73', marginBottom: '0.2rem' }}>
                <strong style={{ color: '#151515' }}>{flavorName}</strong> · {resName}
                {' — pool: '}{fmt(totalPool, key)}
                {totalLent > 0
                  ? <span style={{ color: '#EC7A08' }}> · lent: {fmt(totalLent, key)} · available: {fmt(available, key)}</span>
                  : <span style={{ color: '#3E8635' }}> · all available</span>}
              </div>
              {totalPool > 0 && (
                <div style={{ height: 6, borderRadius: 3, background: '#f0f0f0', overflow: 'hidden', marginBottom: '0.3rem' }}>
                  <div style={{ width: `${poolPct}%`, height: '100%', background: '#EC7A08' }} />
                </div>
              )}
              {/* Per-member contribution rows */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8em' }}>
                <thead>
                  <tr style={{ color: '#6a6e73' }}>
                    <th style={{ textAlign: 'left', padding: '2px 4px', fontWeight: 400 }}>Member</th>
                    <th style={{ textAlign: 'right', padding: '2px 4px', fontWeight: 400 }}>Nominal</th>
                    <th style={{ textAlign: 'right', padding: '2px 4px', fontWeight: 400 }}>Own use</th>
                    <th style={{ textAlign: 'right', padding: '2px 4px', fontWeight: 400 }}>Lend limit</th>
                    <th style={{ textAlign: 'right', padding: '2px 4px', fontWeight: 400 }}>Contributing</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((cq) => {
                    const ml = memberLending.find((m) => m.cqName === cq.metadata.name);
                    const contribution = ml?.contributions.get(key) ?? 0;
                    const isBorrowing = (ml?.borrowing.get(key) ?? 0) > 0;
                    const borrowedAmt = ml?.borrowing.get(key) ?? 0;

                    const flavorSpec = cq.spec.resourceGroups
                      .flatMap((rg) => rg.flavors.filter((fl) => fl.name === flavorName))
                      .flatMap((fl) => fl.resources)
                      .find((r) => r.name === resName);
                    const nominal = parseQuantity(flavorSpec?.nominalQuota ?? '0');
                    const lendingLimit = flavorSpec?.lendingLimit ? parseQuantity(flavorSpec.lendingLimit) : 0;
                    const fuEntry = cq.status?.flavorsReservation?.find((fu) => fu.name === flavorName);
                    const resEntry = fuEntry?.resources.find((r) => r.name === resName);
                    const totalUsed = parseQuantity(resEntry?.total ?? '0');
                    const ownUsed = Math.max(0, totalUsed - borrowedAmt);

                    return (
                      <tr key={cq.metadata.name} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '3px 4px' }}>
                          <Label color="red" isCompact>{cq.metadata.name}</Label>
                          {isBorrowing && (
                            <span style={{ color: '#EC7A08', fontSize: '0.85em', marginLeft: 4 }}>
                              ↗ borrowing {fmt(borrowedAmt, key)}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', padding: '3px 4px' }}>{fmt(nominal, key)}</td>
                        <td style={{ textAlign: 'right', padding: '3px 4px' }}>{fmt(ownUsed, key)}</td>
                        <td style={{ textAlign: 'right', padding: '3px 4px', color: lendingLimit === 0 ? '#6a6e73' : '#3E8635' }}>
                          {lendingLimit === 0 ? 'none' : fmt(lendingLimit, key)}
                        </td>
                        <td style={{ textAlign: 'right', padding: '3px 4px', color: contribution > 0 ? '#3E8635' : '#6a6e73', fontWeight: contribution > 0 ? 600 : 400 }}>
                          {contribution > 0 ? fmt(contribution, key) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </StackItem>

      <StackItem><Divider /></StackItem>

      {/* ── Per-member workload summary ── */}
      <StackItem>
        <div style={{ fontSize: '0.78em', fontWeight: 600, marginBottom: '0.4rem' }}>
          Workload summary
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82em' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #d2d2d2', color: '#6a6e73' }}>
              <th style={{ textAlign: 'left', padding: '2px 4px' }}>Queue</th>
              <th style={{ textAlign: 'right', padding: '2px 4px' }}>Admitted</th>
              <th style={{ textAlign: 'right', padding: '2px 4px' }}>Pending</th>
              <th style={{ textAlign: 'left', padding: '2px 4px' }}>Borrowing</th>
            </tr>
          </thead>
          <tbody>
            {members.map((cq) => {
              const borrowParts: string[] = [];
              for (const fu of cq.status?.flavorsReservation ?? []) {
                for (const res of fu.resources) {
                  const b = parseQuantity(res.borrowed ?? '0');
                  if (b > 0) borrowParts.push(`${res.borrowed} ${res.name.split('/').pop()}`);
                }
              }
              return (
                <tr key={cq.metadata.name} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '3px 4px' }}>
                    <Label color="red" isCompact>{cq.metadata.name}</Label>
                  </td>
                  <td style={{ textAlign: 'right', padding: '3px 4px' }}>{cq.status?.admittedWorkloads ?? 0}</td>
                  <td style={{ textAlign: 'right', padding: '3px 4px', color: (cq.status?.pendingWorkloads ?? 0) > 0 ? '#EC7A08' : 'inherit' }}>
                    {cq.status?.pendingWorkloads ?? 0}
                  </td>
                  <td style={{ padding: '3px 4px' }}>
                    {borrowParts.length > 0
                      ? <span style={{ color: '#EC7A08', fontWeight: 600 }}>↗ {borrowParts.join(', ')}</span>
                      : <span style={{ color: '#6a6e73' }}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
  const canLend = lendingLimitVal > 0;

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
    <div style={{ marginTop: '0.5rem', marginBottom: '0.75rem' }}>
      {/* ── Row 1: Nominal quota — stacked bar (red=scheduled, green=lent) ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', marginBottom: '0.2rem', flexWrap: 'wrap', gap: '0.2rem' }}>
        <span style={{ fontWeight: 500, color: '#151515' }}>{label}</span>
        <span style={{ color: '#6a6e73' }}>
          {fmtVal(ownUsedVal)} scheduled
          {lentVal > 0 && (
            <span style={{ color: '#3E8635' }}> + {fmtVal(lentVal)} lent</span>
          )}
          {' / '}{fmtVal(nominalVal)} nominal
          <HelpTip content={`Scheduled (red): quota used by this queue's own admitted workloads.${lentVal > 0 ? ` Lent (green): spare nominal contributed to the cohort pool — may already be borrowed by another queue. Together they equal the ${fmtVal(nominalVal)} nominal total.` : ''}`} />
        </span>
      </div>
      {/* Stacked bar: [red: own scheduled | green: lent to pool | grey: free] */}
      <div style={{ height: 10, borderRadius: 5, overflow: 'hidden', display: 'flex', background: '#f0f0f0' }}>
        {ownPctOfNominal > 0 && (
          <div style={{ width: `${ownPctOfNominal}%`, background: '#C9190B', flexShrink: 0 }} />
        )}
        {lentPctOfNominal > 0 && (
          <div style={{ width: `${lentPctOfNominal}%`, background: '#3E8635', flexShrink: 0 }} />
        )}
      </div>
      {/* Mini legend — only shown when lending is active */}
      {lentVal > 0 && (
        <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.72em', color: '#6a6e73', marginTop: '0.2rem' }}>
          <span>
            <span style={{ display: 'inline-block', width: 8, height: 8, background: '#C9190B', borderRadius: 2, marginRight: 3, verticalAlign: 'middle' }} />
            scheduled
          </span>
          <span>
            <span style={{ display: 'inline-block', width: 8, height: 8, background: '#3E8635', borderRadius: 2, marginRight: 3, verticalAlign: 'middle' }} />
            lent to cohort
          </span>
        </div>
      )}

      {/* ── Row 2: Borrowing (only if borrowingLimit is set) ── */}
      {canBorrow && (
        <div style={{ marginTop: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78em', marginBottom: '0.2rem' }}>
            <span style={{ color: isBorrowing ? '#EC7A08' : '#6a6e73' }}>
              {isBorrowing ? '↗ borrowing' : 'borrowing capacity'}
            </span>
            <span style={{ color: '#6a6e73' }}>
              {fmtVal(borrowedVal)} / {fmtVal(borrowingLimitVal)} limit
              {isBorrowing && (
                <Tooltip content="Borrowed quota can be reclaimed by the lending ClusterQueue if it needs the resources back (based on its reclaimWithinCohort policy), which would preempt these workloads.">
                  <span style={{ color: '#C9190B', cursor: 'help', marginLeft: 6, fontWeight: 600 }}>⚠ preemptable</span>
                </Tooltip>
              )}
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: '#f0f0f0', overflow: 'hidden' }}>
            {borrowPct > 0 && (
              <div style={{ width: `${borrowPct}%`, height: '100%', background: '#EC7A08' }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const PreemptionLabel: React.FC<{ policy: string }> = ({ policy }) => {
  const color = policy === 'Never' ? 'grey' : policy === 'LowerPriority' ? 'orange' : 'red';
  return <Label color={color as any} isCompact>{policy}</Label>;
};

const HelpTip: React.FC<{ content: string }> = ({ content }) => (
  <Tooltip content={content} position="right">
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 14, height: 14, borderRadius: '50%',
        background: '#6a6e73', color: '#fff',
        fontSize: '0.65em', fontWeight: 700,
        cursor: 'help', marginLeft: 5, verticalAlign: 'middle', flexShrink: 0,
      }}
      aria-label={content}
    >?</span>
  </Tooltip>
);

function kindColor(kind: string): 'blue' | 'red' | 'purple' | 'green' | 'grey' {
  const map: Record<string, 'blue' | 'red' | 'purple' | 'green' | 'grey'> = {
    LocalQueue: 'blue',
    ClusterQueue: 'red',
    Cohort: 'purple',
    ResourceFlavor: 'green',
  };
  return map[kind] ?? 'grey';
}

export default NodeDetailPanel;
