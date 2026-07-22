/**
 * Sincronización offline-first.
 *
 * localStorage es la fuente de verdad; la nube es un espejo. El flujo:
 *   1. subir las sesiones locales que aún no están en la nube
 *   2. bajar las sesiones remotas que faltan en local y fundirlas
 *
 * Como una sesión de práctica es un registro inmutable (lo que pasó, con su id),
 * no hay conflictos: la unión por id resuelve todo. Si no hay red o no hay
 * sesión, no pasa nada — la app sigue con sus datos locales.
 */

import { unsyncedSessions, markSynced, mergeRemote } from '../store.js';
import { isSignedIn, upsertSessions, fetchSessions } from './supabase.js';

let syncing = false;

export async function syncNow() {
  if (!isSignedIn()) return { ok: false, reason: 'no-auth' };
  if (!navigator.onLine) return { ok: false, reason: 'offline' };
  if (syncing) return { ok: false, reason: 'busy' };
  syncing = true;
  try {
    // 1. Subir lo local pendiente.
    const pending = unsyncedSessions();
    if (pending.length) {
      await upsertSessions(pending);
      markSynced(pending.map((s) => s.id));
    }
    // 2. Bajar y fundir lo remoto.
    const remote = await fetchSessions();
    const added = mergeRemote(remote);

    return { ok: true, pushed: pending.length, pulled: added };
  } catch (err) {
    return { ok: false, reason: 'error', message: err.message };
  } finally {
    syncing = false;
  }
}
