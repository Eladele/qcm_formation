/**
 * POST /functions/v1/qr-login   { "token": "<jeton lu dans le QR>" }
 *   → 200 { "tokenHash": "..." }  à échanger côté client par supabase.auth.verifyOtp()
 *   → 401 { "error": "INVALID_QR" | "CANDIDATE_INACTIVE" }
 *
 * Fonctionnement : on vérifie le hash du jeton, puis on génère un « magic link »
 * pour le compte du candidat SANS envoyer d'email. Le client consomme ce lien
 * à usage unique et obtient une vraie session Supabase (JWT + refresh token),
 * donc toute la RLS existante continue de s'appliquer.
 */
import { corsHeaders, json, serviceClient, sha256Hex } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });

  let token: unknown;
  try {
    ({ token } = await req.json());
  } catch {
    return json(400, { error: 'INVALID_QR' });
  }
  if (typeof token !== 'string' || token.length < 32 || token.length > 128) {
    return json(400, { error: 'INVALID_QR' });
  }

  const admin = serviceClient();
  const tokenHash = await sha256Hex(token);

  const { data: row } = await admin
    .from('login_tokens')
    .select('id, user_id')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .maybeSingle();
  if (!row) return json(401, { error: 'INVALID_QR' });

  const { data: profile } = await admin
    .from('profiles')
    .select('role, is_active')
    .eq('id', row.user_id)
    .single();
  if (!profile || profile.role !== 'candidate') return json(401, { error: 'INVALID_QR' });
  if (!profile.is_active) return json(401, { error: 'CANDIDATE_INACTIVE' });

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(row.user_id);
  if (userError || !userData.user?.email) return json(401, { error: 'INVALID_QR' });

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: userData.user.email,
  });
  if (linkError || !link.properties?.hashed_token) return json(500, { error: 'UNEXPECTED' });

  await admin.from('login_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', row.id);

  return json(200, { tokenHash: link.properties.hashed_token });
});
