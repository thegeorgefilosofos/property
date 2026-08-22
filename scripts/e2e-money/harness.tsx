// ═══════════════════════════════════════════════════════════════════════════
// Ο ΠΑΓΚΟΣ: ΕΝΑ ΠΡΑΓΜΑΤΙΚΟ COMPONENT, ΜΕ ΨΕΥΤΙΚΗ ΒΑΣΗ, ΣΕ ΠΡΑΓΜΑΤΙΚΟ ΠΕΡΙΗΓΗΤΗ
// ─────────────────────────────────────────────────────────────────────────
// Καμία απομίμηση της οθόνης: μπαίνει το ΙΔΙΟ αρχείο που φορτώνει ο χρήστης.
// Αλλάζει μόνο το ένα πράγμα που δεν επιτρέπεται να είναι αληθινό σε δοκιμή —
// η βάση — και αυτό γίνεται με ψευδώνυμο στο χτίσιμο, όχι με αλλαγή του κώδικα
// που κρίνεται.
// ═══════════════════════════════════════════════════════════════════════════
import { createRoot } from 'react-dom/client';
import { makeFakeDb, type DbCall, type Responder } from './fakeDb';
import RentReceived from '@/app/dashboard/components/RentReceived';
import InboundInbox from '@/app/dashboard/components/InboundInbox';
import { subscribeToasts } from '@/components/toastBus';
import type { CashLine } from '@/lib/home/cash';

declare global {
  interface Window {
    __calls: DbCall[];
    __toasts: string[];
    __ready: boolean;
  }
}

const params = new URLSearchParams(location.search);
const scenario = params.get('s') || '';
/** Ποια ερωτήματα αποτυγχάνουν, ως «πίνακας:σειρά» (π.χ. «rent_payments:2»). */
const failAt = (params.get('fail') || '').split(',').filter(Boolean);

const seen: Record<string, number> = {};
const respond: Responder = (call) => {
  const n = (seen[call.table] = (seen[call.table] || 0) + 1);
  if (failAt.includes(`${call.table}:${n}`)) {
    return { data: null, error: { message: 'δοκιμαστική αποτυχία', code: 'TEST' } };
  }
  if (call.op === 'select' && call.table === 'category_hints') {
    return { data: (window as unknown as { __hints?: unknown[] }).__hints ?? [], error: null };
  }
  if (call.op === 'select' && call.table === 'inbound_messages') {
    return { data: (window as unknown as { __inbound?: unknown[] }).__inbound ?? [], error: null };
  }
  if (call.op === 'select' && call.table === 'calendar_events') {
    return { data: call.single ? null : [], error: null };
  }
  // Η καταχώρηση δαπάνης επιστρέφει το αναγνωριστικό της γραμμής που μπήκε· η
  // οθόνη το χρειάζεται για να σημαδέψει το εισερχόμενο ως τακτοποιημένο.
  if (call.op === 'insert' && call.table === 'expenses') {
    return { data: { id: 'e-new' }, error: null };
  }
  return undefined;
};

const fake = makeFakeDb(respond);
window.__fake = fake;
window.__calls = fake.calls;
window.__toasts = [];

// Τα μηνύματα της οθόνης είναι μέρος του αποτελέσματος: ένα «καταχωρήθηκε» πάνω
// σε αποτυχία είναι το χειρότερο σφάλμα αυτής της διαδρομής.
//
// Η ΑΚΡΟΑΣΗ ΓΙΝΕΤΑΙ ΣΤΟΝ ΔΙΑΥΛΟ, ΟΧΙ ΣΤΟ DOM. Ο δίαυλος κρατά ΕΝΑΝ ακροατή:
// αν προσαρτούσαμε και τον κανονικό host, ο ένας από τους δύο θα έχανε κάθε
// μήνυμα, και η δοκιμή θα έλεγε «καμία ειδοποίηση» για λάθος λόγο.
subscribeToasts(t => { window.__toasts.push(`${t.tone || 'neutral'}: ${t.text}`); });

const line = (id: string, label: string, amount: number, due: string, daysLeft: number, tenantId = 't1', propertyId = 'p1'): CashLine => ({
  label, amount, due, daysLeft,
  rent: { id, year: Number(due.slice(0, 4)), month: Number(due.slice(5, 7)), tenantId, propertyId },
});

const THREE: CashLine[] = [
  line('r-07', 'Ενοίκιο Ιουλίου 2026', 450, '2026-07-01', -66),
  line('r-08', 'Ενοίκιο Αυγούστου 2026', 450, '2026-08-01', -35),
  line('r-09', 'Ενοίκιο Σεπτεμβρίου 2026', 450, '2026-09-01', -4),
];

const INBOX = [{
  id: 'm1', from_address: 'no-reply@dei.gr', vendor: 'ΔΕΗ', subject: 'Λογαριασμός ρεύματος Ιουλίου',
  amount: null, due_date: null, issue_date: '2026-07-20', category: 'Ρεύμα', expense_group: 'fixed',
  attachments: 1, status: 'pending',
}];
const INBOX_WITH_AMOUNT = [{ ...INBOX[0], id: 'm2', amount: 87.45, due_date: '2026-08-10' }];

const el = document.createElement('div');
el.id = 'root';
document.body.appendChild(el);

const noop = () => {};
const views: Record<string, () => React.ReactElement> = {
  // ── Είσπραξη ενοικίου ───────────────────────────────────────────────────
  'rent-one': () => <RentReceived onClose={noop} lines={[THREE[2]]} supabase={fake.db as never}
    propertyId="p1" tenantId="t1" leaseViaBank today="2026-09-05" onSaved={noop} />,
  'rent-three': () => <RentReceived onClose={noop} lines={THREE} supabase={fake.db as never}
    propertyId="p1" tenantId="t1" leaseViaBank today="2026-09-05" onSaved={noop} />,
  'rent-cash': () => <RentReceived onClose={noop} lines={[THREE[2]]} supabase={fake.db as never}
    propertyId="p1" tenantId="t1" leaseViaBank={false} today="2026-09-05" onSaved={noop} />,
  // Χαρτοφυλάκιο: κάθε δόση από άλλο ακίνητο, χωρίς ακίνητο στην οθόνη.
  'rent-portfolio': () => <RentReceived onClose={noop} supabase={fake.db as never}
    lines={[
      line('r-a', 'Αλεξάνδρας 12 · Ενοίκιο Σεπτεμβρίου 2026', 450, '2026-09-01', -4, 't1', 'p1'),
      line('r-b', 'Πατησίων 5 · Ενοίκιο Σεπτεμβρίου 2026', 620, '2026-09-01', -4, 't2', 'p2'),
    ]}
    propertyId={null} tenantId={null} leaseViaBank today="2026-09-05" onSaved={noop} />,

  // ── Εισερχόμενα ─────────────────────────────────────────────────────────
  'inbox-no-amount': () => { (window as unknown as { __inbound: unknown[] }).__inbound = INBOX; return <InboundInbox propertyId="p1" userId="u1" propertyName="Αλεξάνδρας 12" />; },
  'inbox-amount': () => { (window as unknown as { __inbound: unknown[] }).__inbound = INBOX_WITH_AMOUNT; return <InboundInbox propertyId="p1" userId="u1" propertyName="Αλεξάνδρας 12" />; },
};

const view = views[scenario];
if (!view) {
  document.body.textContent = `Αγνωστο σενάριο: ${scenario}`;
} else {
  createRoot(el).render(view());
  requestAnimationFrame(() => { window.__ready = true; });
}
