import type React from 'react';
// ═══════════════════════════════════════════════════════════════════════════
// Ο ΠΑΓΚΟΣ ΚΙΝΗΤΟΥ — ΤΑ ΙΔΙΑ COMPONENTS, ΜΕΣΑ ΣΤΟ ΠΡΑΓΜΑΤΙΚΟ ΚΕΛΥΦΟΣ
// ─────────────────────────────────────────────────────────────────────────
// Διαφορές από το harness.tsx (και γιατί):
//  1. Φορτώνει ΟΛΟΚΛΗΡΟ το app/globals.css, όχι μόνο τις μεταβλητές του :root.
//     Χωρίς αυτό δεν υπάρχουν .card, .app-content, .kpi-row, ούτε κανένα
//     media query — δηλαδή η διάταξη που μετριέται δεν είναι η διάταξη που
//     βλέπει ο χρήστης.
//  2. Στήνει .app-shell > .app-main > .app-content, όπως το app/dashboard/page.tsx.
//  3. Δηλώνει `window.__respond`, όχι `window.__fake`. Το harness.tsx έγραφε
//     το δεύτερο, αλλά ο διπλός που πράγματι χρησιμοποιεί ο κώδικας φτιάχνεται
//     μέσα στο fakeClient.ts και ρωτά ΜΟΝΟ το `window.__respond`.
// ═══════════════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Responder } from '../e2e-money/fakeDb';
import { portfolio } from './data';
import { writeStatus } from '@/lib/property/status';
import PortfolioTab from '@/app/dashboard/components/PortfolioTab';
import CashHero from '@/app/dashboard/components/CashHero';
import RentReceived from '@/app/dashboard/components/RentReceived';
import InboundInbox from '@/app/dashboard/components/InboundInbox';
import { CustomSelect } from '@/app/dashboard/components/UIComponents';
import ExpenseLedger from '@/app/dashboard/components/ExpenseLedger';
import TabChecklist from '@/app/dashboard/components/TabChecklist';
// Η ΣΥΓΚΡΙΣΗ ΜΠΗΚΕ ΟΤΑΝ Ο ΠΙΝΑΚΑΣ ΤΗΣ ΕΚΑΝΕ ΤΗΝ ΟΘΟΝΗ ΝΑ ΠΑΕΙ ΠΕΡΑ ΔΩΘΕ. Η
// ταυτότητα κάθε στήλης («Βραχυχρόνια μίσθωση · 42 τ.μ. · 120.000,00 € · …»)
// είναι μία μακριά συμβολοσειρά χωρίς όριο πλάτους: τραβούσε τη στήλη όσο
// χρειαζόταν και ο πίνακας ξεπερνούσε κατά πολύ το πλάτος της οθόνης.
import TabComparison from '@/app/dashboard/components/TabComparison';
// ΟΙ ΟΘΟΝΕΣ ΠΟΥ ΦΩΤΟΓΡΑΦΙΣΕ Ο ΧΡΗΣΤΗΣ ΣΕ ΤΑΜΠΛΕΤΑ. Ο πάγκος έδειχνε εννιά
// οθόνες και καμία από αυτές: ο έλεγχος διάταξης έβγαινε πράσινος για κώδικα
// που κανείς δεν κοίταζε. Δάνειο, τιμολόγηση βραχυχρόνιας, λογαριασμοί, επαφές.
import TabLoanCalculator from '@/app/dashboard/components/TabLoanCalculator';
import { MARKET_FALLBACK } from '@/app/dashboard/components/TabLoanData';
import TabPricing from '@/app/dashboard/components/TabPricing';
import TabContacts from '@/app/dashboard/components/TabContacts';
import TabBills from '@/app/dashboard/components/TabBills';
// Η ΠΡΩΤΗ ΟΘΟΝΗ ΠΟΥ ΒΛΕΠΕΙ ΑΝΘΡΩΠΟΣ ΠΟΥ ΜΟΛΙΣ ΕΓΡΑΨΕ ΛΟΓΑΡΙΑΣΜΟ· ήταν επίσης η
// μόνη που κανένας έλεγχος δεν κοίταζε ποτέ: ζει μέσα σε παράθυρο που ανοίγει
// με πάτημα, οπότε καμία σκηνή του πάγκου δεν την αποδίδει.
import AddPropertyWizard from '@/app/dashboard/components/AddPropertyWizard';
// ΤΑ ΔΥΟ ΠΑΡΑΘΥΡΑ ΠΟΥ ΜΙΚΡΥΝΑΝ ΧΩΡΙΣ ΝΑ ΜΕΤΡΗΘΟΥΝ. Η φόρμα ενοικιαστή ήταν 860
// και η γρήγορη προσθήκη 820· η κλίμακα των τεσσάρων τα έφερε και τα δύο στα
// 760. Καμία σκηνή δεν τα απέδιδε, οπότε η αλλαγή ήταν απόφαση χωρίς μέτρηση.
import TabTenant from '@/app/dashboard/components/TabTenant';
import DocumentScan from '@/app/dashboard/components/DocumentScan';
// Η ΑΠΟΔΟΣΗ ΤΗΣ ΕΠΕΝΔΥΣΗΣ: πλακίδια, ιστορικό διάγραμμα, σύγκριση με
// εναλλακτικές και το πεδίο «Ετήσια ανατίμηση ακινήτου», όπου ο χρήστης
// φωτογράφησε κομμένο το «6,8» σε ταμπλέτα.
import TabRentROI from '@/app/dashboard/components/TabRentROI';
// ═══ ΟΙ ΤΕΣΣΕΡΙΣ ΜΕΓΑΛΥΤΕΡΕΣ ΚΑΡΤΕΛΕΣ ΠΟΥ ΔΕΝ ΕΙΧΕ ΔΕΙ ΠΟΤΕ ΚΑΜΙΑ ΜΕΤΡΗΣΗ ═══
//
// Ο πάγκος είχε δεκαεπτά σκηνές και ο σαρωτής έβγαινε πράσινος σε δώδεκα
// πλάτη. Το «πράσινο» όμως αφορούσε ΜΟΝΟ ό,τι αποδιδόταν εδώ. Εξω έμεναν οι
// τέσσερις μεγαλύτερες καρτέλες της εφαρμογής, 7.333 γραμμές διεπαφής:
//
//   TabCalendar    2.239 γραμμές   ημερολόγιο, πλέγμα μήνα, λίστα ημέρας
//   TabClients     1.838 γραμμές   πελατολόγιο, κάρτες, διαμονές
//   TabAccounting  1.805 γραμμές   λογιστική, πίνακες, φορολογικά
//   TabDocuments   1.451 γραμμές   έγγραφα, φάκελοι, προεπισκόπηση
//
// Ενα ημερολόγιο με πλέγμα επτά στηλών και μια λογιστική με πίνακες είναι
// ακριβώς οι δύο μορφές που σπάνε πρώτες σε στενή οθόνη. Το ότι δεν είχαν
// μετρηθεί ΔΕΝ σήμαινε ότι ήταν εντάξει· σήμαινε ότι δεν το ξέραμε.
import TabAccounting from '@/app/dashboard/components/TabAccounting';
import TabCalendar from '@/app/dashboard/components/TabCalendar';
import TabClients from '@/app/dashboard/components/TabClients';
import TabDocuments from '@/app/dashboard/components/TabDocuments';
import PropertySwitcher from '@/app/dashboard/components/PropertySwitcher';
import { T, Modal, Btn, PageTitle, InfoBanner, fieldRow } from '@/components/Theme';
import { createClient } from '@/lib/supabase/client';
import type { CashLine, CashPosition } from '@/lib/home/cash';

declare global {
  interface Window { __t: Record<string, number>; __rows: () => number }
}

const params = new URLSearchParams(location.search);
const n = Number(params.get('n') || 200);
const which = params.get('c') || 'portfolio';
const bench = portfolio(n);

// Τα εισερχόμενα δεν βγαίνουν από το `portfolio()`: το InboundInbox διαβάζει
// τον δικό του πίνακα και χωρίς γραμμές δεν αποδίδει τίποτα (by design).
const inboundRows = Array.from({ length: 6 }, (_, i) => ({
  id: `m${i}`, from_address: `logariasmoi${i}@deh.gr`,
  subject: `Λογαριασμός ρεύματος Ιανουαρίου ${2026} · παροχή 1234567890`,
  vendor: 'ΔΕΗ', amount: i === 2 ? null : 84.5 + i * 13,
  due_date: '2026-09-10', issue_date: '2026-08-20',
  category: 'electricity', expense_group: 'utilities', attachments: 1,
}));

// ΤΑ ΦΙΛΤΡΑ ΤΗΡΟΥΝΤΑΙ. Ο διπλός του perf-bench επιστρέφει ΟΛΕΣ τις γραμμές του
// πίνακα, ό,τι κι αν ζήτησε η οθόνη — σωστό για το Χαρτοφυλάκιο, που όντως
// διαβάζει όλα τα ακίνητα, αλλά ψεύτικο για κάθε οθόνη ΕΝΟΣ ακινήτου: το
// Καθολικό Δαπανών θα έπαιρνε 2.000 λογαριασμούς αντί για 10 και η μέτρηση
// ύψους θα μετρούσε τον διπλό, όχι την εφαρμογή.
const applyEq = (rows: unknown[], filters: Array<[string, string, unknown]>) => {
  let out = rows;
  for (const [m, col, val] of filters) {
    if (m !== 'eq') continue;
    out = out.filter(r => {
      const v = (r as Record<string, unknown>)[col];
      return v === undefined || String(v) === String(val);
    });
  }
  return out;
};

const respond: Responder = (call) => {
  if (call.op !== 'select') return { data: null, error: null };
  if (call.table === 'inbound_messages') return { data: inboundRows, error: null };
  const rows = bench.rows[call.table];
  if (!rows) return { data: call.single ? null : [], error: null };
  const kept = which === 'portfolio' ? rows : applyEq(rows, call.filters);
  return { data: call.single ? (kept[0] ?? null) : kept, error: null };
};
window.__respond = respond;
window.__t = {};
window.__rows = () => document.querySelectorAll('tbody tr').length;

const line = (i: number): CashLine => ({
  label: `Ακίνητο ${i + 1} · Ενοίκιο Ιανουαρίου 2026`,
  amount: 400 + i * 50,
  due: '2026-01-05',
  daysLeft: -20 - i,
  rent: { id: `r${i}`, year: 2026, month: 1, propertyId: `p${i}`, tenantId: `t${i}` },
});
const lines = Array.from({ length: 6 }, (_, i) => line(i));

const cash: CashPosition = {
  owedToMe: { total: 4350, count: 6, overdue: 4350, overdueCount: 6, lines },
  owedByMe: { total: 1287.4, count: 4, overdue: 620, overdueCount: 2, lines: lines.slice(0, 4).map(l => ({ ...l, rent: null, label: 'ΕΝΦΙΑ δόση Ιανουαρίου' })) },
};

// ΤΑ ΔΥΟ ΑΚΙΝΗΤΑ ΤΗΣ ΣΥΓΚΡΙΣΗΣ ΕΙΝΑΙ ΤΟΥ ΙΔΙΟΥ ΤΥΠΟΥ, ΑΛΛΙΩΣ Η ΟΘΟΝΗ ΔΕΙΧΝΕΙ
// ΚΕΝΗ ΚΑΤΑΣΤΑΣΗ. Ο πάγκος έδινε το χαρτοφυλάκιο όπως έρχεται και η καρτέλα
// απαντούσε, σωστά, «κανένα ζευγάρι ακινήτων ίδιου τύπου»: ο έλεγχος πλάτους
// θα μετρούσε άδεια οθόνη. Τα νούμερα είναι αυτά της αναφοράς του χρήστη.
const comparePair = [
  { id: 'c1', name: 'Στούντιο Κουκάκι', prop_type: 'apartment', sqm: 42, value: 120000, ...writeStatus('rent_short') },
  { id: 'c2', name: 'Διαμέρισμα Παγκράτι', prop_type: 'apartment', sqm: 78, value: 150000, ...writeStatus('rent_short') },
];

const OPTS = Array.from({ length: 14 }, (_, i) => ({ value: `v${i}`, label: `Κατηγορία δαπάνης πολύ μακρύ όνομα ${i + 1}` }));

function ModalDemo() {
  const [open, setOpen] = useState(true);
  const [v, setV] = useState('v0');
  return (
    <div>
      <PageTitle title="Δοκιμή παραθύρου" sub="Modal στα 375" right={<Btn variant="primary" onClick={() => setOpen(true)}>Άνοιγμα</Btn>} />
      <Modal open={open} onClose={() => setOpen(false)} title="Καταστάσεις ιδιοκτήτη"
        subtitle="Ανά ακίνητο, για την περίοδο που θα επιλέξεις"
        footer={<><Btn variant="ghost" onClick={() => setOpen(false)}>Άκυρο</Btn><Btn variant="primary" onClick={() => {}}>Έκδοση</Btn></>}
        footerInfo="Η κατάσταση εκδίδεται σε PDF">
        <InfoBanner tone="warning">Ένα μήνυμα που εξηγεί τι θα γίνει, αρκετά μακρύ ώστε να τυλιχτεί σε στενή οθόνη κινητού.</InfoBanner>
        <div {...fieldRow(170)}>
          <CustomSelect label="Κατηγορία" value={v} onChange={setV} options={OPTS} />
          <CustomSelect label="Δεύτερη κατηγορία" value={v} onChange={setV} options={OPTS} />
        </div>
        {Array.from({ length: 24 }, (_, i) => (
          <p key={i} style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
            Γραμμή {i + 1}: κείμενο γεμίσματος ώστε το περιεχόμενο του παραθύρου να ξεπερνά το ύψος της οθόνης και να φανεί ποιος κυλά.
          </p>
        ))}
      </Modal>
    </div>
  );
}

function SelectDemo() {
  const [v, setV] = useState('v0');
  return (
    <div>
      {/* Ο ΥΠΟΤΙΤΛΟΣ ΕΛΕΓΕ ΠΛΑΤΟΣ ΠΟΥ ΔΕΝ ΙΣΧΥΕΙ. Ηταν καρφωμένο «στα 375» και ο
          πάγκος τρέχει σε δώδεκα πλάτη: σε κάθε ένα από τα άλλα έντεκα, η οθόνη
          έγραφε λάθος νούμερο. Και ήταν το μοναδικό λατινικό κείμενο της
          σκηνής, δηλαδή έμοιαζε με προϊόν χωρίς να είναι. */}
      <PageTitle title="Επιλογείς" sub="Τρεις επιλογείς με μακρύ λεκτικό, για να φανεί πού κόβεται" />
      <div className="card">
        <div {...fieldRow(160)}>
          <CustomSelect label="Κατηγορία" value={v} onChange={setV} options={OPTS} />
          <CustomSelect label="Ακίνητο" value={v} onChange={setV} options={OPTS} />
          <CustomSelect label="Τρόπος" value={v} onChange={setV} options={OPTS} />
        </div>
      </div>
    </div>
  );
}

// ΤΟ «lens» ΗΤΑΝ ΚΑΡΦΩΜΕΝΟ ΣΤΟ ΚΕΝΟ ΚΑΙ Ο ΔΙΑΚΟΠΤΗΣ ΤΟΥ ΑΝΕΝΕΡΓΟΣ. Ο πάγκος
// έδινε `lens=""` και `onLens={() => {}}`, δηλαδή ΚΑΝΕΝΑ από τα πέντε πάνελ του
// δανείου δεν αποδιδόταν ποτέ: ούτε το γράφημα απόσβεσης, ούτε η σύγκριση
// τόκων, ούτε η αντοχή δόσης, ούτε ο πίνακας. Πέντε οθόνες που ο χρήστης
// βλέπει και κανένας έλεγχος διάταξης δεν τις είχε δει.
function LoanScene() {
  const [lens, setLens] = useState('amort');
  return <TabLoanCalculator propertyId="p0" userId="u1" market={MARKET_FALLBACK}
    onSaveLoan={async () => {}} onSaveToCalendar={async () => {}} onSaveToExpenses={async () => {}}
    lens={lens} onLens={setLens} />;
}

const supabase = createClient();

const VIEWS: Record<string, () => React.ReactElement> = {
  portfolio: () => <PortfolioTab properties={bench.properties} userId="u1" onSelectProperty={() => {}} />,
  cash: () => <CashHero cash={cash} showIncome onNavigate={() => {}} onRecordRent={() => {}} />,
  rent: () => <RentReceived onClose={() => {}} lines={lines} supabase={supabase} propertyId={null} tenantId={null} leaseViaBank today="2026-08-23" onSaved={() => {}} />,
  inbox: () => <InboundInbox propertyId="p0" userId="u1" propertyName="Ακίνητο 1" onFiled={() => {}} />,
  ledger: () => <ExpenseLedger propertyId="p0" userId="u1" />,
  checklist: () => <TabChecklist propertyId="p0" userId="u1" />,
  compare: () => <TabComparison properties={comparePair as never} userId="u1" />,
  loan: () => <LoanScene />,
  pricing: () => <TabPricing propertyId="p0" userId="u1" propertyName="Στούντιο Κουκάκι" propertySqm={42} />,
  bills: () => <TabBills propertyId="p0" userId="u1" />,
  contacts: () => <TabContacts propertyId="p0" userId="u1" />,
  wizard: () => <AddPropertyWizard userId="u1" onClose={() => {}} onSaved={() => {}} />,
  roi: () => <TabRentROI propertyId="p0" userId="u1" propertyValue={185000} />,
  tenant: () => <TabTenant propertyId="p0" userId="u1" onStartHandover={() => {}} />,
  scan: () => (
    <Modal open onClose={() => {}} size="lg" title="Σάρωση εγγράφου">
      <DocumentScan propertyId="p0" userId="u1" onSaved={async () => {}} onBusyChange={() => {}} />
    </Modal>
  ),
  accounting: () => <TabAccounting propertyId="p0" userId="u1" />,
  calendar: () => <TabCalendar propertyId="p0" userId="u1" openTasks={3} />,
  clients: () => <TabClients userId="u1" />,
  documents: () => <TabDocuments propertyId="p0" userId="u1" />,
  modal: () => <ModalDemo />,
  select: () => <SelectDemo />,
};

// Το κέλυφος, όπως ακριβώς το γράφει το app/dashboard/page.tsx.
//
// ΚΑΙ Η ΜΠΑΡΑ ΜΕΣΑ, ΓΙΑΤΙ ΕΚΕΙ ΗΤΑΝ ΤΟ ΣΦΑΛΜΑ. Ο πάγκος έστηνε μόνο
// «.app-shell > .app-main > .app-content», οπότε η μπάρα δεν αποδιδόταν ποτέ
// και κανένας έλεγχος δεν την είδε. Ο χρήστης την είδε: με δεύτερη γραμμή
// (κατοικία, τετραγωνικά, διεύθυνση) το περιεχόμενό της ξεχείλιζε κάτω από το
// καρφωμένο ύψος των 64 και το κυλιόμενο περιεχόμενο περνούσε από κάτω του.
// Οι δύο γραμμές γράφονται εδώ με το ΙΔΙΟ σχήμα που γράφει η σελίδα.
// ═══════════════════════════════════════════════════════════════════════════
// Η ΜΠΑΡΑ ΕΙΝΑΙ Η ΠΡΑΓΜΑΤΙΚΗ ΜΠΑΡΑ, ΟΧΙ ΣΚΙΤΣΟ ΤΗΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΗΤΑΝ, ΚΑΙ ΤΙ ΚΟΣΤΙΣΕ. Η μπάρα γραφόταν εδώ ως ωμό `innerHTML`, με ένα
// `<button style="font-size:16px;font-weight:700">` στη θέση του επιλογέα
// ακινήτου. Το πραγματικό `PropertySwitcher` όμως φοράει την κλάση
// `.topbar-switch-name`, που έχει `white-space: nowrap` και αποσιωπητικά.
//
// Αποτέλεσμα: στα 360 ο πάγκος έδειχνε τον τίτλο «Διαμέρισμα Λεωφόρος
// Αλεξάνδρας 145, τρίτος όροφος, Αμπελόκηποι» σπασμένο σε ΠΕΝΤΕ σειρές και τη
// μπάρα να πιάνει 420 από τα 800 εικονοστοιχεία της οθόνης. Στην εφαρμογή ο
// ίδιος τίτλος κόβεται σε ΜΙΑ σειρά. Ο πάγκος δεν έδειχνε σφάλμα του προϊόντος·
// έδειχνε σφάλμα του πάγκου· θα με είχε στείλει να «διορθώσω» κάτι που
// δούλευε.
//
// ΤΩΡΑ Η ΜΠΑΡΑ ΑΠΟΔΙΔΕΤΑΙ ΜΕ REACT, ΜΕ ΤΟ ΙΔΙΟ COMPONENT. Οτι αλλάζει στο
// PropertySwitcher αλλάζει και εδώ, χωρίς να το θυμηθεί κανείς.
const BENCH_PROPS = [
  { id: 'p0', name: 'Διαμέρισμα Λεωφόρος Αλεξάνδρας 145, τρίτος όροφος, Αμπελόκηποι', status: 'Βραχυχρόνια μίσθωση', address: 'Λεωφόρος Ανδρέα Συγγρού 123, Νέα Σμύρνη' },
  { id: 'p1', name: 'Στούντιο Κουκάκι', status: 'Μακροχρόνια μίσθωση', address: 'Δράκου 12, Κουκάκι' },
];

function BenchTopbar() {
  const [id, setId] = useState('p0');
  return (
    <header className="app-topbar">
      <button className="nav-toggle" aria-label="Μενού">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, rowGap: 8, minWidth: 0 }}>
          <PropertySwitcher items={BENCH_PROPS} activeId={id} onSelect={setId} onAdd={() => {}} canAdd />
          <div style={{ position: 'relative', minWidth: 0 }}>
            <button className="topbar-status" style={{ display: 'flex', alignItems: 'center', gap: 7, height: T.h.sm, padding: '0 10px 0 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'transparent', cursor: 'pointer', fontFamily: T.font.sans, fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Βραχυχρόνια μίσθωση</span>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.65, marginLeft: 1, flexShrink: 0 }}><path d="m6 9 6 6 6-6" /></svg>
            </button>
          </div>
        </div>
        <div className="app-topbar-sub" style={{ fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, letterSpacing: '0.4px' }}>
          Κατοικία · 42 τ.μ. · Λεωφόρος Ανδρέα Συγγρού 123, Νέα Σμύρνη · ΤΚ 11742
        </div>
      </div>
      {/* ΑΝΤΙΓΡΑΦΟ ΤΟΥ ΠΡΑΓΜΑΤΙΚΟΥ ΚΟΥΜΠΙΟΥ, ΟΧΙ ΔΙΚΗ ΜΟΥ ΕΚΔΟΧΗ. Ηταν πλατιά
          πιλούλα με τη λέξη «Αναζήτηση» μέσα, δηλαδή 200 από τα 360 της μπάρας:
          ο πάγκος έδειχνε το όνομα του ακινήτου κομμένο στα 124 και το πρόβλημα
          ΔΕΝ ΥΠΗΡΧΕ στην εφαρμογή, όπου η λέξη δεν γράφεται ποτέ και το κουμπί
          είναι φακός με τη συντόμευση δίπλα, κρυμμένη σε κινητό. Ενας πάγκος
          που γράφει δικό του σήμα μετράει τον εαυτό του. */}
      <button aria-label="Αναζήτηση" className="topbar-search" style={{ display: 'flex', alignItems: 'center', gap: 8, height: T.h.md, padding: '0 10px 0 12px', borderRadius: T.radius.modal, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', marginRight: 4, flexShrink: 0 }}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <span className="desktop-only" style={{ fontSize: 11, fontFamily: T.font.mono, color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '1px 5px' }}>Ctrl K</span>
      </button>
    </header>
  );
}

const shell = document.createElement('div');
shell.className = 'app-shell';
shell.innerHTML = '<main class="app-main"><div class="bench-topbar"></div><div class="app-content"></div></main>';
document.body.appendChild(shell);
createRoot(shell.querySelector('.bench-topbar') as HTMLElement).render(<BenchTopbar />);
const host = shell.querySelector('.app-content') as HTMLElement;

// ═══ ΑΓΝΩΣΤΗ ΣΚΗΝΗ: ΦΩΝΑΖΕΙ, ΔΕΝ ΓΥΡΝΑΕΙ ΣΙΩΠΗΛΑ ΣΤΟ ΧΑΡΤΟΦΥΛΑΚΙΟ ═══════════
//
// Εγραφε `VIEWS[which] || VIEWS.portfolio`. Μια σκηνή γραμμένη λάθος στον
// σαρωτή, ή γραμμένη εκεί πριν προστεθεί εδώ, απέδιδε ΤΟ ΧΑΡΤΟΦΥΛΑΚΙΟ: ο
// σαρωτής μετρούσε την ίδια οθόνη ξανά και ξανά και έβγαινε πράσινος για
// καρτέλες που δεν είχε ανοίξει ποτέ. Το ίδιο αρχείο κρατάει ήδη σημείωση για
// σκηνή που έβγαινε ΚΕΝΗ και έδινε «πράσινο» επειδή σε κενή σελίδα δεν υπάρχει
// τίποτα κομμένο. Η σιωπηλή επιστροφή είναι η ίδια παγίδα με άλλο ρούχο.
const View: () => React.ReactElement = VIEWS[which] || (() => (
  <div data-bench-unknown={which} style={{ padding: 24, fontFamily: T.font.sans, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
    ΑΓΝΩΣΤΗ ΣΚΗΝΗ «{which}». Πρόσθεσέ την στο VIEWS του scripts/perf-bench/mobile.tsx.
  </div>
));
window.__t.start = performance.now();
createRoot(host).render(<View />);
requestAnimationFrame(() => { window.__t.firstPaint = performance.now(); });
