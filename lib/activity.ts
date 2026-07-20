// ─────────────────────────────────────────────────────────────────────────
// Βοηθός καταγραφής δραστηριότητας (audit log). Καλεί το log_activity RPC (ο
// δράστης ορίζεται server-side ως auth.uid()) και ΠΟΤΕ δεν πετάει — η καταγραφή
// είναι δευτερεύουσα, δεν μπλοκάρει την κύρια ενέργεια.
// ─────────────────────────────────────────────────────────────────────────

import type { createClient } from '@/lib/supabase/client';
type SupaClient = ReturnType<typeof createClient>;

export async function logActivity(
  supabase: SupaClient, action: string,
  entity?: string, entityId?: string, metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.rpc('log_activity', {
      p_action: action,
      p_entity: entity ?? null,
      p_entity_id: entityId ?? null,
      p_metadata: metadata ?? {},
    });
  } catch { /* σιωπηλά */ }
}

export interface ActivityRow {
  id: string;
  action: string;
  entity: string | null;
  actor_email: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// Ανθρώπινη περιγραφή γεγονότος (ελληνικά, β' ενικό).
export function activityLabel(row: ActivityRow): string {
  const m = row.metadata || {};
  const email = typeof m.email === 'string' ? m.email : '';
  const role = m.role === 'admin' ? 'Διαχειριστής' : m.role === 'member' ? 'Μέλος' : '';
  switch (row.action) {
    case 'password_changed':    return 'Άλλαξες τον κωδικό πρόσβασης';
    case 'mfa_enabled':         return 'Ενεργοποίησες την επαλήθευση δύο βημάτων';
    case 'mfa_disabled':        return 'Απενεργοποίησες την επαλήθευση δύο βημάτων';
    case 'signed_out_all':      return 'Αποσυνδέθηκες από όλες τις συσκευές';
    case 'org_renamed':         return 'Άλλαξες το όνομα του οργανισμού';
    case 'member_invited':      return `Προσκάλεσες μέλος${email ? `: ${email}` : ''}${role ? ` (${role})` : ''}`;
    case 'member_role_changed': return `Άλλαξες ρόλο μέλους${email ? `: ${email}` : ''}${role ? ` → ${role}` : ''}`;
    case 'member_revoked':      return `Αφαίρεσες μέλος${email ? `: ${email}` : ''}`;
    case 'member_edit_granted': return `Έδωσες δικαίωμα επεξεργασίας${email ? `: ${email}` : ''}`;
    case 'member_edit_revoked': return `Αφαίρεσες δικαίωμα επεξεργασίας${email ? `: ${email}` : ''}`;
    default:                    return row.action;
  }
}
