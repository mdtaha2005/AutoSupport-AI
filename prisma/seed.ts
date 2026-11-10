import { PrismaClient, UserRole, AvailabilityStatus, TicketPriority, TicketStatus, ActivityAction, TicketCategory } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Create Default Admin User
  const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@ticketrouting.com';
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'AdminPassword123!';
  const adminName = process.env.DEFAULT_ADMIN_NAME || 'System Administrator';

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  let adminUser;
  if (!existingAdmin) {
    const adminHash = await bcrypt.hash(adminPassword, 12);
    adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: adminHash,
        name: adminName,
        role: UserRole.ADMIN,
      },
    });
    console.log(`✅ Created Admin user: ${adminEmail}`);
  } else {
    adminUser = existingAdmin;
    console.log(`ℹ️ Admin user already exists: ${adminEmail}`);
  }

  // 2. Create Departments
  const departmentsData = [
    { name: 'Technical Support', description: 'Hardware, software, and API integration issues' },
    { name: 'Billing & Subscriptions', description: 'Invoices, refunds, card charges, and subscription management' },
    { name: 'General Customer Service', description: 'Product inquiries, onboarding, and general questions' },
  ];

  const createdDepartments = [];
  for (const dept of departmentsData) {
    const d = await prisma.department.upsert({
      where: { name: dept.name },
      update: {},
      create: dept,
    });
    createdDepartments.push(d);
  }
  console.log(`✅ Upserted ${createdDepartments.length} departments`);

  // 3. Create Support Manager
  const managerEmail = 'manager@ticketrouting.com';
  const existingManager = await prisma.user.findUnique({ where: { email: managerEmail } });
  let managerUser;
  if (!existingManager) {
    const managerHash = await bcrypt.hash('ManagerPass123!', 12);
    managerUser = await prisma.user.create({
      data: {
        email: managerEmail,
        passwordHash: managerHash,
        name: 'Sarah Connor (Support Manager)',
        role: UserRole.MANAGER,
      },
    });
    console.log(`✅ Created Manager: ${managerEmail}`);
  } else {
    managerUser = existingManager;
  }

  // 4. Create Sample Agents
  const agentDefs = [
    {
      name: 'Alex Tech (Senior Dev Support)',
      email: 'alex.tech@ticketrouting.com',
      departmentIndex: 0,
      skills: ['TypeScript', 'Node.js', 'PostgreSQL', 'APIs', 'Docker'],
      availability: AvailabilityStatus.AVAILABLE,
      maxWorkload: 6,
    },
    {
      name: 'Bob Billing (Finance Specialist)',
      email: 'bob.billing@ticketrouting.com',
      departmentIndex: 1,
      skills: ['Stripe', 'Invoicing', 'Tax Compliance', 'Refunds'],
      availability: AvailabilityStatus.AVAILABLE,
      maxWorkload: 5,
    },
    {
      name: 'Clara Care (General Support Lead)',
      email: 'clara.care@ticketrouting.com',
      departmentIndex: 2,
      skills: ['Onboarding', 'Customer Success', 'Escalations'],
      availability: AvailabilityStatus.BUSY,
      maxWorkload: 5,
    },
  ];

  const createdAgents = [];
  for (const ag of agentDefs) {
    const existing = await prisma.user.findUnique({ where: { email: ag.email } });
    if (!existing) {
      const hash = await bcrypt.hash('AgentPass123!', 12);
      const user = await prisma.user.create({
        data: {
          email: ag.email,
          passwordHash: hash,
          name: ag.name,
          role: UserRole.AGENT,
          agentProfile: {
            create: {
              departmentId: createdDepartments[ag.departmentIndex].id,
              skills: ag.skills,
              availabilityStatus: ag.availability,
              maxWorkload: ag.maxWorkload,
              currentWorkload: 0,
            },
          },
        },
        include: { agentProfile: true },
      });
      createdAgents.push(user);
      console.log(`✅ Created Agent: ${ag.email} in ${createdDepartments[ag.departmentIndex].name}`);
    } else {
      createdAgents.push(existing);
    }
  }

  // 5. Create Sample Customer User
  const customerEmail = 'customer@acmecorp.com';
  const existingCustomer = await prisma.user.findUnique({ where: { email: customerEmail } });
  let customerUser;
  if (!existingCustomer) {
    const custHash = await bcrypt.hash('CustomerPass123!', 12);
    customerUser = await prisma.user.create({
      data: {
        email: customerEmail,
        passwordHash: custHash,
        name: 'John Doe (Acme Corp)',
        role: UserRole.CUSTOMER,
      },
    });
    console.log(`✅ Created Customer: ${customerEmail}`);
  } else {
    customerUser = existingCustomer;
  }

  // 6. Create Initial Demo Tickets with NLP Analysis
  const sampleTickets = [
    {
      title: 'Database connection timeouts in production cluster',
      description: 'We are observing periodic 504 gateway timeouts when executing bulk reporting queries on database cluster.',
      category: TicketCategory.TECHNICAL,
      priority: TicketPriority.HIGH,
      status: TicketStatus.OPEN,
      deptIndex: 0,
      agentIndex: 0,
      sentiment: 'NEGATIVE',
      intent: 'service_outage',
      confidence: 0.94,
      entities: [{ type: 'HTTP_CODE', value: '504', start: 30, end: 33, confidence: 0.99 }],
    },
    {
      title: 'Duplicate charge on Visa card for invoice #INV-4921',
      description: 'I checked my online banking statement and saw two transactions of $129.00 on yesterday for invoice #INV-4921. Please refund.',
      category: TicketCategory.PAYMENT,
      priority: TicketPriority.HIGH,
      status: TicketStatus.IN_PROGRESS,
      deptIndex: 1,
      agentIndex: 1,
      sentiment: 'NEGATIVE',
      intent: 'payment_duplicate',
      confidence: 0.96,
      entities: [
        { type: 'ORDER_ID', value: 'INV-4921', start: 40, end: 48, confidence: 0.98 },
        { type: 'AMOUNT', value: '129.00', start: 70, end: 77, confidence: 0.95 },
      ],
    },
    {
      title: 'Refund request for damaged item in order #ORD-88219',
      description: 'The package arrived broken on November 5th. Total was $64.50. I need a full refund back to my card.',
      category: TicketCategory.REFUND,
      priority: TicketPriority.MEDIUM,
      status: TicketStatus.RESOLVED,
      deptIndex: 1,
      agentIndex: 1,
      sentiment: 'NEUTRAL',
      intent: 'refund_request',
      confidence: 0.92,
      entities: [
        { type: 'ORDER_ID', value: 'ORD-88219', start: 30, end: 39, confidence: 0.97 },
        { type: 'AMOUNT', value: '64.50', start: 50, end: 56, confidence: 0.95 },
      ],
    },
    {
      title: 'Package tracking delayed for shipment #TRK-99021',
      description: 'Tracking code TRK-99021 has been stuck at the logistics hub for 4 days past delivery date.',
      category: TicketCategory.DELIVERY,
      priority: TicketPriority.MEDIUM,
      status: TicketStatus.OPEN,
      deptIndex: 2,
      agentIndex: 2,
      sentiment: 'NEGATIVE',
      intent: 'delivery_delay',
      confidence: 0.89,
      entities: [{ type: 'TRACKING_ID', value: 'TRK-99021', start: 14, end: 23, confidence: 0.96 }],
    },
  ];

  for (const s of sampleTickets) {
    const existing = await prisma.ticket.findFirst({ where: { title: s.title } });
    if (!existing) {
      const assigned = createdAgents[s.agentIndex];
      const dept = createdDepartments[s.deptIndex];

      const ticket = await prisma.ticket.create({
        data: {
          title: s.title,
          description: s.description,
          category: s.category,
          priority: s.priority,
          status: s.status,
          customerId: customerUser.id,
          customerName: customerUser.name,
          customerEmail: customerUser.email,
          departmentId: dept.id,
          assignedAgentId: assigned.id,
          nlpAnalysis: {
            create: {
              category: s.category,
              categoryConfidence: s.confidence,
              intent: s.intent,
              intentConfidence: s.confidence,
              sentiment: s.sentiment,
              sentimentScore: s.sentiment === 'NEGATIVE' ? -0.7 : 0.1,
              priorityPredicted: s.priority,
              priorityConfidence: s.confidence,
              extractedEntities: s.entities,
              needsHumanReview: false,
            },
          },
        },
      });

      // Update agent workload
      await prisma.agentProfile.update({
        where: { userId: assigned.id },
        data: { currentWorkload: { increment: 1 } },
      });

      // Add comment & activity
      await prisma.ticketActivity.create({
        data: {
          ticketId: ticket.id,
          actorId: customerUser.id,
          action: ActivityAction.TICKET_CREATED,
          details: { title: ticket.title, priority: ticket.priority },
        },
      });

      await prisma.ticketComment.create({
        data: {
          ticketId: ticket.id,
          authorId: assigned.id,
          content: 'Ticket assigned and under review by support agent.',
          isInternal: false,
        },
      });

      console.log(`✅ Seeded ticket #${ticket.ticketNumber}: [${s.category}] "${s.title}" -> ${assigned.name}`);
    }
  }

  console.log('✨ Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
