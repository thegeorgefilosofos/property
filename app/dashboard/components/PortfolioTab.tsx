'use client';

// ═══════════════════════════════════════════════════════════════════════════
// PortfolioTab — συγκεντρωτική εικόνα ΟΛΩΝ των ακινήτων, για επαγγελματίες
// διαχειριστές με πολλά ακίνητα. Έσοδα / δαπάνες / καθαρό / πληρότητα /
// εκκρεμότητες ανά ακίνητο, με ένα κλικ στην πλήρη Επισκόπηση του καθενός.
// Καμία εφεύρεση: μόνο πραγματικά δεδομένα που έχει καταχωρήσει ο χρήστης.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as propertyStore from '@/lib/data/properties';
import * as billStore from '@/lib/data/bills';
import * as rentStore from '@/lib/data/rent';
import * as checklist from '@/lib/data/checklist';
import * as expenses from '@/lib/data/expenses'
import * as tenantStore from '@/lib/data/tenants'
import { CustomSelect } from './UIComponents';
import { T, PageTitle, KPIGrid, Badge, Btn, ExportButton, EmptyState, InfoBanner, SecHdr, SkeletonKPIs, Skeleton, fe, fn, fp, ABSENT_SHORT, Modal, TT } from '@/components/Theme';
import { resolveRent } from '@/lib/billing/propertyFacts';
import { statusLabel, type StatusRow } from '@/lib/property/status';
import { declarableGross, declarableGrossOrTotal } from '@/lib/clients/stayAmounts';
import { yearOccupancy } from '@/lib/clients/reports';
import { athensToday, daysUntil } from '@/lib/core/time';
import { mergeLedger, ledgerTotal, ledgerUnpaid } from '@/lib/expenses/ledger';
import { portfolioReturns } from '@/lib/market/portfolio';
import { downloadTableXlsx } from './exportCsv';
import { useReportBranding } from '@/lib/reportBranding';
// Ο κατάλογος κατηγοριών/προτεραιοτήτων ζει σε ΜΙΑ πηγή. Εδώ ήταν γραμμένος
// δεύτερη φορά με άλλες ετικέτες («Short-term / Airbnb» στα αγγλικά, «Νομικά /
// ΑΑΔΕ» αντί «Νομικά και ΑΑΔΕ») και χωρίς δύο κατηγορίες (Ανακαίνιση, Αγορά
// ακινήτου): εργασία γραμμένη από τις Εκκρεμότητες δεν είχε αντίστοιχη επιλογή εδώ.
import { TASK_CATEGORIES, TASK_PRIORITIES } from '@/lib/checklist/taxonomy';
// Τα σχήματα των γραμμών βγαίνουν από το παραγόμενο σχήμα της βάσης, όχι από
// αντίγραφα στο χέρι: μετονομασία στήλης σπάει τη μεταγλώττιση εδώ, όχι την οθόνη.
import type { ClientStaysRow, BillsRow, ExpensesRow, TenantsRow, ChecklistItemsRow, RentPaymentsRow, UserPropertiesRow, ClientsRow } from '@/lib/supabase/tables';
import { issueDocument } from '@/lib/documents/issue';
import { generateReportPdf, pEur, pSigned, type PdfReportModel, type PdfSection } from '@/lib/pdf/pdfReport';
import { ShieldCheck, Building2 } from 'lucide-react';
import { notifyOk, notifyError } from '@/components/Toast';
import { failed, MSG } from '@/lib/core/dbError';

interface PropLite { id: string; name: string; prop_type: string | null; address: string | null; target_rent: number | null; value: number | null; }
/** Δόση ενοικίου όπως την καταχωρεί ο ιδιοκτήτης — `paid` = εισπράχθηκε. */
type RentPay = Pick<RentPaymentsRow, 'property_id' | 'amount' | 'paid' | 'period_month'>;
interface Props { properties: PropLite[]; userId: string; onSelectProperty: (id: string) => void; }

const eur = fe;
// Ο υπότιτλος γράφεται ΜΙΑ φορά: εμφανίζεται σε δύο καταστάσεις (φόρτωση, καμία
// καταχώρηση) και όταν υπάρχουν ακίνητα τον αντικαθιστά η μέτρηση.
const SUB = 'Όλα τα ακίνητα στην ίδια σειρά: έσοδα, δαπάνες και απόδοση, το ένα δίπλα στο άλλο';
type Mode = 'short' | 'long' | 'vacant';

interface Row {
  id: string; name: string; typeLabel: string; mode: Mode;
  /** Η κατάσταση ΟΠΩΣ ΤΗ ΔΗΛΩΣΕ ο ιδιοκτήτης, όχι όπως τη μαντεύουν τα δεδομένα. */
  statusLabel: string;
  revenue: number; expenses: number; net: number;
  /** Το `revenue` δεν είναι βεβαιότητα: ενοίκιο × μήνες (μακροχρόνια) ή
   *  διαμονές με απροσδιόριστη βάση ποσού (βραχυχρόνια). */
  revenueEstimated: boolean;
  /** Πόσες διαμονές του έτους έχουν απροσδιόριστο ποσό (0 στη μακροχρόνια). */
  staysUnresolved: number;
  /** Δεδουλευμένα μισθώματα ως σήμερα, από τις καταχωρημένες δόσεις (0 αν δεν υπάρχουν). */
  rentExpected: number;
  occupancy: number | null; nights: number; pending: number;
  /** Ο ΠΑΡΟΝΟΜΑΣΤΗΣ της πληρότητας, ώστε το ποσοστό να μπορεί να εξηγηθεί. */
  availableDays: number;
  /** Πόσα ΕΥΡΩ οφείλονται — το πλήθος μόνο του δεν λέει αν χρωστάς 60 € ή 1.800 €. */
  owed: number;
  value: number; annualRevenue: number; annualExpenses: number;
}

type SortKey = 'name' | 'revenue' | 'net' | 'occupancy' | 'pending';

export default function PortfolioTab({ properties, userId, onSelectProperty }: Props) {
  const supabase = createClient();
  const branding = useReportBranding(userId);
  // Σταθερό «τώρα» ανά mount, ώστε τα useMemo να μην ξαναϋπολογίζονται σε κάθε render.
  // ΤΟ «ΤΩΡΑ» ΚΛΕΙΔΩΝΕΙ ΣΤΗΝ ΠΡΟΣΑΡΤΗΣΗ. Ήταν `useMemo(() => Date.now(), [])`,
  // που δεν εγγυάται μοναδική εκτέλεση: η React επιτρέπεται να πετάξει το memo
  // και να το ξαναϋπολογίσει, οπότε η ώρα άλλαζε στη μέση της απόδοσης. Το
  // `useState` με αρχικοποιητή συνάρτησης τρέχει ΜΙΑ φορά, εγγυημένα.
  const [nowMs] = useState(() => Date.now());
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  // Χρονιά και μήνας ΑΠΟ ΤΗΝ ΩΡΑ ΕΛΛΑΔΑΣ. Πριν βγαίναν από το ρολόι του
  // περιηγητή: ο ιδιοκτήτης που άνοιγε το χαρτοφυλάκιο από αλλού (ή τα
  // μεσάνυχτα της Πρωτοχρονιάς) έβλεπε άλλη χρήση από αυτή που θα δήλωνε.
  const today = useMemo(() => athensToday(now), [now]);
  const year = Number(today.slice(0, 4));
  const monthsElapsed = Number(today.slice(5, 7));
  const daysElapsed = Math.max(1, 1 - (daysUntil(`${year}-01-01`, now) ?? 0));

  // ── ΤΑ ΣΧΗΜΑΤΑ ΤΩΝ ΓΡΑΜΜΩΝ, ΟΠΩΣ ΑΚΡΙΒΩΣ ΤΑ ΖΗΤΑ ΤΟ ΕΡΩΤΗΜΑ ────────────────
  // Ήταν `any[]`, δηλαδή οι στήλες ήταν γραμμένες ΜΙΑ φορά στο `select(...)` και
  // ο μεταγλωττιστής δεν τις έβλεπε πουθενά αλλού: ένα λάθος όνομα πεδίου
  // παρακάτω («nightlyRate» αντί «nightly_rate») θα έδινε αθόρυβα `undefined`,
  // δηλαδή μηδέν έσοδα σε ολόκληρο χαρτοφυλάκιο, χωρίς κανένα σφάλμα.
  // Ύστερα ήταν αντιγραμμένα στο χέρι — σωστά, αλλά ξένα προς τη βάση: αν
  // μετονομαζόταν στήλη, το αντίγραφο έμενε «σωστό» και το λάθος έβγαινε στην
  // οθόνη. Τώρα κόβονται από το παραγόμενο σχήμα με `Pick`, οπότε το όνομα κάθε
  // στήλης ελέγχεται μία φορά, στη μεταγλώττιση.
  type StayRow = Pick<ClientStaysRow, 'property_id' | 'check_in' | 'check_out' | 'total' | 'nights' | 'nightly_rate' | 'gross_guest_paid' | 'platform_fee' | 'climate_levy' | 'amount_basis'>;
  type BillRow = Pick<BillsRow, 'id' | 'name' | 'amount' | 'paid' | 'paid_at' | 'created_at' | 'due_date' | 'category' | 'recurring' | 'property_id'>;
  type ExpRow = Pick<ExpensesRow, 'id' | 'bill_id' | 'amount' | 'date' | 'description' | 'category' | 'paid' | 'expense_group' | 'is_recurring' | 'store_vendor' | 'property_id'>;
  type TenantRow = Pick<TenantsRow, 'property_id' | 'monthly_rent'>;
  type ChkRow = Pick<ChecklistItemsRow, 'property_id' | 'status' | 'priority' | 'due_date'>;
  type PropOwnerRow = Pick<UserPropertiesRow, 'id' | 'client_id'>;
  type ClientRow = Pick<ClientsRow, 'id' | 'full_name'>;

  const [stays, setStays] = useState<StayRow[]>([]);
  const [bills, setBills] = useState<BillRow[]>([]);
  const [exp, setExp] = useState<ExpRow[]>([]);
  // Ο τρέχων μισθωτής ΑΝΑ ΑΚΙΝΗΤΟ, όπως τον ορίζει το στρώμα. Εδώ κρατιόταν
  // ολόκληρη λίστα και κρατιόταν «ο πρώτος κάθε ακινήτου» — δηλαδή ο μισθωτής
  // που ενημερώθηκε τελευταίος, που δεν είναι ο ίδιος με αυτόν που μένει εκεί.
  const [rentByTenant, setRentByTenant] = useState<Map<string, TenantRow>>(new Map());
  const [rentPays, setRentPays] = useState<RentPay[]>([]);
  const [chk, setChk] = useState<ChkRow[]>([]);
  const [propOwners, setPropOwners] = useState<PropOwnerRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>('net');
  const [asc, setAsc] = useState(false);

  // Μαζικές ενέργειες σε επιλεγμένα ακίνητα
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulk, setShowBulk] = useState(false);
  const [bulkDesc, setBulkDesc] = useState('');
  const [bulkCat, setBulkCat] = useState('maintenance');
  const [bulkPriority, setBulkPriority] = useState('normal');
  const [bulkSaving, setBulkSaving] = useState(false);
  // ── Η ΕΣΤΙΑΣΗ ΣΤΗΝ ΠΕΡΙΓΡΑΦΗ, ΠΙΣΩ ───────────────────────────────────────
  // Το χειρόγραφο παράθυρο άνοιγε με τον δρομέα μέσα στο πεδίο («autoFocus»).
  // Μέσα στο <Modal> το `autoFocus` δεν κάνει τίποτα: το πλαίσιο εστιάζει τον
  // εαυτό του σε effect, που τρέχει ΜΕΤΑ το autoFocus του React, και την παίρνει
  // πίσω. Έτσι το παράθυρο άνοιγε με τον δρομέα πουθενά και ο χρήστης έπρεπε να
  // πατήσει στο πεδίο πριν γράψει. Ως effect του ΓΟΝΕΑ τρέχει μετά τα effects
  // του παιδιού <Modal>, οπότε κερδίζει την εστίαση αντί να τη χάνει.
  // Καταστάσεις ιδιοκτήτη
  const [showStatements, setShowStatements] = useState(false);
  const [stmtOwner, setStmtOwner] = useState('');
  const [genOfficial, setGenOfficial] = useState(false);

  const load = useCallback(async () => {
    const [{ data: st }, bl, ex, tn, ci, po, { data: cl }, rp] = await Promise.all([
      // Τα πεδία ανάλυσης ποσού ΔΕΝ είναι προαιρετικά εδώ: χωρίς αυτά το
      // declarableGrossOrTotal δεν έχει τι να διαβάσει και υποχωρεί στο ωμό
      // `total` για ΚΑΘΕ γραμμή — δηλαδή σιωπηλά ξαναγυρίζει το payout.
      supabase.from('client_stays').select('property_id,check_in,check_out,total,nights,nightly_rate,gross_guest_paid,platform_fee,climate_levy,amount_basis').eq('user_id', userId),
      billStore.ofUser<BillRow>(supabase, userId, billStore.PORTFOLIO_COLUMNS),
      expenses.ledgerOfUser(supabase, userId, `${year}-01-01`),
      tenantStore.currentByProperty<TenantRow & { property_id: string }>(supabase, userId, 'monthly_rent'),
      checklist.openOfUser<ChkRow>(supabase, userId, `property_id,${checklist.AGENDA_COLUMNS}`),
      propertyStore.list<{ id: string; client_id: string | null }>(supabase, userId, { columns: 'id,client_id' }),
      supabase.from('clients').select('id,full_name').eq('user_id', userId),
      // Οι ΚΑΤΑΓΕΓΡΑΜΜΕΝΕΣ δόσεις ενοικίου της χρήσης — από εδώ βγαίνει το έσοδο
      // της μακροχρόνιας, ίδια πηγή με ReportBuilder/OwnerSplit/Λογιστική.
      rentStore.ofUser<RentPay>(supabase, userId, 'property_id,amount,paid,period_month', { year }),
    ]);
    setStays((st || []) as StayRow[]); setBills(bl); setExp((ex || []) as ExpRow[]); setRentByTenant(tn); setChk((ci || []) as ChkRow[]); setPropOwners((po || []) as PropOwnerRow[]); setClients((cl || []) as ClientRow[]); setRentPays(rp); setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, year]);

  useEffect(() => {
    setLoading(true); load();
    const ch = supabase.channel(`portfolio_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_stays' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_items' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rent_payments' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, load]);

  const rows: Row[] = useMemo(() => {
    // Πιο πρόσφατο ενοίκιο ανά ακίνητο (η λίστα tenants έρχεται φθίνουσα κατά updated_at).
    const rentByProp = new Map<string, number>();
    // Γραμμή χωρίς ακίνητο δεν ανήκει σε κανένα ακίνητο: αγνοείται αντί να
    // προσγειωθεί σε κλειδί «null». Ο τύπος το έκανε ορατό — με `any` η γραμμή
    // θα έμπαινε στον χάρτη και το ενοίκιό της θα χανόταν σιωπηλά.
    for (const [id, t] of rentByTenant) if (!rentByProp.has(id)) rentByProp.set(id, Number(t.monthly_rent) || 0);

    // Καταγεγραμμένες δόσεις της χρήσης ανά ακίνητο: τι εισπράχθηκε πραγματικά,
    // και τι είχε δεδουλευτεί ως σήμερα (οι δόσεις παράγονται για όλο το έτος).
    const payByProp = new Map<string, { collected: number; dueToDate: number; rows: number }>();
    rentPays.forEach(rp => {
      // Δόση χωρίς ακίνητο δεν ανήκει σε κανένα ακίνητο. Ο τύπος της στήλης το
      // λέει (`property_id` μπορεί να είναι κενό)· πριν καθόταν σε κλειδί «null»
      // που δεν το ζητούσε ποτέ κανείς, δηλαδή αθροιζόταν στο πουθενά.
      const pid = rp.property_id;
      if (!pid) return;
      const acc = payByProp.get(pid) || { collected: 0, dueToDate: 0, rows: 0 };
      const amt = Number(rp.amount) || 0;
      acc.rows += 1;
      if (rp.paid) acc.collected += amt;
      if ((Number(rp.period_month) || 0) <= monthsElapsed) acc.dueToDate += amt;
      payByProp.set(pid, acc);
    });

    return properties.map(p => {
      const propStays = stays.filter(s => s.property_id === p.id);
      const staysY = propStays.filter(s => ((s.check_in || s.check_out || '').slice(0, 4)) === String(year));
      // ΤΟ ΧΑΡΤΟΦΥΛΑΚΙΟ ΕΛΕΓΕ ΑΛΛΟ ΝΟΥΜΕΡΟ ΑΠΟ ΤΗ ΦΟΡΟΛΟΓΙΚΗ ΣΥΝΟΨΗ.
      // Εδώ αθροιζόταν το ωμό `client_stays.total` — το πεδίο που ο εισαγωγέας
      // email γεμίζει με PAYOUT — ενώ η «Βραχυχρόνια», το Ε2 και ο
      // φάκελος του λογιστή αθροίζουν ΔΗΛΩΤΕΟ ΑΚΑΘΑΡΙΣΤΟ (τι πλήρωσε ο
      // επισκέπτης − τέλος ανθεκτικότητας). Διαφορά ~15% για το ίδιο ακίνητο,
      // στην ίδια χρονιά, σε δύο οθόνες — και η μία απ' αυτές τυπώνεται σε
      // υπογεγραμμένο PDF με QR. Μία πηγή, η ίδια με το Ε2.
      const hostingY = staysY.reduce((sum, s) => sum + declarableGrossOrTotal(s), 0);
      // Ιστορικές γραμμές χωρίς ανάλυση: το ποσό είναι το ωμό `total` και δεν
      // ξέρουμε αν είναι ακαθάριστο ή payout. Σημαίνεται ως εκτίμηση, όπως
      // ακριβώς και το υποθετικό ενοίκιο της μακροχρόνιας.
      const staysUnresolved = staysY.filter(s => declarableGross(s) == null && declarableGrossOrTotal(s) > 0).length;
      const rent = resolveRent({ tenantRent: rentByProp.get(p.id), targetRent: p.target_rent }).value;
      const pay = payByProp.get(p.id);
      const hasRentRows = (pay?.rows || 0) > 0;
      const hasTenant = (rentByProp.get(p.id) || 0) > 0 || hasRentRows;
      // ΔΥΟ ΔΙΑΦΟΡΕΤΙΚΑ ΠΡΑΓΜΑΤΑ ΜΕ ΕΝΑ ΟΝΟΜΑ. Το `mode` κρίνει ΠΩΣ υπολογίζονται
      // τα έσοδα (διαμονές ή μηνιαίο ενοίκιο) και βγαίνει σωστά από τα δεδομένα.
      // Χρησιμοποιούνταν όμως ΚΑΙ ως η «Κατάσταση» στη στήλη του πίνακα, με δικό
      // του λεξιλόγιο. Αποτέλεσμα: ακίνητο που ο ιδιοκτήτης σήμανε «Ιδιοχρησία»
      // ή «Προς πώληση» εμφανιζόταν «Κενό», και βραχυχρόνιο χωρίς καταχωρημένες
      // διαμονές εμφανιζόταν επίσης «Κενό». Η οθόνη διέψευδε δήλωση που μόλις
      // είχε κάνει ο χρήστης, δύο κλικ πριν.
      const mode: Mode = staysY.length ? 'short' : hasTenant ? 'long' : 'vacant';
      const declaredStatus = statusLabel(p as StatusRow);
      // ΤΑ «ΕΣΟΔΑ ΕΤΟΥΣ» ΤΗΣ ΜΑΚΡΟΧΡΟΝΙΑΣ ΗΤΑΝ ΥΠΟΘΕΣΗ — ΚΑΙ ΕΜΠΑΙΝΑΝ ΣΕ
      // ΥΠΟΓΕΓΡΑΜΜΕΝΟ PDF ΜΕ QR ΕΠΑΛΗΘΕΥΣΗΣ.
      //
      // Πριν, το έσοδο ήταν «ενοίκιο × μήνες που πέρασαν». Το ενοίκιο μάλιστα
      // μπορεί να είναι ο ΣΤΟΧΟΣ του ακινήτου (resolveRent → target), δηλαδή
      // ποσό που δεν συμφωνήθηκε ποτέ με ενοικιαστή, και οι μήνες υπέθεταν ότι
      // πληρώθηκαν όλοι. Αυτό το νούμερο έβγαινε στην «Κατάσταση ιδιοκτήτη» με
      // αριθμό εγγράφου και QR, και ο ιδιοκτήτης το έδινε σε τράπεζα ή λογιστή
      // σαν καταγραφή — ενώ δεν αντιστοιχούσε σε κανένα ευρώ που μπήκε ποτέ στον
      // λογαριασμό του.
      //
      // Τώρα, όταν υπάρχουν καταχωρημένες δόσεις, το έσοδο είναι ΟΣΑ
      // ΕΙΣΠΡΑΧΘΗΚΑΝ — η ίδια πηγή που ήδη δείχνουν οι άλλες αναφορές, ώστε δύο
      // οθόνες να μη λένε άλλο ποσό για το ίδιο ακίνητο. Όταν δεν υπάρχει καμία
      // δόση, κρατάμε την εκτίμηση (αλλιώς η οθόνη θα άδειαζε) αλλά τη
      // ΣΗΜΑΙΝΟΥΜΕ ρητά: στον πίνακα, στο CSV και μέσα στο PDF. Ίδια σειρά
      // προτεραιότητας με το Ε2 (lib/billing/e2.ts, buildE2Row).
      const revenueEstimated = mode === 'short'
        ? staysUnresolved > 0
        : mode === 'long' && !hasRentRows && rent > 0;
      const revenue = mode === 'short' ? hostingY
        : mode === 'long' ? (hasRentRows ? pay!.collected : rent * monthsElapsed)
        : 0;
      const rentExpected = mode === 'long' && hasRentRows ? pay!.dueToDate : 0;
      // ΤΑ ΕΞΟΔΑ ΠΕΡΝΟΥΝ ΑΠΟ ΤΟΝ ΚΟΙΝΟ ΠΥΡΗΝΑ (lib/expenses/ledger.ts).
      //
      // Πριν αθροίζαμε ΜΟΝΟ τον πίνακα `expenses`. Ο απλήρωτος λογαριασμός όμως
      // δεν έχει δαπάνη πίσω του — γεννιέται στην πληρωμή. Άρα το καθαρό, η
      // ετησιοποίηση ΚΑΙ η απόδοση ολόκληρου του χαρτοφυλακίου έβγαιναν
      // αισιόδοξες: έδειχναν τι πλήρωσες, όχι τι σου κοστίζει το ακίνητο.
      // Χωρίς `as never[]`: οι δύο λίστες ταιριάζουν πλέον στα LedgerBill/
      // LedgerExpense από μόνες τους. Το παλιό cast έσβηνε κάθε έλεγχο — αν το
      // ledger ζητούσε αύριο άλλο πεδίο, εδώ δεν θα φαινόταν τίποτα.
      const { entries } = mergeLedger(
        bills.filter(b => b.property_id === p.id),
        exp.filter(e => e.property_id === p.id),
      );
      const ofYear = entries.filter(e => e.date >= `${year}-01-01` && e.date <= `${year}-12-31`);
      const expenses = ledgerTotal(ofYear);
      // ΔΥΟ ΟΡΙΣΜΟΙ ΠΛΗΡΟΤΗΤΑΣ ΓΙΑ ΤΟ ΙΔΙΟ ΑΚΙΝΗΤΟ. Εδώ διαιρούσαμε με τις
      // ημέρες που πέρασαν φέτος· η καρτέλα «Πληρότητα» διαιρεί με τις
      // ΔΙΑΘΕΣΙΜΕΣ ημέρες. Το εποχιακό εξοχικό έβγαινε στο χαρτοφυλάκιο ένα
      // ποσοστό και στην Επισκόπηση άλλο, και ο ιδιοκτήτης δεν είχε τρόπο να
      // ξέρει ποιο ισχύει — ούτε ποιο να πει στον λογιστή ή στον αγοραστή.
      // Ένας ορισμός, ο τεκμηριωμένος, από τη μία πηγή (lib/clients/reports.ts).
      const occ = yearOccupancy(propStays, year);
      const nights = occ.bookedNights;
      const occupancy = mode === 'short' ? occ.pct : null;
      // ΤΟ ΠΛΗΘΟΣ ΔΕΝ ΦΤΑΝΕΙ: «3 εκκρεμή» δεν λέει αν χρωστάς 60 € ή 1.800 €.
      const owedEntries = ledgerUnpaid(ofYear);
      const unpaid = owedEntries.length;
      const owed = ledgerTotal(owedEntries);
      const chkAtt = chk.filter(c => c.property_id === p.id && ((c.due_date && new Date(c.due_date).getTime() < nowMs) || c.priority === 'critical')).length;
      // Ετησιοποίηση (εκτίμηση ρυθμού): μακροχρόνια = ενοίκιο×12· βραχυχρόνια = έσοδα ανά
      // ημέρα × 365· έξοδα ετησιοποιημένα με τους μήνες που πέρασαν (ομαλότερα από τις ημέρες).
      const annualRevenue = mode === 'long' ? rent * 12 : mode === 'short' ? Math.round(revenue * (365 / daysElapsed)) : 0;
      const annualExpenses = Math.round(expenses * (12 / monthsElapsed));
      return {
        id: p.id, name: p.name, typeLabel: PROP_LABEL[p.prop_type || ''] || p.prop_type || 'Ακίνητο', mode, statusLabel: declaredStatus,
        revenue, expenses, net: revenue - expenses, revenueEstimated, staysUnresolved, rentExpected,
        occupancy, nights, availableDays: occ.availableDays, pending: unpaid + chkAtt, owed,
        value: p.value || 0, annualRevenue, annualExpenses,
      };
    });
  }, [properties, stays, bills, exp, rentByTenant, rentPays, chk, year, monthsElapsed, daysElapsed, nowMs]);

  const agg = useMemo(() => portfolioReturns(rows.map(r => ({ value: r.value, annualRevenue: r.annualRevenue, annualExpenses: r.annualExpenses }))), [rows]);

  const sorted = useMemo(() => {
    const dir = asc ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'el') * dir;
      const av = sort === 'occupancy' ? (a.occupancy ?? -1) : a[sort];
      const bv = sort === 'occupancy' ? (b.occupancy ?? -1) : b[sort];
      return (av - bv) * dir;
    });
  }, [rows, sort, asc]);

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalExpenses = rows.reduce((s, r) => s + r.expenses, 0);
  const totalPending = rows.reduce((s, r) => s + r.pending, 0);
  // Πόσα ευρώ οφείλονται σε ΟΛΟ το χαρτοφυλάκιο — το νούμερο που κρίνει τι κάνεις σήμερα.
  const totalOwed = rows.reduce((s, r) => s + r.owed, 0);
  const shortRows = rows.filter(r => r.occupancy != null);
  // Ίδια στρογγυλοποίηση με την πληρότητα της γραμμής: με ένα βραχυχρόνιο
  // ακίνητο, ο «μέσος όρος» έπρεπε να δείχνει ακριβώς ό,τι και η γραμμή του.
  const avgOcc = shortRows.length
    ? Math.round((shortRows.reduce((s, r) => s + (r.occupancy || 0), 0) / shortRows.length) * 10) / 10
    : null;
  // Πόσα ακίνητα δείχνουν εκτίμηση αντί για καταγεγραμμένη είσπραξη.
  const estimatedRows = rows.filter(r => r.revenueEstimated);

  const toggleSort = (key: SortKey) => { if (sort === key) setAsc(a => !a); else { setSort(key); setAsc(key === 'name'); } };

  // Κάθε νούμερο λέει από πού βγήκε — αλλιώς ο ιδιοκτήτης δεν ξέρει τι υπογράφει.
  const revenueTitle = (r: Row): string | undefined =>
    r.mode === 'short'
      ? `Δηλωτέα ακαθάριστα από τις καταχωρημένες διαμονές του έτους: τι πλήρωσαν οι επισκέπτες μείον το τέλος ανθεκτικότητας. Ίδιο νούμερο με την «Βραχυχρόνια» και με το Ε2.${r.staysUnresolved > 0 ? ` ${r.staysUnresolved} ${r.staysUnresolved === 1 ? 'διαμονή έχει' : 'διαμονές έχουν'} απροσδιόριστο ποσό (ιστορικές καταχωρήσεις), οπότε το σύνολο είναι εκτίμηση.` : ''}`
      : r.revenueEstimated
        ? `Εκτίμηση, όχι είσπραξη: μηνιαίο ενοίκιο × ${monthsElapsed} ${monthsElapsed === 1 ? 'μήνας' : 'μήνες'} που πέρασαν. Δεν υπάρχει καμία καταχωρημένη δόση ενοικίου για το ${year}.`
        : r.mode === 'long'
          ? (r.rentExpected > 0
            ? `Εισπράχθηκαν ${fe(r.revenue)} από ${fe(r.rentExpected)} δεδουλευμένα ως σήμερα, βάσει των δόσεων που έχεις καταχωρήσει.`
            : 'Από τις δόσεις ενοικίου που έχεις καταχωρήσει και έχουν σημανθεί ως εισπραγμένες.')
          : undefined;

  const occupancyTitle = (r: Row): string | undefined =>
    r.occupancy == null ? undefined
      : `${r.nights} νύχτες σε ${r.availableDays} διαθέσιμες ημέρες· ο ίδιος υπολογισμός με την «Πληρότητα» της Επισκόπησης. Διαθέσιμες = οι μήνες από την πρώτη ως την τελευταία κράτηση του έτους.`;

  // ── Μαζική επιλογή ──────────────────────────────────────────────────────
  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleSelect = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.id)));
  const clearSelection = () => setSelected(new Set());

  // Μία εργασία ανά επιλεγμένο ακίνητο — ίδια πεδία με το insert του TabChecklist.
  const createBulkTask = async () => {
    const desc = bulkDesc.trim();
    if (!desc || selected.size === 0) return;
    setBulkSaving(true);
    const inserts = [...selected].map(pid => ({
      property_id: pid, user_id: userId, description: desc, category: bulkCat,
      priority: bulkPriority, recurring: 'none', status: 'pending', completed: false,
      note: null as string | null, estimated_cost: 0, actual_cost: 0, sort_order: 0,
    }));
    const { error } = await checklist.addMany(supabase, inserts);
    setBulkSaving(false);
    if (error) { notifyError('Κάτι πήγε στραβά, δοκίμασε ξανά'); return; }
    const n = inserts.length;
    setShowBulk(false); setBulkDesc(''); clearSelection();
    notifyOk(`Η εργασία προστέθηκε σε ${n} ${n === 1 ? 'ακίνητο' : 'ακίνητα'}`);
  };

  // ── Καταστάσεις ιδιοκτήτη ───────────────────────────────────────────────
  const ownerByProp = useMemo(() => {
    const m = new Map<string, string | null>();
    propOwners.forEach(p => m.set(p.id, p.client_id));
    return m;
  }, [propOwners]);
  const clientName = useMemo(() => {
    const m = new Map<string, string>();
    clients.forEach(c => m.set(c.id, c.full_name));
    return m;
  }, [clients]);

  const NO_OWNER = '__none__';
  interface OwnerGroup { id: string; name: string; rows: Row[]; revenue: number; expenses: number; net: number; }
  const owners: OwnerGroup[] = useMemo(() => {
    const groups = new Map<string, OwnerGroup>();
    rows.forEach(r => {
      const cid = ownerByProp.get(r.id) || null;
      const key = cid || NO_OWNER;
      const name = cid ? (clientName.get(cid) || 'Ιδιοκτήτης') : 'Χωρίς ιδιοκτήτη';
      const g = groups.get(key) || { id: key, name, rows: [], revenue: 0, expenses: 0, net: 0 };
      g.rows.push(r); g.revenue += r.revenue; g.expenses += r.expenses; g.net += r.net;
      groups.set(key, g);
    });
    return [...groups.values()].sort((a, b) =>
      a.id === NO_OWNER ? 1 : b.id === NO_OWNER ? -1 : a.name.localeCompare(b.name, 'el'));
  }, [rows, ownerByProp, clientName]);

  const stmt = useMemo(() => owners.find(o => o.id === stmtOwner) || owners[0], [owners, stmtOwner]);

  const openStatements = () => { if (!stmtOwner && owners.length) setStmtOwner(owners[0].id); setShowStatements(true); };

  // Η ΣΗΜΑΝΣΗ ΤΑΞΙΔΕΥΕΙ ΜΑΖΙ ΜΕ ΤΟ ΝΟΥΜΕΡΟ. Ό,τι φεύγει από την οθόνη —
  // εκτύπωση, CSV, υπογεγραμμένο PDF — λέει ποια ποσά είναι εκτίμηση και γιατί.
  // Διαφορετικά η προειδοποίηση μένει σε μια οθόνη που ο παραλήπτης (τράπεζα,
  // λογιστής) δεν είδε ποτέ, και κρίνει με βάση ποσό που δεν εισπράχθηκε.
  // ΔΥΟ ΔΙΑΦΟΡΕΤΙΚΟΙ ΛΟΓΟΙ, ΔΥΟ ΔΙΑΦΟΡΕΤΙΚΕΣ ΠΡΟΤΑΣΕΙΣ. Το σημείωμα έλεγε σε
  // κάθε περίπτωση «δεν υπάρχει καμία καταχωρημένη δόση ενοικίου» — ψέμα για
  // βραχυχρόνιο ακίνητο, που δεν έχει δόσεις ενοικίου εξ ορισμού. Σε κείμενο
  // που τυπώνεται σε υπογεγραμμένο έγγραφο, μια ανακριβής εξήγηση είναι
  // χειρότερη από καμία: ο λογιστής ψάχνει δόσεις που δεν υπήρξαν ποτέ.
  const estimateNote = (rs: Row[]): string | null => {
    const longEst = rs.filter(r => r.revenueEstimated && r.mode === 'long');
    const shortEst = rs.filter(r => r.revenueEstimated && r.mode === 'short');
    const parts: string[] = [];
    if (longEst.length) parts.push(`Εκτίμηση, όχι είσπραξη: για ${longEst.map(r => r.name).join(', ')} δεν υπάρχει καμία καταχωρημένη δόση ενοικίου για το ${year}. Τα ποσά αυτά προκύπτουν από το μηνιαίο ενοίκιο επί τους μήνες που πέρασαν και ΔΕΝ αντιστοιχούν σε καταγεγραμμένη είσπραξη.`);
    if (shortEst.length) parts.push(`Απροσδιόριστη βάση ποσού: για ${shortEst.map(r => `${r.name} (${r.staysUnresolved})`).join(', ')} υπάρχουν διαμονές καταχωρημένες πριν το app ξεχωρίσει τα ακαθάριστα από το payout, οπότε δεν είναι βέβαιο αν το ποσό είναι τι πλήρωσε ο επισκέπτης ή τι εισπράχθηκε.`);
    if (!parts.length) return null;
    return `${parts.join(' ')} Τα ποσά αυτά φέρουν την ένδειξη «εκτίμηση».`;
  };

  const exportStatement = () => {
    if (!stmt) return;
    const head = ['Ακίνητο', 'Έσοδα έτους', 'Βάση εσόδων', 'Δαπάνες έτους', 'Καθαρό'];
    // Η γραμμή ΣΥΝΟΛΟ δεν γράφεται εδώ — ο κοινός exporter τη βάζει ως ζωντανό
    // SUM. Γραμμένη και στα δύο σημεία, θα μετριόταν δύο φορές.
    const lines: (string | number)[][] = stmt.rows.map(r => [r.name, r.revenue, revenueBasis(r), r.expenses, r.net]);
    downloadTableXlsx(`Κατάσταση ${stmt.name} ${year}`, {
      title: 'Κατάσταση ιδιοκτήτη', subject: `${stmt.name} · ${year}`, headers: head, rows: lines,
    });
  };

  // Η ΚΑΤΑΣΤΑΣΗ ΙΔΙΟΚΤΗΤΗ ΧΤΙΖΟΤΑΝ ΔΥΟ ΦΟΡΕΣ, ΜΕ ΔΥΟ ΚΟΥΜΠΙΑ ΔΙΠΛΑ-ΔΙΠΛΑ.
  // Το «Εκτύπωση / PDF» έβγαζε HTML στο παράθυρο εκτύπωσης: ίδιος πίνακας, ίδιο
  // σημείωμα εκτίμησης, ίδια δήλωση αποποίησης — αλλά χωρίς αριθμό εγγράφου και
  // χωρίς QR, δηλαδή χαρτί που κανείς δεν μπορεί να επαληθεύσει. Ο ιδιοκτήτης
  // διάλεγε ανάμεσα σε δύο κουμπιά για το ίδιο έγγραφο, με μόνη διαφορά ότι το
  // ένα παρήγαγε κάτι λιγότερο. Έμεινε το επίσημο· τίποτα δεν χάθηκε.
  // Επίσημο true-PDF της κατάστασης ιδιοκτήτη: αληθινό vector PDF με αριθμό
  // εγγράφου και QR επαλήθευσης, καταχωρημένο στο μητρώο (/verify/<id>).
  const officialStatement = async () => {
    if (!stmt || genOfficial) return;
    const isOwner = stmt.id !== NO_OWNER;
    const ownerLabel = isOwner ? stmt.name : 'Χαρτοφυλάκιο ακινήτων';
    const subtitle = `Έσοδα & δαπάνες ${year} · ${stmt.rows.length} ${stmt.rows.length === 1 ? 'ακίνητο' : 'ακίνητα'}`;
    setGenOfficial(true);
    try {
      const note = estimateNote(stmt.rows);
      const sections: PdfSection[] = [
        {
          type: 'table', title: 'Ανάλυση ανά ακίνητο',
          head: ['Ακίνητο', 'Έσοδα', 'Δαπάνες', 'Καθαρό'], align: ['l', 'r', 'r', 'r'],
          rows: stmt.rows.map(r => [r.name, pEur(r.revenue) + (r.revenueEstimated ? ' (εκτίμηση)' : ''), pEur(r.expenses), pSigned(r.net)]),
          result: ['Σύνολο', pEur(stmt.revenue), pEur(stmt.expenses), pSigned(stmt.net)],
        },
      ];
      if (note) sections.push({ type: 'note', title: 'Προέλευση των εσόδων', text: note });
      const issued = await issueDocument(supabase, {
        userId, docType: 'Κατάσταση ιδιοκτήτη',
        subject: ownerLabel,
        period: `Χρήση ${year}`,
        // Το μητρώο κρατά ΚΑΙ πόσα ακίνητα βγήκαν με εκτίμηση: αν κάποιος
        // επαληθεύσει το έγγραφο αργότερα, πρέπει να ξέρει τι ακριβώς υπογράφηκε.
        summary: { properties: stmt.rows.length, netTotal: stmt.net, estimatedRevenue: stmt.rows.filter(r => r.revenueEstimated).length },
      });
      const model: PdfReportModel = {
        branding, docType: 'Κατάσταση ιδιοκτήτη',
        title: isOwner ? stmt.name : 'Κατάσταση ιδιοκτήτη',
        subtitle,
        meta: { id: issued.id, issuedAt: issued.issuedAt, verifyUrl: issued.verifyUrl, note: `Χρήση ${year}` },
        sections,
        disclaimer: 'Η παρούσα κατάσταση έχει ενημερωτικό χαρακτήρα. Δεν αποτελεί επίσημο φορολογικό ή λογιστικό έγγραφο. Επιβεβαίωσε τα ποσά με τον λογιστή σου.',
      };
      await generateReportPdf(model, `Κατάσταση_ιδιοκτήτη_${year}`);
    } catch { notifyError(failed(MSG.pdf)); }
    finally { setGenOfficial(false); }
  };

  const fieldStyle: CSSProperties = { width: '100%', padding: '10px 16px', borderRadius: 6, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: T.font.sans, fontSize: 14, outline: 'none' };

  const exportCsv = () => {
    const head = ['Ακίνητο', 'Τύπος', 'Κατάσταση', 'Έσοδα έτους', 'Βάση εσόδων', 'Δαπάνες έτους', 'Καθαρό', 'Πληρότητα %', 'Διαθέσιμες ημέρες', 'Νύχτες', 'Εκκρεμότητες', 'Οφειλές (€)'];
    const lines: (string | number)[][] = sorted.map(r => [r.name, r.typeLabel, r.statusLabel, r.revenue, revenueBasis(r), r.expenses, r.net, r.occupancy ?? '', r.occupancy != null ? r.availableDays : '', r.nights, r.pending, r.owed]);
    downloadTableXlsx(`Χαρτοφυλάκιο ${year}`, {
      title: 'Χαρτοφυλάκιο', subject: String(year), headers: head, rows: lines,
    });
  };

  if (loading) return (
    <div>
      <PageTitle title="Χαρτοφυλάκιο" sub={SUB} />
      <SkeletonKPIs n={4} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{[0, 1, 2, 3].map(i => <Skeleton key={i} h={54} />)}</div>
    </div>
  );

  if (!properties.length) return (
    <div>
      <PageTitle title="Χαρτοφυλάκιο" sub={SUB} />
      <EmptyState icon={<Building2 size={20} />} title="Κανένα ακίνητο ακόμη" hint="Πρόσθεσε το πρώτο σου ακίνητο για να δεις τη συγκεντρωτική εικόνα εδώ." />
    </div>
  );

  return (
    <div>
      <PageTitle title="Χαρτοφυλάκιο" sub={`${properties.length} ${properties.length === 1 ? 'ακίνητο' : 'ακίνητα'} · έσοδα και εκκρεμότητες ${year}`}
        right={<>
          <Btn variant="ghost" onClick={openStatements}>Καταστάσεις ιδιοκτήτη</Btn>
          <ExportButton onClick={exportCsv} label="Εξαγωγή CSV" />
        </>} />

      {/* ═══ ΤΕΣΣΕΡΑ ΧΡΩΜΑΤΑ ΣΕ ΠΕΝΤΕ ΠΛΑΚΙΔΙΑ ══════════════════════════════
          Τα έσοδα ήταν πράσινα ακόμη και στο μηδέν, το καθαρό κόκκινο, οι
          εκκρεμότητες πορτοκαλί, η ταξινομημένη στήλη μπλε. Σε χαρτοφυλάκιο δύο
          ακινήτων, τέσσερα σημασιολογικά χρώματα σε μία ματιά — και κανένα δεν
          ξεχωρίζει, γιατί όλα φωνάζουν. Η ιεραρχία βγαίνει από μέγεθος, βάρος
          και θέση· το πρόσημο το λέει ήδη το ίδιο το ποσό. */}
      <KPIGrid columns={5} items={[
        { label: 'Ακίνητα', value: String(properties.length) },
        { label: `Έσοδα ${year}`, value: eur(totalRevenue),
          sub: estimatedRows.length ? `${estimatedRows.length} ${estimatedRows.length === 1 ? 'ακίνητο' : 'ακίνητα'} με εκτίμηση` : undefined },
        { label: `Καθαρό ${year}`, value: eur(totalRevenue - totalExpenses), sub: `δαπάνες ${eur(totalExpenses)}` },
        // Πληρότητα χωρίς καμία βραχυχρόνια δεν είναι μηδέν, είναι ερώτημα χωρίς
        // αντικείμενο. Το πλακίδιο δεν εμφανίζεται καθόλου.
        ...(avgOcc != null ? [{ label: 'Μέση πληρότητα', value: fp(avgOcc),
          sub: `${shortRows.length} ${shortRows.length === 1 ? 'βραχυχρόνια' : 'βραχυχρόνια'}` }] : []),
        { label: 'Εκκρεμότητες', value: totalOwed > 0 ? `${totalPending} · ${fe(totalOwed)}` : String(totalPending) },
      ]} />

      {/* Συγκεντρωτική απόδοση χαρτοφυλακίου (σταθμισμένη με την αξία) */}
      {agg.valuedCount > 0 && (
        <div className="card" style={{ marginTop: 12, padding: 16 }}>
          <SecHdr label="Απόδοση χαρτοφυλακίου" sub={`Σε ετήσια βάση (εκτίμηση ρυθμού) · ${agg.valuedCount} από ${agg.count} ${agg.count === 1 ? 'ακίνητο' : 'ακίνητα'} με καταχωρημένη αξία`} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 16, marginTop: 14 }}>
            <PStat label="Αξία χαρτοφυλακίου" value={eur(agg.totalValue)} />
            <PStat label="Ετήσια έσοδα" value={eur(agg.totalRevenue)} />
            <PStat label="Μεικτή απόδοση" value={`${fn(agg.grossYield, 1)}%`} />
            <PStat label="Καθαρή απόδοση" value={`${fn(agg.netYield, 1)}%`} />
          </div>
        </div>
      )}

      {/* Πίνακας ανά ακίνητο, με οριζόντια κύλιση σε στενή οθόνη */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ width: 42, padding: '11px 0 11px 16px' }}>
                  <SelectBox checked={allSelected} indeterminate={selected.size > 0 && !allSelected} onChange={toggleAll} label="Επιλογή όλων" />
                </th>
                <Th label="Ακίνητο" k="name" sort={sort} asc={asc} onSort={toggleSort} align="left" />
                <Th label="Κατάσταση" align="left" />
                <Th label="Έσοδα" k="revenue" sort={sort} asc={asc} onSort={toggleSort} />
                <Th label="Δαπάνες" align="right" />
                <Th label="Καθαρό" k="net" sort={sort} asc={asc} onSort={toggleSort} />
                <Th label="Πληρότητα" k="occupancy" sort={sort} asc={asc} onSort={toggleSort} />
                <Th label="Εκκρεμότητες" k="pending" sort={sort} asc={asc} onSort={toggleSort} />
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.id} onClick={() => onSelectProperty(r.id)} className="portfolio-row"
                  style={{ borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', background: selected.has(r.id) ? 'var(--accent-soft)' : undefined }}>
                  <td style={{ padding: '13px 0 13px 16px' }} onClick={e => e.stopPropagation()}>
                    <SelectBox checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} label={`Επιλογή ${r.name}`} />
                  </td>
                  <td style={{ padding: '13px 14px' }}>
                    <div style={{ fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</div>
                    <div style={{ fontFamily: T.font.sans, fontSize: 11, color: 'var(--text-tertiary)' }}>{r.typeLabel}</div>
                  </td>
                  <td style={{ padding: '13px 14px' }}>
                    {/* Η κατάσταση είναι ΟΝΟΜΑ, όχι κρίση: το «Κενό» δεν είναι
                        χειρότερο από το «Μισθωμένο» σε ένα ακίνητο που μόλις
                        ανακαινίστηκε. Ίδιος ουδέτερος τόνος για όλες. */}
                    <Badge tone="neutral">{r.statusLabel}</Badge>
                  </td>
                  <Num v={eur(r.revenue)} mark={r.revenueEstimated ? 'εκτίμηση' : undefined} title={revenueTitle(r)} />
                  <Num v={eur(r.expenses)} muted />
                  <Num v={eur(r.net)} bold />
                  <td style={{ padding: '13px 14px', textAlign: 'right' }} title={occupancyTitle(r)}>
                    {r.occupancy != null
                      ? <span style={{ fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text-primary)' }}>{fp(r.occupancy)}</span>
                      : <span style={{ fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-tertiary)' }}>{r.mode === 'short' ? ABSENT_SHORT : 'Δεν ισχύει'}</span>}
                  </td>
                  <td style={{ padding: '13px 14px', textAlign: 'right' }}>
                    {r.pending > 0
                      ? (
                        // ΤΟ ΠΛΗΘΟΣ ΚΑΙ ΤΟ ΠΟΣΟ ΜΑΖΙ. Το σκέτο «3» δεν λέει αν το
                        // ακίνητο χρωστά 60 € ή 1.800 € — και αυτή είναι όλη η
                        // διαφορά στο τι θα κάνει ο ιδιοκτήτης σήμερα το πρωί.
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}
                              title={r.owed > 0 ? `${r.pending} εκκρεμή, από τα οποία ${fe(r.owed)} σε απλήρωτους λογαριασμούς` : `${r.pending} εκκρεμή`}>
                          <span style={{ display: 'inline-flex', minWidth: 22, height: 22, borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', fontSize: 12, fontWeight: 700, alignItems: 'center', justifyContent: 'center', padding: '0 7px' }}>{r.pending}</span>
                          {r.owed > 0 && <span style={{ fontFamily: T.font.num, fontSize: 12, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{fe(r.owed)}</span>}
                        </span>
                      )
                      : <span style={{ fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-tertiary)' }}>Καμία</span>}
                  </td>
                  <td style={{ padding: '13px 14px', textAlign: 'right' }}>
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: 10, fontFamily: T.font.sans, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
        {/* Ήταν τέσσερις προτάσεις σε τρεις σειρές, κάτω από πίνακα δύο γραμμών.
            Οι δύο εξηγούσαν ορισμούς που ζουν ήδη ως επεξήγηση πάνω σε κάθε
            κελί, και η τελευταία περιέγραφε ότι μια γραμμή πίνακα ανοίγει. */}
        Όπου δεν υπάρχει καταχωρημένη δόση ενοικίου, το ποσό είναι εκτίμηση και σημειώνεται δίπλα του.
      </div>

      {/* Ήρεμη μπάρα μαζικών ενεργειών (Gmail/Linear style) */}
      {selected.size > 0 && (
        <div style={{ position: 'fixed', bottom: 'var(--float-bottom)', left: '50%', transform: 'translateX(-50%)', zIndex: 'var(--float-z)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 24, boxShadow: 'var(--elev-3)', overflow: 'hidden', minWidth: 'min(480px, calc(100vw - 24px))', maxWidth: 'calc(100vw - 24px)' }}>
          <div style={{ padding: '12px 18px', borderRight: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
            <div style={{ minWidth: 24, height: 26, padding: '0 6px', borderRadius: T.radius.pill, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--accent-text)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{selected.size}</div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', fontFamily: T.font.sans }}>{allSelected ? 'όλα επιλεγμένα' : 'επιλεγμένα'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            {[
              // Όταν είναι όλα επιλεγμένα, το «Καθαρισμός» έκανε ό,τι ακριβώς και
              // το ✕ δεξιά του: δύο κουμπιά για μία ενέργεια, δίπλα-δίπλα. Μένει
              // η επιλογή όλων, που είναι η μόνη που προσθέτει κάτι.
              ...(allSelected ? [] : [{ label: `Επιλογή όλων (${rows.length})`, fn: toggleAll, color: 'var(--text-secondary)', hoverBg: 'var(--bg-surface)' }]),
              { label: 'Νέα εργασία σε επιλεγμένα', fn: () => setShowBulk(true), color: 'var(--accent)', hoverBg: 'var(--accent-soft)' },
            ].map((a, i, arr) => (
              <button key={i} type="button" onClick={a.fn}
                style={{ flex: 1, padding: '12px 6px', border: 'none', borderRight: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: a.color, fontWeight: 600, fontSize: 13, transition: 'background 0.15s', fontFamily: T.font.sans, whiteSpace: 'nowrap' }}
                onMouseEnter={e => e.currentTarget.style.background = a.hoverBg}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                {a.label}
              </button>
            ))}
          </div>
          <button type="button" aria-label="Ακύρωση επιλογής" onClick={clearSelection}
            style={{ padding: '12px 16px', border: 'none', borderLeft: '1px solid var(--border-subtle)', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 18, lineHeight: 1, flexShrink: 0, transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>✕</button>
        </div>
      )}

      {/* Modal: νέα εργασία σε επιλεγμένα ακίνητα */}
      {/* Ίδια ιστορία: ωμή σκιά, ακτίνα ως αριθμός, δικός του τίτλος σε <h3>
          με μέγεθος και βάρος γραμμένα στο χέρι. Το Modal δίνει τα τρία. */}
      <Modal open={showBulk} onClose={() => !bulkSaving && setShowBulk(false)} width={460}
        title="Νέα εργασία σε επιλεγμένα"
        subtitle={`Δημιουργείται μία ίδια εργασία σε ${selected.size} ${selected.size === 1 ? 'ακίνητο' : 'ακίνητα'}.`}
        footer={<>
          <Btn variant="secondary" onClick={() => setShowBulk(false)} disabled={bulkSaving}>Ακύρωση</Btn>
          <Btn variant="primary" onClick={createBulkTask} disabled={bulkSaving || !bulkDesc.trim()}>{bulkSaving ? 'Δημιουργία…' : 'Δημιουργία'}</Btn>
        </>}>
        {/* Η ΕΤΙΚΕΤΑ ΜΑΖΙ ΜΕ ΤΟ ΠΕΔΙΟ ΤΗΣ, ΣΕ ΕΝΑ ΚΟΥΤΙ. Το σώμα του <Modal>
            είναι flex column με gap 20: αφημένα χωριστά, η «Περιγραφή» και το
            πεδίο της χώριζαν κατά 20 (+6 δικά τους) και η ετικέτα φαινόταν να
            ανήκει στον υπότιτλο από πάνω, όχι στο πεδίο από κάτω. */}
        <div>
          <label style={{ ...TT.label, display: 'block', marginBottom: 6 }}>Περιγραφή</label>
          <input autoFocus value={bulkDesc} onChange={e => setBulkDesc(e.target.value)} placeholder="Παράδειγμα: Έλεγχος κλιματιστικών" style={fieldStyle} />
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ ...TT.label, display: 'block', marginBottom: 6 }}>Κατηγορία</label>
            <CustomSelect value={bulkCat} onChange={setBulkCat}
              options={TASK_CATEGORIES.map(c => ({ value: c.id, label: c.label }))} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ ...TT.label, display: 'block', marginBottom: 6 }}>Προτεραιότητα</label>
            <CustomSelect value={bulkPriority} onChange={setBulkPriority}
              options={TASK_PRIORITIES.map(p => ({ value: p.value, label: p.label }))} />
          </div>
        </div>
      </Modal>

      {/* Modal: κατάσταση ιδιοκτήτη */}
      {/* ΤΟ ΤΕΛΕΥΤΑΙΟ ΧΕΙΡΟΓΡΑΦΟ ΠΑΡΑΘΥΡΟ ΤΟΥ ΧΑΡΤΟΦΥΛΑΚΙΟΥ.
          Είχε ωμή σκιά `0 24px 64px rgba(0,0,0,0.45)` αντί για token, ακτίνα 18
          γραμμένη ως αριθμός, και δική του κεφαλίδα με δεύτερο «×» — τρίτο
          σχέδιο κεφαλίδας στην ίδια εφαρμογή. Και δεν άκουγε Escape ούτε
          κλείδωνε την κύλιση του φόντου: ο πίνακας από πίσω κυλούσε ενώ ο
          χρήστης διάβαζε την κατάσταση.

          ΟΙ ΔΥΟ ΕΞΑΓΩΓΕΣ ΠΗΓΑΝ ΣΤΟ ΥΠΟΣΕΛΙΔΟ. Ήταν στο τέλος του σώματος, που
          τώρα κυλά μέσα στο <Modal>: με δέκα ακίνητα ο πίνακας γεμίζει το ύψος
          και τα δύο κουμπιά — ο ΛΟΓΟΣ που ανοίγει κανείς αυτό το παράθυρο —
          έμεναν κάτω από το ορατό, χωρίς τίποτα να τα δείχνει. Το υποσέλιδο δεν
          κυλά. Η προειδοποίηση της εκτίμησης μένει στο σώμα, δηλαδή ΠΑΝΩ από τα
          κουμπιά όπως και πριν: διαβάζεται πριν φύγει το αρχείο. */}
      <Modal open={showStatements} onClose={() => setShowStatements(false)} width={640}
        title="Καταστάσεις ιδιοκτήτη" subtitle={`Έσοδα, δαπάνες και καθαρό ανά ακίνητο · ${year}`}
        footer={stmt ? <>
          <Btn variant="secondary" onClick={officialStatement} disabled={genOfficial}><ShieldCheck size={14} />{genOfficial ? 'Δημιουργία…' : 'Επίσημο PDF'}</Btn>
          {/* Λεγόταν κι αυτό «Εξαγωγή CSV», όπως το κουμπί της κεφαλίδας
              τριάντα εικονοστοιχεία πιο πάνω — δύο αρχεία με το ίδιο όνομα
              και άλλο περιεχόμενο. Εδώ είναι η κατάσταση του ιδιοκτήτη. */}
          <ExportButton onClick={exportStatement} label="Κατάσταση σε CSV" />
        </> : undefined}>
        {/* Τα κενά τα δίνει το σώμα του <Modal> (flex column, gap 20). Τα
            χειρόγραφα marginBottom/marginTop που έμειναν από το παλιό κέλυφος
            πρόσθεταν 18 και 14 ΠΑΝΩ σε αυτό. */}
        <CustomSelect value={stmt?.id || ''} onChange={setStmtOwner}
          options={owners.map(o => ({ value: o.id, label: `${o.name} · ${o.rows.length} ${o.rows.length === 1 ? 'ακίνητο' : 'ακίνητα'}` }))} />

        {stmt && (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 440 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <Th label="Ακίνητο" align="left" />
                    <Th label="Έσοδα" align="right" />
                    <Th label="Δαπάνες" align="right" />
                    <Th label="Καθαρό" align="right" />
                  </tr>
                </thead>
                <tbody>
                  {stmt.rows.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '11px 14px', fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</td>
                      <Num v={eur(r.revenue)} mark={r.revenueEstimated ? 'εκτίμηση' : undefined} title={revenueTitle(r)} />
                      <Num v={eur(r.expenses)} muted />
                      <Num v={eur(r.net)} bold />
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid var(--border-subtle)' }}>
                    <td style={{ padding: '13px 14px', fontFamily: T.font.sans, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Σύνολο</td>
                    <Num v={eur(stmt.revenue)} bold />
                    <Num v={eur(stmt.expenses)} muted bold />
                    <Num v={eur(stmt.net)} bold />
                  </tr>
                </tbody>
              </table>
            </div>
            {/* Η προειδοποίηση ΠΡΙΝ το κουμπί, όχι μετά την αποστολή. */}
            {estimateNote(stmt.rows) && (
              <InfoBanner tone="warning">{estimateNote(stmt.rows)}</InfoBanner>
            )}
          </>
        )}
      </Modal>

      <style>{`.portfolio-row:hover{background:var(--bg-hover)}`}</style>
    </div>
  );
}

// Ήσυχο checkbox επιλογής (ίδιο ύφος με το TabChecklist)
function SelectBox({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: () => void; label: string }) {
  const on = checked || indeterminate;
  return (
    <button type="button" aria-label={label} onClick={e => { e.stopPropagation(); onChange(); }}
      style={{ width: 18, height: 18, borderRadius: 6, border: '2px solid ' + (on ? 'var(--accent)' : 'var(--border-default)'), background: on ? 'var(--accent)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s', flexShrink: 0 }}>
      {checked
        ? <svg width="10" height="10" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="var(--accent-text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        : indeterminate ? <div style={{ width: 8, height: 2, borderRadius: 3, background: 'var(--accent-text)' }} /> : null}
    </button>
  );
}

function Th({ label, k, sort, asc, onSort, align = 'right' }: { label: string; k?: SortKey; sort?: SortKey; asc?: boolean; onSort?: (k: SortKey) => void; align?: 'left' | 'right' }) {
  const active = k && sort === k;
  return (
    <th onClick={k && onSort ? () => onSort(k) : undefined}
      style={{ padding: '11px 14px', textAlign: align, fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: active ? 'var(--accent)' : 'var(--text-tertiary)', cursor: k ? 'pointer' : 'default', whiteSpace: 'nowrap', userSelect: 'none' }}>
      {/* Ο ΔΕΙΚΤΗΣ ΤΑΞΙΝΟΜΗΣΗΣ ΕΙΝΑΙ ΣΧΗΜΑ, ΟΧΙ ΧΑΡΑΚΤΗΡΑΣ. Ήταν «↑» και «↓»
          μέσα στο κείμενο της επικεφαλίδας: άλλαζε το πλάτος της στήλης όταν
          εμφανιζόταν, δεν κληρονομούσε το βάρος της γραμματοσειράς, και σε
          κείμενο μοιάζει με σημείωση αντί για χειριστήριο. */}
      {label}
      {active && (
        <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden
          style={{ marginLeft: 5, verticalAlign: 'middle', transform: asc ? 'rotate(180deg)' : 'none' }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      )}
    </th>
  );
}

function PStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)' }}>{label}</div>
      <div style={{ fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Num({ v, muted, bold, tone, mark, title }: { v: string; muted?: boolean; bold?: boolean; tone?: string; mark?: string; title?: string }) {
  // ΜΙΑ ΓΡΑΜΜΑΤΟΣΕΙΡΑ ΓΙΑ ΤΟΥΣ ΑΡΙΘΜΟΥΣ. Ο πίνακας έγραφε τα ποσά σε monospace
  // ενώ τα πλακίδια από πάνω τα έγραφαν στην αριθμητική του θέματος: το ίδιο
  // «0,00 €» φαινόταν δύο διαφορετικά πράγματα σε απόσταση εκατό εικονοστοιχείων.
  return (
    <td title={title} style={{ padding: '13px 14px', textAlign: 'right', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: bold ? 700 : 400, color: tone || (muted ? 'var(--text-secondary)' : 'var(--text-primary)') }}>
      {v}
      {/* Η σήμανση της εκτίμησης μπαίνει ΔΙΠΛΑ ΣΤΟ ΠΟΣΟ: σε υποσημείωση δεν τη διαβάζει κανείς. */}
      {mark && <span style={{ marginLeft: 5, fontFamily: T.font.sans, fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)' }}>{mark}</span>}
    </td>
  );
}

// Το MODE_LABEL έφυγε: ήταν τρίτο λεξιλόγιο για την κατάσταση ακινήτου, δίπλα
// στο lib/property/status.ts (η μία πηγή) και σε έναν ακόμη πίνακα στη Σύγκριση.
// Το `mode` μένει, αλλά μόνο για ό,τι είναι: πώς υπολογίζονται τα έσοδα.

/** Από πού βγήκε το ποσό των εσόδων — ταξιδεύει μαζί του σε κάθε εξαγωγή. */
const revenueBasis = (r: Row): string =>
  r.mode === 'short'
    ? (r.staysUnresolved > 0 ? `διαμονές, ${r.staysUnresolved} με απροσδιόριστο ποσό` : 'διαμονές (δηλωτέα ακαθάριστα)')
    : r.mode !== 'long' ? ''
    : r.revenueEstimated ? 'εκτίμηση (ενοίκιο × μήνες)'
    : 'εισπράξεις';

const PROP_LABEL: Record<string, string> = {
  apartment: 'Διαμέρισμα', house: 'Μονοκατοικία', maisonette: 'Μεζονέτα', studio: 'Στούντιο',
  shop: 'Κατάστημα', office: 'Γραφείο', warehouse: 'Αποθήκη', land: 'Οικόπεδο', parking: 'Θέση στάθμευσης', other: 'Άλλο',
};
