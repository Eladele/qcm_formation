import { ErrorCodes } from '../shared/DomainError';
import { Validator, rule } from '../shared/Validation';

export interface Candidate {
  readonly id: string;
  readonly fullName: string;
  readonly phone: string | null;
  readonly isActive: boolean;
  readonly createdAt: string;
  /** Un QR valide existe (non révoqué). */
  readonly hasActiveQr: boolean;
  readonly lastLoginAt: string | null;
}

export interface CandidateDraft {
  readonly fullName: string;
  readonly phone: string;
}

/** Badge imprimable : le jeton en clair n'existe qu'à cet instant, jamais en base. */
export interface QrBadge {
  readonly candidateId: string;
  readonly fullName: string;
  readonly loginUrl: string;
  /** Numéro de téléphone pour le partage WhatsApp (null si non renseigné). */
  readonly phone: string | null;
}

export const CANDIDATE_RULES = { NAME_MIN: 2, NAME_MAX: 100, PHONE_PATTERN: /^\+?[0-9 .-]{6,20}$/ } as const;

export const candidateValidator = new Validator<CandidateDraft>([
  rule(
    ErrorCodes.CANDIDATE_NAME_INVALID,
    `Le nom doit contenir entre ${CANDIDATE_RULES.NAME_MIN} et ${CANDIDATE_RULES.NAME_MAX} caractères.`,
    (d) => d.fullName.trim().length >= CANDIDATE_RULES.NAME_MIN && d.fullName.trim().length <= CANDIDATE_RULES.NAME_MAX,
    'fullName',
  ),
  rule(
    ErrorCodes.CANDIDATE_PHONE_INVALID,
    'Numéro de téléphone invalide.',
    (d) => d.phone.trim() === '' || CANDIDATE_RULES.PHONE_PATTERN.test(d.phone.trim()),
    'phone',
  ),
]);

/**
 * Format du lien encodé dans le QR.
 * Le jeton est placé dans le FRAGMENT (#) : le navigateur ne l'envoie jamais
 * au serveur web, il n'apparaît donc ni dans les logs ni dans l'en-tête Referer.
 */
export const QrLoginLink = {
  PATH: '/qr',
  build(origin: string, token: string): string {
    return `${origin.replace(/\/$/, '')}${QrLoginLink.PATH}#t=${encodeURIComponent(token)}`;
  },
  parse(hash: string): string | null {
    const token = new URLSearchParams(hash.replace(/^#/, '')).get('t');
    return token && /^[A-Za-z0-9_-]{32,128}$/.test(token) ? token : null;
  },
};
