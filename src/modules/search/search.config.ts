import { env } from '../../config/env.js';

export const SEARCH_CONFIG = {
  // Linear Hybrid Fusion Weight
  DEFAULT_ALPHA: env.HYBRID_SEARCH_ALPHA ?? 0.50,

  // Reciprocal Rank Fusion Constant
  RRF_K: env.RRF_K ?? 60,

  // Lexical Field Weights
  WEIGHTS: {
    TITLE: 1.0,        // Weight A
    DESCRIPTION: 0.4,  // Weight B
    COMMENTS: 0.2,     // Weight C
  },

  // Dense Vector Embedding Dimensions
  VECTOR_DIMENSION: env.PGVECTOR_DIMENSION ?? 384,

  // Pagination Limits
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,

  // Cutoff Threshold for non-matching items
  MIN_RELEVANCE_SCORE: 0.001,
} as const;
