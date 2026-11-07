import { describe, expect, it } from 'vitest';
import { DomainError, ErrorCodes, ValidationError, type Question, type QuestionDraft, type Quiz } from '../../domain';
import type { AssignmentRepository, QuestionRepository, QuizRepository } from '../ports';
import { AnswerSyncQueue } from './AnswerSyncQueue';
import { QuizAdminService } from './QuizAdminService';

describe('AnswerSyncQueue', () => {
  it('fusionne les clics rapides et envoie la dernière sélection', async () => {
    const calls: string[] = [];
    const queue = new AnswerSyncQueue(async (q, ids) => {
      calls.push(`${q}:${ids.join(',')}`);
    });
    queue.enqueue('q1', ['a']);
    queue.enqueue('q2', ['x']);
    queue.enqueue('q2', ['x', 'y']);
    await queue.flush();
    expect(calls).toEqual(['q1:a', 'q2:x,y']);
  });

  it("ne réessaie pas une erreur métier et la remonte au flush", async () => {
    let calls = 0;
    const queue = new AnswerSyncQueue(async () => {
      calls++;
      throw new DomainError(ErrorCodes.ATTEMPT_EXPIRED);
    }, { retryDelayMs: 1 });
    queue.enqueue('q1', ['a']);
    await expect(queue.flush()).rejects.toMatchObject({ code: ErrorCodes.ATTEMPT_EXPIRED });
    expect(calls).toBe(1);
    expect(queue.pendingCount).toBe(1);
  });

  it('réessaie les erreurs réseau', async () => {
    let calls = 0;
    const queue = new AnswerSyncQueue(async () => {
      if (++calls < 3) throw new DomainError(ErrorCodes.NETWORK);
    }, { retryDelayMs: 1 });
    queue.enqueue('q1', ['a']);
    await queue.flush();
    expect(calls).toBe(3);
  });
});

describe('QuizAdminService', () => {
  const quiz: Quiz = {
    id: 'z', title: 'Test', description: '', durationSeconds: 600, scoringMode: 'partial',
    maxAttempts: 1, showCorrection: true, shuffle: true, isPublished: true, questionCount: 1, createdAt: '',
  };
  const fakeQuestions = (list: Question[]): QuestionRepository & { saved: QuestionDraft[] } => ({
    saved: [],
    async listByQuiz() { return list; },
    async save(_q, d) { this.saved.push(d); return 'new-id'; },
    async delete() {},
  });
  const fakeQuizzes = { async setPublished() {} } as unknown as QuizRepository;
  const assignments = (ids: string[]): AssignmentRepository => ({ async listCandidateIds() { return ids; }, async replace() {} });

  it('valide et normalise avant de persister', async () => {
    const repo = fakeQuestions([]);
    const service = new QuizAdminService(fakeQuizzes, repo, assignments([]));
    await service.saveQuestion('z', {
      statement: '  2 + 2 ?  ', points: 1,
      choices: [{ label: '4', isCorrect: true }, { label: '5', isCorrect: false }, { label: '22', isCorrect: false }, { label: ' IV ', isCorrect: true }],
    });
    expect(repo.saved[0]?.statement).toBe('2 + 2 ?');
    expect(repo.saved[0]?.choices[3]?.label).toBe('IV');
  });

  it("n'appelle pas le dépôt si la question est invalide", async () => {
    const repo = fakeQuestions([]);
    const service = new QuizAdminService(fakeQuizzes, repo, assignments([]));
    await expect(service.saveQuestion('z', {
      statement: 'Q', points: 1,
      choices: ['a', 'b', 'c', 'd'].map((label) => ({ label, isCorrect: true })),
    })).rejects.toBeInstanceOf(ValidationError);
    expect(repo.saved).toHaveLength(0);
  });

  it("interdit de supprimer la dernière question d'un test publié", async () => {
    const service = new QuizAdminService(fakeQuizzes, fakeQuestions([{ id: 'q' } as Question]), assignments([]));
    await expect(service.deleteQuestion(quiz, 'q')).rejects.toMatchObject({
      code: ErrorCodes.LAST_QUESTION_OF_PUBLISHED_QUIZ,
    });
  });

  it('refuse de lancer un test sans candidat affecté', async () => {
    const service = new QuizAdminService(fakeQuizzes, fakeQuestions([{ id: 'q' } as Question]), assignments([]));
    await expect(service.launch('z')).rejects.toMatchObject({ code: ErrorCodes.QUIZ_NO_CANDIDATES });
  });

  it('lance un test avec questions et candidats', async () => {
    const service = new QuizAdminService(fakeQuizzes, fakeQuestions([{ id: 'q' } as Question]), assignments(['u1']));
    await expect(service.launch('z')).resolves.toBeUndefined();
  });
});
