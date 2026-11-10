import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorizeRoles } from '../../middleware/rbac.middleware.js';
import { searchController } from './search.controller.js';

const router = Router();

router.use(authenticate);
router.use(authorizeRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT));

// Full-text, Semantic, and Hybrid Search
router.get('/', (req, res, next) => searchController.search(req, res, next));

// Dynamic Faceted Filtering with active filter awareness
router.get('/facets', (req, res, next) => searchController.getFacets(req, res, next));

// Direct Semantic Search endpoint
router.post('/semantic', (req, res, next) => searchController.semanticSearch(req, res, next));

// Relevance Evaluation (Precision@K, Recall@K, NDCG@K)
router.get('/evaluate', (req, res, next) => searchController.evaluateRelevance(req, res, next));
router.post('/evaluate', (req, res, next) => searchController.evaluateRelevance(req, res, next));

export { router as searchRoutes };
