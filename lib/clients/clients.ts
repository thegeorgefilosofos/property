// ═══════════════════════════════════════════════════════════════════════════
// Πελατολόγιο (CRM) — καθαρή, δοκιμάσιμη λογική & ετικέτες. Χωρίς React/Supabase.
// Χρησιμοποιείται από το TabClients.tsx και από τα tests.
// ═══════════════════════════════════════════════════════════════════════════

export type ClientType = 'owner' | 'lead' | 'client';
export const CLIENT_TYPES: ClientType[] = ['owner', 'lead', 'client'];
export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  owner: 'Ιδιοκτήτης', lead: 'Υποψήφιος', client: 'Πελάτης',
};

export type Stage = 'lead' | 'viewing' | 'offer' | 'closed';
export const PIPELINE_STAGES: Stage[] = ['lead', 'viewing', 'offer', 'closed'];
export const STAGE_ORDER: Record<Stage, number> = { lead: 0, viewing: 1, offer: 2, closed: 3 };
export const STAGE_LABELS: Record<Stage, string> = {
  lead: 'Νέο', viewing: 'Επίσκεψη', offer: 'Προσφορά', closed: 'Έκλεισε',
};

/** Ελληνικό ΑΦΜ: 9 ψηφία, mod-11 checksum (βάρη 2^8..2^1 στα πρώτα 8 ψηφία). */
export function isValidAfm(afm: string): boolean {
  if (!/^\d{9}$/.test(afm) || afm === '000000000') return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += parseInt(afm[i], 10) * Math.pow(2, 8 - i);
  return (sum % 11) % 10 === parseInt(afm[8], 10);
}

export interface ClientLike { stage?: string | null; deal_value?: number | null; next_date?: string | null; }

/** Άθροισμα αξίας ανοιχτών ευκαιριών (αγνοεί «closed» και null). */
export function pipelineValue(clients: ClientLike[]): number {
  return clients.reduce((sum, c) =>
    sum + (c.stage !== 'closed' && typeof c.deal_value === 'number' ? c.deal_value : 0), 0);
}

/** Πλήθος ενεργειών που λήγουν σήμερα ή έχουν λήξει (μη κλεισμένες ευκαιρίες). */
export function dueActions(clients: ClientLike[], now: Date): number {
  const today = now.toISOString().slice(0, 10);
  return clients.filter(c => c.stage !== 'closed' && c.next_date != null && c.next_date <= today).length;
}
