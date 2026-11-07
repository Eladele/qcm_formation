import { describe, expect, it } from 'vitest';
import {
  AnswerSheet,
  AllOrNothingStrategy,
  Countdown,
  DomainError,
  Duration,
  ErrorCodes,
  PartialCreditStrategy,
  QuestionDraftFactory,
  ServerSyncedClock,
  questionValidator,
  QrLoginLink,
  candidateValidator,
  scoreAnswers,
  timerUrgency,
  type Clock,
  type QuestionDraft,
  type Scheduler,
} from './index';

const draft = (correct: boolean[], labels = ['a', 'b', 'c', 'd']): QuestionDraft => ({
  statement: 'Quelle est la capitale ?',
  points: 2,
  choices: labels.map((label, i) => ({ label, isCorrect: correct[i] ?? false })),
});

const codes = (d: QuestionDraft) => questionValidator.validate(d).map((i) => i.code);

describe('Règles de question', () => {
  it.each([[[true, false, false, false]], [[true, true, false, false]], [[true, true, true, false]]])(
    'accepte 1 à 3 bonnes réponses (%j)',
    (correct) => expect(questionValidator.isValid(draft(correct))).toBe(true),
  );

  it('refuse 0 bonne réponse', () => {
    expect(codes(draft([false, false, false, false]))).toContain(ErrorCodes.QUESTION_CORRECT_COUNT_1_TO_3);
  });

  it('refuse 4 bonnes réponses (il faut au moins une réponse fausse)', () => {
    expect(codes(draft([true, true, true, true]))).toContain(ErrorCodes.QUESTION_CORRECT_COUNT_1_TO_3);
  });

  it('exige exactement 4 choix', () => {
    const d = { ...draft([true]), choices: draft([true]).choices.slice(0, 3) };
    expect(codes(d)).toContain(ErrorCodes.QUESTION_MUST_HAVE_4_CHOICES);
  });

  it('signale les choix vides et dupliqués avec le champ concerné', () => {
    const issues = questionValidator.validate(draft([true], ['Paris', '', 'paris ', 'Rome']));
    expect(issues.find((i) => i.code === ErrorCodes.QUESTION_CHOICE_EMPTY)?.field).toBe('choices.1');
    expect(issues.map((i) => i.code)).toContain(ErrorCodes.QUESTION_CHOICES_DUPLICATED);
  });

  it("le brouillon empêche de cocher une 4e bonne réponse", () => {
    let d = QuestionDraftFactory.empty();
    for (const i of [0, 1, 2, 3]) d = QuestionDraftFactory.toggleCorrect(d, i);
    expect(d.choices.map((c) => c.isCorrect)).toEqual([true, true, true, false]);
    expect(QuestionDraftFactory.canToggleCorrect(d, 3)).toBe(false);
    expect(QuestionDraftFactory.canToggleCorrect(d, 0)).toBe(true);
  });

  it('gère les images et la durée individuelle par question', () => {
    let d = QuestionDraftFactory.empty();
    d = QuestionDraftFactory.withImageUrl(d, 'https://example.com/schema.png');
    d = QuestionDraftFactory.withDurationSeconds(d, 90);
    expect(d.imageUrl).toBe('https://example.com/schema.png');
    expect(d.durationSeconds).toBe(90);

    const normalized = QuestionDraftFactory.normalize(d);
    expect(normalized.imageUrl).toBe('https://example.com/schema.png');
    expect(normalized.durationSeconds).toBe(90);
  });
});

describe('Stratégies de notation', () => {
  const answer = (selected: string[]) => ({
    points: 4,
    correctChoiceIds: new Set(['a', 'b']),
    selectedChoiceIds: new Set(selected),
  });

  it('tout ou rien', () => {
    const s = new AllOrNothingStrategy();
    expect(s.score(answer(['a', 'b']))).toBe(4);
    expect(s.score(answer(['a']))).toBe(0);
    expect(s.score(answer(['a', 'b', 'c']))).toBe(0);
    expect(s.score(answer([]))).toBe(0);
  });

  it('crédit partiel avec pénalité, plancher à 0', () => {
    const s = new PartialCreditStrategy();
    expect(s.score(answer(['a', 'b']))).toBe(4);
    expect(s.score(answer(['a']))).toBe(2);
    expect(s.score(answer(['a', 'c']))).toBe(0);
    expect(s.score(answer(['c', 'd']))).toBe(0);
  });

  it('agrège le score et le pourcentage', () => {
    const r = scoreAnswers(new PartialCreditStrategy(), [answer(['a', 'b']), answer(['a'])]);
    expect(r).toMatchObject({ total: 6, max: 8, percentage: 75 });
  });
});

describe('Duration', () => {
  it('formate en HH:MM:SS', () => {
    expect(Duration.fromSeconds(3725).format()).toBe('01:02:05');
    expect(Duration.fromSeconds(0).format()).toBe('00:00:00');
    expect(Duration.fromParts(26, 0, 9).format()).toBe('26:00:09');
  });

  it('arrondit au supérieur et ne devient jamais négatif', () => {
    expect(Duration.fromMs(400).format()).toBe('00:00:01');
    expect(Duration.fromMs(-5000).isZero()).toBe(true);
  });
});

class FakeClock implements Clock {
  constructor(public t = 0) {}
  now() {
    return this.t;
  }
}

class ManualScheduler implements Scheduler {
  private fn: (() => void) | null = null;
  every(_ms: number, fn: () => void) {
    this.fn = fn;
    return () => {
      this.fn = null;
    };
  }
  tick() {
    this.fn?.();
  }
  get active() {
    return this.fn !== null;
  }
}

describe('Countdown', () => {
  it("notifie à chaque seconde puis une seule fois à l'expiration", () => {
    const clock = new FakeClock(0);
    const scheduler = new ManualScheduler();
    const countdown = new Countdown(3000, clock, scheduler);
    const seen: string[] = [];
    let expired = 0;
    countdown.subscribe((r) => seen.push(r.format()));
    countdown.onExpire(() => expired++);
    countdown.start();

    clock.t = 500;
    scheduler.tick(); // même seconde affichée → pas de notification
    clock.t = 1000;
    scheduler.tick();
    clock.t = 3200;
    scheduler.tick();
    scheduler.tick();

    expect(seen).toEqual(['00:00:03', '00:00:03', '00:00:02', '00:00:00']);
    expect(expired).toBe(1);
    expect(scheduler.active).toBe(false);
  });

  it("se cale sur l'horloge du serveur", () => {
    const local = new FakeClock(10_000);
    // Serveur en avance de 60 s, réponse reçue après 200 ms aller-retour
    const clock = ServerSyncedClock.fromRoundTrip(70_100, 10_000, 10_200, local);
    expect(clock.offset).toBe(60_000);
    expect(new Countdown(130_000, clock).remaining().totalSeconds).toBe(60);
  });

  it("calcule l'urgence", () => {
    const total = Duration.fromSeconds(1000);
    expect(timerUrgency(Duration.fromSeconds(500), total)).toBe('normal');
    expect(timerUrgency(Duration.fromSeconds(150), total)).toBe('warning');
    expect(timerUrgency(Duration.fromSeconds(30), total)).toBe('critical');
  });
});

describe('AnswerSheet', () => {
  it('est immuable et limite la sélection à 3 cases', () => {
    const empty = AnswerSheet.empty();
    const s = empty.toggle('q', 'a').toggle('q', 'b').toggle('q', 'c');
    expect(empty.answeredCount).toBe(0);
    expect(s.toArray('q')).toEqual(['a', 'b', 'c']);
    expect(() => s.toggle('q', 'd')).toThrow(DomainError);
    expect(s.toggle('q', 'a').toggle('q', 'b').toggle('q', 'c').isAnswered('q')).toBe(false);
  });
});

describe('Connexion QR', () => {
  const token = 'a'.repeat(43);
  it('place le jeton dans le fragment (#) et le relit', () => {
    const url = QrLoginLink.build('https://examen.fr/', token);
    expect(url).toBe(`https://examen.fr/qr#t=${token}`);
    expect(QrLoginLink.parse(new URL(url).hash)).toBe(token);
  });
  it('rejette un jeton malformé', () => {
    expect(QrLoginLink.parse('#t=court')).toBeNull();
    expect(QrLoginLink.parse('#t=<script>alert(1)</script>xxxxxxxxxxxxxxxxxxxxxxxx')).toBeNull();
    expect(QrLoginLink.parse('')).toBeNull();
  });
  it('valide le candidat', () => {
    expect(candidateValidator.isValid({ fullName: 'Amina B.', phone: '' })).toBe(true);
    expect(candidateValidator.isValid({ fullName: 'Amina B.', phone: '+213 555 12 34 56' })).toBe(true);
    expect(candidateValidator.validate({ fullName: 'A', phone: 'abc' }).map((i) => i.code)).toEqual([
      ErrorCodes.CANDIDATE_NAME_INVALID,
      ErrorCodes.CANDIDATE_PHONE_INVALID,
    ]);
  });
});
