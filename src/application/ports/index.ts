/**
 * Ports (architecture hexagonale) : l'application définit les contrats,
 * l'infrastructure (Supabase) les implémente. On peut remplacer Supabase
 * par une API REST ou des fakes en mémoire sans toucher au métier.
 */
import type {
  AttemptRecord,
  AttemptResult,
  AttemptSessionData,
  AttemptSummary,
  AvailableQuiz,
  Candidate,
  CandidateDraft,
  Question,
  QuestionDraft,
  Quiz,
  QuizDraft,
} from '../../domain';

export interface QuizRepository {
  list(): Promise<Quiz[]>;
  getById(id: string): Promise<Quiz | null>;
  create(draft: QuizDraft): Promise<Quiz>;
  update(id: string, draft: QuizDraft): Promise<Quiz>;
  setPublished(id: string, published: boolean): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface QuestionRepository {
  listByQuiz(quizId: string): Promise<Question[]>;
  /** Crée (questionId absent) ou met à jour une question et ses 4 choix de façon atomique. */
  save(quizId: string, draft: QuestionDraft, questionId?: string): Promise<string>;
  delete(questionId: string): Promise<void>;
}

export interface AttemptGateway {
  listAvailable(): Promise<AvailableQuiz[]>;
  start(quizId: string): Promise<string>;
  loadSession(attemptId: string): Promise<AttemptSessionData>;
  saveAnswer(attemptId: string, questionId: string, choiceIds: readonly string[]): Promise<void>;
  submit(attemptId: string): Promise<AttemptSummary>;
  getResult(attemptId: string): Promise<AttemptResult>;
  listByQuiz(quizId: string): Promise<AttemptRecord[]>;
}

export type UserRole = 'admin' | 'candidate';

export interface AppUser {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly role: UserRole;
}

export interface AuthGateway {
  currentUser(): Promise<AppUser | null>;
  signIn(email: string, password: string): Promise<AppUser>;
  /** Échange le jeton lu dans le QR contre une session Supabase. */
  signInWithQrToken(token: string): Promise<AppUser>;
  signOut(): Promise<void>;
  onAuthChange(listener: () => void): () => void;
}

export interface CandidateRepository {
  list(): Promise<Candidate[]>;
  /** Crée le compte et renvoie le jeton QR en clair (une seule fois). */
  create(draft: CandidateDraft): Promise<{ candidateId: string; loginToken: string }>;
  /** Invalide l'ancien QR et renvoie un nouveau jeton. */
  regenerateToken(candidateId: string): Promise<string>;
  setActive(candidateId: string, active: boolean): Promise<void>;
  delete(candidateId: string): Promise<void>;
}

export interface AssignmentRepository {
  listCandidateIds(quizId: string): Promise<string[]>;
  /** Remplace l'ensemble des candidats affectés au test. */
  replace(quizId: string, candidateIds: readonly string[]): Promise<void>;
}
