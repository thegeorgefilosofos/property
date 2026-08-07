'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΕΠΙΣΚΕΠΤΕΣ ΒΡΑΧΥΧΡΟΝΙΑΣ ΜΙΣΘΩΣΗΣ — όχι CRM επαγγελματία σε ιδιώτη με ένα εξοχικό.
//
// ΤΙ ΕΦΥΓΕ, ΚΑΙ ΓΙΑΤΙ
//
// 1. Η «ΜΑΥΡΗ ΛΙΣΤΑ» (`do_not_rent`) με ονοματεπώνυμο, ΑΦΜ και αριθμό
//    ταυτότητας. Είναι κατηγοριοποίηση προσώπου με νομικό βάρος (GDPR) για
//    μηδέν αντάλλαγμα — και εμφανιζόταν ως ετικέτα «Προσοχή» πάνω σε όνομα
//    ανθρώπου. Ό,τι χρειάζεται πραγματικά ο οικοδεσπότης χωρά σε μια ιδιωτική
//    σημείωση χωρίς ετικέτα κατηγορίας, και αυτό μένει.
// 2. Εθνικότητα, αριθμός ταυτότητας, διεύθυνση, ΑΦΜ, πηγή γνωριμίας, ελεύθερες
//    ετικέτες, 5 αστέρια, VIP, τμηματοποίηση. Δεδομένα προσωπικού χαρακτήρα και
//    πεδία πωλήσεων που δεν προκαλούσαν ΚΑΜΙΑ ενέργεια στην εφαρμογή.
// 3. Το κατώφλι VIP στα 1.000 €: επινοημένο και άσχετο με το μέγεθος του ακινήτου.
// 4. Το KPI «Επαναλαμβανόμενοι». Ο επισκέπτης του Airbnb έρχεται μία φορά· το
//    νούμερο θα έδειχνε 0 για πάντα, δηλαδή κατέλαβε μια θέση KPI για να πει
//    ψέματα για την αξία του προϊόντος.
// 5. Το drawer «Αναφορές». Τα δύο γραφήματα που είχαν νόημα (ανά κανάλι, ανά
//    μήνα) ανέβηκαν στην ΚΥΡΙΑ οθόνη — «η σύγκριση είναι η κεντρική οθόνη, όχι
//    λειτουργία σε υπομενού». Τα «Κορυφαίοι πελάτες» και «Ποιότητα φιλοξενίας»
//    έφυγαν.
//
// ΤΙ ΠΡΟΣΤΕΘΗΚΕ
//
// α) Η ΓΡΑΜΜΗ ΤΟΥ ΑΜΑ στην κορυφή — ποτέ πίσω από paywall.
// β) ΑΚΑΘΑΡΙΣΤΑ ΞΕΧΩΡΙΣΤΑ ΑΠΟ PAYOUT. Ο εισαγωγέας email ζητούσε ρητά «το ποσό
//    που εισπράττει ο οικοδεσπότης (payout)» και το έγραφε στο `total`, το οποίο
//    η φορολογική μηχανή διάβαζε ως `grossRevenue`. Πλέον καταγράφονται τρία
//    ξεχωριστά ποσά (τι πλήρωσε ο επισκέπτης, προμήθεια, τέλος ανθεκτικότητας)
//    και το ακαθάριστο ΥΠΟΛΟΓΙΖΕΤΑΙ. Οι ιστορικές γραμμές σημαίνονται ως
//    απροσδιόριστες και ζητείται επιβεβαίωση στην πρώτη επεξεργασία.
// γ) ΔΗΛΩΣΗ ΒΡΑΧΥΧΡΟΝΙΑΣ ΔΙΑΜΟΝΗΣ ανά κράτηση (`declared_at`), με σήμα
//    «αδήλωτη» και μετρητή στα KPI. ~2,47 εκατ. δηλώσεις πανελλαδικά το 2025,
//    μία ανά κράτηση — και το εργαλείο που είχε όλες τις κρατήσεις δεν
//    παρακολουθούσε καμία.
// δ) ΣΥΝΔΕΣΗ ΦΘΟΡΑΣ ΜΕ ΤΗΝ ΑΠΟΓΡΑΦΗ (`damage_item_id`), ώστε η φθορά να γίνεται
//    δαπάνη με παραστατικό για τον λογιστή, όχι ελεύθερο κείμενο.
//
// Μένουν: όνομα, τηλέφωνο/email, κανάλι, ημερομηνίες, ποσά, φθορές, δήλωση.
// Cross-property (ανά χρήστη). Χρώμα μόνο σε γνήσια σήματα.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Users, SearchX } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  T, PageTitle, KPIGrid, Badge, InfoBanner, Btn, ExportButton, EmptyState, Skeleton, SkeletonKPIs, SecHdr, Modal, SideSheet, fe, fd,
} from '@/components/Theme';
import { confirmDialog } from '@/components/confirmBus';
import { NumberInput, TextInput, CustomSelect, DatePicker, Textarea, Toggle } from './UIComponents';
import { downloadCsv } from './exportCsv';
import { saved, savedData } from '@/components/dbWrite';
import { money, intGr } from './xlsxStyle';
import ClientCompose from './ClientCompose';
import {
  stayNights, stayTotal, clientStats, normalizePhone,
  clientMatches, STAY_CHANNELS, STAY_CHANNEL_LABELS, NOTE_KINDS, NOTE_KIND_LABELS,
} from '@/lib/clients/clients';
import {
  declarableGross, hostPayout, needsAmountReview, isDeclared, amountBasis,
  AMOUNT_BASIS_LABELS, type AmountBasis,
} from '@/lib/clients/stayAmounts';
import { MSG_TEMPLATES, buildMessage, whatsappLink, viberLink as viberTextLink } from '@/lib/clients/messages';
import { revenueByChannel, revenueByMonth, yearOccupancy, totals } from '@/lib/clients/reports';
import { navLabel } from '@/lib/nav/labels';
import { climateLevyRates, isHighSeasonMonth } from '@/lib/billing/greekTax';
import { parseICal, guessChannel, icalToStayDrafts, stayKey, type ICalEvent } from '@/lib/clients/ical';
import { athensToday } from '@/lib/core/time';
import { MONTHS_NOM } from '@/lib/core/months';
import { MONTHS_SHORT } from '@/lib/core/months';

// ── Τύποι εγγραφών (καθρέφτης πινάκων Supabase) ─────────────────────────────
// Τα πεδία CRM (rating/tags/do_not_rent/vip/address/id_number/nationality/source)
// ΔΕΝ δηλώνονται εδώ επίτηδες: παραμένουν στη βάση (κανένα καταστροφικό
// migration) αλλά καμία οθόνη δεν τα διαβάζει ούτε τα γράφει πλέον. Αν λείπουν
// από τον τύπο, δεν μπορεί κανείς να τα ξαναχρησιμοποιήσει κατά λάθος.
interface Client {
  id: string; user_id: string; type: string; full_name: string;
  phone: string | null; email: string | null; notes: string | null;
  created_at: string; updated_at: string;
}
interface Stay {
  id: string; user_id: string; client_id: string; property_id: string | null;
  check_in: string | null; check_out: string | null; nights: number | null; guests: number | null;
  nightly_rate: number | null; total: number | null; channel: string | null;
  damages: boolean | null; damage_cost: number | null; damage_note: string | null;
  damage_item_id: string | null;
  gross_guest_paid: number | null; platform_fee: number | null; climate_levy: number | null;
  amount_basis: string | null; declared_at: string | null;
  notes: string | null; created_at: string;
}
interface Note { id: string; user_id: string; client_id: string; kind: string; body: string; created_at: string; }
interface PropRow { id: string; name: string; prop_type: string | null; status_detail: string | null; client_id: string | null; sqm: number | null; }
interface InvItem { id: string; name: string; property_id: string | null; current_value: number | null; }
interface ClientDoc {
  id: string; user_id: string; client_id: string; name: string; file_path: string;
  mime: string | null; size: number | null; kind: string; created_at: string;
  signedUrl?: string;
}
interface IcalFeed {
  id: string; user_id: string; property_id: string; channel: string; url: string;
  include_blocked: boolean; active: boolean; last_synced_at: string | null; last_status: string | null; created_at: string;
}

// Είδη εγγράφων πελάτη (ταυτότητα, συμβόλαιο, απόδειξη, άλλο).
const DOC_KINDS = ['id', 'contract', 'receipt', 'other'] as const;
const DOC_KIND_LABELS: Record<string, string> = { id: 'Ταυτότητα / Διαβατήριο', contract: 'Συμβόλαιο', receipt: 'Απόδειξη', other: 'Άλλο' };
const fmtBytes = (n?: number | null) => {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const todayStr = () => athensToday();

// Deep-links μηνυμάτων. Το normalizePhone αφαιρεί +30/0030· για 10ψήφιο κινητό
// προσθέτουμε ξανά τον κωδικό χώρας 30 ώστε τα wa.me/viber links να λειτουργούν.
const msgDigits = (p?: string | null) => { const d = normalizePhone(p); return d.length === 10 ? '30' + d : d; };
const waLink = (p?: string | null) => `https://wa.me/${msgDigits(p)}`;
const viberLink = (p?: string | null) => `viber://chat?number=%2B${msgDigits(p)}`;

const channelOptions = STAY_CHANNELS.map(c => ({ value: c, label: STAY_CHANNEL_LABELS[c] }));
const noteKindOptions = NOTE_KINDS.map(k => ({ value: k, label: NOTE_KIND_LABELS[k] }));

// ── Κατάσταση φόρμας επισκέπτη ───────────────────────────────────────────────
// Μόνο ό,τι χρειάζεται για να επικοινωνήσεις μαζί του και να κρατήσεις σημείωση.
interface FormState { full_name: string; phone: string; email: string; notes: string }
const emptyForm = (): FormState => ({ full_name: '', phone: '', email: '', notes: '' });

interface StayForm {
  id?: string; property_id: string; check_in: string; check_out: string; nights: string;
  guests: string; nightly_rate: string; channel: string;
  // Τα τρία ποσά που ΔΕΝ είναι ο ίδιος αριθμός.
  gross_guest_paid: string; platform_fee: string; climate_levy: string;
  /** Το ιστορικό `total`, όταν η γραμμή είναι ακόμη απροσδιόριστη. */
  legacyTotal: string; basis: AmountBasis;
  declared: boolean; declared_at: string;
  damages: boolean; damage_cost: string; damage_note: string; damage_item_id: string;
  notes: string;
}
const emptyStay = (): StayForm => ({
  property_id: '', check_in: '', check_out: '', nights: '', guests: '', nightly_rate: '',
  channel: 'direct', gross_guest_paid: '', platform_fee: '', climate_levy: '',
  legacyTotal: '', basis: 'unknown', declared: false, declared_at: '',
  damages: false, damage_cost: '', damage_note: '', damage_item_id: '', notes: '',
});

// ── Διακόπτης σήματος (φθορές) σε var(--negative) ───────────────────────────
// Ο διακόπτης αυτής της οθόνης ήταν αντίγραφο του κοινού `Toggle`, με μία
// προσθήκη: χρώμα ετυμηγορίας. Πράσινο για «δηλώθηκε», κόκκινο για «φθορές».
// Δηλαδή η ίδια χειρονομία έβγαζε δύο διαφορετικά συναισθήματα, και μια
// καταγραμμένη φθορά διαβαζόταν ως σφάλμα του χρήστη αντί για γεγονός που
// κατέγραψε σωστά. Ένας διακόπτης, ένα χρώμα, και μαζί ήρθαν πληκτρολόγιο,
// role=switch και aria-checked που εδώ έλειπαν.

// ── Τυποποιημένα κοινά στοιχεία (avatar / πλακίδιο στατιστικού) ──────────────
// Αρχικά ονόματος: έως 2 λέξεις, κεφαλαία· fallback «?».
const initialsOf = (name: string) =>
  (name.trim().split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('') || '?').toUpperCase();

// Avatar αρχικών ως απλή συνάρτηση που επιστρέφει JSX (όχι component, ώστε να μη
// γίνεται remount). Στρογγυλεμένο τετράγωνο σε accent-soft με τα αρχικά.
const avatar = (name: string, size: number) => (
  <div style={{
    width: size, height: size, borderRadius: Math.round(size * 0.28), flexShrink: 0,
    background: 'var(--accent-soft)', border: '1px solid var(--accent-border)',
    color: 'var(--accent)', fontWeight: 700, fontFamily: T.font.sans,
    fontSize: Math.round(size * 0.36), letterSpacing: '0.02em',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>{initialsOf(name)}</div>
);

// Τυποποιημένο πλακίδιο στατιστικού: ανυψωμένο, ετικέτα (10px κεφαλαία) + τιμή
// (tabular-nums, 700). neg → τιμή σε var(--negative)· title → tooltip.
const statTile = (label: string, value: React.ReactNode, opts?: { neg?: boolean; title?: string }) => (
  <div title={opts?.title} style={{
    background: 'var(--surface-raised)', border: '1px solid var(--border-raised)',
    borderRadius: 12, padding: '10px 12px', minWidth: 0,
    boxShadow: 'var(--highlight-inset), var(--elev-1)',
  }}>
    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: T.font.sans }}>{label}</div>
    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: opts?.neg ? 'var(--negative)' : 'var(--text-primary)' }}>{value}</div>
  </div>
);

export default function TabClients({ userId, onSelectProperty }: { userId: string; onSelectProperty?: (id: string) => void }) {
  const supabase = createClient();
  const [clients, setClients] = useState<Client[]>([]);
  const [props, setProps] = useState<PropRow[]>([]);
  const [stays, setStays] = useState<Stay[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [inv, setInv] = useState<InvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [undeclaredOnly, setUndeclaredOnly] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportYearMenu, setReportYearMenu] = useState(false);
  const [checkins, setCheckins] = useState<any[]>([]);   // υποβολές pre-check-in του ανοιχτού πελάτη
  const [checkinCopied, setCheckinCopied] = useState(false);
  // Ποιο πρότυπο μηνύματος είναι επιλεγμένο. Πέντε πρότυπα επί τρία κουμπιά το
  // καθένα έκαναν δεκαπέντε κουμπιά σε μία ενότητα — και μόνο τρία από αυτά
  // χρησίμευαν κάθε φορά. Τώρα διαλέγεις πρότυπο, βλέπεις ΟΛΟ το κείμενο, και
  // οι τρεις ενέργειες είναι μία φορά, κάτω από αυτό.
  const [msgId, setMsgId] = useState<string>(MSG_TEMPLATES[0].id);
  const [msgCopied, setMsgCopied] = useState(false);
  // Εισαγωγή κράτησης από email (Airbnb/Booking) με τη βοήθεια του AI
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailText, setEmailText] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailErr, setEmailErr] = useState('');
  const [emailDraft, setEmailDraft] = useState<{ name: string; check_in: string; check_out: string; gross: string; fee: string; levy: string; channel: string } | null>(null);

  // Εισαγωγή iCal (Airbnb/Booking): συγχρονισμός κρατήσεων/διαμονών ανά ακίνητο.
  const [icalOpen, setIcalOpen] = useState(false);
  const [icalText, setIcalText] = useState('');
  const [icalUrl, setIcalUrl] = useState('');
  const [icalPropertyId, setIcalPropertyId] = useState('');
  const [icalChannel, setIcalChannel] = useState<'airbnb' | 'booking' | 'other'>('airbnb');
  const [icalIncludeBlocked, setIcalIncludeBlocked] = useState(false);
  const [icalEvents, setIcalEvents] = useState<ICalEvent[] | null>(null);
  const [icalBusy, setIcalBusy] = useState(false);
  const [icalMsg, setIcalMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [icalFeeds, setIcalFeeds] = useState<IcalFeed[]>([]);

  // Φόρμα νέου/επεξεργασίας πελάτη
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  // Ντοσιέ (drawer)
  const [openId, setOpenId] = useState<string | null>(null);
  const openIdRef = useRef<string | null>(null);
  useEffect(() => { openIdRef.current = openId; }, [openId]);

  // Φόρμα διαμονής
  const [stayForm, setStayForm] = useState<StayForm>(emptyStay());
  const [stayFormOpen, setStayFormOpen] = useState(false);
  const [savingStay, setSavingStay] = useState(false);

  // Φόρμα σχολίου
  const [noteForm, setNoteForm] = useState<{ kind: string; body: string }>({ kind: 'note', body: '' });

  // Έγγραφα πελάτη (ταυτότητα, συμβόλαιο, αποδείξεις)
  const [docs, setDocs] = useState<ClientDoc[]>([]);
  const [docKind, setDocKind] = useState<string>('other');
  const [docBusy, setDocBusy] = useState(false);
  const [docMsg, setDocMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const docFileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [{ data: cl }, { data: pr }, { data: it }] = await Promise.all([
      supabase.from('clients').select('id,user_id,type,full_name,phone,email,notes,created_at,updated_at').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('user_properties').select('id,name,prop_type,status_detail,client_id,sqm').eq('user_id', userId).order('created_at'),
      // Η απογραφή, για να δείχνει η φθορά σε ΑΝΤΙΚΕΙΜΕΝΟ και όχι σε κείμενο:
      // ο λογιστής χρειάζεται δαπάνη με παραστατικό, όχι «έσπασε κάτι».
      supabase.from('inventory_items').select('id,name,property_id,current_value').eq('user_id', userId).order('name'),
    ]);
    setClients((cl || []) as Client[]);
    setProps((pr || []) as PropRow[]);
    setInv((it || []) as InvItem[]);
    setLoading(false);
  }, [userId]);

  const loadStays = useCallback(async () => {
    const { data } = await supabase.from('client_stays').select('*').eq('user_id', userId);
    setStays((data || []) as Stay[]);
  }, [userId]);

  const loadNotes = useCallback(async (clientId: string) => {
    const { data } = await supabase.from('client_notes').select('*').eq('user_id', userId).eq('client_id', clientId).order('created_at', { ascending: false });
    setNotes((data || []) as Note[]);
  }, [userId]);

  const loadDocs = useCallback(async (clientId: string) => {
    const { data } = await supabase.from('client_documents').select('*').eq('user_id', userId).eq('client_id', clientId).order('created_at', { ascending: false });
    const list = (data || []) as ClientDoc[];
    const paths = list.map(d => d.file_path);
    if (paths.length) {
      const { data: signed } = await supabase.storage.from('property-files').createSignedUrls(paths, 60 * 60 * 24);
      if (signed) list.forEach((d, i) => { d.signedUrl = signed[i]?.signedUrl ?? undefined; });
    }
    setDocs(list);
  }, [userId]);

  const loadIcalFeeds = useCallback(async () => {
    const { data } = await supabase.from('ical_feeds').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    setIcalFeeds((data || []) as IcalFeed[]);
  }, [userId]);

  useEffect(() => { load(); loadStays(); loadIcalFeeds(); }, [load, loadStays, loadIcalFeeds]);

  // Real-time: clients / client_stays / client_notes
  useEffect(() => {
    const ch = supabase.channel('clients-crm-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter: `user_id=eq.${userId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_stays', filter: `user_id=eq.${userId}` }, () => loadStays())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_notes', filter: `user_id=eq.${userId}` }, () => { if (openIdRef.current) loadNotes(openIdRef.current); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_documents', filter: `user_id=eq.${userId}` }, () => { if (openIdRef.current) loadDocs(openIdRef.current); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ical_feeds', filter: `user_id=eq.${userId}` }, () => loadIcalFeeds())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_properties', filter: `user_id=eq.${userId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, load, loadStays, loadNotes, loadDocs, loadIcalFeeds]);

  useEffect(() => {
    if (openId) { loadNotes(openId); loadDocs(openId); }
    else { setNotes([]); setDocs([]); }
    setDocMsg(null); setDocKind('other');
  }, [openId, loadNotes, loadDocs]);

  const propsByClient = useMemo(() => {
    const m = new Map<string, PropRow[]>();
    props.forEach(p => { if (p.client_id) { const a = m.get(p.client_id) || []; a.push(p); m.set(p.client_id, a); } });
    return m;
  }, [props]);
  const propName = useCallback((id: string | null) => (id ? (props.find(p => p.id === id)?.name || id) : ''), [props]);

  const staysByClient = useMemo(() => {
    const m = new Map<string, Stay[]>();
    stays.forEach(s => { const a = m.get(s.client_id) || []; a.push(s); m.set(s.client_id, a); });
    return m;
  }, [stays]);
  const statsByClient = useMemo(() => {
    const m = new Map<string, ReturnType<typeof clientStats>>();
    staysByClient.forEach((arr, id) => m.set(id, clientStats(arr)));
    return m;
  }, [staysByClient]);
  // Όλες οι διαμονές του χρήστη, υπολογισμένες μία φορά.
  const allStays = useMemo(() => [...staysByClient.values()].flat(), [staysByClient]);

  // Αδήλωτες διαμονές ανά επισκέπτη — το μόνο σήμα που αξίζει θέση στην κάρτα.
  const undeclaredByClient = useMemo(() => {
    const m = new Map<string, number>();
    stays.forEach(s => { if (!isDeclared(s)) m.set(s.client_id, (m.get(s.client_id) || 0) + 1); });
    return m;
  }, [stays]);

  const filtered = useMemo(() => clients.filter(c => {
    if (!clientMatches(c, search)) return false;
    if (undeclaredOnly && !(undeclaredByClient.get(c.id) || 0)) return false;
    return true;
  }), [clients, search, undeclaredOnly, undeclaredByClient]);

  // ΤΑ KPI. Δεν υπάρχει «Επαναλαμβανόμενοι» (ο επισκέπτης του Airbnb έρχεται μία
  // φορά, το νούμερο θα ήταν 0 για πάντα) ούτε «Επισήμανση/μαύρη λίστα».
  // Υπάρχει το μόνο που κοστίζει χρήματα σήμερα: οι αδήλωτες διαμονές.
  // ΤΟ ΜΗΔΕΝ ΔΕΝ ΕΙΝΑΙ ΕΠΙΤΕΥΓΜΑ. Οι αδήλωτες διαμονές έβγαιναν πράσινες όταν
  // ήταν μηδέν — δηλαδή η οθόνη επιβράβευε τον χρήστη που δεν έχει καταχωρίσει
  // ακόμη καμία κράτηση. Χρώμα μπαίνει μόνο όταν υπάρχει κάτι να γίνει.
  // Και καμία πλακέτα δεν λέει το ίδιο μηδενικό δύο φορές: το «Νύχτες 0» με
  // υπότιτλο «0 διαμονές» ήταν η ίδια πληροφορία, γραμμένη δύο φορές.
  const kpis = useMemo(() => {
    const tot = totals(stays);
    const plural = (n: number) => (n === 1 ? 'διαμονή' : 'διαμονές');
    return [
      {
        label: 'Επισκέπτες',
        value: String(clients.length),
        sub: tot.count > 0 ? `${tot.count} ${plural(tot.count)} συνολικά` : 'Καμία καταχωρημένη κράτηση',
      },
      {
        label: 'Δηλωτέα ακαθάριστα',
        value: fe(tot.revenue),
        sub: tot.unresolved > 0 ? `${tot.unresolved} ${plural(tot.unresolved)} με απροσδιόριστο ποσό` : 'Χωρίς το τέλος ανθεκτικότητας',
        tone: (tot.unresolved > 0 ? 'warning' : 'neutral') as 'warning' | 'neutral',
      },
      {
        label: 'Αδήλωτες διαμονές',
        value: String(tot.undeclared),
        sub: 'Δήλωση Βραχυχρόνιας Διαμονής',
        tone: (tot.undeclared > 0 ? 'negative' : 'neutral') as 'negative' | 'neutral',
      },
      {
        label: 'Νύχτες',
        value: String(tot.nights),
        sub: tot.count > 0 ? `Μέση διάρκεια ${(tot.nights / tot.count).toFixed(1).replace('.', ',')}` : 'Χωρίς νύχτες ακόμη',
      },
    ];
  }, [clients, stays]);

  // ── Φόρμα πελάτη ──────────────────────────────────────────────────────────
  const openNew = () => { setEditing(null); setForm(emptyForm()); setModalOpen(true); };
  const openEdit = (c: Client) => {
    setEditing(c);
    setForm({ full_name: c.full_name, phone: c.phone || '', email: c.email || '', notes: c.notes || '' });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.full_name.trim()) return;
    // Στιγμιότυπο της φόρμας ΠΡΙΝ από οποιοδήποτε await. Το native confirm πάγωνε
    // τη σελίδα, άρα η φόρμα ΔΕΝ μπορούσε να αλλάξει όσο ρωτούσαμε. Ο δικός μας
    // διάλογος δεν παγώνει τίποτα: χωρίς στιγμιότυπο θα αποθηκευόταν ό,τι έγραψε
    // ο χρήστης ΜΕΤΑ τον έλεγχο διπλότυπου, δηλαδή άλλη εγγραφή από αυτή που
    // εγκρίθηκε. Και το setSaving μπαίνει ΠΡΙΝ την ερώτηση, ώστε το κουμπί
    // «Αποθήκευση» (disabled={saving}) να μη δέχεται δεύτερο πάτημα όσο περιμένει.
    const f = form;
    // Εντοπισμός διπλότυπου σε νέα εγγραφή: ίδιο τηλέφωνο. (Το ΑΦΜ έφυγε ως
    // κριτήριο μαζί με το πεδίο: δεν ζητάμε ΑΦΜ από επισκέπτη Airbnb.)
    if (!editing) {
      const np = normalizePhone(f.phone);
      const dup = np.length >= 8 ? clients.find(c => normalizePhone(c.phone) === np) : undefined;
      if (dup) {
        setSaving(true);
        const ok = await confirmDialog(`Υπάρχει ήδη επισκέπτης με αυτό το τηλέφωνο: «${dup.full_name}». Θέλεις σίγουρα να δημιουργήσεις νέα εγγραφή;`);
        if (!ok) { setSaving(false); return; }
      }
    }
    setSaving(true);
    const payload = {
      user_id: userId, type: 'client', full_name: f.full_name.trim(),
      phone: f.phone.trim() || null, email: f.email.trim() || null,
      notes: f.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const ok = await saved('Η καταχώρηση δεν αποθηκεύτηκε', editing
      ? supabase.from('clients').update(payload).eq('id', editing.id)
      : supabase.from('clients').insert(payload));
    setSaving(false);
    if (!ok) return;
    setModalOpen(false); load();
  };

  const del = async (c: Client) => {
    if (!(await confirmDialog('Να διαγραφεί η καταχώρηση;', { tone: 'negative' }))) return;
    if (!await saved('Η καταχώρηση δεν διαγράφηκε', supabase.from('clients').delete().eq('id', c.id))) return;
    if (openId === c.id) setOpenId(null);
    load();
  };

  // Pre-check-in: φόρτωση υποβολών του ανοιχτού πελάτη + δημιουργία/αντιγραφή συνδέσμου
  useEffect(() => {
    if (!openId) { setCheckins([]); setCheckinCopied(false); return; }
    supabase.from('guest_checkins').select('*').eq('client_id', openId).order('created_at', { ascending: false }).then(({ data }) => setCheckins(data || []));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);
  const copyCheckinLink = async () => {
    if (!openId) return;
    const propId = (propsByClient.get(openId) || [])[0]?.id || null;
    const data = await savedData<{ token?: string }>('Ο σύνδεσμος προ-άφιξης δεν δημιουργήθηκε',
      supabase.from('checkin_links').upsert({ user_id: userId, client_id: openId, property_id: propId, active: true }, { onConflict: 'user_id,client_id' }).select('token').maybeSingle());
    if (data?.token) { try { await navigator.clipboard.writeText(`${window.location.origin}/checkin/${data.token}`); } catch { /* ignore */ } setCheckinCopied(true); setTimeout(() => setCheckinCopied(false), 2600); }
  };

  // Εισαγωγή κράτησης από email: ανάλυση με AI → πρόχειρη διαμονή προς αποθήκευση.
  const parseEmail = async () => {
    const text = emailText.trim();
    if (text.length < 20) { setEmailErr('Επικόλλησε το κείμενο του email κράτησης.'); return; }
    setEmailBusy(true); setEmailErr('');
    try {
      const res = await fetch('/api/anthropic', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-5', max_tokens: 500,
          // Ο ΕΙΣΑΓΩΓΕΑΣ ΖΗΤΑ ΠΛΕΟΝ ΤΡΙΑ ΞΕΧΩΡΙΣΤΑ ΠΟΣΑ. Πριν ζητούσε ένα
          // («το ποσό που εισπράττει ο οικοδεσπότης — payout») και το έγραφε στο
          // `total`, το οποίο η φορολογική μηχανή διάβαζε ως ακαθάριστο. Το ίδιο
          // πεδίο σήμαινε δύο πράγματα και η διαφορά ήταν ~15% του φόρου.
          system: `Από αυτό το email κράτησης (Airbnb/Booking/άλλο) εξάγαγε τα στοιχεία. Επέστρεψε ΜΟΝΟ valid JSON χωρίς markdown:
{"guest_name":"","check_in":"YYYY-MM-DD","check_out":"YYYY-MM-DD","gross_guest_paid":0,"platform_fee":0,"climate_levy":0,"channel":"airbnb|booking|direct|other"}
Κανόνες ποσών, ΜΗΝ τα μπερδέψεις:
- gross_guest_paid = το ΣΥΝΟΛΟ που πλήρωσε ο επισκέπτης (guest total / "Σύνολο επισκέπτη"), πριν αφαιρεθεί οποιαδήποτε προμήθεια.
- platform_fee = η προμήθεια/service fee που κράτησε η πλατφόρμα από τον οικοδεσπότη.
- climate_levy = τέλος ανθεκτικότητας στην κλιματική κρίση / climate crisis resilience fee, αν αναφέρεται ξεχωριστά.
Αν κάποιο ποσό ΔΕΝ φαίνεται καθαρά στο email, βάλε 0 — ΜΗΝ το υπολογίσεις και μην το μαντέψεις.
Αν λείπει κείμενο, βάλε "".`,
          messages: [{ role: 'user', content: [{ type: 'text', text: text.slice(0, 8000) }] }],
        }),
      });
      const data = await res.json();
      if (!res.ok) { setEmailErr(data.error || 'Σφάλμα ανάλυσης.'); setEmailBusy(false); return; }
      const raw = ((data.content || []).find((c: any) => c.type === 'text')?.text || '{}').replace(/```json?|```/g, '').trim();
      const p = JSON.parse(raw);
      setEmailDraft({
        name: p.guest_name || '', check_in: p.check_in || '', check_out: p.check_out || '',
        gross: p.gross_guest_paid ? String(p.gross_guest_paid) : '',
        fee: p.platform_fee ? String(p.platform_fee) : '',
        levy: p.climate_levy ? String(p.climate_levy) : '',
        channel: p.channel || 'other',
      });
    } catch { setEmailErr('Δεν ήταν δυνατή η ανάλυση. Δοκίμασε ξανά ή καταχώρησε χειροκίνητα.'); }
    setEmailBusy(false);
  };
  const saveEmailStay = async () => {
    if (!emailDraft || !emailDraft.name.trim()) return;
    setEmailBusy(true);
    const name = emailDraft.name.trim();
    let clientId = clients.find(c => c.full_name.trim().toLowerCase() === name.toLowerCase())?.id || null;
    if (!clientId) {
      const data = await savedData<{ id?: string }>('Ο πελάτης δεν δημιουργήθηκε',
        supabase.from('clients').insert({ user_id: userId, type: 'client', full_name: name }).select('id').maybeSingle());
      clientId = data?.id || null;
    }
    if (clientId) {
      const nights = stayNights(emailDraft.check_in, emailDraft.check_out) || null;
      const gross = parseFloat(emailDraft.gross) || 0;
      const fee = parseFloat(emailDraft.fee) || 0;
      const levy = parseFloat(emailDraft.levy) || 0;
      await saved('Η κράτηση δεν αποθηκεύτηκε', supabase.from('client_stays').insert({
        user_id: userId, client_id: clientId, check_in: emailDraft.check_in || null, check_out: emailDraft.check_out || null,
        nights, channel: emailDraft.channel || null,
        gross_guest_paid: gross || null, platform_fee: fee || null, climate_levy: levy || null,
        // Το `total` είναι ΠΑΡΑΓΩΓΟ: το δηλωτέο ακαθάριστο (τι πλήρωσε ο
        // επισκέπτης μείον το τέλος, που δεν είναι έσοδο του ιδιοκτήτη).
        total: gross ? Math.max(0, gross - levy) : null,
        amount_basis: gross ? 'gross' : 'unknown',
      }));
    }
    setEmailBusy(false); setEmailOpen(false); setEmailText(''); setEmailDraft(null);
    load(); loadStays();
  };

  const linkProperty = async (clientId: string, propId: string) => {
    if (await saved('Το ακίνητο δεν συνδέθηκε',
      supabase.from('user_properties').update({ client_id: propId ? clientId : null }).eq('id', propId))) load();
  };
  const unlinkProperty = async (propId: string) => {
    if (await saved('Το ακίνητο δεν αποσυνδέθηκε',
      supabase.from('user_properties').update({ client_id: null }).eq('id', propId))) load();
  };

  // ── Διαμονές ──────────────────────────────────────────────────────────────
  const openStayNew = () => { setStayForm(emptyStay()); setStayFormOpen(true); };
  const openStayEdit = (s: Stay) => {
    setStayForm({
      id: s.id, property_id: s.property_id || '', check_in: s.check_in || '', check_out: s.check_out || '',
      nights: s.nights != null ? String(s.nights) : '', guests: s.guests != null ? String(s.guests) : '',
      nightly_rate: s.nightly_rate != null ? String(s.nightly_rate) : '',
      channel: s.channel || 'direct',
      gross_guest_paid: s.gross_guest_paid != null ? String(s.gross_guest_paid) : '',
      platform_fee: s.platform_fee != null ? String(s.platform_fee) : '',
      climate_levy: s.climate_levy != null ? String(s.climate_levy) : '',
      legacyTotal: s.total != null ? String(s.total) : '',
      basis: amountBasis(s),
      declared: isDeclared(s), declared_at: (s.declared_at || '').slice(0, 10),
      damages: !!s.damages,
      damage_cost: s.damage_cost != null ? String(s.damage_cost) : '',
      damage_note: s.damage_note || '', damage_item_id: s.damage_item_id || '',
      notes: s.notes || '',
    });
    setStayFormOpen(true);
  };
  const onStayDates = (patch: Partial<StayForm>) => setStayForm(f => {
    const nf = { ...f, ...patch };
    const n = stayNights(nf.check_in, nf.check_out);
    return { ...nf, nights: n ? String(n) : nf.nights };
  });

  // Το τέλος ανθεκτικότητας ανά διανυκτέρευση, από τους συντελεστές της ΑΑΔΕ και
  // τον τύπο/μέγεθος του ΣΥΓΚΕΚΡΙΜΕΝΟΥ ακινήτου. Πρόταση, όχι επιβολή: ο χρήστης
  // το διορθώνει, γιατί τα ακριβή ποσά και οι μήνες ορίζονται από την ΑΑΔΕ.
  const suggestLevy = useCallback((f: StayForm): number => {
    const nights = parseInt(f.nights, 10) || stayNights(f.check_in, f.check_out);
    if (!nights || !f.check_in) return 0;
    const p = props.find(x => x.id === f.property_id);
    const isHouse = ['house', 'villa'].includes(String(p?.prop_type || '').toLowerCase());
    const r = climateLevyRates(p?.sqm ?? null, isHouse);
    // Ανά νύχτα, με τον μήνα της κάθε νύχτας (μια διαμονή μπορεί να αλλάζει περίοδο).
    let sum = 0;
    const d = new Date(f.check_in + 'T00:00:00Z');
    for (let i = 0; i < nights; i++) {
      sum += isHighSeasonMonth(d.getUTCMonth()) ? r.high : r.low;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return sum;
  }, [props]);

  const saveStay = async () => {
    if (!openId) return;
    setSavingStay(true);
    const num = (s: string) => { const n = parseFloat(s); return isNaN(n) ? null : n; };
    const nights = parseInt(stayForm.nights, 10) || stayNights(stayForm.check_in, stayForm.check_out) || null;
    const rate = num(stayForm.nightly_rate);
    const gross = num(stayForm.gross_guest_paid);
    const levy = num(stayForm.climate_levy);
    const fee = num(stayForm.platform_fee);
    // ΤΟ `total` ΕΙΝΑΙ ΠΑΡΑΓΩΓΟ, ΔΕΝ ΤΟ ΠΛΗΚΤΡΟΛΟΓΕΙ ΚΑΝΕΙΣ ΠΙΑ.
    // Όταν ξέρουμε τι πλήρωσε ο επισκέπτης, το `total` γίνεται το δηλωτέο
    // ακαθάριστο (χωρίς το τέλος ανθεκτικότητας, που δεν είναι έσοδο του
    // ιδιοκτήτη) και σημαίνεται ρητά ως 'gross'. Αν δεν το ξέρουμε, κρατάμε ό,τι
    // υπήρχε με τη βάση που δήλωσε ο χρήστης — κανένα ποσό δεν χάνεται.
    const derivedTotal = gross != null && gross > 0
      ? Math.max(0, gross - (levy || 0))
      : (num(stayForm.legacyTotal) ?? ((nights || 0) * (rate || 0) || null));
    const basis: AmountBasis = gross != null && gross > 0 ? 'gross' : stayForm.basis;
    const payload = {
      user_id: userId, client_id: openId, property_id: stayForm.property_id || null,
      check_in: stayForm.check_in || null, check_out: stayForm.check_out || null, nights,
      guests: parseInt(stayForm.guests, 10) || null, nightly_rate: rate,
      total: derivedTotal, amount_basis: basis,
      gross_guest_paid: gross, platform_fee: fee, climate_levy: levy,
      declared_at: stayForm.declared
        ? new Date((stayForm.declared_at || todayStr()) + 'T12:00:00Z').toISOString()
        : null,
      channel: stayForm.channel || null, damages: stayForm.damages,
      damage_cost: stayForm.damages ? num(stayForm.damage_cost) : null,
      damage_note: stayForm.damages ? (stayForm.damage_note.trim() || null) : null,
      damage_item_id: stayForm.damages ? (stayForm.damage_item_id || null) : null,
      notes: stayForm.notes.trim() || null,
    };
    const ok = await saved('Η διαμονή δεν αποθηκεύτηκε', stayForm.id
      ? supabase.from('client_stays').update(payload).eq('id', stayForm.id)
      : supabase.from('client_stays').insert(payload));
    setSavingStay(false);
    if (!ok) return;
    setStayFormOpen(false); loadStays();
  };
  const delStay = async (s: Stay) => {
    if (!(await confirmDialog('Να διαγραφεί η διαμονή;', { tone: 'negative' }))) return;
    if (await saved('Η διαμονή δεν διαγράφηκε', supabase.from('client_stays').delete().eq('id', s.id))) loadStays();
  };
  // Ένα κλικ από τη λίστα: δηλώθηκε / δεν δηλώθηκε. Η δήλωση βραχυχρόνιας
  // διαμονής είναι μία ανά κράτηση και η προθεσμία τρέχει — δεν πρέπει να
  // απαιτεί άνοιγμα φόρμας.
  const toggleDeclared = async (s: Stay) => {
    if (await saved('Η δήλωση της διαμονής δεν άλλαξε', supabase.from('client_stays')
      .update({ declared_at: isDeclared(s) ? null : new Date().toISOString() })
      .eq('id', s.id))) loadStays();
  };

  // ── Σχόλια ────────────────────────────────────────────────────────────────
  const saveNote = async () => {
    if (!openId || !noteForm.body.trim()) return;
    if (!await saved('Το σχόλιο δεν αποθηκεύτηκε',
      supabase.from('client_notes').insert({ user_id: userId, client_id: openId, kind: noteForm.kind, body: noteForm.body.trim() }))) return;
    setNoteForm({ kind: 'note', body: '' }); loadNotes(openId);
  };
  const delNote = async (n: Note) => {
    if (await saved('Το σχόλιο δεν διαγράφηκε', supabase.from('client_notes').delete().eq('id', n.id)) && openId) loadNotes(openId);
  };

  // ── Έγγραφα πελάτη ────────────────────────────────────────────────────────
  const onDocFile = async (file: File | null | undefined) => {
    if (!file || !openId) return;
    setDocBusy(true); setDocMsg(null);
    const safe = file.name.replace(/[^\w.\-]+/g, '_');
    const path = `${userId}/clients/${openId}/${Date.now()}_${safe}`;
    const { error: upErr } = await supabase.storage.from('property-files').upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (upErr) { setDocMsg({ text: `Σφάλμα ανεβάσματος: ${upErr.message}`, error: true }); setDocBusy(false); return; }
    const { error: insErr } = await supabase.from('client_documents').insert({
      user_id: userId, client_id: openId, name: file.name, file_path: path,
      mime: file.type || null, size: file.size, kind: docKind,
    });
    if (insErr) {
      await supabase.storage.from('property-files').remove([path]);
      setDocMsg({ text: `Σφάλμα καταχώρησης: ${insErr.message}`, error: true }); setDocBusy(false); return;
    }
    setDocBusy(false); setDocMsg({ text: 'Το έγγραφο προστέθηκε' });
    setTimeout(() => setDocMsg(null), 3000);
    if (docFileRef.current) docFileRef.current.value = '';
    loadDocs(openId);
  };
  const delDoc = async (d: ClientDoc) => {
    if (!(await confirmDialog('Να διαγραφεί οριστικά το έγγραφο;', { tone: 'negative' }))) return;
    await supabase.storage.from('property-files').remove([d.file_path]);
    if (await saved('Το έγγραφο δεν διαγράφηκε', supabase.from('client_documents').delete().eq('id', d.id)) && openId) loadDocs(openId);
  };

  // ── Εισαγωγή iCal ─────────────────────────────────────────────────────────
  const openIcal = () => {
    setIcalText(''); setIcalUrl(''); setIcalEvents(null); setIcalMsg(null);
    setIcalChannel('airbnb'); setIcalIncludeBlocked(false);
    setIcalPropertyId(props[0]?.id || '');
    setIcalOpen(true);
  };
  // Χειροκίνητη ανάλυση επικολλημένου .ics (τοπικά, χωρίς δίκτυο).
  const parseIcalInput = () => {
    setIcalMsg(null); setIcalEvents(null);
    const text = icalText.trim();
    if (!text) { setIcalMsg({ text: 'Επικόλλησε το περιεχόμενο του .ics ή χρησιμοποίησε τον σύνδεσμο παραπάνω.', error: true }); return; }
    const evs = parseICal(text);
    if (evs.length === 0) { setIcalMsg({ text: 'Δεν βρέθηκαν εγγραφές ημερολογίου στο κείμενο.', error: true }); return; }
    setIcalEvents(evs);
  };
  // Ανάκτηση από URL μέσω edge function (server-side fetch, παρακάμπτει το CORS).
  const fetchIcalFromUrl = async () => {
    const url = icalUrl.trim();
    if (!url) { setIcalMsg({ text: 'Δώσε τον σύνδεσμο iCal (URL).', error: true }); return; }
    setIcalBusy(true); setIcalMsg(null); setIcalEvents(null);
    const ch = guessChannel(url);
    if (ch !== 'other') setIcalChannel(ch);
    try {
      const { data, error } = await supabase.functions.invoke('ical-sync', { body: { action: 'preview', url } });
      if (error || !data?.ok) {
        const detail = data?.error || error?.message || '';
        setIcalMsg({ text: `Δεν ήταν δυνατή η ανάκτηση από το URL${detail ? `: ${detail}` : ''}. Αν δεν έχει ενεργοποιηθεί ο αυτόματος συγχρονισμός, άνοιξε τον σύνδεσμο, αντίγραψε το .ics και επικόλλησέ το κάτω.`, error: true });
        setIcalBusy(false); return;
      }
      setIcalEvents((data.events || []) as ICalEvent[]);
      if (!data.events?.length) setIcalMsg({ text: 'Δεν βρέθηκαν κρατήσεις στο ημερολόγιο.', error: true });
    } catch (e) {
      setIcalMsg({ text: `Σφάλμα ανάκτησης: ${String(e)}`, error: true });
    } finally { setIcalBusy(false); }
  };
  // Αποθήκευση συνδέσμου για αυτόματο συγχρονισμό + άμεσος πρώτος συγχρονισμός.
  const saveIcalFeed = async () => {
    const url = icalUrl.trim();
    if (!url || !icalPropertyId) { setIcalMsg({ text: 'Επίλεξε ακίνητο και δώσε τον σύνδεσμο iCal.', error: true }); return; }
    setIcalBusy(true); setIcalMsg(null);
    const { error } = await supabase.from('ical_feeds').upsert({
      user_id: userId, property_id: icalPropertyId, channel: icalChannel, url, include_blocked: icalIncludeBlocked, active: true,
    }, { onConflict: 'user_id,property_id,url' });
    if (error) { setIcalMsg({ text: `Σφάλμα αποθήκευσης: ${error.message}`, error: true }); setIcalBusy(false); return; }
    await loadIcalFeeds();
    setIcalBusy(false);
    setIcalMsg({ text: 'Ο σύνδεσμος αποθηκεύτηκε. Ο συγχρονισμός θα τρέχει αυτόματα· μπορείς και χειροκίνητα με «Συγχρονισμός τώρα».' });
    syncIcalNow(icalPropertyId);
  };
  // Άμεσος συγχρονισμός των αποθηκευμένων συνδέσμων (όλων ή ενός ακινήτου).
  const syncIcalNow = async (propertyId?: string) => {
    setIcalBusy(true); setIcalMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke('ical-sync', { body: { action: 'sync', propertyId } });
      if (error || !data?.ok) {
        setIcalMsg({ text: `Ο συγχρονισμός απέτυχε${data?.error ? `: ${data.error}` : ''}. Βεβαιώσου ότι έχει γίνει deploy η function ical-sync.`, error: true });
      } else {
        const failed = (data.results || []).filter((r: { ok: boolean }) => !r.ok).length;
        setIcalMsg({ text: `Συγχρονισμός ολοκληρώθηκε: ${data.inserted || 0} νέες κρατήσεις από ${data.feeds || 0} συνδέσμους${failed ? ` (${failed} με σφάλμα)` : ''}.`, error: failed > 0 });
        loadStays(); load();
      }
      loadIcalFeeds();
    } catch (e) {
      setIcalMsg({ text: `Σφάλμα συγχρονισμού: ${String(e)}`, error: true });
    } finally { setIcalBusy(false); }
  };
  const delIcalFeed = async (f: IcalFeed) => {
    if (!(await confirmDialog('Να αφαιρεθεί ο σύνδεσμος αυτόματου συγχρονισμού; Οι ήδη εισαγμένες κρατήσεις παραμένουν.', { tone: 'negative' }))) return;
    if (await saved('Ο σύνδεσμος συγχρονισμού δεν αφαιρέθηκε',
      supabase.from('ical_feeds').delete().eq('id', f.id))) loadIcalFeeds();
  };
  // Συνθετικός πελάτης ανά κανάλι για τις εισαγόμενες κρατήσεις (το iCal δεν
  // περιέχει ταυτότητα επισκέπτη). Δημιουργείται μία φορά, με σαφή ονομασία.
  const ensureChannelClient = async (channel: 'airbnb' | 'booking' | 'other'): Promise<string | null> => {
    const name = channel === 'airbnb' ? 'Κρατήσεις Airbnb' : channel === 'booking' ? 'Κρατήσεις Booking' : 'Κρατήσεις καναλιού';
    const existing = clients.find(c => c.full_name === name && c.type === 'client');
    if (existing) return existing.id;
    const { data, error } = await supabase.from('clients').insert({
      user_id: userId, type: 'client', full_name: name,
      notes: 'Συγκεντρωτικός πελάτης για κρατήσεις που εισάγονται από iCal (χωρίς στοιχεία επισκέπτη).',
    }).select('id').single();
    if (error || !data) return null;
    return (data as { id: string }).id;
  };
  const importIcal = async () => {
    if (!icalEvents || !icalPropertyId) return;
    setIcalBusy(true); setIcalMsg(null);
    const drafts = icalToStayDrafts(icalEvents, { propertyId: icalPropertyId, channel: icalChannel })
      .filter(d => icalIncludeBlocked || !d.blocked);
    if (drafts.length === 0) { setIcalMsg({ text: 'Δεν υπάρχουν κρατήσεις προς εισαγωγή (μόνο μπλοκαρίσματα ημερομηνιών).', error: true }); setIcalBusy(false); return; }
    const clientId = await ensureChannelClient(icalChannel);
    if (!clientId) { setIcalMsg({ text: 'Σφάλμα δημιουργίας πελάτη καναλιού.', error: true }); setIcalBusy(false); return; }
    // Αποφυγή διπλοεγγραφών: κλειδί ακίνητο+άφιξη+αναχώρηση απέναντι στις υπάρχουσες.
    const existingKeys = new Set(stays.map(s => stayKey(s.property_id || '', s.check_in || '', s.check_out || '')));
    const fresh = drafts.filter(d => !existingKeys.has(stayKey(d.property_id, d.check_in, d.check_out)));
    const skipped = drafts.length - fresh.length;
    if (fresh.length === 0) { setIcalMsg({ text: `Όλες οι ${drafts.length} κρατήσεις υπάρχουν ήδη. Καμία νέα εισαγωγή.` }); setIcalBusy(false); loadStays(); return; }
    const rows = fresh.map(d => ({
      user_id: userId, client_id: clientId, property_id: d.property_id,
      check_in: d.check_in, check_out: d.check_out, nights: d.nights, channel: d.channel,
      notes: `Εισαγωγή iCal · ${d.uid}`,
    }));
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 50) {
      const { error } = await supabase.from('client_stays').insert(rows.slice(i, i + 50));
      if (error) { setIcalMsg({ text: `Σφάλμα εισαγωγής: ${error.message}`, error: true }); setIcalBusy(false); loadStays(); return; }
      inserted += rows.slice(i, i + 50).length;
    }
    setIcalBusy(false);
    setIcalMsg({ text: `Εισήχθησαν ${inserted} κρατήσεις${skipped > 0 ? ` · ${skipped} υπήρχαν ήδη` : ''}.` });
    setIcalEvents(null); setIcalText(''); setIcalUrl('');
    loadStays(); load();
  };

  // ── Εξαγωγή CSV ─────────────────────────────────────────────────────────────
  // ΑΝΑ ΔΙΑΜΟΝΗ, όχι ανά πρόσωπο. Αυτό ζητά ο λογιστής: μία γραμμή ανά κράτηση,
  // με τα τρία ποσά χωριστά και ρητή ένδειξη πού το ποσό είναι απροσδιόριστο.
  // Ένα CSV προσώπων με εθνικότητες, ΑΦΜ και «μαύρη λίστα» δεν έλυνε τίποτα και
  // ήταν προσωπικά δεδομένα σε αρχείο που ταξιδεύει με email.
  const exportCsv = () => {
    const byId = new Map(clients.map(c => [c.id, c]));
    const rows = allStays
      .slice()
      .sort((a, b) => (b.check_in || '').localeCompare(a.check_in || ''))
      .map(s => {
        const g = declarableGross(s);
        const pay = hostPayout(s);
        const it = s.damage_item_id ? inv.find(i => i.id === s.damage_item_id) : undefined;
        return [
          byId.get(s.client_id)?.full_name || '', propName(s.property_id),
          s.check_in || '', s.check_out || '',
          intGr(s.nights ?? stayNights(s.check_in, s.check_out)),
          s.channel ? (STAY_CHANNEL_LABELS[s.channel as keyof typeof STAY_CHANNEL_LABELS] || s.channel) : '',
          s.gross_guest_paid != null ? money(s.gross_guest_paid) : '',
          s.climate_levy != null ? money(s.climate_levy) : '',
          s.platform_fee != null ? money(s.platform_fee) : '',
          g != null ? money(g) : money(stayTotal(s)),
          g != null ? '' : 'ΑΠΡΟΣΔΙΟΡΙΣΤΟ — χρειάζεται επιβεβαίωση',
          pay != null ? money(pay) : '',
          isDeclared(s) ? (s.declared_at || '').slice(0, 10) : 'ΑΔΗΛΩΤΗ',
          s.damages ? money(s.damage_cost || 0) : '',
          it?.name || s.damage_note || '',
        ];
      });
    downloadCsv(`diamones_${todayStr()}`, [
      'Επισκέπτης', 'Ακίνητο', 'Άφιξη', 'Αναχώρηση', 'Νύχτες', 'Κανάλι',
      'Πλήρωσε ο επισκέπτης', 'Τέλος ανθεκτικότητας', 'Προμήθεια πλατφόρμας',
      'ΔΗΛΩΤΕΟ ΑΚΑΘΑΡΙΣΤΟ', 'Σημείωση ποσού', 'Καθαρή είσπραξη',
      'Δήλωση βραχυχρόνιας διαμονής', 'Κόστος φθοράς', 'Αντικείμενο / σημείωση φθοράς',
    ], rows);
  };

  // ── Κοινά inline styles ────────────────────────────────────────────────────
  const inp: React.CSSProperties = { background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '10px 16px', color: 'var(--text-primary)', fontSize: 14, height: 40, width: '100%', outline: 'none', boxSizing: 'border-box', fontFamily: T.font.sans };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', display: 'block', marginBottom: 7, fontFamily: T.font.sans };
  const chip = (active: boolean): React.CSSProperties => ({ padding: '8px 14px', borderRadius: T.radius.pill, border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`, background: active ? 'var(--accent-soft)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontFamily: T.font.sans, fontWeight: 500, whiteSpace: 'nowrap' });
  const msgLink: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', padding: '3px 9px', borderRadius: T.radius.pill, border: '1px solid var(--border-subtle)', background: 'var(--accent-soft)', whiteSpace: 'nowrap' };
  // Chip επικοινωνίας (ίδιο ύφος με msgLink, με inline εικονίδιο).
  const contactChip: React.CSSProperties = { ...msgLink, display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' };
  const fGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 14 };
  // Επικεφαλίδα ενότητας φόρμας (καθαρή, με τελεία accent και λεπτή γραμμή). Απλή
  // συνάρτηση που επιστρέφει JSX (όχι component) ώστε να μη χάνουν focus τα πεδία.
  //
  // ΤΟ `top` ΥΠΑΡΧΕΙ ΓΙΑ ΕΝΑ ΣΗΜΕΙΟ: όταν η επικεφαλίδα είναι το ΠΡΩΤΟ στοιχείο
  // στο σώμα ενός Modal, το κενό το δίνει ήδη το padding του primitive (24) και
  // το περιθώριο 18 από πάνω γινόταν 42 εικονοστοιχεία λευκού πάνω από μια
  // ετικέτα ύψους 10. Παντού αλλού μένει 18, γιατί εκεί χωρίζει δύο ενότητες.
  const secHead = (t: string, top = 18) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: `${top}px 0 10px` }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', fontFamily: T.font.sans, whiteSpace: 'nowrap' }}>{t}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
    </div>
  );
  const initials = (form.full_name.trim().split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('') || '+').toUpperCase();

  // Ο γυμνός Spinner δεν έλεγε τίποτα για το τι έρχεται και το ύψος του δεν είχε
  // σχέση με το τελικό περιεχόμενο — μόλις φόρτωναν τα δεδομένα η σελίδα πηδούσε.
  // Το σχήμα (4 KPIs + πλέγμα καρτών) είναι γνωστό, άρα ο σκελετός το προδιαγράφει.
  if (loading) return (
    <>
      <SkeletonKPIs n={4} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 14 }}>
        {[0, 1, 2].map(i => <Skeleton key={i} h={190} r={T.radius.card} />)}
      </div>
    </>
  );

  const unlinkedProps = props.filter(p => !p.client_id);
  const dc = openId ? clients.find(c => c.id === openId) || null : null;
  const dcStays = dc ? (staysByClient.get(dc.id) || []).slice().sort((a, b) => (b.check_in || '').localeCompare(a.check_in || '')) : [];
  const dcStats = dc ? clientStats(dcStays) : null;
  const dcUndeclared = dcStays.filter(s => !isDeclared(s)).length;
  const dcTotals = totals(dcStays);
  // Η απογραφή του ακινήτου της διαμονής (ή όλη, αν δεν έχει επιλεγεί ακίνητο).
  const invForStay = stayForm.property_id ? inv.filter(i => i.property_id === stayForm.property_id) : inv;
  // Πλαίσιο για τα πρότυπα μηνυμάτων: πελάτης + πρώτο συνδεδεμένο ακίνητο + πιο
  // πρόσφατη διαμονή (τα dcStays είναι σε φθίνουσα σειρά, άρα [0] = πιο πρόσφατη).
  // Οι νύχτες, όταν και οι δύο ημερομηνίες υπάρχουν: αφαίρεση, όχι ερώτηση.
  const derivedNights = stayNights(stayForm.check_in, stayForm.check_out) || null;
  const dcFirstProp = dc ? (propsByClient.get(dc.id) || [])[0] : undefined;
  const msgCtx = dc ? { clientName: dc.full_name, propertyName: dcFirstProp?.name, address: undefined, checkIn: dcStays[0]?.check_in, checkOut: dcStays[0]?.check_out } : null;

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      {/* Η γραμμή του ΑΜΑ αποδίδεται από τη σελίδα, ΠΑΝΩ από αυτή την καρτέλα και
          δεμένη στο επιλεγμένο ακίνητο. Εδώ υπήρχε δεύτερο αντίγραφο χωρίς
          `propertyId`: ο χρήστης έβλεπε την ίδια προειδοποίηση δύο φορές, τη μία
          για όλα τα ακίνητα μαζί. Δύο φορές το ίδιο δεν είναι έμφαση. */}
      <PageTitle title={navLabel('clients')} sub="Κρατήσεις, δηλωτέα ποσά και εκκρεμείς δηλώσεις διαμονής"
        right={(clients.length > 0 || props.length > 0) ? (
          // ΜΙΑ ΚΥΡΙΑ ΕΝΕΡΓΕΙΑ, ΚΑΙ ΟΙ ΥΠΟΛΟΙΠΕΣ ΜΕ ΤΟ ΙΔΙΟ ΒΑΡΟΣ.
          // Τρεις σύνδεσμοι χωρίς περίγραμμα δίπλα σε ένα κουμπί με περίγραμμα
          // δίπλα σε ένα γεμάτο: τέσσερα διαφορετικά βάρη για ενέργειες της ίδιας
          // σειράς. Τώρα δευτερεύουσες όλες, κύρια μία.
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn variant="secondary" onClick={() => { setEmailOpen(true); setEmailDraft(null); setEmailErr(''); }}>Εισαγωγή από email</Btn>
            {props.length > 0 && <Btn variant="secondary" onClick={openIcal}>Σύνδεση ημερολογίου</Btn>}
            {clients.length > 0 && <Btn variant="secondary" onClick={() => setComposeOpen(true)}>Μαζικό μήνυμα</Btn>}
            {allStays.length > 0 && <ExportButton onClick={exportCsv} label="Εξαγωγή διαμονών" />}
            <Btn variant="primary" onClick={openNew}>Νέα καταχώρηση</Btn>
          </div>
        ) : undefined} />

      <KPIGrid items={kpis} />

      <ClientCompose open={composeOpen} onClose={() => setComposeOpen(false)} clients={clients} supabase={supabase} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Αναζήτηση ονόματος, τηλεφώνου, email…"
          style={{ ...inp, maxWidth: 280, width: 'auto', flex: '1 1 220px' }} />
        {/* Ένα φίλτρο, και είναι το χρήσιμο. Τα «VIP / Επαναλαμβανόμενοι /
            Με επισήμανση» έφυγαν: το πρώτο είχε επινοημένο κατώφλι 1.000 €, το
            δεύτερο θα ήταν πάντα κενό, το τρίτο ήταν η μαύρη λίστα. */}
        <button style={chip(undeclaredOnly)} onClick={() => setUndeclaredOnly(v => !v)}>Με αδήλωτες διαμονές</button>
      </div>

      {clients.length === 0 ? (
        <EmptyState icon={<Users size={20} />} title="Κανένας επισκέπτης ακόμη" hint="Σύνδεσε το ημερολόγιο Airbnb/Booking με «Εισαγωγή iCal» ή επικόλλησε ένα email κράτησης — και οι διαμονές θα έρθουν μόνες τους, με τα ποσά χωριστά." action={<Btn variant="primary" onClick={openNew}>Νέα καταχώρηση</Btn>} />
      ) : filtered.length === 0 ? (
        // Ο έλεγχος από πάνω κοιτούσε τα `clients`, αλλά το πλέγμα αποδίδει τα
        // `filtered`: με αναζήτηση ή φίλτρο που δεν ταιριάζει σε κανέναν, ο χρήστης
        // έβλεπε ΛΕΥΚΟ ΧΩΡΟ και κανέναν τρόπο να καταλάβει ότι φταίει το φίλτρο.
        <EmptyState icon={<SearchX size={20} />} title="Δεν βρέθηκαν επισκέπτες" hint="Δοκίμασε διαφορετική αναζήτηση ή καθάρισε τα φίλτρα." action={<Btn variant="secondary" onClick={() => { setSearch(''); setUndeclaredOnly(false); }}>Καθαρισμός φίλτρων</Btn>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 14 }}>
          {filtered.map(c => {
            const linked = propsByClient.get(c.id) || [];
            const st = statsByClient.get(c.id) || clientStats([]);
            const cStays = staysByClient.get(c.id) || [];
            const undeclared = undeclaredByClient.get(c.id) || 0;
            const unresolved = cStays.filter(needsAmountReview).length;
            return (
              <div key={c.id} className="client-card" role="button" tabIndex={0}
                onClick={() => setOpenId(c.id)}
                onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setOpenId(c.id); } }}
                style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, outline: 'none' }}>

                {/* Κεφαλίδα: avatar + όνομα + σήματα συμμόρφωσης + ενέργειες.
                    Καμία βαθμολογία, κανένα VIP, καμία «Προσοχή» πάνω σε όνομα ανθρώπου. */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  {avatar(c.full_name, 42)}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                      {st.lastVisit && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>τελ. επίσκεψη {fd(st.lastVisit)}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {undeclared > 0 && <Badge tone="negative">{undeclared} αδήλωτη{undeclared === 1 ? '' : 'ς'}</Badge>}
                      {unresolved > 0 && <Badge tone="warning">Ποσό προς επιβεβαίωση</Badge>}
                      {st.hasDamage && <Badge tone="negative">Φθορές</Badge>}
                    </div>
                    <div className="client-card-act">
                      <button title="Διαγραφή" onClick={e => { e.stopPropagation(); del(c); }}
                        style={{ background: 'none', border: 'none', borderRadius: 8, width: T.h.sm, height: T.h.sm, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 0, flexShrink: 0 }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--negative)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Λωρίδα στατιστικών: βυθισμένο well με ισομερή micro-stats */}
                {st.stayCount > 0 ? (
                  <div style={{ background: 'var(--bg-base)', boxShadow: 'var(--well-inset)', borderRadius: 12, padding: 12, display: 'flex' }}>
                    {([
                      { l: 'Διαμονές', v: String(st.stayCount) },
                      { l: 'Νύχτες', v: String(st.nights) },
                      { l: 'Ακαθάριστα', v: fe(totals(cStays).revenue, 0), strong: true, t: 'Δηλωτέο ακαθάριστο, χωρίς το τέλος ανθεκτικότητας' },
                      { l: 'Μέση νύχτα', v: fe(st.adr, 0), t: 'Δηλωτέο ακαθάριστο διά τις νύχτες' },
                    ] as { l: string; v: string; strong?: boolean; t?: string }[]).map((m, i) => (
                      <div key={i} title={m.t} style={{ flex: 1, minWidth: 0, paddingLeft: i ? 12 : 0, borderLeft: i ? '1px solid var(--border-subtle)' : 'none' }}>
                        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.l}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: m.strong ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{m.v}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Χωρίς καταγεγραμμένες διαμονές</div>
                )}

                {/* Επικοινωνία: compact chips */}
                {(c.phone || c.email) && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {c.phone && <a onClick={e => e.stopPropagation()} href={`tel:${c.phone}`} style={contactChip}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z" /></svg>
                      {c.phone}
                    </a>}
                    {c.email && <a onClick={e => e.stopPropagation()} href={`mailto:${c.email}`} style={contactChip}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.email}</span>
                    </a>}
                    {/* WhatsApp και Viber ΔΕΝ επαναλαμβάνονται εδώ. Ζουν στην
                        καρτέλα του επισκέπτη, μαζί με τα πρότυπα μηνυμάτων —
                        δηλαδή εκεί που ξέρεις ΤΙ θα στείλεις. Στο πλέγμα με
                        δώδεκα κάρτες ήταν σαράντα οκτώ σύνδεσμοι επικοινωνίας. */}
                  </div>
                )}

                {linked.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 2 }}>
                    {linked.map(p => (
                      <button key={p.id} onClick={e => { e.stopPropagation(); onSelectProperty?.(p.id); }} title={`Άνοιγμα: ${p.name}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '4px 9px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--accent)', cursor: 'pointer', fontFamily: T.font.sans }}>
                        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5 12 3l9 6.5" /><path d="M5 10v10h14V10" /></svg>{p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── ΑΚΑΘΑΡΙΣΤΑ ΑΝΑ ΚΑΝΑΛΙ ΚΑΙ ΑΝΑ ΜΗΝΑ, ΣΤΗΝ ΚΥΡΙΑ ΟΘΟΝΗ ───────────
          Ήταν θαμμένα σε drawer «Αναφορές» μαζί με «Κορυφαίους πελάτες» και
          «Ποιότητα φιλοξενίας». Ο χρήστης δεν ρωτάει «πόσα έβγαλα» — ρωτάει
          «πόσα δηλώνω και από πού ήρθαν». Αυτό δεν είναι υπομενού. */}
      {allStays.length > 0 && (() => {
        const yearOf = (s: Stay) => { const d = s.check_in || s.check_out; return d ? new Date(d).getFullYear() : null; };
        const yearsAvail = Array.from(new Set(allStays.map(yearOf).filter((y): y is number => y != null)));
        if (!yearsAvail.includes(reportYear)) yearsAvail.push(reportYear);
        yearsAvail.sort((a, b) => b - a);
        const yStays = allStays.filter(s => yearOf(s) === reportYear);
        const tot = totals(yStays);
        const chRows = revenueByChannel(yStays);
        const maxCh = Math.max(1, ...chRows.map(r => r.revenue));
        const months = revenueByMonth(yStays, reportYear);
        const maxMonth = Math.max(1, ...months);
        const occ = yearOccupancy(yStays, reportYear);
        const monthInitials = ['Ι', 'Φ', 'Μ', 'Α', 'Μ', 'Ι', 'Ι', 'Α', 'Σ', 'Ο', 'Ν', 'Δ'];
        return (
          <div style={{ marginTop: 26 }}>
            <SecHdr label={`Ακαθάριστα ${reportYear}`} sub="Δηλωτέο ακαθάριστο ανά κανάλι και ανά μήνα — χωρίς το τέλος ανθεκτικότητας, χωρίς αφαίρεση προμήθειας"
              right={
                <div style={{ position: 'relative' }}>
                  <button type="button" onClick={() => setReportYearMenu(m => !m)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: T.h.sm, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: T.font.mono, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    {reportYear}
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: reportYearMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.7 }}><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                  {/* ΔΕΝ ΕΙΝΑΙ ΠΑΡΑΘΥΡΟ, ΑΡΑ ΔΕΝ ΓΙΝΕΤΑΙ Modal. Είναι popover
                      αγκυρωμένο στο κουμπί του έτους: χωρίς τίτλο, χωρίς σώμα,
                      χωρίς ενέργειες — μία στήλη με τέσσερα χρόνια. Το `fixed
                      inset: 0` από κάτω είναι ΔΙΑΦΑΝΟ, μόνο για να πιάνει το
                      κλικ έξω· δεν παίρνει T.scrim, γιατί ένα σκοτείνιασμα
                      ολόκληρης της σελίδας για να διαλέξεις χρονιά θα διάβαζε
                      σαν «σταμάτησαν όλα». Ευθυγραμμίστηκε μόνο η ακτίνα με το
                      token (ίδια τιμή, μία πηγή). */}
                  {reportYearMenu && (
                    <>
                      <div onClick={() => setReportYearMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                      <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 50, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, boxShadow: 'var(--elev-3)', padding: 6, minWidth: 96, maxHeight: 220, overflowY: 'auto' }}>
                        {yearsAvail.map(y => (
                          <button key={y} type="button" onClick={() => { setReportYear(y); setReportYearMenu(false); }}
                            style={{ display: 'block', width: '100%', padding: '7px 10px', borderRadius: 8, border: 'none', background: y === reportYear ? 'var(--accent-dim)' : 'transparent', color: y === reportYear ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.mono, fontSize: 13, fontWeight: y === reportYear ? 700 : 500, cursor: 'pointer', textAlign: 'left' }}>{y}</button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              } />

            {tot.unresolved > 0 && (
              <InfoBanner tone="warning">
                {tot.unresolved} από τις {tot.count} διαμονές του {reportYear} έχουν <strong>απροσδιόριστο ποσό</strong> ({fe(tot.unresolvedAmount, 0)}): καταγράφηκαν πριν η εφαρμογή ξεχωρίσει τα ακαθάριστα από την καθαρή είσπραξη, και δεν μαντεύουμε ποιο από τα δύο είναι. Άνοιξε τη διαμονή και συμπλήρωσε τι πλήρωσε ο επισκέπτης — χωρίς αυτό, τα ακαθάριστα εδώ είναι εκτίμηση.
              </InfoBanner>
            )}

            {/* Η ΠΛΗΡΟΤΗΤΑ ΜΕ ΣΩΣΤΟ ΠΑΡΟΝΟΜΑΣΤΗ, και δεύτερο νούμερο για την
                υψηλή περίοδο. Πριν διαιρούσε με 365 και το εποχιακό εξοχικό
                εμφανιζόταν στο «16%». */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10, marginBottom: 16 }}>
              {statTile('Δηλωτέα ακαθάριστα', fe(tot.revenue, 0))}
              {statTile('Τέλος ανθεκτικότητας', tot.climateLevy > 0 ? fe(tot.climateLevy, 0) : fe(0), { title: 'Εισπράχθηκε από τους επισκέπτες για λογαριασμό του κράτους. Δεν είναι έσοδό σου.' })}
              {statTile('Προμήθειες πλατφορμών', tot.platformFees > 0 ? fe(tot.platformFees, 0) : fe(0), { title: 'Δαπάνη που εκπίπτει. ΔΕΝ μειώνει το δηλωτέο έσοδο.' })}
              {statTile(
                'Πληρότητα',
                occ.availableDays > 0 ? `${occ.pct}%` : 'Χωρίς κρατήσεις',
                { title: occ.openFromMonth != null ? `${occ.bookedNights} νύχτες σε ${occ.availableDays} διαθέσιμες ημέρες (${MONTHS_SHORT[occ.openFromMonth]}–${MONTHS_SHORT[occ.openToMonth!]} ${reportYear}) — όχι σε 365` : 'Χωρίς κρατήσεις' },
              )}
              {occ.peak && statTile(
                'Πληρότητα υψηλής περιόδου',
                `${occ.peak.pct}%`,
                { title: `${MONTHS_SHORT[occ.peak.fromMonth]}–${MONTHS_SHORT[occ.peak.toMonth]}: ${occ.peak.bookedNights} νύχτες σε ${occ.peak.days} ημέρες. Η περίοδος βγαίνει από ΤΑ ΔΙΚΑ ΣΟΥ δεδομένα, δεν την αποφασίσαμε εμείς.` },
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 14 }}>
              <div>
                <div style={{ ...lbl, marginBottom: 8 }}>Ανά κανάλι</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg-base)', boxShadow: 'var(--well-inset)', borderRadius: 12, padding: 14 }}>
                  {chRows.map(r => (
                    <div key={r.channel}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 5 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{r.label}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.num, whiteSpace: 'nowrap' }}>{fe(r.revenue, 0)}<span style={{ color: 'var(--text-tertiary)', marginLeft: 8 }}>{r.nights} νύχτες · {r.count} διαμονές</span></span>
                      </div>
                      <div style={{ height: 8, borderRadius: 6, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.max(2, (r.revenue / maxCh) * 100)}%`, height: '100%', background: 'var(--series-in)', borderRadius: 6 }} />
                      </div>
                      {r.unresolved > 0 && <div style={{ fontSize: 10, color: 'var(--warning)', marginTop: 3 }}>{r.unresolved} με απροσδιόριστο ποσό</div>}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ ...lbl, marginBottom: 8 }}>Ανά μήνα</div>
                <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: 14, padding: '14px 14px 8px', boxShadow: 'var(--highlight-inset), var(--elev-1)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
                    {months.map((v, i) => (
                      <div key={i} title={`${MONTHS_NOM[i]}: ${fe(v, 0)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', height: '100%' }}>
                        <div style={{ width: '100%', height: `${(v / maxMonth) * 100}%`, minHeight: v > 0 ? 3 : 0, background: 'var(--series-in)', borderRadius: '3px 3px 0 0' }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ height: 1, background: 'var(--border-subtle)', margin: '2px 0 6px' }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    {monthInitials.map((m, i) => (
                      <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{m}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Ντοσιέ επισκέπτη ─────────────────────────────────────────────────
          ΗΤΑΝ ΤΟ ΤΡΙΤΟ ΧΕΙΡΟΓΡΑΦΟ ΠΛΑΪΝΟ ΦΥΛΛΟ ΤΗΣ ΕΦΑΡΜΟΓΗΣ: δικό του scrim,
          δικό του πλάτος 720, δικό του «×» — και τίποτα από όσα κάνουν ένα
          παράθυρο παράθυρο. Το Escape δεν το έκλεινε. Η εστίαση δεν έμπαινε
          μέσα, άρα ο χρήστης πληκτρολογίου συνέχιζε να διατρέχει τη λίστα από
          κάτω, και όταν έκλεινε δεν γύριζε στην κάρτα από την οποία ήρθε. Και
          το σύρσιμο πάνω στο σκοτεινό φόντο κυλούσε τη σελίδα από πίσω: έκλεινε
          το ντοσιέ και έβρισκε άλλο σημείο της λίστας από αυτό που άφησε.
          Το SideSheet τα φέρνει και τα τέσσερα, με το ίδιο πλάτος 720.
          Το «×» το βάζει το ίδιο — εδώ μένει μόνο το περιεχόμενο της κεφαλίδας. */}
      {dc && dcStats && (
        // ΦΡΟΥΡΑ ΣΤΟ ΚΛΕΙΣΙΜΟ: το «Επεξεργασία στοιχείων» ανοίγει το παράθυρο
        // της φόρμας ΠΑΝΩ από αυτό το φύλλο, χωρίς να το κλείνει. Και τα δύο
        // primitives ακούν Escape στο `document`, άρα ΕΝΑ Escape έφτανε και στα
        // δύο: έκλεινε τη φόρμα ΚΑΙ το ντοσιέ από κάτω. Δύο συνέπειες, η
        // δεύτερη σοβαρή:
        //   • ο χρήστης έχανε το ντοσιέ ενώ ήθελε μόνο να ακυρώσει τη φόρμα·
        //   • αποπροσαρτώνται στην ΙΔΙΑ φάση, με το φύλλο πρώτο στο δέντρο, άρα
        //     πρώτα το φύλλο επαναφέρει το overflow σε «» και ΜΕΤΑ το παράθυρο
        //     το ξαναγράφει «hidden» (αυτό βρήκε όταν άνοιξε). Η σελίδα έμενε
        //     κλειδωμένη χωρίς καμία επικάλυψη ανοιχτή.
        // Όσο η φόρμα είναι ανοιχτή, το φύλλο αγνοεί το κλείσιμο· το scrim του
        // ούτως ή άλλως δεν είναι προσιτό, γιατί το παράθυρο το σκεπάζει.
        <SideSheet open onClose={() => { if (modalOpen) return; setOpenId(null); setStayFormOpen(false); }} ariaLabel="Καρτέλα επισκέπτη" width={720}
          header={
            // Avatar + όνομα + σήματα συμμόρφωσης + ενέργεια.
            // Καμία βαθμολογία, κανένα VIP, καμία «μαύρη λίστα».
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              {avatar(dc.full_name, 52)}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 20, fontWeight: 700 }}>{dc.full_name}</span>
                  {dcUndeclared > 0 && <Badge tone="negative">{dcUndeclared} αδήλωτη{dcUndeclared === 1 ? '' : 'ς'}</Badge>}
                </div>
              </div>
              <Btn variant="secondary" onClick={() => openEdit(dc)}>Επεξεργασία στοιχείων</Btn>
            </div>
          }>

            {/* Επικοινωνία. ΜΟΝΟ τηλέφωνο και email: διεύθυνση, ΑΦΜ, αριθμός
                ταυτότητας, εθνικότητα και «πηγή γνωριμίας» έφυγαν — δεδομένα
                προσωπικού χαρακτήρα που δεν προκαλούσαν καμία ενέργεια. Ό,τι
                χρειάζεται ο οικοδεσπότης μένει στην ιδιωτική σημείωση, χωρίς
                ετικέτα κατηγορίας. */}
            <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
                {([
                  ['Τηλέφωνο', dc.phone ? <a href={`tel:${dc.phone}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{dc.phone}</a> : null],
                  ['Ηλεκτρονικό ταχυδρομείο', dc.email ? <a href={`mailto:${dc.email}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{dc.email}</a> : null],
                ] as [string, React.ReactNode][]).filter(([, v]) => v != null).map(([k, v], i) => (
                  <div key={i}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 3 }}>{k}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{v}</div>
                  </div>
                ))}
              </div>
              {dc.phone && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <a href={waLink(dc.phone)} target="_blank" rel="noopener noreferrer" style={msgLink}>WhatsApp</a>
                  <a href={viberLink(dc.phone)} style={msgLink}>Viber</a>
                </div>
              )}
              {dc.notes && dc.notes.trim() && <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{dc.notes}</div>}
            </div>

            {/* Συνδεδεμένα ακίνητα (ο έλεγχος σύνδεσης ζει εδώ, όχι στην κάρτα) */}
            <div>
              <div style={{ ...lbl, marginBottom: 8 }}>Συνδεδεμένα ακίνητα</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {(propsByClient.get(dc.id) || []).map(p => (
                  <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '6px 11px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                    <button onClick={() => onSelectProperty?.(p.id)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, padding: 0, fontFamily: T.font.sans }}>{p.name}</button>
                    {/* 15 δεν υπάρχει στην κλίμακα (…13, 14, 16…) — το δίδυμό
                        του στα αρχικά της κεφαλίδας διορθώθηκε, αυτό είχε μείνει. */}
                    <button onClick={() => unlinkProperty(p.id)} title="Αποσύνδεση" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: 14 }}>×</button>
                  </span>
                ))}
                {(propsByClient.get(dc.id) || []).length === 0 && unlinkedProps.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Κανένα ακίνητο</span>}
                {/* ΝΤΟΠΙΟ <select> ΜΕΣΑ ΣΕ ΟΘΟΝΗ ΜΕ ΔΙΚΟ ΤΗΣ ΣΥΣΤΗΜΑ ΠΕΔΙΩΝ.
                    Το λειτουργικό το σχεδίαζε μόνο του: άλλο βέλος, άλλη γωνία,
                    άλλη γραμματοσειρά, άλλο φόντο στη λίστα — και στο σκούρο θέμα
                    λευκό πλαίσιο σε σκούρα σελίδα. Ένα πεδίο, το ίδιο με τα άλλα. */}
                {unlinkedProps.length > 0 && (
                  <div style={{ flex: '1 1 220px', minWidth: 190 }}>
                    <CustomSelect value="" onChange={v => { if (v) linkProperty(dc.id, v); }}
                      options={unlinkedProps.map(p => ({ value: p.id, label: p.name }))}
                      placeholder="Πρόσθεσε ακίνητο" />
                  </div>
                )}
              </div>
            </div>

            {/* Άφιξη επισκέπτη: σύνδεσμος για να συμπληρώσει τα στοιχεία του πριν φτάσει */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                <div style={lbl}>Στοιχεία άφιξης</div>
                <Btn variant="secondary" onClick={copyCheckinLink}>{checkinCopied ? 'Ο σύνδεσμος αντιγράφηκε' : 'Αντιγραφή συνδέσμου'}</Btn>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5, marginBottom: checkins.length ? 10 : 0 }}>
                Ο επισκέπτης συμπληρώνει μόνος του ταυτότητα, εθνικότητα και ώρα άφιξης πριν φτάσει.
              </div>
              {checkins.map(ci => (
                <div key={ci.id} style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '10px 14px', marginTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{ci.full_name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.mono }}>{fd(ci.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5 }}>
                    {[ci.id_number && `Ταυτότητα ${ci.id_number}`, ci.nationality, ci.birth_date && `γεν. ${fd(ci.birth_date)}`, ci.phone, ci.arrival_date && `άφιξη ${fd(ci.arrival_date)}`, ci.guests_count && `${ci.guests_count} άτομα`, ci.accepts_rules && 'αποδοχή κανόνων'].filter(Boolean).join(' · ')}
                  </div>
                </div>
              ))}
            </div>

            {/* Αναλυτικά: μόνο όταν υπάρχουν διαμονές (αλλιώς περιττά μηδενικά).
                Τα ποσά είναι διακριτά: ακαθάριστο ≠ payout ≠ τι πλήρωσε ο επισκέπτης. */}
            {dcStats.stayCount > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 116px), 1fr))', gap: 10 }}>
                {statTile('Ακαθάριστα', fe(dcTotals.revenue, 0), { title: 'Δηλωτέο ακαθάριστο: τι πλήρωσε ο επισκέπτης μείον το τέλος ανθεκτικότητας. Η προμήθεια ΔΕΝ αφαιρείται.' })}
                {dcTotals.platformFees > 0 && statTile('Προμήθειες', fe(dcTotals.platformFees, 0), { title: 'Δαπάνη που εκπίπτει, όχι μείωση εσόδου' })}
                {dcTotals.climateLevy > 0 && statTile('Τέλος ανθεκτικότητας', fe(dcTotals.climateLevy, 0), { title: 'Εισπράχθηκε για λογαριασμό του κράτους. Δεν είναι έσοδό σου.' })}
                {statTile('Νύχτες', String(dcStats.nights))}
                {statTile('Διαμονές', String(dcStats.stayCount))}
                {statTile('Μέση τιμή νύχτας', fe(dcStats.adr, 0), { title: 'Δηλωτέο ακαθάριστο διά τις νύχτες' })}
                {/* Η παύλα σε θέση τιμής δεν λέει «καμία»· λέει «κάτι έσπασε».
                    Η πλακέτα εμφανίζεται μόνο όταν υπάρχει ημερομηνία να δείξει. */}
                {dcStats.lastVisit && statTile('Τελευταία επίσκεψη', fd(dcStats.lastVisit))}
                {dcUndeclared > 0 && statTile('Αδήλωτες', String(dcUndeclared), { neg: true, title: 'Διαμονές χωρίς Δήλωση Βραχυχρόνιας Διαμονής' })}
                {dcStats.damageTotal > 0 && statTile('Φθορές', fe(dcStats.damageTotal, 0), { neg: true })}
              </div>
            )}

            {/* Διαμονές */}
            <div>
              <SecHdr label="Διαμονές" right={!stayFormOpen ? <Btn variant="secondary" onClick={openStayNew}>Νέα διαμονή</Btn> : undefined} />
              {stayFormOpen && (
                <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 16, marginBottom: 14, boxShadow: 'var(--well-inset)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14 }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <CustomSelect label="Ακίνητο" value={stayForm.property_id} onChange={v => setStayForm(f => ({ ...f, property_id: v }))} options={props.map(p => ({ value: p.id, label: p.name }))} placeholder="Χωρίς ακίνητο" />
                    </div>
                    <DatePicker label="Άφιξη" value={stayForm.check_in} onChange={v => onStayDates({ check_in: v })} />
                    <DatePicker label="Αναχώρηση" value={stayForm.check_out} onChange={v => onStayDates({ check_out: v })} />
                    {/* ΟΙ ΝΥΧΤΕΣ ΔΕΝ ΕΙΝΑΙ ΕΡΩΤΗΣΗ ΟΤΑΝ ΥΠΑΡΧΟΥΝ ΟΙ ΗΜΕΡΟΜΗΝΙΕΣ.
                        Ήταν πεδίο που γέμιζε μόνο του από τις δύο ημερομηνίες και
                        μετά επιτρεπόταν να το αλλάξεις: τρίτη πηγή αλήθειας για
                        κάτι που είναι αφαίρεση. Ο χρήστης που έγραφε άλλον αριθμό
                        δεν μάθαινε ποτέ ποιος από τους δύο μέτρησε. */}
                    {derivedNights != null ? (
                      <div>
                        <div style={{ ...lbl, marginBottom: 6 }}>Διανυκτερεύσεις</div>
                        <div style={{ height: T.h.lg, display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{derivedNights}</div>
                      </div>
                    ) : (
                      <NumberInput label="Διανυκτερεύσεις" value={stayForm.nights} onChange={v => setStayForm(f => ({ ...f, nights: v }))} />
                    )}
                    <NumberInput label="Άτομα" value={stayForm.guests} onChange={v => setStayForm(f => ({ ...f, guests: v }))} />
                    <CustomSelect label="Κανάλι" value={stayForm.channel} onChange={v => setStayForm(f => ({ ...f, channel: v }))} options={channelOptions} />
                    <NumberInput label="Τιμή ανά νύχτα" value={stayForm.nightly_rate} onChange={v => setStayForm(f => ({ ...f, nightly_rate: v }))} suffix="€" />
                  </div>

                  {/* ── ΤΑ ΤΡΙΑ ΠΟΣΑ ─────────────────────────────────────────
                      Δεν υπάρχει πεδίο «Σύνολο». Το `total` είναι ΠΑΡΑΓΩΓΟ, γιατί
                      «Σύνολο» δεν σήμαινε τίποτα συγκεκριμένο: ο εισαγωγέας το
                      γέμιζε με payout, η φορολογική μηχανή το διάβαζε ως
                      ακαθάριστο, και ο φάκελος του λογιστή ζητούσε ακαθάριστο. */}
                  {secHead('Ποσά')}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14 }}>
                    {/* ΚΑΜΙΑ ΚΟΥΚΚΙΔΑ ΕΠΕΞΗΓΗΣΗΣ ΕΔΩ. Ήταν τρεις, μία σε κάθε
                        πεδίο, και έλεγαν ακριβώς ό,τι λέει η σύνοψη δύο σειρές
                        πιο κάτω με πραγματικούς αριθμούς: τι πλήρωσε ο
                        επισκέπτης, τι πάει στο κράτος, τι εκπίπτει. Το ίδιο
                        πράγμα δύο φορές, τη μία με ποντίκι από πάνω. */}
                    <NumberInput label="Πλήρωσε ο επισκέπτης"
                      value={stayForm.gross_guest_paid} onChange={v => setStayForm(f => ({ ...f, gross_guest_paid: v }))} suffix="€" step={10} />
                    <NumberInput label="Τέλος ανθεκτικότητας"
                      value={stayForm.climate_levy} onChange={v => setStayForm(f => ({ ...f, climate_levy: v }))} suffix="€" step={2} />
                    <NumberInput label="Προμήθεια πλατφόρμας"
                      value={stayForm.platform_fee} onChange={v => setStayForm(f => ({ ...f, platform_fee: v }))} suffix="€" step={5} />
                  </div>

                  {/* Πρόταση τέλους από τους συντελεστές της ΑΑΔΕ και τον τύπο/
                      μέγεθος ΑΥΤΟΥ του ακινήτου. Ένα κλικ, και διορθώσιμο. */}
                  {(() => {
                    const sug = suggestLevy(stayForm);
                    if (!sug || parseFloat(stayForm.climate_levy) > 0) return null;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10, fontSize: 11, color: 'var(--text-tertiary)' }}>
                        <span>Με βάση τους συντελεστές της ΑΑΔΕ και το ακίνητο, το τέλος για αυτή τη διαμονή βγαίνει <strong style={{ fontFamily: T.font.num, color: 'var(--text-secondary)' }}>{fe(sug, 0)}</strong>. Επιβεβαίωσε το ακριβές ποσό στο myAADE.</span>
                        <Btn variant="secondary" onClick={() => setStayForm(f => ({ ...f, climate_levy: String(sug) }))}>Χρησιμοποίησέ το</Btn>
                      </div>
                    );
                  })()}

                  {/* Το αποτέλεσμα, ζωντανά: τι δηλώνεις και τι μένει σε εσένα. */}
                  {(() => {
                    const g = parseFloat(stayForm.gross_guest_paid) || 0;
                    if (g <= 0) {
                      return stayForm.basis === 'unknown' && (parseFloat(stayForm.legacyTotal) || 0) > 0 ? (
                        <InfoBanner tone="warning">
                          Αυτή η διαμονή έχει καταγεγραμμένο ποσό <strong>{fe(parseFloat(stayForm.legacyTotal), 0)}</strong> αλλά <strong>δεν ξέρουμε τι είναι</strong>: ακαθάριστο ή καθαρή είσπραξη. Καταγράφηκε πριν η εφαρμογή τα ξεχωρίσει και δεν μαντεύουμε. Συμπλήρωσε «Πλήρωσε ο επισκέπτης» και το ακαθάριστο θα υπολογιστεί σωστά — ή δήλωσε παρακάτω τι σημαίνει το ποσό.
                        </InfoBanner>
                      ) : null;
                    }
                    const levy = parseFloat(stayForm.climate_levy) || 0;
                    const fee = parseFloat(stayForm.platform_fee) || 0;
                    const gross = Math.max(0, g - levy);
                    return (
                      <div style={{ marginTop: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                        Πλήρωσε ο επισκέπτης <strong style={{ fontFamily: T.font.num }}>{fe(g, 0)}</strong>
                        {' − '}τέλος <strong style={{ fontFamily: T.font.num }}>{fe(levy, 0)}</strong>
                        {' = '}<strong style={{ fontFamily: T.font.num, color: 'var(--text-primary)' }}>δηλωτέο ακαθάριστο {fe(gross, 0)}</strong>
                        <br />
                        {fe(gross, 0)} − προμήθεια <strong style={{ fontFamily: T.font.num }}>{fe(fee, 0)}</strong> (δαπάνη, <strong>όχι</strong> μείωση εσόδου) = μένει σε εσένα <strong style={{ fontFamily: T.font.num }}>{fe(Math.max(0, gross - fee), 0)}</strong>
                      </div>
                    );
                  })()}

                  {/* Ρητή δήλωση βάσης για τις ιστορικές γραμμές που δεν έχουν ανάλυση. */}
                  {(parseFloat(stayForm.gross_guest_paid) || 0) <= 0 && (parseFloat(stayForm.legacyTotal) || 0) > 0 && (
                    <div style={{ marginTop: 12, maxWidth: 340 }}>
                      <CustomSelect label={`Τι σημαίνει το ποσό ${fe(parseFloat(stayForm.legacyTotal), 0)};`}
                        value={stayForm.basis} onChange={v => setStayForm(f => ({ ...f, basis: v as AmountBasis }))}
                        options={[
                          { value: 'unknown', label: AMOUNT_BASIS_LABELS.unknown },
                          { value: 'gross', label: AMOUNT_BASIS_LABELS.gross },
                          { value: 'payout', label: AMOUNT_BASIS_LABELS.payout },
                        ]} />
                    </div>
                  )}

                  {/* ── ΔΗΛΩΣΗ ΒΡΑΧΥΧΡΟΝΙΑΣ ΔΙΑΜΟΝΗΣ (μία ανά κράτηση) ───── */}
                  {secHead('Δήλωση βραχυχρόνιας διαμονής')}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, alignItems: 'end' }}>
                    <Toggle on={stayForm.declared}
                      onChange={v => setStayForm(f => ({ ...f, declared: v, declared_at: v ? (f.declared_at || todayStr()) : '' }))}
                      label="Δηλώθηκε στο myAADE" labelOff="Αδήλωτη" />
                    {stayForm.declared && <DatePicker label="Ημερομηνία δήλωσης" value={stayForm.declared_at} onChange={v => setStayForm(f => ({ ...f, declared_at: v }))} />}
                  </div>

                  {/* ── ΦΘΟΡΕΣ, ΣΥΝΔΕΔΕΜΕΝΕΣ ΜΕ ΤΗΝ ΑΠΟΓΡΑΦΗ ────────────── */}
                  {secHead('Φθορές και σημειώσεις')}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
                      <Toggle on={stayForm.damages} onChange={v => setStayForm(f => ({ ...f, damages: v }))} label="Καταγράφηκαν φθορές" labelOff="Χωρίς φθορές" />
                    </div>
                    {stayForm.damages && (
                      <>
                        <CustomSelect label="Ποιο αντικείμενο"
                          value={stayForm.damage_item_id} onChange={v => setStayForm(f => ({ ...f, damage_item_id: v }))}
                          placeholder={invForStay.length ? `Επίλεξε από «${navLabel('inventory')}»` : `Καμία καταχώρηση σε «${navLabel('inventory')}»`}
                          options={invForStay.map(i => ({ value: i.id, label: i.current_value != null ? `${i.name} · ${fe(i.current_value)}` : i.name }))} />
                        <NumberInput label="Κόστος φθοράς" value={stayForm.damage_cost} onChange={v => setStayForm(f => ({ ...f, damage_cost: v }))} suffix="€" />
                      </>
                    )}
                    {/* ΔΥΟ ΚΟΥΤΙΑ ΕΛΕΥΘΕΡΟΥ ΚΕΙΜΕΝΟΥ, ΣΑΡΑΝΤΑ ΕΙΚΟΝΟΣΤΟΙΧΕΙΑ ΜΑΚΡΙΑ.
                        Το «Σημείωση φθοράς» δεν έλεγε τίποτα που να μη χωρά στις
                        «Σημειώσεις», και ο χρήστης έπρεπε να αποφασίσει σε ποιο
                        από τα δύο γράφει. Έμεινε ένα. Το πεδίο επανεμφανίζεται
                        μόνο σε παλιές γραμμές που ΕΧΟΥΝ ήδη τιμή, ώστε να μπορεί
                        να διαβαστεί και να καθαριστεί, όχι για να ξαναγεμίσει. */}
                    {stayForm.damages && stayForm.damage_note.trim() !== '' && (
                      <TextInput label="Παλαιότερη σημείωση φθοράς" value={stayForm.damage_note} onChange={v => setStayForm(f => ({ ...f, damage_note: v }))} />
                    )}
                    <div style={{ gridColumn: '1 / -1' }}>
                      <TextInput label="Σημειώσεις" value={stayForm.notes} onChange={v => setStayForm(f => ({ ...f, notes: v }))} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
                    <Btn variant="ghost" onClick={() => setStayFormOpen(false)}>Ακύρωση</Btn>
                    <Btn variant="primary" onClick={saveStay} disabled={savingStay}>{savingStay ? 'Αποθήκευση…' : 'Αποθήκευση'}</Btn>
                  </div>
                </div>
              )}
              {dcStays.length === 0 && !stayFormOpen ? (
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '8px 0' }}>Χωρίς καταγεγραμμένες διαμονές</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {dcStays.map(s => {
                    const n = s.nights ?? stayNights(s.check_in, s.check_out);
                    const gross = declarableGross(s);
                    const pay = hostPayout(s);
                    const review = needsAmountReview(s);
                    const declared = isDeclared(s);
                    const dmgItem = s.damage_item_id ? inv.find(i => i.id === s.damage_item_id) : undefined;
                    return (
                      <div key={s.id} style={{ background: 'var(--surface-raised)', border: `1px solid ${declared ? 'var(--border-raised)' : 'var(--negative-border)'}`, borderRadius: 14, padding: 12, boxShadow: 'var(--highlight-inset), var(--elev-1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.property_id ? propName(s.property_id) : 'Χωρίς ακίνητο'}</span>
                              {/* ΤΟ ΣΗΜΑ ΠΟΥ ΕΛΕΙΠΕ: μία δήλωση ανά κράτηση, και
                                  το app είχε όλες τις κρατήσεις χωρίς να
                                  παρακολουθεί καμία. */}
                              {!declared && <Badge tone="negative">Αδήλωτη</Badge>}
                              {review && <Badge tone="warning">Ποσό προς επιβεβαίωση</Badge>}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                              {s.check_in && <span>{fd(s.check_in)}{s.check_out ? ` - ${fd(s.check_out)}` : ''}</span>}
                              <span style={{ color: 'var(--text-tertiary)' }}>·</span><span>{n} νύχτες</span>
                              {s.guests != null && <><span style={{ color: 'var(--text-tertiary)' }}>·</span><span>{s.guests} άτομα</span></>}
                              {s.channel && <><span style={{ color: 'var(--text-tertiary)' }}>·</span><span>{STAY_CHANNEL_LABELS[s.channel as keyof typeof STAY_CHANNEL_LABELS] || s.channel}</span></>}
                              {declared && s.declared_at && <><span style={{ color: 'var(--text-tertiary)' }}>·</span><span style={{ color: 'var(--text-secondary)' }}>δηλώθηκε {fd(s.declared_at)}</span></>}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.font.num }}>{fe(gross ?? stayTotal(s), 0)}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{gross != null ? 'δηλωτέο ακαθάριστο' : 'ποσό απροσδιόριστο'}</div>
                            {pay != null && pay !== gross && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.num }}>{fe(pay, 0)} σε εσένα</div>}
                          </div>
                        </div>
                        {/* Η ανάλυση, ρητά, όπου υπάρχει. */}
                        {(s.gross_guest_paid != null || s.climate_levy != null || s.platform_fee != null) && (
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6, lineHeight: 1.6 }}>
                            {s.gross_guest_paid != null && <>πλήρωσε ο επισκέπτης {fe(s.gross_guest_paid, 0)}</>}
                            {(s.climate_levy || 0) > 0 && <> · τέλος {fe(s.climate_levy || 0, 0)} (όχι έσοδό σου)</>}
                            {(s.platform_fee || 0) > 0 && <> · προμήθεια {fe(s.platform_fee || 0, 0)} (δαπάνη)</>}
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            {s.damages && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--negative)' }}>Φθορά {fe(s.damage_cost || 0, 0)}{dmgItem ? ` · ${dmgItem.name}` : s.damage_note ? ` · ${s.damage_note}` : ''}</span>}
                          </div>
                          <div style={{ display: 'flex', gap: 10 }}>
                            {/* Ένα κλικ. Η προθεσμία της δήλωσης δεν περιμένει φόρμα. */}
                            <button onClick={() => toggleDeclared(s)} style={{ background: 'none', border: 'none', color: declared ? 'var(--text-tertiary)' : 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: T.font.sans, padding: 0 }}>
                              {declared ? 'Αναίρεση δήλωσης' : 'Σημείωσε ως δηλωμένη'}
                            </button>
                            <button onClick={() => openStayEdit(s)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontFamily: T.font.sans, padding: 0 }}>Επεξεργασία</button>
                            <button onClick={() => delStay(s)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 12, fontFamily: T.font.sans, padding: 0 }}>Διαγραφή</button>
                          </div>
                        </div>
                        {s.notes && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>{s.notes}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ═══ ΜΗΝΥΜΑΤΑ — ΕΝΑ ΚΕΙΜΕΝΟ ΤΗ ΦΟΡΑ, ΤΡΕΙΣ ΕΝΕΡΓΕΙΕΣ ═════════════
                Ήταν πέντε κάρτες με τρία κουμπιά η καθεμία: δεκαπέντε στόχους
                σε μία ενότητα, και το κείμενο κομμένο στις δύο γραμμές, ώστε ο
                χρήστης να στέλνει κάτι που δεν έχει διαβάσει ολόκληρο.
                Τώρα: διαλέγεις πρότυπο, το βλέπεις όλο, το στέλνεις. */}
            <div>
              <SecHdr label="Μηνύματα" sub="Έτοιμα πρότυπα για WhatsApp, Viber ή αντιγραφή" />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {MSG_TEMPLATES.map(t => (
                  <button key={t.id} style={chip(t.id === msgId)}
                    onClick={() => { setMsgId(t.id); setMsgCopied(false); }}>{t.label}</button>
                ))}
              </div>
              {(() => {
                const active = MSG_TEMPLATES.find(t => t.id === msgId) || MSG_TEMPLATES[0];
                const text = buildMessage(active.id, msgCtx!);
                return (
                  <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: 14, padding: 16, boxShadow: 'var(--highlight-inset), var(--elev-1)' }}>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{text}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
                      <a href={whatsappLink(dc.phone ? msgDigits(dc.phone) : '', text)} target="_blank" rel="noopener noreferrer" style={msgLink}>WhatsApp</a>
                      <a href={viberTextLink(text)} style={msgLink}>Viber</a>
                      <button onClick={() => { navigator.clipboard?.writeText(text); setMsgCopied(true); }}
                        style={{ ...msgLink, cursor: 'pointer', fontFamily: T.font.sans }}>{msgCopied ? 'Αντιγράφηκε' : 'Αντιγραφή'}</button>
                      {!dc.phone && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Χωρίς αποθηκευμένο τηλέφωνο θα διαλέξεις επαφή μέσα στην εφαρμογή.</span>}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Έγγραφα (ταυτότητα, συμβόλαιο, αποδείξεις) */}
            <div>
              <SecHdr label="Έγγραφα" sub="Ταυτότητα, συμβόλαιο, αποδείξεις, ασφαλής αποθήκευση" />
              <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ minWidth: 200, flex: '1 1 200px' }}>
                  <CustomSelect label="Είδος εγγράφου" value={docKind} onChange={setDocKind} options={DOC_KINDS.map(k => ({ value: k, label: DOC_KIND_LABELS[k] }))} />
                </div>
                <input ref={docFileRef} type="file" style={{ display: 'none' }} onChange={e => onDocFile(e.target.files?.[0])} />
                <Btn variant="secondary" onClick={() => docFileRef.current?.click()} disabled={docBusy}>{docBusy ? 'Ανέβασμα…' : 'Ανέβασμα αρχείου'}</Btn>
              </div>
              {docMsg && <div style={{ fontSize: 12, color: docMsg.error ? 'var(--negative)' : 'var(--text-secondary)', marginBottom: 12 }}>{docMsg.text}</div>}
              {docs.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '8px 0' }}>Δεν έχουν αποθηκευτεί έγγραφα.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {docs.map(d => (
                    <div key={d.id} style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: 14, padding: 12, boxShadow: 'var(--highlight-inset), var(--elev-1)', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                          {DOC_KIND_LABELS[d.kind] || 'Άλλο'}{fmtBytes(d.size) ? ` · ${fmtBytes(d.size)}` : ''} · {fd(d.created_at)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {d.signedUrl && <a href={d.signedUrl} target="_blank" rel="noopener noreferrer" style={msgLink}>Άνοιγμα</a>}
                        <button onClick={() => delDoc(d)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 12, fontFamily: T.font.sans, padding: 0 }}>Διαγραφή</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Χρονολόγιο (σχόλια) */}
            <div>
              <SecHdr label="Χρονολόγιο" sub="Σχόλια, τηλεφωνήματα, επισκέψεις" />
              <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ width: 150 }}>
                  <CustomSelect value={noteForm.kind} onChange={v => setNoteForm(f => ({ ...f, kind: v }))} options={noteKindOptions} />
                </div>
                <div style={{ flex: '1 1 200px' }}>
                  <TextInput value={noteForm.body} onChange={v => setNoteForm(f => ({ ...f, body: v }))} placeholder="Νέο σχόλιο…" />
                </div>
                <Btn variant="primary" onClick={saveNote} disabled={!noteForm.body.trim()}>Προσθήκη</Btn>
              </div>
              {notes.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '4px 0' }}>Δεν υπάρχουν σχόλια ακόμη.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {notes.map(nt => (
                    <div key={nt.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3, flexWrap: 'wrap' }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: nt.kind === 'damage' ? 'var(--negative)' : 'var(--accent)' }} />
                          <Badge tone={nt.kind === 'damage' ? 'negative' : 'neutral'}>{NOTE_KIND_LABELS[nt.kind as keyof typeof NOTE_KIND_LABELS] || nt.kind}</Badge>
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{fd(nt.created_at)}</span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>{nt.body}</div>
                      </div>
                      <button onClick={() => delNote(nt)} title="Διαγραφή" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 16, padding: 0, flexShrink: 0 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
        </SideSheet>
      )}

      {/* ── Εισαγωγή κράτησης από email (AI) ────────────────────────────────
          Χειρόγραφο παράθυρο με δικό του radius 18 (το token λέει
          T.radius.modal) και maxHeight '92vh' — που στο κινητό μετρά ΚΑΙ τη
          γραμμή διευθύνσεων του περιηγητή, άρα τα κουμπιά «Ακύρωση/Ανάλυση»
          κάθονταν κάτω από αυτήν. Το Modal μετρά σε 92dvh.
          Οι δύο ενέργειες ήταν μέσα στην περιοχή κύλισης, δηλαδή έφευγαν από το
          κάδρο όταν το επικολλημένο email ήταν μεγάλο· τώρα είναι υποσέλιδο. */}
      <Modal open={emailOpen} onClose={() => setEmailOpen(false)} width={600}
        title="Εισαγωγή από email" ariaLabel="Εισαγωγή κράτησης από μήνυμα"
        subtitle="Επικόλλησε το email κράτησης (Airbnb/Booking) και το AI βρίσκει όνομα, ημερομηνίες και ποσό"
        footer={!emailDraft ? (
          <>
            <Btn variant="ghost" onClick={() => setEmailOpen(false)}>Ακύρωση</Btn>
            <Btn variant="primary" onClick={parseEmail} disabled={emailBusy || emailText.trim().length < 20}>{emailBusy ? 'Ανάλυση…' : 'Ανάλυση'}</Btn>
          </>
        ) : (
          <>
            <Btn variant="ghost" onClick={() => setEmailDraft(null)}>Πίσω</Btn>
            <Btn variant="primary" onClick={saveEmailStay} disabled={emailBusy || !emailDraft.name.trim()}>{emailBusy ? 'Αποθήκευση…' : 'Αποθήκευση διαμονής'}</Btn>
          </>
        )}>
      {!emailDraft ? (
        <>
          <Textarea label="Κείμενο email" value={emailText} onChange={setEmailText} rows={8} placeholder="Επικόλλησε εδώ το περιεχόμενο του email κράτησης…" />
          {emailErr && <div style={{ background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: T.radius.inner, padding: '10px 14px', fontSize: 13, color: 'var(--negative)' }}>{emailErr}</div>}
        </>
      ) : (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Έλεγξε και διόρθωσε αν χρειάζεται, μετά αποθήκευσε. Θα δημιουργηθεί ο επισκέπτης (αν δεν υπάρχει) και η διαμονή.</div>
          <div style={fGrid}>
            <div style={{ gridColumn: '1 / -1' }}><TextInput label="Όνομα επισκέπτη" value={emailDraft.name} onChange={v => setEmailDraft(d => d && { ...d, name: v })} /></div>
            <DatePicker label="Άφιξη" value={emailDraft.check_in} onChange={v => setEmailDraft(d => d && { ...d, check_in: v })} />
            <DatePicker label="Αναχώρηση" value={emailDraft.check_out} onChange={v => setEmailDraft(d => d && { ...d, check_out: v })} />
            {/* Το ένα, διφορούμενο «Ποσό (payout)» έγινε τρία ξεχωριστά.
                Εκεί γεννιόταν η αντίφαση: ό,τι μπαινε εδώ ως payout
                διαβαζόταν αλλού ως ακαθάριστο και φορολογούνταν. */}
            <NumberInput label="Πλήρωσε ο επισκέπτης" labelInfo="Το σύνολο που πλήρωσε ο επισκέπτης, πριν την προμήθεια." value={emailDraft.gross} onChange={v => setEmailDraft(d => d && { ...d, gross: v })} suffix="€" step={10} />
            <NumberInput label="Τέλος ανθεκτικότητας" labelInfo="Δεν είναι έσοδό σου — αφαιρείται από το δηλωτέο ακαθάριστο." value={emailDraft.levy} onChange={v => setEmailDraft(d => d && { ...d, levy: v })} suffix="€" step={2} />
            <NumberInput label="Προμήθεια πλατφόρμας" labelInfo="Δαπάνη που εκπίπτει — ΔΕΝ μειώνει το δηλωτέο ακαθάριστο." value={emailDraft.fee} onChange={v => setEmailDraft(d => d && { ...d, fee: v })} suffix="€" step={5} />
            <CustomSelect label="Κανάλι" value={emailDraft.channel} onChange={v => setEmailDraft(d => d && { ...d, channel: v })} options={channelOptions} />
          </div>
          {(parseFloat(emailDraft.gross) || 0) > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Δηλωτέο ακαθάριστο: <strong style={{ fontFamily: T.font.num, color: 'var(--text-primary)' }}>{fe(Math.max(0, (parseFloat(emailDraft.gross) || 0) - (parseFloat(emailDraft.levy) || 0)), 0)}</strong>
            </div>
          )}
        </>
      )}
      </Modal>

      {/* ── Εισαγωγή iCal (Airbnb/Booking) ──────────────────────────────────
          Ίδια ιστορία με το παράθυρο του email: χειρόγραφο κέλυφος με radius 18
          αντί για T.radius.modal και '92vh' αντί για '92dvh'. Το εικονίδιο του
          ημερολογίου ζούσε σε δικό του κουτί 44×44 — το Modal το τοποθετεί μόνο
          του, οπότε εδώ μένει σκέτο το SVG. */}
      <Modal open={icalOpen} onClose={() => setIcalOpen(false)} width={680}
        title="Εισαγωγή iCal" subtitle="Συγχρονισμός κρατήσεων από Airbnb ή Booking"
        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>}
        footer={icalEvents ? (
          <>
            <Btn variant="ghost" onClick={() => setIcalOpen(false)}>Κλείσιμο</Btn>
            <Btn variant="primary" onClick={importIcal} disabled={icalBusy || !icalPropertyId}>{icalBusy ? 'Εισαγωγή…' : 'Εισαγωγή κρατήσεων'}</Btn>
          </>
        ) : undefined}>
      {/* Ήταν τέσσερις γραμμές κειμένου πριν από το πρώτο πεδίο, και οι τρεις
          εξηγούσαν πράγματα που φαίνονται μόνα τους μόλις γίνει η εισαγωγή.
          Έμεινε το ένα που πρέπει να ξέρεις ΠΡΙΝ: τι δεν θα έρθει. */}
      <InfoBanner tone="info">Το iCal φέρνει μόνο ημερομηνίες, χωρίς όνομα επισκέπτη ή ποσό.</InfoBanner>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 14 }}>
        <CustomSelect label="Ακίνητο" value={icalPropertyId} onChange={setIcalPropertyId} options={props.map(p => ({ value: p.id, label: p.name }))} placeholder="Επίλεξε ακίνητο" />
        <CustomSelect label="Κανάλι" value={icalChannel} onChange={v => setIcalChannel(v as 'airbnb' | 'booking' | 'other')} options={[{ value: 'airbnb', label: 'Airbnb' }, { value: 'booking', label: 'Booking' }, { value: 'other', label: 'Άλλο' }]} />
      </div>

      {/* Αυτόματος συγχρονισμός μέσω συνδέσμου (server-side, χωρίς CORS)
          ΓΙΑΤΙ ΤΥΛΙΓΜΑ ΚΑΙ ΟΧΙ ΕΠΙΠΕΔΑ ΑΔΕΛΦΙΑ: το σώμα του Modal είναι flex
          στήλη με gap 20. Μια επικεφαλίδα με δικό της περιθώριο 18 από πάνω
          γινόταν 38 εικονοστοιχεία, και τα 10 από κάτω γίνονταν 30 — δηλαδή η
          ετικέτα καθόταν πιο κοντά στην προηγούμενη ενότητα παρά στα δικά της
          πεδία. Κάθε ενότητα είναι ΕΝΑ παιδί: το gap χωρίζει ενότητες, το
          εσωτερικό gap 12 χωρίζει πεδία. */}
      <div>
        {secHead('Αυτόματος συγχρονισμός', 0)}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TextInput label="Σύνδεσμος iCal" value={icalUrl} onChange={setIcalUrl} placeholder="https://www.airbnb.com/calendar/ical/....ics" />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Btn variant="secondary" onClick={fetchIcalFromUrl} disabled={icalBusy || !icalUrl.trim()}>{icalBusy ? 'Ανάκτηση…' : 'Ανάκτηση και προεπισκόπηση'}</Btn>
            <Btn variant="primary" onClick={saveIcalFeed} disabled={icalBusy || !icalUrl.trim() || !icalPropertyId}>Αποθήκευση και αυτόματος συγχρονισμός</Btn>
          </div>

          {/* Αποθηκευμένοι σύνδεσμοι (ανά επιλεγμένο ακίνητο) */}
          {icalPropertyId && icalFeeds.filter(f => f.property_id === icalPropertyId).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {icalFeeds.filter(f => f.property_id === icalPropertyId).map(f => (
                <div key={f.id} style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: 14, padding: 12, boxShadow: 'var(--highlight-inset), var(--elev-1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{f.channel === 'airbnb' ? 'Airbnb' : f.channel === 'booking' ? 'Booking' : 'Άλλο'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.url}</div>
                      <div style={{ fontSize: 11, color: f.last_status?.startsWith('error') ? 'var(--negative)' : 'var(--text-secondary)', marginTop: 4 }}>
                        {f.last_synced_at ? `Τελευταίος συγχρονισμός: ${fd(f.last_synced_at)}${f.last_status ? ` · ${f.last_status}` : ''}` : 'Δεν έχει συγχρονιστεί ακόμη'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => syncIcalNow(f.property_id)} disabled={icalBusy} style={{ ...msgLink, cursor: 'pointer', fontFamily: T.font.sans }}>Συγχρονισμός τώρα</button>
                      <button onClick={() => delIcalFeed(f)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 12, fontFamily: T.font.sans, padding: 0 }}>Αφαίρεση</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Χειροκίνητη εισαγωγή με επικόλληση. Ίδια δομή ενότητας με την από
          πάνω: η επικεφαλίδα δεν είναι αδελφός του gap του Modal. */}
      <div>
        {secHead('Χειροκίνητη επικόλληση', 0)}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Textarea label="Περιεχόμενο .ics" value={icalText} onChange={setIcalText} rows={5} placeholder="BEGIN:VCALENDAR ..." />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Btn variant="secondary" onClick={parseIcalInput} disabled={icalBusy}>Ανάλυση επικόλλησης</Btn>
            {icalEvents && <Toggle on={icalIncludeBlocked} onChange={setIcalIncludeBlocked} label="Και μπλοκαρίσματα ημερομηνιών" labelOff="Μόνο κρατήσεις" />}
          </div>
          {icalMsg && <div style={{ fontSize: 12, color: icalMsg.error ? 'var(--negative)' : 'var(--text-secondary)', lineHeight: 1.5 }}>{icalMsg.text}</div>}
          {/* Η προεπισκόπηση υπολογίζεται ΜΟΝΟ με ανοιχτό το παράθυρο: το
              `icalEvents` δεν καθαρίζεται στο κλείσιμο, οπότε χωρίς τον έλεγχο
              `icalOpen` το `icalToStayDrafts` ξανάτρεχε σε κάθε απόδοση της
              καρτέλας — το παράθυρο δεν αποπροσαρτάται πια, μόνο κρύβεται. */}
          {icalOpen && icalEvents && (() => {
            const drafts = icalToStayDrafts(icalEvents, { propertyId: icalPropertyId || 'x', channel: icalChannel });
            const bookings = drafts.filter(d => !d.blocked);
            const blocks = drafts.filter(d => d.blocked);
            const toImport = icalIncludeBlocked ? drafts : bookings;
            const nights = toImport.reduce((s, d) => s + d.nights, 0);
            return (
              <div style={{ background: 'var(--bg-base)', boxShadow: 'var(--well-inset)', borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 10, marginBottom: 12 }}>
                  {statTile('Κρατήσεις', String(bookings.length))}
                  {statTile('Μπλοκαρίσματα', String(blocks.length))}
                  {statTile('Νύχτες προς εισαγωγή', String(nights))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                  {toImport.slice(0, 40).map((d, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, color: 'var(--text-secondary)', padding: '6px 10px', background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: 8 }}>
                      <span>{fd(d.check_in)} έως {fd(d.check_out)}</span>
                      <span style={{ color: 'var(--text-tertiary)' }}>{d.nights} νύχτες{d.blocked ? ' · μπλοκάρισμα' : ''}</span>
                    </div>
                  ))}
                  {toImport.length > 40 && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', padding: 4 }}>και άλλες {toImport.length - 40}…</div>}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
      </Modal>

      {/* ── Φόρμα νέου/επεξεργασίας πελάτη ───────────────────────────────────
          Το τέταρτο χειρόγραφο κέλυφος, με μία ακόμη παράβαση: τα αρχικά του
          ονόματος τυπώνονταν σε μέγεθος 15, που ΔΕΝ υπάρχει στην κλίμακα
          (…13, 14, 16…). Το κουτί του εικονιδίου το δίνει τώρα το Modal και τα
          αρχικά κάθονται στο 14. */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} width={680}
        title={editing ? (form.full_name.trim() || 'Επεξεργασία πελάτη') : 'Νέα καταχώρηση'}
        ariaLabel="Στοιχεία επισκέπτη"
        subtitle={editing ? 'Επεξεργασία στοιχείων επισκέπτη' : 'Νέος επισκέπτης'}
        icon={<span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.02em', fontFamily: T.font.sans }}>{initials}</span>}
        footer={<>
          <Btn variant="ghost" onClick={() => setModalOpen(false)}>Ακύρωση</Btn>
          <Btn variant="primary" onClick={save} disabled={saving || !form.full_name.trim()}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Btn>
        </>}>
      {/* Τέσσερα πεδία. Δεν ζητάμε ΑΦΜ, ταυτότητα, διεύθυνση, εθνικότητα
          ή «πηγή γνωριμίας» από κάποιον που θα μείνει τρεις νύχτες: είναι
          δεδομένα προσωπικού χαρακτήρα που δεν προκαλούσαν καμία ενέργεια. */}
      <div>
        {secHead('Στοιχεία επικοινωνίας', 0)}
        <div style={fGrid}>
          <div style={{ gridColumn: '1 / -1' }}><TextInput label="Ονοματεπώνυμο *" value={form.full_name} onChange={v => setForm(f => ({ ...f, full_name: v }))} /></div>
          <TextInput label="Τηλέφωνο" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
          <TextInput label="Ηλεκτρονικό ταχυδρομείο" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} type="email" />
        </div>
      </div>

      {/* Η «μαύρη λίστα» έγινε αυτό: ιδιωτική σημείωση, ΧΩΡΙΣ ετικέτα
          κατηγορίας. Ο διακόπτης `do_not_rent` κατηγοριοποιούσε πρόσωπο
          με νομικό βάρος (GDPR) και τύπωνε «Προσοχή» δίπλα σε όνομα. */}
      <Textarea label="Ιδιωτική σημείωση" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} rows={3} placeholder="Ό,τι θέλεις να θυμάσαι για αυτή τη φιλοξενία. Δική σου σημείωση, χωρίς κατηγοριοποίηση." />
      </Modal>
    </div>
  );
}
