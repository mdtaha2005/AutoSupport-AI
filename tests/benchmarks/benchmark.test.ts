import { describe, it, expect, vi } from 'vitest';
import { runBenchmarks } from './search-benchmark.js';

vi.mock('../../src/config/prisma.js', async () => {
  const { mockPrisma } = await import('../helpers/test-db.js');
  return { prisma: mockPrisma };
});

describe('Phase 4: Automated Search & Analytics Benchmark Test', () => {
  it('should run benchmark suite, measure latencies, throughput and evaluate NDCG@K', async () => {
    const report = await runBenchmarks();

    expect(report).toBeDefined();
    expect(report.dataset.totalTickets).toBe(500);
    expect(report.dataset.dimension).toBe(384);

    // Latency checks
    expect(report.latencies.lexical.avg).toBeGreaterThanOrEqual(0);
    expect(report.latencies.semantic.avg).toBeGreaterThanOrEqual(0);
    expect(report.latencies.hybrid.avg).toBeGreaterThanOrEqual(0);
    expect(report.latencies.facets.avg).toBeGreaterThanOrEqual(0);

    // Concurrency throughput checks
    expect(report.concurrency.length).toBe(3);
    for (const c of report.concurrency) {
      expect(c.rps).toBeGreaterThan(0);
    }

    // Relevance evaluation metrics checks
    expect(report.relevance.precisionAtK[3]).toBe(1.0);
    expect(report.relevance.ndcgAtK[3]).toBe(1.0);
    expect(report.relevance.meanAveragePrecision).toBeGreaterThan(0.10);
  }, 30000); // 30s timeout
});
