import { TicketCategory, TicketPriority, AvailabilityStatus } from '@prisma/client';
import { env } from './env.js';

export interface ScoringWeights {
  skill: number;
  workload: number;
  availability: number;
}

export interface RoutingConfiguration {
  weights: ScoringWeights;
  categoryDepartmentMap: Record<TicketCategory, string>;
  skillScores: {
    exactIntentMatch: number;
    exactCategoryMatch: number;
    partialMatch: number;
    fallbackScore: number;
  };
  availabilityScores: Record<AvailabilityStatus, number>;
  escalationSlaMinutes: Record<TicketPriority, number>;
  tieBreakEpsilon: number;
}

export const routingConfig: RoutingConfiguration = {
  weights: {
    skill: env.ROUTING_SKILL_WEIGHT ?? 0.40,
    workload: env.ROUTING_WORKLOAD_WEIGHT ?? 0.35,
    availability: env.ROUTING_AVAILABILITY_WEIGHT ?? 0.25,
  },
  categoryDepartmentMap: {
    [TicketCategory.PAYMENT]: 'Billing Support',
    [TicketCategory.REFUND]: 'Billing Support',
    [TicketCategory.TECHNICAL]: 'Technical Support',
    [TicketCategory.DELIVERY]: 'Customer Operations',
    [TicketCategory.ACCOUNT]: 'Customer Operations',
    [TicketCategory.PRODUCT]: 'Product Support',
    [TicketCategory.OTHER]: 'Customer Operations',
  },
  skillScores: {
    exactIntentMatch: 1.0,
    exactCategoryMatch: 0.8,
    partialMatch: 0.3,
    fallbackScore: 0.1,
  },
  availabilityScores: {
    [AvailabilityStatus.AVAILABLE]: 1.0,
    [AvailabilityStatus.BUSY]: 0.4,
    [AvailabilityStatus.OFFLINE]: 0.0,
  },
  escalationSlaMinutes: {
    [TicketPriority.URGENT]: 15,
    [TicketPriority.HIGH]: 60,
    [TicketPriority.MEDIUM]: 240,
    [TicketPriority.LOW]: 1440,
  },
  tieBreakEpsilon: 1e-5,
};
