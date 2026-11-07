import { DomainError, ErrorCodes } from '../shared/DomainError';
import type { ScoringMode } from '../quiz/Quiz';

/**
 * Pattern Strategy : le mode de notation est interchangeable par test.
 * Les mêmes formules sont implémentées en SQL (internal.compute_score),
 * qui reste la source de vérité ; côté client elles servent au détail par question.
 */
export interface QuestionAnswer {
  readonly points: number;
  readonly correctChoiceIds: ReadonlySet<string>;
  readonly selectedChoiceIds: ReadonlySet<string>;
}

export interface ScoringStrategy {
  readonly mode: ScoringMode;
  readonly label: string;
  readonly description: string;
  score(answer: QuestionAnswer): number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function analyse(answer: QuestionAnswer) {
  let hits = 0;
  let wrongs = 0;
  for (const id of answer.selectedChoiceIds) {
    if (answer.correctChoiceIds.has(id)) hits++;
    else wrongs++;
  }
  return { hits, wrongs, totalCorrect: answer.correctChoiceIds.size };
}

export class AllOrNothingStrategy implements ScoringStrategy {
  readonly mode = 'all_or_nothing' as const;
  readonly label = 'Tout ou rien';
  readonly description = 'Les points ne sont acquis que si la sélection correspond exactement aux bonnes réponses.';

  score(answer: QuestionAnswer): number {
    const { hits, wrongs, totalCorrect } = analyse(answer);
    return totalCorrect > 0 && hits === totalCorrect && wrongs === 0 ? answer.points : 0;
  }
}

export class PartialCreditStrategy implements ScoringStrategy {
  readonly mode = 'partial' as const;
  readonly label = 'Crédit partiel';
  readonly description =
    'Chaque bonne réponse cochée rapporte une fraction des points, chaque mauvaise en retire (minimum 0).';

  score(answer: QuestionAnswer): number {
    const { hits, wrongs, totalCorrect } = analyse(answer);
    if (totalCorrect === 0) return 0;
    return round2(answer.points * Math.max(0, (hits - wrongs) / totalCorrect));
  }
}

const registry: Readonly<Record<ScoringMode, ScoringStrategy>> = {
  all_or_nothing: new AllOrNothingStrategy(),
  partial: new PartialCreditStrategy(),
};

/** Factory / registre des stratégies. Ajouter un mode = ajouter une classe ici. */
export const ScoringStrategyFactory = {
  for(mode: ScoringMode): ScoringStrategy {
    const strategy = registry[mode];
    if (!strategy) throw new DomainError(ErrorCodes.UNKNOWN_SCORING_MODE);
    return strategy;
  },
  all(): readonly ScoringStrategy[] {
    return Object.values(registry);
  },
};

export interface ScoreBreakdown {
  readonly earned: readonly number[];
  readonly total: number;
  readonly max: number;
  readonly percentage: number;
}

export function scoreAnswers(strategy: ScoringStrategy, answers: readonly QuestionAnswer[]): ScoreBreakdown {
  const earned = answers.map((a) => strategy.score(a));
  const total = round2(earned.reduce((s, n) => s + n, 0));
  const max = round2(answers.reduce((s, a) => s + a.points, 0));
  return { earned, total, max, percentage: max === 0 ? 0 : Math.round((total / max) * 100) };
}
