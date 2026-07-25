// ═══════════════════════════════════════════════════════════════════════════
// scanDoc — μικρός, επαναχρησιμοποιήσιμος «σκάνερ» εγγράφου. Παίρνει ένα αρχείο
// (φωτό/PDF), καλεί το ίδιο vision endpoint και prompt με το DocumentScan, και
// επιστρέφει δομημένο ScannedDoc. Χρησιμοποιείται από modals (Αναπροσαρμογή,
// Κατανομή) για auto-prefill, χωρίς να διπλασιάζει τη λογική του DocumentScan.
// ═══════════════════════════════════════════════════════════════════════════
import { SYSTEM_PROMPT } from './DocumentScan';
import { classifyDocType, type ScannedDoc } from '@/lib/billing/documents';

const NUM_KEYS = new Set(['amount', 'monthly_rent', 'deposit', 'premium', 'coverage', 'purchase_price', 'obj_value', 'year_built', 'sqm', 'tax_year', 'kwh', 'cubic_meters', 'millesimi', 'vat_rate']);

// Ανθεκτική μετατροπή αριθμού (χειρίζεται «1.200,50», «1,234.56», «€», κενά).
const numify = (v: unknown): number | undefined => {
  if (typeof v === 'number') return isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const raw = v.replace(/[€\s]/g, '');
  if (!/\d/.test(raw)) return undefined;
  const clean = /,\d{1,2}$/.test(raw) ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
  const n = parseFloat(clean.replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : undefined;
};

function readFile(file: File): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const dataUrl = String(r.result || ''); resolve({ base64: dataUrl.split(',')[1] || '', mime: file.type || 'image/jpeg' }); };
    r.onerror = () => reject(new Error('read'));
    r.readAsDataURL(file);
  });
}

export type ScanError = 'big' | 'service' | 'unreadable' | 'key_missing';

/** Σκανάρει ένα αρχείο και επιστρέφει το δομημένο έγγραφο (ή σφάλμα). */
export async function scanDocument(file: File): Promise<{ doc?: ScannedDoc; error?: ScanError }> {
  if (file.size > 10 * 1024 * 1024) return { error: 'big' };
  let base64 = '', mime = 'image/jpeg';
  try { ({ base64, mime } = await readFile(file)); } catch { return { error: 'unreadable' }; }
  const isPdf = mime === 'application/pdf';
  const contentPart = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } };
  try {
    const res = await fetch('/api/anthropic', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-5', max_tokens: 1500, system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: [contentPart, { type: 'text', text: 'Αναγνώρισε και ανάλυσε αυτό το έγγραφο. Διάβασε κάθε στοιχείο με ακρίβεια.' }] }],
      }),
    });
    const data = await res.json();
    if (!res.ok || data?.error) return { error: String(data?.error || '').includes('ANTHROPIC_API_KEY') ? 'key_missing' : 'service' };
    const text = (data.content || []).find((c: { type: string }) => c.type === 'text')?.text || '{}';
    const doc = JSON.parse(text.replace(/```json?|```/g, '').trim()) as ScannedDoc;
    if (!doc || typeof doc !== 'object') return { error: 'unreadable' };
    const dref = doc as unknown as Record<string, unknown>;
    NUM_KEYS.forEach(k => { if (dref[k] != null) dref[k] = numify(dref[k]); });
    // Κανονικοποίηση ποσοστών/ΑΦΜ στους συνιδιοκτήτες.
    if (Array.isArray(doc.owners)) doc.owners = doc.owners.map(o => ({ name: o?.name || undefined, afm: o?.afm ? String(o.afm).replace(/\D/g, '') || undefined : undefined, pct: o?.pct != null ? numify(o.pct) : undefined }));
    doc.doc_type = classifyDocType(doc);
    if (typeof doc.confidence !== 'number') doc.confidence = 70;
    return { doc };
  } catch { return { error: 'unreadable' }; }
}
