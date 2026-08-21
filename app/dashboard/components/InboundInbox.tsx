'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΤΑ ΕΙΣΕΡΧΟΜΕΝΑ: ΑΠΟ ΤΟ ΠΡΟΩΘΗΜΕΝΟ EMAIL ΣΤΗ ΔΑΠΑΝΗ, ΜΕ ΕΝΑ ΠΑΤΗΜΑ
// ─────────────────────────────────────────────────────────────────────────
// ΟΤΑΝ ΔΕΝ ΥΠΑΡΧΕΙ ΤΙΠΟΤΑ, ΔΕΝ ΥΠΑΡΧΕΙ ΤΙΠΟΤΑ. Καμία κάρτα «δεν έχεις
// εισερχόμενα», κανένα άδειο πλαίσιο. Η οθόνη των Δαπανών είναι για τις
// δαπάνες· αυτό εδώ εμφανίζεται μόνο όταν έχει κάτι να πει.
//
// ΤΟ ΠΟΣΟ ΠΟΥ ΔΕΝ ΔΙΑΒΑΣΤΗΚΕ ΖΗΤΙΕΤΑΙ, ΔΕΝ ΜΑΝΤΕΥΕΤΑΙ. Οταν το κείμενο του
// λογαριασμού δεν έλεγε καθαρά ποιο είναι το ποσό, το πεδίο είναι κενό και το
// κουμπί κλειστό μέχρι να γραφτεί. Ενα προσυμπληρωμένο μηδέν ή ένα «περίπου»
// θα ήταν λάθος αριθμός σε φορολογικά βιβλία, γραμμένος με βεβαιότητα.
//
// ΛΕΕΙ ΣΕ ΠΟΙΟ ΑΚΙΝΗΤΟ ΠΑΕΙ. Το μήνυμα ήρθε στον ΛΟΓΑΡΙΑΣΜΟ, όχι σε ακίνητο:
// το ταχυδρομείο δεν ξέρει τίποτα για ακίνητα. Οποιος έχει τρία ακίνητα πρέπει
// να διαβάσει πού θα γραφτεί η δαπάνη πριν πατήσει, όχι να το ανακαλύψει μετά.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as inbound from '@/lib/data/inbound';
import { T, TT, Card, SecHdr, Btn, fe, fd, formGrid } from '@/components/Theme';
import { NumberInput, DatePicker } from './UIComponents';
import { expenseTitle } from '@/lib/inbound/parse';
import { notifyError } from '@/components/Toast';
import { athensToday } from '@/lib/core/time';

interface Props {
  propertyId: string;
  userId: string;
  /** Το όνομα του ακινήτου όπου θα γραφτεί η δαπάνη. */
  propertyName?: string;
  /** Ειδοποιεί το καθολικό ότι μπήκε γραμμή, ώστε να ξαναδιαβάσει. */
  onFiled?: () => void;
}

/** Η γραμμή όπως τη διορθώνει ο άνθρωπος πριν την καταχωρήσει. */
interface Draft { amount: string; date: string }

export default function InboundInbox({ propertyId, userId, propertyName, onFiled }: Props) {
  const supabase = createClient();
  const [rows, setRows] = useState<inbound.MessageRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);

  // Η ΑΝΑΓΝΩΣΗ ΕΙΝΑΙ ΣΥΝΔΡΟΜΗ ΣΕ ΕΞΩΤΕΡΙΚΟ ΣΥΣΤΗΜΑ, ΟΧΙ ΥΠΟΛΟΓΙΣΜΟΣ: η
  // κατάσταση γράφεται μέσα στην απάντηση, και ο διακόπτης `live` σταματά τη
  // γραφή αν η οθόνη έφυγε πριν απαντήσει η βάση.
  useEffect(() => {
    let live = true;
    inbound.pending(supabase, userId).then(({ rows: found }) => {
      if (!live) return;
      setRows(found);
      setDrafts(Object.fromEntries(found.map(r => [r.id, {
        amount: r.amount === null ? '' : String(r.amount),
        date: r.due_date || r.issue_date || athensToday(),
      }])));
    });
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (!rows.length) return null;

  const patch = (id: string, part: Partial<Draft>) =>
    setDrafts(d => ({ ...d, [id]: { ...d[id], ...part } }));

  const file = async (r: inbound.MessageRow) => {
    const draft = drafts[r.id];
    const amount = parseFloat((draft?.amount || '').replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0 || !draft?.date) return;
    setBusy(r.id);
    const res = await inbound.fileAsExpense(supabase, r.id, {
      propertyId, userId,
      description: expenseTitle(r.vendor, r.subject || '', r.category || 'Άλλο'),
      amount,
      date: draft.date,
      category: r.category || 'Άλλο',
      ...(r.expense_group ? { expenseGroup: r.expense_group } : {}),
      vendor: r.vendor,
    });
    setBusy(null);
    if (!res.expenseId) { notifyError('Η δαπάνη δεν καταχωρήθηκε'); return; }
    // Η ΔΑΠΑΝΗ ΥΠΑΡΧΕΙ ΚΑΙ ΤΟ ΛΕΜΕ, ακόμη κι όταν το σημάδι δεν γράφτηκε. Η
    // εναλλακτική —«κάτι πήγε στραβά»— θα έκανε τον ιδιοκτήτη να την ξαναγράψει.
    if (res.orphaned) notifyError('Η δαπάνη καταχωρήθηκε. Το εισερχόμενο θα ξαναφανεί.');
    setRows(list => list.filter(x => x.id !== r.id));
    onFiled?.();
  };

  const drop = async (id: string) => {
    setBusy(id);
    const { error } = await inbound.dismiss(supabase, id);
    setBusy(null);
    if (error) { notifyError('Το εισερχόμενο δεν απορρίφθηκε'); return; }
    setRows(list => list.filter(x => x.id !== id));
  };

  return (
    <Card style={{ marginBottom: T.sp.lg }}>
      <SecHdr label="Ηρθαν με email"
        sub={propertyName ? `Η καταχώρηση γράφεται στο ακίνητο «${propertyName}»` : 'Η καταχώρηση γράφεται στο ακίνητο που βλέπεις'} />
      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map(r => {
          const draft = drafts[r.id] || { amount: '', date: '' };
          const amount = parseFloat((draft.amount || '').replace(',', '.'));
          const ready = Number.isFinite(amount) && amount > 0 && !!draft.date;
          const known = r.amount !== null;
          const stamp = r.due_date || r.issue_date;
          const knownDate = !!stamp;
          return (
            <div key={r.id} style={{
              display: 'grid', gap: 10, padding: '12px 14px',
              borderRadius: T.radius.card, background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ ...TT.body, fontWeight: 650, color: 'var(--text-primary)' }}>
                  {r.vendor || r.from_address || 'Άγνωστος αποστολέας'}
                </span>
                {known && (
                  <span style={{
                    fontFamily: T.font.num, fontSize: 15, fontWeight: 650,
                    fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)', whiteSpace: 'nowrap',
                  }}>{fe(Number(r.amount))}</span>
                )}
              </div>

              <div style={{ ...TT.bodySm, color: 'var(--text-secondary)' }}>
                {r.subject || 'Χωρίς θέμα'}
              </div>

              <div style={{ ...TT.bodySm, color: 'var(--text-tertiary)' }}>
                {r.category || 'Άλλο'}
                {stamp && ` · ${r.due_date ? 'Λήξη' : 'Εκδόθηκε'} ${fd(stamp)}`}
                {r.attachments > 0 && ` · ${r.attachments === 1 ? 'Ενα συνημμένο' : `${r.attachments} συνημμένα`}`}
              </div>

              {(!known || !knownDate) && (
                <div style={formGrid(180, 240)}>
                  {!known && (
                    <NumberInput label="Ποσό" value={draft.amount} suffix="€"
                      onChange={v => patch(r.id, { amount: v })} placeholder="" step={0.01} />
                  )}
                  {!knownDate && (
                    <DatePicker label="Ημερομηνία" value={draft.date} onChange={v => patch(r.id, { date: v })} />
                  )}
                </div>
              )}

              {!known && (
                <div style={{ ...TT.bodySm, color: 'var(--text-tertiary)' }}>
                  Το ποσό δεν διαβάστηκε από το μήνυμα. Συμπλήρωσέ το από τον λογαριασμό.
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Btn variant="primary" onClick={() => file(r)} disabled={!ready || busy === r.id}>
                  {busy === r.id ? 'Καταχώρηση…' : 'Καταχώρηση'}
                </Btn>
                <Btn variant="secondary" onClick={() => drop(r.id)} disabled={busy === r.id}>Δεν είναι δαπάνη</Btn>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
