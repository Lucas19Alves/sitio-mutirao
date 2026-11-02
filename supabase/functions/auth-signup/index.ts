// Cadastro por username + senha.
// O Supabase Auth recusa domínios de teste/inexistentes em /signup, então o cadastro
// passa por aqui: criamos o usuário com a Admin API usando um e-mail interno derivado
// do username (nunca recebe mensagens) e já confirmado. Senha e sessão continuam
// 100% no Supabase Auth; o login normal é feito no cliente com signInWithPassword.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const EMAIL_DOMAIN = Deno.env.get('USERNAME_EMAIL_DOMAIN') ?? 'jogadores.fazenda.invalid';
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const RESERVED = new Set(['admin', 'root', 'suporte', 'support', 'sistema', 'system', 'moderador']);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function adminKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const parsed = JSON.parse(keys);
      if (parsed.default) return parsed.default;
    } catch { /* cai no legado */ }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_body', message: 'Requisição inválida.' });
  }

  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!USERNAME_RE.test(username) || RESERVED.has(username)) {
    return json(400, { error: 'invalid_username', message: 'Use 3 a 20 caracteres: letras minúsculas, números ou _.' });
  }
  if (password.length < 8 || password.length > 72) {
    return json(400, { error: 'weak_password', message: 'A senha precisa ter entre 8 e 72 caracteres.' });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, adminKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.auth.admin.createUser({
    email: `${username}@${EMAIL_DOMAIN}`,
    password,
    email_confirm: true,
    // app_metadata não é editável pelo usuário; o trigger usa para criar o perfil.
    app_metadata: { username },
  });

  if (error) {
    const code = (error as { code?: string }).code ?? '';
    if (code === 'email_exists' || code === 'user_already_exists' || /already/i.test(error.message)) {
      return json(409, { error: 'username_taken', message: 'Esse username já está em uso.' });
    }
    if (code === 'weak_password') {
      return json(400, { error: 'weak_password', message: 'Senha fraca demais. Tente uma mais longa.' });
    }
    console.error('createUser failed', code, error.message);
    return json(500, { error: 'signup_failed', message: 'Não foi possível criar a conta agora.' });
  }

  return json(200, { ok: true, user_id: data.user?.id, email: `${username}@${EMAIL_DOMAIN}` });
});
