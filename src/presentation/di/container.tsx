import { createContext, useContext, type ReactNode } from 'react';
import { CandidateAdminService, QuizAdminService, QuizSessionService, type AuthGateway } from '../../application';
import { createSupabaseClient } from '../../infrastructure/supabase/client';
import { SupabaseAttemptGateway } from '../../infrastructure/repositories/SupabaseAttemptGateway';
import { SupabaseAuthGateway } from '../../infrastructure/repositories/SupabaseAuthGateway';
import { SupabaseAssignmentRepository, SupabaseCandidateRepository } from '../../infrastructure/repositories/SupabaseCandidateRepository';
import { SupabaseQuestionRepository } from '../../infrastructure/repositories/SupabaseQuestionRepository';
import { SupabaseQuizRepository } from '../../infrastructure/repositories/SupabaseQuizRepository';

export interface Services {
  readonly auth: AuthGateway;
  readonly admin: QuizAdminService;
  readonly session: QuizSessionService;
  readonly candidates: CandidateAdminService;
}

/**
 * Composition Root : le SEUL endroit qui connaît les implémentations concrètes.
 * Pour des tests d'interface, il suffit de fournir d'autres Services au Provider.
 */
export function createServices(): Services {
  const db = createSupabaseClient();
  return {
    auth: new SupabaseAuthGateway(db),
    admin: new QuizAdminService(
      new SupabaseQuizRepository(db),
      new SupabaseQuestionRepository(db),
      new SupabaseAssignmentRepository(db),
    ),
    session: new QuizSessionService(new SupabaseAttemptGateway(db)),
    candidates: new CandidateAdminService(
      new SupabaseCandidateRepository(db),
      (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) ?? window.location.origin,
    ),
  };
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices doit être utilisé sous <ServicesProvider>');
  return services;
}
