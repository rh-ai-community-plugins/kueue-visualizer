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
  LabelGroup,
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
          <ClusterQueueDetail cq={node.data as ClusterQueue} activeTab={activeTab} setActiveTab={setActiveTab} />
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
  activeTab: number;
  setActiveTab: (t: number) => void;
}> = ({ cq, activeTab, setActiveTab }) => {
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
                  <UsageBar key={r.name} label={r.name} used={r.total} borrowed={r.borrowed} cq={cq} flavorName={fu.name} />
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
            <strong>Covers: </strong>
            <LabelGroup>
              {rg.coveredResources.map((r) => <Label key={r} isCompact>{r}</Label>)}
            </LabelGroup>
            {rg.flavors.map((fl) => (
              <div key={fl.name} style={{ marginTop: '0.5rem', paddingLeft: '1rem' }}>
                <Label color="green" isCompact>{fl.name}</Label>
                {fl.resources.map((res) => (
                  <div key={res.name} style={{ fontSize: '0.85em', paddingLeft: '1rem' }}>
                    {res.name}: nominal={res.nominalQuota}
                    {res.borrowingLimit && ` / borrow≤${res.borrowingLimit}`}
                    {res.lendingLimit && ` / lend≤${res.lendingLimit}`}
                  </div>
                ))}
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

  // Aggregate total nominal pool and total used per flavor:resource across all members.
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

  // Format a raw quantity back to a human-readable string.
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
      {/* Cohort pool bars */}
      {poolKeys.length > 0 && (
        <StackItem>
          <div style={{ fontSize: '0.78em', fontWeight: 600, marginBottom: '0.5rem', color: '#151515' }}>
            Cohort quota pool
            <HelpTip content="Total nominal quota summed across all member ClusterQueues. The bar shows how much of the combined pool is currently in use." />
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

      {/* Per-member table */}
      <StackItem>
        <div style={{ fontSize: '0.78em', fontWeight: 600, marginBottom: '0.4rem' }}>
          Member ClusterQueues
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
}> = ({ label, used, borrowed, cq, flavorName }) => {
  const nominalStr = cq.spec.resourceGroups
    .flatMap((rg) => rg.flavors.find((fl) => fl.name === flavorName)?.resources ?? [])
    .find((r) => r.name === label)?.nominalQuota ?? '0';

  const usedVal = parseQuantity(used);
  const nominalVal = parseQuantity(nominalStr);
  const borrowedVal = parseQuantity(borrowed ?? '0');
  const pct = nominalVal > 0 ? Math.min(100, Math.round((usedVal / nominalVal) * 100)) : 0;

  return (
    <div style={{ marginTop: '0.25rem' }}>
      <div style={{ fontSize: '0.8em', color: '#6a6e73' }}>
        {label}: {used} / {nominalStr}
        {borrowedVal > 0 && <Label color="orange" isCompact style={{ marginLeft: '0.5rem' }}>borrowing {borrowed}</Label>}
      </div>
      <Progress value={pct} size={ProgressSize.sm} aria-label={`${label} usage`} />
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
