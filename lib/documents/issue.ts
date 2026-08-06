// ═══════════════════════════════════════════════════════════════════════════
// issue — καταχώρηση επίσημου εγγράφου (true PDF) στο μητρώο & δημιουργία
// μοναδικού, μη-απαριθμήσιμου αρ. εγγράφου + δημόσιου URL επαλήθευσης.
// Η αποτυχία καταχώρησης ΔΕΝ μπλοκάρει την παραγωγή του PDF, αλλά ΑΦΑΙΡΕΙ τη
// διεύθυνση επαλήθευσης: χωρίς γραμμή στο μητρώο, ο κωδικός QR και η φράση
// «γνήσιο και επαληθεύσιμο έγγραφο» οδηγούσαν σε σελίδα που δεν βρίσκει τίποτα.
// Ένα έγγραφο που υπόσχεται επαλήθευση την οποία δεν μπορεί να δώσει είναι
// χειρότερο από ένα έγγραφο που δεν την υπόσχεται.
// ═══════════════════════════════════════════════════════════════════════════
import type { createClient } from '@/lib/supabase/client';
import { saved } from '@/components/dbWrite';

type SB = ReturnType<typeof createClient>;

export interface IssuedDoc { id: string; issuedAt: string; verifyUrl: string; checksum: string }
export interface IssueInput {
  userId: string;
  docType: string;               // «Λογιστική αναφορά», «Βεβαίωση ενοικίου», …
  subject?: string;              // ακίνητο / αποδέκτης
  period?: string;               // «Χρήση 2025» / «Ιούλιος 2026»
  summary?: Record<string, unknown>; // ιδιωτικό στιγμιότυπο για checksum/audit (δεν εκτίθεται)
}

// Αλφάβητο χωρίς διφορούμενα σύμβολα (0/O, 1/I/L).
const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randCode(n: number): string {
  const buf = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto.getRandomValues(new Uint8Array(n)) : null;
  let s = '';
  for (let i = 0; i < n; i++) s += ALPH[(buf ? buf[i] : Math.floor(Math.random() * 256)) % ALPH.length];
  return s;
}
function genId(d: Date): string {
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `PO-${yy}${mm}${dd}-${randCode(8)}`;
}
// Ελαφρύ, ντετερμινιστικό checksum (djb2) για ένδειξη ακεραιότητας/audit.
function checksum(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(36).toUpperCase().padStart(7, '0').slice(0, 7);
}

export async function issueDocument(supabase: SB, input: IssueInput): Promise<IssuedDoc> {
  const now = new Date();
  const id = genId(now);
  const issuedAt = now.toISOString();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const verifyUrl = `${origin}/verify/${id}`;
  const summary = input.summary || {};
  const cs = checksum(JSON.stringify(summary) + '|' + (input.subject || '') + '|' + issuedAt);
  const registered = await saved('Το έγγραφο δεν καταχωρήθηκε στο μητρώο, οπότε εκδίδεται χωρίς επαλήθευση',
    supabase.from('issued_documents').insert({
      id, user_id: input.userId, doc_type: input.docType,
      subject: input.subject || '', period: input.period || '',
      issued_at: issuedAt, summary, checksum: cs,
    }));
  return { id, issuedAt, verifyUrl: registered ? verifyUrl : '', checksum: cs };
}
