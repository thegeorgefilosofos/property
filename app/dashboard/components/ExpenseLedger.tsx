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
import ExpenseCompare from './ExpenseCompare';
import type { Spend } from '@/lib/expenses/compare';
import { T, TT, fe, Btn, Card, EmptyState, Skeleton } from '@/components/Theme';
import { notify, notifyError } from '@/components/toastBus';
import {
  mergeLedger, ledgerTotal, groupByMonth,
  type LedgerEntry, type LedgerBill, type LedgerExpense,
} from '@/lib/expenses/ledger';
import { categoryLabel, resolveCategory, searchCategories, BY_SLUG } from '@/lib/expenses/taxonomy';
import { planBillPayment } from '@/lib/expenses/pay';
import { groupForCategory } from '@/lib/expenses/groups';
import { athensToday, athensMonth } from '@/lib/core/time';

interface Props {
  propertyId: string;
  userId: string;
  /** Ενεργό πλάνο: ορίζει πόσες γραμμές δέχεται η μαζική καταχώρηση. */
  /** Ανοίγει το υπάρχον παράθυρο σάρωσης της εφαρμογής. */
  onScan?: () => void;
}

const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος',
  'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];

const monthLabel = (m: string): string => {
  const [y, mm] = m.split('-');
  const i = parseInt(mm, 10) - 1;
  if (!MONTHS[i]) return m;
  const now = new Date();
  const sameYear = String(now.getFullYear()) === y;
  return sameYear ? MONTHS[i] : `${MONTHS[i]} ${y}`;
};

/** «24/07» για φέτος, «24/07/25» για παλιότερα. Η χρονιά μπαίνει μόνο όταν μετρά. */
const shortDate = (d: string): string => {
  if (!d) return '—';
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
    supabase.from('bills')
      .select('id,name,category,amount,due_date,paid,paid_at,recurring,created_at')
      .eq('property_id', propertyId),
    supabase.from('expenses')
      .select('id,bill_id,description,category,expense_group,amount,date,paid,store_vendor,is_recurring')
      .eq('property_id', propertyId).eq('user_id', userId)
      .neq('category', 'tenant_extra'),
  ]);
  return {
    bills: (b.data ?? []) as LedgerBill[],
    expenses: (e.data ?? []) as LedgerExpense[],
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

  // «Θέλουν ματιά»: διπλές γραμμές και όσες δεν έχουν αναγνωρίσιμη κατηγορία.
  // Δεν είναι σφάλμα του χρήστη και δεν παρουσιάζεται ως τέτοιο: είναι δουλειά
  // πέντε δευτερολέπτων που κάνει τα υπόλοιπα νούμερα να στέκουν.
  const needsEye = useMemo(
    () => [...duplicates, ...entries.filter(e => !resolveCategory(e.category))],
    [duplicates, entries]);

  const markPaid = async (e: LedgerEntry) => {
    setBusy(e.key);
    try {
      const today = athensToday();
      if (e.billId) {
        // ΜΙΑ ΑΠΟΦΑΣΗ, ΚΟΙΝΗ ΜΕ ΤΗΝ ΟΘΟΝΗ ΛΟΓΑΡΙΑΣΜΩΝ (lib/expenses/pay.ts).
        // Εδώ η δαπάνη γραφόταν ΧΩΡΙΣ expense_group — και το isGroupDeductible
        // επιστρέφει false για κενή ομάδα. Ο ίδιος λογαριασμός εξέπιπτε αν τον
        // πλήρωνες από τους Λογαριασμούς και ΔΕΝ εξέπιπτε από εδώ.
        const { data: linked } = await supabase.from('expenses').select('id').eq('bill_id', e.billId).limit(1);
        const { data: billRow } = await supabase.from('bills')
          .select('id,name,amount,category,paid_by,share_percent,share_note').eq('id', e.billId).maybeSingle();
        const plan = planBillPayment(
          billRow ?? { id: e.billId, name: e.title, amount: e.amount, category: e.category },
          { propertyId, userId, nowIso: new Date().toISOString(), hasLinkedExpense: !!(linked && linked.length) },
        );
        const { error: bErr } = await supabase.from('bills').update(plan.bill).eq('id', e.billId);
        if (bErr) throw bErr;
        if (plan.linkedExpenseUpdate) {
          const { error } = await supabase.from('expenses').update(plan.linkedExpenseUpdate).eq('bill_id', e.billId);
          if (error) throw error;
        } else if (plan.newExpense) {
          const { error } = await supabase.from('expenses').insert(plan.newExpense);
          if (error) throw error;
        }
      } else if (e.expenseId) {
        await supabase.from('expenses').update({ paid: true }).eq('id', e.expenseId);
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
          sub={unpaid.length ? `${unpaid.length} ${unpaid.length === 1 ? 'γραμμή' : 'γραμμές'}` : undefined}
          tone={unpaid.length ? 'warn' : undefined} />
        <Figure label="φέτος" value={loading ? null : fe(ledgerTotal(entries.filter(e => e.date.startsWith(String(new Date().getFullYear())))))} />
      </div>

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
      <div style={{ display: 'flex', gap: T.sp.sm, flexWrap: 'wrap', alignItems: 'center', marginBottom: T.sp.lg }}>
        <Btn variant="primary" onClick={() => setAdding(v => !v)}>{adding ? 'Άκυρο' : '+  Νέα δαπάνη'}</Btn>
        <div style={{ flex: 1 }} />
        {/* Ίδιο ύψος και ίδιο σχήμα με τα κουμπιά δίπλα του. Πριν ήταν ψηλότερο
            και πιο στρογγυλό, και η σειρά έμοιαζε στοιχισμένη κατά λάθος. */}
        <input
          value={q} onChange={ev => setQ(ev.target.value)}
          placeholder="Αναζήτηση"
          aria-label="Αναζήτηση δαπανών"
          style={{
            width: 190, height: T.h.md, padding: '0 14px', boxSizing: 'border-box',
            borderRadius: T.radius.btn, border: '1px solid var(--border-default)',
            background: 'var(--bg-surface)', color: 'var(--text-primary)',
            fontSize: 13, fontFamily: T.font.sans, outline: 'none',
          }}
        />
      </div>

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
                <span style={{ display: 'block', fontFamily: T.font.sans, fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                  Φωτογράφισε ή ανέβασε αρχείο
                </span>
                <span style={{ display: 'block', fontFamily: T.font.sans, fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  Απόδειξη, λογαριασμός ή PDF — συμπληρώνεται μόνο του
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
          hint="Τράβα μια φωτογραφία ενός λογαριασμού και μπαίνει μόνος του. Ή γράψ' τον με το χέρι, θέλει πέντε δευτερόλεπτα."
          action={onScan ? <Btn variant="primary" onClick={onScan}>Φωτογραφία λογαριασμού</Btn> : <Btn variant="primary" onClick={() => setAdding(true)}>Νέα δαπάνη</Btn>}
        />
      ) : months.length === 0 ? (
        <EmptyState title="Καμία δαπάνη με αυτή την αναζήτηση" hint={`Δεν βρέθηκε τίποτα για «${q}».`}
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
                  <Row key={e.key} e={e} busy={busy === e.key} onPaid={() => markPaid(e)} />
                ))}
              </div>
            </div>
          ))}
        </Card>
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
 * και επιστρέφει πάνω. Το μηδέν μένει ΟΥΔΕΤΕΡΟ: κόκκινο μηδέν στα «απλήρωτα»
 * θα σήμαινε πρόβλημα εκεί που δεν υπάρχει κανένα.
 */
function Figure({ label, value, sub, tone }: { label: string; value: string | null; sub?: string; tone?: 'warn' }) {
  return (
    <div>
      <div style={{ ...TT.label, marginBottom: 8 }}>{label}</div>
      <div style={{ ...TT.kpi, fontSize: 20, color: tone === 'warn' ? 'var(--negative)' : 'var(--text-primary)' }}>
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

function Row({ e, busy, onPaid }: { e: LedgerEntry; busy: boolean; onPaid: () => void }) {
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
            {due && (
              <span style={{ color: due.late ? 'var(--negative)' : 'var(--warning)', fontWeight: 600 }}>
                {meta ? '· ' : ''}{due.text}
              </span>
            )}
          </span>
        )}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {!e.paid && (
          <span className="exp-act">
            <Btn variant="secondary" onClick={onPaid} disabled={busy}>
              {busy ? 'Γίνεται…' : 'Πληρώθηκε'}
            </Btn>
          </span>
        )}
        <span style={{ fontSize: 14.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: e.paid ? 'var(--text-primary)' : 'var(--negative)', whiteSpace: 'nowrap' }}>
          {fe(e.amount)}
        </span>
      </span>
    </div>
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
  const [saving, setSaving] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => { first.current?.focus(); }, []);

  // Η κατηγορία μαντεύεται από την περιγραφή, μέχρι ο χρήστης να τη διορθώσει.
  // Μόλις την αγγίξει, σταματάμε να μαντεύουμε: τίποτα πιο εκνευριστικό από
  // πεδίο που αλλάζει μόνο του αφού το διόρθωσες.
  const slug = touched ? picked : (resolveCategory(what) || '');
  const suggestions = useMemo(() => searchCategories(touched ? '' : what, 6), [what, touched]);

  const save = async () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!what.trim() || !Number.isFinite(amt) || amt <= 0) return;
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
        const { error } = await supabase.from('bills').insert({
          property_id: propertyId, user_id: userId,
          name: what.trim(),
          amount: amt,
          category: slug || 'other',
          due_date: due || date,
          paid: false,
          recurring: false,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('expenses').insert({
          property_id: propertyId, user_id: userId,
          description: what.trim(),
          amount: amt,
          date,
          category: cat ? cat.label : 'Άλλο',
          // Η ΟΜΑΔΑ ΕΙΝΑΙ ΤΟ ΠΕΔΙΟ ΠΟΥ ΚΡΙΝΕΙ ΤΗΝ ΕΚΠΤΩΣΗ, ΚΑΙ ΔΕΝ ΓΡΑΦΟΤΑΝ.
          // Η κύρια, διαφημισμένη διαδρομή καταχώρισης παρήγαγε δαπάνες με κενή
          // ομάδα — που το isGroupDeductible θεωρεί ΜΗ εκπεστέες. Ο υδραυλικός
          // των 60 € δεν μετρούσε, ενώ ο ίδιος υδραυλικός από άλλη οθόνη
          // μετρούσε. Παράγεται τώρα από την κατηγορία, με έλεγχο συνέπειας.
          expense_group: groupForCategory(cat),
          paid: true,
          paid_by: 'owner',
        });
        if (error) throw error;
      }
      notify(paid ? 'Καταχωρήθηκε' : 'Καταχωρήθηκε ως εκκρεμής υποχρέωση');
      onDone();
    } catch { notifyError('Δεν αποθηκεύτηκε. Δοκίμασε ξανά.'); }
    finally { setSaving(false); }
  };

  const field: React.CSSProperties = {
    height: T.h.lg, padding: '0 14px', borderRadius: T.radius.inner,
    border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
    color: 'var(--text-primary)', fontSize: 14, fontFamily: T.font.sans, outline: 'none', width: '100%', boxSizing: 'border-box',
  };
  const lab: React.CSSProperties = { display: 'block', fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 5 };

  return (
    <Card pad="sm" style={{ marginBottom: T.sp.md }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 12 }}>
        <label style={{ gridColumn: 'span 2', minWidth: 0 }}>
          <span style={lab}>Τι ήταν;</span>
          <input ref={first} value={what} onChange={e => setWhat(e.target.value)} style={field}
            placeholder="π.χ. λογαριασμός ΔΕΗ, υδραυλικός" />
        </label>
        <label>
          <span style={lab}>Πόσο;</span>
          <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" style={field} placeholder="0,00" />
        </label>
        <label>
          <span style={lab}>{paid ? 'Πότε;' : 'Λήγει;'}</span>
          <input type="date" value={paid ? date : (due || date)}
            onChange={e => (paid ? setDate(e.target.value) : setDue(e.target.value))} style={field} />
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <span style={lab}>Κατηγορία</span>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {suggestions.map(c => {
            const on = slug === c.slug;
            return (
              <button key={c.slug} type="button"
                onClick={() => { setPicked(c.slug); setTouched(true); }}
                style={{
                  appearance: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
                  padding: '7px 14px', borderRadius: T.radius.pill,
                  border: `1px solid ${on ? 'color-mix(in srgb, var(--accent) 50%, transparent)' : 'var(--border-default)'}`,
                  background: on ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                  color: on ? 'var(--accent)' : 'var(--text-secondary)',
                  fontWeight: on ? 700 : 500, transition: 'all .15s',
                }}>
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={!paid} onChange={e => setPaid(!e.target.checked)} />
          Δεν το έχω πληρώσει ακόμη
        </label>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={save} disabled={saving || !what.trim() || !amount}>
          {saving ? 'Γίνεται…' : 'Καταχώρησε'}
        </Btn>
      </div>
    </Card>
  );
}
