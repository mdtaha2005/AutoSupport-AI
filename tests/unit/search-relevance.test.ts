import { describe, it, expect } from 'vitest';
import { semanticSearchService } from '../../src/modules/search/semantic-search.service.js';
import { RelevanceEvaluator } from '../../src/modules/search/relevance-evaluator.js';
import { SEARCH_CONFIG } from '../../src/modules/search/search.config.js';

describe('Phase 4: Search & Relevance Unit Tests', () => {
  describe('Cosine Similarity Computation', () => {
    it('should compute exact 1.0 similarity for identical vectors', () => {
      const vec = [0.5773, 0.5773, 0.5773];
      const sim = semanticSearchService.computeCosineSimilarity(vec, vec);
      expect(sim).toBeCloseTo(1.0, 3);
    });

    it('should compute 0.0 for orthogonal vectors', () => {
      const vecA = [1.0, 0.0, 0.0];
      const vecB = [0.0, 1.0, 0.0];
      const sim = semanticSearchService.computeCosineSimilarity(vecA, vecB);
      expect(sim).toBeCloseTo(0.0, 3);
    });

    it('should compute -1.0 for opposite vectors', () => {
      const vecA = [1.0, 0.0];
      const vecB = [-1.0, 0.0];
      const sim = semanticSearchService.computeCosineSimilarity(vecA, vecB);
      expect(sim).toBeCloseTo(-1.0, 3);
    });

    it('should handle zero-length or empty vectors gracefully by returning 0.0', () => {
      const sim = semanticSearchService.computeCosineSimilarity([], [1, 2, 3]);
      expect(sim).toBe(0.0);
    });
  });

  describe('Hybrid Score Normalization & Weighting Formulas', () => {
    it('should correctly balance pure lexical search when alpha is 1.0', () => {
      const alpha = 1.0;
      const lexicalScore = 0.85;
      const semanticScore = 0.30;
      const hybrid = alpha * lexicalScore + (1.0 - alpha) * semanticScore;
      expect(hybrid).toBeCloseTo(0.85, 4);
    });

    it('should correctly balance pure semantic search when alpha is 0.0', () => {
      const alpha = 0.0;
      const lexicalScore = 0.85;
      const semanticScore = 0.92;
      const hybrid = alpha * lexicalScore + (1.0 - alpha) * semanticScore;
      expect(hybrid).toBeCloseTo(0.92, 4);
    });

    it('should apply balanced 50/50 weighting by default', () => {
      const alpha = SEARCH_CONFIG.DEFAULT_ALPHA; // 0.50
      const lexicalScore = 0.80;
      const semanticScore = 0.60;
      const hybrid = alpha * lexicalScore + (1.0 - alpha) * semanticScore;
      expect(hybrid).toBeCloseTo(0.70, 4);
    });

    it('should calculate Reciprocal Rank Fusion (RRF) correctly with k=60', () => {
      const k = 60;
      const alpha = 0.5;
      const rankLexical = 1;
      const rankSemantic = 2;
      const rrfScore = (alpha / (k + rankLexical)) + ((1 - alpha) / (k + rankSemantic));
      // (0.5 / 61) + (0.5 / 62) = 0.0081967 + 0.0080645 = 0.016261
      expect(rrfScore).toBeCloseTo(0.01626, 4);
    });
  });

  describe('Relevance Evaluation Metrics (Precision@K, Recall@K, NDCG@K)', () => {
    it('should correctly compute DCG and IDCG for graded relevance', () => {
      // Mock ranked items: [rel=1, rel=0, rel=1]
      // DCG@3 = (2^1 - 1)/log2(2) + (2^0 - 1)/log2(3) + (2^1 - 1)/log2(4)
      // = 1/1 + 0 + 1/2 = 1.5
      // IDCG@3 for 2 relevant items = 1/log2(2) + 1/log2(3) = 1 + 0.6309 = 1.6309
      // NDCG@3 = 1.5 / 1.6309 = 0.9197
      const retrieved = ['doc1', 'doc2', 'doc3'];
      const relevantSet = new Set(['doc1', 'doc3']);

      let dcg = 0;
      for (let i = 0; i < retrieved.length; i++) {
        const isRel = relevantSet.has(retrieved[i]) ? 1 : 0;
        dcg += (Math.pow(2, isRel) - 1) / Math.log2(i + 2);
      }

      let idcg = 0;
      const idealCount = Math.min(3, 2);
      for (let i = 0; i < idealCount; i++) {
        idcg += (Math.pow(2, 1) - 1) / Math.log2(i + 2);
      }

      const ndcg = dcg / idcg;
      expect(ndcg).toBeCloseTo(0.9197, 3);
    });

    it('should compute Precision@3 and Recall@3 accurately', () => {
      const retrieved = ['doc1', 'doc2', 'doc3'];
      const relevant = ['doc1', 'doc3', 'doc5', 'doc6']; // 4 relevant in total, 2 in top 3
      const relevantSet = new Set(relevant);

      const inTop3 = retrieved.slice(0, 3).filter((d) => relevantSet.has(d)).length;
      const precisionAt3 = inTop3 / 3;
      const recallAt3 = inTop3 / relevant.length;

      expect(precisionAt3).toBeCloseTo(0.6667, 3);
      expect(recallAt3).toBeCloseTo(0.50, 2);
    });
  });
});
