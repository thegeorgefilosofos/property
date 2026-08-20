'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΔΑΠΑΝΕΣ — μία λίστα.
//
// ΤΙ ΑΝΤΙΚΑΘΙΣΤΑ: τρία κουμπιά («Λογαριασμοί», «Λοιπές δαπάνες»,
// «Προϋπολογισμός»), εκ των οποίων το πρώτο έκρυβε άλλες επτά υποκαρτέλες. Ο
// ιδιοκτήτης που ήθελε να γράψει 80 ευρώ έκανε τρία κλικ πριν δει πεδίο, και
// διάλεγε ανάμεσα σε δύο φόρμες με διαφορετικά πεδία για το ίδιο πράγμα.
//
// Η ΑΡΧΗ: ο λογαριασμός δεν είναι άλλο πράγμα από τη δαπάνη. Είναι δαπάνη που
// δεν την έχεις πληρώσει ακόμη. Γι' αυτό εδώ υπάρχει ΜΙΑ λίστα, όπου ο
// απλήρωτος λογαριασμός είναι απλώς γραμμή με ημερομηνία λήξης.
//
// ΓΙΑΤΙ ΚΑΤΑ ΜΗΝΑ ΚΑΙ ΟΧΙ ΚΑΤΑ ΚΑΤΗΓΟΡΙΑ: κανείς δεν ρωτά «πόσα έδωσα σε
// συντήρηση» πριν ρωτήσει «πόσα έδωσα τον Ιούλιο». Ο μήνας είναι ο τρόπος που
// σκέφτεται κανείς τα χρήματά του, γιατί μηνιαία μπαίνει το ενοίκιο και
// μηνιαία έρχονται οι λογαριασμοί. Η κατηγορία είναι φίλτρο, όχι σκελετός.
//
// ΤΡΙΑ ΝΟΥΜΕΡΑ, ΟΧΙ ΕΞΙ. Η παλιά οθόνη είχε έξι πλακίδια στην κορυφή, μετά
// άλλες τέσσερις κάρτες με τα ίδια νούμερα αλλιώς, και ξανά σύνολα στο τέλος
// του πίνακα. Όταν όλα φωνάζουν, τίποτα δεν ακούγεται.
//
// ΛΕΞΙΛΟΓΙΟ: κανένας λογιστικός όρος στην επιφάνεια. Όχι «καθολικό», όχι
// «εγγραφή», όχι «παραστατικό». Ο ιδιοκτήτης δεν είναι λογιστής και δεν θέλει
// να γίνει.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as expenseStore from '@/lib/data/expenses'
import * as billStore from '@/lib/data/bills'
import ExpenseCompare from './ExpenseCompare';
import type { Spend } from '@/lib/expenses/compare';
import { T, TT, fe, Btn, Card, EmptyState, Modal, Skeleton, ABSENT_DATE } from '@/components/Theme';
import { notify, notifyError } from '@/components/toastBus';
import { confirmDialog } from '@/components/ConfirmDialog';
import { saved } from '@/components/dbWrite';
import {
  mergeLedger, ledgerTotal, groupByMonth,
  type LedgerEntry, type LedgerBill, type LedgerExpense,
} from '@/lib/expenses/ledger';
import { categoryLabel, resolveCategory, searchCategories, BY_SLUG, CATEGORIES } from '@/lib/expenses/taxonomy';
import { missingThisMonth } from '@/lib/expenses/expected';
import { priceChanges } from '@/lib/expenses/priceChange';
import { planBillPayment, type BillToPay } from '@/lib/expenses/pay';
import { groupForCategory } from '@/lib/expenses/groups';
import { PAID_BY_OPTIONS, SHARED_SCOPES, DEFAULT_SHARE_PERCENT } from '@/lib/expenses/sharing';
import { CustomSelect, DatePicker, Toggle } from './UIComponents';
import { athensToday, athensMonth } from '@/lib/core/time';
import { MONTHS_NOM } from '@/lib/core/months';
import { afmDigits, isValidAfm, parseAmount } from '@/lib/core/greek';

interface Props {
  propertyId: string;
  userId: string;
  /** Ενεργό πλάνο: ορίζει πόσες γραμμές δέχεται η μαζική καταχώρηση. */
  /** Ανοίγει το υπάρχον παράθυρο σάρωσης της εφαρμογής. */
  onScan?: () => void;
}


const monthLabel = (m: string): string => {
  const [y, mm] = m.split('-');
  const i = parseInt(mm, 10) - 1;
  if (!MONTHS_NOM[i]) return m;
  const now = new Date();
  const sameYear = String(now.getFullYear()) === y;
  return sameYear ? MONTHS_NOM[i] : `${MONTHS_NOM[i]} ${y}`;
};

/** «24/07» για φέτος, «24/07/25» για παλιότερα. Η χρονιά μπαίνει μόνο όταν μετρά. */
const shortDate = (d: string): string => {
  if (!d) return ABSENT_DATE;
  const [y, m, day] = d.split('-');
  const sameYear = String(new Date().getFullYear()) === y;
  return sameYear ? `${day}/${m}` : `${day}/${m}/${y.slice(2)}`;
};

/** «σε 4 μέρες», «σήμερα», «πριν 3 μέρες». Ο χρήστης μετρά σε μέρες, όχι σε ημερομηνίες. */
const dueText = (due: string): { text: string; late: boolean } => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(due + 'T00:00:00');
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { text: days === -1 ? 'πέρασε χθες' : `πέρασε πριν ${-days} μέρες`, late: true };
  if (days === 0) return { text: 'λήγει σήμερα', late: true };
  if (days === 1) return { text: 'λήγει αύριο', late: false };
  return { text: `λήγει σε ${days} μέρες`, late: false };
};

/**
 * Καθαρή ανάγνωση: παίρνει δεδομένα, δεν αγγίζει state.
 *
 * Είναι έξω από το component επίτηδες. Όσο η φόρτωση ζούσε μέσα σε useCallback
 * που καλούσε setState, το effect φαινόταν να ενημερώνει state συγχρόνως και ο
 * React το σημείωνε ως αλυσιδωτό render. Χωρισμένο έτσι, το «τι φέρνω» δεν
 * ξέρει τίποτα για το «πού το βάζω», και δοκιμάζεται χωρίς React.
 */
async function fetchLedger(
  supabase: ReturnType<typeof createClient>, propertyId: string, userId: string,
): Promise<{ bills: LedgerBill[]; expenses: LedgerExpense[] }> {
  const [b, e] = await Promise.all([
    billStore.ofProperty<LedgerBill>(supabase, propertyId, billStore.LEDGER_COLUMNS, userId),
    expenseStore.ledger(supabase, propertyId, { userId, excludeCategory: 'tenant_extra' }),
  ]);
  return {
    bills: b,
    expenses: e as unknown as LedgerExpense[],
  };
}

export default function ExpenseLedger({ propertyId, userId, onScan }: Props) {
  // Ένα instance ανά component. Χωρίς useMemo, κάθε render έφτιαχνε νέο client
  // και το κανάλι realtime ξαναδενόταν χωρίς λόγο.
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(!!propertyId);
  const [bills, setBills] = useState<LedgerBill[]>([]);
  const [expenses, setExpenses] = useState<LedgerExpense[]>([]);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Ποια δαπάνη είναι ανοιχτή για επεξεργασία. Κρατιέται το αναγνωριστικό και
  // όχι αντίγραφο της γραμμής: μετά την αποθήκευση η λίστα ξαναφορτώνεται, και
  // ένα αντίγραφο θα έδειχνε τα παλιά δεδομένα αν ο χρήστης ξανάνοιγε αμέσως.
  const [editingId, setEditingId] = useState<string | null>(null);

  // ═══════════════════════════════════════════════════════════════════════
  // Η ΣΥΓΚΡΙΣΗ ΜΗΝΑ ΔΙΑΒΑΖΕΙ ΤΑ ΙΔΙΑ ΔΕΔΟΜΕΝΑ — ΔΕΝ ΞΑΝΑΡΩΤΑ ΤΗ ΒΑΣΗ
  //
  // ΤΙ ΕΙΧΕ ΣΥΜΒΕΙ: η δοκιμασμένη μηχανή (lib/expenses/compare.ts, 55 έλεγχοι)
  // και η οθόνη της (ExpenseCompare) είχαν συνδεθεί στο TabExpenses.tsx — 1.556
  // γραμμές που ΔΕΝ ΤΙΣ ΕΙΣΑΓΕΙ ΚΑΝΕΝΑΣ. Το page.tsx φορτώνει TabFinances, που
  // φορτώνει αυτό το αρχείο. Άρα η απάντηση στην κεντρική ερώτηση του χρήστη
  // («ξόδεψα περισσότερα;») δεν έφτανε σε κανέναν.
  //
  // ΓΙΑΤΙ ΕΔΩ ΚΑΙ ΟΧΙ ΣΤΟ TabFinances: εκεί θα χρειαζόταν δεύτερο ερώτημα στη
  // βάση για τα ίδια ακριβώς έξοδα. Δύο ερωτήματα σημαίνουν δύο πηγές που
  // μπορούν να διαφωνήσουν — και το μοτίβο αυτό είναι η ρίζα των αντιφάσεων που
  // βρήκε ο έλεγχος. Ένα ερώτημα, ένα σύνολο, μία απάντηση.
  //
  // Η ΜΗΧΑΝΗ ΔΕΝ ΕΦΕΥΡΙΣΚΕΙ: αν ο μήνας είναι ημιτελής το λέει με μέρες, αν η
  // βάση σύγκρισης είναι μηδέν δεν δείχνει ποσοστό, και όταν δεν υπάρχει τίποτα
  // να πει επιστρέφει κενό — οπότε η κάρτα δεν εμφανίζεται καθόλου.
  // ═══════════════════════════════════════════════════════════════════════
  const spends: Spend[] = useMemo(() => expenses
    .filter(e => (e.amount || 0) > 0 && !!e.date)
    .map(e => ({
      date: String(e.date).slice(0, 10),
      amount: Number(e.amount) || 0,
      category: e.category || 'Λοιπά',
      title: e.description || undefined,
      recurring: e.is_recurring === true,
    })), [expenses]);

  const load = useCallback(async () => {
    if (!propertyId) return;
    try {
      const r = await fetchLedger(supabase, propertyId, userId);
      setBills(r.bills);
      setExpenses(r.expenses);
    } catch { /* η οθόνη δείχνει κενή κατάσταση, όχι σφάλμα */ }
    finally { setLoading(false); }
  }, [supabase, propertyId, userId]);

  useEffect(() => {
    if (!propertyId) return;
    // alive: αν ο χρήστης αλλάξει ακίνητο όσο τρέχει το αίτημα, η απάντηση του
    // προηγούμενου δεν επιτρέπεται να γράψει πάνω στη λίστα του επόμενου.
    let alive = true;
    fetchLedger(supabase, propertyId, userId)
      .then(r => { if (!alive) return; setBills(r.bills); setExpenses(r.expenses); })
      .catch(() => { /* κενή κατάσταση */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [supabase, propertyId, userId]);

  // Ζωντανή ενημέρωση: μια δαπάνη που μπαίνει από τη σάρωση ή από άλλη οθόνη
  // εμφανίζεται εδώ χωρίς να χρειαστεί ανανέωση.
  useEffect(() => {
    if (!propertyId) return;
    const ch = supabase.channel(`ledger_${propertyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `property_id=eq.${propertyId}` }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills', filter: `property_id=eq.${propertyId}` }, () => { void load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase, propertyId, load]);

  const { entries, duplicates } = useMemo(() => mergeLedger(bills, expenses), [bills, expenses]);

  // Η γραμμή που επεξεργάζεται, από την ΙΔΙΑ λίστα που δείχνει η οθόνη. Αν η
  // δαπάνη διαγραφεί από άλλη συσκευή όσο το παράθυρο είναι ανοιχτό, το
  // realtime ξαναφορτώνει, η γραμμή δεν βρίσκεται και το παράθυρο κλείνει μόνο
  // του αντί να αποθηκεύσει σε αναγνωριστικό που δεν υπάρχει πια.
  const editingRow = useMemo(
    () => (editingId ? expenses.find(x => x.id === editingId) ?? null : null), [expenses, editingId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter(e =>
      e.title.toLowerCase().includes(needle) ||
      categoryLabel(e.category).toLowerCase().includes(needle) ||
      (e.vendor || '').toLowerCase().includes(needle));
  }, [entries, q]);

  const months = useMemo(() => groupByMonth(filtered), [filtered]);

  // ── ΤΑ ΤΡΙΑ ΝΟΥΜΕΡΑ ──────────────────────────────────────────────────────
  const thisMonth = athensMonth();
  const monthTotal = useMemo(
    () => ledgerTotal(entries.filter(e => e.date.startsWith(thisMonth))), [entries, thisMonth]);
  const unpaid = useMemo(() => entries.filter(e => !e.paid), [entries]);
  const unpaidTotal = useMemo(() => ledgerTotal(unpaid), [unpaid]);

  // ── ΤΙ ΣΥΝΗΘΩΣ ΘΑ ΕΙΧΕ ΕΡΘΕΙ ΚΑΙ ΛΕΙΠΕΙ ──────────────────────────────────
  // Ο πυρήνας το έγραφε ρητά: «καμία αυτόματη ανανέωση δεν υπάρχει». Ο
  // ιδιοκτήτης δήλωνε τη ΔΕΗ πάγιο και μετά την ξαναέγραφε μόνος του κάθε μήνα,
  // ενώ η εφαρμογή ήξερε από το ιστορικό ότι έρχεται. Εδώ της επιτρέπεται να το
  // πει — χωρίς να γράψει τίποτα: μια εγγραφή με ποσό που μαντεύτηκε μολύνει τα
  // ίδια τα νούμερα που πάνε στον λογιστή.
  const missing = useMemo(() => missingThisMonth(entries, new Date()), [entries]);

  // ── ΤΙ ΑΚΡΙΒΥΝΕ ──────────────────────────────────────────────────────────
  // Ζητήθηκε «μία φορά τον μήνα να ελέγχουμε Netflix, Spotify, Disney+ για
  // αλλαγές τιμών». Κατάλογος τιμών της αγοράς θα ήταν το ίδιο λάθος με τα
  // τιμολόγια ρεύματος: τιμές τρίτων που παλιώνουν σιωπηλά, και απάντηση σε
  // λάθος ερώτηση. Ο ιδιοκτήτης δεν ρωτά πόσο κάνει το Netflix — ρωτά γιατί
  // χρεώθηκε τρία ευρώ παραπάνω. Αυτό το ξέρουμε από τα ΔΙΚΑ ΤΟΥ δεδομένα, και
  // είναι γεγονός, όχι εκτίμηση.
  const changed = useMemo(() => priceChanges(entries, new Date()), [entries]);

  // «Θέλουν ματιά»: διπλές γραμμές και όσες δεν έχουν αναγνωρίσιμη κατηγορία.
  // Δεν είναι σφάλμα του χρήστη και δεν παρουσιάζεται ως τέτοιο: είναι δουλειά
  // πέντε δευτερολέπτων που κάνει τα υπόλοιπα νούμερα να στέκουν.
  const needsEye = useMemo(
    () => [...duplicates, ...entries.filter(e => !resolveCategory(e.category))],
    [duplicates, entries]);

  // ── ΔΙΑΓΡΑΦΗ ΜΙΑΣ ΓΡΑΜΜΗΣ ─────────────────────────────────────────────────
  //
  // Η ΕΡΩΤΗΣΗ ΟΝΟΜΑΖΕΙ ΤΟ ΠΟΣΟ ΚΑΙ ΤΗΝ ΗΜΕΡΟΜΗΝΙΑ. Ενα «Είσαι σίγουρος;» δεν
  // βοηθά κανέναν: ο χρήστης δεν αμφιβάλλει για τη βούλησή του, αμφιβάλλει για
  // το ΠΟΙΑ γραμμή πάτησε. Η επιβεβαίωση απαντά σε αυτό.
  const removeExpense = async (e: LedgerEntry) => {
    if (!e.expenseId) return;
    if (!await confirmDialog({
      title: `Διαγραφή δαπάνης ${fe(e.amount)};`,
      message: `«${e.title || 'Χωρίς περιγραφή'}» της ${shortDate(e.date)}.\nΗ γραμμή φεύγει οριστικά από τον Προϋπολογισμό, τη Λογιστική και τον φάκελο του λογιστή. Δεν αναιρείται.`,
      confirmLabel: 'Διαγραφή',
      tone: 'negative',
    })) return;
    setBusy(e.key);
    const ok = await saved('Η δαπάνη δεν διαγράφηκε', expenseStore.remove(supabase, e.expenseId));
    setBusy('');
    if (!ok) return;
    await load();
    notify('Η δαπάνη διαγράφηκε');
  };

  const markPaid = async (e: LedgerEntry) => {
    setBusy(e.key);
    try {
      if (e.billId) {
        // ΜΙΑ ΑΠΟΦΑΣΗ, ΚΟΙΝΗ ΜΕ ΤΗΝ ΟΘΟΝΗ ΛΟΓΑΡΙΑΣΜΩΝ (lib/expenses/pay.ts).
        // Εδώ η δαπάνη γραφόταν ΧΩΡΙΣ expense_group — και το isGroupDeductible
        // επιστρέφει false για κενή ομάδα. Ο ίδιος λογαριασμός εξέπιπτε αν τον
        // πλήρωνες από τους Λογαριασμούς και ΔΕΝ εξέπιπτε από εδώ.
        const linked = await expenseStore.existsForBill(supabase, e.billId);
        const billRow = await billStore.one<BillToPay>(supabase, e.billId, 'id,name,amount,category,paid_by,share_percent,share_note');
        const plan = planBillPayment(
          billRow ?? { id: e.billId, name: e.title, amount: e.amount, category: e.category },
          { propertyId, userId, nowIso: new Date().toISOString(), hasLinkedExpense: linked },
        );
        const { error: bErr } = await billStore.update(supabase, e.billId, plan.bill);
        if (bErr) throw bErr;
        if (plan.linkedExpenseUpdate) {
          const { error } = await expenseStore.updateByBill(supabase, e.billId, plan.linkedExpenseUpdate);
          if (error) throw error;
        } else if (plan.newExpense) {
          const { error } = await expenseStore.insert(supabase, [plan.newExpense]);
          if (error) throw error;
        }
      } else if (e.expenseId) {
        // Το try/catch από πάνω κάνει τη δουλειά του μόνο αν κάτι ΠΕΤΑΞΕΙ, και το
        // Supabase δεν πετά. Χωρίς αυτή τη γραμμή, η δαπάνη έμενε απλήρωτη και η
        // οθόνη έλεγε «Μπήκε ως πληρωμένο».
        const { error } = await expenseStore.update(supabase, e.expenseId, { paid: true });
        if (error) throw error;
      }
      notify('Μπήκε ως πληρωμένο');
      await load();
    } catch { notifyError('Δεν αποθηκεύτηκε. Δοκίμασε ξανά.'); }
    finally { setBusy(null); }
  };

  return (
    <div>
      <style>{`
        .exp-row {
          display: grid; grid-template-columns: 54px 1fr auto; gap: 14px; align-items: center;
          padding: 13px 14px; border-radius: ${T.radius.inner}px;
          border: 1px solid transparent; background: transparent;
          transition: background .15s, border-color .15s, transform .15s;
        }
        @media (hover: hover) {
          .exp-row:hover {
            background: var(--bg-elevated); border-color: var(--border-subtle);
            transform: translateY(-1px);
          }
        }
        .exp-row:focus-within { border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
        .exp-act { opacity: 0; transition: opacity .15s; }
        .exp-row:hover .exp-act, .exp-row:focus-within .exp-act { opacity: 1; }
        @media (hover: none) { .exp-act { opacity: 1; } }
        /* Η κεφαλίδα μήνα μένει ορατή όσο κυλάς μέσα του: σε λίστα εκατό
           γραμμών, χωρίς αυτό χάνεις σε ποιον μήνα βρίσκεσαι. */
        /* Χωρίς γεμάτη μπάντα: μια τρίχα κάτω και τίποτα άλλο. Η γεμισμένη
           κεφαλίδα έκοβε τη λίστα σε κομμάτια και τραβούσε περισσότερη προσοχή
           από τα ίδια τα ποσά, που είναι το περιεχόμενο. */
        .exp-month {
          position: sticky; top: 0; z-index: 2;
          display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
          padding: 14px 14px 8px; margin-top: 10px;
          background: var(--bg-surface); border-bottom: 1px solid var(--border-subtle);
        }
        .exp-month:first-child { margin-top: 0; }
        @media (max-width: 560px) {
          .exp-row { grid-template-columns: 46px 1fr; row-gap: 6px; }
          .exp-row > :last-child { grid-column: 2; justify-self: start; }
        }
      `}</style>

      {/* ── Κεφαλίδα ───────────────────────────────────────────────────────────
          Ο τίτλος ήταν 28 και το υπότιτλο 12,5: μεγέθη γραμμένα με το χέρι, εκτός
          κλίμακας. Η οθόνη δεν έχει ανάγκη από αφίσα, έχει ανάγκη από ιεραρχία.
          Πλέον όλα τα μεγέθη έρχονται από το TT, που είναι η μία πηγή αλήθειας
          του συστήματος. Ό,τι δεν είναι στην κλίμακα, δεν μπαίνει στην οθόνη. */}
      <div style={{ marginBottom: T.sp.lg }}>
        <h1 style={{ ...TT.h1, margin: 0 }}>Δαπάνες</h1>
        <div style={{ ...TT.caption, marginTop: 4 }}>Κάθε ευρώ που φεύγει, σε μία λίστα.</div>
      </div>

      {/* Πρώτα η απάντηση στο «ξόδεψα περισσότερα;», μετά η λίστα. Ο χρήστης δεν
          ανοίγει τις Δαπάνες για να διαβάσει εγγραφές — ανοίγει για να καταλάβει. */}
      <ExpenseCompare spends={spends} />

      {/* ── Τρία νούμερα ─────────────────────────────────────────────────────
          Χωρίς πλαίσια και χωρίς γεμίσματα. Τρεις στήλες χωρισμένες με μία
          τρίχα, όπως σε τραπεζική κατάσταση. Το κουτί γύρω από νούμερα δεν
          προσθέτει πληροφορία, προσθέτει θόρυβο. */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
        gap: T.sp.lg, padding: `${T.sp.md}px 0 ${T.sp.lg}px`,
        borderBottom: '1px solid var(--border-subtle)', marginBottom: T.sp.lg,
      }}>
        <Figure label="αυτόν τον μήνα" value={loading ? null : fe(monthTotal)} />
        <Figure label={unpaid.length === 1 ? 'απλήρωτο' : 'απλήρωτα'} value={loading ? null : fe(unpaidTotal)}
          sub={unpaid.length ? `${unpaid.length} ${unpaid.length === 1 ? 'γραμμή' : 'γραμμές'}` : undefined} />
        <Figure label="φέτος" value={loading ? null : fe(ledgerTotal(entries.filter(e => e.date.startsWith(String(new Date().getFullYear())))))} />
      </div>

      {/* ── ΤΙ ΛΕΙΠΕΙ ────────────────────────────────────────────────────────
          Μία γραμμή, όχι πίνακας. Δεν είναι σφάλμα και δεν παρουσιάζεται ως
          τέτοιο: είναι παρατήρηση από το ιστορικό, με το τυπικό ποσό δίπλα ώστε
          ο χρήστης να ξέρει τι ψάχνει. Χωρίς χρώμα προειδοποίησης — ένας
          λογαριασμός που άργησε τρεις μέρες δεν είναι πρόβλημα. */}
      {!loading && missing.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: T.sp.lg,
          padding: '11px 14px', borderRadius: T.radius.inner,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        }}>
          <span style={{ flexShrink: 0, width: 5, height: 5, borderRadius: '50%', background: 'var(--text-tertiary)', marginTop: 8 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ ...TT.bodySm, color: 'var(--text-primary)', fontWeight: 600 }}>
              {missing.length === 1 ? 'Δεν έχει καταχωρηθεί ακόμη αυτόν τον μήνα' : `Δεν έχουν καταχωρηθεί ακόμη ${missing.length} πάγια αυτόν τον μήνα`}
            </div>
            <div style={{ ...TT.caption, marginTop: 3, lineHeight: 1.6 }}>
              {missing.slice(0, 4).map(m => `${m.title}, συνήθως ${fe(m.typicalAmount)} γύρω στις ${m.typicalDay}`).join(' · ')}
              {missing.length > 4 ? ` · και άλλα ${missing.length - 4}` : ''}
            </div>
          </div>
        </div>
      )}

      {/* ── ΤΙ ΑΛΛΑΞΕ ΤΙΜΗ ─────────────────────────────────────────────────
          Ίδιο σχήμα με τη γραμμή «τι λείπει» από πάνω: μία παρατήρηση, χωρίς
          χρώμα προειδοποίησης. Μια αύξηση δεν είναι σφάλμα του χρήστη. */}
      {!loading && changed.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: T.sp.lg,
          padding: '11px 14px', borderRadius: T.radius.inner,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        }}>
          <span style={{ flexShrink: 0, width: 5, height: 5, borderRadius: '50%', background: 'var(--text-tertiary)', marginTop: 8 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ ...TT.bodySm, color: 'var(--text-primary)', fontWeight: 600 }}>
              {changed.length === 1 ? 'Μία χρέωση άλλαξε ποσό' : `${changed.length} χρεώσεις άλλαξαν ποσό`}
            </div>
            <div style={{ ...TT.caption, marginTop: 3, lineHeight: 1.6 }}>
              {changed.slice(0, 3).map(c => c.message).join(' ')}
              {changed.length > 3 ? ` Και άλλες ${changed.length - 3}.` : ''}
            </div>
          </div>
        </div>
      )}

      {/* ── ΜΙΑ ΕΝΕΡΓΕΙΑ, ΣΤΗΝ ΚΟΡΥΦΗ ────────────────────────────────────────
          Ήταν τρία κουμπιά σε σειρά, ΚΑΤΩ από τα νούμερα: «Φωτογραφία» (μπλε),
          «Νέα δαπάνη», «Μαζικά». Τρία προβλήματα μαζί:
          · Η «Φωτογραφία» ήταν το ΙΔΙΟ πράγμα με το «Σάρωσε έγγραφο» της
            πλαϊνής μπάρας — η πιο περίοπτη ενέργεια της εφαρμογής, δεύτερη φορά.
          · Τα «Μαζικά» (επικόλληση πολλών γραμμών) είναι εργαλείο μετανάστευσης
            δεδομένων: κάποιος το χρησιμοποιεί μία φορά στη ζωή του λογαριασμού
            του και μετά ποτέ. Δεν δικαιολογεί μόνιμη θέση δίπλα στην καθημερινή
            ενέργεια.
          · Η πραγματική δουλειά αυτής της οθόνης —«πρόσθεσε δαπάνη»— ήταν το
            ΜΕΣΑΙΟ, ουδέτερο κουμπί, κάτω από τρία νούμερα.

          Τώρα: μία κύρια ενέργεια, πάνω από όλα. Μέσα της διαλέγεις τον δρόμο —
          φωτογραφία, αρχείο ή πληκτρολόγιο — αντί να διαλέγεις από τη γραμμή
          εργαλείων πριν καν ξέρεις τι θέλεις. */}
      {/* ΜΕ ΜΗΔΕΝ ΔΑΠΑΝΕΣ, Η ΓΡΑΜΜΗ ΔΕΝ ΕΧΕΙ ΤΙ ΝΑ ΚΑΝΕΙ. Το «Νέα δαπάνη»
          εμφανιζόταν ΚΑΙ εδώ ΚΑΙ στην κενή κατάσταση από κάτω — δύο πανομοιότυπα
          γεμάτα κουμπιά στην ίδια οθόνη — και δίπλα του ένα πεδίο αναζήτησης που
          θα έψαχνε σε τίποτα. Όσο η φόρμα είναι ανοιχτή η γραμμή μένει, γιατί
          κρατά την «Ακύρωση». */}
      {(entries.length > 0 || adding) && <div style={{ display: 'flex', gap: T.sp.sm, flexWrap: 'wrap', alignItems: 'center', marginBottom: T.sp.lg }}>
        <Btn variant="primary" onClick={() => setAdding(v => !v)}>{adding ? 'Ακύρωση' : 'Νέα δαπάνη'}</Btn>
        <div style={{ flex: 1 }} />
        {/* Ίδιο ύψος και ίδιο σχήμα με τα κουμπιά δίπλα του. Πριν ήταν ψηλότερο
            και πιο στρογγυλό, και η σειρά έμοιαζε στοιχισμένη κατά λάθος. */}
        <input
          value={q} onChange={ev => setQ(ev.target.value)}
          /* Η υπόδειξη λέει ΤΙ ψάχνεται, όπως στις άλλες οθόνες· το «Αναζήτηση»
             ανήκει στην ετικέτα του αναγνώστη οθόνης, όπου και είναι. */
          placeholder="Περιγραφή, κατηγορία ή πάροχος"
          className="po-field" aria-label="Αναζήτηση δαπανών"
          style={{
            width: 190, height: T.h.md, padding: '0 14px', boxSizing: 'border-box',
            borderRadius: T.radius.btn, border: '1px solid var(--border-default)',
            background: 'var(--bg-surface)', color: 'var(--text-primary)',
            fontSize: 13, fontFamily: T.font.sans, outline: 'none',
          }}
        />
      </div>}

      {adding && (
        <>
          {/* Ο ΓΡΗΓΟΡΟΣ ΔΡΟΜΟΣ ΠΡΩΤΑ. Το πληκτρολόγιο είναι η εφεδρεία, όχι η
              προεπιλογή: μια δαπάνη έχει σχεδόν πάντα ένα χαρτί από πίσω, και
              το χαρτί ξέρει το ποσό, τον πάροχο και την ημερομηνία καλύτερα από
              τη μνήμη. Η ίδια οθόνη σάρωσης δέχεται και φωτογραφία και αρχείο
              (PDF, Excel, CSV) — δεν χρειάζονται δύο κουμπιά. */}
          {onScan && (
            <button type="button" onClick={onScan}
              style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                padding: '14px 16px', marginBottom: T.sp.md, cursor: 'pointer', textAlign: 'left',
                borderRadius: T.radius.inner, border: '1px solid var(--border-default)',
                background: 'var(--bg-elevated)', transition: 'border-color 0.15s, background 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.background = 'var(--bg-elevated)'; }}>
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.2"/>
              </svg>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: T.font.sans, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                  Φωτογράφισε ή ανέβασε αρχείο
                </span>
                <span style={{ display: 'block', fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  Απόδειξη, λογαριασμός ή PDF: συμπληρώνεται μόνο του
                </span>
              </span>
            </button>
          )}
          <QuickAdd propertyId={propertyId} userId={userId}
            onDone={async () => { setAdding(false); await load(); }} />
        </>
      )}

      {/* ── Θέλουν ματιά ─────────────────────────────────────────────────────
          ΧΩΡΙΣ πορτοκαλί περίγραμμα. Ένα χρωματιστό πλαίσιο γύρω από μια
          παρατήρηση διεκδικεί την ίδια προσοχή με ένα σφάλμα, και μετά από δύο
          φορές ο χρήστης το αγνοεί μόνιμα. Μία τελεία φτάνει: το μάτι τη
          βρίσκει, και η οθόνη μένει ένα χρώμα. */}
      {!loading && needsEye.length > 0 && (
        <div style={{
          display: 'flex', gap: T.sp.md, alignItems: 'flex-start',
          padding: `${T.sp.md}px ${T.sp.lg}px`, marginBottom: T.sp.lg,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          borderRadius: T.radius.inner,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warning)', flexShrink: 0, marginTop: 6 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ ...TT.body, fontWeight: 600, marginBottom: 2 }}>
              {needsEye.length} {needsEye.length === 1 ? 'γραμμή θέλει μια ματιά' : 'γραμμές θέλουν μια ματιά'}
            </div>
            <div style={TT.bodySm}>
              Είτε δεν έχουν κατηγορία, είτε μοιάζουν διπλές. Δεν χάνεται τίποτα, αλλά μέχρι να
              τακτοποιηθούν δεν μετρούν σωστά στον Προϋπολογισμό.
            </div>
          </div>
        </div>
      )}

      {/* ── Η λίστα ────────────────────────────────────────────────────────── */}
      {loading ? (
        <Card pad="sm">
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '13px 14px' }}>
              <Skeleton w={40} h={12} /><Skeleton w="45%" h={13} /><div style={{ flex: 1 }} /><Skeleton w={70} h={13} />
            </div>
          ))}
        </Card>
      ) : entries.length === 0 ? (
        // ΚΕΝΗ ΚΑΤΑΣΤΑΣΗ: όχι εικονίδιο και σλόγκαν, αλλά η πρώτη ενέργεια σε
        // φυσικό μέγεθος. Ο χρήστης δεν θέλει να του πουν ότι είναι άδειο.
        <EmptyState
          title="Καμία δαπάνη ακόμη"
          hint="Τράβα μια φωτογραφία ενός λογαριασμού και μπαίνει μόνος του. Ή γράψ’ τον με το χέρι, θέλει πέντε δευτερόλεπτα."
          action={onScan ? <Btn variant="primary" onClick={onScan}>Σάρωσε λογαριασμό</Btn> : <Btn variant="primary" onClick={() => setAdding(true)}>Νέα δαπάνη</Btn>}
        />
      // Ο τίτλος λέει ήδη ότι δεν βρέθηκε τίποτα. Ο υπότιτλος έλεγε το ίδιο με
      // άλλα λόγια· τώρα λέει ΤΙ αναζητήθηκε, που είναι το χρήσιμο.
      ) : months.length === 0 ? (
        <EmptyState title="Δεν βρέθηκαν δαπάνες" hint={`Καμία εγγραφή δεν ταιριάζει με «${q}».`}
          action={<Btn variant="secondary" onClick={() => setQ('')}>Καθάρισε την αναζήτηση</Btn>} />
      ) : (
        <Card pad="sm" gap={false}>
          {months.map(m => (
            <div key={m.month}>
              <div className="exp-month">
                <span style={TT.label}>{monthLabel(m.month)}</span>
                <span style={{ ...TT.mono, fontWeight: 700, color: 'var(--text-secondary)' }}>{fe(m.total)}</span>
              </div>
              <div style={{ padding: '4px 0' }}>
                {m.entries.map(e => (
                  <Row key={e.key} e={e} busy={busy === e.key} onPaid={() => markPaid(e)}
                    onEdit={e.expenseId ? () => setEditingId(e.expenseId) : null}
                    onDelete={e.expenseId ? () => removeExpense(e) : null} />
                ))}
              </div>
            </div>
          ))}
        </Card>
      )}

      {editingRow && (
        <EditExpense row={editingRow} onClose={() => setEditingId(null)} onSaved={load} />
      )}
    </div>
  );
}

// ── Ένα νούμερο ───────────────────────────────────────────────────────────
/**
 * Ένα νούμερο με την ετικέτα του.
 *
 * Η ΕΤΙΚΕΤΑ ΠΑΝΩ, ΤΟ ΝΟΥΜΕΡΟ ΚΑΤΩ. Ο χρήστης σαρώνει πρώτα «τι είναι αυτό» και
 * μετά διαβάζει το ποσό· ανάποδα, διαβάζει τρία ποσά χωρίς να ξέρει τι μετρούν
 * και επιστρέφει πάνω.
 *
 * ΚΑΝΕΝΑ ΝΟΥΜΕΡΟ ΔΕΝ ΕΙΝΑΙ ΚΟΚΚΙΝΟ. Το «απλήρωτο» ήταν βαμμένο μόνιμα:
 * κάθε δαπάνη που δεν έχει εξοφληθεί ακόμη — δηλαδή η ΚΑΝΟΝΙΚΗ κατάσταση ενός
 * λογαριασμού που δεν έληξε — έβγαινε ως συναγερμός. Ενα κόκκινο που ανάβει
 * δώδεκα μήνες τον χρόνο παύει να σημαίνει οτιδήποτε, και μαζί του χάνεται και
 * η δυνατότητα να επισημανθεί κάτι που ΟΝΤΩΣ τρέχει.
 *
 * Η διάκριση που μετράει δεν είναι «πληρώθηκε ή όχι» — είναι «πέρασε η
 * προθεσμία ή όχι», και τη λέει η ίδια η γραμμή με λέξεις, στη σειρά της.
 */
function Figure({ label, value, sub }: { label: string; value: string | null; sub?: string }) {
  return (
    <div>
      <div style={{ ...TT.label, marginBottom: 8 }}>{label}</div>
      <div style={{ ...TT.kpi, fontSize: 20, color: 'var(--text-primary)' }}>
        {value ?? <Skeleton w={78} h={18} />}
      </div>
      {sub && <div style={{ ...TT.caption, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

// ── Μία γραμμή ────────────────────────────────────────────────────────────
/** Κανονικοποίηση για σύγκριση ετικέτας με τίτλο: πεζά, χωρίς τόνους. */
const bare = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

function Row({ e, busy, onPaid, onEdit, onDelete }: { e: LedgerEntry; busy: boolean; onPaid: () => void; onEdit: (() => void) | null; onDelete: (() => void) | null }) {
  const cat = categoryLabel(e.category);
  const due = e.due ? dueText(e.due) : null;
  // «Δόση δανείου» με από κάτω «Δόση Δανείου» δεν είναι δεύτερη πληροφορία,
  // είναι η ίδια δύο φορές με άλλα κεφαλαία. Η δεύτερη γραμμή υπάρχει μόνο όταν
  // λέει κάτι που δεν λέει ήδη ο τίτλος.
  const showCat = cat && bare(cat) !== bare(e.title);
  const meta = [showCat ? cat : '', e.recurring ? 'πάγιο' : ''].filter(Boolean).join(' · ');

  return (
    <div className="exp-row">
      <span style={{ ...TT.caption, fontVariantNumeric: 'tabular-nums' }}>
        {shortDate(e.date)}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ ...TT.body, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {e.title}
        </span>
        {(meta || due) && (
          <span style={{ ...TT.caption, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
            {meta && <span>{meta}</span>}
            {/* Η ΠΡΟΘΕΣΜΙΑ ΕΙΝΑΙ ΥΠΕΝΘΥΜΙΣΗ, ΟΧΙ ΣΦΑΛΜΑ. Το ληξιπρόθεσμο κρατά
                τόνο επειδή είναι εξαίρεση και ζητά κίνηση· η επερχόμενη
                προθεσμία δεν ζητά τίποτα ακόμη και μένει ουδέτερη. */}
            {due && (
              <span style={{ color: due.late ? 'var(--warning)' : 'var(--text-tertiary)', fontWeight: 600 }}>
                {meta ? '· ' : ''}{due.text}
              </span>
            )}
          </span>
        )}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* ΜΟΝΟ ΟΠΟΥ ΥΠΑΡΧΕΙ ΚΑΤΙ ΝΑ ΑΛΛΑΞΕΙ. Η γραμμή του απλήρωτου
            λογαριασμού δεν είναι δαπάνη ακόμη: ζει σε άλλον πίνακα, με άλλα
            πεδία. Κουμπί που θα άνοιγε φόρμα δαπάνης πάνω της θα υποσχόταν
            επεξεργασία που δεν γίνεται. */}
        {onEdit && (
          <span className="exp-act">
            <Btn variant="ghost" onClick={onEdit}>Επεξεργασία</Btn>
          </span>
        )}
        {!e.paid && (
          <span className="exp-act">
            <Btn variant="secondary" onClick={onPaid} disabled={busy}>
              {busy ? 'Γίνεται…' : 'Πληρώθηκε'}
            </Btn>
          </span>
        )}
        {/* ── Η ΔΙΑΓΡΑΦΗ ΣΤΗ ΓΡΑΜΜΗ, ΜΕ ΕΝΑ ΠΑΤΗΜΑ ────────────────────────
            Ζούσε μέσα στο παράθυρο επεξεργασίας: για να σβήσει μια λάθος
            καταχώρηση ο χρήστης έπρεπε πρώτα να ανοίξει φόρμα που δεν ήθελε να
            συμπληρώσει. Δύο πατήματα και μια οθόνη, για την πιο κοινή
            διόρθωση.

            ΤΟ ΛΑΘΟΣ ΠΑΤΗΜΑ ΤΟ ΦΥΛΑΕΙ Η ΕΡΩΤΗΣΗ, ΟΧΙ Η ΑΠΟΣΤΑΣΗ. Η
            επιβεβαίωση ονομάζει ποσό και ημερομηνία· η ενέργεια δεν χρειάζεται
            να είναι θαμμένη για να είναι ασφαλής. Και στέκει ΤΕΛΕΥΤΑΙΑ,
            τριτεύουσα, να εμφανίζεται μαζί με τις άλλες ενέργειες της γραμμής
            (αιώρηση ή εστίαση· σε αφή είναι πάντα ορατές). */}
        {onDelete && (
          <span className="exp-act">
            <Btn variant="ghost" onClick={onDelete}>Διαγραφή</Btn>
          </span>
        )}
        {/* Το ποσό είναι ποσό, όχι κρίση. Ηταν κόκκινο σε ΚΑΘΕ ανεξόφλητη
            γραμμή — δηλαδή στις περισσότερες, μόνιμα. */}
        <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
          {fe(e.amount)}
        </span>
      </span>
    </div>
  );
}

// ── ΤΑ ΔΥΟ ΠΕΔΙΑ ΤΗΣ ΦΟΡΜΑΣ, ΓΡΑΜΜΕΝΑ ΜΙΑ ΦΟΡΑ ─────────────────────────────
// Η γεωμετρία ζούσε μέσα στη QuickAdd. Με δεύτερη φόρμα δίπλα (η επεξεργασία)
// θα αντιγραφόταν, και δύο αντίγραφα ενός στυλ αποκλίνουν στην πρώτη διόρθωση.
const FIELD: React.CSSProperties = {
  height: T.h.lg, padding: '0 14px', borderRadius: T.radius.inner,
  border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
  color: 'var(--text-primary)', fontSize: 14, fontFamily: T.font.sans, outline: 'none', width: '100%', boxSizing: 'border-box',
};
const LAB: React.CSSProperties = { display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 5 };

/** Ποσό σε πεδίο κειμένου: δύο δεκαδικά, κόμμα, χωρίς τελεία χιλιάδων. */
const amountText = (n: number): string => n.toFixed(2).replace('.', ',');

// ── ΤΟ ΑΦΜ ΤΟΥ ΠΡΟΜΗΘΕΥΤΗ ─────────────────────────────────────────────────
/**
 * ΤΙ ΕΛΕΙΠΕ: η στήλη `supplier_afm` υπάρχει, ο φάκελος του λογιστή μετρά τις
 * δαπάνες που δεν την έχουν, και η εξαγωγή έχει στήλη γι' αυτήν — αλλά η μόνη
 * διαδρομή που την ΕΓΡΑΦΕ ήταν η σάρωση παραστατικού. Ο,τι γραφόταν με το χέρι
 * έφτανε στον λογιστή χωρίς ΑΦΜ, και το ταίριασμα γινόταν με το όνομα: τρεις
 * διαφορετικοί «Συντήρηση Παπαδόπουλος» είναι τρία διαφορετικά τιμολόγια.
 *
 * Ο ΕΛΕΓΧΟΣ ΕΙΝΑΙ Ο ΥΠΑΡΧΩΝ, ένας για όλη την εφαρμογή (lib/core/greek.ts):
 * εννέα ψηφία με άθροισμα ελέγχου, και δέχεται τα κενά του εκκαθαριστικού
 * («094 014 201»). Στη βάση γράφονται μόνο τα ψηφία, γιατί ο περιορισμός της
 * στήλης είναι `^[0-9]{9}$`.
 */
function AfmField({ value, onChange, note }: { value: string; onChange: (v: string) => void; note: string }) {
  const bad = value.trim() !== '' && !isValidAfm(value);
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <label style={{ flex: '0 1 190px', minWidth: 0 }}>
        <span style={LAB}>ΑΦΜ προμηθευτή;</span>
        <input value={value} onChange={e => onChange(e.target.value)} inputMode="numeric" maxLength={13}
          aria-invalid={bad || undefined}
          style={{ ...FIELD, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}
          placeholder="Εννέα ψηφία" />
      </label>
      {/* Το λάθος λέγεται στη ΘΕΣΗ της οδηγίας, όχι σε δεύτερη γραμμή από κάτω:
          η φόρμα δεν αλλάζει ύψος τη στιγμή που ο χρήστης πληκτρολογεί. */}
      <span style={{ ...TT.caption, flex: '1 1 240px', minWidth: 0, paddingBottom: 11, lineHeight: 1.5 }}>
        {bad ? 'Δεν είναι έγκυρο ΑΦΜ. Εννέα ψηφία, όπως στο παραστατικό.' : note}
      </span>
    </div>
  );
}

const AFM_NOTE = 'Προαιρετικό. Χωρίς αυτό, ο λογιστής ταιριάζει τα παραστατικά με το όνομα.';

// ── ΕΠΕΞΕΡΓΑΣΙΑ ΥΠΑΡΧΟΥΣΑΣ ΔΑΠΑΝΗΣ ────────────────────────────────────────
/**
 * ΤΙ ΔΕΝ ΥΠΗΡΧΕ: καμία οθόνη δεν άλλαζε δαπάνη που είχε ήδη γραφτεί. Ενα λάθος
 * ποσό ή μια λάθος κατηγορία διορθωνόταν μόνο με διαγραφή και ξαναγράψιμο —
 * και η διαγραφή δεν προσφέρεται καν για πληρωμένη δαπάνη (removeIfUnpaid).
 *
 * Η ΚΑΤΗΓΟΡΙΑ ΣΕΡΝΕΙ ΤΗΝ ΟΜΑΔΑ ΜΑΖΙ ΤΗΣ. Το `expense_group` κρίνει την
 * έκπτωση, και μια ενημέρωση που άλλαζε μόνο την κατηγορία θα άφηνε γραμμή
 * «ΕΝΦΙΑ» με ομάδα «fixed», δηλαδή μη εκπεστέα δαπάνη δηλωμένη ως εκπεστέα. Η
 * ομάδα ξαναπαράγεται εδώ από την ταξινομία, όπως και στην καταχώρηση.
 */
function EditExpense({ row, onClose, onSaved }: {
  row: LedgerExpense; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [what, setWhat] = useState((row.description || '').trim());
  const [amount, setAmount] = useState(amountText(Number(row.amount) || 0));
  const [date, setDate] = useState(String(row.date || '').slice(0, 10) || athensToday());
  // ΚΕΝΟ ΣΗΜΑΙΝΕΙ «ΔΕΝ ΤΗΝ ΞΕΡΟΥΜΕ», ΟΧΙ «ΑΛΛΟ». Το κείμενο της βάσης μπορεί να
  // μην είναι στην ταξινομία — αυτές ακριβώς είναι οι γραμμές που «θέλουν μια
  // ματιά» και για τις οποίες ανοίγει η οθόνη. Προεπιλογή «Άλλο» θα έδειχνε
  // κατηγορία που κανείς δεν διάλεξε, και ένα αφηρημένο πάτημα θα την έγραφε.
  const [slug, setSlug] = useState(resolveCategory(row.category) || '');
  const [afm, setAfm] = useState(row.supplier_afm || '');
  const [saving, setSaving] = useState(false);

  const amt = parseAmount(amount);
  const afmOk = afm.trim() === '' || isValidAfm(afm);
  // Το ΑΦΜ λέει μόνο του τι του φταίει, δίπλα στο πεδίο. Εδώ μένει ό,τι δεν
  // φαίνεται αλλού, ώστε το κλειδωμένο κουμπί να μην είναι ποτέ ανεξήγητο.
  const missing = !what.trim() ? 'Θέλει περιγραφή.'
    : (amt === null || amt <= 0) ? 'Θέλει ποσό μεγαλύτερο από μηδέν.'
    : null;
  const ready = !missing && afmOk;

  const save = async () => {
    if (!ready || amt === null) return;
    setSaving(true);
    try {
      const cat = slug ? BY_SLUG[slug] : null;
      const { error } = await expenseStore.update(supabase, row.id, {
        description: what.trim(),
        amount: amt,
        date,
        // Χωρίς επιλογή, η κατηγορία της βάσης μένει ακριβώς όπως είναι: η
        // ενημέρωση διορθώνει ό,τι άγγιξε ο χρήστης και τίποτα άλλο.
        ...(cat ? { category: cat.label, expense_group: expenseStore.groupOf(cat.label) } : {}),
        supplier_afm: afm.trim() ? afmDigits(afm) : null,
      });
      if (error) throw error;
      notify('Αποθηκεύτηκε');
      onClose();
      await onSaved();
    } catch { notifyError('Δεν αποθηκεύτηκε. Δοκίμασε ξανά.'); }
    finally { setSaving(false); }
  };

  return (
    // Η ΔΙΑΓΡΑΦΗ ΔΕΝ ΕΙΝΑΙ ΕΔΩ, ΚΑΙ ΕΙΝΑΙ ΑΠΟΦΑΣΗ. Ζει στη ΓΡΑΜΜΗ, όπου φτάνει
    // με ένα πάτημα: η πιο κοινή διόρθωση δεν πρέπει να περνά από φόρμα που ο
    // χρήστης δεν ήθελε να ανοίξει. Και δεν προσφέρεται και στα δύο σημεία —
    // δύο δρόμοι για την ίδια οριστική ενέργεια είναι δύο ευκαιρίες να πατηθεί
    // κατά λάθος.
    <Modal open onClose={onClose} title="Επεξεργασία δαπάνης" width={560}
      footerInfo={missing ?? undefined}
      footer={<>
        <Btn variant="secondary" onClick={onClose}>Ακύρωση</Btn>
        <Btn variant="primary" onClick={save} disabled={saving || !ready}>
          {saving ? 'Γίνεται…' : 'Αποθήκευση'}
        </Btn>
      </>}>
      <label style={{ display: 'block', minWidth: 0 }}>
        <span style={LAB}>Τι ήταν;</span>
        <input value={what} onChange={e => setWhat(e.target.value)} style={FIELD}
          placeholder="Παράδειγμα: λογαριασμός ΔΕΗ, υδραυλικός" />
      </label>

      {/* Ίδια γεωμετρία με την καταχώρηση: το ευρώ μέσα στο πεδίο, δεξιά. */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ flex: '0 1 150px', minWidth: 0, position: 'relative' }}>
          <span style={LAB}>Πόσο;</span>
          <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal"
            style={{ ...FIELD, paddingRight: 34, textAlign: 'right', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}
            placeholder="0,00" />
          <span aria-hidden style={{ position: 'absolute', right: 14, bottom: 0, height: T.h.lg, display: 'flex', alignItems: 'center', fontSize: 14, color: 'var(--text-tertiary)', pointerEvents: 'none' }}>€</span>
        </label>
        <div style={{ flex: '1 1 190px', minWidth: 0 }}>
          <span style={LAB}>Πότε;</span>
          <DatePicker value={date} onChange={setDate} />
        </div>
      </div>

      {/* ΠΛΗΡΗΣ ΚΑΤΑΛΟΓΟΣ, ΟΧΙ ΠΡΟΤΑΣΕΙΣ. Στην καταχώρηση τα πλακίδια μαντεύουν
          από την περιγραφή, γιατί εκεί δεν υπάρχει ακόμη κατηγορία. Εδώ υπάρχει
          και ο λόγος που άνοιξε η οθόνη είναι συχνά ότι είναι λάθος: μια λίστα
          με ΟΛΕΣ τις κατηγορίες απαντά σε αυτό, έξι πλακίδια όχι. */}
      <div style={{ minWidth: 0 }}>
        <span style={LAB}>Τι κατηγορία;</span>
        <CustomSelect value={slug} onChange={setSlug} ariaLabel="Κατηγορία δαπάνης"
          placeholder="Χωρίς κατηγορία"
          options={CATEGORIES.map(c => ({ value: c.slug, label: c.label }))} />
      </div>

      <AfmField value={afm} onChange={setAfm} note={AFM_NOTE} />
    </Modal>
  );
}

function QuickAdd({ propertyId, userId, onDone }: { propertyId: string; userId: string; onDone: () => void }) {
  const supabase = createClient();
  const today = athensToday();
  const [what, setWhat] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [picked, setPicked] = useState<string>('');
  const [touched, setTouched] = useState(false);
  const [paid, setPaid] = useState(true);
  const [due, setDue] = useState('');
  // ── ΠΟΙΟΣ ΠΛΗΡΩΝΕΙ ────────────────────────────────────────────────────────
  // Το μοντέλο διαμοιρασμού (lib/expenses/sharing.ts) διαβάζεται σε όλη την
  // εφαρμογή — προϋπολογισμός, εξόφληση λογαριασμού, λογιστική — αλλά ΓΡΑΦΟΤΑΝ
  // μόνο από τη φόρμα των «Συμβολαίων», δηλαδή από τη δεύτερη φόρμα δαπάνης που
  // δεν έπρεπε να υπάρχει. Ζει τώρα εδώ, στη μία φόρμα.
  const [paidBy, setPaidBy] = useState('owner');
  const [sharePct, setSharePct] = useState('');
  // ΑΦΜ προμηθευτή: το πεδίο που ζητά ο φάκελος του λογιστή και δεν υπήρχε
  // πουθενά στη χειροκίνητη καταχώρηση. Βλ. AfmField παραπάνω.
  const [afm, setAfm] = useState('');
  const [saving, setSaving] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => { first.current?.focus(); }, []);

  // Η κατηγορία μαντεύεται από την περιγραφή, μέχρι ο χρήστης να τη διορθώσει.
  // Μόλις την αγγίξει, σταματάμε να μαντεύουμε: τίποτα πιο εκνευριστικό από
  // πεδίο που αλλάζει μόνο του αφού το διόρθωσες.
  const slug = touched ? picked : (resolveCategory(what) || '');
  // Η ΕΠΙΛΕΓΜΕΝΗ ΚΑΤΗΓΟΡΙΑ ΕΞΑΦΑΝΙΖΟΤΑΝ. Οι προτάσεις έβγαιναν από το κείμενο,
  // και μόλις ο χρήστης άγγιζε ένα πλακίδιο η αναζήτηση μηδενιζόταν: έμεναν οι
  // έξι πρώτες κατηγορίες του καταλόγου. Αν είχε διαλέξει «Υδραυλικός», η
  // επιλογή του δεν φαινόταν πουθενά — η φόρμα έδειχνε έξι πλακίδια, κανένα
  // αναμμένο, και ο χρήστης δεν είχε τρόπο να ξέρει τι θα αποθηκευτεί.
  const suggestions = useMemo(() => {
    const base = searchCategories(touched ? '' : what, 6);
    if (!slug || base.some(c => c.slug === slug)) return base;
    const chosen = BY_SLUG[slug];
    return chosen ? [chosen, ...base.slice(0, 5)] : base;
  }, [what, touched, slug]);

  const afmOk = afm.trim() === '' || isValidAfm(afm);

  const save = async () => {
    // ΕΝΑΣ ΑΝΑΓΝΩΣΤΗΣ ΠΟΣΟΥ ΓΙΑ ΟΛΗ ΤΗΝ ΕΦΑΡΜΟΓΗ. Ηταν
    // `parseFloat(amount.replace(',', '.'))`: το «1.234,56» γινόταν «1.234.56»
    // και μετά 1,23 ευρώ — τρεις τάξεις μεγέθους λάθος, σιωπηλά, στη μία φόρμα
    // καταχώρησης. Το `parseAmount` κρίνει από το τελευταίο σύμβολο και το
    // διαβάζει σωστά και στις δύο γραφές, με 19 ελέγχους από πίσω.
    const amt = parseAmount(amount);
    if (!what.trim() || amt === null || amt <= 0 || !afmOk) return;
    setSaving(true);
    try {
      // Ο SUPABASE ΔΕΝ ΠΕΤΑΕΙ ΕΞΑΙΡΕΣΗ ΣΕ ΣΦΑΛΜΑ ΒΑΣΗΣ — ΕΠΙΣΤΡΕΦΕΙ { error }.
      //
      // Χωρίς αποδόμηση του `error`, η κλήση «πετύχαινε» πάντα: το catch από
      // κάτω δεν ενεργοποιούνταν ποτέ, ο χρήστης έπαιρνε «Καταχωρήθηκε» και το
      // onDone() έκλεινε τη φόρμα. Η δαπάνη είχε χαθεί και εκείνος το αγνοούσε.
      // Παραβίαση RLS, περιορισμός στήλης ή πεσμένο δίκτυο έδιναν όλα το ίδιο:
      // ψεύτικη επιβεβαίωση.
      const cat = slug ? BY_SLUG[slug] : null;
      // Το ποσοστό έχει νόημα μόνο στις μοιρασμένες περιπτώσεις· αλλιώς μένει
      // κενό, ώστε να μη γραφτεί «50%» σε δαπάνη που πληρώνει ολόκληρη ο ίδιος.
      const pct = SHARED_SCOPES.has(paidBy) ? parseInt(sharePct, 10) : NaN;
      const sharing = {
        paid_by: paidBy,
        share_percent: Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : null,
      };

      if (!paid) {
        // ΤΟ ΑΠΛΗΡΩΤΟ ΕΙΝΑΙ ΥΠΟΧΡΕΩΣΗ, ΟΧΙ ΔΑΠΑΝΗ ΠΟΥ ΕΓΙΝΕ.
        //
        // Πριν, η «ημερομηνία λήξης» γραφόταν στη στήλη `date` μιας δαπάνης —
        // δηλαδή στη στήλη που σημαίνει «πότε ΕΓΙΝΕ», όχι «πότε ΛΗΓΕΙ». Τρία
        // πράγματα χάνονταν μαζί: ο χρήστης δεν έβλεπε ποτέ «λήγει σε 3 μέρες»
        // (η προθεσμία στον πυρήνα έρχεται από τον λογαριασμό), η υποχρέωση δεν
        // εμφανιζόταν στους Λογαριασμούς ούτε στα ληξιπρόθεσμα, και το ποσό
        // μετρούσε σε ΜΕΛΛΟΝΤΙΚΟ μήνα.
        //
        // Ο πυρήνας (lib/expenses/ledger.ts) ήδη ξέρει τι είναι: απλήρωτος
        // λογαριασμός που μετράει στην ημερομηνία λήξης του.
        const { error } = await billStore.add(supabase, propertyId, userId, {
          name: what.trim(),
          amount: amt,
          category: slug || 'other',
          due_date: due || date,
          paid: false,
          recurring: false,
          ...sharing,
        });
        if (error) throw error;
      } else {
        // Η ΟΜΑΔΑ ΕΙΝΑΙ ΤΟ ΠΕΔΙΟ ΠΟΥ ΚΡΙΝΕΙ ΤΗΝ ΕΚΠΤΩΣΗ, ΚΑΙ ΔΕΝ ΓΡΑΦΟΤΑΝ. Η
        // κύρια, διαφημισμένη διαδρομή καταχώρησης παρήγαγε δαπάνες με κενή
        // ομάδα — που το isGroupDeductible θεωρεί ΜΗ εκπεστέες. Την παράγει
        // πλέον το στρώμα, από την κατηγορία, για κάθε οθόνη το ίδιο.
        const { error } = await expenseStore.insert(supabase, [{
          ...expenseStore.row({ propertyId, userId }, {
            description: what.trim(),
            amount: amt,
            date,
            category: cat ? cat.label : 'Άλλο',
            paid: true,
            // Μόνο τα ψηφία: ο περιορισμός της στήλης είναι `^[0-9]{9}$`, και το
            // «094 014 201» του εκκαθαριστικού θα το απέρριπτε η βάση.
            supplier_afm: afm.trim() ? afmDigits(afm) : null,
          }),
          ...sharing,
        }]);
        if (error) throw error;
      }
      notify(paid ? 'Καταχωρήθηκε' : 'Καταχωρήθηκε ως εκκρεμής υποχρέωση');
      onDone();
    } catch { notifyError('Δεν αποθηκεύτηκε. Δοκίμασε ξανά.'); }
    finally { setSaving(false); }
  };

  return (
    <Card pad="sm" style={{ marginBottom: T.sp.md }}>
      {/* ── ΤΑ ΠΕΔΙΑ ΕΧΟΥΝ ΦΥΣΙΚΟ ΠΛΑΤΟΣ ────────────────────────────────────
          Ήταν `repeat(auto-fit, minmax(160px, 1fr))`: σε οθόνη 1.500 το πεδίο
          του ποσού γινόταν 350 εικονοστοιχείων για τέσσερα ψηφία, και ο
          επιλογέας «Ποιος πληρώνει» έπιανε ολόκληρη τη γραμμή για τέσσερις
          λέξεις. Το μέγεθος ενός πεδίου είναι υπόσχεση για το περιεχόμενό του.

          Οι ΙΔΙΕΣ στήλες στις δύο σειρές, ώστε το «Ποιος πληρώνει» να πέφτει
          ακριβώς κάτω από το «Τι ήταν;» και το μερίδιο κάτω από το ποσό. */}
      <style>{`
        /* ΕΝΑ ΜΕΤΡΟ ΓΙΑ ΟΛΗ ΤΗ ΦΟΡΜΑ. Τα πεδία πιάνουν 824 εικονοστοιχεία
           (460+12+150+12+190) και το κουμπί καθόταν στο δεξί άκρο μιας κάρτας
           1.100: η γραμμή της ενέργειας δεν είχε καμία σχέση με τη γραμμή των
           πεδίων. Τώρα κάθε σειρά τελειώνει στην ίδια κάθετη. */
        .qa-form { max-width: 824px; }
        .qa-grid { display: grid; gap: 12px; align-items: end;
          grid-template-columns: minmax(200px, 460px) minmax(110px, 150px) minmax(150px, 190px); }
        @media (max-width: 760px) { .qa-grid { grid-template-columns: 1fr 1fr; }
          .qa-grid > .qa-wide { grid-column: 1 / -1; } }
        @media (max-width: 420px) { .qa-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div className="qa-form">
      <div className="qa-grid">
        <label className="qa-wide" style={{ minWidth: 0 }}>
          <span style={LAB}>Τι ήταν;</span>
          <input ref={first} value={what} onChange={e => setWhat(e.target.value)} style={FIELD}
            placeholder="Παράδειγμα: λογαριασμός ΔΕΗ, υδραυλικός" />
        </label>
        {/* Το ευρώ ζει ΜΕΣΑ στο πεδίο, δεξιά, όπως σε κάθε άλλο ποσό της
            εφαρμογής. Χωρίς αυτό, ένα κενό κουτί δίπλα στη λέξη «Πόσο;» δεν
            έλεγε καν σε τι μονάδα απαντά ο χρήστης. */}
        <label style={{ minWidth: 0, position: 'relative' }}>
          <span style={LAB}>Πόσο;</span>
          <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal"
            style={{ ...FIELD, paddingRight: 34, textAlign: 'right', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}
            placeholder="0,00" />
          <span aria-hidden style={{ position: 'absolute', right: 14, bottom: 0, height: T.h.lg, display: 'flex', alignItems: 'center', fontSize: 14, color: 'var(--text-tertiary)', pointerEvents: 'none' }}>€</span>
        </label>
        {/* ΤΟ ΗΜΕΡΟΛΟΓΙΟ ΤΟΥ ΠΕΡΙΗΓΗΤΗ ΕΙΝΑΙ ΑΓΓΛΙΚΟ. Εδώ ζούσε ένα
            `<input type="date">`: άνοιγε «August 2026», με «Su Mo Tu», «Clear»
            και «Today», μέσα σε ελληνική οθόνη — και η γραμμή 08/09/2026 δεν
            έλεγε καν αν είναι 8 Σεπτεμβρίου ή 9 Αυγούστου, γιατί τη μορφή την
            επιλέγει η γλώσσα του περιηγητή. Ο επιλογέας της εφαρμογής είναι
            ελληνικός, με Δευτέρα πρώτη, και ο ίδιος σε κάθε οθόνη. */}
        <div style={{ minWidth: 0 }}>
          <span style={LAB}>{paid ? 'Πότε;' : 'Λήγει;'}</span>
          <DatePicker value={paid ? date : (due || date)}
            onChange={v => (paid ? setDate(v) : setDue(v))} />
        </div>
      </div>

      {/* ΜΙΑ ΓΛΩΣΣΑ. Οι μισές ετικέτες ρωτούσαν («Τι ήταν;», «Πόσο;») και οι
          άλλες μισές ονόμαζαν («Κατηγορία», «Πληρωμένη»): δύο ύφη στην ίδια
          φόρμα, έξι γραμμές απόσταση. Ρωτούν όλες. */}
      <div style={{ marginTop: 16 }}>
        <span style={LAB}>Τι κατηγορία;</span>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {suggestions.map(c => {
            const on = slug === c.slug;
            return (
              // ΤΟ ΔΕΥΤΕΡΟ ΠΑΤΗΜΑ ΞΕΔΙΑΛΕΓΕΙ. Το πλακίδιο κλείδωνε: μια
              // κατηγορία πατημένη κατά λάθος έμενε εκεί, και ο μόνος τρόπος να
              // φύγει ήταν να διαλέξει ο χρήστης ΑΛΛΗ — δηλαδή να πει κάτι που
              // δεν εννοεί. Ξεδιαλέγοντας, η φόρμα γυρίζει στη μαντεψιά από την
              // περιγραφή, που είναι ακριβώς η κατάσταση πριν το λάθος πάτημα.
              <button key={c.slug} type="button" aria-pressed={on}
                onClick={() => { if (on) { setPicked(''); setTouched(false); } else { setPicked(c.slug); setTouched(true); } }}
                style={{
                  appearance: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
                  padding: '7px 14px', borderRadius: T.radius.pill,
                  border: `1px solid ${on ? 'color-mix(in srgb, var(--accent) 50%, transparent)' : 'var(--border-default)'}`,
                  background: on ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                  color: on ? 'var(--accent)' : 'var(--text-secondary)',
                  fontWeight: on ? 700 : 500, transition: 'background-color .15s, border-color .15s, color .15s, box-shadow .15s, transform .15s, opacity .15s',
                }}>
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── ΠΟΙΟΣ ΠΛΗΡΩΝΕΙ, ΚΑΙ ΑΝ ΠΛΗΡΩΘΗΚΕ ──────────────────────────────
          Δεν είναι πάντα ο ιδιοκτήτης: κοινόχρηστα που βαραίνουν τον ενοικιαστή
          δεν είναι δικό του κόστος, και ένα διαμέρισμα με συνιδιοκτήτη μοιράζει
          κάθε λογαριασμό. Το ποσοστό εμφανίζεται μόνο όταν αποκτά νόημα.

          Ο ΔΙΑΚΟΠΤΗΣ ΗΤΑΝ ΤΕΤΡΑΓΩΝΑΚΙ ΤΟΥ ΠΕΡΙΗΓΗΤΗ, ΜΟΝΟ ΤΟΥ ΣΤΟ ΑΡΙΣΤΕΡΟ
          ΑΚΡΟ, και έλεγε «Δεν το έχω πληρώσει ακόμη»: διπλή άρνηση, που ο
          χρήστης έπρεπε να λύσει στο μυαλό του για να καταλάβει τι σημαίνει
          τσεκαρισμένο. Τώρα είναι πεδίο σαν τα άλλα, με θετική διατύπωση, και
          στέκεται δίπλα στα υπόλοιπα αντί να αιωρείται. */}
      <div className="qa-grid" style={{ marginTop: 14 }}>
        {/* Η ετικέτα μένει η κοινή `LAB`, όχι αυτή του CustomSelect: όλη η φόρμα
            χρησιμοποιεί την ίδια, και η ενσωματωμένη έχει minHeight 32, οπότε θα
            ξεχώριζε η μία γραμμή από τις άλλες ακριβώς δίπλα της. */}
        <div className="qa-wide" style={{ minWidth: 0 }}>
          <span style={LAB}>Ποιος πληρώνει;</span>
          <CustomSelect value={paidBy} onChange={setPaidBy} options={PAID_BY_OPTIONS} />
        </div>
        {SHARED_SCOPES.has(paidBy) && (
          <label style={{ minWidth: 0 }}>
            <span style={LAB}>Πόσο δικό μου;</span>
            <input value={sharePct} onChange={e => setSharePct(e.target.value)} inputMode="numeric"
              style={{ ...FIELD, textAlign: 'right', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}
              placeholder={`${DEFAULT_SHARE_PERCENT} %`} />
          </label>
        )}
        <div style={{ minWidth: 0 }}>
          <span style={LAB}>Πληρώθηκε;</span>
          <div style={{ height: T.h.lg, display: 'flex', alignItems: 'center' }}>
            <Toggle on={paid} onChange={setPaid} ariaLabel="Πληρώθηκε" />
          </div>
        </div>
      </div>

      {/* ΜΟΝΟ ΣΤΗΝ ΠΛΗΡΩΜΕΝΗ. Η απλήρωτη γραμμή γράφεται στον πίνακα των
          λογαριασμών, που ΔΕΝ έχει στήλη ΑΦΜ: ένα πεδίο που θα φαινόταν και
          δεν θα αποθηκευόταν είναι χειρότερο από πεδίο που λείπει. Το ΑΦΜ
          μπαίνει μετά την εξόφληση, από την επεξεργασία της δαπάνης. */}
      {paid && (
        <div style={{ marginTop: 14 }}>
          <AfmField value={afm} onChange={setAfm} note={AFM_NOTE} />
        </div>
      )}

      {/* Η ΓΡΑΜΜΗ ΤΗΣ ΕΝΕΡΓΕΙΑΣ ΛΕΕΙ ΤΙ ΘΑ ΓΙΝΕΙ. Ήταν ένα κουμπί καρφωμένο
          δεξιά και τίποτα άλλο σε ολόκληρο το πλάτος. Η απλήρωτη δαπάνη ΔΕΝ
          γράφεται στις δαπάνες: γίνεται υποχρέωση με προθεσμία, και αυτό είναι
          ακριβώς η πληροφορία που λείπει τη στιγμή της απόφασης. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
        <span style={{ ...TT.caption, minWidth: 0, flex: '1 1 260px' }}>
          {paid
            ? 'Μπαίνει στις δαπάνες του μήνα που διάλεξες.'
            : 'Μπαίνει στα απλήρωτα και εμφανίζεται στο Ημερολόγιο μέχρι να πληρωθεί.'}
        </span>
        {/* Το κουμπί κλειδώνει και σε άκυρο ΑΦΜ: ο περιορισμός της στήλης θα το
            απέρριπτε ούτως ή άλλως, και τότε ο χρήστης θα έχανε ολόκληρη τη
            φόρμα για ένα ψηφίο. */}
        <Btn variant="primary" onClick={save} disabled={saving || !what.trim() || !amount || !afmOk}>
          {saving ? 'Γίνεται…' : 'Καταχώρησε'}
        </Btn>
      </div>
      </div>
    </Card>
  );
}
