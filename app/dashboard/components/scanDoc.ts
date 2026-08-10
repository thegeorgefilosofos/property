// ═══════════════════════════════════════════════════════════════════════════
// scanDoc — Η ΡΟΗ «ΦΩΤΟΓΡΑΦΙΣΕ → ΚΑΤΑΧΩΡΗΘΗΚΕ», σε ένα σημείο.
//
// ΓΙΑΤΙ ΕΔΩ ΚΑΙ ΟΧΙ ΣΕ COMPONENT. Τρεις οθόνες σάρωναν έγγραφα με τρεις
// διαφορετικές διαδρομές: το DocumentScan έγραφε σε 8 πίνακες, το Αρχείο μόνο
// αρχειοθετούσε (και ξαναδιόρθωνε μόνο του τον φάκελο), και τα modals έκαναν
// μόνο prefill. Ο ίδιος λογαριασμός ΔΕΗ κατέληγε σε διαφορετικό φάκελο ανάλογα
// με το πού τον ανέβασες. Εδώ υπάρχει ΜΙΑ υλοποίηση, χωρίς React, ώστε κάθε
// οθόνη (Αρχείο, Λίστα ελέγχου, Επαφές, Ενοικιαστής) να καλεί το ίδιο πράγμα.
//
// ΔΗΜΟΣΙΑ ΥΠΟΓΡΑΦΗ — ΣΤΑΘΕΡΗ, τη καλούν άλλες οθόνες:
//   scanFile(file)                → τι είναι το χαρτί (έγγραφο ή φωτογραφία) + πεδία
//   commitScannedDoc(input)       → το γράφει σε ΟΛΟΥΣ τους σωστούς πίνακες
//   archiveScannedFile(input)     → μόνο αρχειοθέτηση (φωτογραφίες, μαζικό ανέβασμα)
//   scanDocument(file)            → μόνο ανάγνωση εγγράφου (auto-prefill σε φόρμες)
//
// Η καθαρή λογική (τι είδος είναι, τι λείπει, πού γράφεται, ποιον λογαριασμό
// εξοφλεί) ζει στο lib/billing/documents.ts και lib/billing/parse.ts και είναι
// 100% δοκιμασμένη. Εδώ μένουν μόνο οι κλήσεις δικτύου/βάσης.
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from '@/lib/supabase/client';
import * as properties from '@/lib/data/properties';
import * as billStore from '@/lib/data/bills';
import * as tenantStore from '@/lib/data/tenants';
import * as expenses from '@/lib/data/expenses';
import * as calendar from '@/lib/data/calendar';
// Οι ρυθμίσεις ανά ενότητα έχουν ένα σπίτι: lib/data/settings.
import * as settings from '@/lib/data/settings';
import {
  classifyDocType, planDocSave, normalizeScannedDoc, archiveCategoryFor,
  type ScannedDoc, type ArchivePlan,
} from '@/lib/billing/documents';
import { fillOnlyEmpty } from '@/lib/core/prefill';
import { athensToday } from '@/lib/core/time';
import { saved, savedData } from '@/components/dbWrite';
import { uploadPath } from '@/lib/core/uploadPath';
import { navLabel } from '@/lib/nav/labels';
import {
  matchPaymentToBills, providerFromBillName,
  type MatchCandidate, type MatchResult,
} from '@/lib/billing/parse';

// ── Το prompt αναγνώρισης (ΕΝΑ, κοινό) ─────────────────────────────────────
// Ζητά ΡΗΤΑ τα πέντε πεδία ταιριάσματος: πάροχο, ΑΦΜ παρόχου, ποσό, ημερομηνία
// έκδοσης και περίοδο δαπάνης ΑΠΟ–ΕΩΣ ως δύο ημερομηνίες (όχι κείμενο).
export const SYSTEM_PROMPT = `Είσαι ο κορυφαίος βοηθός διαχείρισης ακινήτων στον κόσμο. Ο χρήστης ανεβάζει ΟΠΟΙΟΔΗΠΟΤΕ έγγραφο σχετικό με το ακίνητό του. Αναγνώρισε ΤΙ ΕΙΝΑΙ και εξήγαγε τα σωστά στοιχεία. Επέστρεψε ΜΟΝΟ valid JSON, χωρίς markdown:
{
  "doc_type": "bill|payment|lease|deed|insurance|tax|government|other",
  "title": "σύντομος περιγραφικός τίτλος",
  "provider": "πάροχος/αντισυμβαλλόμενος/ασφαλιστική/φορέας/συμβολαιογράφος",
  "provider_afm": "ΑΦΜ του ΕΚΔΟΤΗ του παραστατικού, 9 ψηφία χωρίς κενά, ή null",
  "provider_phone": "τηλέφωνο του ΕΚΔΟΤΗ όπως τυπώνεται στο παραστατικό, ή null",
  "provider_email": "email του ΕΚΔΟΤΗ όπως τυπώνεται στο παραστατικό, ή null",
  "category": "(μόνο για bill/payment) electricity|water|gas|internet|insurance|streaming|taxes|municipal|security|common|maintenance|elevator|pool|gardener|cleaner|plumber|electrician|other",
  "amount": συνολικό πληρωτέο ποσό σε ευρώ ή null,
  "due_date": "YYYY-MM-DD (λήξη πληρωμής) ή null",
  "issue_date": "YYYY-MM-DD (ημερομηνία έκδοσης του παραστατικού) ή null",
  "period_from": "YYYY-MM-DD αρχή της περιόδου κατανάλωσης/δαπάνης ή null",
  "period_to": "YYYY-MM-DD τέλος της περιόδου κατανάλωσης/δαπάνης ή null",
  "period": "η περίοδος όπως γράφεται στο χαρτί (π.χ. «Ιούνιος 2026») ή null",
  "tenant_name": "(μισθωτήριο) ονοματεπώνυμο ενοικιαστή/μισθωτή ή null",
  "landlord_name": "(μισθωτήριο) ονοματεπώνυμο εκμισθωτή/ιδιοκτήτη ή null",
  "owners": "(τίτλος/συμβόλαιο/μισθωτήριο) πίνακας συνιδιοκτητών: [{\"name\":\"ονοματεπώνυμο\",\"afm\":\"ΑΦΜ ή null\",\"pct\":ποσοστό ιδιοκτησίας 0-100 ή null}] ή null",
  "monthly_rent": "(μισθωτήριο) μηνιαίο ενοίκιο € ή null",
  "lease_start": "(μισθωτήριο) YYYY-MM-DD ή null",
  "lease_end": "(μισθωτήριο) YYYY-MM-DD ή null",
  "deposit": "(μισθωτήριο) εγγύηση € ή null",
  "afm": "ΑΦΜ του αντισυμβαλλόμενου (π.χ. ενοικιαστή) ή null",
  "purchase_price": "(τίτλος/συμβόλαιο) τίμημα αγοράς € ή null",
  "purchase_date": "(τίτλος) YYYY-MM-DD ή null",
  "obj_value": "(τίτλος) αντικειμενική αξία € ή null",
  "atak": "(τίτλος) ΑΤΑΚ ακινήτου ή null",
  "year_built": "έτος κατασκευής ή null",
  "sqm": "τετραγωνικά μέτρα ή null",
  "policy_number": "(ασφαλιστήριο) αριθμός συμβολαίου ή null",
  "premium": "(ασφαλιστήριο) ασφάλιστρο € ή null",
  "coverage": "(ασφαλιστήριο) ποσό κάλυψης € ή null",
  "expiry_date": "(ασφαλιστήριο) YYYY-MM-DD λήξη ή null",
  "tax_year": "(φορολογικό) έτος ή null",
  "kwh": "(ρεύμα) κιλοβατώρες ή null",
  "cubic_meters": "(νερό/αέριο) m³ ή null",
  "millesimi": "(κοινόχρηστα) χιλιοστά ή null",
  "vat_rate": "ΦΠΑ % ή null",
  "account_num": "αριθμός παροχής/λογαριασμού ή null",
  "notes": "οτιδήποτε άλλο σημαντικό",
  "confidence": 0-100
}
ΚΑΝΟΝΕΣ ΑΝΑΓΝΩΡΙΣΗΣ: μισθωτήριο/συμφωνητικό μίσθωσης→"lease". Ασφαλιστήριο/ασφάλεια ακινήτου→"insurance". ΕΝΦΙΑ/Ε9/εκκαθαριστικό/φόρος→"tax". Τίτλος ιδιοκτησίας/συμβόλαιο αγοραπωλησίας→"deed". ΑΜΑ/πολεοδομία/βεβαίωση/δημόσιο έγγραφο→"government". Απόδειξη/βεβαίωση πληρωμής→"payment". Λογαριασμός ΔΕΗ/ΕΥΔΑΠ/αερίου/internet/κοινοχρήστων→"bill". Ημερομηνίες πάντα YYYY-MM-DD. Τελεία για δεκαδικά. Ό,τι δεν υπάρχει→null.
ΠΡΟΣΟΧΗ ΣΤΑ ΠΕΝΤΕ: πάροχος, ΑΦΜ εκδότη, ποσό, ημερομηνία έκδοσης, περίοδος από–έως. Αυτά τα πέντε επιτρέπουν στο app να διαπιστώσει ότι ένας λογαριασμός πληρώθηκε. Το ΑΦΜ του εκδότη βρίσκεται συνήθως στην κεφαλίδα ή στο υποσέλιδο. Η περίοδος γράφεται συχνά ως «Περίοδος κατανάλωσης» ή «από … έως …». ΜΗΝ μαντεύεις: ό,τι δεν φαίνεται καθαρά, βάλ' το null.`;

// ── Φωτογραφία ακινήτου (vision) — δεν είναι έγγραφο, είναι τεκμηρίωση χώρου ──
export const PHOTO_CATEGORIES = [
  'Κατάσταση Ακινήτου', 'Πριν την Παράδοση', 'Μετά την Παράδοση',
  'Ζημιά / Φθορά', 'Ανακαίνιση', 'Εξωτερικοί Χώροι', 'Άλλο',
];
export const PHOTO_SYSTEM_PROMPT = `Είσαι σύστημα ταξινόμησης φωτογραφιών ακινήτου. Εξέτασε τη φωτογραφία και επίστρεψε ΑΥΣΤΗΡΑ ΜΟΝΟ JSON, χωρίς άλλο κείμενο:
{"category":"<μία από: Κατάσταση Ακινήτου | Ζημιά / Φθορά | Ανακαίνιση | Εξωτερικοί Χώροι | Άλλο>","title":"<σύντομη ελληνική περιγραφή χώρου/θέματος, π.χ. Σαλόνι, Κουζίνα, Μπάνιο, Υπνοδωμάτιο, Μπαλκόνι>"}
Κανόνες κατηγορίας:
- Εμφανής φθορά/ζημιά/υγρασία/ρωγμή/σπασμένο → "Ζημιά / Φθορά".
- Εργασίες/ανακαίνιση σε εξέλιξη (μπάζα, εργαλεία, γυμνοί τοίχοι) → "Ανακαίνιση".
- Εξωτερικός χώρος/μπαλκόνι/κήπος/αυλή/πρόσοψη/πυλωτή → "Εξωτερικοί Χώροι".
- Κανονικός εσωτερικός χώρος σε καλή κατάσταση → "Κατάσταση Ακινήτου".
- Αν δεν σχετίζεται με ακίνητο → "Άλλο".`;

export const MAX_SCAN_MB = 10;

// ΤΑ ΚΛΕΙΔΙΑ ΔΕΝ ΕΙΝΑΙ ΠΙΑ ΣΚΕΤΑ ΚΕΙΜΕΝΑ. Ήταν `string[]`, και η εξομάλυνση
// έγραφε με `doc as unknown as Record<string, unknown>` — δηλαδή ένα κλειδί με
// τυπογραφικό («amout») δεν θα σκάλωνε πουθενά: ο αριθμός θα έμενε κείμενο, το
// ποσό θα έμπαινε στη βάση ως «1.200,50» και η πρόσθεση θα έδινε NaN. Με τον
// τύπο δεμένο στο ίδιο το ScannedDoc, ένα λάθος όνομα σκάει στη μεταγλώττιση.
type NumKey = Extract<{
  [K in keyof ScannedDoc]-?: NonNullable<ScannedDoc[K]> extends number ? K : never
}[keyof ScannedDoc], string>;

const NUM_KEYS: readonly NumKey[] = ['amount', 'monthly_rent', 'deposit', 'premium', 'coverage', 'purchase_price', 'obj_value', 'year_built', 'sqm', 'tax_year', 'kwh', 'cubic_meters', 'millesimi', 'vat_rate'];

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

// Κλήση του vision endpoint με χρονικό όριο, ώστε μια κολλημένη απόκριση να μη
// παγώνει την ουρά ανεβάσματος.
async function ask(body: unknown, timeoutMs = 45000): Promise<{ data?: { content?: { type: string; text?: string }[] }; error?: ScanError }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch('/api/anthropic', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: ctrl.signal,
    });
    const data = await res.json();
    if (!res.ok || data?.error) {
      return { error: String(data?.error || '').includes('ANTHROPIC_API_KEY') ? 'key_missing' : 'service' };
    }
    return { data };
  } catch { return { error: 'service' }; } finally { clearTimeout(timer); }
}

function parseJson<T>(data?: { content?: { type: string; text?: string }[] }): T | null {
  const text = (data?.content || []).find(c => c.type === 'text')?.text || '';
  if (!text) return null;
  try { return JSON.parse(text.replace(/```json?|```/g, '').trim()) as T; } catch { return null; }
}

const contentPartOf = (base64: string, mime: string) => mime === 'application/pdf'
  ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
  : { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } };

/** Σκανάρει ένα αρχείο ως ΕΓΓΡΑΦΟ και επιστρέφει το δομημένο παραστατικό. */
export async function scanDocument(file: File): Promise<{ doc?: ScannedDoc; error?: ScanError }> {
  if (file.size > MAX_SCAN_MB * 1024 * 1024) return { error: 'big' };
  let base64 = '', mime = 'image/jpeg';
  try { ({ base64, mime } = await readFile(file)); } catch { return { error: 'unreadable' }; }
  const part = contentPartOf(base64, mime);

  const attempt = async (hint: string): Promise<{ doc?: ScannedDoc; error?: ScanError }> => {
    const r = await ask({
      model: 'claude-sonnet-5', max_tokens: 1500, system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [part, { type: 'text', text: `Αναγνώρισε και ανάλυσε αυτό το έγγραφο. ${hint}` }] }],
    });
    if (r.error) return { error: r.error };
    const doc = parseJson<ScannedDoc>(r.data);
    if (!doc || typeof doc !== 'object') return { error: 'unreadable' };
    return { doc };
  };

  let r = await attempt('Διάβασε κάθε στοιχείο με ακρίβεια.');
  // Δεύτερη προσπάθεια ΜΟΝΟ όταν δεν βγήκε δομημένη απάντηση (θολή/στραβή φωτό).
  if (r.error === 'unreadable') {
    r = await attempt('ΠΡΟΣΟΧΗ: η εικόνα ίσως είναι θαμπή ή στραβή. Κοίτα ξανά προσεκτικά και εντόπισε οπωσδήποτε τον τύπο του εγγράφου και τα βασικά στοιχεία.');
  }
  if (r.error || !r.doc) return { error: r.error || 'unreadable' };

  const doc = r.doc;
  // Ντετερμινιστική εξομάλυνση: το AI μπορεί να δώσει αριθμούς ως strings.
  // Ο τύπος ανάγκασε να ειπωθεί κάτι που έμενε υπονοούμενο: όταν το κείμενο ΔΕΝ
  // είναι αριθμός («περίπου 300»), το πεδίο ΦΕΥΓΕΙ. Πριν του ανατίθετο
  // `undefined` — ίδιο αποτέλεσμα στην εκτέλεση, αλλά γραμμένο σαν να ήταν
  // αριθμός. Ένα αριθμητικό πεδίο που κρατά ακατέργαστο κείμενο είναι χειρότερο
  // από ένα που λείπει: το πρώτο μπαίνει στη βάση και δίνει NaN στην πρόσθεση.
  NUM_KEYS.forEach(k => {
    if (doc[k] == null) return;
    const n = numify(doc[k]);
    if (n === undefined) delete doc[k]; else doc[k] = n;
  });
  if (Array.isArray(doc.owners)) {
    doc.owners = doc.owners.map(o => ({
      name: o?.name || undefined,
      afm: o?.afm ? String(o.afm).replace(/\D/g, '') || undefined : undefined,
      pct: o?.pct != null ? numify(o.pct) : undefined,
    }));
  }
  doc.doc_type = classifyDocType(doc);
  if (typeof doc.confidence !== 'number') doc.confidence = 70;
  // ΑΦΜ σε ψηφία + περίοδος από κείμενο σε δύο ημερομηνίες (ποτέ μαντεψιά).
  return { doc: normalizeScannedDoc(doc) };
}

/** Ταξινόμηση φωτογραφίας ακινήτου (χώρος/θέμα + κατηγορία). */
export async function scanPhoto(file: File): Promise<{ photo?: { category: string; title: string | null }; error?: ScanError }> {
  if (file.size > MAX_SCAN_MB * 1024 * 1024) return { error: 'big' };
  if (!file.type.startsWith('image/')) return { error: 'unreadable' };
  let base64 = '', mime = 'image/jpeg';
  try { ({ base64, mime } = await readFile(file)); } catch { return { error: 'unreadable' }; }
  const r = await ask({
    model: 'claude-sonnet-5', max_tokens: 200, system: PHOTO_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: [contentPartOf(base64, mime), { type: 'text', text: 'Κατηγοριοποίησε αυτή τη φωτογραφία ακινήτου.' }] }],
  });
  if (r.error) return { error: r.error };
  const parsed = parseJson<{ category?: string; title?: string }>(r.data);
  if (!parsed) return { error: 'unreadable' };
  return {
    photo: {
      category: parsed.category && PHOTO_CATEGORIES.includes(parsed.category) ? parsed.category : 'Κατάσταση Ακινήτου',
      title: parsed.title?.trim() || null,
    },
  };
}

// ── Έγγραφο ή φωτογραφία; Το αποφασίζει το AI, όχι διακόπτης ────────────────
export interface ScanFileResult {
  kind: 'document' | 'photo';
  doc?: ScannedDoc;                                  // kind === 'document'
  photo?: { category: string; title: string | null }; // kind === 'photo'
  error?: ScanError;
}

/**
 * Η ΜΙΑ κλήση σάρωσης. Ο χρήστης δεν δηλώνει «έγγραφο ή φωτογραφία»:
 *   • PDF/έγγραφο → πάντα ανάγνωση παραστατικού.
 *   • Εικόνα → πρώτα ανάγνωση παραστατικού· ΑΝ δεν βρεθεί ΚΑΝΕΝΑ στοιχείο
 *     παραστατικού (ούτε πάροχος, ούτε ποσό, ούτε τίτλος, ούτε ημερομηνία),
 *     τότε είναι φωτογραφία χώρου και ταξινομείται ως τέτοια.
 * Ο κανόνας είναι ντετερμινιστικός και εξηγήσιμος — δεν «μαντεύει διάθεση».
 */
export async function scanFile(file: File): Promise<ScanFileResult> {
  if (file.size > MAX_SCAN_MB * 1024 * 1024) return { kind: 'document', error: 'big' };
  const isImage = file.type.startsWith('image/');
  const r = await scanDocument(file);
  if (r.doc) {
    const d = r.doc;
    const documentary = !!(d.provider || d.amount || d.title || d.due_date || d.issue_date
      || d.tenant_name || d.monthly_rent || d.premium || d.policy_number || d.atak || d.purchase_price);
    if (documentary || !isImage) return { kind: 'document', doc: d };
  } else if (!isImage) {
    return { kind: 'document', error: r.error };
  }
  const p = await scanPhoto(file);
  if (p.photo) return { kind: 'photo', photo: p.photo };
  // Η φωτογραφία δεν ταξινομήθηκε: επιστρέφουμε ό,τι ξέρουμε, χωρίς να χαθεί τίποτα.
  return r.doc ? { kind: 'document', doc: r.doc } : { kind: 'photo', error: p.error || r.error };
}

// ── Αρχειοθέτηση: ανέβασμα + εγγραφή στο property_documents ─────────────────
export interface ArchiveInput {
  file: File;
  propertyId: string;
  userId: string;
  kind: 'document' | 'photo';
  category: string;
  title?: string;
  notes?: string | null;
  supplier?: string | null;
  doc_date?: string | null;
  amount?: number | null;
  provider_afm?: string | null;
  period_from?: string | null;
  period_to?: string | null;
  issue_date?: string | null;
}

// Στήλες που μπορεί να ΛΕΙΠΟΥΝ σε βάση όπου δεν έχει τρέξει ακόμη το migration
// 20260730090000_document_fields.sql. Αν λείπει κάποια, ξαναδοκιμάζουμε χωρίς
// αυτήν — το αρχείο του χρήστη δεν χάνεται ποτέ επειδή λείπει μια στήλη.
const OPTIONAL_DOC_COLS = ['amount', 'provider_afm', 'period_from', 'period_to', 'issue_date', 'supplier'] as const;

/** Ανεβάζει το πρωτότυπο και γράφει τη γραμμή του Αρχείου. */
export async function archiveScannedFile(input: ArchiveInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { file, propertyId, userId, kind } = input;
  const path = uploadPath(file.name, `${userId}/${propertyId}/${kind}`);
  const { error: upErr } = await supabase.storage.from('property-files')
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (upErr) return { ok: false, error: upErr.message };

  const base: Record<string, unknown> = {
    property_id: propertyId, user_id: userId, kind, category: input.category,
    title: (input.title || file.name).slice(0, 200), notes: input.notes ?? null,
    doc_date: input.doc_date || null, file_path: path, file_name: file.name,
    mime: file.type || null, size_bytes: file.size,
  };
  const payload: Record<string, unknown> = {
    ...base,
    supplier: input.supplier ?? null,
    amount: input.amount ?? null,
    provider_afm: input.provider_afm ?? null,
    period_from: input.period_from || null,
    period_to: input.period_to || null,
    issue_date: input.issue_date || null,
  };

  for (let i = 0; i <= OPTIONAL_DOC_COLS.length; i++) {
    const { error } = await supabase.from('property_documents').insert(payload);
    if (!error) return { ok: true };
    const missing = OPTIONAL_DOC_COLS.find(c => c in payload && new RegExp(`\\b${c}\\b`, 'i').test(error.message));
    if (!missing) return { ok: false, error: error.message };
    delete payload[missing];
  }
  return { ok: false, error: 'insert' };
}

/** Από το σχέδιο αρχειοθέτησης (καθαρή λογική) στο input της βάσης. */
export function archiveInputFrom(plan: ArchivePlan, file: File, propertyId: string, userId: string, title?: string): ArchiveInput {
  return {
    file, propertyId, userId, kind: 'document',
    category: plan.category, title: title || file.name, notes: plan.note ?? null,
    supplier: plan.supplier ?? null, doc_date: plan.date ?? null,
    amount: plan.amount ?? null, provider_afm: plan.provider_afm ?? null,
    period_from: plan.period_from ?? null, period_to: plan.period_to ?? null,
    issue_date: plan.issue_date ?? null,
  };
}

// ── Η καταχώριση: ένα έγγραφο → όλοι οι σωστοί πίνακες ─────────────────────
export interface CommitInput {
  doc: ScannedDoc;
  propertyId: string;
  userId: string;
  /** Το πρωτότυπο αρχείο. Χωρίς αυτό δεν γίνεται αρχειοθέτηση (μόνο καταχωρίσεις). */
  file?: File | null;
  today?: string;
  /**
   * Ράφι του Αρχείου, όταν ο χρήστης το διόρθωσε ρητά στην οθόνη επιβεβαίωσης.
   * Χωρίς αυτό ισχύει ό,τι αποφασίζει το archiveCategoryFor() — ένα σημείο.
   */
  archiveCategory?: string;
  /**
   * Απάντηση του χρήστη στην ερώτηση συμφωνίας:
   *   string → εξόφλησε ΑΥΤΟΝ τον λογαριασμό
   *   null   → κανέναν, δημιούργησε νέα εγγραφή
   *   undefined (προεπιλογή) → ρώτα εμένα αν δεν είσαι σίγουρος
   */
  reconcileChoice?: string | null;
}

export interface ReconcileQuestion {
  question: string;
  options: { id: string; label: string; reasons: string[] }[];
}

/**
 * Η ΤΕΛΕΥΤΑΙΑ ΕΠΙΛΟΓΗ ΤΗΣ ΕΡΩΤΗΣΗΣ ΣΥΜΦΩΝΙΑΣ, ΜΙΑ ΦΟΡΑ.
 * Η ίδια απόφαση εμφανιζόταν σε τρεις οθόνες με τρεις διατυπώσεις — «Κανέναν
 * από αυτούς», «Κανέναν, νέα ξεχωριστή εγγραφή», «Κανέναν, κράτησέ το ως νέα
 * εγγραφή» — και ο βοηθός παρέπεμπε σε ένα τέταρτο, σκέτο «Κανέναν». Ο χρήστης
 * που το συναντά δεύτερη φορά πρέπει να αναγνωρίσει το ίδιο κουμπί.
 */
export const RECONCILE_NONE_LABEL = 'Κανέναν από αυτούς';
export const RECONCILE_NONE_HINT = 'Θα καταχωρηθεί ως νέα, ξεχωριστή εγγραφή';

export interface CommitResult {
  /** Τι ενημερώθηκε ΠΡΑΓΜΑΤΙΚΑ (ονόματα καρτελών, για ειλικρινή αναφορά). */
  saved: string[];
  /** Όταν υπάρχει, ΤΙΠΟΤΑ δεν γράφτηκε: πρέπει πρώτα να απαντήσει ο χρήστης. */
  ask?: ReconcileQuestion;
  error?: 'save';
}

const nrm = (s?: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const stripEmpty = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ''));

/** Οι εκκρεμείς λογαριασμοί ενός ακινήτου, σε μορφή υποψηφίου ταιριάσματος. */
async function pendingCandidates(propertyId: string, userId: string): Promise<MatchCandidate[]> {
  const supabase = createClient();
  const data = await billStore.ofProperty(supabase, propertyId, 'id,category,amount,due_date,created_at,name,period', userId, { paid: false });
  return (data || []).map(b => ({
    id: String(b.id),
    amount: typeof b.amount === 'number' ? b.amount : parseFloat(String(b.amount ?? 0)),
    category: (b.category as string) ?? null,
    due_date: (b.due_date as string) ?? null,
    created_at: (b.created_at as string) ?? null,
    // Ο πάροχος δεν έχει δική του στήλη στους λογαριασμούς: γράφεται στο `name`
    // ως «Πάροχος — Περίοδος» (planDocSave). Το ΑΦΜ παρόχου δεν υπάρχει καθόλου
    // στο `bills` — άρα μένει άγνωστο, δηλαδή δεν δίνει και δεν αφαιρεί μονάδες.
    provider: providerFromBillName(b.name as string),
    period: (b.period as string) ?? null,
  }));
}

/** Η ερώτηση προς τον χρήστη, με τους λόγους κάθε υποψηφίου. */
function toQuestion(r: MatchResult<MatchCandidate>): ReconcileQuestion {
  return {
    question: r.question || 'Ποιον λογαριασμό εξοφλεί αυτή η απόδειξη;',
    options: r.candidates.map(c => ({
      id: c.bill.id,
      label: [c.bill.provider || 'Λογαριασμός', c.bill.period, c.bill.due_date ? `λήξη ${c.bill.due_date}` : '']
        .filter(Boolean).join(' · '),
      reasons: c.reasons.filter(x => x.ok).map(x => x.detail),
    })),
  };
}

/**
 * ΤΟ ΣΗΜΕΙΟ ΕΙΣΟΔΟΥ ΓΙΑ ΚΑΘΕ ΟΘΟΝΗ. Παίρνει το σαρωμένο (και τυχόν διορθωμένο
 * από τον χρήστη) έγγραφο και το γράφει σε όλους τους σωστούς πίνακες. Δεν κάνει
 * ΠΟΤΕ σιωπηλή εξόφληση: όταν η βεβαιότητα ταιριάσματος είναι χαμηλή, επιστρέφει
 * `ask` χωρίς να γράψει τίποτα, και η οθόνη ρωτά τον χρήστη.
 */
export async function commitScannedDoc(input: CommitInput): Promise<CommitResult> {
  const supabase = createClient();
  const { propertyId, userId, file } = input;
  const today = input.today || athensToday();
  const doc = normalizeScannedDoc(input.doc);
  const plan = planDocSave(doc, today);
  // Ονομάζεται `written` και όχι `saved`: το `saved` είναι πια ο βοηθός που
  // ελέγχει αν το γράψιμο πέτυχε, και δύο πράγματα δεν μοιράζονται ένα όνομα.
  const written: string[] = [];
  const add = (s: string) => { if (!written.includes(s)) written.push(s); };

  try {
    // ── 0) Συμφωνία απόδειξης με εκκρεμή λογαριασμό — με τα πέντε πεδία.
    let payOff: string | null = null;
    if (plan.reconcile && doc.amount) {
      if (input.reconcileChoice !== undefined) {
        payOff = input.reconcileChoice;
      } else {
        const cands = await pendingCandidates(propertyId, userId);
        const r = matchPaymentToBills({
          amount: doc.amount,
          date: doc.issue_date || today,
          category: (plan.bill?.category as string) || undefined,
          provider: doc.provider,
          provider_afm: doc.provider_afm,
          period_from: doc.period_from,
          period_to: doc.period_to,
          period: doc.period,
        }, cands);
        if (r.verdict === 'ask') return { saved: [], ask: toQuestion(r) };
        payOff = r.verdict === 'confident' && r.best ? r.best.bill.id : null;
      }
    }

    let billId: string | undefined;
    let reconciled = false;

    if (payOff) {
      await saved('Ο λογαριασμός δεν σημειώθηκε εξοφλημένος',
        billStore.markPaid(supabase, payOff));
      const updExp = await savedData<{ id: string }[]>('Η συνδεδεμένη δαπάνη δεν σημειώθηκε πληρωμένη',
        expenses.markBillPaid(supabase, payOff));
      await saved('Το γεγονός ημερολογίου δεν ενημερώθηκε',
        calendar.updateByBill(supabase, payOff, { status: 'paid' }));
      // Αν ο εξοφλημένος λογαριασμός δεν είχε συνδεδεμένο έξοδο, δημιούργησέ το
      // τώρα ώστε η πληρωμή να φαίνεται στις Δαπάνες.
      if ((!updExp || !updExp.length) && plan.expense) {
        const { error: expErr } = await expenses.insert(supabase, [{ property_id: propertyId, user_id: userId, bill_id: payOff, ...plan.expense, paid: true }]);
        add(expErr ? 'Λογαριασμός εξοφλήθηκε' : 'Δαπάνες');
      } else { add('Δαπάνες'); }
      reconciled = true;
      add('Λογαριασμός εξοφλήθηκε');
    }

    // ── 1) Λογαριασμός → bills. Παραλείπεται αν έγινε συμφωνία.
    if (plan.bill && !reconciled) {
      const { data: billRow, error: billErr } = await billStore.addReturning(supabase, propertyId, userId, plan.bill);
      if (!billErr) { billId = billRow?.id as string | undefined; add('Λογαριασμοί'); }
    }

    // ── 2) Έξοδο → expenses (σύνδεση bill_id), με προστασία διπλοεγγραφής.
    if (plan.expense && !reconciled) {
      const amt = plan.expense.amount as number;
      const cat = plan.expense.category as string;
      const d = plan.expense.date as string;
      const desc = plan.expense.description as string;
      const dup = await expenses.similar(supabase, propertyId, cat, amt, d);
      const isDup = dup.some(x => nrm(x.description as string) === nrm(desc));
      if (isDup) { add('Δαπάνες (υπάρχει ήδη)'); }
      else {
        const { error: expErr } = await expenses.insert(supabase, [{ property_id: propertyId, user_id: userId, bill_id: billId, ...plan.expense }]);
        if (!expErr) add('Δαπάνες');
      }
    }

    // ── 3) Ημερολόγιο → calendar_events.
    if (plan.calendar && !reconciled) {
      const { error: cErr } = await calendar.insert(supabase,
        plan.calendar.map(ev => calendar.row({ propertyId, userId }, 'scan', { ...ev, bill_id: billId })));
      if (!cErr) add('Ημερολόγιο');
    }

    // ── 4) Ενοικιαστής → tenants (ίδιο όνομα → συμπλήρωση, αλλιώς νέα εγγραφή).
    if (plan.tenant) {
      // Ο ΤΡΕΧΩΝ, ΟΧΙ Ο ΤΕΛΕΥΤΑΙΑ ΕΝΗΜΕΡΩΜΕΝΟΣ. Το σαρωμένο συμβόλαιο συγκρινόταν
      // με όποιον είχε πειραχτεί πιο πρόσφατα — δηλαδή, αν ο ιδιοκτήτης είχε μόλις
      // διορθώσει το ΑΦΜ του παλιού μισθωτή, η σάρωση συμπλήρωνε ΕΚΕΙΝΟΝ.
      const existing = await tenantStore.currentAll<{ id: string; full_name: string | null }>(
        supabase, propertyId, tenantStore.NAME_COLUMNS, userId);
      const cur = existing && existing.length ? existing[0] : null;
      const sameTenant = cur && nrm(cur.full_name as string) === nrm(plan.tenant.full_name as string);
      const { error: tErr } = await (sameTenant
        ? tenantStore.update(supabase, cur!.id, stripEmpty(plan.tenant))
        : tenantStore.add(supabase, propertyId, userId, stripEmpty(plan.tenant)));
      if (!tErr) add('Ενοικιαστής');
    }

    // ── 5) Στοιχεία ακινήτου → user_properties (ΜΟΝΟ ασφαλείς στήλες).
    // Διαβάζουμε πρώτα τι υπάρχει: η σάρωση συμπληρώνει κενά, δεν σβήνει ό,τι
    // έγραψε ο χρήστης (fillOnlyEmpty — lib/billing/documents.ts).
    if (plan.property) {
      const cols = Object.keys(plan.property);
      const curProp = await properties.one(supabase, propertyId, cols.join(','), userId);
      const patch = fillOnlyEmpty(plan.property, curProp as Record<string, unknown> | null);
      if (Object.keys(patch).length) {
        const { error: pErr } = await properties.update(supabase, propertyId, patch, userId);
        if (!pErr) add('Στοιχεία ακινήτου');
      }
    }

    // ── 6) Ασφάλεια → property_settings.
    if (plan.settings) {
      const { error: sErr } = await supabase.from('property_settings')
        .upsert({ property_id: propertyId, user_id: userId, ...plan.settings }, { onConflict: 'property_id' });
      if (!sErr) add('Ασφάλεια');
    }

    // ── 7) Κοινόχρηστα → bills_settings section 'common'.
    if (plan.commonMonthAmount != null || plan.commonMillesimi != null) {
      const dd = (await settings.section(supabase, propertyId, 'common', userId)) || {};
      const history = Array.isArray(dd.history) ? [...(dd.history as string[])] : Array(12).fill('');
      if (plan.commonMonthAmount != null) history[new Date().getMonth()] = String(plan.commonMonthAmount);
      const nextData = { ...dd, history, ...(plan.commonMillesimi != null && !dd.millesimi ? { millesimi: String(plan.commonMillesimi) } : {}) };
      const { error: kErr } = await settings.put(supabase, propertyId, userId, 'common', nextData);
      if (!kErr) add('Κοινόχρηστα');
    }

    // ── 8) Αρχειοθέτηση του πρωτότυπου, πάντα, με ΟΛΑ τα νούμερα πάνω του.
    if (plan.archive && file) {
      const archivePlan = input.archiveCategory
        ? { ...plan.archive, category: input.archiveCategory }
        : plan.archive;
      const r = await archiveScannedFile(
        archiveInputFrom(archivePlan, file, propertyId, userId, doc.title || doc.provider));
      if (r.ok) add(navLabel('documents'));
    }

    if (!written.length) return { saved: [], error: 'save' };
    return { saved: written };
  } catch { return { saved: [], error: 'save' }; }
}

/** Επανεξαγωγή ώστε οι οθόνες να παίρνουν τον φάκελο από ΕΝΑ σημείο. */
export { archiveCategoryFor };
