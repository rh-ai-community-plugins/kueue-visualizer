import React from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  CardFooter,
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
}> = ({ cq, activeTab, setActiveTab }) => (
  <Tabs activeKey={activeTab} onSelect={(_, k) => setActiveTab(Number(k))}>
    <Tab eventKey={0} title={<TabTitleText>Capacity</TabTitleText>}>
      <Stack hasGutter style={{ paddingTop: '1rem' }}>
        <StackItem>
          <DescriptionList isCompact>
            <DescriptionListGroup>
              <DescriptionListTerm>Admitted</DescriptionListTerm>
              <DescriptionListDescription>{cq.status?.admittedWorkloads ?? 0}</DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Pending</DescriptionListTerm>
              <DescriptionListDescription>{cq.status?.pendingWorkloads ?? 0}</DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Queueing strategy</DescriptionListTerm>
              <DescriptionListDescription>{cq.spec.queueingStrategy ?? 'BestEffortFIFO'}</DescriptionListDescription>
            </DescriptionListGroup>
          </DescriptionList>
        </StackItem>
        {(cq.status?.flavorUsage ?? []).map((fu) => (
          <StackItem key={fu.name}>
            <strong>{fu.name}</strong>
            {fu.resources.map((r) => (
              <UsageBar key={r.name} label={r.name} used={r.total} borrowed={r.borrowed} cq={cq} flavorName={fu.name} />
            ))}
          </StackItem>
        ))}
      </Stack>
    </Tab>

    <Tab eventKey={1} title={<TabTitleText>Preemption</TabTitleText>}>
      <Stack hasGutter style={{ paddingTop: '1rem' }}>
        {cq.spec.preemption ? (
          <DescriptionList isCompact>
            <DescriptionListGroup>
              <DescriptionListTerm>Within ClusterQueue</DescriptionListTerm>
              <DescriptionListDescription>
                <PreemptionLabel policy={cq.spec.preemption.withinClusterQueue} />
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Reclaim within cohort</DescriptionListTerm>
              <DescriptionListDescription>
                <PreemptionLabel policy={cq.spec.preemption.reclaimWithinCohort} />
              </DescriptionListDescription>
            </DescriptionListGroup>
            {cq.spec.preemption.borrowWithinCohort && (
              <DescriptionListGroup>
                <DescriptionListTerm>Borrow within cohort</DescriptionListTerm>
                <DescriptionListDescription>
                  {cq.spec.preemption.borrowWithinCohort.policy}
                  {cq.spec.preemption.borrowWithinCohort.maxPriorityThreshold !== undefined && (
                    <> (max priority: {cq.spec.preemption.borrowWithinCohort.maxPriorityThreshold})</>
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
);

// --- LocalQueue detail ---

const LocalQueueDetail: React.FC<{ lq: LocalQueue; clusterQueues: ClusterQueue[] }> = ({ lq, clusterQueues }) => {
  const cq = clusterQueues.find((c) => c.metadata.name === lq.spec.clusterQueue);
  return (
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
  return (
    <Stack hasGutter>
      <StackItem>
        <strong>Member ClusterQueues:</strong>
      </StackItem>
      {members.map((cq) => (
        <StackItem key={cq.metadata.name}>
          <Label color="red" isCompact>{cq.metadata.name}</Label>
          <span style={{ marginLeft: '0.5rem', fontSize: '0.85em', color: '#6a6e73' }}>
            {cq.status?.admittedWorkloads ?? 0} admitted / {cq.status?.pendingWorkloads ?? 0} pending
          </span>
        </StackItem>
      ))}
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
