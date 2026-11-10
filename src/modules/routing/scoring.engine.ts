import { AvailabilityStatus, TicketCategory } from '@prisma/client';
import { routingConfig } from '../../config/routing.config.js';
import { CandidateAgent, ScoredCandidate, ScoreBreakdown, TicketContext } from './routing.types.js';

export class ScoringEngine {
  /**
   * Computes normalized skill score (0.0 to 1.0)
   */
  computeSkillScore(
    agentSkills: string[],
    category?: TicketCategory | null,
    intent?: string | null
  ): number {
    if (!agentSkills || agentSkills.length === 0) {
      return routingConfig.skillScores.fallbackScore;
    }

    const normalizedSkills = agentSkills.map((s) => s.trim().toLowerCase());
    const normalizedIntent = intent ? intent.trim().toLowerCase() : null;
    const normalizedCategory = category ? category.trim().toLowerCase() : null;

    // 1. Exact Intent Match (Highest specificity)
    if (normalizedIntent && normalizedSkills.includes(normalizedIntent)) {
      return routingConfig.skillScores.exactIntentMatch;
    }

    // 2. Exact Category Match
    if (normalizedCategory && normalizedSkills.includes(normalizedCategory)) {
      return routingConfig.skillScores.exactCategoryMatch;
    }

    // 3. Partial / Token Match
    const hasPartialMatch = normalizedSkills.some((skill) => {
      if (normalizedIntent && (normalizedIntent.includes(skill) || skill.includes(normalizedIntent))) {
        return true;
      }
      if (normalizedCategory && (normalizedCategory.includes(skill) || skill.includes(normalizedCategory))) {
        return true;
      }
      return false;
    });

    if (hasPartialMatch) {
      return routingConfig.skillScores.partialMatch;
    }

    // 4. Default baseline for generalist agents
    return routingConfig.skillScores.fallbackScore;
  }

  /**
   * Computes normalized workload remaining score (0.0 to 1.0).
   * 0 workload = 1.0 (maximum score); at max capacity = 0.0.
   */
  computeWorkloadScore(currentWorkload: number, maxWorkload: number): number {
    if (maxWorkload <= 0) return 0.0;
    const remainingFraction = 1.0 - currentWorkload / maxWorkload;
    return Math.max(0.0, Math.min(1.0, remainingFraction));
  }

  /**
   * Computes normalized availability score (0.0 to 1.0)
   */
  computeAvailabilityScore(status: AvailabilityStatus): number {
    return routingConfig.availabilityScores[status] ?? 0.0;
  }

  /**
   * Computes weighted composite score
   */
  computeCompositeScore(skillScore: number, workloadScore: number, availScore: number): number {
    const { skill, workload, availability } = routingConfig.weights;
    const composite = skill * skillScore + workload * workloadScore + availability * availScore;
    return Math.round(composite * 10000) / 10000;
  }

  /**
   * Evaluates, scores and ranks all eligible candidates deterministically.
   */
  scoreAndRankCandidates(candidates: CandidateAgent[], context: TicketContext): ScoredCandidate[] {
    // 1. Hard Filter: Exclude OFFLINE agents and agents at or exceeding capacity
    const eligible = candidates.filter(
      (agent) =>
        agent.availabilityStatus !== AvailabilityStatus.OFFLINE &&
        agent.currentWorkload < agent.maxWorkload
    );

    if (eligible.length === 0) {
      return [];
    }

    // 2. Score each eligible agent
    const scored: ScoredCandidate[] = eligible.map((agent) => {
      const skillScore = this.computeSkillScore(agent.skills, context.category, context.intent);
      const workloadScore = this.computeWorkloadScore(agent.currentWorkload, agent.maxWorkload);
      const availabilityScore = this.computeAvailabilityScore(agent.availabilityStatus);
      const compositeScore = this.computeCompositeScore(skillScore, workloadScore, availabilityScore);

      const scores: ScoreBreakdown = {
        skillScore,
        workloadScore,
        availabilityScore,
        compositeScore,
      };

      return { agent, scores };
    });

    // 3. Sort candidates with deterministic tie-breaking
    scored.sort((a, b) => {
      const scoreDiff = b.scores.compositeScore - a.scores.compositeScore;
      if (Math.abs(scoreDiff) > routingConfig.tieBreakEpsilon) {
        return scoreDiff;
      }

      // Tie-breaker 1: Lowest current workload count
      if (a.agent.currentWorkload !== b.agent.currentWorkload) {
        return a.agent.currentWorkload - b.agent.currentWorkload;
      }

      // Tie-breaker 2: Longest idle / least recently updated
      const timeDiff = a.agent.updatedAt.getTime() - b.agent.updatedAt.getTime();
      if (timeDiff !== 0) {
        return timeDiff;
      }

      // Tie-breaker 3: Deterministic lexicographical string comparison of userId
      return a.agent.userId.localeCompare(b.agent.userId);
    });

    return scored;
  }

  /**
   * Selects highest-scoring candidate
   */
  selectBestAgent(candidates: CandidateAgent[], context: TicketContext): ScoredCandidate | null {
    const ranked = this.scoreAndRankCandidates(candidates, context);
    return ranked.length > 0 ? ranked[0] : null;
  }
}

export const scoringEngine = new ScoringEngine();
