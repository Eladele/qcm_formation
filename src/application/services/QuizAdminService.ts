import {
  DomainError,
  ErrorCodes,
  QuestionDraftFactory,
  QuizDraftFactory,
  QuizPublicationPolicy,
  questionValidator,
  quizValidator,
  type Question,
  type QuestionDraft,
  type Quiz,
  type QuizDraft,
} from '../../domain';
import type { AssignmentRepository, QuestionRepository, QuizRepository } from '../ports';

/**
 * Cas d'utilisation de l'administrateur.
 * Valide TOUJOURS avant d'appeler le dépôt (fail fast, messages précis),
 * la base de données revalide ensuite (défense en profondeur).
 */
export class QuizAdminService {
  private readonly quizzes: QuizRepository;
  private readonly questions: QuestionRepository;
  private readonly assignments: AssignmentRepository;

  constructor(quizzes: QuizRepository, questions: QuestionRepository, assignments: AssignmentRepository) {
    this.quizzes = quizzes;
    this.questions = questions;
    this.assignments = assignments;
  }

  listQuizzes(): Promise<Quiz[]> {
    return this.quizzes.list();
  }

  async getQuiz(id: string): Promise<Quiz> {
    const quiz = await this.quizzes.getById(id);
    if (!quiz) throw new DomainError(ErrorCodes.QUIZ_NOT_AVAILABLE);
    return quiz;
  }

  async createQuiz(draft: QuizDraft): Promise<Quiz> {
    const normalized = QuizDraftFactory.normalize(draft);
    quizValidator.assertValid(normalized);
    return this.quizzes.create(normalized);
  }

  async updateQuiz(id: string, draft: QuizDraft): Promise<Quiz> {
    const normalized = QuizDraftFactory.normalize(draft);
    quizValidator.assertValid(normalized);
    return this.quizzes.update(id, normalized);
  }

  /**
   * Lancer = rendre le test disponible aux candidats affectés.
   * Le chronomètre de chaque candidat ne démarre qu'à SON clic sur « Commencer ».
   */
  async launch(quizId: string): Promise<void> {
    const [questions, assigned] = await Promise.all([
      this.questions.listByQuiz(quizId),
      this.assignments.listCandidateIds(quizId),
    ]);
    QuizPublicationPolicy.assertCanLaunch(questions.length, assigned.length);
    await this.quizzes.setPublished(quizId, true);
  }

  /** Clôturer : plus aucun nouveau départ ; les tentatives en cours vont jusqu'à leur échéance. */
  close(quizId: string): Promise<void> {
    return this.quizzes.setPublished(quizId, false);
  }

  listAssignedCandidateIds(quizId: string): Promise<string[]> {
    return this.assignments.listCandidateIds(quizId);
  }

  assignCandidates(quizId: string, candidateIds: readonly string[]): Promise<void> {
    return this.assignments.replace(quizId, [...new Set(candidateIds)]);
  }

  deleteQuiz(id: string): Promise<void> {
    return this.quizzes.delete(id);
  }

  listQuestions(quizId: string): Promise<Question[]> {
    return this.questions.listByQuiz(quizId);
  }

  uploadQuestionImage(file: File): Promise<string> {
    return this.questions.uploadImage(file);
  }

  async saveQuestion(quizId: string, draft: QuestionDraft, questionId?: string): Promise<string> {
    const normalized = QuestionDraftFactory.normalize(draft);
    questionValidator.assertValid(normalized);
    return this.questions.save(quizId, normalized, questionId);
  }

  async deleteQuestion(quiz: Quiz, questionId: string): Promise<void> {
    const questions = await this.questions.listByQuiz(quiz.id);
    QuizPublicationPolicy.assertCanDeleteQuestion(quiz, questions.length);
    await this.questions.delete(questionId);
  }
}
