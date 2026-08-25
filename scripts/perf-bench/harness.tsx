// ═══════════════════════════════════════════════════════════════════════════
// Ο ΠΑΓΚΟΣ ΑΠΟΔΟΣΗΣ: ΤΟ ΠΡΑΓΜΑΤΙΚΟ ΧΑΡΤΟΦΥΛΑΚΙΟ, ΜΕ ΤΟ ΒΑΡΟΣ ΠΟΥ ΘΑ ΕΧΕΙ
// ─────────────────────────────────────────────────────────────────────────
// Μπαίνει ΤΟ ΙΔΙΟ αρχείο που φορτώνει ο χρήστης. Αλλάζει μόνο η βάση, με
// ψευδώνυμο στο χτίσιμο — ο κώδικας που κρίνεται δεν αγγίζεται.
//
// ΤΙ ΜΕΤΡΙΕΤΑΙ ΚΑΙ ΓΙΑΤΙ ΑΥΤΟ. Οχι «πόσο κάνει το fetch»: η ψεύτικη βάση
// απαντά ακαριαία, οπότε ο,τι μένει είναι ΚΑΘΑΡΟΣ χρόνος του δικού μας
// κώδικα — υπολογισμοί, useMemo, απόδοση στο DOM. Ακριβώς αυτό που δεν
// βελτιώνεται με καλύτερο δίκτυο και ακριβώς αυτό που κανείς δεν είχε δει.
// ═══════════════════════════════════════════════════════════════════════════
import { createRoot } from 'react-dom/client';
import { makeFakeDb, type Responder } from '../e2e-money/fakeDb';
import { portfolio } from './data';
import PortfolioTab from '@/app/dashboard/components/PortfolioTab';

declare global {
  interface Window {
    __t: Record<string, number>;
    __rows: () => number;
  }
}

const params = new URLSearchParams(location.search);
const n = Number(params.get('n') || 200);
const bench = portfolio(n);

const respond: Responder = (call) => {
  if (call.op !== 'select') return { data: null, error: null };
  const rows = bench.rows[call.table];
  if (!rows) return { data: call.single ? null : [], error: null };
  return { data: call.single ? (rows[0] ?? null) : rows, error: null };
};

const fake = makeFakeDb(respond);
window.__fake = fake;
window.__t = {};

// Ο ΜΕΤΡΗΤΗΣ ΓΡΑΜΜΩΝ ΕΙΝΑΙ ΤΟ ΣΗΜΑ ΤΕΛΟΥΣ. Δεν υπάρχει συμβάν «τελείωσα» στη
// React: το μόνο αδιαμφισβήτητο σημάδι ότι η οθόνη είναι έτοιμη είναι ότι οι
// γραμμές υπάρχουν στο DOM και τις βλέπει ο χρήστης.
window.__rows = () => document.querySelectorAll('[data-bench-row]').length
  || document.querySelectorAll('tbody tr').length;

const host = document.createElement('div');
document.body.appendChild(host);

window.__t.start = performance.now();
createRoot(host).render(
  <PortfolioTab properties={bench.properties} userId="u1" onSelectProperty={() => {}} />,
);
requestAnimationFrame(() => { window.__t.firstPaint = performance.now(); });
