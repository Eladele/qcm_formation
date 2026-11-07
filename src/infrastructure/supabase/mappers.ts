/**
 * Data Mappers : traduisent les lignes SQL (snake_case) en entités du domaine.
 * Le domaine ne connaît jamais le format de la base.
 */
import type {
  AttemptRecord,
  AttemptResult,
  AttemptSessionData,
  AttemptStatus,
  AttemptSummary,
  AvailableQuiz,
  Question,
  Quiz,
  QuizDraft,
  ScoringMode,
} from '../../domain';

export interface QuizRow {
  id: string;
  title: string;
  description: string;
  duration_seconds: number;
  scoring_mode: ScoringMode;
  max_attempts: number;
  show_correction: boolean;
  shuffle: boolean;
  is_published: boolean;
  created_at: string;
  questions?: { count: number }[];
}

export interface QuestionRow {
  id: string;
  quiz_id: string;
  statement: string;
  points: number | string;
  position: number;
  choices: { id: string; label: string; is_correct: boolean; position: number }[];
}

export interface AttemptRow {
  id: string;
  status: AttemptStatus;
  score: number | string | null;
  max_score: number | string | null;
  started_at: string;
  submitted_at: string | null;
  profiles: { full_name: string } | { full_name: string }[] | null;
}

export interface AvailableQuizRow {
  id: string;
  title: string;
  description: string;
  duration_seconds: number;
  question_count: number | string;
  max_attempts: number;
  attempts_used: number | string;
  in_progress_attempt_id: string | null;
  last_attempt_id: string | null;
  best_score: number | string | null;
  max_score: number | string;
}

const num = (v: number | string | null | undefined): number => (v == null ? 0 : Number(v));
const numOrNull = (v: number | string | null | undefined): number | null => (v == null ? null : Number(v));

export const QuizMapper = {
  toDomain(row: QuizRow): Quiz {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      durationSeconds: row.duration_seconds,
      scoringMode: row.scoring_mode,
      maxAttempts: row.max_attempts,
      showCorrection: row.show_correction,
      shuffle: row.shuffle,
      isPublished: row.is_published,
      createdAt: row.created_at,
      questionCount: row.questions?.[0]?.count ?? 0,
    };
  },
  toRow(d: QuizDraft) {
    return {
      title: d.title,
      description: d.description,
      duration_seconds: d.durationSeconds,
      scoring_mode: d.scoringMode,
      max_attempts: d.maxAttempts,
      show_correction: d.showCorrection,
      shuffle: d.shuffle,
    };
  },
};

export const QuestionMapper = {
  toDomain(row: QuestionRow): Question {
    return {
      id: row.id,
      quizId: row.quiz_id,
      statement: row.statement,
      points: num(row.points),
      position: row.position,
      choices: [...row.choices]
        .sort((a, b) => a.position - b.position)
        .map((c) => ({ id: c.id, label: c.label, isCorrect: c.is_correct, position: c.position })),
    };
  },
};

export const AttemptMapper = {
  record(row: AttemptRow): AttemptRecord {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: row.id,
      candidateName: profile?.full_name || 'Candidat',
      status: row.status,
      score: numOrNull(row.score),
      maxScore: numOrNull(row.max_score),
      startedAt: row.started_at,
      submittedAt: row.submitted_at,
    };
  },

  available(row: AvailableQuizRow): AvailableQuiz {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      durationSeconds: row.duration_seconds,
      questionCount: num(row.question_count),
      maxAttempts: row.max_attempts,
      attemptsUsed: num(row.attempts_used),
      inProgressAttemptId: row.in_progress_attempt_id,
      lastAttemptId: row.last_attempt_id,
      bestScore: numOrNull(row.best_score),
      maxScore: num(row.max_score),
    };
  },

  /** Le JSON renvoyé par get_attempt_session est déjà en camelCase. */
  session(
    json: Omit<AttemptSessionData, 'selected' | 'clockOffsetMs' | 'questions'> & {
      serverNow: string;
      questions: {
        id: string;
        statement: string;
        points: number | string;
        choices: { id: string; label: string }[];
        selectedChoiceIds: string[];
      }[];
    },
    clockOffsetMs: number,
  ): AttemptSessionData {
    return {
      attemptId: json.attemptId,
      quizId: json.quizId,
      quizTitle: json.quizTitle,
      status: json.status,
      startedAt: json.startedAt,
      expiresAt: json.expiresAt,
      durationSeconds: json.durationSeconds,
      clockOffsetMs,
      questions: json.questions.map((q) => ({
        id: q.id,
        statement: q.statement,
        points: num(q.points),
        choices: q.choices ?? [],
      })),
      selected: Object.fromEntries(json.questions.map((q) => [q.id, q.selectedChoiceIds ?? []])),
    };
  },

  summary(json: { attemptId: string; status: AttemptStatus; score: number | string | null; maxScore: number | string | null; submittedAt: string | null }): AttemptSummary {
    return { ...json, score: num(json.score), maxScore: num(json.maxScore) };
  },

  result(json: AttemptResult & { score: number | string; maxScore: number | string }): AttemptResult {
    return {
      ...json,
      score: num(json.score),
      maxScore: num(json.maxScore),
      questions: (json.questions ?? []).map((q) => ({ ...q, points: num(q.points) })),
    };
  },
};
