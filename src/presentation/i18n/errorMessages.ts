import { DomainError, ValidationError, type ErrorCode } from '../../domain';

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  QUESTION_MUST_HAVE_4_CHOICES: 'Une question doit comporter exactement 4 choix.',
  QUESTION_CORRECT_COUNT_1_TO_3: 'Une question doit avoir entre 1 et 3 bonnes réponses.',
  QUESTION_NOT_FOUND: "Cette question n'existe plus.",
  QUESTION_NOT_IN_QUIZ: "Cette question n'appartient pas à ce test.",
  QUIZ_EMPTY: 'Impossible de publier un test sans question.',
  QUIZ_NOT_AVAILABLE: "Ce test n'est pas disponible.",
  LAST_QUESTION_OF_PUBLISHED_QUIZ: "Dépubliez le test avant d'en supprimer la dernière question.",
  MAX_ATTEMPTS_REACHED: 'Vous avez atteint le nombre maximal de tentatives pour ce test.',
  ATTEMPT_NOT_FOUND: 'Tentative introuvable.',
  ATTEMPT_CLOSED: 'Ce test est déjà terminé.',
  ATTEMPT_EXPIRED: 'Le temps imparti est écoulé.',
  ATTEMPT_IN_PROGRESS: 'Le test est encore en cours.',
  TOO_MANY_CHOICES: 'Vous pouvez cocher au maximum 3 réponses (au moins une est fausse).',
  INVALID_CHOICE: 'Choix invalide.',
  FORBIDDEN: "Vous n'avez pas les droits nécessaires.",
  UNAUTHENTICATED: 'Veuillez vous connecter.',
  INVALID_CREDENTIALS: 'Email ou mot de passe incorrect.',
  INVALID_QR: 'QR code invalide ou expiré. Demandez un nouveau badge à votre administrateur.',
  CANDIDATE_INACTIVE: 'Votre compte est désactivé. Contactez votre administrateur.',
  CANDIDATE_NOT_FOUND: 'Candidat introuvable.',
  NOT_ASSIGNED: "Ce test ne vous est pas attribué.",
  QUIZ_NO_CANDIDATES: 'Affectez au moins un candidat avant de lancer le test.',
  NETWORK: 'Connexion au serveur impossible. Vérifiez votre réseau.',
};

export function messageFor(error: unknown): string {
  if (error instanceof ValidationError) return error.issues.map((i) => i.message).join(' ');
  if (error instanceof DomainError) return MESSAGES[error.code] ?? error.message;
  return error instanceof Error ? error.message : 'Une erreur inattendue est survenue.';
}
