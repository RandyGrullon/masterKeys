/**
 * Cliente mínimo de Supabase por fetch — sin SDK.
 *
 * Por qué sin el SDK oficial: la app no tiene paso de compilación ni bundler,
 * y el service worker cachea una lista fija de archivos para funcionar offline.
 * Cargar el SDK desde un CDN rompería el modo offline. La API de Supabase es
 * HTTP plano (GoTrue para auth, PostgREST para datos), así que un cliente de
 * fetch es más pequeño y encaja con el modelo offline: si no hay red, la app
 * sigue funcionando con localStorage y la sincronización simplemente no corre.
 *
 * Solo se usa la clave PUBLISHABLE (pública). El acceso a datos va autenticado
 * con el token del usuario; RLS garantiza que cada quien ve solo lo suyo.
 */

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY as PUB } from './config.js';

const AUTH_KEY = 'piano-trainer:auth:v1';

let session = load(); // { access_token, refresh_token, expires_at, user }

function load() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function persist(s) {
  session = s;
  if (s) localStorage.setItem(AUTH_KEY, JSON.stringify(s));
  else localStorage.removeItem(AUTH_KEY);
}

function storeTokens(data) {
  if (!data?.access_token) return data;
  persist({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    // expires_at viene en segundos epoch; si no, se calcula con expires_in.
    expires_at: data.expires_at ?? Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    user: data.user ?? session?.user ?? null,
  });
  return data;
}

async function gotrue(path, body, params = '') {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}${params}`, {
    method: 'POST',
    headers: { apikey: PUB, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.msg || data.error_description || data.message || `Error ${res.status}`);
  return data;
}

export function currentUser() {
  return session?.user ?? null;
}
export function isSignedIn() {
  return !!session?.access_token;
}
export function userEmail() {
  return session?.user?.email ?? null;
}

export async function signUp(email, password) {
  return storeTokens(await gotrue('signup', { email, password }));
}

export async function signIn(email, password) {
  return storeTokens(await gotrue('token', { email, password }, '?grant_type=password'));
}

export function signOut() {
  persist(null);
}

/** Renueva el token si está por vencer (margen de 60 s). */
async function freshToken() {
  if (!session?.access_token) throw new Error('Sin sesión');
  const soon = (session.expires_at ?? 0) - 60 < Math.floor(Date.now() / 1000);
  if (soon && session.refresh_token) {
    try {
      storeTokens(await gotrue('token', { refresh_token: session.refresh_token }, '?grant_type=refresh_token'));
    } catch {
      persist(null);
      throw new Error('La sesión expiró, vuelve a entrar');
    }
  }
  return session.access_token;
}

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const token = await freshToken();
  const headers = {
    apikey: PUB,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Error ${res.status}`);
  }
  return res.status === 204 ? null : res.json().catch(() => null);
}

const TABLE = 'practice_sessions';

/** Sube (upsert por id) un lote de sesiones. Idempotente. */
export async function upsertSessions(rows) {
  if (!rows.length) return;
  const payload = rows.map((s) => ({
    id: s.id,
    date: s.date,
    mode: s.mode,
    assisted: !!s.assisted,
    level: s.level,
    duration_ms: Math.round(s.durationMs ?? 0),
    events: s.events ?? [],
  }));
  await rest(`${TABLE}?on_conflict=id`, {
    method: 'POST',
    body: payload,
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
}

/** Descarga todas las sesiones del usuario y las devuelve en el formato local. */
export async function fetchSessions() {
  const rows = await rest(`${TABLE}?select=*&order=date.asc`);
  return (rows ?? []).map((r) => ({
    id: r.id,
    date: r.date,
    mode: r.mode,
    assisted: r.assisted,
    level: r.level,
    durationMs: Number(r.duration_ms ?? 0),
    events: r.events ?? [],
  }));
}
