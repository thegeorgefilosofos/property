'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Νόα — ορατή ΠΑΝΤΟΥ στην εφαρμογή.
// ─────────────────────────────────────────────────────────────────────────
// Πλωτό κουμπί σε κάθε καρτέλα → πάνελ συνομιλίας. Απαντά σε ΟΤΙΔΗΠΟΤΕ (χαλαρά
// ή σύνθετα ακινήτων), δίνει γνώμη, παραπέμπει στον σωστό επαγγελματία και
// καθοδηγεί μέσα στην εφαρμογή, πάντα με τα δεδομένα του χρήστη μπροστά της.
//
// ΤΟ ΟΝΟΜΑ ΔΕΝ ΕΙΝΑΙ ΡΥΘΜΙΣΗ. Μέχρι σήμερα ο χρήστης διάλεγε όνομα και φύλο:
// το αποτέλεσμα ήταν ότι το προϊόν δεν είχε πρόσωπο, και κάθε οθόνη το έλεγε
// αλλιώς. Τώρα υπάρχει μία ταυτότητα, από το lib/assistant/identity.ts, και οι
// ρυθμίσεις αφορούν μόνο ΣΥΜΠΕΡΙΦΟΡΑ (προσφώνηση, μνήμη, σύγκριση).
//
// ΤΟ ΥΦΟΣ: ήρεμη ιεραρχία, καθαρή τυπογραφία, βάθος από φωτεινότητα και όχι
// από χρώμα ή βαριές σκιές. Καμία διακόσμηση που δεν κουβαλάει πληροφορία.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useRef, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as properties from '@/lib/data/properties';
import * as loanStore from '@/lib/data/loans';
// Η απογραφή έχει ένα σπίτι: lib/data/inventory.
import * as inventory from '@/lib/data/inventory';
// Οι ρυθμίσεις ανά ενότητα έχουν ένα σπίτι: lib/data/settings.
import * as settings from '@/lib/data/settings';
import * as stayStore from '@/lib/data/stays';
import * as billStore from '@/lib/data/bills';
import * as rentStore from '@/lib/data/rent';
import * as tenantStore from '@/lib/data/tenants';
import * as checklist from '@/lib/data/checklist';
import * as expenseStore from '@/lib/data/expenses';
import * as calendar from '@/lib/data/calendar'
import { speechRecognizer, speechSupported, type SpeechEvent, type SpeechErrorEvent, type SpeechRecognizer } from '@/lib/core/speech';
import type { BillsRow, ChecklistItemsRow, ClientStaysRow, ClientsRow, ContactsRow, ExpensesRow, RentPaymentsRow, UserPropertiesRow } from '@/lib/supabase/tables';
import { T, TT, Modal, fe, feAuto, feOr, fp } from '@/components/Theme';
import Feedback from './Feedback';
import { resolveRent, resolveValue, computeYields } from '@/lib/billing/propertyFacts';
import { mergeLedger, ledgerTotal, ledgerUnpaid } from '@/lib/expenses/ledger';
import { computeInsights, type Insight } from '@/lib/insights/engine';
import { RENTAL_TAX_SUMMARY_2026, CLIMATE_LEVY_SUMMARY_2025, MUNICIPAL_ACCOM_SUMMARY } from '@/lib/billing/greekTax';
import { annuityMonthly, interestForYear } from '@/lib/loans/recommend';
import { LOAN_COLUMNS, toLoanViews } from '@/lib/loans/shape';
import { incomeStatement, taxProvision } from '@/lib/accounting/statement';
import { clientStats, stayTotal, CLIENT_TYPE_LABELS, type ClientType } from '@/lib/clients/clients';
import { suggestBase, realizedAdr, indicativeMonthly } from '@/lib/pricing/dynamicPricing';
import {
  type AssistantPrefs, type Memory, type AssistantAction, DEFAULT_PREFS, ADDRESS_OPTIONS,
  NAV_MAP, buildSystemBlocks, parseAction, cleanForSpeech, loadPrefs, savePrefs,
  loadHistory, saveHistory, clearHistory,
  loadMemories, addMemory, removeMemory, clearMemories, actionReachable,
} from './assistantPersona';
import {
  ASSISTANT_NAME, ASSISTANT_INITIAL, tagline, askCta, askPlaceholder, openAria,
  speakingLabel, settingsTitle, noKeyNotice,
} from '@/lib/assistant/identity';
import { classifyExpense } from '@/lib/expenses/classify';
// Το Supabase δεν πετάει σε σφάλμα βάσης· η `must` το κάνει να πετάει, ώστε τα
// try/catch αυτού του αρχείου να λένε αλήθεια. Βλ. lib/supabase/must.ts.
import { must } from '@/lib/supabase/must';
// Οι επαφές έχουν ένα σπίτι: lib/data/contacts.
import * as contactStore from '@/lib/data/contacts';
import { inferRole, roleLabel } from '@/lib/contacts/roles';
import { upcomingHolidays, holidayName, isWeekend } from '@/lib/calendar/greekHolidays';

interface PropContext { name: string; propType?: string; address?: string; value?: number; sqm?: number; status?: string; targetRent?: number; }
interface PropSummary { name: string; propType?: string; value?: number; targetRent?: number; sqm?: number; status?: string; }
interface Props {
  propertyId: string; userId: string; propContext: PropContext; allProperties?: PropSummary[];
  onNavigate: (tab: string) => void; onScan: () => void;
  /**
   * Αν η καρτέλα είναι ΟΝΤΩΣ προσβάσιμη για αυτό το ακίνητο.
   *
   * ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΚΛΕΙΝΕΙ: το `onNavigate` του γονέα αγνοεί σιωπηλά όσες
   * καρτέλες κρύβει η ορατότητα. Το κουμπί «Πήγαινε: …» γκρίζαρε σαν να
   * χρησιμοποιήθηκε — και η οθόνη έμενε ίδια. Ο χρήστης πατούσε ξανά, το κουμπί
   * ήταν ήδη «χρησιμοποιημένο», και δεν είχε κανέναν τρόπο να καταλάβει γιατί.
   * Τώρα η υπόσχεση δεν γράφεται καν όταν δεν μπορεί να τηρηθεί.
   */
  canNavigate?: (tab: string) => boolean;
  /**
   * Το όνομα του πακέτου που ΙΣΧΥΕΙ τώρα (δοκιμή, προσφορά ή συνδρομή μαζί).
   *
   * Το prompt δηλώνει «Ξέρεις ακριβώς τι καλύπτει το πλάνο του χρήστη» και δεν
   * του δινόταν ποτέ. Το υπολογίζει ήδη η σελίδα με το `effectivePlan`· εδώ
   * απλώς ταξιδεύει μαζί με τα υπόλοιπα συμφραζόμενα.
   */
  planBrief?: string;
}
type Action = AssistantAction;
interface Msg { role: 'user' | 'assistant'; text: string; action?: Action; }
// Σύστημα αναγνώρισης αντικειμένου από φωτο (συσκευασία/ετικέτα/booklet/απόδειξη).
// ΤΟ ΠΑΡΑΣΤΑΤΙΚΟ ΕΦΥΓΕ ΑΠΟ ΕΔΩ. Αυτό το prompt διάβαζε ΚΑΙ αποδείξεις, δηλαδή
// ήταν δεύτερος αναγνώστης παραστατικών δίπλα στον κανονικό (scanDoc) — με
// λιγότερα πεδία, χωρίς πάροχο, χωρίς περίοδο, χωρίς ΑΦΜ εκδότη. Ακριβώς τα
// πεδία που χρειάζεται η συμφωνία με εκκρεμή λογαριασμό. Τώρα διαβάζει μόνο
// αυτό που ο άλλος δεν κάνει: τι συσκευή δείχνει η φωτογραφία.
const IMG_ITEM_SCAN_SYSTEM = `Είσαι σύστημα αναγνώρισης ΑΝΤΙΚΕΙΜΕΝΟΥ από φωτογραφία, για την απογραφή ενός ακινήτου. Επίστρεψε ΑΥΣΤΗΡΑ ΜΟΝΟ JSON:
{"name":"","brand":"","model":"","category":"<μία από: Έπιπλα, Ηλεκτρικές Συσκευές, Ηλεκτρονικά, Υδραυλικά, Θέρμανση & Ψύξη, Φωτιστικά, Διακόσμηση, Λοιπά>","price":"αριθμός € ή κενό","warranty_expiry":"YYYY-MM-DD ή κενό"}
Το name περιγραφικό (π.χ. «Πλυντήριο Bosch WAU28»). Άφησε κενά όσα δεν διακρίνονται. Χωρίς κείμενο εκτός JSON.`
// Ελαφρύ ευρετήριο πελατών, ώστε να βρίσκει από όνομα/τηλέφωνο/ΑΦΜ.
type ClientLite = { id: string; name: string; phone: string; afm: string };
// Ελαφρύ ευρετήριο επαφών (τεχνικοί/πάροχοι) για επικοινωνία (WhatsApp/Viber/email/κλήση).
type ContactLite = { name: string; role: string; phone: string; email: string };

import { suggestedOpeners, greeting as buildGreeting, type OpenerContext } from '@/lib/assistant/openers';
import { modelFor } from '@/lib/assistant/model';
import { scanFile, commitScannedDoc, RECONCILE_NONE_LABEL, RECONCILE_NONE_HINT, type ReconcileQuestion } from './scanDoc';
import { DOC_TYPE_LABELS, type ScannedDoc } from '@/lib/billing/documents';
import { remainingLine, type QuotaSnapshot } from '@/lib/billing/aiLimits';
import { athensToday, athensNowLabel, daysUntil, isoMonth } from '@/lib/core/time';
import { MONTHS_SHORT, MONTHS_GEN } from '@/lib/core/months';

// Ο άγνωστος αριθμός γράφεται 0,00 €, όχι παύλα: η παύλα δεν στοιχίζεται με
// τίποτα και σε στήλη ποσών διαβάζεται ως σφάλμα (lib/core/format.ts).
const eur = (n?: number | null) => n == null ? feOr(null) : feAuto(n);
// Η ερώτηση συμφωνίας σε μία πρόταση. Οι ίδιοι λόγοι που δείχνει και η οθόνη
// σάρωσης — δεν εφευρίσκεται δεύτερη διατύπωση για την ίδια απόφαση.
const reconcilePrompt = (q: { question: string; options: { label: string; reasons: string[] }[] }): string =>
  `${q.question} Βρήκα ${q.options.length === 1 ? 'έναν λογαριασμό που ταιριάζει' : `${q.options.length} λογαριασμούς που ταιριάζουν`}. Διάλεξε παρακάτω, ή «${RECONCILE_NONE_LABEL}» για νέα εγγραφή.`;
const navLabel = (id: string) => NAV_MAP.find(n => n.id === id)?.label || id;
const onlyDigits = (p: string) => (p || '').replace(/\D/g, '');
// Ετικέτα κουμπιού επικοινωνίας ανά κανάλι (χωρίς emoji, ελληνικά).
const reachLabel = (ch: 'whatsapp' | 'viber' | 'email' | 'call', name: string) =>
  ch === 'call' ? `Κλήση ${name}`
    : ch === 'email' ? `Email προς ${name}`
    : ch === 'viber' ? `Άνοιγμα Viber προς ${name}`
    : `Άνοιγμα WhatsApp προς ${name}`;
const CH_HUMAN: Record<'whatsapp' | 'viber' | 'email' | 'call', string> = { whatsapp: 'WhatsApp', viber: 'Viber', email: 'email', call: 'κλήση' };


export default function PropertyAssistant({ propertyId, userId, propContext, allProperties = [], onNavigate, onScan, canNavigate, planBrief }: Props) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [prefs, setPrefs] = useState<AssistantPrefs>(DEFAULT_PREFS);
  // Η ανοιχτή ερώτηση συμφωνίας: ποιον εκκρεμή λογαριασμό εξοφλεί η απόδειξη.
  const [reconcile, setReconcile] = useState<ReconcileQuestion | null>(null);
  const [editing, setEditing] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // Κουμπιά ενεργειών που έχουν ήδη εκτελεστεί (ώστε ένα δεύτερο πάτημα να μη διπλοκαταχωρεί).
  const [consumedActions, setConsumedActions] = useState<Set<number>>(() => new Set());
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // Μετρητής απαντήσεων· μετά τις ~12 πρώτες, προτείνουμε (μία φορά) αξιολόγηση.
  const answeredRef = useRef(0);
  const nudgedRef = useRef(false);
  const imgRef = useRef<HTMLInputElement>(null);   // λήψη/επιλογή φωτο αντικειμένου για αναγνώριση
  const [err, setErr] = useState('');
  // Το ακριβές κείμενο του server όταν χτυπηθεί όριο. ΓΙΑΤΙ ΞΕΧΩΡΙΣΤΑ: το γενικό
  // «δεν μπόρεσα να απαντήσω» κάνει τον χρήστη να νομίζει ότι χάλασε κάτι. Το όριο
  // δεν είναι βλάβη — είναι κατάσταση με νούμερο και με ημερομηνία επιστροφής, και
  // πρέπει να λέγεται όπως ακριβώς τη διατύπωσε ο server (lib/billing/aiLimits.ts).
  const [limitMsg, setLimitMsg] = useState('');
  /**
   * Πόσες ερωτήσεις απομένουν αυτόν τον μήνα.
   *
   * ΓΙΑΤΙ ΥΠΑΡΧΕΙ: η βάση επέστρεφε ήδη το υπόλοιπο σε κάθε κλήση και το
   * πετούσαμε. Ο χρήστης μάθαινε ότι έχει όριο μόνο τη στιγμή που το χτυπούσε,
   * δηλαδή πάντα ως έκπληξη και συνήθως στη μέση μιας δουλειάς.
   *
   * ΓΙΑΤΙ `null` ΣΤΗΝ ΑΡΧΗ: πριν από την πρώτη ερώτηση δεν ΞΕΡΟΥΜΕ το υπόλοιπο,
   * και ένα νούμερο που μαντεύεται είναι χειρότερο από κανένα. Η γραμμή
   * εμφανίζεται μόλις υπάρχει πραγματική απάντηση της βάσης.
   */
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const [ctxStr, setCtxStr] = useState('');
  const [insightsStr, setInsightsStr] = useState('');
  const [marketStr, setMarketStr] = useState('');
  const [clientsStr, setClientsStr] = useState('');
  const [pricingStr, setPricingStr] = useState('');
  // Τα ΔΙΚΑ ΤΟΥ νούμερα, για τις προτάσεις εκκίνησης και τον χαιρετισμό.
  // `null` = «δεν έχουν φορτώσει ακόμη» και είναι ΔΙΑΦΟΡΕΤΙΚΟ από `{}` = «δεν
  // υπάρχουν δεδομένα». Με κενό αντικείμενο, ο χρήστης με τρία χρόνια δαπάνες
  // διάβαζε «μόλις καταχωρήσεις τα πρώτα στοιχεία…» για όσο κρατούσε το ερώτημα.
  const [openerCtx, setOpenerCtx] = useState<OpenerContext | null>(null);
  const [techStr, setTechStr] = useState('');   // επαφές τεχνικών/παρόχων (καρτέλα Επαφές)
  const [memories, setMemories] = useState<Memory[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const listeningRef = useRef(false);
  const clientsRef = useRef<ClientLite[]>([]);   // ευρετήριο πελατών για εκτέλεση ενεργειών (σύνδεσμος check-in)
  const contactsRef = useRef<ContactLite[]>([]); // ευρετήριο επαφών για επικοινωνία (WhatsApp/Viber/email/κλήση)
  // Ανοιχτά στοιχεία προς πληρωμή, για τη σήμανση «πληρωμένο» ([[paid:…]]).
  const openBillsRef = useRef<{ id: string; name: string; category: string; amount: number }[]>([]);
  // Η ΠΡΟΘΕΣΜΙΑ ΤΑΞΙΔΕΥΕΙ ΜΑΖΙ: ο βοηθός σημειώνει δόσεις πληρωμένες, και χωρίς
  // αυτήν η καταχώρηση δεν μπορεί να πει πόσο άργησε ο μισθωτής.
  const openRentRef = useRef<{ id: string; label: string; amount: number; due: string | null }[]>([]);
  // Το σαρωμένο παραστατικό που περιμένει έγκριση. Είναι ref και όχι κατάσταση:
  // δεν το ζωγραφίζει τίποτα — το μήνυμα δίπλα του το περιγράφει ήδη — και μία
  // σάρωση είναι σε εξέλιξη κάθε φορά.
  const pendingDocRef = useRef<{ doc: ScannedDoc; file: File } | null>(null);
  // Το `ask` ορίζεται πολύ πιο κάτω και κλείνει πάνω σε κατάσταση που αλλάζει.
  // Ο ακροατής του `pos:ask` γράφεται μία φορά (deps []), οπότε τον φτάνει μέσω
  // ref — αλλιώς θα κρατούσε για πάντα το πρώτο, άδειο, στιγμιότυπο.
  const askRef = useRef<((q: string) => void) | null>(null);

  // Ο μηνιαίος nudge (ή άλλο σημείο) μπορεί να ανοίξει τη φόρμα αξιολόγησης.
  useEffect(() => {
    const openFb = () => { setOpen(true); setFeedbackOpen(true); };
    window.addEventListener('pos:open-feedback', openFb);
    // Άλλα σημεία (π.χ. έλεγχος ισοζυγίου) ανοίγουν το πάνελ με προ-συμπληρωμένη ερώτηση.
    // Το `send` στέλνει αμέσως, αντί να συμπληρώσει το πεδίο. Το χρειάζεται η
    // γραμμή της Επισκόπησης: εκεί ο χρήστης ΔΙΑΛΕΓΕΙ έτοιμη ερώτηση, ακριβώς
    // όπως και μέσα στο πάνελ — και εκεί το πάτημα στέλνει. Ίδια πράξη, ίδια
    // συμπεριφορά. Ο έλεγχος ισοζυγίου αντίθετα προτείνει διατύπωση που ο
    // χρήστης μπορεί να θέλει να αλλάξει, γι' αυτό μένει στο πεδίο.
    const openAsk = (e: Event) => {
      const d = (e as CustomEvent).detail as { q?: string; send?: boolean } | undefined;
      const q = String(d?.q || '').trim();
      setOpen(true);
      if (!q) return;
      if (d?.send) askRef.current?.(q); else setInput(q);
    };
    window.addEventListener('pos:ask', openAsk);
    // ΤΟ ΠΛΗΚΤΡΟΛΟΓΙΟ ΑΝΟΙΓΕΙ ΚΑΙ ΚΛΕΙΝΕΙ. Ο βοηθός ήταν προσβάσιμος μόνο με το
    // ποντίκι, πάνω σε ένα πλωτό κουμπί — για κάτι που θέλει να είναι το κύριο
    // μονοπάτι, αυτό είναι το μακρύτερο. Το Escape κλείνει, όπως κάθε άλλο
    // επίπεδο της εφαρμογής.
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); setOpen(o => !o); return; }
      if (e.key !== 'Escape' || listeningRef.current) return;
      // ΤΟ ESCAPE ΚΛΕΙΝΕΙ ΕΝΑ ΕΠΙΠΕΔΟ, ΟΧΙ ΔΥΟ. Το παράθυρο της αξιολόγησης
      // είναι πια <Modal> και ακούει μόνο του Escape (useOverlayShell). Χωρίς
      // αυτόν τον φρουρό, ΕΝΑ πάτημα έφτανε και στα δύο: έκλεινε το παράθυρο
      // ΚΑΙ το πάνελ από κάτω, δηλαδή έσβηνε μαζί και τις λέξεις που μόλις είχε
      // γράψει ο χρήστης. Ο έλεγχος γίνεται στο DOM (ίδιος τρόπος με το
      // `overlayOpen` παρακάτω) και πιάνει ΚΑΘΕ παράθυρο της εφαρμογής που
      // τυχαίνει να είναι ανοιχτό πάνω από το πάνελ, όχι μόνο αυτό εδώ.
      if (document.querySelector('[aria-modal="true"]')) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pos:open-feedback', openFb);
      window.removeEventListener('pos:ask', openAsk);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // Προτιμήσεις από localStorage (μία φορά). Το όνομα δεν φορτώνεται: είναι ένα.
  useEffect(() => {
    const saved = loadPrefs();
    if (saved) setPrefs(saved);
  }, []);

  // Κλείσιμο με κλικ εκτός πάνελ (χωρίς να χρειάζεται το «×»). Δεν κλείνει όταν
  // αλλάζεις ρυθμίσεις ή όταν «ακούει», για να μη χαθεί η ενέργεια.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (listeningRef.current) return; // μη διακόπτεις ενεργή φωνή
      const el = e.target as Element | null;
      if (el && el.closest('.pa-panel, .pa-fab')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // ── Η ΣΥΖΗΤΗΣΗ ΑΛΛΑΖΕΙ ΜΕΣΑ ΣΤΗΝ ΑΠΟΔΟΣΗ, ΟΧΙ ΣΕ EFFECT ─────────────────
  // Ήταν σε effect, και δίπλα του ζούσε δεύτερο effect που ΑΠΟΘΗΚΕΥΕΙ. Στην
  // αλλαγή ακινήτου έτρεχαν και τα δύο στην ίδια απόδοση, με τη σειρά που είναι
  // γραμμένα: το πρώτο έβαζε σε ουρά τη ΝΕΑ συζήτηση, και το δεύτερο εκτελούνταν
  // ακόμη με την ΠΑΛΙΑ στα χέρια του και το ΝΕΟ αναγνωριστικό — δηλαδή έγραφε τη
  // συζήτηση της Κυψέλης στο κλειδί της Γλυφάδας. Αν η Γλυφάδα δεν είχε δική της
  // συζήτηση, το ψεύτικο ιστορικό έμενε εκεί μόνιμα, και την επόμενη φορά ο
  // βοηθός διάβαζε τα οικονομικά ΑΛΛΟΥ ακινήτου και απαντούσε με βάση αυτά.
  //
  // Η προσαρμογή κατά την απόδοση ξαναποδίδει το component ΠΡΙΝ τρέξει
  // οποιοδήποτε effect, οπότε το effect αποθήκευσης βλέπει και τη νέα συζήτηση
  // και το νέο ακίνητο. Ίδιο μοτίβο με το CommandPalette και το TabDocuments.
  //
  // Η ΠΡΩΤΗ φόρτωση μένει στο effect από κάτω: το `localStorage` δεν υπάρχει στον
  // διακομιστή, και μια ανάγνωσή του μέσα στην πρώτη απόδοση θα έδινε άλλο δέντρο
  // στον διακομιστή και άλλο στον περιηγητή.
  const [histPid, setHistPid] = useState(propertyId);
  if (propertyId !== histPid) {
    setHistPid(propertyId);
    const mem = loadPrefs()?.memory !== false;
    setMsgs(mem ? loadHistory(propertyId).map(m => ({ role: m.role, text: m.text })) : []);
  }

  // Ό,τι απλώς καθαρίζεται μένει σε effect: κανένα από αυτά δεν διαβάζεται από
  // effect αποθήκευσης, άρα δεν έχει το ίδιο πρόβλημα σειράς. Εδώ μέσα γίνεται
  // ΚΑΙ η πρώτη και μόνη φόρτωση ιστορικού, στην πρώτη προσάρτηση: το effect
  // αποθήκευσης δεν κινδυνεύει, γιατί η άδεια συζήτηση δεν αποθηκεύεται ποτέ.
  const firstRunRef = useRef(true);
  useEffect(() => {
    setCtxStr(''); setInsightsStr(''); setMarketStr(''); setClientsStr(''); setPricingStr(''); setTechStr(''); setOpenerCtx(null);
    // Το σαρωμένο παραστατικό ανήκει στο ακίνητο που ήταν ανοιχτό όταν
    // φωτογραφήθηκε. Χωρίς αυτό, ένα πάτημα «Καταχώρησε» μετά την αλλαγή
    // ακινήτου θα έγραφε τον λογαριασμό της Κυψέλης στη Γλυφάδα.
    pendingDocRef.current = null; setReconcile(null);
    if (firstRunRef.current) {
      firstRunRef.current = false;
      if (loadPrefs()?.memory !== false) {
        const stored = loadHistory(propertyId);
        if (stored.length) setMsgs(stored.map(m => ({ role: m.role, text: m.text })));
      }
    }
  }, [propertyId]);

  // Μόνιμη μνήμη (γεγονότα) ανά χρήστη, μόνο αν το επιτρέπει η ρύθμιση.
  useEffect(() => {
    setMemories(prefs.memory ? loadMemories(userId) : []);
  }, [userId, prefs.memory]);

  // Αποθήκευση συζήτησης όταν η μνήμη είναι ενεργή.
  useEffect(() => {
    if (prefs.memory && msgs.length) saveHistory(propertyId, msgs.map(({ role, text }) => ({ role, text })));
  }, [msgs, prefs.memory, propertyId]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy, editing]);

  // Σύγκριση ακινήτων, δίνεται στο μοντέλο μόνο αν το ζητήσει ο χρήστης.
  const allPropsContext = prefs.compare && allProperties.length > 1
    ? allProperties.map((p, i) => {
        const gy = computeYields(resolveRent({ targetRent: p.targetRent }).value, resolveValue(p.value).value, 0).grossYield;
        const y = gy > 0 ? gy.toFixed(1) : null;
        return `${i + 1}. ${p.name}${p.propType ? ` (${p.propType})` : ''}: αξία ${eur(p.value)}, ενοίκιο-στόχος ${eur(p.targetRent)}/μήνα${y ? `, μεικτή απόδοση ~${y}%` : ''}${p.sqm ? `, ${p.sqm} τ.μ.` : ''}${p.status ? `, ${p.status}` : ''}`;
      }).join('\n')
    : undefined;

  // Φόρτωση δεδομένων ακινήτου (μία φορά όταν ανοίξει), για συγκεκριμένες απαντήσεις.
  const loadContext = useCallback(async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = `${year}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    // Το «σήμερα» της εφαρμογής είναι ώρα Ελλάδας, όχι UTC: αλλιώς για δύο ως
    // τρεις ώρες κάθε νύχτα η Νόα νόμιζε ότι είναι χθες.
    const todayStr = athensToday(now);
    const [exp, bil, ten, st, cal, { data: rates }, loans, { data: clientRows }, stayRows, contactRows, chk] = await Promise.all([
      expenseStore.ledger(supabase, propertyId, { userId, from: `${year}-01-01`, columns: `${expenseStore.LEDGER_COLUMNS},payment_method` }),
      billStore.ofProperty<BillsRow>(supabase, propertyId, billStore.LEDGER_COLUMNS, userId),
      tenantStore.currentAll(supabase, propertyId, 'full_name,monthly_rent,lease_end,deposit_amount', userId),
      // Τα στοιχεία ασφάλισης ζουν στο `user_properties` (insurance_company /
      // insurance_amount / insurance_expiry), ΟΧΙ στο property_settings — που έχει
      // μόνο company/policy/expiry και καθόλου ποσό. Το ερώτημα απορριπτόταν
      // ολόκληρο, οπότε ο βοηθός δεν ήξερε ΠΟΤΕ για ασφάλιση.
      properties.one<{ insurance_company: string | null; insurance_expiry: string | null; insurance_amount: number | null }>(supabase, propertyId, 'insurance_company,insurance_expiry,insurance_amount', userId),
      calendar.upcoming(supabase, { propertyId, userId }, athensToday(), 10),
      supabase.from('market_rates').select('euribor_3m,bog_housing_new,updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      loanStore.ofProperty(supabase, propertyId, userId),
      supabase.from('clients').select('id,type,full_name,afm,phone,email,rating,do_not_rent,tags,budget,needs').eq('user_id', userId).order('created_at', { ascending: false }).limit(80),
      stayStore.ofUser<ClientStaysRow>(supabase, userId, `client_id,rating,damages,damage_cost,notes,${stayStore.PORTFOLIO_COLUMNS}`),
      contactStore.ofUser<ContactsRow>(supabase, userId, 'full_name,role,phone,email', { orderBy: 'created_at', ascending: false, limit: 100 }),
      checklist.upcoming<ChecklistItemsRow>(supabase, propertyId, 'description,category,priority,due_date,status,estimated_cost,assigned_contact_name', userId),
    ]);
    // Οι γραμμές παίρνουν τους τύπους τους από το σχήμα (lib/supabase/tables.ts,
    // παραγόμενο από τα migrations). Πριν, κάθε πρόσβαση σε στήλη περνούσε από
    // `as any` — δηλαδή ένα ορθογραφικό λάθος σε όνομα στήλης δεν το έπιανε
    // κανείς μέχρι να μην εμφανιστεί το νούμερο στην οθόνη.
    const expenses = (exp || []) as ExpensesRow[];
    const billRows = bil;
    const stays = stayRows;
    const contacts = contactRows;
    const insurance = st as Pick<UserPropertiesRow, 'insurance_company' | 'insurance_expiry' | 'insurance_amount'> | null;

    // ── ΤΑ ΝΟΥΜΕΡΑ ΠΟΥ ΘΑ ΠΕΙ Η ΝΟΑ ΒΓΑΙΝΟΥΝ ΑΠΟ ΤΟΝ ΚΟΙΝΟ ΠΥΡΗΝΑ ────────────
    //
    // Πριν, τα σύνολα υπολογίζονταν ΜΟΝΟ από τον πίνακα `expenses`. Ο απλήρωτος
    // λογαριασμός όμως δεν έχει δαπάνη πίσω του — η δαπάνη γεννιέται στην
    // πληρωμή. Άρα:
    //   • η καθαρή απόδοση που έλεγε ήταν ΑΙΣΙΟΔΟΞΗ: αγνοούσε ό,τι χρωστάς·
    //   • το «εκκρεμείς» μετρούσε μόνο δαπάνες με paid=false, δηλαδή σχεδόν
    //     πάντα 0 — ενώ ο ιδιοκτήτης μπορεί να έχει ΕΝΦΙΑ και ΔΕΗ απλήρωτα.
    //
    // Και το χειρότερο: οι Δαπάνες και η Σύγκριση ΜΕΤΡΟΥΝ τους απλήρωτους. Ο
    // ίδιος χρήστης έπαιρνε άλλη απάντηση από την οθόνη και άλλη από τη Νόα,
    // για το ίδιο ακίνητο την ίδια στιγμή. Σε βοηθό που δίνει συμβουλή με λόγια,
    // αυτό δεν διαβάζεται ως διαφορά πίνακα — διαβάζεται ως λάθος συμβουλή.
    const ledger = mergeLedger((bil || []) as never[], expenses as never[]);
    const ofYear = ledger.entries.filter(e => e.date >= `${year}-01-01` && e.date <= `${year}-12-31`);
    const total = ledgerTotal(ofYear);
    // Ταμειακή βάση για τη φορολογική εικόνα: ό,τι ΟΝΤΩΣ πληρώθηκε.
    const paid = ledgerTotal(ofYear.filter(e => e.paid));
    const owed = ledgerTotal(ledgerUnpaid(ofYear));

    const catMap: Record<string, number> = {};
    ofYear.forEach(e => { const k = e.category || 'Άλλο'; catMap[k] = (catMap[k] || 0) + e.amount; });
    const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const unpaid = billRows.filter(b => !b.paid);
    openBillsRef.current = unpaid.map(b => ({ id: b.id, name: b.name || 'λογαριασμός', category: b.category || '', amount: b.amount || 0 }));
    // Ανεξόφλητες δόσεις ενοικίου (για σήμανση «πληρωμένο» από τη συνομιλία)
    // ΟΛΕΣ ΟΙ ΔΟΣΕΙΣ, ΟΧΙ ΜΟΝΟ ΟΙ ΑΠΛΗΡΩΤΕΣ. Το φίλτρο `paid=false` σήμαινε ότι ο
    // βοηθός δεν είχε καμία εικόνα συνέπειας πληρωμών, και ότι τα δεδουλευμένα
    // έσοδα της χρονιάς έπρεπε να μαντευτούν από το ενοίκιο επί δώδεκα.
    const rentAll = await rentStore.chronological<RentPaymentsRow>(supabase, propertyId, `id,due_date,${rentStore.PERIOD_COLUMNS}`, userId);
    openRentRef.current = rentAll.filter(r => !r.paid).map(r => ({ id: r.id, label: `Ενοίκιο ${MONTHS_GEN[(r.period_month || 1) - 1]} ${r.period_year}`, amount: r.amount || 0, due: r.due_date }));
    const t = ten?.[0];
    const rent = resolveRent({ tenantRent: t?.monthly_rent, targetRent: propContext.targetRent }).value;
    const value = resolveValue(propContext.value).value;
    const { grossYield: grossY, netYield: netY } = computeYields(rent, value, total);
    const leaseEnd = t?.lease_end || null;
    const daysLease = leaseEnd ? daysUntil(leaseEnd) ?? 0 : null;

    const loanRows = loans;
    const rateTypeGr = (rt?: string) => rt === 'variable' ? 'κυμαινόμενο' : rt === 'mixed' ? 'μεικτό' : 'σταθερό';
    const monthlyDebt = loanRows.reduce((s, l) => s + annuityMonthly(l.amount || 0, l.rate || 0, l.years || 0), 0);
    // Ο τόκος της φετινής χρήσης, ώστε το κεφάλαιο να ξεχωρίζει από τη δόση.
    const loanInterestYear = loanRows.reduce((s, l) => {
      const startY = l.start_date ? Number(String(l.start_date).slice(0, 4)) : year;
      return s + interestForYear(l.amount || 0, l.rate || 0, l.years || 0, year - startY + 1);
    }, 0);
    const loanLine = loanRows.length
      ? `Δάνεια (${loanRows.length}): εκτιμώμενη συνολική μηνιαία δόση ${eur(Math.round(monthlyDebt))}. ${loanRows.map(l => `${l.bank || 'τράπεζα'} ${eur(l.amount || 0)} με ${fp(Number(l.rate || 0))} ${rateTypeGr(l.rate_type ?? undefined)} σε ${l.years || 0} έτη`).join('; ')}`
      : 'Δεν έχει καταχωρηθεί δάνειο για αυτό το ακίνητο.';

    // Έσοδα φιλοξενίας (διαμονές επισκεπτών από το Πελατολόγιο συνδεδεμένες σε αυτό το ακίνητο).
    const propStays = stays.filter(s => s.property_id === propertyId);
    const propHostRevenue = propStays.reduce((sum, s) => sum + stayTotal(s), 0);
    const hostingLine = propStays.length
      ? `Έσοδα φιλοξενίας από διαμονές επισκεπτών σε αυτό το ακίνητο: ${eur(Math.round(propHostRevenue))} από ${propStays.length} διαμονές (πηγή: ${navLabel('clients')}).`
      : '';

    // ── Λογιστική εικόνα (ΙΔΙΑ μηχανή με την καρτέλα Λογιστική) ώστε Νόα να
    // συμβουλεύει με τον σωστό φόρο/καθαρό, όχι με πρόχειρες εκτιμήσεις. ──────────
    const isShortAcct = propStays.length > 0;
    const yearStays = propStays.filter(s => (s.check_in || '').slice(0, 4) === String(year));

    // ── ΤΟ ΜΕΙΚΤΟ ΕΙΣΟΔΗΜΑ ΕΙΝΑΙ ΤΙ ΟΦΕΙΛΕΤΑΙ, ΚΑΙ ΤΟ ΤΑΜΕΙΟ ΕΙΝΑΙ ΤΙ ΜΠΗΚΕ ──
    // Εδώ γραφόταν `rent * 12`, όπου το `rent` μπορεί να προέρχεται από τον
    // ΣΤΟΧΟ του ακινήτου (resolveRent → πηγή 'target'). Δηλαδή ένας στόχος
    // γινόταν «μεικτά έσοδα» και θεωρούνταν δώδεκα μήνες εισπραγμένοι — ενώ
    // λίγες γραμμές πιο πάνω η ίδια συνάρτηση έχει τη λίστα των ανεξόφλητων
    // δόσεων. Πάνω σε αυτή την παραδοχή έβγαιναν πέντε ποσά σε ευρώ, ως γεγονότα.
    //
    // Τώρα: τα δεδουλευμένα βγαίνουν από τις ΚΑΤΑΧΩΡΗΜΕΝΕΣ δόσεις του έτους,
    // και όσα δεν εισπράχθηκαν δηλώνονται ρητά στη μηχανή ως `uncollectedIncome`
    // — πεδίο που υπάρχει ακριβώς γι' αυτό. Χωρίς καμία δόση, πέφτουμε στον
    // στόχο ΚΑΙ το λέμε στην ίδια πρόταση.
    const yearRent = (rentAll || []) as RentPaymentsRow[];
    const accruedRent = yearRent.filter(r => r.period_year === year).reduce((s, r) => s + (r.amount || 0), 0);
    const collectedRent = yearRent.filter(r => r.period_year === year && r.paid).reduce((s, r) => s + (r.amount || 0), 0);
    const rentFromTarget = accruedRent <= 0;
    const longGross = rentFromTarget ? rent * 12 : accruedRent;
    const acctGross = isShortAcct ? yearStays.reduce((sum, s) => sum + stayTotal(s), 0) : longGross;
    const acctStmt = incomeStatement({
      regime: isShortAcct ? 'individual_shortterm' : 'individual_longterm',
      grossIncome: acctGross, otherCashExpenses: paid,
      // ΤΟ ΠΕΔΙΟ ΖΗΤΑΕΙ ΚΕΦΑΛΑΙΟ ΟΤΑΝ Ο ΤΟΚΟΣ ΕΚΠΙΠΤΕΙ ΧΩΡΙΣΤΑ. ΕΔΩ ΔΕΝ ΕΚΠΙΠΤΕΙ.
      //
      // Η προηγούμενη διόρθωση αφαιρούσε τον τόκο από τη δόση, και είχε δίκιο —
      // για καθεστώς επιχείρησης, όπου ο τόκος είναι δική του εκπεστέα γραμμή.
      // Σε `individual_*` όμως η `incomeStatement` μηδενίζει τον τόκο, οπότε το
      // ταμείο αφαιρούσε ΜΟΝΟ το κεφάλαιο: ο ιδιώτης πληρώνει ολόκληρη τη δόση
      // και δεν εκπίπτει τον τόκο πουθενά.
      //
      // Το αποτέλεσμα ήταν δύο διαφορετικά ταμειακά υπόλοιπα για το ίδιο ακίνητο
      // και το ίδιο έτος: η Νόα έλεγε 6.591,88 € περισσότερα από τη Λογιστική σε
      // δάνειο 190.000 € με 3,5%. Όποιος έβλεπε και τα δύο, δεν πίστευε κανένα.
      loanPrincipal: Math.max(0, Math.round(monthlyDebt * 12)),
      uncollectedIncome: isShortAcct || rentFromTarget ? 0 : Math.max(0, accruedRent - collectedRent),
    });
    const acctProv = taxProvision(acctStmt, now.getMonth() + 1);
    const accountingLine = acctGross > 0
      ? `Λογιστική ${year} (${isShortAcct ? 'βραχυχρόνια' : 'μακροχρόνια'} μίσθωση): μεικτά έσοδα ${eur(Math.round(acctStmt.grossIncome))}${!isShortAcct && rentFromTarget ? ' (βάσει ενοικίου-στόχου, δεν έχουν καταχωρηθεί δόσεις)' : ''}${!isShortAcct && !rentFromTarget && accruedRent > collectedRent ? `, από τα οποία ανείσπρακτα ${eur(Math.round(accruedRent - collectedRent))}` : ''}, φορολογητέο ${eur(Math.round(acctStmt.taxableIncome))}, εκτιμώμενος φόρος εισοδήματος ${eur(Math.round(acctStmt.incomeTax))} (μέσος συντελεστής ${fp((acctStmt.effectiveRate * 100))}), καθαρό αποτέλεσμα ${eur(Math.round(acctStmt.netProfit))}. Πρόταση πρόβλεψης φόρου: περίπου ${eur(Math.round(acctProv.monthly))} τον μήνα να μπαίνουν στην άκρη. Εκτίμηση με την κλίμακα 2026 (μακροχρόνια: τεκμαρτή έκπτωση 5%· βραχυχρόνια: φόρος στα μεικτά)· τελική επιβεβαίωση με λογιστή ή ΑΑΔΕ.`
      : '';

    // ── Εκκρεμότητες: πραγματικές ανοιχτές εργασίες (καρτέλα Εκκρεμότητες) ώστε Νόα
    // να απαντά «τι εκκρεμεί;» με στοιχεία, όχι υποθέσεις, και να ξεχωρίζει τις ληξιπρόθεσμες.
    const openTasks = chk;
    const overdueTasks = openTasks.filter(i => i.due_date && i.due_date < todayStr);
    const taskCostSum = openTasks.reduce((s, i) => s + (Number(i.estimated_cost) || 0), 0);
    const checklistLine = openTasks.length
      ? `Ανοιχτές εκκρεμότητες (${openTasks.length}${overdueTasks.length ? `, εκ των οποίων ${overdueTasks.length} ληξιπρόθεσμες` : ''}${taskCostSum > 0 ? `, εκτιμώμενο κόστος ${eur(Math.round(taskCostSum))}` : ''}): ${openTasks.slice(0, 15).map(i => `${i.description}${i.due_date ? ` [προθεσμία ${i.due_date}${i.due_date < todayStr ? ', ΛΗΞΙΠΡΟΘΕΣΜΗ' : ''}]` : ''}${i.estimated_cost ? ` ~${eur(i.estimated_cost)}` : ''}${i.assigned_contact_name ? ` (ανάθεση: ${i.assigned_contact_name})` : ''}`).join('; ')}${openTasks.length > 15 ? ` (και ${openTasks.length - 15} ακόμη)` : ''}`
      : 'Δεν υπάρχουν ανοιχτές εκκρεμότητες.';

    // Τα νούμερα που τροφοδοτούν τις προτάσεις εκκίνησης. Ό,τι δεν υπάρχει
    // μένει undefined — η μηχανή προτάσεων δεν επινοεί ποτέ ποσά.
    setOpenerCtx({
      propertyName: propContext.name,
      monthlyRent: rent || undefined,
      propertyValue: value || undefined,
      expensesYtd: total || undefined,
      openTasks: openTasks.length,
      overdueRent: openRentRef.current.reduce((sum, r) => sum + (r.amount || 0), 0) || undefined,
      hasLoan: loanRows.length > 0,
      isShortTerm: propStays.length > 0,
      propertyCount: allProperties.length || undefined,
    });

    // ── Δυναμική τιμολόγηση: βάση + ενδεικτικός πίνακας ανά μήνα ──
    // Προτίμησε τη ΒΑΣΗ που έχει ορίσει ο χρήστης στην καρτέλα Τιμολόγηση (αν υπάρχει).
    const { data: pset } = await supabase.from('pricing_settings').select('base,weekend_premium').eq('user_id', userId).eq('property_id', propertyId).maybeSingle();
    const wkndPrem = pset?.weekend_premium != null ? Number(pset.weekend_premium) : 0.18;
    // ΚΑΜΙΑ ΒΑΣΗ ΑΠΟ ΤΟ ΠΟΥΘΕΝΑ. Εδώ υπήρχε τρίτο εναλλακτικό:
    // `(ενοίκιο-στόχος / 30) × 2,2`. Είναι ακριβώς ο τύπος που το
    // lib/pricing/dynamicPricing.ts διέγραψε ρητά και εξηγεί γιατί: καμία πηγή,
    // κανένας γεωγραφικός διαχωρισμός, 60 τετραγωνικά στη Λάρισα έβγαζαν την
    // ίδια τιμή με 60 στη Μύκονο. Ο βοηθός τον ξαναέγραφε εδώ, και πάνω του
    // έχτιζε ΠΛΗΡΗ πίνακα δώδεκα μηνών με συγκεκριμένα ποσά ανά νύχτα.
    // Η επιφύλαξη «εκτίμηση, χωρίς επαρκές ιστορικό» έμπαινε μόνο στη γραμμή της
    // βάσης, όχι στον πίνακα που διάβαζε ο χρήστης.
    //
    // Το `else` παρακάτω λέει ήδη τη σωστή αλήθεια: χωρίς ιστορικό, ο χρήστης
    // ορίζει βάση στην Τιμολόγηση.
    const priceBase = (pset?.base != null ? Number(pset.base) : 0) || suggestBase(propStays);
    if (priceBase > 0) {
      const adrVal = realizedAdr(propStays);
      const table = indicativeMonthly(priceBase, wkndPrem).map(r => `${MONTHS_SHORT[r.month]} ${r.weekday}/${r.weekend}`).join(', ');
      setPricingStr([
        `Βάση: ${eur(priceBase)}/νύχτα${adrVal > 0 ? ` (μέση πραγματική ADR ${eur(Math.round(adrVal))} από ${propStays.length} διαμονές)` : ' (εκτίμηση, χωρίς επαρκές ιστορικό)'}.`,
        `Ενδεικτικές τιμές ανά μήνα (καθημερινή/Σαββατοκύριακο): ${table}.`,
        `Πρόσθετοι κανόνες: αργίες και υψηλή ζήτηση (Δεκαπενταύγουστος, Πάσχα, Εορτές, Πρωτοχρονιά) περίπου +25%. Last minute σε κενές κοντινές ημέρες περίπου -8% έως -15%. Υψηλή πληρότητα γύρω από την ημερομηνία ανεβάζει έως +12%.`,
        `Για ημερομηνία που ζητά ο χρήστης: πάρε τον μήνα από τον πίνακα (καθημερινή ή Σαββατοκύριακο) και πρόσθεσε αργία/ζήτηση αν ισχύει. Οι τιμές είναι ενδεικτικές προτάσεις.`,
      ].join('\n'));
    } else {
      setPricingStr('Δεν έχει οριστεί βασική τιμή ούτε υπάρχει ιστορικό διαμονών. Για προτάσεις τιμής, ο χρήστης ορίζει βασική τιμή στην καρτέλα Τιμολόγηση.');
    }

    // ── Προϋπολογισμός: μηνιαίος στόχος και ειδοποίηση υπέρβασης ─────────────
    // Οι «κουμπαράδες» αφαιρέθηκαν από το προϊόν: ο ιδιοκτήτης ακινήτου δεν
    // ήρθε εδώ για να αποταμιεύσει, ήρθε για δαπάνες, φόρους και ενοίκια.
    const bData = (await settings.section(supabase, propertyId, 'budgets', userId)) || {};
    // ΧΩΡΙΣ ΟΡΙΣΜΕΝΟ ΣΤΟΧΟ, ΚΑΝΕΝΑΣ ΑΡΙΘΜΟΣ.
    // Ήταν `|| 390`. Ο χρήστης που δεν είχε ορίσει ποτέ προϋπολογισμό, έπαιρνε
    // από τη Νόα προτάσεις πάνω σε «μηνιαίο στόχο 390 €» — νούμερο που δεν
    // είπε ποτέ, διατυπωμένο σαν δικό του.
    const rawTarget = parseFloat(String(bData.total ?? ''));
    const monthlyTarget: number | null = Number.isFinite(rawTarget) && rawTarget > 0 ? rawTarget : null;
    const notifyOverspend = String(bData.notifyOverspend) === 'true';
    const budgetLine = [
      `Προϋπολογισμός: ${monthlyTarget !== null ? `μηνιαίος στόχος δαπανών ${eur(monthlyTarget)}` : 'δεν έχει οριστεί μηνιαίος στόχος δαπανών· μη μιλάς για στόχο σαν να υπάρχει, πρότεινε να τον ορίσει'}. Ειδοποίηση υπέρβασης: ${notifyOverspend ? 'ενεργή (email μέσω προτιμήσεων ειδοποιήσεων)' : 'ανενεργή'}.`,
    ].join(' ');

    const lines = [
      `Ακίνητο: ${propContext.name}${propContext.propType ? ` (${propContext.propType})` : ''}${propContext.address ? `, ${propContext.address}` : ''}`,
      propContext.sqm ? `Εμβαδόν: ${propContext.sqm} τ.μ.` : '',
      value ? `Εμπορική αξία: ${eur(value)}` : 'Εμπορική αξία: δεν έχει καταχωρηθεί',
      propContext.status ? `Κατάσταση: ${propContext.status}` : '',
      `Ενοίκιο: ${eur(rent)}/μήνα (ετήσιο ${eur(rent * 12)})`,
      value ? `Απόδοση: μεικτή ${fp(grossY)}, καθαρή ${fp(netY)}` : '',
      `Δαπάνες ${year}: σύνολο ${eur(total)} (πληρωμένες ${eur(paid)}, εκκρεμείς ${eur(owed)}). Κάθε ευρώ μετρημένο μία φορά· οι απλήρωτοι λογαριασμοί μετρούν στην ημερομηνία που λήγουν· ίδιος υπολογισμός με τις Δαπάνες και τη Σύγκριση.`,
      topCats.length ? `Μεγαλύτερες κατηγορίες: ${topCats.map(([c, a]) => `${c} ${eur(a)}`).join(', ')}` : '',
      unpaid.length ? `Απλήρωτοι λογαριασμοί (${unpaid.length}): ${unpaid.slice(0, 12).map(b => `${b.name || 'λογαριασμός'} ${eur(b.amount)}${b.due_date ? ` λήξη ${b.due_date}` : ''}`).join('; ')}` : 'Δεν υπάρχουν απλήρωτοι λογαριασμοί.',
      openRentRef.current.length ? `Ανεξόφλητες δόσεις ενοικίου (${openRentRef.current.length}): ${openRentRef.current.slice(0, 12).map(r => `${r.label} ${eur(r.amount)}`).join('; ')}` : '',
      t ? `Ενοικιαστής: ${t.full_name || 'καταχωρημένος'}${t.deposit_amount ? `, εγγύηση ${eur(t.deposit_amount)}` : ''}` : 'Δεν έχει καταχωρηθεί ενοικιαστής.',
      leaseEnd ? `Λήξη μίσθωσης: ${leaseEnd}${daysLease != null ? ` (σε ${daysLease} ημέρες)` : ''}` : '',
      insurance?.insurance_company || insurance?.insurance_expiry ? `Ασφάλεια: ${insurance?.insurance_company || 'εταιρεία άγνωστη'}${insurance?.insurance_expiry ? `, λήξη ${insurance.insurance_expiry}` : ''}` : 'Ασφάλεια: δεν έχει καταχωρηθεί.',
      loanLine,
      hostingLine,
      accountingLine,
      budgetLine,
      (cal || []).length ? `Επόμενα στο ημερολόγιο: ${(cal || []).map(c => `${c.event_date} ${c.title}${c.amount ? ` ${eur(c.amount)}` : ''}`).join('; ')}` : '',
      checklistLine,
      `Σήμερα είναι ${new Date(todayStr).toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${isWeekend(todayStr) ? ' (Σαββατοκύριακο)' : ''}${holidayName(todayStr) ? `, αργία: ${holidayName(todayStr)}` : ''}.`,
      `Επόμενες επίσημες αργίες Ελλάδας: ${upcomingHolidays(todayStr, 5).map(h => `${h.name} (${new Date(h.date).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })})`).join(', ')}. Όταν προτείνεις ημερομηνία/ώρα ραντεβού, απόφυγε Σαββατοκύριακα και αργίες εκτός αν το ζητήσει ο χρήστης, και ανάφερέ το αν η ημέρα που διαλέγει πέφτει σε αργία/Σαββατοκύριακο.`,
    ].filter(Boolean);
    setCtxStr(lines.join('\n'));

    // ── Insights: τι εκκρεμεί / ευκαιρίες, με την ίδια μηχανή που τροφοδοτεί την Επισκόπηση.
    // Φιλτράρουμε το «λείπουν στοιχεία» γιατί εδώ δεν φορτώνουμε πλήρες προφίλ (το δείχνει η Επισκόπηση).
    const insights: Insight[] = computeInsights({
      now: now.getTime(),
      property: {
        name: propContext.name, prop_type: propContext.propType, value, sqm: propContext.sqm,
        target_rent: propContext.targetRent, insurance_expiry: insurance?.insurance_expiry, insurance_amount: insurance?.insurance_amount,
      },
      tenant: t ? { monthly_rent: t.monthly_rent, lease_end: t.lease_end } : null,
      rent, propValue: value, grossYield: grossY, netYield: netY, expensesYTD: total,
      expenses: expenses.map(e => ({ category: e.category, amount: e.amount || 0, date: e.date, // ΤΟ NULL ΔΕΝ ΕΙΝΑΙ «ΝΑΙ». Εδώ γραφόταν `e.paid !== false`, που περνά το
        // άγνωστο ως εξοφλημένο — ακριβώς το σφάλμα που το lib/expenses/ledger.ts
        // περιγράφει ως διορθωμένο και κρίνει με `paid === true`. Ο βοηθός
        // έλεγε στον ιδιοκτήτη ότι δεν χρωστά τίποτα, ενώ η κάρτα «Χρωστάω»
        // δίπλα του μετρούσε τις ίδιες δαπάνες ως ανοιχτές.
        paid: e.paid === true, payment_method: e.payment_method })),
      bills: billRows.map(b => ({ type: b.category ?? undefined, amount: b.amount, paid: b.paid, due_date: b.due_date })),
      tasks: [], inventory: [],
      checklist: openTasks.map(i => ({ due_date: i.due_date, status: i.status ?? undefined, priority: i.priority ?? undefined })),
    }).filter(i => i.id !== 'profile-incomplete');
    const KIND_TXT: Record<string, string> = { urgent: 'ΕΠΕΙΓΟΝ', attention: 'ΠΡΟΣΟΧΗ', opportunity: 'ΕΥΚΑΙΡΙΑ', positive: 'ΘΕΤΙΚΟ' };
    setInsightsStr(insights.slice(0, 6).map(i => `• [${KIND_TXT[i.kind]}] ${i.title}${i.metric ? ` (${i.metric})` : ''}: ${i.detail}`).join('\n'));

    // ── Αγορά: πραγματικά τρέχοντα νούμερα (επιτόκια, ρεύμα) + σταθερή φορο-κλίμακα 2026.
    const mLines: string[] = [];
    if (rates?.euribor_3m != null) mLines.push(`Euribor 3 μηνών: ${fp(Number(rates.euribor_3m))} (ο δείκτης πάνω στον οποίο πατούν τα κυμαινόμενα επιτόκια στεγαστικών).`);
    if (rates?.bog_housing_new != null) mLines.push(`Μέσο επιτόκιο νέου στεγαστικού δανείου (στοιχεία Τράπεζας της Ελλάδος): περίπου ${fp(Number(rates.bog_housing_new))}.`);
    // ΤΟ ΕΥΡΟΣ ΤΙΜΩΝ ΡΕΥΜΑΤΟΣ ΕΦΥΓΕ, ΚΑΙ ΕΙΝΑΙ ΚΕΡΔΟΣ.
    //
    // Διαβαζόταν από τον πίνακα `energy_tariffs`, που γέμιζε από χειρόγραφη
    // λίστα σφραγισμένη με τον ΤΡΕΧΟΝΤΑ μήνα — δηλαδή τιμές Ιουνίου
    // ανακοινώνονταν ως αυγουστιάτικες. Και συγκρινόταν ΜΟΝΟ η τιμή μονάδας:
    // χωρίς πάγιο, χωρίς κλιμάκια, χωρίς ρήτρα αναπροσαρμογής, χωρίς δέσμευση.
    // Το φθηνότερο kWh του καταλόγου ανήκε σε τιμολόγιο χωρίς πάγιο αλλά με
    // ρήτρα — δηλαδή ακριβώς εκείνο που ΔΕΝ είναι φθηνότερο στον λογαριασμό.
    //
    // Ο βοηθός δεν σιωπά: η οδηγία του λέει να στείλει στη ΡΑΑΕΥ, με την
    // πραγματική κατανάλωση του χρήστη στο χέρι.
    mLines.push(RENTAL_TAX_SUMMARY_2026);
    mLines.push(CLIMATE_LEVY_SUMMARY_2025);
    mLines.push(MUNICIPAL_ACCOM_SUMMARY);
    setMarketStr(mLines.join('\n'));

    // ── Πελατολόγιο: ρόστερ με ιστορικό, ώστε να βρίσκει από όνομα/τηλέφωνο/ΑΦΜ ──
    const clientRoster = (clientRows || []) as ClientsRow[];
    clientsRef.current = clientRoster.map(c => ({ id: c.id, name: c.full_name || '', phone: String(c.phone || ''), afm: String(c.afm || '') }));
    if (clientRoster.length) {
      const staysByClient = new Map<string, ClientStaysRow[]>();
      stays.forEach(s => { const a = staysByClient.get(s.client_id) || []; a.push(s); staysByClient.set(s.client_id, a); });
      const nowMs = Date.now();
      const revSince = (arr: ClientStaysRow[], days: number) => arr.reduce((s, st) => {
        const d = st.check_out || st.check_in; if (!d) return s;
        const t = new Date(d).getTime(); if (isNaN(t) || (nowMs - t) > days * 86400000 || t > nowMs) return s;
        return s + (Number(st.total) || (Number(st.nights) || 0) * (Number(st.nightly_rate) || 0));
      }, 0);
      const cLines = clientRoster.slice(0, 50).map(c => {
        const arr = staysByClient.get(c.id) || [];
        const cs = clientStats(arr);
        const lastBooking = arr.map(s => s.check_in).filter(Boolean).sort().slice(-1)[0] || null;
        const lastNote = arr.slice().sort((a, b) => String(a.check_in || '').localeCompare(String(b.check_in || ''))).map(s => s.notes).filter(n => n && String(n).trim()).slice(-1)[0];
        const bits: string[] = [c.full_name, CLIENT_TYPE_LABELS[c.type as ClientType] || c.type];

        if (cs.stayCount >= 2) bits.push('επαναλαμβανόμενος (2+ διαμονές)');
        if (c.phone) bits.push(`τηλ ${c.phone}`);
        if (c.afm) bits.push(`ΑΦΜ ${c.afm}`);

        if (cs.stayCount) bits.push(`${cs.stayCount} διαμονές, ${cs.nights} νύχτες, συνολικά έσοδα ${eur(cs.revenue)}`);
        if (cs.stayCount) bits.push(`έσοδα: τελευταίος μήνας ${eur(revSince(arr, 30))}, εξάμηνο ${eur(revSince(arr, 182))}, έτος ${eur(revSince(arr, 365))}`);
        if (lastBooking) bits.push(`τελευταία κράτηση ${lastBooking}`);
        if (cs.hasDamage) bits.push(`φθορές ${eur(cs.damageTotal)}`);

        if (c.budget) bits.push(`προϋπολογισμός ${eur(c.budget)}`);
        if (c.needs) bits.push(`ανάγκες: ${c.needs}`);
        if (lastNote) bits.push(`σημείωση τελευταίας διαμονής: «${String(lastNote).slice(0, 160)}»`);
        return `• ${bits.filter(Boolean).join(' · ')}`;
      });
      const extra = clientRoster.length > 50 ? `\n(και ${clientRoster.length - 50} ακόμη, δες την καρτέλα ${navLabel('clients')})` : '';
      setClientsStr(`Σύνολο πελατών: ${clientRoster.length}\n${cLines.join('\n')}${extra}`);
    } else setClientsStr('');

    // ── Επαφές τεχνικών/παρόχων (καρτέλα Επαφές): για να προτείνει ΠΟΙΟΝ
    // να καλέσει/προγραμματίσει για μια εργασία, ή να παραπέμψει αν λείπει ο ρόλος ──
    const techRoster = contacts.filter(c => c.full_name);
    contactsRef.current = techRoster.map(c => ({ name: c.full_name || '', role: c.role || 'other', phone: String(c.phone || ''), email: String(c.email || '') }));
    if (techRoster.length) {
      const tLines = techRoster.slice(0, 60).map(c => {
        const bits = [c.full_name, roleLabel(c.role || 'other')];
        if (c.phone) bits.push(`τηλ ${c.phone}`);
        return `• ${bits.filter(Boolean).join(' · ')}`;
      });
      setTechStr(`Σύνολο επαφών: ${techRoster.length}\n${tLines.join('\n')}`);
    } else setTechStr('');
  }, [propertyId, userId, propContext, supabase]);

  useEffect(() => { if (open && !ctxStr) loadContext(); }, [open, ctxStr, loadContext]);

  const runAction = (a?: Action, keepOpen = false) => {
    if (!a) return;
    if (a.type === 'scan') onScan();
    else if (a.type === 'go') onNavigate(a.tab);
    else if (a.type === 'book') { bookAppointment(a.title, a.date, a.time); return; } // κρατά ανοιχτό το πάνελ για την επιβεβαίωση
    else if (a.type === 'client') { registerClient(a); return; }
    else if (a.type === 'expense') { registerExpense(a.description, a.amount, a.date); return; }
    else if (a.type === 'checkin') { makeCheckinLink(a.who); return; }
    else if (a.type === 'contact') { registerContact(a.name, a.phone, a.role); return; }
    else if (a.type === 'reach') { reachContact(a); return; }
    else if (a.type === 'task') { addTask(a); return; }
    else if (a.type === 'paid') { markPaid(a.description, a.amount); return; }
    else if (a.type === 'inventory') { registerInventory(a); return; }
    else if (a.type === 'commit-doc') { commitPendingDoc(); return; }
    else if (a.type === 'feedback') { setFeedbackOpen(true); return; }
    if (!keepOpen) setOpen(false);
  };

  // Βρες πελάτη από όνομα/τηλέφωνο/ΑΦΜ (ανεκτικό: μερικό όνομα, ψηφία τηλεφώνου).
  const findClient = (who: string): ClientLite | null => {
    const q = (who || '').trim().toLowerCase();
    if (!q) return null;
    const digits = q.replace(/\D/g, '');
    const list = clientsRef.current;
    if (digits.length >= 6) {
      const byNum = list.find(c => c.afm.replace(/\D/g, '') === digits || c.phone.replace(/\D/g, '').endsWith(digits));
      if (byNum) return byNum;
    }
    const exact = list.find(c => c.name.toLowerCase() === q);
    if (exact) return exact;
    const partial = list.filter(c => c.name.toLowerCase().includes(q));
    return partial.length === 1 ? partial[0] : null;   // αν είναι διφορούμενο, μη μαντεύεις
  };

  // Βρες επαφή (τεχνικό/πάροχο) από όνομα ή ρόλο. Ανεκτικό: ακριβές όνομα → μερικό
  // όνομα → ετικέτα ρόλου → συμπερασμένος ρόλος. Επιστρέφει την καλύτερη μοναδική.
  const findContact = (name: string): ContactLite | null => {
    const q = (name || '').trim().toLowerCase();
    if (!q) return null;
    const list = contactsRef.current;
    const exact = list.find(c => c.name.toLowerCase() === q);
    if (exact) return exact;
    const partial = list.filter(c => { const n = c.name.toLowerCase(); return !!n && (n.includes(q) || q.includes(n)); });
    if (partial.length) return partial[0];
    const byRoleLabel = list.filter(c => { const rl = roleLabel(c.role || 'other').toLowerCase(); return !!rl && (rl.includes(q) || q.includes(rl)); });
    if (byRoleLabel.length) return byRoleLabel[0];
    const inferred = inferRole(q);
    if (inferred && inferred !== 'other') {
      const byRole = list.filter(c => (c.role || 'other') === inferred);
      if (byRole.length) return byRole[0];
    }
    return null;
  };

  // Χτίζει «τίμιο» deep link προς την επαφή. Δεν στέλνει τίποτα — απλώς ανοίγει το μέσο.
  // Επιστρέφει είτε το url, είτε ποιο στοιχείο λείπει (τηλέφωνο ή email).
  const buildReachLink = (c: ContactLite, channel: 'whatsapp' | 'viber' | 'email' | 'call', text?: string): { url?: string; need?: 'phone' | 'email' } => {
    const t = (text || '').trim();
    if (channel === 'email') {
      if (!c.email) return { need: 'email' };
      const subject = encodeURIComponent('Επικοινωνία');
      return { url: `mailto:${c.email}?subject=${subject}${t ? `&body=${encodeURIComponent(t)}` : ''}` };
    }
    // whatsapp / viber / call: χρειάζονται τηλέφωνο
    if (!c.phone) return { need: 'phone' };
    let d = onlyDigits(c.phone);
    if (!d) return { need: 'phone' };
    if (d.length === 10) d = `30${d}`;   // ελληνικός αριθμός 10 ψηφίων → διεθνής με πρόθεμα 30
    if (channel === 'viber') return { url: `viber://chat?number=${d}` };   // το Viber δεν προ-συμπληρώνει κείμενο
    if (channel === 'call') return { url: `tel:+${d}` };
    return { url: `https://wa.me/${d}${t ? `?text=${encodeURIComponent(t)}` : ''}` };   // whatsapp
  };

  // Επικοινωνία με επαφή: αναλύει ποιον εννοεί ο χρήστης, χτίζει τον σύνδεσμο και
  // σπρώχνει μήνυμα με κουμπί που ΑΝΟΙΓΕΙ το μέσο όταν το πατήσει ο χρήστης (όχι αυτόματα).
  const reachContact = (a: { name: string; channel: 'whatsapp' | 'viber' | 'email' | 'call'; text?: string }) => {
    const c = findContact(a.name);
    if (!c) {
      setMsgs(m => [...m, { role: 'assistant', text: `Δεν βρήκα την επαφή «${a.name}». Ποιον εννοείς;`, action: { type: 'go', tab: 'contacts' } }]);
      return;
    }
    const link = buildReachLink(c, a.channel, a.text);
    if (link.url) {
      const how = a.channel === 'call' ? `να καλέσεις τον/την «${c.name}»`
        : a.channel === 'email' ? `να ανοίξει το email προς τον/την «${c.name}»`
          : `να ανοίξει το ${a.channel === 'viber' ? 'Viber' : 'WhatsApp'} προς τον/την «${c.name}»`;
      setMsgs(m => [...m, { role: 'assistant', text: `Πάτησε ${how}. Το μήνυμα δεν φεύγει μόνο του, ανοίγει η εφαρμογή για να το στείλεις εσύ.`, action: { type: 'reach', name: c.name, channel: a.channel, text: a.text } }]);
      return;
    }
    // Λείπει το απαραίτητο στοιχείο για το κανάλι — πρότεινε διαθέσιμη εναλλακτική.
    if (link.need === 'phone') {
      if (c.email) setMsgs(m => [...m, { role: 'assistant', text: `Ο/Η «${c.name}» δεν έχει αποθηκευμένο τηλέφωνο για ${CH_HUMAN[a.channel]}. Έχει όμως email, να το ετοιμάσω;`, action: { type: 'reach', name: c.name, channel: 'email', text: a.text } }]);
      else setMsgs(m => [...m, { role: 'assistant', text: `Ο/Η «${c.name}» δεν έχει αποθηκευμένο τηλέφωνο ούτε email. Πρόσθεσε στοιχεία επικοινωνίας στις Επαφές.`, action: { type: 'go', tab: 'contacts' } }]);
    } else {
      if (c.phone) setMsgs(m => [...m, { role: 'assistant', text: `Ο/Η «${c.name}» δεν έχει αποθηκευμένο email. Έχει τηλέφωνο, να ανοίξω WhatsApp αντ’ αυτού;`, action: { type: 'reach', name: c.name, channel: 'whatsapp', text: a.text } }]);
      else setMsgs(m => [...m, { role: 'assistant', text: `Ο/Η «${c.name}» δεν έχει αποθηκευμένο email ούτε τηλέφωνο. Πρόσθεσε στοιχεία επικοινωνίας στις Επαφές.`, action: { type: 'go', tab: 'contacts' } }]);
    }
  };

  // Καταχώρηση δαπάνης με μία φράση: η κατηγορία/ομάδα προκύπτει αυτόματα.
  // ── Η ΚΑΤΑΧΩΡΗΣΗ ΤΟΥ ΣΑΡΩΜΕΝΟΥ ΠΑΡΑΣΤΑΤΙΚΟΥ ────────────────────────────────
  // Καμία λογική εδώ: όλα τα αποφασίζει το commitScannedDoc, που είναι η ίδια
  // συνάρτηση που καλεί και η οθόνη σάρωσης της εφαρμογής. Ο βοηθός μόνο ρωτά
  // και ανακοινώνει — και ανακοινώνει ΟΣΑ ΕΓΙΝΑΝ ΠΡΑΓΜΑΤΙΚΑ, γιατί το
  // αποτέλεσμα επιστρέφει τη λίστα των καρτελών που ενημερώθηκαν.
  const commitPendingDoc = async (choice?: string | null) => {
    const pending = pendingDocRef.current;
    if (!pending || busy) return;
    setBusy(true);
    try {
      const r = await commitScannedDoc({
        doc: pending.doc, file: pending.file, propertyId, userId,
        ...(choice !== undefined ? { reconcileChoice: choice } : {}),
      });

      // ΟΤΑΝ ΔΕΝ ΕΙΝΑΙ ΣΙΓΟΥΡΗ, ΡΩΤΑ. Δεν έχει γραφτεί τίποτα ακόμη: η μηχανή
      // επιστρέφει την ερώτηση αντί να μαντέψει ποιον λογαριασμό εξοφλεί η
      // απόδειξη. Μια λάθος εικασία εδώ σημαίνει λογαριασμός σημειωμένος
      // πληρωμένος που δεν πληρώθηκε.
      if (r.ask) { setMsgs(m => [...m, { role: 'assistant', text: reconcilePrompt(r.ask as ReconcileQuestion) }]); setReconcile(r.ask); setBusy(false); return; }

      pendingDocRef.current = null;
      setReconcile(null);
      if (r.error || !r.saved.length) {
        setMsgs(m => [...m, { role: 'assistant', text: 'Δεν μπόρεσα να το καταχωρήσω τώρα. Δοκίμασε από τη σάρωση της εφαρμογής, όπου μπορείς και να διορθώσεις ό,τι διάβασα λάθος.', action: { type: 'scan' } }]);
        setBusy(false); return;
      }
      setCtxStr('');   // ξαναφόρτωσε το πλαίσιο ώστε να «ξέρει» τη νέα εγγραφή
      loadContext();
      // Ο ΚΩΔΙΚΟΣ ΗΤΑΝ 'expenses' — ΚΑΡΤΕΛΑ ΠΟΥ ΔΕΝ ΥΠΑΡΧΕΙ.
      // Οι Δαπάνες συγχωνεύτηκαν στο 'finances' και το 'expenses' έπαψε να είναι
      // προορισμός. Ο έλεγχος ορατότητας όμως έλεγε «ναι» σε κάθε άγνωστο
      // κωδικό, οπότε το κουμπί περνούσε και ο χρήστης έπεφτε σε ΛΕΥΚΗ ΟΘΟΝΗ:
      // κεφαλίδα, κουμπί «πίσω», και κανένα σώμα — καμία συνθήκη απόδοσης δεν
      // ταιριάζει με ανύπαρκτο κωδικό. Δύο απαντήσεις της Νόα, κάθε φορά που
      // κατέγραφε δαπάνη.
      setMsgs(m => [...m, { role: 'assistant', text: `Έγινε. Ενημερώθηκαν: ${r.saved.join(', ')}.`, action: { type: 'go', tab: 'finances' } }]);
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Δεν μπόρεσα να το καταχωρήσω τώρα. Δοκίμασε ξανά.' }]);
    } finally { setBusy(false); }
  };

  const registerExpense = async (description: string, amount: number, date?: string) => {
    const { group, category, deductible } = classifyExpense(description);
    const today = athensToday();
    // Έγκυρη ISO ημερομηνία (καθορίζει τον ΜΗΝΑ στον προϋπολογισμό)· αλλιώς σήμερα.
    const useDate = date && !isNaN(new Date(date).getTime()) ? date : today;
    // Ο μήνας από το κείμενο της ημερομηνίας. Με `new Date(...).getMonth()` η
    // δαπάνη της 1ης Ιανουαρίου ονομαζόταν «Δεκεμβρίου» σε αρνητική ζώνη ώρας.
    const monthLbl = useDate !== today ? ` (${MONTHS_GEN[(isoMonth(useDate) ?? 1) - 1]})` : '';
    try {
      // ΤΟ «ΜΕΤΡΗΤΑ» ΔΕΝ ΤΟ ΕΙΠΕ ΚΑΝΕΙΣ. Ο τρόπος πληρωμής έχει φορολογική
      // σημασία στην εφαρμογή (τα ενοίκια κατοικίας θέλουν τράπεζα για την
      // τεκμαρτή έκπτωση), και εδώ γραφόταν σταθερά «μετρητά» επειδή έτσι
      // βολεύει τη φόρμα. Μένει κενό: ο χρήστης το συμπληρώνει αν χρειαστεί.
      await must(expenseStore.insert(supabase, [expenseStore.row({ propertyId, userId }, {
        description: description.slice(0, 120), amount,
        category, expense_group: group,
        date: useDate,
        paid: true,
      })]));
      setCtxStr('');   // ξαναφόρτωσε το πλαίσιο ώστε να «ξέρει» τη νέα δαπάνη
      loadContext();
      setMsgs(m => [...m, { role: 'assistant', text: `Το κατέγραψα. Πρόσθεσα δαπάνη «${description}» ${eur(amount)}${monthLbl} στην κατηγορία «${category}»${deductible ? ' (εκπεστέα σε καθεστώς επιχείρησης· ο ιδιώτης με εισόδημα από ακίνητα δεν εκπίπτει αναλυτικά έξοδα, ισχύει η τεκμαρτή έκπτωση 5%)' : ''}. Αν η κατηγορία ή ο μήνας δεν είναι σωστά, άλλαξέ τα στις Δαπάνες.`, action: { type: 'go', tab: 'finances' } }]);
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Δεν μπόρεσα να αποθηκεύσω τη δαπάνη τώρα. Δοκίμασε ξανά ή πρόσθεσέ την από την καρτέλα Δαπάνες.' }]);
    }
  };

  // Σήμανση ΥΠΑΡΧΟΝΤΟΣ ανοιχτού στοιχείου (λογαριασμός ή δόση ενοικίου) ως πληρωμένου.
  // Ασφαλές: αν δεν υπάρχει ΜΟΝΑΔΙΚΗ σαφής αντιστοίχιση, ΔΕΝ μαντεύει — ζητά διευκρίνιση.
  const markPaid = async (description: string, amount?: number) => {
    const q = (description || '').trim().toLowerCase();
    const norm = (s: string) => s.toLowerCase();
    const amtOk = (a: number) => amount == null || (a > 0 && Math.abs(a - amount) / a <= 0.01);
    const bills = openBillsRef.current;
    const rents = openRentRef.current;
    // Υποψήφια: λογαριασμοί (όνομα/κατηγορία ταιριάζει με το κείμενο) + δόσεις ενοικίου.
    // Προσοχή: ΠΟΤΕ να μη ταιριάζει με κενή κατηγορία (q.includes('') === true) — θα
    // σημείωνε λάθος λογαριασμό ως πληρωμένο.
    const textHit = (field: string) => { const f = norm(field).trim(); return !!f && f.length >= 2 && (f.includes(q) || q.includes(f)); };
    const billHits = bills.filter(b => (textHit(b.name) || textHit(b.category)) && amtOk(b.amount));
    const rentHits = /ενοικ|μισθωμ|δοση|δόση/.test(q) || rents.some(r => norm(r.label).includes(q))
      ? rents.filter(r => amtOk(r.amount) && (norm(r.label).includes(q) || /ενοικ|μισθωμ|δοση|δόση/.test(q)))
      : [];
    const totalHits = billHits.length + rentHits.length;
    if (totalHits === 0) {
      const opts = [...bills.map(b => `${b.name} ${eur(b.amount)}`), ...rents.map(r => `${r.label} ${eur(r.amount)}`)];
      setMsgs(m => [...m, { role: 'assistant', text: opts.length ? `Δεν βρήκα ανοιχτό στοιχείο που να ταιριάζει καθαρά με «${description}». Ποιο εννοείς; Ανοιχτά: ${opts.slice(0, 12).join('· ')}.` : `Δεν βλέπω ανοιχτούς λογαριασμούς ή δόσεις ενοικίου για αυτό το ακίνητο.` }]);
      return;
    }
    if (totalHits > 1) {
      const opts = [...billHits.map(b => `${b.name} ${eur(b.amount)}`), ...rentHits.map(r => `${r.label} ${eur(r.amount)}`)];
      setMsgs(m => [...m, { role: 'assistant', text: `Ταιριάζουν περισσότερα από ένα. Σε ποιο να το αντιστοιχίσω; ${opts.join('· ')}.` }]);
      return;
    }
    try {
      const today = athensToday();
      if (billHits.length === 1) {
        const b = billHits[0];
        await must(billStore.markPaid(supabase, b.id));
        await must(expenseStore.updateByBill(supabase, b.id, { paid: true }));
        setMsgs(m => [...m, { role: 'assistant', text: `Έγινε. Σημείωσα τον λογαριασμό «${b.name}» ${eur(b.amount)} ως πληρωμένο.`, action: { type: 'go', tab: 'finances' } }]);
      } else {
        const r = rentHits[0];
        // Δύο στήλες από τις τέσσερις γράφονταν εδώ: η μέθοδος έμενε κενή και οι
        // ημέρες καθυστέρησης μηδέν, ακόμη και σε δόση τριών μηνών πίσω.
        await must(rentStore.markPaid(supabase, r.id, r.due, today, null));
        setMsgs(m => [...m, { role: 'assistant', text: `Έγινε. Σημείωσα τη δόση «${r.label}» ${eur(r.amount)} ως πληρωμένη.`, action: { type: 'go', tab: 'tenant' } }]);
      }
      setCtxStr(''); loadContext();
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Δεν μπόρεσα να το σημειώσω πληρωμένο τώρα. Δοκίμασε ξανά ή κάν’ το από την αντίστοιχη καρτέλα.' }]);
    }
  };


  // Δημιουργία/αντιγραφή συνδέσμου pre-check-in για πελάτη.
  const makeCheckinLink = async (who: string) => {
    const c = findClient(who);
    if (!c) { setMsgs(m => [...m, { role: 'assistant', text: `Δεν βρήκα ξεκάθαρα τον πελάτη «${who}». Πες μου ακριβές όνομα ή τηλέφωνο, ή άνοιξε τους ${navLabel('clients')}.`, action: { type: 'go', tab: 'clients' } }]); return; }
    try {
      const data = await must(supabase.from('checkin_links').upsert({ user_id: userId, client_id: c.id, property_id: propertyId, active: true }, { onConflict: 'user_id,client_id' }).select('token').maybeSingle());
      if (data?.token) {
        const url = `${window.location.origin}/checkin/${data.token}`;
        try { await navigator.clipboard.writeText(url); } catch { /* το εμφανίζουμε ούτως ή άλλως */ }
        setMsgs(m => [...m, { role: 'assistant', text: `Έτοιμο. Αντέγραψα τον σύνδεσμο check-in για τον/την «${c.name}». Στείλ’ τον στον επισκέπτη σε WhatsApp ή Viber:\n${url}`, action: { type: 'go', tab: 'clients' } }]);
      } else throw new Error('no token');
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: `Δεν μπόρεσα να φτιάξω τον σύνδεσμο τώρα. Δοκίμασε από την καρτέλα του πελάτη στους ${navLabel('clients')}.`, action: { type: 'go', tab: 'clients' } }]);
    }
  };

  // Προσθήκη επαφής (τεχνικός/πάροχος) στην καρτέλα Επαφές, με αυτόματο ρόλο.
  const registerContact = async (name: string, phone?: string, role?: string) => {
    const roleValue = inferRole(role || name);
    try {
      const { error } = await contactStore.add(supabase, propertyId, userId, {
        full_name: name.slice(0, 120), role: roleValue,
        phone: phone || null, email: null, notes: null,
      });
      if (error) throw new Error(error.message ?? 'Σφάλμα βάσης');
      setMsgs(m => [...m, { role: 'assistant', text: `Την κράτησα. Πρόσθεσα τον/την «${name}»${phone ? ` (${phone})` : ''} στις Επαφές του ακινήτου. Θέλεις να ανοίξω τις Επαφές για να προσθέσεις κι άλλα;`, action: { type: 'go', tab: 'contacts' } }]);
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Δεν μπόρεσα να αποθηκεύσω την επαφή τώρα. Δοκίμασε ξανά ή πρόσθεσέ την από την καρτέλα Επαφές.' }]);
    }
  };

  // Καταχώρηση αντικειμένου στην Απογραφή (από τη συνομιλία, με φωνή/κείμενο ή φωτο).
  const registerInventory = async (a: { name: string; category?: string; value?: number; brand?: string; model?: string; room?: string }) => {
    try {
      const { error } = await inventory.add(supabase, propertyId, userId, [{
        name: a.name.slice(0, 120), category: a.category || 'Λοιπά',
        brand: a.brand || null, model: a.model || null, room: a.room || null,
        purchase_value: a.value || 0, condition: 'Καλή',
      }]);
      if (error) throw new Error(error.message ?? 'Σφάλμα βάσης');
      setMsgs(m => [...m, { role: 'assistant', text: `Το κατέγραψα στα «${navLabel('inventory')}»: «${a.name}»${a.value ? ` (αξία ${eur(a.value)})` : ''}. Θέλεις να ανοίξω την καρτέλα για να προσθέσεις φωτογραφία, εγγύηση ή άλλες λεπτομέρειες;`, action: { type: 'go', tab: 'inventory' } }]);
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: `Δεν μπόρεσα να το καταγράψω τώρα. Δοκίμασε από την καρτέλα «${navLabel('inventory')}».` }]);
    }
  };


  // Προσθήκη νέας εκκρεμότητας — με προθεσμία/κόστος/προτεραιότητα & αυτόματο κύκλωμα.
  const addTask = async (a: { description: string; category?: string; due_date?: string; est_cost?: number; priority?: string }) => {
    const d = a.description.slice(0, 200);
    const category = a.category || (/φόρο|ενφια|ε2|ε1|δήλωσ|ααδε|μισθωτήρι|ασφαλιστ/i.test(d) ? 'legal'
      : /υδραυλικ|ηλεκτρολ|επισκευ|συντήρησ|βλάβη|βαφ|καθαρι|μάστορ/i.test(d) ? 'maintenance'
      : /πληρωμ|λογαριασμ|δόση|κόστος/i.test(d) ? 'financial' : 'other');
    const priority = a.priority || 'normal';
    const due = a.due_date || null;
    const est = a.est_cost || 0;
    const today = athensToday();
    try {
      const ins = await must(checklist.addReturning(supabase, {
        property_id: propertyId, user_id: userId, description: d,
        category, priority, recurring: 'none', due_date: due,
        status: 'pending', completed: false, note: null,
        estimated_cost: est, actual_cost: 0, sort_order: 0,
      }));
      const newId = (ins as { id?: string } | null)?.id;
      // Κύκλωμα: ημερολόγιο (email υπενθύμιση) + εκκρεμής δαπάνη.
      // Η κατηγορία της δαπάνης βγαίνει από την ταξινομία (μία πηγή), όχι από
      // σταθερό κείμενο: ένα χειρόγραφο «Συντήρηση & Επισκευές» ήταν πέμπτη
      // εκδοχή ονόματος κατηγορίας, και η ομάδα του δίπλα του ήταν ανεξάρτητη.
      const taskCat = classifyExpense(d);
      let calId: string | null = null;
      if (newId && due) { const data = await must(calendar.add(supabase, { propertyId, userId }, 'checklist', { title: d, event_date: due, category: 'maintenance', amount: est, priority: priority === 'normal' ? 'medium' : priority as calendar.EventPriority })); calId = data?.id || null; }
      // ΜΙΑ ΕΚΤΙΜΗΣΗ ΔΕΝ ΓΙΝΕΤΑΙ ΔΑΠΑΝΗ. Εδώ γραφόταν γραμμή στον πίνακα
      // `expenses` με ποσό που είχε βγάλει το ΜΟΝΤΕΛΟ («θα κοστίσει γύρω στα
      // 150 ευρώ»). Στην επόμενη ερώτηση το ίδιο ποσό επέστρεφε στα συμφραζόμενα
      // ως «Δαπάνες φέτος: σύνολο X» και έμπαινε στην καθαρή απόδοση. Δηλαδή ο
      // βοηθός διάβαζε ως γεγονός ό,τι είχε μαντέψει δύο βήματα πριν.
      //
      // Η ίδια η καρτέλα Εκκρεμότητες έχει ήδη αυτόν τον κανόνα γραμμένο: δαπάνη
      // υπάρχει μόνο όταν υπάρχει παραστατικό. Η εκτίμηση ζει στο
      // `estimated_cost` της εκκρεμότητας, όπου ΕΙΝΑΙ εκτίμηση και το λέει.
      if (newId && calId) await must(checklist.linkEvent(supabase, newId, calId));
      const bits: string[] = [];
      if (due) bits.push('προθεσμία και υπενθύμιση με email');
      if (est > 0) bits.push(`εκτίμηση ${eur(est)}`);
      setMsgs(m => [...m, { role: 'assistant', text: `Το πρόσθεσα στις Εκκρεμότητες: «${d}»${bits.length ? `, ${bits.join(', ')}` : ''}. Θέλεις να το δεις;`, action: { type: 'go', tab: 'checklist' } }]);
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Δεν μπόρεσα να προσθέσω την εκκρεμότητα τώρα. Δοκίμασε από την καρτέλα Εκκρεμότητες.' }]);
    }
  };

  // Καταχώρηση νέου πελάτη στο Πελατολόγιο (από τη συνομιλία, με φωνή ή κείμενο).
  const registerClient = async (a: { name: string; phone?: string; afm?: string; ctype?: string }) => {
    const raw = (a.ctype || '').toLowerCase();
    const ctype: ClientType = /owner|ιδιοκτ/.test(raw) ? 'owner' : /client|πελατ/.test(raw) ? 'client' : 'lead';
    try {
      await must(supabase.from('clients').insert({
        user_id: userId, full_name: a.name, type: ctype,
        phone: a.phone || null, afm: a.afm || null, stage: 'lead',
      }));
      setClientsStr('');
      loadContext();
      setMsgs(m => [...m, { role: 'assistant', text: `Τον καταχώρησα. Πρόσθεσα τον/την «${a.name}»${a.phone ? ` (${a.phone})` : ''} στους ${navLabel('clients')} ως ${CLIENT_TYPE_LABELS[ctype]}. Θέλεις να ανοίξω την καρτέλα για να συμπληρώσεις κι άλλα στοιχεία;`, action: { type: 'go', tab: 'clients' } }]);
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: `Δεν μπόρεσα να αποθηκεύσω τον πελάτη τώρα. Δοκίμασε ξανά ή πρόσθεσέ τον από την καρτέλα ${navLabel('clients')}.` }]);
    }
  };

  // Κράτηση ραντεβού: γράφει γεγονός στο Ημερολόγιο. Η υπάρχουσα ροή υπενθυμίσεων
  // (send-reminders) στέλνει email 3 & 1 ημέρα πριν, αν ο χρήστης έχει ενεργές ειδοποιήσεις.
  const bookAppointment = async (title: string, date: string, time?: string) => {
    // Κατηγορία από τον τίτλο (ώστε π.χ. «check κλιματιστικό» να πάει σε Συντήρηση, όχι Οικονομικά).
    const t = (title || '').toLowerCase();
    const category = /service|συντήρησ|καθαρισ|κλιματ|κλίμα|clima|air ?cond|λέβητ|καυστήρ|θερμοσίφ|βλάβ|επισκευ|υδραυλ|ηλεκτρολ|ψυκτ|μάστορ|συνεργ|έλεγχ|check/.test(t) ? 'maintenance'
      : /τράπεζ|δάνει|χρηματοδ|λογιστ|φορο|ενφια|εφορ|πληρωμ|είσπραξ/.test(t) ? 'financial'
      : /ενοικιαστ|μισθωτ|tenant|συμβόλαι|μίσθωσ/.test(t) ? 'tenant'
      : 'reminder';
    try {
      // Αποφυγή διπλοεγγραφής: ίδιο ακίνητο + τίτλος + ημερομηνία υπάρχει ήδη.
      if (await calendar.exists(supabase, propertyId, { eventDate: date, title })) {
        setMsgs(m => [...m, { role: 'assistant', text: `Υπάρχει ήδη «${title}» για εκείνη την ημερομηνία στο Ημερολόγιο, δεν το ξαναπρόσθεσα. Θέλεις να το δεις;`, action: { type: 'go', tab: 'calendar' } }]);
        return;
      }
      await must(calendar.insert(supabase, [calendar.row({ propertyId, userId }, 'assistant', {
        title, category,
        event_date: date, event_time: time || null, duration_minutes: time ? 60 : null,
        priority: 'high',
        notes: `Ραντεβού που προγραμμάτισε ${ASSISTANT_NAME}. Θα σταλεί υπενθύμιση πριν λήξει (email, εφόσον είναι ενεργές οι ειδοποιήσεις· με ένα άγγιγμα και σε Viber/WhatsApp).`,
      })]));
      const whenStr = `${new Date(date).toLocaleDateString('el-GR')}${time ? ` στις ${time}` : ''}`;
      setMsgs(m => [...m, { role: 'assistant', text: `Το έκλεισα. Πρόσθεσα το «${title}» για ${whenStr} στο Ημερολόγιο και θα σου θυμίσω πριν λήξει. Θέλεις να ανοίξω το Ημερολόγιο;`, action: { type: 'go', tab: 'calendar' } }]);
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Δεν μπόρεσα να αποθηκεύσω το ραντεβού τώρα. Δοκίμασε ξανά ή πρόσθεσέ το χειροκίνητα στο Ημερολόγιο.' }]);
    }
  };

  // ── Φωνή: ομιλία στα ελληνικά (hands-free) ─────────────────────────────────
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  useEffect(() => { listeningRef.current = listening; }, [listening]);
  const recRef = useRef<SpeechRecognizer | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const handsFreeRef = useRef(false);
  const supportsSTT = speechSupported();
  const supportsTTS = typeof window !== 'undefined' && 'speechSynthesis' in window;
  useEffect(() => { handsFreeRef.current = handsFree; }, [handsFree]);

  useEffect(() => {
    if (!supportsTTS) return;
    const load = () => { voicesRef.current = window.speechSynthesis.getVoices(); };
    load(); window.speechSynthesis.onvoiceschanged = load;
    return () => { try { window.speechSynthesis.onvoiceschanged = null; window.speechSynthesis.cancel(); } catch { /* ignore */ } };
  }, [supportsTTS]);

  // Μία φωνή, χωρίς φύλο: διαλέγουμε την πιο ουδέτερη και ευκρινή ελληνική που
  // δίνει το σύστημα, χωρίς να ψάχνουμε «αντρική» ή «γυναικεία».
  const pickVoice = (): SpeechSynthesisVoice | null => {
    const el = voicesRef.current.filter(v => v.lang && v.lang.toLowerCase().startsWith('el'));
    if (!el.length) return null;
    return el.find(v => /Google/i.test(v.name)) || el[0];
  };

  const speak = (text: string, after?: () => void) => {
    const spoken = cleanForSpeech(text);
    if (!supportsTTS || !spoken) { after?.(); return; }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(spoken);
      const v = pickVoice(); if (v) u.voice = v;
      u.lang = 'el-GR'; u.rate = 1.0; u.pitch = 1.0;
      u.onstart = () => setSpeaking(true);
      u.onend = () => { setSpeaking(false); after?.(); };
      u.onerror = () => { setSpeaking(false); after?.(); };
      window.speechSynthesis.speak(u);
    } catch { after?.(); }
  };
  const stopSpeaking = () => { try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } setSpeaking(false); };

  const stopListening = () => { try { recRef.current?.stop(); } catch { /* ignore */ } setListening(false); };
  const startListening = () => {
    const SR = speechRecognizer();
    if (!SR) return;
    stopSpeaking();
    const rec = new SR();
    rec.lang = 'el-GR'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    let finalText = '';
    rec.onresult = (e: SpeechEvent) => {
      let interim = '';
      const res = e.results;
      if (!res) return;
      for (let i = e.resultIndex ?? 0; i < res.length; i++) {
        const tr = res[i][0]?.transcript || '';
        if (res[i].isFinal) finalText += tr; else interim += tr;
      }
      setInput((finalText + interim).trim());
    };
    rec.onerror = (ev: SpeechErrorEvent) => { setListening(false); if ((ev?.error || '') === 'not-allowed' || (ev?.error || '') === 'service-not-allowed') { setHandsFree(false); handsFreeRef.current = false; } };
    rec.onend = () => {
      setListening(false);
      const t = finalText.trim();
      if (t) { setInput(''); ask(t, true); }
      // Hands-free: αν δεν πιάστηκε ομιλία (παύση/θόρυβος), ξανάνοιξε το μικρόφωνο
      // ώστε ο κύκλος να μη «σπάει». Δεν ξεκινά όσο εκφωνείται απάντηση ή ήδη ακούει.
      else if (handsFreeRef.current) setTimeout(() => { if (handsFreeRef.current && !listeningRef.current && !(supportsTTS && window.speechSynthesis.speaking)) startListening(); }, 500);
    };
    recRef.current = rec; setInput(''); setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };
  const toggleMic = () => { if (listening) stopListening(); else { setOpen(true); startListening(); } };

  /**
   * Διαβάζει το υπόλοιπο από τις κεφαλίδες της απάντησης.
   *
   * Καλείται και στις ΔΥΟ διαδρομές που ξοδεύουν ερώτηση, τη συνομιλία και τη
   * σάρωση φωτογραφίας: αλλιώς ο μετρητής θα έδειχνε λιγότερα από όσα όντως
   * ξόδεψε ο χρήστης, που είναι χειρότερο από το να μην υπάρχει.
   *
   * Αν οι κεφαλίδες λείπουν —παλιά έκδοση της βάσης— δεν αγγίζει τίποτα: η
   * γραμμή απλώς δεν εμφανίζεται.
   */
  const readQuota = (res: Response) => {
    // ΚΑΙ ΤΑ ΔΥΟ ΟΡΙΑ, ΟΧΙ ΜΟΝΟ ΤΟΥ ΜΗΝΑ. Μέσα σε ένα απόγευμα δεσμεύει σχεδόν
    // πάντα το ημερήσιο: ο συνδρομητής «Ιδιοκτήτης» σταματούσε στην 8η ερώτηση
    // ενώ η γραμμή μπροστά του έγραφε ότι του απομένουν 15 του μήνα.
    const n = (h: string) => Number(res.headers.get(h));
    const q = { month: n('x-ai-month'), monthLimit: n('x-ai-month-limit'), day: n('x-ai-day'), dayLimit: n('x-ai-day-limit') };
    if (Object.values(q).every(Number.isFinite) && q.monthLimit > 0) setQuota(q);
  };

  const ask = async (question: string, viaVoice = false) => {
    const q = question.trim();
    if (!q || busy) return;
    setErr(''); setLimitMsg(''); setInput('');
    const history = [...msgs, { role: 'user' as const, text: q }];
    setMsgs(history); setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const system = buildSystemBlocks(prefs, ctxStr || 'Τα δεδομένα φορτώνονται.', allPropsContext, {
        // ΤΙ ΓΝΩΣΗ ΝΑ ΦΟΡΤΩΘΕΙ. Οι τελευταίες έξι ερωτήσεις του χρήστη, όχι μόνο
        // η τωρινή: το «και πόσο θα πληρώνω;» δεν λέει από μόνο του ότι μιλάμε
        // για δάνειο. Έξι φτάνουν για να κρατηθεί το θέμα όσο διαρκεί η κουβέντα
        // και λίγες για να μη σέρνεται ένα θέμα που τελείωσε πριν από ώρα.
        topic: history.filter(m => m.role === 'user').slice(-6).map(m => m.text).join(' '),
        insights: insightsStr || undefined,
        market: marketStr || undefined,
        clients: clientsStr || undefined,
        contactsPro: techStr || undefined,
        pricing: pricingStr || undefined,
        memories: prefs.memory ? memories.map(m => m.text) : undefined,
        // ΤΟ ΠΑΚΕΤΟ ΜΑΖΙ ΜΕ ΤΑ ΟΡΙΑ ΤΟΥ. Σκέτο το όνομα δεν έφτανε: στη δοκιμή
        // το όνομα είναι «Ιδιοκτήτης+», και η Νόα έλεγε τις ερωτήσεις ΕΚΕΙΝΟΥ
        // του πακέτου ενώ ο μετρητής έδινε το δοκιμαστικό. Το `planBrief`
        // φτιάχνεται από το `planBriefing`, που ξέρει και τα δύο.
        plan: planBrief,
        // ΤΙ ΔΕΝ ΒΛΕΠΕΙ, ΑΠΟ ΤΗΝ ΙΔΙΑ ΠΗΓΗ ΠΟΥ ΤΟ ΑΠΟΦΑΣΙΖΕΙ Η ΜΠΑΡΑ. Το κουμπί
        // της ενέργειας κρύβεται ήδη αν η καρτέλα είναι κλειστή, αλλά αυτό είναι
        // φράχτης στο τέλος: η γραμμή ΠΡΙΝ έχει ήδη γραφτεί στη βάση και ο
        // χρήστης έχει ήδη διαβάσει «τον καταχώρησα». Ο βοηθός πρέπει να μην το
        // προτείνει καθόλου, και το ξέρει μόνο αν του το πούμε.
        lockedTabs: canNavigate
          ? NAV_MAP.filter(n => !canNavigate(n.id)).map(n => `«${navLabel(n.id)}»`).join(', ') || undefined
          : undefined,
        // ΩΡΑ ΕΛΛΑΔΑΣ, ΟΧΙ ΤΗΣ ΣΥΣΚΕΥΗΣ. Το toLocaleDateString χωρίς timeZone
        // ακολουθεί το ρολόι του browser: ο ιδιοκτήτης που ταξιδεύει θα έπαιρνε
        // λάθος μέρα, και μαζί λάθος απάντηση σε κάθε «προλαβαίνω;».
        //
        // Δίνουμε ΚΑΙ την ώρα: χωρίς αυτήν ο βοηθός δεν μπορεί να ξεχωρίσει το
        // «σήμερα το πρωί» από το «απόψε», ούτε να πει αν προλαβαίνεις να
        // πληρώσεις κάτι που λήγει σήμερα. Και το ISO δίπλα, ώστε να μη χρειάζεται
        // να μεταφράσει ελληνικό μήνα σε αριθμό όταν υπολογίζει προθεσμίες.
        today: `${athensNowLabel()} (ISO: ${athensToday()}, ώρα Ελλάδας)`,
      });
      const res = await fetch('/api/anthropic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        // ΗΤΑΝ 900, ΜΕ ΤΟ ΤΑΒΑΝΙ ΤΟΥ ΔΙΑΚΟΜΙΣΤΗ ΣΤΑ 2000. Μια ανάλυση δανείου ή ένας
        // πίνακας τιμών ανά μήνα κοβόταν στη μέση, και ο χρήστης διάβαζε μισό
        // συλλογισμό χωρίς να ξέρει ότι λείπει κάτι.
        // ΤΟ ΜΟΝΤΕΛΟ ΔΙΑΛΕΓΕΤΑΙ ΑΠΟ ΤΗΝ ΕΡΩΤΗΣΗ, ΟΧΙ ΑΠΟ ΣΥΝΗΘΕΙΑ. Κάθε ερώτηση
        // πήγαινε στο ακριβό μοντέλο, από το «καλημέρα» ως τον υπολογισμό ΣΕΠΠΕ,
        // και επειδή το πακέτο ερωτήσεων κάθε συνδρομής βγαίνει από διαίρεση,
        // αυτό σήμαινε λιγότερες ερωτήσεις για τον συνδρομητή (βλ. lib/assistant/model.ts).
        body: JSON.stringify({ model: modelFor(q), max_tokens: 1800, system, messages: history.map(m => ({ role: m.role, content: m.text })) }),
      });
      readQuota(res);
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) { setLimitMsg(String(data?.error || '')); setErr('limit'); }
        else setErr(String(data?.error || '').includes('ANTHROPIC_API_KEY') ? 'key' : 'service');
        setMsgs(m => m.slice(0, -1));
        return;
      }
      const raw: string = data?.content?.find((c: { type: string }) => c.type === 'text')?.text || 'Δεν έχω απάντηση αυτή τη στιγμή.';
      const { clean, action, remember } = parseAction(raw);
      // Μόνιμη μνήμη: κράτησε το γεγονός που ζητήθηκε (μόνο αν το επιτρέπει η ρύθμιση).
      if (remember && prefs.memory) setMemories(addMemory(userId, remember));
      // Η «επικοινωνία με επαφή» δεν εμφανίζεται ως κουμπί στο πρώτο μήνυμα· την
      // «εκτελούμε» αμέσως (ανάλυση επαφής) ώστε να προκύψει είτε κουμπί-σύνδεσμος
      // που ανοίγει το μέσο με ένα άγγιγμα, είτε ερώτηση/εναλλακτική αν λείπει κάτι.
      const isReach = action?.type === 'reach';
      // Στη φωνή/hands-free η ενέργεια εκτελείται αυτόματα παρακάτω — μην αφήσεις και
      // κουμπί (θα προκαλούσε διπλή καταχώρηση αν το πατούσε κι ο χρήστης).
      const willAutoRun = !!action && !isReach && (viaVoice || handsFreeRef.current);
      setMsgs(m => [...m, { role: 'assistant', text: clean, action: (isReach || willAutoRun) ? undefined : action }]);
      if (isReach) runAction(action, true);
      // Μετά τις ~12 πρώτες απαντήσεις, πρότεινε (μία φορά) αξιολόγηση του PROPERWISE.
      answeredRef.current += 1;
      if (answeredRef.current >= 12 && !nudgedRef.current && !action) {
        nudgedRef.current = true;
        setMsgs(m => [...m, {
          role: 'assistant',
          text: `Με βοηθάς λίγο; Αξιολόγησε το PROPERWISE κι εμένα, ώστε να βελτιώσουμε τις υπηρεσίες μας. Ό,τι γράψεις το διαβάζει άνθρωπος από την ομάδα και το παίρνουμε στα σοβαρά.`,
          action: { type: 'feedback' },
        }]);
      }
      // Φωνητική απάντηση + εκτέλεση ενέργειας / συνέχιση συνομιλίας.
      if (viaVoice || handsFreeRef.current) {
        speak(clean, () => {
          if (action && !isReach) runAction(action, true);
          if (handsFreeRef.current) setTimeout(() => startListening(), 350);
        });
      }
    } catch { setErr('service'); setMsgs(m => m.slice(0, -1)); }
    finally { setBusy(false); }
  };

  // ── ΤΟ ΠΑΡΑΣΤΑΤΙΚΟ ΠΕΡΝΑΕΙ ΑΠΟ ΤΗ ΜΙΑ ΜΗΧΑΝΗ, ΟΧΙ ΑΠΟ ΔΕΥΤΕΡΗ ──────────────
  //
  // ΤΙ ΓΙΝΟΤΑΝ. Ο βοηθός είχε δικό του διάβασμα απόδειξης: ένα ελαφρύ prompt που
  // έβγαζε περιγραφή, ποσό και ημερομηνία, και μετά έγραφε ΜΙΑ γραμμή στις
  // δαπάνες. Η εφαρμογή όμως έχει ήδη ολόκληρη μηχανή γι' αυτό (scanDoc), και
  // κάνει τρία πράγματα που ο βοηθός δεν έκανε κανένα:
  //   · ΣΥΜΦΩΝΙΑ: αν η απόδειξη εξοφλεί εκκρεμή λογαριασμό, τον σημαίνει
  //     πληρωμένο αντί να φτιάξει δεύτερη εγγραφή για το ίδιο ευρώ.
  //   · ΔΙΠΛΟΕΓΓΡΑΦΗ: αν η ίδια δαπάνη υπάρχει ήδη, δεν την ξαναγράφει.
  //   · ΑΡΧΕΙΟ: ανεβάζει το πρωτότυπο, ώστε το χαρτί να υπάρχει στον έλεγχο.
  // Ο ιδιοκτήτης που φωτογράφιζε τον λογαριασμό ΔΕΗ αφού τον είχε ήδη
  // καταχωρήσει, τον μετρούσε δύο φορές — και το διπλό ποσό ταξίδευε στη
  // Λογιστική και στην πρόβλεψη φόρου.
  //
  // Η ΦΩΤΟΓΡΑΦΙΑ ΑΝΤΙΚΕΙΜΕΝΟΥ ΜΕΝΕΙ ΕΔΩ. Το scanFile κρίνει ντετερμινιστικά: αν
  // δεν βρει ΚΑΝΕΝΑ στοιχείο παραστατικού, δεν είναι χαρτί. Τότε — και μόνο
  // τότε — τρέχει η αναγνώριση συσκευής, που η μηχανή του Αρχείου δεν κάνει.
  const askImage = async (file: File) => {
    if (!file.type.startsWith('image/') || busy) return;
    if (file.size > 10 * 1024 * 1024) { setMsgs(m => [...m, { role: 'assistant', text: 'Η φωτογραφία είναι πολύ μεγάλη (>10MB). Δοκίμασε μικρότερη.' }]); return; }
    setErr('');
    setMsgs(m => [...m, { role: 'user', text: 'Φωτογραφία (απόδειξη/λογαριασμός ή αντικείμενο)' }]);
    setBusy(true);

    // ── 1) Είναι παραστατικό; Το απαντά η ίδια σάρωση με το Αρχείο ──────────
    try {
      const scan = await scanFile(file);
      if (scan.kind === 'document' && scan.doc) {
        pendingDocRef.current = { doc: scan.doc, file };
        const d = scan.doc;
        const bits = [d.provider, d.amount != null ? eur(d.amount) : null, d.period || d.issue_date].filter(Boolean).join(' · ');
        setMsgs(m => [...m, { role: 'assistant',
          text: `Διάβασα ${DOC_TYPE_LABELS[d.doc_type] || 'παραστατικό'}${bits ? `: ${bits}` : ''}. Να το καταχωρήσω; Θα ελέγξω πρώτα αν εξοφλεί κάτι που ήδη περιμένει, και θα κρατήσω το πρωτότυπο στο Αρχείο.`,
          action: { type: 'commit-doc', label: d.title || d.provider || 'παραστατικό' } }]);
        setBusy(false); return;
      }
    } catch { /* πέφτουμε στην αναγνώριση αντικειμένου παρακάτω */ }

    // ── 2) Δεν είναι χαρτί: τι αντικείμενο δείχνει; ────────────────────────
    try {
      const b64: string | null = await new Promise(res => { const r = new FileReader(); r.onload = () => res((r.result as string).split(',')[1] || null); r.onerror = () => res(null); r.readAsDataURL(file); });
      if (!b64) { setBusy(false); return; }
      const { data: { session } } = await supabase.auth.getSession();
      const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 30000);
      const res = await fetch('/api/anthropic', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 500, system: IMG_ITEM_SCAN_SYSTEM,
          messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: file.type || 'image/jpeg', data: b64 } }, { type: 'text', text: 'Διάβασε το αντικείμενο/συσκευή από τη φωτογραφία.' }] }] }),
      });
      clearTimeout(timer);
      readQuota(res);
      const data = await res.json();
      if (!res.ok || data?.error) { setMsgs(m => [...m, { role: 'assistant', text: 'Δεν μπόρεσα να διαβάσω τη φωτογραφία τώρα. Δοκίμασε ξανά ή πες μου τα στοιχεία.' }]); setBusy(false); return; }
      const txt: string = data?.content?.find((c: { type: string }) => c.type === 'text')?.text || '{}';
      let d: Record<string, string> = {};
      try { d = JSON.parse(txt.replace(/```json?|```/g, '').trim()); } catch { /* ignore */ }

      const CATS = ['Έπιπλα', 'Ηλεκτρικές Συσκευές', 'Ηλεκτρονικά', 'Υδραυλικά', 'Θέρμανση & Ψύξη', 'Φωτιστικά', 'Διακόσμηση', 'Λοιπά'];
      const name = (d.name || [d.brand, d.model].filter(Boolean).join(' ') || '').slice(0, 120);
      if (!name) { setMsgs(m => [...m, { role: 'assistant', text: 'Δεν κατάλαβα καθαρά τι δείχνει η φωτογραφία. Δοκίμασε πιο κοντινή/καθαρή λήψη ή πες μου τι είναι.' }]); setBusy(false); return; }
      const val = d.price ? Math.round(parseFloat(String(d.price).replace(/[^\d.]/g, '')) || 0) : 0;
      const category = d.category && CATS.includes(d.category) ? d.category : undefined;
      const action = { type: 'inventory' as const, name, category, value: val > 0 ? val : undefined, brand: d.brand || undefined, model: d.model || undefined };
      const bits = [d.brand, d.model && `μοντ. ${d.model}`, val > 0 && `~${fe(val)}`, category].filter(Boolean).join(' · ');
      setMsgs(m => [...m, { role: 'assistant', text: `Διάβασα: ${name}${bits ? ` (${bits})` : ''}. Να το καταγράψω στα «${navLabel('inventory')}»;`, action }]);
    } catch { setMsgs(m => [...m, { role: 'assistant', text: 'Δεν μπόρεσα να διαβάσω τη φωτογραφία τώρα. Δοκίμασε ξανά.' }]); }
    finally { setBusy(false); }
  };

  // Η τρέχουσα εκδοχή του `ask` για τον ακροατή του `pos:ask`.
  useEffect(() => { askRef.current = ask; });

  // Ο χαιρετισμός λέει ΤΙ ΒΛΕΠΕΙ, όχι τι είναι. Το «ρώτησέ με οτιδήποτε» δεν λέει
  // τίποτα· το «βλέπω τα ενοίκια και τις δαπάνες του Χ» λέει τα πάντα, και είναι
  // ο λόγος που ο χρήστης θα ρωτήσει κάτι δικό του αντί για κάτι γενικό.
  const greeting = buildGreeting(ASSISTANT_NAME, openerCtx, prefs.formal);
  // Όλα τα σταθερά κείμενα βγαίνουν από την ταυτότητα — κανένα δεν γράφεται εδώ.
  const cta = askCta(prefs.formal);
  const placeholder = askPlaceholder(prefs.formal);

  // ── Μετακίνηση του κουμπιού (σύρσιμο) ώστε να μην εμποδίζει το περιεχόμενο ──
  // Το κουμπί δεν είναι πια κύκλος σταθερών 60px: είναι πλήκτρο με το όνομα, και
  // στενεύει σε σήμα στο κινητό. Άρα ΜΕΤΡΑΜΕ το μέγεθός του αντί να το μαντεύουμε
  // — αλλιώς η μισή πρόσκληση θα κατέληγε έξω από την οθόνη μετά από σύρσιμο.
  // Εφεδρικό ύψος, όταν το κουμπί δεν έχει αποδοθεί ακόμη. Η ΠΗΓΗ είναι το
  // `--fab-h` στο globals.css, γιατί την ίδια τιμή χρειάζεται και το κάτω
  // περιθώριο του .app-content που κρατά το περιεχόμενο μακριά από εδώ.
  const FAB_H = 52;
  const fabRef = useRef<HTMLButtonElement | null>(null);

  // ═══ ΤΟ ΚΟΥΜΠΙ ΠΟΥ ΚΑΘΟΤΑΝ ΠΑΝΩ ΣΤΟ «ΑΠΟΘΗΚΕΥΣΗ» ════════════════════════
  // Το `.app-content` κρατά κάτω περιθώριο για το πλωτό κουμπί, οπότε στη σελίδα
  // δεν εμποδίζει. Σε παράθυρο όμως, που είναι `fixed` και ζωγραφίζεται από πάνω,
  // το περιθώριο δεν ισχύει: το κουμπί κάθεται ακριβώς πάνω στη δεξιά κάτω γωνία,
  // δηλαδή πάνω στο «Αποθήκευση» κάθε φόρμας της εφαρμογής.
  //
  // Το σήμα δεν το επινοούμε: κάθε παράθυρο δηλώνει `aria-modal="true"` — και
  // όσα δεν το δήλωναν, τώρα το δηλώνουν. Όσο υπάρχει ένα ανοιχτό, ο βοηθός
  // αποσύρεται. Μόλις κλείσει, επιστρέφει.
  const [overlayOpen, setOverlayOpen] = useState(false);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const check = () => setOverlayOpen(!!document.querySelector('[aria-modal="true"]'));
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal'] });
    return () => mo.disconnect();
  }, []);
  const fabBox = () => {
    const r = fabRef.current?.getBoundingClientRect();
    return { w: r?.width || FAB_H, h: r?.height || FAB_H };
  };
  const fabDrag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  useEffect(() => {
    // Φόρτωσε την αποθηκευμένη θέση, ΑΛΛΑ μόνο αν χωράει ολόκληρο το κουμπί μέσα
    // στην τρέχουσα οθόνη. Αλλιώς (άλλο μέγεθος παραθύρου/οθόνη, χαλασμένη τιμή)
    // αγνόησέ την ώστε το πλωτό να επιστρέψει στη σταθερή κάτω-δεξιά θέση.
    try {
      const s = localStorage.getItem('pa_fab_pos');
      if (!s) return;
      const p = JSON.parse(s) as { x: number; y: number };
      const m = 8;
      const { w, h } = fabBox();
      const inView = typeof window !== 'undefined'
        && Number.isFinite(p?.x) && Number.isFinite(p?.y)
        && p.x >= m && p.y >= m
        && p.x <= window.innerWidth - w - m
        && p.y <= window.innerHeight - h - m;
      if (inView) setFabPos(p);
      else localStorage.removeItem('pa_fab_pos');
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (!fabPos || dragging) return;
    try { localStorage.setItem('pa_fab_pos', JSON.stringify(fabPos)); } catch { /* ignore */ }
  }, [fabPos, dragging]);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = fabDrag.current; if (!d) return;
      const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
      if (!d.moved && Math.hypot(dx, dy) < 5) return;
      d.moved = true; if (!dragging) setDragging(true);
      e.preventDefault();
      const m = 8;
      const { w, h } = fabBox();
      const x = Math.max(m, Math.min(d.ox + dx, window.innerWidth - w - m));
      const y = Math.max(m, Math.min(d.oy + dy, window.innerHeight - h - m));
      setFabPos({ x, y });
    };
    const up = () => {
      const d = fabDrag.current; fabDrag.current = null;
      if (d?.moved) { justDragged.current = true; setTimeout(() => { justDragged.current = false; }, 80); }
      setDragging(false);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [dragging]);
  const startFabDrag = (e: React.PointerEvent) => {
    if (e.button && e.button !== 0) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    fabDrag.current = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false };
  };
  const fabToggle = (next: boolean) => () => { if (justDragged.current) return; setOpen(next); };
  const fabFixed: React.CSSProperties = fabPos ? { left: fabPos.x, top: fabPos.y, right: 'auto', bottom: 'auto' } : {};
  // Θέση πάνελ: αν το κουμπί έχει μετακινηθεί, το πάνελ ανοίγει κοντά του (πάνω ή κάτω, με clamp).
  const panelFixed: React.CSSProperties = (() => {
    if (!fabPos || typeof window === 'undefined') return {};
    const vw = window.innerWidth, vh = window.innerHeight;
    const pw = Math.min(390, vw - 32), ph = Math.min(600, vh - 130);
    // Το ΥΨΟΣ του κουμπιού είναι σταθερό (FAB_H) — μόνο το πλάτος αλλάζει με τη
    // γλώσσα και την οθόνη. Άρα η θέση του πάνελ δεν χρειάζεται μέτρηση, και δεν
    // διαβάζουμε ref μέσα στο render: στοιχίζουμε στην ΑΡΙΣΤΕΡΗ ακμή του κουμπιού.
    let top = fabPos.y - ph - 10;
    if (top < 12) top = Math.min(fabPos.y + FAB_H + 10, vh - ph - 12);
    let left = fabPos.x;
    left = Math.max(12, Math.min(left, vw - pw - 12));
    return { left, top, right: 'auto', bottom: 'auto' };
  })();

  return (
    <>
      {/* Το κουμπί που τη φέρνει μπροστά, σε κάθε καρτέλα.
          Ονομαστικό, όχι διακοσμητικό: λέει ΠΟΙΑ είναι και ΤΙ κάνεις μαζί της,
          γιατί ένα ανώνυμο πλωτό κουκκί δεν το πατά κανείς δεύτερη φορά. */}
      {!open && !overlayOpen && (
        <div className="pa-fab-wrap" style={fabFixed}>
          <button ref={fabRef} className="pa-fab" onPointerDown={startFabDrag} onClick={fabToggle(true)}
            aria-label={openAria()} title="Σύρετε για μετακίνηση"
            style={{ cursor: dragging ? 'grabbing' : 'pointer' }}>
            <span className="pa-mark" aria-hidden>{ASSISTANT_INITIAL}</span>
            <span className="pa-fab-cta">{cta}</span>
            {(listening || speaking) && <span className="pa-fab-live" style={{ background: listening ? 'var(--negative)' : 'var(--accent)' }} />}
          </button>
        </div>
      )}
      {open && (
        <button ref={fabRef} className="pa-fab pa-fab-close" onPointerDown={startFabDrag} onClick={fabToggle(false)} aria-label="Κλείσιμο" title="Σύρετε για μετακίνηση" style={{ ...fabFixed, cursor: dragging ? 'grabbing' : 'pointer' }}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      )}

      {open && (
        <div className="pa-panel" style={panelFixed}>
          {/* Κεφαλίδα */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
            {/* Το 15 δεν υπάρχει στην κλίμακα (…13, 14, 16, 18…) — ήταν ένα από
                τα δύο μεγέθη όλου του αρχείου εκτός κλίμακας. Στα 16 κρατά την
                ίδια αναλογία μέσα στον δίσκο των 34 (0,44 → 0,47). */}
            <div aria-hidden style={{ width: 34, height: 34, borderRadius: T.radius.inner, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontFamily: T.font.sans, fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em', flexShrink: 0 }}>{ASSISTANT_INITIAL}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...TT.h2, fontSize: 14 }}>{ASSISTANT_NAME}</div>
              <div style={{ ...TT.caption, marginTop: 1 }}>{tagline(prefs.formal)}</div>
            </div>
            {(supportsSTT || supportsTTS) && (
              <button onClick={() => { const next = !handsFree; setHandsFree(next); if (next && supportsSTT) { setOpen(true); startListening(); } else { stopListening(); stopSpeaking(); } }}
                title={handsFree ? 'Κλείσε τη λειτουργία φωνής' : 'Λειτουργία φωνής (μίλα ελεύθερα)'} aria-label="Λειτουργία φωνής"
                style={{ width: 30, height: 30, borderRadius: 10, border: 'none', background: handsFree ? 'var(--accent)' : 'transparent', color: handsFree ? 'var(--accent-text)' : 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 18 0" /><path d="M21 12v3a2 2 0 0 1-2 2h-1v-5h3z" /><path d="M3 12v3a2 2 0 0 0 2 2h1v-5H3z" /></svg>
              </button>
            )}
            <button onClick={() => setEditing(e => !e)} title={settingsTitle()} aria-label={settingsTitle()}
              style={{ width: 30, height: 30, borderRadius: 10, border: 'none', background: editing ? 'var(--accent-dim)' : 'transparent', color: editing ? 'var(--accent)' : 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            </button>
          </div>
          {(listening || speaking) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--accent-dim)', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: listening ? 'var(--negative)' : 'var(--accent)', animation: 'pa-pulse 1.1s infinite' }} />
              <span style={{ fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>{listening ? 'Ακούω…' : speakingLabel()}</span>
              {speaking && <button onClick={stopSpeaking} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700 }}>Σταμάτα</button>}
            </div>
          )}

          {/* Ρυθμίσεις συμπεριφοράς — όχι ταυτότητας */}
          {editing ? (
            <AssistantSettings
              draft={prefs}
              hasMemory={msgs.length > 0 || loadHistory(propertyId).length > 0}
              facts={memories}
              onForgetFact={(id) => setMemories(removeMemory(userId, id))}
              onForgetAllFacts={() => { clearMemories(userId); setMemories([]); }}
              onCancel={() => setEditing(false)}
              onClearMemory={() => { clearHistory(propertyId); setMsgs([]); }}
              onSave={(next) => {
                // Αν έκλεισε τη μνήμη, σβήσε ό,τι έχει αποθηκευτεί (σεβασμός στην επιλογή).
                if (prefs.memory && !next.memory) { clearHistory(propertyId); clearMemories(userId); setMemories([]); }
                setPrefs(next); savePrefs(next); setEditing(false);
              }}
            />
          ) : (
            <>
              {/* Σώμα */}
              <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>
                {/* Η ΠΡΩΤΗ ΟΘΟΝΗ. Ο χαιρετισμός ΔΕΝ είναι συννεφάκι συνομιλίας: είναι
                    δήλωση για το τι βλέπει αυτή τη στιγμή στο ακίνητό σου, άρα διαβάζεται
                    σαν κείμενο και όχι σαν μήνυμα. Από κάτω, οι ερωτήσεις-εκκίνησης σε
                    στήλη: τέσσερις γραμμές που πατιούνται, χωρίς να μοιάζουν με μενού. */}
                {msgs.length === 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <p style={{ ...TT.body, fontSize: 14, lineHeight: 1.6, margin: 0, maxWidth: '36ch' }}>{greeting}</p>
                    <div>
                      <div style={{ ...TT.label, fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>Ρώτα κάτι δικό σου</div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {suggestedOpeners(openerCtx).map((s, i) => (
                          <button key={s} onClick={() => ask(s)}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '11px 2px', background: 'transparent', border: 'none', borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)', cursor: 'pointer', fontFamily: T.font.sans, fontSize: 13, lineHeight: 1.45, color: 'var(--text-secondary)', transition: 'color 0.15s' }}
                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}>
                            <span style={{ flex: 1, minWidth: 0 }}>{s}</span>
                            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.6 }} aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {msgs.map((m, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 6 }}>
                    <div style={{ maxWidth: '90%', padding: '11px 14px', borderRadius: T.radius.card, fontFamily: T.font.sans, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                      background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)', color: m.role === 'user' ? 'var(--accent-text)' : 'var(--text-primary)',
                      border: 'none', borderBottomRightRadius: m.role === 'user' ? 4 : 14, borderBottomLeftRadius: m.role === 'user' ? 14 : 4 }}>{m.text}</div>
                    {/* Καμία υπόσχεση που δεν μπορεί να τηρηθεί: αν η καρτέλα όπου
                        προσγειώνεται η ενέργεια δεν είναι προσβάσιμη για αυτό το
                        ακίνητο ή αυτό το πακέτο, το κουμπί δεν γράφεται καθόλου —
                        αντί να γκριζάρει, ή χειρότερα, να γράψει τα δεδομένα σε
                        οθόνη που ο χρήστης δεν πρόκειται να δει. */}
                    {m.action && actionReachable(m.action, canNavigate) && (m.action.type === 'reach' ? (() => {
                      // Κουμπί/σύνδεσμος επικοινωνίας: ανοίγει το μέσο ΜΟΝΟ με το άγγιγμα
                      // του χρήστη (ποτέ αυτόματα). Για tel:/mailto: ρεαλιστικό <a>, για
                      // WhatsApp/Viber άνοιγμα σε νέα καρτέλα.
                      const ract = m.action;
                      const c = findContact(ract.name);
                      const link = c ? buildReachLink(c, ract.channel, ract.text) : null;
                      if (!link?.url) return null;
                      const style = { display: 'inline-flex', alignItems: 'center', gap: 6, height: T.h.sm, padding: '0 14px', borderRadius: T.radius.pill, border: '1px solid var(--accent)', background: 'var(--accent-dim)', color: 'var(--accent)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'none' } as const;
                      const inner = (<>{reachLabel(ract.channel, ract.name)}<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></>);
                      return (ract.channel === 'call' || ract.channel === 'email')
                        ? <a href={link.url} style={style}>{inner}</a>
                        : <button onClick={() => window.open(link.url!, '_blank')} style={style}>{inner}</button>;
                    })() : (() => {
                      const used = consumedActions.has(i);
                      return (
                      <button disabled={used} onClick={() => { if (used) return; setConsumedActions(s => new Set(s).add(i)); runAction(m.action); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: T.h.sm, padding: '0 14px', borderRadius: T.radius.pill, border: `1px solid ${used ? 'var(--border-subtle)' : 'var(--accent)'}`, background: used ? 'var(--bg-elevated)' : 'var(--accent-dim)', color: used ? 'var(--text-tertiary)' : 'var(--accent)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, cursor: used ? 'default' : 'pointer' }}>
                        {m.action.type === 'scan' ? 'Σάρωσε έγγραφο'
                          : m.action.type === 'book' ? `Κλείσε ραντεβού: ${new Date(m.action.date).toLocaleDateString('el-GR')}`
                          : m.action.type === 'client' ? `Καταχώρησε: ${m.action.name}`
                          : m.action.type === 'expense' ? `Κατέγραψε δαπάνη: ${eur(m.action.amount)}`
                          : m.action.type === 'checkin' ? `Σύνδεσμος check-in: ${m.action.who}`
                          : m.action.type === 'contact' ? `Πρόσθεσε επαφή: ${m.action.name}`
                          : m.action.type === 'paid' ? `Σήμανση πληρωμένο: ${m.action.description}`
                          : m.action.type === 'task' ? `Νέα εκκρεμότητα`
                          : m.action.type === 'inventory' ? `Κατέγραψε: ${m.action.name}`
                          : m.action.type === 'commit-doc' ? `Καταχώρησε: ${m.action.label}`
                          : m.action.type === 'feedback' ? 'Γράψε την αξιολόγησή σου'
                          : `Πήγαινε: ${navLabel(m.action.tab)}`}
                        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                      </button>
                      ); })()
                    )}
                  </div>
                ))}
                {/* ── Η ΑΠΑΝΤΗΣΗ ΣΤΗΝ ΕΡΩΤΗΣΗ ΣΥΜΦΩΝΙΑΣ ─────────────────────────
                    Μία στήλη επιλογών με τον λόγο κάθε μιας από κάτω, και το
                    «Κανέναν από αυτούς» τελευταίο. Δεν χρωματίζεται καμία: η μηχανή έχει
                    ήδη πει ότι ΔΕΝ είναι σίγουρη, και ένα τονισμένο κουμπί θα
                    ήταν ακριβώς η εικασία που απέφυγε. */}
                {reconcile && !busy && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
                    {reconcile.options.map(o => (
                      <button key={o.id} type="button" onClick={() => commitPendingDoc(o.id)}
                        style={{ textAlign: 'left', padding: '10px 13px', borderRadius: T.radius.inner, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontFamily: T.font.sans, fontSize: 13, cursor: 'pointer', minHeight: T.h.md }}>
                        <span style={{ fontWeight: 650 }}>{o.label}</span>
                        {o.reasons.length > 0 && <span style={{ display: 'block', marginTop: 3, color: 'var(--text-tertiary)', fontSize: 12 }}>{o.reasons.join(' · ')}</span>}
                      </button>
                    ))}
                    <button type="button" onClick={() => commitPendingDoc(null)}
                      style={{ textAlign: 'left', padding: '10px 13px', borderRadius: T.radius.inner, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 13, cursor: 'pointer', minHeight: T.h.md }}>
                      <span style={{ fontWeight: 650 }}>{RECONCILE_NONE_LABEL}</span>
                      <span style={{ display: 'block', marginTop: 3, color: 'var(--text-tertiary)', fontSize: 12 }}>{RECONCILE_NONE_HINT}</span>
                    </button>
                  </div>
                )}
                {busy && <div style={{ display: 'flex', gap: 5, padding: '4px 2px' }}>{[0, 1, 2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-tertiary)', animation: `pa-bounce 1s ${i * 0.15}s infinite ease-in-out` }} />)}</div>}
                {err && (
                  <div style={{ background: err === 'key' ? 'var(--bg-elevated)' : 'var(--warning-soft)', border: `1px solid ${err === 'key' ? 'var(--border-subtle)' : 'var(--warning-border)'}`, borderRadius: T.radius.inner, padding: '10px 13px', fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {err === 'key'
                      ? noKeyNotice(prefs.formal)
                      : err === 'limit'
                        ? (limitMsg || 'Έφτασες το όριο ερωτήσεων. Ανανεώνεται σύντομα.')
                        : 'Δεν μπόρεσα να απαντήσω τώρα, δοκίμασε ξανά σε λίγο.'}
                  </div>
                )}
              </div>

              {/* Είσοδος */}
              <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', alignItems: 'center' }}>
                <input ref={imgRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) askImage(f); e.currentTarget.value = ''; }} />
                <button onClick={() => { if (!busy) imgRef.current?.click(); }} disabled={busy} aria-label="Φωτογραφία απόδειξης, λογαριασμού ή αντικειμένου" title={`Φωτογράφισε απόδειξη ή λογαριασμό (πάει στον προϋπολογισμό), ή αντικείμενο (πάει στην ${navLabel('inventory')})`}
                  style={{ width: 42, height: 42, flexShrink: 0, borderRadius: '50%', border: 'none', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" /><circle cx="12" cy="13" r="3.2" /></svg>
                </button>
                {supportsSTT && (
                  <button onClick={toggleMic} disabled={busy} className="po-box" aria-label={listening ? 'Σταμάτα' : 'Μίλα'} title={listening ? 'Σταμάτα' : 'Μίλα στα ελληνικά'}
                    style={{ width: 42, height: 42, flexShrink: 0, borderRadius: '50%', border: 'none', background: listening ? 'var(--negative)' : 'var(--bg-elevated)', color: listening ? '#fff' : 'var(--text-secondary)', cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: listening ? 'pa-pulse 1.1s infinite' : 'none' }}>
                    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v4" /></svg>
                  </button>
                )}
                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ask(input); }} placeholder={listening ? 'Ακούω…' : placeholder} disabled={busy}
                  style={{ flex: 1, minWidth: 0, background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: T.radius.pill, padding: '10px 15px', color: 'var(--text-primary)', fontSize: 13, fontFamily: T.font.sans, outline: 'none' }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'} onBlur={e => e.currentTarget.style.borderColor = 'var(--border-default)'} />
                <button onClick={() => ask(input)} disabled={busy || !input.trim()} aria-label="Αποστολή"
                  style={{ width: 42, height: 42, flexShrink: 0, borderRadius: '50%', border: 'none', background: input.trim() && !busy ? 'var(--accent)' : 'var(--bg-elevated)', color: input.trim() && !busy ? 'var(--accent-text)' : 'var(--text-tertiary)', cursor: input.trim() && !busy ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></svg>
                </button>
              </div>
              {/* ΤΟ ΥΠΟΛΟΙΠΟ, ΚΑΤΩ ΑΠΟ ΤΟ ΠΛΑΙΣΙΟ ΓΡΑΦΗΣ ΚΑΙ ΧΩΡΙΣ ΧΡΩΜΑ.
                  Δεν είναι προειδοποίηση και δεν γίνεται κόκκινο όσο μικραίνει:
                  είναι μέτρηση, όπως η μπάρα προόδου της Αξιοποίησης. Ο χρήστης
                  που θέλει να ξέρει, κοιτάζει· ο χρήστης που δεν θέλει, δεν το
                  προσέχει. Εμφανίζεται μόνο αφού απαντήσει η βάση: πριν από την
                  πρώτη ερώτηση το υπόλοιπο θα ήταν μαντεψιά. */}
              {remainingLine(quota) && (
                <div style={{ ...TT.caption, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 8 }}>
                  {remainingLine(quota)}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── ΤΟ ΠΑΡΑΘΥΡΟ ΑΞΙΟΛΟΓΗΣΗΣ ΕΓΙΝΕ <Modal> ─────────────────────────────
          Ήταν 11 γραμμές χειρόγραφου κελύφους που μιλούσαν δικό τους λεξιλόγιο:
          scrim `rgba(12,20,34,0.5)` αντί για το ένα T.scrim, radius γραμμένο ως
          σκέτο 18 αντί για T.radius.modal, σκιά `0 20px 60px rgba(0,0,0,0.32)`
          αντί για το --elev-3 του θέματος. Και του έλειπαν και τα τέσσερα που
          δίνει το κοινό παράθυρο: Escape, εστίαση μέσα και επιστροφή μετά,
          κλείδωμα κύλισης του φόντου, κουμπί «×». Ούτε όνομα είχε — role="dialog"
          χωρίς aria-label, δηλαδή σκέτος «διάλογος» για τον αναγνώστη οθόνης.

          ΤΟ ΠΕΡΙΤΥΛΙΓΜΑ ΜΕ z-index ΔΕΝ ΕΙΝΑΙ ΔΙΑΚΟΣΜΗΣΗ. Το <Modal> έχει σταθερό
          z-index 1000, ενώ το πάνελ της Νόας ζει στο 1200 και το πλωτό κουμπί
          στο 1201 (βλ. .pa-panel/.pa-fab πιο κάτω). Χωρίς δικό του πλαίσιο
          στοίβαξης, το παράθυρο θα άνοιγε ΠΙΣΩ από το πάνελ που το κάλεσε. Το
          1400 είναι ακριβώς η τιμή που είχε το χειρόγραφο overlay, ώστε η σειρά
          των επιπέδων να μείνει η ίδια (ίδιο μοτίβο με το ConfirmDialog).

          Ο τίτλος ΔΕΝ επαναλαμβάνει την κεφαλίδα του Feedback («Κάνε το Property
          OS καλύτερο»): κρατά το όνομα με το οποίο το ζητά ήδη η μηνιαία
          παρότρυνση. Για τον ίδιο λόγο δεν μπαίνει εικονίδιο — το Feedback έχει
          ήδη το δικό του δύο γραμμές πιο κάτω. Ούτε footer: τα κουμπιά
          («Αποστολή», «Άλλη φορά», «Κλείσιμο») τα δίνει το ίδιο το Feedback. */}
      {feedbackOpen && (
        <div style={{ position: 'relative', zIndex: 1400 }}>
          <Modal open onClose={() => setFeedbackOpen(false)} title="Η γνώμη σου" width={460}>
            <Feedback target="assistant" embedded onDone={() => setFeedbackOpen(false)} />
          </Modal>
        </div>
      )}

      <style>{`
        /* Το βάθος βγαίνει από φωτεινότητα και λεπτό περίγραμμα, όχι από έγχρωμο
           φωτοστέφανο. Οι σκιές είναι τα tokens του θέματος (--elev-*), ίδια με
           κάθε άλλη επιφάνεια που «πλέει» πάνω από το περιεχόμενο. */
        @keyframes pa-bounce{0%,80%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-5px);opacity:1}}
        @keyframes pa-pulse{0%,100%{opacity:1}50%{opacity:.35}}
        .pa-fab-wrap{position:fixed;right:24px;bottom:var(--fab-gap);z-index:1200;display:flex;align-items:center}
        /* ΗΣΥΧΟ ΩΣ ΤΗ ΣΤΙΓΜΗ ΠΟΥ ΤΟ ΘΕΛΕΙΣ. Ήταν κορεσμένο γαλάζιο πλήκτρο με
           λευκό δίσκο, δηλαδή το πιο δυνατό στοιχείο κάθε οθόνης — πιο δυνατό
           από τα ποσά, τις προθεσμίες και το κύριο κουμπί της σελίδας. Ένας
           βοηθός δεν φωνάζει πάνω από αυτό που βοηθά. Τώρα είναι επιφάνεια της
           εφαρμογής με διακριτικό περίγραμμα· γεμίζει με το χρώμα του σήματος
           μόλις πλησιάσει ο κέρσορας ή πάρει εστίαση. */
        .pa-fab{position:fixed;right:24px;bottom:var(--fab-gap);height:var(--fab-h);padding:0 20px 0 8px;border-radius:100px;border:1px solid var(--border-default);background:var(--bg-surface);color:var(--text-primary);cursor:pointer;display:flex;align-items:center;gap:10px;box-shadow:var(--highlight-inset),var(--elev-1);z-index:1201;transition:background .18s ${T.ease.standard},border-color .18s ${T.ease.standard},color .18s ${T.ease.standard},box-shadow .2s ${T.ease.standard},transform .14s cubic-bezier(.2,0,0,1)}
        .pa-fab-wrap .pa-fab{position:relative;right:auto;bottom:auto}
        .pa-fab:hover,.pa-fab:focus-visible{background:var(--accent);border-color:var(--accent);color:var(--accent-text);box-shadow:var(--highlight-inset),var(--elev-3);transform:translateY(-1px)}
        .pa-fab:hover .pa-mark,.pa-fab:focus-visible .pa-mark{background:var(--accent-text);color:var(--accent)}
        .pa-fab:active{transform:translateY(0)}
        .pa-fab:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
        /* Το σήμα: το αρχικό μέσα σε φωτεινό δίσκο. Καμία εικονογραφία, κανένα
           «σπινθήρισμα» — το όνομα είναι το σήμα. */
        /* 17px → 18: το 17 δεν υπάρχει στην κλίμακα μεγεθών (…16, 18, 20…). */
        .pa-mark{width:36px;height:36px;flex-shrink:0;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;font-family:'Inter',sans-serif;font-weight:700;font-size:18px;line-height:1;letter-spacing:-.01em;transition:background .18s ${T.ease.standard},color .18s ${T.ease.standard}}
        .pa-fab-cta{font-family:'Inter',sans-serif;font-size:14px;font-weight:600;letter-spacing:-.01em;white-space:nowrap}
        .pa-fab-close{padding:0;width:var(--fab-h);justify-content:center;background:var(--bg-surface);color:var(--text-secondary);border-color:var(--border-default)}
        .pa-fab-live{position:absolute;top:8px;left:34px;width:9px;height:9px;border-radius:50%;animation:pa-pulse 1.4s infinite}
        /* ΔΕΝ ΕΙΝΑΙ ΠΑΡΑΘΥΡΟ ΚΑΙ ΔΕΝ ΓΙΝΕΤΑΙ Modal. Δεν έχει scrim, δεν
           μπλοκάρει την εφαρμογή και δεν κεντράρεται: αγκυρώνεται στο πλωτό
           κουμπί (και το ακολουθεί όταν ο χρήστης το σύρει αλλού — panelFixed),
           ώστε να μπορείς να ρωτήσεις τη Νόα ΚΟΙΤΑΖΟΝΤΑΣ την οθόνη για την
           οποία ρωτάς. Ένα κεντραρισμένο παράθυρο με σκοτεινό φόντο θα έκρυβε
           ακριβώς τα νούμερα που συζητάτε. Ευθυγραμμίζεται μόνο η ακτίνα με το
           token (ήταν καρφωμένο 18px, δηλαδή η ίδια τιμή γραμμένη δεύτερη φορά). */
        .pa-panel{position:fixed;right:24px;bottom:92px;width:390px;max-width:calc(100vw - 32px);height:min(600px,calc(100vh - 130px));background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:${T.radius.modal}px;box-shadow:var(--highlight-inset),var(--elev-3);z-index:1200;display:flex;flex-direction:column;overflow:hidden}
        /* ΤΟ ΟΡΙΟ ΕΙΝΑΙ 768, ΟΣΟ ΚΑΙ ΤΗΣ ΚΑΤΩ ΠΛΟΗΓΗΣΗΣ.
           Ήταν 600 ενώ η κάτω πλοήγηση εμφανίζεται στα 768: στο ενδιάμεσο —
           iPad mini όρθιο, Galaxy Fold ανοιχτό, τα περισσότερα tablet Android —
           το κουμπί έμενε στα 24 από κάτω με z-index 1201 πάνω από το 900 της
           πλοήγησης, και κάθιζε ακριβώς πάνω στα δύο δεξιά της στοιχεία.
           Δύο διαφορετικά όρια για το ίδιο γεγονός είναι πάντα σφάλμα. */
        @media (max-width:768px){
          .pa-fab-wrap{bottom:82px;right:16px}
          .pa-fab{bottom:82px;right:16px}
          .pa-panel{right:8px;left:8px;bottom:78px;width:auto;max-width:none;height:min(560px,calc(100dvh - 100px))}
        }
        /* Στο κινητό ο χώρος είναι ιερός: μένει το σήμα, φεύγει η πρόσκληση.
           Αυτό είναι όντως θέμα ΠΛΑΤΟΥΣ, γι' αυτό κρατά το δικό του όριο. */
        @media (max-width:600px){
          .pa-fab{padding:0 8px;gap:0}
          .pa-fab-cta{display:none}
        }
        @media (prefers-reduced-motion:reduce){
          .pa-fab,.pa-fab:hover{transition:none;transform:none}
          .pa-fab-live{animation:none}
        }
      `}</style>
    </>
  );
}

// ── Διακόπτης (toggle) ──────────────────────────────────────────────────────
function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} role="switch" aria-checked={on}
      style={{ width: 42, height: 26, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0, background: on ? 'var(--accent)' : 'var(--border-default)', position: 'relative', transition: 'background 0.2s' }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: 'var(--elev-1)' }} />
    </button>
  );
}

// ── Ρυθμίσεις συμπεριφοράς ──────────────────────────────────────────────────
// ΤΟ ΟΝΟΜΑ ΚΑΙ ΤΟ ΦΥΛΟ ΕΦΥΓΑΝ ΑΠΟ ΕΔΩ. Δεν είναι απώλεια επιλογής: ο χρήστης
// δεν ζητούσε να «φτιάξει βοηθό», ζητούσε βοήθεια. Το ερώτημα «πώς να με λες;»
// μπροστά στην πρώτη του ερώτηση ήταν φόρος, και το αποτέλεσμα ήταν ότι κανείς
// δεν μιλούσε στο ίδιο πρόσωπο. Μένουν οι ρυθμίσεις που αλλάζουν πραγματικά τη
// συμπεριφορά: προσφώνηση, μνήμη, σύγκριση ακινήτων.
function AssistantSettings({ draft, onSave, onCancel, onClearMemory, hasMemory, facts, onForgetFact, onForgetAllFacts }: { draft: AssistantPrefs; onSave: (p: AssistantPrefs) => void; onCancel: () => void; onClearMemory: () => void; hasMemory: boolean; facts: Memory[]; onForgetFact: (id: string) => void; onForgetAllFacts: () => void }) {
  const [memory, setMemory] = useState(draft.memory);
  const [compare, setCompare] = useState(draft.compare);
  const [formal, setFormal] = useState(draft.formal);
  const row = { display: 'flex', alignItems: 'center', gap: 12 } as const;
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <div style={{ ...TT.h2, fontSize: 13 }}>{settingsTitle()}</div>
        <div style={{ ...TT.bodySm, marginTop: 4 }}>Πώς θέλεις να δουλεύει μαζί σου. Αλλάζει όποτε θες.</div>
      </div>

      <div>
        <div style={{ ...TT.label, fontSize: 11, marginBottom: 4 }}>Πώς θέλεις να σου μιλάει;</div>
        <div style={{ ...TT.caption, marginBottom: 8 }}>Στον ενικό για πιο φιλική κουβέντα ή στον πληθυντικό για πιο επίσημο ύφος.</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {ADDRESS_OPTIONS.map(a => {
            const active = formal === a.value;
            return (
              <button key={String(a.value)} onClick={() => setFormal(a.value)}
                style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, fontFamily: T.font.sans, fontSize: 12, fontWeight: active ? 700 : 500, padding: '8px 14px', borderRadius: T.radius.pill, cursor: 'pointer', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-default)'}`, background: active ? 'var(--accent)' : 'transparent', color: active ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
                {a.label}<span style={{ fontSize: 11, fontWeight: 500, opacity: 0.8 }}>{a.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Μνήμη & σύγκριση */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
        <div style={row}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Να θυμάται τις συζητήσεις</div>
            <div style={{ fontFamily: T.font.sans, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>Συνεχίζει από εκεί που μείνατε, ανά ακίνητο. Μένει μόνο στη συσκευή σου.</div>
          </div>
          <Switch on={memory} onToggle={() => setMemory(v => !v)} />
        </div>
        {memory && hasMemory && (
          <button onClick={onClearMemory} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--negative)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 600 }}>Σβήσε τη μνήμη αυτού του ακινήτου</button>
        )}
        {memory && facts.length > 0 && (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '11px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 9 }}>
              <div style={{ fontFamily: T.font.sans, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Τι θυμάται για σένα</div>
              <button onClick={onForgetAllFacts} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-tertiary)', fontFamily: T.font.sans, fontSize: 11, fontWeight: 600 }}>Ξέχασέ τα όλα</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {facts.map(f => (
                <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, padding: '5px 6px 5px 11px', fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-primary)', maxWidth: '100%' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{f.text}</span>
                  <button onClick={() => onForgetFact(f.id)} aria-label="Ξέχασέ το" title="Ξέχασέ το" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, flexShrink: 0, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
        <div style={row}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Σύγκριση μεταξύ ακινήτων</div>
            <div style={{ fontFamily: T.font.sans, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>Να βλέπει και τα άλλα σου ακίνητα για συγκρίσεις (ποιο αποδίδει καλύτερα).</div>
          </div>
          <Switch on={compare} onToggle={() => setCompare(v => !v)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        <button onClick={onCancel} style={{ flex: '0 0 auto', height: T.h.lg, padding: '0 18px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Ακύρωση</button>
        <button onClick={() => onSave({ memory, compare, formal })} style={{ flex: 1, height: T.h.lg, borderRadius: T.radius.pill, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontFamily: T.font.sans, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Αποθήκευση</button>
      </div>
    </div>
  );
}
