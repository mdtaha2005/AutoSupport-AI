import { describe, it, expect } from 'vitest';
import { AvailabilityStatus, TicketCategory, TicketPriority } from '@prisma/client';
import { scoringEngine } from '../../src/modules/routing/scoring.engine.js';
import { CandidateAgent, TicketContext } from '../../src/modules/routing/routing.types.js';

describe('Phase 3: Weighted Scoring & Deterministic Tie-Breaking Unit Tests', () => {
  describe('1. Skill Scoring', () => {
    it('should assign 1.0 for exact intent match', () => {
      const score = scoringEngine.computeSkillScore(['double_charge', 'billing'], TicketCategory.PAYMENT, 'double_charge');
      expect(score).toBe(1.0);
    });

    it('should assign 0.8 for exact category match when intent does not match', () => {
      const score = scoringEngine.computeSkillScore(['payment', 'invoice'], TicketCategory.PAYMENT, 'unknown_intent');
      expect(score).toBe(0.8);
    });

    it('should assign 0.3 for partial skill match', () => {
      const score = scoringEngine.computeSkillScore(['pay'], TicketCategory.PAYMENT, 'unknown_intent');
      expect(score).toBe(0.3);
    });

    it('should assign 0.1 fallback for non-matching generalist', () => {
      const score = scoringEngine.computeSkillScore(['hardware'], TicketCategory.PAYMENT, 'double_charge');
      expect(score).toBe(0.1);
    });

    it('should assign 0.1 fallback when agent has no skills listed', () => {
      const score = scoringEngine.computeSkillScore([], TicketCategory.PAYMENT, 'double_charge');
      expect(score).toBe(0.1);
    });
  });

  describe('2. Workload Scoring (Normalized Remaining Capacity)', () => {
    it('should return 1.0 when agent has 0 current workload', () => {
      const score = scoringEngine.computeWorkloadScore(0, 10);
      expect(score).toBe(1.0);
    });

    it('should return 0.5 when agent is at 50% capacity', () => {
      const score = scoringEngine.computeWorkloadScore(5, 10);
      expect(score).toBe(0.5);
    });

    it('should return 0.0 when agent is at 100% capacity', () => {
      const score = scoringEngine.computeWorkloadScore(10, 10);
      expect(score).toBe(0.0);
    });
  });

  describe('3. Availability Scoring', () => {
    it('should score AVAILABLE as 1.0', () => {
      expect(scoringEngine.computeAvailabilityScore(AvailabilityStatus.AVAILABLE)).toBe(1.0);
    });

    it('should score BUSY as 0.4', () => {
      expect(scoringEngine.computeAvailabilityScore(AvailabilityStatus.BUSY)).toBe(0.4);
    });

    it('should score OFFLINE as 0.0', () => {
      expect(scoringEngine.computeAvailabilityScore(AvailabilityStatus.OFFLINE)).toBe(0.0);
    });
  });

  describe('4. Composite Weighted Score Formula', () => {
    it('should compute weighted score accurately (0.40 * skill + 0.35 * workload + 0.25 * avail)', () => {
      // skill=1.0, workload=1.0, avail=1.0 => 1.0
      const perfectScore = scoringEngine.computeCompositeScore(1.0, 1.0, 1.0);
      expect(perfectScore).toBe(1.0);

      // skill=0.8, workload=0.5, avail=0.4 => (0.4*0.8) + (0.35*0.5) + (0.25*0.4) = 0.32 + 0.175 + 0.1 = 0.595
      const customScore = scoringEngine.computeCompositeScore(0.8, 0.5, 0.4);
      expect(customScore).toBeCloseTo(0.595, 3);
    });
  });

  describe('5. Candidate Filtering & Deterministic Tie-Breaking', () => {
    const context: TicketContext = {
      id: 'ticket-1',
      category: TicketCategory.PAYMENT,
      intent: 'double_charge',
      priority: TicketPriority.HIGH,
      departmentId: 'dept-1',
      isManuallyAssigned: false,
    };

    it('should filter out agents who are OFFLINE or at max workload', () => {
      const candidates: CandidateAgent[] = [
        {
          id: 'p1',
          userId: 'u1',
          name: 'Offline Agent',
          email: 'offline@test.com',
          departmentId: 'dept-1',
          skills: ['double_charge'],
          availabilityStatus: AvailabilityStatus.OFFLINE,
          maxWorkload: 5,
          currentWorkload: 0,
          updatedAt: new Date(),
        },
        {
          id: 'p2',
          userId: 'u2',
          name: 'Full Agent',
          email: 'full@test.com',
          departmentId: 'dept-1',
          skills: ['double_charge'],
          availabilityStatus: AvailabilityStatus.AVAILABLE,
          maxWorkload: 5,
          currentWorkload: 5, // At max workload
          updatedAt: new Date(),
        },
        {
          id: 'p3',
          userId: 'u3',
          name: 'Available Agent',
          email: 'avail@test.com',
          departmentId: 'dept-1',
          skills: ['double_charge'],
          availabilityStatus: AvailabilityStatus.AVAILABLE,
          maxWorkload: 5,
          currentWorkload: 1,
          updatedAt: new Date(),
        },
      ];

      const best = scoringEngine.selectBestAgent(candidates, context);
      expect(best).not.toBeNull();
      expect(best?.agent.userId).toBe('u3');
    });

    it('should select agent with higher skill match over generic agent with similar workload', () => {
      const candidates: CandidateAgent[] = [
        {
          id: 'p1',
          userId: 'u1',
          name: 'Generalist',
          email: 'gen@test.com',
          departmentId: 'dept-1',
          skills: [],
          availabilityStatus: AvailabilityStatus.AVAILABLE,
          maxWorkload: 5,
          currentWorkload: 0, // workload = 1.0, skill = 0.1 => 0.4*0.1 + 0.35*1.0 + 0.25*1.0 = 0.04 + 0.35 + 0.25 = 0.64
          updatedAt: new Date(),
        },
        {
          id: 'p2',
          userId: 'u2',
          name: 'Expert',
          email: 'exp@test.com',
          departmentId: 'dept-1',
          skills: ['double_charge'],
          availabilityStatus: AvailabilityStatus.AVAILABLE,
          maxWorkload: 5,
          currentWorkload: 1, // workload = 0.8, skill = 1.0 => 0.4*1.0 + 0.35*0.8 + 0.25*1.0 = 0.40 + 0.28 + 0.25 = 0.93
          updatedAt: new Date(),
        },
      ];

      const best = scoringEngine.selectBestAgent(candidates, context);
      expect(best?.agent.userId).toBe('u2');
    });

    it('should break ties deterministically by lower current workload count', () => {
      const candidates: CandidateAgent[] = [
        {
          id: 'p1',
          userId: 'u1',
          name: 'Agent A',
          email: 'a@test.com',
          departmentId: 'dept-1',
          skills: ['PAYMENT'],
          availabilityStatus: AvailabilityStatus.AVAILABLE,
          maxWorkload: 10,
          currentWorkload: 2, // 20%
          updatedAt: new Date(),
        },
        {
          id: 'p2',
          userId: 'u2',
          name: 'Agent B',
          email: 'b@test.com',
          departmentId: 'dept-1',
          skills: ['PAYMENT'],
          availabilityStatus: AvailabilityStatus.AVAILABLE,
          maxWorkload: 5,
          currentWorkload: 1, // 20% - same percentage and composite score!
          updatedAt: new Date(),
        },
      ];

      const best = scoringEngine.selectBestAgent(candidates, context);
      // Both have identical workload score (0.8), identical skill score (0.8), identical availability (1.0)
      // Agent B has lower absolute currentWorkload (1 vs 2) -> Agent B wins!
      expect(best?.agent.userId).toBe('u2');
    });

    it('should break ties deterministically by lexicographical userId when scores and workloads are identical', () => {
      const fixedTime = new Date('2026-01-01T10:00:00Z');
      const candidates: CandidateAgent[] = [
        {
          id: 'p-b',
          userId: 'user-bbb',
          name: 'Agent B',
          email: 'b@test.com',
          departmentId: 'dept-1',
          skills: ['PAYMENT'],
          availabilityStatus: AvailabilityStatus.AVAILABLE,
          maxWorkload: 5,
          currentWorkload: 1,
          updatedAt: fixedTime,
        },
        {
          id: 'p-a',
          userId: 'user-aaa',
          name: 'Agent A',
          email: 'a@test.com',
          departmentId: 'dept-1',
          skills: ['PAYMENT'],
          availabilityStatus: AvailabilityStatus.AVAILABLE,
          maxWorkload: 5,
          currentWorkload: 1,
          updatedAt: fixedTime,
        },
      ];

      const best = scoringEngine.selectBestAgent(candidates, context);
      // 'user-aaa' comes before 'user-bbb' alphabetically
      expect(best?.agent.userId).toBe('user-aaa');
    });
  });
});
