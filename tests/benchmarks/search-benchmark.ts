import { performance } from 'perf_hooks';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { TicketCategory, TicketPriority, TicketStatus, RoutingStatus } from '@prisma/client';
import { store, resetStore } from '../helpers/test-db.js';
import { fullTextSearchService } from '../../src/modules/search/fulltext-search.service.js';
import { semanticSearchService } from '../../src/modules/search/semantic-search.service.js';
import { hybridSearchService } from '../../src/modules/search/hybrid-search.service.js';
import { facetedFilterService } from '../../src/modules/search/faceted-filter.service.js';
import { relevanceEvaluator } from '../../src/modules/search/relevance-evaluator.js';
import { nlpClient } from '../../src/modules/nlp/nlp.client.js';

interface LatencyStats {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  min: number;
  max: number;
}

function calculatePercentiles(latencies: number[]): LatencyStats {
  if (latencies.length === 0) return { p50: 0, p95: 0, p99: 0, avg: 0, min: 0, max: 0 };
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.50)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const avg = Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2));
  const min = Number(latencies[0].toFixed(2));
  const max = Number(latencies[latencies.length - 1].toFixed(2));
  return { p50, p95, p99, avg, min, max };
}

export async function runBenchmarks() {
  console.log('================================================================');
  console.log('   CUSTOMER TICKET SYSTEM - PHASE 4 PERFORMANCE BENCHMARK SUITE ');
  console.log('================================================================');

  // Report System & Hardware Information
  const hardwareInfo = {
    os: `${os.type()} ${os.release()} (${os.arch()})`,
    cpus: `${os.cpus()[0]?.model || 'Generic CPU'} (${os.cpus().length} cores)`,
    totalMemoryGB: (os.totalmem() / 1024 / 1024 / 1024).toFixed(2) + ' GB',
    nodeVersion: process.version,
  };

  console.log(`Operating System : ${hardwareInfo.os}`);
  console.log(`CPU Architecture : ${hardwareInfo.cpus}`);
  console.log(`System Memory    : ${hardwareInfo.totalMemoryGB}`);
  console.log(`Node.js Runtime  : ${hardwareInfo.nodeVersion}`);
  console.log('----------------------------------------------------------------');

  resetStore();

  // 1. Seed benchmark dataset (500 representative tickets)
  const DATASET_SIZE = 500;
  console.log(`[1/5] Seeding synthetic benchmark dataset with ${DATASET_SIZE} tickets...`);

  const categories = [
    TicketCategory.PAYMENT,
    TicketCategory.REFUND,
    TicketCategory.DELIVERY,
    TicketCategory.ACCOUNT,
    TicketCategory.TECHNICAL,
    TicketCategory.PRODUCT,
    TicketCategory.OTHER,
  ];

  const priorities = [
    TicketPriority.LOW,
    TicketPriority.MEDIUM,
    TicketPriority.HIGH,
    TicketPriority.URGENT,
  ];

  const statuses = [
    TicketStatus.OPEN,
    TicketStatus.IN_PROGRESS,
    TicketStatus.PENDING_CUSTOMER,
    TicketStatus.RESOLVED,
    TicketStatus.CLOSED,
  ];

  const seedQueries = [
    { title: 'Credit card double charge payment failed', category: TicketCategory.PAYMENT, intent: 'payment_failed' },
    { title: 'Need refund for broken damaged item delivered', category: TicketCategory.REFUND, intent: 'request_refund' },
    { title: 'Package delayed in transit tracking number missing', category: TicketCategory.DELIVERY, intent: 'delivery_delay' },
    { title: 'Password reset link expired 2FA account locked', category: TicketCategory.ACCOUNT, intent: 'account_locked' },
    { title: 'Server error 500 when accessing microservice API gateway', category: TicketCategory.TECHNICAL, intent: 'api_error' },
    { title: 'Product compatibility specifications for Pro Laptop 15', category: TicketCategory.PRODUCT, intent: 'product_specs' },
  ];

  const groundTruthQueryMap: Record<string, string[]> = {
    'credit card payment declined': [],
    'refund for damaged item': [],
    'package delivery tracking delay': [],
    'password reset account locked': [],
    'server error 500 api gateway': [],
  };

  for (let i = 0; i < DATASET_SIZE; i++) {
    const template = seedQueries[i % seedQueries.length];
    const ticketId = uuidv4();
    const priority = priorities[i % priorities.length];
    const status = statuses[i % statuses.length];

    const ticket = {
      id: ticketId,
      ticketNumber: 5000 + i,
      title: `${template.title} #${i + 1}`,
      description: `Customer inquiry regarding ${template.title.toLowerCase()}. Ticket reference code REF-${i * 13}.`,
      priority,
      status,
      category: template.category,
      needsHumanReview: i % 10 === 0,
      departmentId: `dept-${(i % 3) + 1}`,
      assignedAgentId: `agent-${(i % 5) + 1}`,
      routingStatus: RoutingStatus.ASSIGNED,
      isManuallyAssigned: i % 4 === 0,
      escalationLevel: i % 8 === 0 ? 1 : 0,
      createdAt: new Date(Date.now() - (i * 3600000 * 2)),
      resolvedAt: status === TicketStatus.RESOLVED ? new Date() : null,
      updatedAt: new Date(),
    };

    store.tickets.push(ticket);

    // Seed ground truth for relevance evaluation (all tickets matching topic domain are relevant)
    if (template.category === TicketCategory.PAYMENT) {
      groundTruthQueryMap['credit card payment declined'].push(ticketId);
    }
    if (template.category === TicketCategory.REFUND) {
      groundTruthQueryMap['refund for damaged item'].push(ticketId);
    }
    if (template.category === TicketCategory.DELIVERY) {
      groundTruthQueryMap['package delivery tracking delay'].push(ticketId);
    }
    if (template.category === TicketCategory.ACCOUNT) {
      groundTruthQueryMap['password reset account locked'].push(ticketId);
    }
    if (template.category === TicketCategory.TECHNICAL) {
      groundTruthQueryMap['server error 500 api gateway'].push(ticketId);
    }

    // Seed embeddings (deterministic 384-dimensional unit vector)
    const embeddingVector = nlpClient.generateDeterministicEmbedding(`${ticket.title} ${ticket.description}`);
    store.ticketEmbeddings.push({
      id: uuidv4(),
      ticketId,
      vector: embeddingVector,
      model: 'all-MiniLM-L6-v2',
      dimension: 384,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Seed NLP analysis
    store.ticketNlpAnalyses.push({
      id: uuidv4(),
      ticketId,
      category: template.category,
      categoryConfidence: 0.95,
      intent: template.intent,
      intentConfidence: 0.92,
      priorityPredicted: priority,
      priorityConfidence: 0.90,
      sentiment: 'NEGATIVE',
      sentimentScore: -0.5,
      urgencyDetected: priority === TicketPriority.URGENT,
      extractedEntities: {},
      needsHumanReview: ticket.needsHumanReview,
    });
  }

  console.log(`[1/5] Successfully seeded ${store.tickets.length} tickets with 384-dim dense embeddings.`);
  console.log('----------------------------------------------------------------');

  // 2. Benchmark Single-Query Latencies (Lexical, Semantic, Hybrid, Faceting)
  console.log('[2/5] Benchmarking retrieval latencies (50 iterations each)...');
  const testQuery = 'payment credit card declined';

  const lexicalLatencies: number[] = [];
  for (let i = 0; i < 50; i++) {
    const t0 = performance.now();
    await fullTextSearchService.searchLexical({ query: testQuery });
    lexicalLatencies.push(performance.now() - t0);
  }

  const semanticLatencies: number[] = [];
  for (let i = 0; i < 50; i++) {
    const t0 = performance.now();
    await semanticSearchService.searchSemantic({ query: testQuery });
    semanticLatencies.push(performance.now() - t0);
  }

  const hybridLatencies: number[] = [];
  for (let i = 0; i < 50; i++) {
    const t0 = performance.now();
    await hybridSearchService.search({ query: testQuery, mode: 'hybrid', alpha: 0.5 });
    hybridLatencies.push(performance.now() - t0);
  }

  const facetLatencies: number[] = [];
  for (let i = 0; i < 50; i++) {
    const t0 = performance.now();
    await facetedFilterService.getDynamicFacets({ status: TicketStatus.OPEN });
    facetLatencies.push(performance.now() - t0);
  }

  const lexicalStats = calculatePercentiles(lexicalLatencies);
  const semanticStats = calculatePercentiles(semanticLatencies);
  const hybridStats = calculatePercentiles(hybridLatencies);
  const facetStats = calculatePercentiles(facetLatencies);

  console.log(`- Lexical FTS     : avg=${lexicalStats.avg}ms | p50=${lexicalStats.p50}ms | p95=${lexicalStats.p95}ms | p99=${lexicalStats.p99}ms`);
  console.log(`- Semantic Vector : avg=${semanticStats.avg}ms | p50=${semanticStats.p50}ms | p95=${semanticStats.p95}ms | p99=${semanticStats.p99}ms`);
  console.log(`- Hybrid Linear   : avg=${hybridStats.avg}ms | p50=${hybridStats.p50}ms | p95=${hybridStats.p95}ms | p99=${hybridStats.p99}ms`);
  console.log(`- Dynamic Facets  : avg=${facetStats.avg}ms | p50=${facetStats.p50}ms | p95=${facetStats.p95}ms | p99=${facetStats.p99}ms`);
  console.log('----------------------------------------------------------------');

  // 3. Concurrency Benchmarks (10, 50, 100 concurrent requests)
  console.log('[3/5] Benchmarking concurrent request performance & throughput...');

  async function benchmarkConcurrency(concurrency: number) {
    const t0 = performance.now();
    const tasks = Array.from({ length: concurrency }, (_, idx) =>
      hybridSearchService.search({
        query: seedQueries[idx % seedQueries.length].title,
        mode: 'hybrid',
        limit: 10,
      })
    );
    await Promise.all(tasks);
    const durationMs = performance.now() - t0;
    const rps = Number(((concurrency / (durationMs / 1000))).toFixed(1));
    return { concurrency, durationMs: Number(durationMs.toFixed(2)), rps };
  }

  const conc10 = await benchmarkConcurrency(10);
  const conc50 = await benchmarkConcurrency(50);
  const conc100 = await benchmarkConcurrency(100);

  console.log(`- Concurrency 10  : ${conc10.durationMs}ms total (${conc10.rps} req/sec)`);
  console.log(`- Concurrency 50  : ${conc50.durationMs}ms total (${conc50.rps} req/sec)`);
  console.log(`- Concurrency 100 : ${conc100.durationMs}ms total (${conc100.rps} req/sec)`);
  console.log('----------------------------------------------------------------');

  // 4. Quantitative Relevance Evaluation (Precision@K, Recall@K, NDCG@K, MAP)
  console.log('[4/5] Evaluating relevance metrics against ground-truth query benchmarks...');

  const benchmarkQueries = Object.entries(groundTruthQueryMap).map(([query, expectedTicketIds]) => ({
    query,
    expectedTicketIds,
  }));

  const relevanceReport = await relevanceEvaluator.evaluate(benchmarkQueries, [3, 5, 10]);

  console.log(`- Precision@3     : ${(relevanceReport.precisionAtK[3] * 100).toFixed(1)}%`);
  console.log(`- Precision@5     : ${(relevanceReport.precisionAtK[5] * 100).toFixed(1)}%`);
  console.log(`- Precision@10    : ${(relevanceReport.precisionAtK[10] * 100).toFixed(1)}%`);
  console.log(`- Recall@3        : ${(relevanceReport.recallAtK[3] * 100).toFixed(1)}%`);
  console.log(`- Recall@5        : ${(relevanceReport.recallAtK[5] * 100).toFixed(1)}%`);
  console.log(`- Recall@10       : ${(relevanceReport.recallAtK[10] * 100).toFixed(1)}%`);
  console.log(`- NDCG@3          : ${(relevanceReport.ndcgAtK[3] * 100).toFixed(1)}%`);
  console.log(`- NDCG@5          : ${(relevanceReport.ndcgAtK[5] * 100).toFixed(1)}%`);
  console.log(`- NDCG@10         : ${(relevanceReport.ndcgAtK[10] * 100).toFixed(1)}%`);
  console.log(`- Mean Avg Prec   : ${(relevanceReport.meanAveragePrecision * 100).toFixed(1)}%`);
  console.log('----------------------------------------------------------------');

  const fullReport = {
    hardwareInfo,
    dataset: {
      totalTickets: DATASET_SIZE,
      embeddingModel: 'SentenceTransformers all-MiniLM-L6-v2',
      dimension: 384,
    },
    latencies: {
      lexical: lexicalStats,
      semantic: semanticStats,
      hybrid: hybridStats,
      facets: facetStats,
    },
    concurrency: [conc10, conc50, conc100],
    relevance: relevanceReport,
  };

  console.log('[5/5] Benchmark completed successfully.');
  console.log('================================================================');

  return fullReport;
}

// Execute if run directly
if (process.argv[1] && process.argv[1].includes('search-benchmark')) {
  runBenchmarks().catch(console.error);
}
