import { ActivityAction, TicketCategory, TicketPriority, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { nlpClient, NlpProcessResponse } from './nlp.client.js';

export class NlpService {
  async analyzeTicket(ticketId: string, actorId?: string): Promise<NlpProcessResponse | null> {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      logger.warn(`Cannot analyze ticket ${ticketId}: ticket not found`);
      return null;
    }

    // Call FastAPI microservice
    const nlpResult = await nlpClient.processTicket(ticket.id, ticket.title, ticket.description);

    if (!nlpResult) {
      logger.warn(`NLP analysis unavailable for ticket ${ticketId}. Flagging for human review.`);
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { needsHumanReview: true },
      });
      return null;
    }

    const categoryEnum = nlpResult.category.label as TicketCategory;
    const priorityEnum = nlpResult.priority.label as TicketPriority;

    await prisma.$transaction(async (tx) => {
      // 1. Upsert NLP analysis entity
      await tx.ticketNlpAnalysis.upsert({
        where: { ticketId: ticket.id },
        create: {
          ticketId: ticket.id,
          category: categoryEnum,
          categoryConfidence: nlpResult.category.confidence,
          intent: nlpResult.intent.label,
          intentConfidence: nlpResult.intent.confidence,
          priorityPredicted: priorityEnum,
          priorityConfidence: nlpResult.priority.confidence,
          sentiment: nlpResult.sentiment.label,
          sentimentScore: nlpResult.sentiment.score,
          urgencyDetected: nlpResult.sentiment.urgency_detected,
          extractedEntities: nlpResult.entities as unknown as Prisma.InputJsonValue,
          needsHumanReview: nlpResult.human_review.needs_review,
          reviewReason: nlpResult.human_review.reason || null,
          rawResponse: nlpResult as unknown as Prisma.InputJsonValue,
        },
        update: {
          category: categoryEnum,
          categoryConfidence: nlpResult.category.confidence,
          intent: nlpResult.intent.label,
          intentConfidence: nlpResult.intent.confidence,
          priorityPredicted: priorityEnum,
          priorityConfidence: nlpResult.priority.confidence,
          sentiment: nlpResult.sentiment.label,
          sentimentScore: nlpResult.sentiment.score,
          urgencyDetected: nlpResult.sentiment.urgency_detected,
          extractedEntities: nlpResult.entities as unknown as Prisma.InputJsonValue,
          needsHumanReview: nlpResult.human_review.needs_review,
          reviewReason: nlpResult.human_review.reason || null,
          rawResponse: nlpResult as unknown as Prisma.InputJsonValue,
        },
      });

      // 2. Update Ticket with inferred category and review flag
      // If priority was at default MEDIUM, update to predicted priority
      const shouldUpdatePriority = ticket.priority === TicketPriority.MEDIUM;

      await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          category: categoryEnum,
          needsHumanReview: nlpResult.human_review.needs_review,
          ...(shouldUpdatePriority && { priority: priorityEnum }),
        },
      });

      // 3. Record Activity Audit Log
      await tx.ticketActivity.create({
        data: {
          ticketId: ticket.id,
          actorId: actorId || null,
          action: ActivityAction.NLP_ANALYSIS_COMPLETED,
          details: {
            category: nlpResult.category.label,
            categoryConfidence: nlpResult.category.confidence,
            intent: nlpResult.intent.label,
            priorityPredicted: nlpResult.priority.label,
            sentiment: nlpResult.sentiment.label,
            sentimentScore: nlpResult.sentiment.score,
            urgencyDetected: nlpResult.sentiment.urgency_detected,
            entitiesCount: nlpResult.entities.length,
            needsHumanReview: nlpResult.human_review.needs_review,
            reviewReason: nlpResult.human_review.reason,
          } as Prisma.InputJsonValue,
        },
      });
    });

    logger.info(`NLP Analysis saved for ticket ${ticket.id}: [${categoryEnum}] [${priorityEnum}]`);

    // Asynchronously generate & save embedding for semantic search
    this.generateAndSaveEmbedding(ticket.id).catch((err) => {
      logger.warn(`Failed to generate embedding for ticket ${ticket.id}: ${err.message}`);
    });

    return nlpResult;
  }

  async generateAndSaveEmbedding(ticketId: string): Promise<number[] | null> {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { comments: { select: { content: true } } },
    });

    if (!ticket) return null;

    // Combine title, description, and top comments for semantic representation
    const textToEmbed = [
      ticket.title,
      ticket.description,
      ...(ticket.comments ? ticket.comments.map((c) => c.content) : []),
    ].join(' ').slice(0, 1000);

    const vector = await nlpClient.getEmbedding(textToEmbed);

    await prisma.ticketEmbedding.upsert({
      where: { ticketId: ticket.id },
      create: {
        ticketId: ticket.id,
        vector,
        model: 'all-MiniLM-L6-v2',
        dimension: vector.length,
      },
      update: {
        vector,
        updatedAt: new Date(),
      },
    });

    logger.debug(`Generated and saved embedding for ticket ${ticket.id}`);
    return vector;
  }
}

export const nlpService = new NlpService();
