import { JobsOptions } from 'bullmq';

export const QUEUE_NAMES = {
  TICKET_ASSIGNMENT: 'ticket-assignment',
  TICKET_REASSIGNMENT: 'ticket-reassignment',
  TICKET_ESCALATION: 'ticket-escalation',
} as const;

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000, // 2s, 4s, 8s
  },
  removeOnComplete: {
    age: 3600 * 24, // Keep for 24 hours
    count: 500,
  },
  removeOnFail: {
    age: 3600 * 48, // Keep for 48 hours
    count: 1000,
  },
};

export const ESCALATION_JOB_OPTIONS: JobsOptions = {
  attempts: 2,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
  removeOnComplete: 200,
  removeOnFail: 500,
};

export function getAssignmentJobId(ticketId: string): string {
  return `ticket-assign-${ticketId}`;
}

export function getReassignmentJobId(ticketId: string, timestamp = Date.now()): string {
  return `ticket-reassign-${ticketId}-${timestamp}`;
}

export function getEscalationJobId(ticketId: string, level = 1): string {
  return `ticket-escalate-${ticketId}-lvl-${level}`;
}
