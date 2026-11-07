import { QrLoginLink, candidateValidator, type Candidate, type CandidateDraft, type QrBadge } from '../../domain';
import type { CandidateRepository } from '../ports';

/**
 * Gestion des candidats par l'admin : création, badges QR, activation.
 * Le jeton en clair ne sort de ce service que sous forme de lien à encoder en QR.
 */
export class CandidateAdminService {
  private readonly candidates: CandidateRepository;
  private readonly appOrigin: string;

  constructor(candidates: CandidateRepository, appOrigin: string) {
    this.candidates = candidates;
    this.appOrigin = appOrigin;
  }

  list(): Promise<Candidate[]> {
    return this.candidates.list();
  }

  async create(draft: CandidateDraft): Promise<QrBadge> {
    const normalized = { fullName: draft.fullName.trim(), phone: draft.phone.trim() };
    candidateValidator.assertValid(normalized);
    const { candidateId, loginToken } = await this.candidates.create(normalized);
    return {
      candidateId,
      fullName: normalized.fullName,
      phone: normalized.phone || null,
      loginUrl: QrLoginLink.build(this.appOrigin, loginToken),
    };
  }

  /** Nouveau badge : l'ancien QR (perdu, photographié…) cesse immédiatement de fonctionner. */
  async regenerateBadge(candidate: Pick<Candidate, 'id' | 'fullName' | 'phone'>): Promise<QrBadge> {
    const token = await this.candidates.regenerateToken(candidate.id);
    return { candidateId: candidate.id, fullName: candidate.fullName, phone: candidate.phone, loginUrl: QrLoginLink.build(this.appOrigin, token) };
  }

  /** Génère les badges d'un groupe, séquentiellement (évite de saturer la fonction). */
  async regenerateBadges(list: readonly Pick<Candidate, 'id' | 'fullName' | 'phone'>[]): Promise<QrBadge[]> {
    const badges: QrBadge[] = [];
    for (const c of list) badges.push(await this.regenerateBadge(c));
    return badges;
  }

  setActive(candidateId: string, active: boolean): Promise<void> {
    return this.candidates.setActive(candidateId, active);
  }

  delete(candidateId: string): Promise<void> {
    return this.candidates.delete(candidateId);
  }
}
