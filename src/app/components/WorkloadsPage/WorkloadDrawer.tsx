import React from 'react';
import {
  DrawerPanelContent,
  DrawerHead,
  DrawerActions,
  DrawerCloseButton,
  Title,
  Stack,
  StackItem,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  Label,
  LabelGroup,
  Divider,
  Alert,
} from '@patternfly/react-core';
import type { Workload, ClusterQueue, Condition } from '../../types/kueue';
import { computeWorkloadQueueInfo, getWorkloadPhase } from '../../hooks/useKueueResources';

interface WorkloadDrawerProps {
  workload: Workload;
  allWorkloads: Workload[];
  clusterQueues: ClusterQueue[];
  onClose: () => void;
}

const WorkloadDrawer: React.FC<WorkloadDrawerProps> = ({
  workload,
  allWorkloads,
  clusterQueues,
  onClose,
}) => {
  const info = computeWorkloadQueueInfo(workload, allWorkloads, clusterQueues);
  const conditions = workload.status?.conditions ?? [];

  return (
    <DrawerPanelContent widths={{ default: 'width_33' }}>
      <DrawerHead>
        <Title headingLevel="h2">{workload.metadata.name}</Title>
        <DrawerActions>
          <DrawerCloseButton onClick={onClose} />
        </DrawerActions>
      </DrawerHead>

            <Stack hasGutter style={{ padding: '1rem' }}>
              {/* Queue position / scheduling info */}
              <StackItem>
                <Title headingLevel="h3">Scheduling Status</Title>
              </StackItem>
              <StackItem>
                <DescriptionList isCompact>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Phase</DescriptionListTerm>
                    <DescriptionListDescription>
                      <PhaseLabel phase={info.phase} />
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Local Queue</DescriptionListTerm>
                    <DescriptionListDescription>
                      <Label color="blue" isCompact>{workload.spec.queueName}</Label>
                      {workload.metadata.namespace && (
                        <span style={{ marginLeft: '0.5rem', color: '#6a6e73', fontSize: '0.85em' }}>
                          ({workload.metadata.namespace})
                        </span>
                      )}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>ClusterQueue</DescriptionListTerm>
                    <DescriptionListDescription>
                      {workload.status?.admission?.clusterQueue
                        ? <Label color="red" isCompact>{workload.status.admission.clusterQueue}</Label>
                        : <span style={{ color: '#6a6e73' }}>Not yet admitted</span>}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  {info.phase === 'Pending' && info.queuePosition !== null && (
                    <DescriptionListGroup>
                      <DescriptionListTerm>Queue position</DescriptionListTerm>
                      <DescriptionListDescription>
                        <strong>#{info.queuePosition}</strong>
                        <span style={{ color: '#6a6e73', marginLeft: '0.5rem' }}>
                          ({info.workloadsAhead} workload{info.workloadsAhead !== 1 ? 's' : ''} ahead)
                        </span>
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  )}
                  <DescriptionListGroup>
                    <DescriptionListTerm>Borrowing</DescriptionListTerm>
                    <DescriptionListDescription>
                      {info.isBorrowing ? (
                        <Label color="orange" isCompact>
                          Yes{info.borrowingFrom ? ` — from cohort "${info.borrowingFrom}"` : ''}
                        </Label>
                      ) : (
                        <span style={{ color: '#6a6e73' }}>No</span>
                      )}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Priority</DescriptionListTerm>
                    <DescriptionListDescription>
                      {workload.spec.priority !== undefined ? (
                        <>
                          {workload.spec.priority}
                          {workload.spec.priorityClassName && (
                            <Label isCompact style={{ marginLeft: '0.5rem' }}>{workload.spec.priorityClassName}</Label>
                          )}
                        </>
                      ) : workload.spec.priorityClassName ?? '—'}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                </DescriptionList>
              </StackItem>

              {/* Flavor assignments */}
              {workload.status?.admission?.podSetAssignments && (
                <>
                  <StackItem><Divider /></StackItem>
                  <StackItem>
                    <Title headingLevel="h3">Flavor Assignments</Title>
                  </StackItem>
                  <StackItem>
                    {workload.status.admission.podSetAssignments.map((psa) => (
                      <div key={psa.name} style={{ marginBottom: '0.5rem' }}>
                        <strong>{psa.name}</strong>
                        <LabelGroup style={{ marginTop: '0.25rem' }}>
                          {Object.entries(psa.flavors).map(([resource, flavor]) => (
                            <Label key={resource} color="green" isCompact>
                              {resource}: {flavor}
                            </Label>
                          ))}
                        </LabelGroup>
                      </div>
                    ))}
                  </StackItem>
                </>
              )}

              {/* Lifecycle timeline */}
              <StackItem><Divider /></StackItem>
              <StackItem>
                <Title headingLevel="h3">Lifecycle Timeline</Title>
              </StackItem>
              <StackItem>
                <Timeline conditions={conditions} startTime={workload.status?.startTime} />
              </StackItem>

              {/* Conditions */}
              {conditions.some((c) => c.status === 'False') && (
                <>
                  <StackItem><Divider /></StackItem>
                  <StackItem>
                    {conditions
                      .filter((c) => c.status === 'False')
                      .map((c) => (
                        <Alert key={c.type} variant="warning" title={`${c.type}: ${c.reason}`} isInline>
                          {c.message}
                        </Alert>
                      ))}
                  </StackItem>
                </>
              )}
            </Stack>
    </DrawerPanelContent>
  );
};

// --- Timeline component ---

const CONDITION_ORDER = ['QuotaReserved', 'Admitted', 'PodsReady', 'Finished'];

const Timeline: React.FC<{ conditions: Condition[]; startTime?: string }> = ({ conditions, startTime }) => {
  const events: Array<{ label: string; time: string; done: boolean }> = [
    { label: 'Submitted', time: '', done: true },
  ];

  for (const condName of CONDITION_ORDER) {
    const cond = conditions.find((c) => c.type === condName);
    events.push({
      label: condName,
      time: cond?.lastTransitionTime ?? '',
      done: cond?.status === 'True',
    });
  }

  return (
    <div>
      {events.map((e, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            marginBottom: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginRight: '0.75rem' }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: e.done ? '#3E8635' : '#d2d2d2',
                flexShrink: 0,
              }}
            />
            {i < events.length - 1 && (
              <div style={{ width: 2, height: 20, background: '#d2d2d2', margin: '2px 0' }} />
            )}
          </div>
          <div>
            <div style={{ fontWeight: e.done ? 600 : 400, color: e.done ? 'inherit' : '#6a6e73' }}>
              {e.label}
            </div>
            {e.time && (
              <div style={{ fontSize: '0.8em', color: '#6a6e73' }}>
                {new Date(e.time).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

const PHASE_COLORS = {
  Pending: 'orange',
  Admitted: 'blue',
  Running: 'green',
  Finished: 'grey',
  Failed: 'red',
} as const;

const PhaseLabel: React.FC<{ phase: string }> = ({ phase }) => (
  <Label color={(PHASE_COLORS as any)[phase] ?? 'grey'} isCompact>{phase}</Label>
);

export default WorkloadDrawer;
