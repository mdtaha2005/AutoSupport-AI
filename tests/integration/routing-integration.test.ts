import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { store, resetStore } from '../helpers/test-db.js';
import {
  UserRole,
  AvailabilityStatus,
  TicketPriority,
  TicketStatus,
  ActivityAction,
  TicketCategory,
  RoutingStatus,
  AssignmentType,
} from '@prisma/client';
import { signJwt } from '../../src/utils/jwt.js';
import { assignmentService } from '../../src/modules/routing/assignment.service.js';
import { reassignmentService } from '../../src/modules/routing/reassignment.service.js';
import { escalationService } from '../../src/modules/routing/escalation.service.js';
import { queueManager } from '../../src/modules/queues/queue.manager.js';
import { redisManager } from '../../src/config/redis.js';

vi.mock('../../src/config/prisma.js', async () => {
  const { mockPrisma } = await import('../helpers/test-db.js');
  return { prisma: mockPrisma };
});

describe('Phase 3: Intelligent Assignment & Workload Balancing Integration Tests', () => {
  let adminToken: string;
  let managerToken: string;
  let agent1Token: string;
  let customerToken: string;

  const adminId = '11111111-1111-1111-1111-111111111111';
  const managerId = '22222222-2222-2222-2222-222222222222';
  const agent1Id = '33333333-3333-3333-3333-333333333331';
  const agent2Id = '33333333-3333-3333-3333-333333333332';
  const agent3Id = '33333333-3333-3333-3333-333333333333';
  const customerId = '44444444-4444-4444-4444-444444444444';

  const billingDeptId = '55555555-5555-5555-5555-555555555551';
  const techDeptId = '55555555-5555-5555-5555-555555555552';

  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();

    adminToken = signJwt({
      id: adminId,
      email: 'admin@system.com',
      role: UserRole.ADMIN,
      name: 'System Admin',
    });

    managerToken = signJwt({
      id: managerId,
      email: 'manager@system.com',
      role: UserRole.MANAGER,
      name: 'Support Manager',
    });

    agent1Token = signJwt({
      id: agent1Id,
      email: 'agent1@system.com',
      role: UserRole.AGENT,
      name: 'Alice Agent',
    });

    customerToken = signJwt({
      id: customerId,
      email: 'customer@test.com',
      role: UserRole.CUSTOMER,
      name: 'Bob Customer',
    });

    // Populate Departments
    store.departments.push(
      {
        id: billingDeptId,
        name: 'Billing Support',
        description: 'Payment and refund processing',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: techDeptId,
        name: 'Technical Support',
        description: 'Bug fixing and technical issues',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    );

    // Populate Users
    store.users.push(
      { id: adminId, email: 'admin@system.com', name: 'System Admin', role: UserRole.ADMIN, isActive: true },
      { id: managerId, email: 'manager@system.com', name: 'Support Manager', role: UserRole.MANAGER, isActive: true },
      { id: agent1Id, email: 'agent1@system.com', name: 'Alice Billing Expert', role: UserRole.AGENT, isActive: true },
      { id: agent2Id, email: 'agent2@system.com', name: 'Charlie Billing Generalist', role: UserRole.AGENT, isActive: true },
      { id: agent3Id, email: 'agent3@system.com', name: 'Dave Tech Expert', role: UserRole.AGENT, isActive: true },
      { id: customerId, email: 'customer@test.com', name: 'Bob Customer', role: UserRole.CUSTOMER, isActive: true }
    );

    // Populate Agent Profiles
    // Alice: Billing Expert, Available, 1/5 workload
    store.agentProfiles.push({
      id: 'profile-agent-1',
      userId: agent1Id,
      departmentId: billingDeptId,
      skills: ['PAYMENT', 'double_charge', 'REFUND'],
      availabilityStatus: AvailabilityStatus.AVAILABLE,
      maxWorkload: 5,
      currentWorkload: 1,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    });

    // Charlie: Billing Generalist, Available, 2/5 workload
    store.agentProfiles.push({
      id: 'profile-agent-2',
      userId: agent2Id,
      departmentId: billingDeptId,
      skills: ['general_support'],
      availabilityStatus: AvailabilityStatus.AVAILABLE,
      maxWorkload: 5,
      currentWorkload: 2,
      createdAt: new Date('2026-01-02'),
      updatedAt: new Date('2026-01-02'),
    });

    // Dave: Tech Support Expert, Available, 0/5 workload
    store.agentProfiles.push({
      id: 'profile-agent-3',
      userId: agent3Id,
      departmentId: techDeptId,
      skills: ['TECHNICAL', 'bug_report', 'api_error'],
      availabilityStatus: AvailabilityStatus.AVAILABLE,
      maxWorkload: 5,
      currentWorkload: 0,
      createdAt: new Date('2026-01-03'),
      updatedAt: new Date('2026-01-03'),
    });
  });

  describe('1. Department Routing via NLP Category & Intent', () => {
    it('should route PAYMENT ticket to Billing Support and select highest scoring agent', async () => {
      const ticketId = '10000000-0000-0000-0000-000000000001';
      store.tickets.push({
        id: ticketId,
        ticketNumber: 5001,
        title: 'Charged twice on my credit card',
        description: 'Payment issue with invoice INV-10029',
        priority: TicketPriority.HIGH,
        status: TicketStatus.OPEN,
        category: TicketCategory.PAYMENT,
        needsHumanReview: false,
        customerId: customerId,
        departmentId: null, // Unassigned department
        assignedAgentId: null,
        isManuallyAssigned: false,
        routingStatus: RoutingStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Add NLP analysis
      store.ticketNlpAnalyses.push({
        id: 'nlp-analysis-1',
        ticketId,
        category: TicketCategory.PAYMENT,
        categoryConfidence: 0.95,
        intent: 'double_charge',
        intentConfidence: 0.92,
        priorityPredicted: TicketPriority.HIGH,
        priorityConfidence: 0.85,
        sentiment: 'NEGATIVE',
        sentimentScore: -0.5,
        urgencyDetected: false,
        extractedEntities: [],
        needsHumanReview: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const decision = await assignmentService.routeTicket(ticketId);

      expect(decision.selectedAgent).not.toBeNull();
      // Alice has exact skill match 'double_charge' + 'PAYMENT' in Billing Support
      expect(decision.selectedAgent?.userId).toBe(agent1Id);
      expect(decision.departmentId).toBe(billingDeptId);

      // Verify ticket state updated
      const ticket = store.tickets.find((t) => t.id === ticketId);
      expect(ticket.assignedAgentId).toBe(agent1Id);
      expect(ticket.departmentId).toBe(billingDeptId);
      expect(ticket.routingStatus).toBe(RoutingStatus.ASSIGNED);
      expect(ticket.assignedAt).toBeDefined();

      // Verify Alice workload incremented from 1 to 2
      const aliceProfile = store.agentProfiles.find((p) => p.userId === agent1Id);
      expect(aliceProfile.currentWorkload).toBe(2);

      // Verify assignment history recorded
      expect(store.ticketAssignmentHistories.length).toBe(1);
      const history = store.ticketAssignmentHistories[0];
      expect(history.ticketId).toBe(ticketId);
      expect(history.newAgentId).toBe(agent1Id);
      expect(history.assignmentType).toBe(AssignmentType.AUTOMATED);

      // Verify activity audit log recorded
      const activity = store.ticketActivities.find(
        (a) => a.ticketId === ticketId && a.action === ActivityAction.TICKET_ROUTED
      );
      expect(activity).toBeDefined();
    });

    it('should route TECHNICAL ticket to Technical Support department', async () => {
      const ticketId = '10000000-0000-0000-0000-000000000002';
      store.tickets.push({
        id: ticketId,
        ticketNumber: 5002,
        title: 'API endpoint throwing 500 server crash',
        description: 'Server crash on /checkout',
        priority: TicketPriority.HIGH,
        status: TicketStatus.OPEN,
        category: TicketCategory.TECHNICAL,
        needsHumanReview: false,
        customerId: customerId,
        departmentId: null,
        assignedAgentId: null,
        isManuallyAssigned: false,
        routingStatus: RoutingStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const decision = await assignmentService.routeTicket(ticketId);

      expect(decision.selectedAgent).not.toBeNull();
      expect(decision.selectedAgent?.userId).toBe(agent3Id); // Dave in Technical Support
      expect(decision.departmentId).toBe(techDeptId);
    });

    it('should respect explicitly specified department over inferred category', async () => {
      const ticketId = '10000000-0000-0000-0000-000000000003';
      store.tickets.push({
        id: ticketId,
        ticketNumber: 5003,
        title: 'Specialized request',
        description: 'Assigned explicitly to Technical Support',
        priority: TicketPriority.MEDIUM,
        status: TicketStatus.OPEN,
        category: TicketCategory.PAYMENT, // category suggests Billing, but departmentId is explicitly Tech
        needsHumanReview: false,
        customerId: customerId,
        departmentId: techDeptId, // Explicitly specified
        assignedAgentId: null,
        isManuallyAssigned: false,
        routingStatus: RoutingStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const decision = await assignmentService.routeTicket(ticketId);

      expect(decision.departmentId).toBe(techDeptId);
      expect(decision.selectedAgent?.userId).toBe(agent3Id);
    });
  });

  describe('2. Workload Balancing & Skill-Weighted Selection', () => {
    it('should balance workload by choosing the agent with lower workload when skills are comparable', async () => {
      // Modify Charlie to also have PAYMENT skill, but with lower workload (1) than Alice (3)
      const alice = store.agentProfiles.find((p) => p.userId === agent1Id);
      alice.currentWorkload = 3; // 60% capacity

      const charlie = store.agentProfiles.find((p) => p.userId === agent2Id);
      charlie.skills = ['PAYMENT'];
      charlie.currentWorkload = 1; // 20% capacity

      const ticketId = '10000000-0000-0000-0000-000000000004';
      store.tickets.push({
        id: ticketId,
        ticketNumber: 5004,
        title: 'Billing question',
        description: 'General payment inquiry',
        priority: TicketPriority.MEDIUM,
        status: TicketStatus.OPEN,
        category: TicketCategory.PAYMENT,
        needsHumanReview: false,
        customerId: customerId,
        departmentId: billingDeptId,
        assignedAgentId: null,
        isManuallyAssigned: false,
        routingStatus: RoutingStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const decision = await assignmentService.routeTicket(ticketId);

      // Charlie has identical skill match (0.8) but lower workload (0.8 workload score vs Alice 0.4)
      expect(decision.selectedAgent?.userId).toBe(agent2Id);
      expect(decision.scores?.workloadScore).toBe(0.8);
    });
  });

  describe('3. Availability & Capacity Boundaries', () => {
    it('should NEVER assign an agent whose status is OFFLINE', async () => {
      // Set Alice and Charlie to OFFLINE
      const alice = store.agentProfiles.find((p) => p.userId === agent1Id);
      alice.availabilityStatus = AvailabilityStatus.OFFLINE;

      const charlie = store.agentProfiles.find((p) => p.userId === agent2Id);
      charlie.availabilityStatus = AvailabilityStatus.OFFLINE;

      const ticketId = '10000000-0000-0000-0000-000000000005';
      store.tickets.push({
        id: ticketId,
        ticketNumber: 5005,
        title: 'Billing problem while team is offline',
        description: 'Payment issue',
        priority: TicketPriority.HIGH,
        status: TicketStatus.OPEN,
        category: TicketCategory.PAYMENT,
        needsHumanReview: false,
        customerId: customerId,
        departmentId: billingDeptId,
        assignedAgentId: null,
        isManuallyAssigned: false,
        routingStatus: RoutingStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const decision = await assignmentService.routeTicket(ticketId);

      expect(decision.selectedAgent).toBeNull();
      expect(decision.isFallback).toBe(true);

      const ticket = store.tickets.find((t) => t.id === ticketId);
      expect(ticket.routingStatus).toBe(RoutingStatus.FAILED);

      // Verify ROUTING_FAILED activity logged
      const activity = store.ticketActivities.find(
        (a) => a.ticketId === ticketId && a.action === ActivityAction.ROUTING_FAILED
      );
      expect(activity).toBeDefined();
    });

    it('should NEVER assign an agent whose current workload is at maxWorkload', async () => {
      // Max out Alice and Charlie
      const alice = store.agentProfiles.find((p) => p.userId === agent1Id);
      alice.currentWorkload = 5; // 5/5

      const charlie = store.agentProfiles.find((p) => p.userId === agent2Id);
      charlie.currentWorkload = 5; // 5/5

      const ticketId = '10000000-0000-0000-0000-000000000006';
      store.tickets.push({
        id: ticketId,
        ticketNumber: 5006,
        title: 'Over capacity ticket',
        description: 'Payment issue',
        priority: TicketPriority.HIGH,
        status: TicketStatus.OPEN,
        category: TicketCategory.PAYMENT,
        needsHumanReview: false,
        customerId: customerId,
        departmentId: billingDeptId,
        assignedAgentId: null,
        isManuallyAssigned: false,
        routingStatus: RoutingStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const decision = await assignmentService.routeTicket(ticketId);

      expect(decision.selectedAgent).toBeNull();
      const ticket = store.tickets.find((t) => t.id === ticketId);
      expect(ticket.routingStatus).toBe(RoutingStatus.FAILED);
    });
  });

  describe('4. Concurrency Guard & Over-Allocation Prevention', () => {
    it('should prevent agent workload from exceeding maxWorkload when concurrent assignments compete for last capacity slot', async () => {
      // Alice has only 1 capacity slot left (4/5)
      const alice = store.agentProfiles.find((p) => p.userId === agent1Id);
      alice.currentWorkload = 4;
      alice.maxWorkload = 5;

      // Set Charlie OFFLINE so both tickets compete for Alice
      const charlie = store.agentProfiles.find((p) => p.userId === agent2Id);
      charlie.availabilityStatus = AvailabilityStatus.OFFLINE;

      const ticketAId = '10000000-0000-0000-0000-000000000007';
      const ticketBId = '10000000-0000-0000-0000-000000000008';

      store.tickets.push(
        {
          id: ticketAId,
          ticketNumber: 5007,
          title: 'Concurrent ticket A',
          description: 'Payment A',
          priority: TicketPriority.HIGH,
          status: TicketStatus.OPEN,
          category: TicketCategory.PAYMENT,
          needsHumanReview: false,
          customerId: customerId,
          departmentId: billingDeptId,
          assignedAgentId: null,
          isManuallyAssigned: false,
          routingStatus: RoutingStatus.PENDING,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: ticketBId,
          ticketNumber: 5008,
          title: 'Concurrent ticket B',
          description: 'Payment B',
          priority: TicketPriority.HIGH,
          status: TicketStatus.OPEN,
          category: TicketCategory.PAYMENT,
          needsHumanReview: false,
          customerId: customerId,
          departmentId: billingDeptId,
          assignedAgentId: null,
          isManuallyAssigned: false,
          routingStatus: RoutingStatus.PENDING,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );

      // Ticket A routes first and takes the 5th slot
      const decisionA = await assignmentService.routeTicket(ticketAId);
      expect(decisionA.selectedAgent?.userId).toBe(agent1Id);
      expect(alice.currentWorkload).toBe(5);

      // Ticket B attempts to route - Alice is now at 5/5, so decisionB cannot assign Alice
      const decisionB = await assignmentService.routeTicket(ticketBId);
      expect(decisionB.selectedAgent).toBeNull();
      // Workload must strictly remain 5, never 6!
      expect(alice.currentWorkload).toBe(5);
    });
  });

  describe('5. Manual Assignment Protection (Manager Override)', () => {
    let testTicketId: string;

    beforeEach(() => {
      testTicketId = '10000000-0000-0000-0000-000000000009';
      store.tickets.push({
        id: testTicketId,
        ticketNumber: 5009,
        title: 'High profile VIP client ticket',
        description: 'Payment inquiry for enterprise client',
        priority: TicketPriority.URGENT,
        status: TicketStatus.OPEN,
        category: TicketCategory.PAYMENT,
        needsHumanReview: false,
        customerId: customerId,
        departmentId: billingDeptId,
        assignedAgentId: null,
        isManuallyAssigned: false,
        routingStatus: RoutingStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('should set isManuallyAssigned = true and record manual assignment history when manager assigns ticket', async () => {
      const res = await request(app)
        .post(`/api/v1/tickets/${testTicketId}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          agentId: agent2Id, // Manager assigns Charlie manually
          reason: 'Manager direct intervention for VIP client',
        });

      expect(res.status).toBe(200);

      const ticket = store.tickets.find((t) => t.id === testTicketId);
      expect(ticket.assignedAgentId).toBe(agent2Id);
      expect(ticket.isManuallyAssigned).toBe(true);
      expect(ticket.routingStatus).toBe(RoutingStatus.ASSIGNED);

      // Verify manual assignment history
      const history = store.ticketAssignmentHistories.find((h) => h.ticketId === testTicketId);
      expect(history).toBeDefined();
      expect(history.newAgentId).toBe(agent2Id);
      expect(history.assignmentType).toBe(AssignmentType.MANUAL);
      expect(history.assignedById).toBe(managerId);
    });

    it('should STRICTLY FORBID automated routing jobs from overwriting manual assignments', async () => {
      // Mark ticket as manually assigned to Charlie
      const ticket = store.tickets.find((t) => t.id === testTicketId);
      ticket.assignedAgentId = agent2Id;
      ticket.isManuallyAssigned = true;
      ticket.routingStatus = RoutingStatus.ASSIGNED;

      // Run automated routing
      const decision = await assignmentService.routeTicket(testTicketId);

      // Automated routing must abort and return null selectedAgent
      expect(decision.selectedAgent).toBeNull();
      expect(decision.reason).toContain('manually assigned');

      // Charlie remains assigned; Alice (higher score) does NOT overwrite him
      expect(ticket.assignedAgentId).toBe(agent2Id);
    });

    it('should allow manager to trigger manual intelligent re-routing via POST /api/v1/tickets/:id/route', async () => {
      const res = await request(app)
        .post(`/api/v1/tickets/${testTicketId}/route`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.assignedAgentId).toBe(agent1Id); // Alice selected
    });
  });

  describe('6. Automated Reassignment When Agent Becomes Unavailable', () => {
    it('should automatically reassign active tickets when an agent status changes to OFFLINE', async () => {
      const activeTicket1Id = '10000000-0000-0000-0000-000000000010';
      const activeTicket2Id = '10000000-0000-0000-0000-000000000011';

      // Assign two automated tickets to Charlie
      store.tickets.push(
        {
          id: activeTicket1Id,
          ticketNumber: 5010,
          title: 'Ticket for Charlie 1',
          description: 'Payment issue 1',
          priority: TicketPriority.MEDIUM,
          status: TicketStatus.IN_PROGRESS,
          category: TicketCategory.PAYMENT,
          needsHumanReview: false,
          customerId: customerId,
          departmentId: billingDeptId,
          assignedAgentId: agent2Id, // Charlie
          isManuallyAssigned: false, // Automated
          routingStatus: RoutingStatus.ASSIGNED,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: activeTicket2Id,
          ticketNumber: 5011,
          title: 'Ticket for Charlie 2',
          description: 'Payment issue 2',
          priority: TicketPriority.MEDIUM,
          status: TicketStatus.IN_PROGRESS,
          category: TicketCategory.PAYMENT,
          needsHumanReview: false,
          customerId: customerId,
          departmentId: billingDeptId,
          assignedAgentId: agent2Id, // Charlie
          isManuallyAssigned: false, // Automated
          routingStatus: RoutingStatus.ASSIGNED,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );

      // Charlie currently has workload 2
      const charlie = store.agentProfiles.find((p) => p.userId === agent2Id);
      charlie.currentWorkload = 2;

      // Alice currently has workload 1
      const alice = store.agentProfiles.find((p) => p.userId === agent1Id);
      alice.currentWorkload = 1;

      // Charlie goes OFFLINE
      const reassignmentResult = await reassignmentService.reassignAgentTickets(
        agent2Id,
        'Agent took emergency leave'
      );

      expect(reassignmentResult.totalActiveTickets).toBe(2);
      expect(reassignmentResult.reassignedCount).toBe(2);

      // Both tickets re-routed to Alice
      const ticket1 = store.tickets.find((t) => t.id === activeTicket1Id);
      const ticket2 = store.tickets.find((t) => t.id === activeTicket2Id);
      expect(ticket1.assignedAgentId).toBe(agent1Id);
      expect(ticket2.assignedAgentId).toBe(agent1Id);

      // Alice workload increased by 2 (1 + 2 = 3)
      expect(alice.currentWorkload).toBe(3);
      // Charlie workload decremented to 0
      expect(charlie.currentWorkload).toBe(0);

      // Assignment history records REASSIGNMENT with previous and new agents
      const histories = store.ticketAssignmentHistories.filter(
        (h) => h.ticketId === activeTicket1Id || h.ticketId === activeTicket2Id
      );
      expect(histories.length).toBe(2);
      expect(histories[0].previousAgentId).toBe(agent2Id);
      expect(histories[0].newAgentId).toBe(agent1Id);
      expect(histories[0].assignmentType).toBe(AssignmentType.REASSIGNMENT);
    });

    it('should NOT automatically reassign manually assigned tickets when agent goes OFFLINE', async () => {
      const manualTicketId = '10000000-0000-0000-0000-000000000012';
      store.tickets.push({
        id: manualTicketId,
        ticketNumber: 5012,
        title: 'Manually assigned to Charlie',
        description: 'Payment issue',
        priority: TicketPriority.HIGH,
        status: TicketStatus.IN_PROGRESS,
        category: TicketCategory.PAYMENT,
        needsHumanReview: false,
        customerId: customerId,
        departmentId: billingDeptId,
        assignedAgentId: agent2Id,
        isManuallyAssigned: true, // Manual!
        routingStatus: RoutingStatus.ASSIGNED,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await reassignmentService.reassignAgentTickets(agent2Id, 'Agent OFFLINE');

      expect(result.skippedManualCount).toBe(1);
      expect(result.reassignedCount).toBe(0);

      // Ticket remains with Charlie for manual managerial review
      const ticket = store.tickets.find((t) => t.id === manualTicketId);
      expect(ticket.assignedAgentId).toBe(agent2Id);
    });
  });

  describe('7. Priority-Aware Escalation', () => {
    it('should escalate priority and escalationLevel and log TICKET_ESCALATED', async () => {
      const ticketId = '10000000-0000-0000-0000-000000000013';
      store.tickets.push({
        id: ticketId,
        ticketNumber: 5013,
        title: 'Unassigned ticket approaching SLA',
        description: 'Needs urgent attention',
        priority: TicketPriority.MEDIUM,
        status: TicketStatus.OPEN,
        category: TicketCategory.PAYMENT,
        needsHumanReview: false,
        customerId: customerId,
        departmentId: billingDeptId,
        assignedAgentId: null,
        isManuallyAssigned: false,
        routingStatus: RoutingStatus.PENDING,
        escalationLevel: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await escalationService.escalateTicket(ticketId, 'SLA 4-hour window breached');

      expect(result).not.toBeNull();
      expect(result?.previousPriority).toBe(TicketPriority.MEDIUM);
      expect(result?.newPriority).toBe(TicketPriority.HIGH);
      expect(result?.escalationLevel).toBe(1);

      const ticket = store.tickets.find((t) => t.id === ticketId);
      expect(ticket.priority).toBe(TicketPriority.HIGH);
      expect(ticket.escalationLevel).toBe(1);
      expect(ticket.escalatedAt).toBeDefined();

      // Check activity log
      const activity = store.ticketActivities.find(
        (a) => a.ticketId === ticketId && a.action === ActivityAction.TICKET_ESCALATED
      );
      expect(activity).toBeDefined();
    });
  });

  describe('8. Redis Resilience & Graceful Queue Fallback', () => {
    it('should execute synchronous routing fallback without crashing when Redis is unavailable', async () => {
      // Simulate Redis being unavailable
      vi.spyOn(redisManager, 'isAvailable').mockReturnValue(false);

      const ticketId = '10000000-0000-0000-0000-000000000014';
      store.tickets.push({
        id: ticketId,
        ticketNumber: 5014,
        title: 'Ticket submitted during Redis outage',
        description: 'Payment invoice check',
        priority: TicketPriority.MEDIUM,
        status: TicketStatus.OPEN,
        category: TicketCategory.PAYMENT,
        needsHumanReview: false,
        customerId: customerId,
        departmentId: billingDeptId,
        assignedAgentId: null,
        isManuallyAssigned: false,
        routingStatus: RoutingStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Enqueue assignment - should execute synchronous fallback
      await queueManager.enqueueAssignment(ticketId);

      const ticket = store.tickets.find((t) => t.id === ticketId);
      // Synchronous fallback must have assigned the ticket
      expect(ticket.assignedAgentId).toBe(agent1Id);
      expect(ticket.routingStatus).toBe(RoutingStatus.ASSIGNED);
    });
  });
});
