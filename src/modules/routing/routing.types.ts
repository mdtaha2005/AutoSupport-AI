import { AvailabilityStatus, TicketCategory, TicketPriority, AssignmentType } from '@prisma/client';

export interface CandidateAgent {
  id: string; // AgentProfile ID
  userId: string;
  name: string;
  email: string;
  departmentId: string | null;
  skills: string[];
  availabilityStatus: AvailabilityStatus;
  maxWorkload: number;
  currentWorkload: number;
  updatedAt: Date;
}

export interface ScoreBreakdown {
  skillScore: number;
  workloadScore: number;
  availabilityScore: number;
  compositeScore: number;
}

export interface ScoredCandidate {
  agent: CandidateAgent;
  scores: ScoreBreakdown;
}

export interface TicketContext {
  id: string;
  category?: TicketCategory | null;
  intent?: string | null;
  priority: TicketPriority;
  departmentId?: string | null;
  isManuallyAssigned: boolean;
}

export interface RoutingDecision {
  ticketId: string;
  departmentId: string | null;
  selectedAgent: CandidateAgent | null;
  scores: ScoreBreakdown | null;
  evaluatedCandidatesCount: number;
  isFallback: boolean;
  reason?: string;
}

export interface RouteTicketOptions {
  bypassManualCheck?: boolean;
  assignmentType?: AssignmentType;
  actorId?: string;
  reason?: string;
  preferredDepartmentId?: string;
}
