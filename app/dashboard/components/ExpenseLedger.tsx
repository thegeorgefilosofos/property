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
import { T, fe, Btn, Card, EmptyState, Skeleton } from '@/components/Theme';
import { notify, notifyError } from '@/components/toastBus';
import {
  mergeLedger, ledgerTotal, groupByMonth,
  type LedgerEntry, type LedgerBill, type LedgerExpense,
} from '@/lib/expenses/ledger';
import { categoryLabel, resolveCategory, searchCategories, BY_SLUG } from '@/lib/expenses/taxonomy';
import { parseBulk, bulkLimit } from '@/lib/expenses/bulk';

interface Props {
  propertyId: string;
  userId: string;
  /** Ενεργό πλάνο: ορίζει πόσες γραμμές δέχεται η μαζική καταχώρηση. */
  plan?: string;
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

export default function ExpenseLedger({ propertyId, userId, plan = 'free', onScan }: Props) {
  // Ένα instance ανά component. Χωρίς useMemo, κάθε render έφτιαχνε νέο client
  // και το κανάλι realtime ξαναδενόταν χωρίς λόγο.
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(!!propertyId);
  const [bills, setBills] = useState<LedgerBill[]>([]);
  const [expenses, setExpenses] = useState<LedgerExpense[]>([]);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

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
  const thisMonth = new Date().toISOString().slice(0, 7);
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
      const today = new Date().toISOString().slice(0, 10);
      if (e.billId) {
        await supabase.from('bills').update({ paid: true, paid_at: new Date().toISOString() }).eq('id', e.billId);
        const { data: linked } = await supabase.from('expenses').select('id').eq('bill_id', e.billId).limit(1);
        if (linked && linked.length) {
          await supabase.from('expenses').update({ paid: true }).eq('bill_id', e.billId);
        } else {
          await supabase.from('expenses').insert({
            property_id: propertyId, user_id: userId, bill_id: e.billId,
            amount: e.amount, description: e.title, date: today,
            category: e.category || 'Άλλο', paid: true,
          });
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
        .exp-month {
          position: sticky; top: 0; z-index: 2;
          display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
          padding: 10px 14px; margin-top: 18px;
          background: var(--bg-surface); border-bottom: 1px solid var(--border-subtle);
        }
        @media (max-width: 560px) {
          .exp-row { grid-template-columns: 46px 1fr; row-gap: 6px; }
          .exp-row > :last-child { grid-column: 2; justify-self: start; }
        }
      `}</style>

      {/* ── Κεφαλίδα ───────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: T.sp.xl }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', fontFamily: T.font.sans, lineHeight: 1.15, margin: 0 }}>
          Δαπάνες
        </h1>
        <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 5 }}>
          Κάθε ευρώ που φεύγει, σε μία λίστα.
        </div>
      </div>

      {/* ── Τρία νούμερα ───────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 1, background: 'var(--border-subtle)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, overflow: 'hidden', marginBottom: T.sp.lg }}>
        <Figure label="αυτόν τον μήνα" value={loading ? null : fe(monthTotal)} />
        <Figure label={unpaid.length === 1 ? 'απλήρωτο' : 'απλήρωτα'} value={loading ? null : fe(unpaidTotal)}
          sub={unpaid.length ? `${unpaid.length} ${unpaid.length === 1 ? 'γραμμή' : 'γραμμές'}` : 'κανένα'}
          tone={unpaid.length ? 'warn' : 'ok'} />
        <Figure label="φέτος" value={loading ? null : fe(ledgerTotal(entries.filter(e => e.date.startsWith(String(new Date().getFullYear())))))} />
      </div>

      {/* ── Ενέργειες ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: T.sp.md }}>
        {onScan && <Btn variant="primary" onClick={onScan}>Φωτογραφία</Btn>}
        <Btn variant="secondary" onClick={() => { setAdding(v => !v); setBulk(false); }}>{adding ? 'Άκυρο' : 'Νέα δαπάνη'}</Btn>
        <Btn variant="secondary" onClick={() => { setBulk(v => !v); setAdding(false); }}>{bulk ? 'Άκυρο' : 'Μαζικά'}</Btn>
        <div style={{ flex: 1 }} />
        <input
          value={q} onChange={ev => setQ(ev.target.value)}
          placeholder="Αναζήτηση"
          aria-label="Αναζήτηση δαπανών"
          style={{ width: 200, height: T.h.md, padding: '0 14px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 13.5, fontFamily: T.font.sans, outline: 'none' }}
        />
      </div>

      {adding && (
        <QuickAdd propertyId={propertyId} userId={userId}
          onDone={async () => { setAdding(false); await load(); }} />
      )}

      {bulk && (
        <BulkAdd propertyId={propertyId} userId={userId} plan={plan}
          onDone={async () => { setBulk(false); await load(); }} />
      )}

      {/* ── Θέλουν ματιά ───────────────────────────────────────────────────── */}
      {!loading && needsEye.length > 0 && (
        <Card pad="sm" style={{ marginBottom: T.sp.md, borderColor: 'color-mix(in srgb, var(--warning) 35%, transparent)' }}>
          <div style={{ fontSize: 13.5, color: 'var(--text-primary)', fontWeight: 600, marginBottom: 3 }}>
            {needsEye.length} {needsEye.length === 1 ? 'γραμμή θέλει μια ματιά' : 'γραμμές θέλουν μια ματιά'}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Είτε δεν έχουν κατηγορία, είτε μοιάζουν διπλές. Δεν χάνεται τίποτα, αλλά μέχρι να
            τακτοποιηθούν δεν μετρούν σωστά στον Προϋπολογισμό.
          </div>
        </Card>
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
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                  {monthLabel(m.month)}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {fe(m.total)}
                </span>
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
function Figure({ label, value, sub, tone }: { label: string; value: string | null; sub?: string; tone?: 'ok' | 'warn' }) {
  return (
    <div style={{ background: 'var(--bg-surface)', padding: '16px 18px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, color: tone === 'warn' ? 'var(--negative)' : 'var(--text-primary)' }}>
        {value ?? <Skeleton w={80} h={20} />}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 5 }}>
        {label}{sub ? <span style={{ color: 'var(--text-tertiary)' }}> · {sub}</span> : null}
      </div>
    </div>
  );
}

// ── Μία γραμμή ────────────────────────────────────────────────────────────
function Row({ e, busy, onPaid }: { e: LedgerEntry; busy: boolean; onPaid: () => void }) {
  const cat = categoryLabel(e.category);
  const due = e.due ? dueText(e.due) : null;
  return (
    <div className="exp-row">
      <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
        {shortDate(e.date)}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {e.title}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, fontSize: 12, color: 'var(--text-tertiary)', flexWrap: 'wrap' }}>
          <span>{cat}</span>
          {e.recurring && <span title="Επαναλαμβάνεται κάθε μήνα">· πάγιο</span>}
          {due && (
            <span style={{ color: due.late ? 'var(--negative)' : 'var(--warning)', fontWeight: 600 }}>
              · {due.text}
            </span>
          )}
        </span>
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

// ── Νέα δαπάνη: πέντε πεδία ───────────────────────────────────────────────
// Η παλιά φόρμα είχε δεκαπέντε ορατά πεδία και ζητούσε πρώτα Ομάδα και μετά
// Κατηγορία, δηλαδή δύο αποφάσεις για ένα πράγμα. Εδώ η κατηγορία προτείνεται
// μόνη της από αυτό που γράφεις, και η ομάδα προκύπτει. Ό,τι δεν είναι
// απαραίτητο για να σταθεί η γραμμή, μπαίνει μετά.
// ── Μαζική καταχώρηση ─────────────────────────────────────────────────────
//
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ: η φόρμα των πέντε πεδίων είναι σωστή για τη μία δαπάνη τη
// στιγμή που συμβαίνει. Δεν είναι σωστή για τον απολογισμό του μήνα, όπου ο
// ιδιοκτήτης κάθεται με δεκαπέντε αποδείξεις μπροστά του. Εκεί θέλει να γράψει,
// όχι να συμπληρώσει.
//
// ΓΙΑΤΙ ΠΑΝΤΑ ΜΕ ΕΛΕΓΧΟ ΠΡΙΝ: τίποτα δεν μπαίνει στη βάση χωρίς ο χρήστης να
// δει πρώτα τι κατάλαβε η εφαρμογή. Η αυτόματη ανάγνωση κειμένου κάνει λάθη·
// το να τα κάνει σιωπηλά, σε αριθμούς που θα καταλήξουν σε φορολογική δήλωση,
// θα ήταν ασυγχώρητο.
function BulkAdd({ propertyId, userId, plan, onDone }: {
  propertyId: string; userId: string; plan: string; onDone: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const limit = bulkLimit(plan);
  const parsed = useMemo(() => parseBulk(text, limit), [text, limit]);

  const save = async () => {
    const rows = parsed.rows.filter(r => !r.problem);
    if (!rows.length) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('expenses').insert(rows.map(r => ({
        property_id: propertyId, user_id: userId,
        description: r.description,
        amount: r.amount,
        date: r.date,
        category: r.category ? BY_SLUG[r.category].label : 'Άλλο',
        paid: true,
        paid_by: 'owner',
      })));
      if (error) throw error;
      notify(`Μπήκαν ${rows.length} ${rows.length === 1 ? 'δαπάνη' : 'δαπάνες'}`);
      onDone();
    } catch { notifyError('Δεν αποθηκεύτηκαν. Δοκίμασε ξανά.'); }
    finally { setSaving(false); }
  };

  return (
    <Card pad="sm" style={{ marginBottom: T.sp.md }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
        Μία γραμμή, μία δαπάνη
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', lineHeight: 1.55, marginBottom: 10 }}>
        Γράψε ή επικόλλησε όπως θα το έγραφες σε χαρτί. Το ποσό, η ημερομηνία και η
        κατηγορία βρίσκονται μόνα τους. Χωρίς ημερομηνία, μπαίνει η σημερινή.
      </div>

      <textarea
        value={text} onChange={e => setText(e.target.value)}
        rows={6} spellCheck={false}
        aria-label="Δαπάνες, μία ανά γραμμή"
        placeholder={'ΔΕΗ Ιουνίου 84,50 12/06\nΥδραυλικός 60\nΚοινόχρηστα 45,00 1/6'}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '12px 14px',
          borderRadius: T.radius.inner, border: '1px solid var(--border-default)',
          background: 'var(--bg-surface)', color: 'var(--text-primary)',
          fontSize: 13.5, fontFamily: T.font.sans, lineHeight: 1.7, outline: 'none', resize: 'vertical',
        }}
      />

      {parsed.rows.length > 0 && (
        <div style={{ marginTop: 12, border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, overflow: 'hidden' }}>
          {parsed.rows.map((r, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'baseline',
              padding: '9px 13px', fontSize: 13,
              borderTop: i ? '1px solid var(--border-subtle)' : 'none',
              background: r.problem ? 'color-mix(in srgb, var(--warning) 7%, transparent)' : 'transparent',
              color: r.problem ? 'var(--text-tertiary)' : 'var(--text-primary)',
            }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.problem ? r.raw.trim() : r.description}
                <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                  {r.problem ? ` · ${r.problem}` : ` · ${r.categoryLabel}`}
                </span>
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                {r.problem ? '' : shortDate(r.date)}
              </span>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: r.problem ? 400 : 600 }}>
                {r.problem ? '—' : fe(r.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
        <Btn variant="primary" onClick={save} disabled={saving || parsed.ready === 0}>
          {saving ? 'Γίνεται…'
            : parsed.ready === 0 ? 'Καταχώρηση'
            : `Καταχώρηση ${parsed.ready} · ${fe(parsed.total)}`}
        </Btn>
        {/* Το όριο λέγεται μόνο όταν το συναντάς. Να το διαφημίζουμε από πριν θα
            ήταν να ζητάμε λεφτά πριν δείξουμε ότι δουλεύει. */}
        {parsed.overLimit > 0 && (
          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Το πλάνο σου δέχεται {limit} γραμμές τη φορά. Οι υπόλοιπες {parsed.overLimit} μένουν
            στο πλαίσιο για να τις περάσεις σε δεύτερο γύρο.
          </span>
        )}
      </div>
    </Card>
  );
}

function QuickAdd({ propertyId, userId, onDone }: { propertyId: string; userId: string; onDone: () => void }) {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);
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
      await supabase.from('expenses').insert({
        property_id: propertyId, user_id: userId,
        description: what.trim(),
        amount: amt,
        date: paid ? date : (due || date),
        category: slug ? BY_SLUG[slug].label : 'Άλλο',
        paid,
        paid_by: 'owner',
      });
      notify(paid ? 'Καταχωρήθηκε' : 'Καταχωρήθηκε ως απλήρωτη');
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
