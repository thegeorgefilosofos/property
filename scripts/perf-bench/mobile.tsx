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
import { Modal, Btn, PageTitle, InfoBanner, fieldRow } from '@/components/Theme';
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
      <PageTitle title="Επιλογείς" sub="CustomSelect στα 375" />
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

const supabase = createClient();

const VIEWS: Record<string, () => React.ReactElement> = {
  portfolio: () => <PortfolioTab properties={bench.properties} userId="u1" onSelectProperty={() => {}} />,
  cash: () => <CashHero cash={cash} showIncome onNavigate={() => {}} onRecordRent={() => {}} />,
  rent: () => <RentReceived onClose={() => {}} lines={lines} supabase={supabase} propertyId={null} tenantId={null} leaseViaBank today="2026-08-23" onSaved={() => {}} />,
  inbox: () => <InboundInbox propertyId="p0" userId="u1" propertyName="Ακίνητο 1" onFiled={() => {}} />,
  ledger: () => <ExpenseLedger propertyId="p0" userId="u1" />,
  checklist: () => <TabChecklist propertyId="p0" userId="u1" />,
  compare: () => <TabComparison properties={comparePair as never} userId="u1" />,
  loan: () => <TabLoanCalculator propertyId="p0" userId="u1" market={MARKET_FALLBACK}
    onSaveLoan={async () => {}} onSaveToCalendar={async () => {}} onSaveToExpenses={async () => {}}
    lens="" onLens={() => {}} />,
  pricing: () => <TabPricing propertyId="p0" userId="u1" propertyName="Στούντιο Κουκάκι" propertySqm={42} />,
  bills: () => <TabBills propertyId="p0" userId="u1" />,
  contacts: () => <TabContacts propertyId="p0" userId="u1" />,
  wizard: () => <AddPropertyWizard userId="u1" onClose={() => {}} onSaved={() => {}} />,
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
const shell = document.createElement('div');
shell.className = 'app-shell';
shell.innerHTML = `<main class="app-main">
  <header class="app-topbar">
    <button class="nav-toggle" aria-label="Μενού"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button>
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;flex-wrap:wrap;gap:10px;row-gap:8px;min-width:0">
        <button style="display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 10px;border:none;background:transparent;color:var(--text-primary);font-size:16px;font-weight:700">Διαμέρισμα Λεωφόρος Αλεξάνδρας 145, τρίτος όροφος, Αμπελόκηποι</button>
        <button style="display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 12px;border:1px solid var(--border-default);border-radius:999px;background:transparent;color:var(--text-secondary);font-size:13px;white-space:nowrap">Βραχυχρόνια μίσθωση</button>
      </div>
      <div style="font-size:12px;color:var(--text-tertiary);margin-top:2px">Κατοικία · 42 τ.μ. · Λεωφόρος Ανδρέα Συγγρού 123, Νέα Σμύρνη</div>
    </div>
    <button style="min-height:44px;padding:0 14px;border-radius:999px;border:1px solid var(--border-default);background:transparent;color:var(--text-secondary);flex-shrink:0">Αναζήτηση</button>
  </header>
  <div class="app-content"></div>
</main>`;
document.body.appendChild(shell);
const host = shell.querySelector('.app-content') as HTMLElement;

const View = VIEWS[which] || VIEWS.portfolio;
window.__t.start = performance.now();
createRoot(host).render(<View />);
requestAnimationFrame(() => { window.__t.firstPaint = performance.now(); });
