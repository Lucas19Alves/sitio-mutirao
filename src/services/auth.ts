import { supabase, EMAIL_DOMAIN, SUPABASE_URL, SUPABASE_KEY } from './supabase.ts';

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const toEmail = (username: string) => `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

export function validateUsername(u: string): string | null {
  const v = u.trim().toLowerCase();
  if (v.length < 3) return 'O username precisa de pelo menos 3 caracteres.';
  if (v.length > 20) return 'O username pode ter no máximo 20 caracteres.';
  if (!USERNAME_RE.test(v)) return 'Use apenas letras minúsculas, números e _.';
  return null;
}

export function validatePassword(p: string): string | null {
  if (p.length < 8) return 'A senha precisa de pelo menos 8 caracteres.';
  if (p.length > 72) return 'A senha pode ter no máximo 72 caracteres.';
  return null;
}

/** Cadastro via Edge Function (cria o usuário no Supabase Auth) e login em seguida. */
export async function signUp(username: string, password: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/auth-signup`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: username.trim().toLowerCase(), password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? 'Não foi possível criar a conta.');
  return signIn(username, password);
}

export async function signIn(username: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: toEmail(username), password });
  if (error) {
    if (/invalid login credentials/i.test(error.message)) throw new Error('Username ou senha incorretos.');
    throw new Error('Não foi possível entrar agora. Verifique a conexão.');
  }
  return data.session;
}

export const signOut = () => supabase.auth.signOut();

export async function changePassword(current: string, next: string, username: string) {
  const err = validatePassword(next);
  if (err) throw new Error(err);
  // confirma a senha atual antes de trocar
  const { error: e1 } = await supabase.auth.signInWithPassword({ email: toEmail(username), password: current });
  if (e1) throw new Error('A senha atual está incorreta.');
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) throw new Error(error.message.includes('different') ? 'A nova senha precisa ser diferente da atual.' : 'Não foi possível alterar a senha.');
}
