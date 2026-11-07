import { DomainError, ErrorCodes, type ErrorCode } from './DomainError';

/**
 * Pattern Specification : chaque règle métier est un objet isolé, testable,
 * composable. Le Validator applique une liste de règles et collecte les violations.
 */
export interface ValidationIssue {
  readonly code: ErrorCode;
  readonly message: string;
  /** Champ concerné (ex. "statement", "choices.2") pour l'affichage dans le formulaire */
  readonly field?: string;
}

export interface Rule<T> {
  check(candidate: T): readonly ValidationIssue[];
}

/** Règle simple : un prédicat → au plus une violation. */
export function rule<T>(
  code: ErrorCode,
  message: string,
  isSatisfiedBy: (candidate: T) => boolean,
  field?: string,
): Rule<T> {
  return {
    check: (candidate) => (isSatisfiedBy(candidate) ? [] : [{ code, message, field }]),
  };
}

/** Règle appliquée à chaque élément d'une collection (ex. chaque choix). */
export function eachRule<T, I>(
  select: (candidate: T) => readonly I[],
  code: ErrorCode,
  message: (index: number) => string,
  isSatisfiedBy: (item: I) => boolean,
  fieldPrefix: string,
): Rule<T> {
  return {
    check: (candidate) =>
      select(candidate).flatMap((item, index) =>
        isSatisfiedBy(item) ? [] : [{ code, message: message(index), field: `${fieldPrefix}.${index}` }],
      ),
  };
}

export class ValidationError extends DomainError {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(ErrorCodes.VALIDATION_FAILED, issues.map((i) => i.message).join(' '));
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

export class Validator<T> {
  private readonly rules: readonly Rule<T>[];

  constructor(rules: readonly Rule<T>[]) {
    this.rules = rules;
  }

  validate(candidate: T): ValidationIssue[] {
    return this.rules.flatMap((r) => r.check(candidate));
  }

  isValid(candidate: T): boolean {
    return this.validate(candidate).length === 0;
  }

  assertValid(candidate: T): void {
    const issues = this.validate(candidate);
    if (issues.length > 0) throw new ValidationError(issues);
  }
}
