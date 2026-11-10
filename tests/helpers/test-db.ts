import { vi } from 'vitest';
import {
  UserRole,
  AvailabilityStatus,
  TicketPriority,
  TicketStatus,
  ActivityAction,
} from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

export interface MockDataStore {
  users: any[];
  agentProfiles: any[];
  departments: any[];
  tickets: any[];
  ticketComments: any[];
  ticketActivities: any[];
  ticketNlpAnalyses: any[];
  ticketAssignmentHistories: any[];
  ticketEmbeddings: any[];
}

export const store: MockDataStore = {
  users: [],
  agentProfiles: [],
  departments: [],
  tickets: [],
  ticketComments: [],
  ticketActivities: [],
  ticketNlpAnalyses: [],
  ticketAssignmentHistories: [],
  ticketEmbeddings: [],
};

export function resetStore(): void {
  store.users = [];
  store.agentProfiles = [];
  store.departments = [];
  store.tickets = [];
  store.ticketComments = [];
  store.ticketActivities = [];
  store.ticketNlpAnalyses = [];
  store.ticketAssignmentHistories = [];
  store.ticketEmbeddings = [];
  ticketCounter = 1000;
}

let ticketCounter = 1000;

export const mockPrisma = {
  $connect: vi.fn().mockResolvedValue(undefined),
  $disconnect: vi.fn().mockResolvedValue(undefined),
  $on: vi.fn(),

  user: {
    findUnique: vi.fn(async ({ where, include }: any) => {
      const user = store.users.find((u) => {
        if (where.id) return u.id === where.id;
        if (where.email) return u.email.toLowerCase() === where.email.toLowerCase();
        return false;
      });
      if (!user) return null;

      const res = { ...user };
      if (include?.agentProfile) {
        const profile = store.agentProfiles.find((p) => p.userId === user.id);
        if (profile) {
          res.agentProfile = { ...profile };
          if (include.agentProfile.include?.department && profile.departmentId) {
            res.agentProfile.department = store.departments.find(
              (d) => d.id === profile.departmentId
            );
          }
        } else {
          res.agentProfile = null;
        }
      }
      return res;
    }),

    findMany: vi.fn(async () => [...store.users]),

    create: vi.fn(async ({ data }: any) => {
      const newUser = {
        id: data.id || uuidv4(),
        email: data.email,
        passwordHash: data.passwordHash,
        name: data.name,
        role: data.role || UserRole.AGENT,
        isActive: data.isActive !== undefined ? data.isActive : true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.users.push(newUser);
      return { ...newUser };
    }),

    update: vi.fn(async ({ where, data }: any) => {
      const index = store.users.findIndex((u) => u.id === where.id);
      if (index === -1) throw new Error('User not found');
      store.users[index] = { ...store.users[index], ...data, updatedAt: new Date() };
      return { ...store.users[index] };
    }),
  },

  agentProfile: {
    findUnique: vi.fn(async ({ where }: any) => {
      return store.agentProfiles.find((p) => p.id === where.id || p.userId === where.userId) || null;
    }),

    findFirst: vi.fn(async ({ where, include }: any) => {
      const p = store.agentProfiles.find((item) => {
        if (where.OR) {
          return where.OR.some((cond: any) => cond.id === item.id || cond.userId === item.userId);
        }
        if (where.id) return item.id === where.id;
        if (where.userId) return item.userId === where.userId;
        return false;
      });
      if (!p) return null;

      const res = { ...p };
      if (include?.user) {
        res.user = store.users.find((u) => u.id === p.userId);
      }
      if (include?.department && p.departmentId) {
        res.department = store.departments.find((d) => d.id === p.departmentId);
      }
      return res;
    }),

    findMany: vi.fn(async ({ where, include }: any = {}) => {
      let profiles = [...store.agentProfiles];
      if (where?.departmentId) {
        profiles = profiles.filter((p) => p.departmentId === where.departmentId);
      }
      if (where?.availabilityStatus) {
        profiles = profiles.filter((p) => p.availabilityStatus === where.availabilityStatus);
      }
      if (where?.user?.isActive !== undefined) {
        profiles = profiles.filter((p) => {
          const user = store.users.find((u) => u.id === p.userId);
          return user ? user.isActive === where.user.isActive : false;
        });
      }
      return profiles.map((p) => ({
        ...p,
        user: store.users.find((u) => u.id === p.userId) || null,
        department: store.departments.find((d) => d.id === p.departmentId) || null,
      }));
    }),

    count: vi.fn(async () => store.agentProfiles.length),

    create: vi.fn(async ({ data }: any) => {
      const newProfile = {
        id: data.id || uuidv4(),
        userId: data.userId,
        departmentId: data.departmentId || null,
        skills: data.skills || [],
        availabilityStatus: data.availabilityStatus || AvailabilityStatus.OFFLINE,
        maxWorkload: data.maxWorkload || 5,
        currentWorkload: data.currentWorkload || 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.agentProfiles.push(newProfile);
      return { ...newProfile };
    }),

    update: vi.fn(async ({ where, data }: any) => {
      const index = store.agentProfiles.findIndex(
        (p) => p.id === where.id || p.userId === where.userId
      );
      if (index === -1) throw new Error('Agent profile not found');

      const current = store.agentProfiles[index];
      const updated = {
        ...current,
        ...data,
        currentWorkload:
          data.currentWorkload?.increment !== undefined
            ? current.currentWorkload + data.currentWorkload.increment
            : data.currentWorkload?.decrement !== undefined
            ? Math.max(0, current.currentWorkload - data.currentWorkload.decrement)
            : data.currentWorkload !== undefined
            ? data.currentWorkload
            : current.currentWorkload,
        updatedAt: new Date(),
      };
      store.agentProfiles[index] = updated;
      return {
        ...updated,
        user: store.users.find((u) => u.id === updated.userId),
        department: store.departments.find((d) => d.id === updated.departmentId) || null,
      };
    }),

    updateMany: vi.fn(async ({ where, data }: any) => {
      let count = 0;
      store.agentProfiles.forEach((p, idx) => {
        const matchesId = where.id ? p.id === where.id : true;
        const matchesUser = where.userId ? p.userId === where.userId : true;

        if (matchesId && matchesUser) {
          const current = store.agentProfiles[idx];

          // Check conditional guards if specified
          if (where.currentWorkload?.lt !== undefined && current.currentWorkload >= where.currentWorkload.lt) {
            return;
          }
          if (where.currentWorkload?.gt !== undefined && current.currentWorkload <= where.currentWorkload.gt) {
            return;
          }

          let newWorkload = current.currentWorkload;
          if (data.currentWorkload?.increment !== undefined) {
            newWorkload = current.currentWorkload + data.currentWorkload.increment;
          } else if (data.currentWorkload?.decrement !== undefined) {
            newWorkload = Math.max(0, current.currentWorkload - data.currentWorkload.decrement);
          } else if (data.currentWorkload !== undefined) {
            newWorkload = data.currentWorkload;
          }

          Object.assign(current, data, {
            currentWorkload: newWorkload,
            updatedAt: new Date(),
          });
          count++;
        }
      });
      return { count };
    }),
  },

  department: {
    findUnique: vi.fn(async ({ where }: any) => {
      return (
        store.departments.find(
          (d) => (where.id && d.id === where.id) || (where.name && d.name.toLowerCase() === where.name.toLowerCase())
        ) || null
      );
    }),

    findFirst: vi.fn(async ({ where }: any = {}) => {
      return (
        store.departments.find((d) => {
          if (where.isActive !== undefined && d.isActive !== where.isActive) return false;
          if (where.name) {
            const targetName = typeof where.name === 'string' ? where.name : where.name.equals;
            if (targetName && d.name.toLowerCase() === targetName.toLowerCase()) {
              if (where.NOT?.id && d.id === where.NOT.id) return false;
              return true;
            }
            return false;
          }
          return true;
        }) || null
      );
    }),

    findMany: vi.fn(async () => {
      return store.departments.map((d) => ({
        ...d,
        _count: {
          agents: store.agentProfiles.filter((a) => a.departmentId === d.id).length,
          tickets: store.tickets.filter((t) => t.departmentId === d.id).length,
        },
      }));
    }),

    create: vi.fn(async ({ data }: any) => {
      const newDept = {
        id: data.id || uuidv4(),
        name: data.name,
        description: data.description || null,
        isActive: data.isActive !== undefined ? data.isActive : true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.departments.push(newDept);
      return { ...newDept };
    }),

    update: vi.fn(async ({ where, data }: any) => {
      const index = store.departments.findIndex((d) => d.id === where.id);
      if (index === -1) throw new Error('Department not found');
      store.departments[index] = { ...store.departments[index], ...data, updatedAt: new Date() };
      return { ...store.departments[index] };
    }),
  },

  ticket: {
    count: vi.fn(async ({ where }: any = {}) => {
      let tickets = store.tickets;
      if (where?.status) tickets = tickets.filter((t) => t.status === where.status);
      if (where?.priority) tickets = tickets.filter((t) => t.priority === where.priority);
      if (where?.category) tickets = tickets.filter((t) => t.category === where.category);
      if (where?.needsHumanReview !== undefined) tickets = tickets.filter((t) => t.needsHumanReview === where.needsHumanReview);
      return tickets.length;
    }),

    findUnique: vi.fn(async ({ where, include }: any) => {
      const ticket = store.tickets.find((t) => t.id === where.id || t.ticketNumber === where.ticketNumber);
      if (!ticket) return null;

      const res = { ...ticket };
      if (include?.department && ticket.departmentId) {
        res.department = store.departments.find((d) => d.id === ticket.departmentId) || null;
      }
      if (include?.assignedAgent && ticket.assignedAgentId) {
        const user = store.users.find((u) => u.id === ticket.assignedAgentId);
        res.assignedAgent = user
          ? {
              ...user,
              agentProfile: store.agentProfiles.find((p) => p.userId === user.id) || null,
            }
          : null;
      }
      if (include?.customer && ticket.customerId) {
        res.customer = store.users.find((u) => u.id === ticket.customerId) || null;
      }
      if (include?.nlpAnalysis) {
        res.nlpAnalysis = store.ticketNlpAnalyses.find((a) => a.ticketId === ticket.id) || null;
      }
      if (include?.comments) {
        res.comments = store.ticketComments
          .filter((c) => c.ticketId === ticket.id)
          .map((c) => ({
            ...c,
            author: store.users.find((u) => u.id === c.authorId) || null,
          }));
      }
      if (include?.activities) {
        res.activities = store.ticketActivities
          .filter((a) => a.ticketId === ticket.id)
          .map((a) => ({
            ...a,
            actor: store.users.find((u) => u.id === a.actorId) || null,
          }));
      }
      if (include?.assignmentHistory) {
        res.assignmentHistory = store.ticketAssignmentHistories
          .filter((h) => h.ticketId === ticket.id)
          .map((h) => ({
            ...h,
            previousAgent: store.users.find((u) => u.id === h.previousAgentId) || null,
            newAgent: store.users.find((u) => u.id === h.newAgentId) || null,
            assignedBy: store.users.find((u) => u.id === h.assignedById) || null,
          }));
      }
      return res;
    }),

    findMany: vi.fn(async ({ where, include }: any = {}) => {
      let items = [...store.tickets];

      if (where?.id?.in) {
        items = items.filter((t) => where.id.in.includes(t.id));
      } else if (where?.id) {
        items = items.filter((t) => t.id === where.id);
      }

      if (where?.status?.in) {
        items = items.filter((t) => where.status.in.includes(t.status));
      } else if (where?.status) {
        items = items.filter((t) => t.status === where.status);
      }

      if (where?.priority?.in) {
        items = items.filter((t) => where.priority.in.includes(t.priority));
      } else if (where?.priority) {
        items = items.filter((t) => t.priority === where.priority);
      }

      if (where?.category?.in) {
        items = items.filter((t) => where.category.in.includes(t.category));
      } else if (where?.category) {
        items = items.filter((t) => t.category === where.category);
      }

      if (where?.needsHumanReview !== undefined) {
        items = items.filter((t) => t.needsHumanReview === where.needsHumanReview);
      }
      if (where?.departmentId) {
        items = items.filter((t) => t.departmentId === where.departmentId);
      }
      if (where?.assignedAgentId?.not === null) {
        items = items.filter((t) => t.assignedAgentId !== null);
      } else if (where?.assignedAgentId) {
        items = items.filter((t) => t.assignedAgentId === where.assignedAgentId);
      }
      if (where?.customerId) {
        items = items.filter((t) => t.customerId === where.customerId);
      }

      if (where?.resolvedAt?.not === null) {
        items = items.filter((t) => t.resolvedAt !== null);
      }

      return items.map((t) => ({
        ...t,
        department: store.departments.find((d) => d.id === t.departmentId) || null,
        assignedAgent: store.users.find((u) => u.id === t.assignedAgentId) || null,
        customer: store.users.find((u) => u.id === t.customerId) || null,
        nlpAnalysis: store.ticketNlpAnalyses.find((a) => a.ticketId === t.id) || null,
        comments: store.ticketComments.filter((c) => c.ticketId === t.id),
        embedding: store.ticketEmbeddings.find((e) => e.ticketId === t.id) || null,
        _count: {
          comments: store.ticketComments.filter((c) => c.ticketId === t.id).length,
          activities: store.ticketActivities.filter((a) => a.ticketId === t.id).length,
        },
      }));
    }),

    create: vi.fn(async ({ data }: any) => {
      const newTicket = {
        id: data.id || uuidv4(),
        ticketNumber: ++ticketCounter,
        title: data.title,
        description: data.description,
        priority: data.priority || TicketPriority.MEDIUM,
        category: data.category || 'OTHER',
        needsHumanReview: data.needsHumanReview || false,
        status: data.status || TicketStatus.OPEN,
        routingStatus: data.routingStatus || 'PENDING',
        isManuallyAssigned: data.isManuallyAssigned || false,
        assignedAt: data.assignedAt || null,
        escalatedAt: data.escalatedAt || null,
        escalationLevel: data.escalationLevel || 0,
        customerId: data.customerId || null,
        customerName: data.customerName || null,
        customerEmail: data.customerEmail || null,
        departmentId: data.departmentId || null,
        assignedAgentId: data.assignedAgentId || null,
        resolvedAt: null,
        closedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.tickets.push(newTicket);
      return {
        ...newTicket,
        department: store.departments.find((d) => d.id === newTicket.departmentId) || null,
        assignedAgent: store.users.find((u) => u.id === newTicket.assignedAgentId) || null,
        nlpAnalysis: null,
      };
    }),

    update: vi.fn(async ({ where, data, include }: any) => {
      const index = store.tickets.findIndex((t) => t.id === where.id);
      if (index === -1) throw new Error('Ticket not found');
      store.tickets[index] = { ...store.tickets[index], ...data, updatedAt: new Date() };
      const updated = store.tickets[index];

      const res = { ...updated };
      if (include?.department && updated.departmentId) {
        res.department = store.departments.find((d) => d.id === updated.departmentId);
      }
      if (include?.assignedAgent && updated.assignedAgentId) {
        res.assignedAgent = store.users.find((u) => u.id === updated.assignedAgentId);
      }
      if (include?.nlpAnalysis) {
        res.nlpAnalysis = store.ticketNlpAnalyses.find((a) => a.ticketId === updated.id) || null;
      }
      if (include?.assignmentHistory) {
        res.assignmentHistory = store.ticketAssignmentHistories
          .filter((h) => h.ticketId === updated.id)
          .map((h) => ({
            ...h,
            previousAgent: store.users.find((u) => u.id === h.previousAgentId) || null,
            newAgent: store.users.find((u) => u.id === h.newAgentId) || null,
            assignedBy: store.users.find((u) => u.id === h.assignedById) || null,
          }));
      }
      return res;
    }),
  },

  ticketAssignmentHistory: {
    create: vi.fn(async ({ data }: any) => {
      const newHistory = {
        id: data.id || uuidv4(),
        ticketId: data.ticketId,
        previousAgentId: data.previousAgentId || null,
        newAgentId: data.newAgentId,
        assignedById: data.assignedById || null,
        assignmentType: data.assignmentType || 'AUTOMATED',
        reason: data.reason || null,
        score: data.score || null,
        createdAt: new Date(),
      };
      store.ticketAssignmentHistories.push(newHistory);
      return { ...newHistory };
    }),

    findMany: vi.fn(async ({ where }: any = {}) => {
      let list = [...store.ticketAssignmentHistories];
      if (where?.ticketId) list = list.filter((h) => h.ticketId === where.ticketId);
      return list;
    }),
  },

  ticketNlpAnalysis: {
    findUnique: vi.fn(async ({ where }: any) => {
      return store.ticketNlpAnalyses.find((a) => a.id === where.id || a.ticketId === where.ticketId) || null;
    }),

    create: vi.fn(async ({ data }: any) => {
      const newAnalysis = {
        id: data.id || uuidv4(),
        ticketId: data.ticketId,
        category: data.category,
        categoryConfidence: data.categoryConfidence,
        intent: data.intent || data.detectedIntent,
        intentConfidence: data.intentConfidence,
        priorityPredicted: data.priorityPredicted || data.predictedPriority,
        priorityConfidence: data.priorityConfidence || 0.9,
        sentiment: data.sentiment || data.sentimentLabel,
        sentimentScore: data.sentimentScore,
        urgencyDetected: data.urgencyDetected ?? data.isUrgent ?? false,
        extractedEntities: data.extractedEntities || {},
        needsHumanReview: data.needsHumanReview ?? false,
        reviewReason: data.reviewReason || null,
        rawResponse: data.rawResponse || null,
        modelVersion: data.modelVersion || '1.0.0',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.ticketNlpAnalyses.push(newAnalysis);
      return { ...newAnalysis };
    }),

    upsert: vi.fn(async ({ where, update, create }: any) => {
      const index = store.ticketNlpAnalyses.findIndex(
        (a) => (where.id && a.id === where.id) || (where.ticketId && a.ticketId === where.ticketId)
      );
      if (index >= 0) {
        store.ticketNlpAnalyses[index] = {
          ...store.ticketNlpAnalyses[index],
          ...update,
          updatedAt: new Date(),
        };
        return { ...store.ticketNlpAnalyses[index] };
      } else {
        const newAnalysis = {
          id: create.id || uuidv4(),
          ticketId: create.ticketId,
          category: create.category,
          categoryConfidence: create.categoryConfidence,
          intent: create.intent || create.detectedIntent,
          intentConfidence: create.intentConfidence,
          priorityPredicted: create.priorityPredicted || create.predictedPriority,
          priorityConfidence: create.priorityConfidence || 0.9,
          sentiment: create.sentiment || create.sentimentLabel,
          sentimentScore: create.sentimentScore,
          urgencyDetected: create.urgencyDetected ?? create.isUrgent ?? false,
          extractedEntities: create.extractedEntities || {},
          needsHumanReview: create.needsHumanReview ?? false,
          reviewReason: create.reviewReason || null,
          rawResponse: create.rawResponse || null,
          modelVersion: create.modelVersion || '1.0.0',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.ticketNlpAnalyses.push(newAnalysis);
        return { ...newAnalysis };
      }
    }),
  },

  ticketComment: {
    create: vi.fn(async ({ data }: any) => {
      const newComment = {
        id: data.id || uuidv4(),
        ticketId: data.ticketId,
        authorId: data.authorId,
        content: data.content,
        isInternal: data.isInternal || false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.ticketComments.push(newComment);
      return {
        ...newComment,
        author: store.users.find((u) => u.id === newComment.authorId),
      };
    }),

    findMany: vi.fn(async ({ where }: any) => {
      return store.ticketComments
        .filter((c) => {
          if (c.ticketId !== where.ticketId) return false;
          if (where.isInternal === false && c.isInternal === true) return false;
          return true;
        })
        .map((c) => ({
          ...c,
          author: store.users.find((u) => u.id === c.authorId),
        }));
    }),
  },

  ticketActivity: {
    create: vi.fn(async ({ data }: any) => {
      const newAct = {
        id: data.id || uuidv4(),
        ticketId: data.ticketId,
        actorId: data.actorId || null,
        action: data.action,
        details: data.details || {},
        createdAt: new Date(),
      };
      store.ticketActivities.push(newAct);
      return { ...newAct };
    }),

    findMany: vi.fn(async ({ where }: any) => {
      return store.ticketActivities
        .filter((a) => a.ticketId === where.ticketId)
        .map((a) => ({
          ...a,
          actor: store.users.find((u) => u.id === a.actorId) || null,
        }));
    }),
  },

  ticketEmbedding: {
    create: vi.fn(async ({ data }: any) => {
      const newEmb = {
        id: data.id || uuidv4(),
        ticketId: data.ticketId,
        vector: data.vector || [],
        model: data.model || 'all-MiniLM-L6-v2',
        dimension: data.dimension || (data.vector ? data.vector.length : 384),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.ticketEmbeddings.push(newEmb);
      return { ...newEmb };
    }),

    upsert: vi.fn(async ({ where, update, create }: any) => {
      const idx = store.ticketEmbeddings.findIndex((e) => e.ticketId === where.ticketId);
      if (idx >= 0) {
        store.ticketEmbeddings[idx] = {
          ...store.ticketEmbeddings[idx],
          ...update,
          updatedAt: new Date(),
        };
        return { ...store.ticketEmbeddings[idx] };
      }
      const newEmb = {
        id: create.id || uuidv4(),
        ticketId: create.ticketId,
        vector: create.vector || [],
        model: create.model || 'all-MiniLM-L6-v2',
        dimension: create.dimension || (create.vector ? create.vector.length : 384),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.ticketEmbeddings.push(newEmb);
      return { ...newEmb };
    }),

    findUnique: vi.fn(async ({ where }: any) => {
      const emb = store.ticketEmbeddings.find((e) => e.ticketId === where.ticketId || e.id === where.id);
      return emb ? { ...emb } : null;
    }),

    findMany: vi.fn(async () => {
      return store.ticketEmbeddings.map((e) => ({ ...e }));
    }),
  },

  $queryRaw: vi.fn(async () => {
    return [];
  }),

  $transaction: vi.fn(async (callback: any) => {
    return callback(mockPrisma);
  }),
};
