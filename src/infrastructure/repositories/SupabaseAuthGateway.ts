import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppUser, AuthGateway, UserRole } from '../../application';
import { call, toDomainError } from '../supabase/errors';
import { invokeFunction } from '../supabase/functions';

export class SupabaseAuthGateway implements AuthGateway {
  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  async currentUser(): Promise<AppUser | null> {
    const { data } = await this.db.auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    const profile = await call<{ full_name: string; role: UserRole } | null>(() =>
      this.db.from('profiles').select('full_name, role').eq('id', user.id).maybeSingle(),
    );
    return {
      id: user.id,
      email: user.email ?? '',
      fullName: profile?.full_name || user.email || '',
      role: profile?.role ?? 'candidate',
    };
  }

  async signIn(email: string, password: string): Promise<AppUser> {
    const { error } = await this.db.auth.signInWithPassword({ email, password });
    if (error) throw toDomainError(error);
    const user = await this.currentUser();
    if (!user) throw toDomainError(new Error('UNAUTHENTICATED'));
    return user;
  }

  /**
   * 1. L'Edge Function vérifie le jeton du QR et renvoie un lien magique à usage unique.
   * 2. verifyOtp consomme ce lien et ouvre une vraie session Supabase (JWT).
   */
  async signInWithQrToken(token: string): Promise<AppUser> {
    await this.db.auth.signOut(); // évite de mélanger avec une session précédente sur l'appareil
    const { tokenHash } = await invokeFunction<{ tokenHash: string }>(this.db, 'qr-login', { token });
    const { error } = await this.db.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
    if (error) throw toDomainError(new Error('INVALID_QR'));
    const user = await this.currentUser();
    if (!user) throw toDomainError(new Error('INVALID_QR'));
    return user;
  }

  async signOut(): Promise<void> {
    await this.db.auth.signOut();
  }

  onAuthChange(listener: () => void): () => void {
    const { data } = this.db.auth.onAuthStateChange(() => listener());
    return () => data.subscription.unsubscribe();
  }
}
