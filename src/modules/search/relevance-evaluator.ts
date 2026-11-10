import { hybridSearchService } from './hybrid-search.service.js';
import { RelevanceMetricResult } from './search.types.js';

export interface BenchmarkQueryItem {
  query: string;
  expectedTicketIds: string[];
}

export class RelevanceEvaluator {
  /**
   * Computes Precision@K, Recall@K, NDCG@K, and MAP across a set of benchmark queries.
   */
  async evaluate(
    queries: BenchmarkQueryItem[],
    kValues: number[] = [3, 5, 10]
  ): Promise<RelevanceMetricResult> {
    if (!queries || queries.length === 0) {
      return {
        precisionAtK: { 3: 0, 5: 0, 10: 0 },
        recallAtK: { 3: 0, 5: 0, 10: 0 },
        ndcgAtK: { 3: 0, 5: 0, 10: 0 },
        meanAveragePrecision: 0,
        evaluatedQueriesCount: 0,
        details: [],
      };
    }

    const precisionSums: Record<number, number> = {};
    const recallSums: Record<number, number> = {};
    const ndcgSums: Record<number, number> = {};
    let totalAveragePrecision = 0;

    for (const k of kValues) {
      precisionSums[k] = 0;
      recallSums[k] = 0;
      ndcgSums[k] = 0;
    }

    const details: RelevanceMetricResult['details'] = [];

    for (const item of queries) {
      const searchResult = await hybridSearchService.search({
        query: item.query,
        limit: Math.max(...kValues),
      });

      const retrievedIds = searchResult.items.map((it) => it.id);
      const relevantSet = new Set(item.expectedTicketIds);

      // Detail metrics per query
      const pAtKMap: Record<number, number> = {};
      const rAtKMap: Record<number, number> = {};
      const ndcgAtKMap: Record<number, number> = {};

      for (const k of kValues) {
        const topK = retrievedIds.slice(0, k);
        const relevantInTopK = topK.filter((id) => relevantSet.has(id)).length;

        // Precision@K
        const precision = topK.length > 0 ? relevantInTopK / k : 0;
        pAtKMap[k] = precision;
        precisionSums[k] += precision;

        // Recall@K
        const recall = item.expectedTicketIds.length > 0
          ? relevantInTopK / item.expectedTicketIds.length
          : 1.0;
        rAtKMap[k] = recall;
        recallSums[k] += recall;

        // NDCG@K
        let dcg = 0;
        for (let i = 0; i < topK.length; i++) {
          const isRel = relevantSet.has(topK[i]) ? 1 : 0;
          dcg += (Math.pow(2, isRel) - 1) / Math.log2(i + 2);
        }

        let idcg = 0;
        const idealCount = Math.min(k, item.expectedTicketIds.length);
        for (let i = 0; i < idealCount; i++) {
          idcg += (Math.pow(2, 1) - 1) / Math.log2(i + 2);
        }

        const ndcg = idcg > 0 ? dcg / idcg : (item.expectedTicketIds.length === 0 ? 1.0 : 0.0);
        ndcgAtKMap[k] = ndcg;
        ndcgSums[k] += ndcg;
      }

      // Average Precision for query
      let runningRelevant = 0;
      let sumPAtCutoff = 0;
      for (let i = 0; i < retrievedIds.length; i++) {
        if (relevantSet.has(retrievedIds[i])) {
          runningRelevant++;
          sumPAtCutoff += runningRelevant / (i + 1);
        }
      }
      const ap = item.expectedTicketIds.length > 0
        ? sumPAtCutoff / item.expectedTicketIds.length
        : 1.0;
      totalAveragePrecision += ap;

      details.push({
        query: item.query,
        expectedCount: item.expectedTicketIds.length,
        retrievedCount: retrievedIds.length,
        pAt3: Number((pAtKMap[3] || 0).toFixed(4)),
        pAt5: Number((pAtKMap[5] || 0).toFixed(4)),
        pAt10: Number((pAtKMap[10] || 0).toFixed(4)),
        rAt3: Number((rAtKMap[3] || 0).toFixed(4)),
        rAt5: Number((rAtKMap[5] || 0).toFixed(4)),
        rAt10: Number((rAtKMap[10] || 0).toFixed(4)),
        ndcgAt3: Number((ndcgAtKMap[3] || 0).toFixed(4)),
        ndcgAt5: Number((ndcgAtKMap[5] || 0).toFixed(4)),
        ndcgAt10: Number((ndcgAtKMap[10] || 0).toFixed(4)),
      });
    }

    const n = queries.length;
    const finalPrecision: Record<number, number> = {};
    const finalRecall: Record<number, number> = {};
    const finalNdcg: Record<number, number> = {};

    for (const k of kValues) {
      finalPrecision[k] = Number((precisionSums[k] / n).toFixed(4));
      finalRecall[k] = Number((recallSums[k] / n).toFixed(4));
      finalNdcg[k] = Number((ndcgSums[k] / n).toFixed(4));
    }

    return {
      precisionAtK: finalPrecision,
      recallAtK: finalRecall,
      ndcgAtK: finalNdcg,
      meanAveragePrecision: Number((totalAveragePrecision / n).toFixed(4)),
      evaluatedQueriesCount: n,
      details,
    };
  }
}

export const relevanceEvaluator = new RelevanceEvaluator();
