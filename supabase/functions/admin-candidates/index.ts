/**
 * POST /functions/v1/admin-candidates   (réservé aux administrateurs)
 *
 *   { action: "create",     fullName, phone? } → { candidateId, loginToken }
 *   { action: "regenerate", candidateId }      → { loginToken }   (l'ancien QR est invalidé)
 *   { action: "set-active", candidateId, active }
 *   { action: "delete",     candidateId }
 *
 * Le jeton en clair n'est renvoyé qu'UNE fois, pour générer le QR ; la base n'en garde que le hash.
 */
import { callerClient, corsHeaders, generateToken, json, serviceClient, sha256Hex } from '../_shared/utils.ts';

const EMAIL_DOMAIN = Deno.env.get('CANDIDATE_EMAIL_DOMAIN') ?? 'candidats.examina.app';
const PHONE_RE = /^\+?[0-9 .-]{6,20}$/;

async function issueToken(admin: ReturnType<typeof serviceClient>, userId: string): Promise<string> {
  await admin.from('login_tokens').update({ revoked_at: new Date().toISOString() }).eq('user_id', userId).is('revoked_at', null);
  const token = generateToken();
  const { error } = await admin.from('login_tokens').insert({ user_id: userId, token_hash: await sha256Hex(token) });
  if (error) throw error;
  return token;
}

async function assertCandidate(admin: ReturnType<typeof serviceClient>, id: unknown): Promise<string> {
  if (typeof id !== 'string') throw new Error('CANDIDATE_NOT_FOUND');
  const { data } = await admin.from('profiles').select('role').eq('id', id).maybeSingle();
  if (!data || data.role !== 'candidate') throw new Error('CANDIDATE_NOT_FOUND');
  return id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });

  // 1. L'appelant doit être un administrateur (vérifié avec SON jeton, via la RLS)
  const { data: isAdmin } = await callerClient(req).rpc('is_admin');
  if (isAdmin !== true) return json(403, { error: 'FORBIDDEN' });

  const admin = serviceClient();
  const body = await req.json().catch(() => ({}));

  try {
    switch (body.action) {
      case 'create': {
        const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
        const phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null;
        if (fullName.length < 2 || fullName.length > 100) return json(400, { error: 'CANDIDATE_NAME_INVALID' });
        if (phone && !PHONE_RE.test(phone)) return json(400, { error: 'CANDIDATE_PHONE_INVALID' });

        // Email technique jamais utilisé pour envoyer de courrier : le candidat ne le connaît pas
        const { data, error } = await admin.auth.admin.createUser({
          email: `${crypto.randomUUID()}@${EMAIL_DOMAIN}`,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        if (error || !data.user) throw error ?? new Error('UNEXPECTED');

        // Le trigger handle_new_user a créé le profil (rôle candidat)
        await admin.from('profiles').update({ full_name: fullName, phone }).eq('id', data.user.id);
        const loginToken = await issueToken(admin, data.user.id);
        return json(200, { candidateId: data.user.id, loginToken });
      }

      case 'regenerate': {
        const id = await assertCandidate(admin, body.candidateId);
        return json(200, { loginToken: await issueToken(admin, id) });
      }

      case 'set-active': {
        const id = await assertCandidate(admin, body.candidateId);
        await admin.from('profiles').update({ is_active: body.active === true }).eq('id', id);
        if (body.active !== true) await admin.auth.admin.signOut(id).catch(() => undefined);
        return json(200, { ok: true });
      }

      case 'delete': {
        const id = await assertCandidate(admin, body.candidateId);
        const { error } = await admin.auth.admin.deleteUser(id); // cascade : profil, QR, tentatives
        if (error) throw error;
        return json(200, { ok: true });
      }

      default:
        return json(400, { error: 'UNKNOWN_ACTION' });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json(message === 'CANDIDATE_NOT_FOUND' ? 404 : 500, { error: message });
  }
});
