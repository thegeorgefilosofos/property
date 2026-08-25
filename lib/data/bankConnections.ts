// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΤΡΑΠΕΖΙΚΕΣ ΣΥΝΔΕΣΕΙΣ, ΟΠΩΣ ΤΙΣ ΔΙΑΒΑΖΕΙ Η ΕΦΑΡΜΟΓΗ
// ─────────────────────────────────────────────────────────────────────────
// Ο πίνακας κρατά ό,τι επιτρέπεται να δει ο ιδιοκτήτης: ποια τράπεζα, σε τι
// κατάσταση, πότε λήγει η άδεια. Το αναγνωριστικό του παρόχου ζει σε άλλον
// πίνακα, μόνο-υπηρεσίας και δεν φτάνει ποτέ εδώ.
//
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ ΣΤΡΩΜΑ ΚΑΙ ΟΧΙ ΑΠΕΥΘΕΙΑΣ ΕΡΩΤΗΜΑΤΑ. Η κατάσταση που βλέπει ο
// χρήστης δεν είναι η στήλη `status`: είναι η στήλη ΜΑΖΙ με την ημερομηνία
// λήξης, γιατί ο πάροχος ενημερώνει την κατάστασή του με καθυστέρηση
// (lib/banking/consent.ts). Γραμμένο σε κάθε οθόνη χωριστά, η μία θα έλεγε
// «ενεργή» και η άλλη «έληξε» για την ίδια γραμμή.
//
// ΚΑΙ ΤΟ ΠΛΗΘΟΣ ΠΟΥ ΧΡΕΩΝΕΤΑΙ ΒΓΑΙΝΕΙ ΑΠΟ ΕΔΩ. Το πρόσθετο κοστολογείται ανά
// συνδεδεμένο λογαριασμό τον μήνα· αν η οθόνη της πληρωμής μετρούσε μόνη της,
// θα μετρούσε και τις εκκρεμείς που ο χρήστης δεν ολοκλήρωσε ποτέ.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BankConnectionsRow } from '@/lib/supabase/tables';
import { billableConnections, consentState, type ConsentState } from '@/lib/banking/consent';
import type { AisProviderId, BankConnection, ConnectionStatus } from '@/lib/banking/types';

const TABLE = 'bank_connections';

export type Db = SupabaseClient;

export const COLUMNS =
  'id,provider,institution_id,institution_name,status,consent_expires_at,last_sync_at,last_error,created_at';

/** Η γραμμή της βάσης, στους τύπους της εφαρμογής. */
export function toConnection(r: Partial<BankConnectionsRow>): BankConnection {
  return {
    id: r.id ?? '',
    provider: (r.provider ?? '') as AisProviderId,
    institutionId: r.institution_id ?? '',
    institutionName: r.institution_name ?? '',
    status: (r.status ?? 'pending') as ConnectionStatus,
    consentExpiresAt: r.consent_expires_at ?? null,
    lastSyncAt: r.last_sync_at ?? null,
    lastError: r.last_error ?? null,
    createdAt: r.created_at ?? '',
  };
}

/**
 * Οι συνδέσεις του χρήστη, με την κατάσταση ήδη κριμένη.
 *
 * ΤΟ ΣΦΑΛΜΑ ΔΕΝ ΠΝΙΓΕΤΑΙ. «Καμία σύνδεση» και «η ανάγνωση απέτυχε» φαίνονται
 * ίδια στην οθόνη και σημαίνουν το αντίθετο: το πρώτο καλεί τον χρήστη να
 * συνδέσει τράπεζα, το δεύτερο θα τον έβαζε να ξανασυνδέσει μία που έχει ήδη.
 */
export async function ofUser(db: Db, userId: string): Promise<{
  connections: (BankConnection & { state: ConsentState })[];
  error: string;
}> {
  if (!userId) return { connections: [], error: '' };
  const { data, error } = await db.from(TABLE).select(COLUMNS).eq('user_id', userId).order('created_at');
  if (error) return { connections: [], error: error.message };
  const rows = (data ?? []) as Partial<BankConnectionsRow>[];
  return {
    connections: rows.map(r => {
      const c = toConnection(r);
      return { ...c, state: consentState(c) };
    }),
    error: '',
  };
}

/** Πόσοι λογαριασμοί χρεώνονται. Η οθόνη της πληρωμής δεν ξαναμετρά. */
export const billableCount = (cs: readonly Pick<BankConnection, 'status'>[]): number =>
  billableConnections(cs);

/**
 * Οσες συνδέσεις χρειάζονται προσοχή, με τη σειρά που πρέπει να τη λάβουν:
 * πρώτα όσες σταμάτησαν, μετά όσες πρόκειται.
 */
export function needingAttention<T extends { state: ConsentState }>(cs: readonly T[]): T[] {
  return cs.filter(c => c.state.needsRenewal)
    .slice()
    .sort((a, b) => Number(a.state.usable) - Number(b.state.usable));
}
