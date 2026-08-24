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
import { T, TT, Card, SecHdr, Btn, fe, fieldRow } from '@/components/Theme';
import { NumberInput, DatePicker, CustomSelect } from './UIComponents';
import { expenseTitle } from '@/lib/inbound/parse';
import { CATEGORIES, BY_SLUG, resolveCategory } from '@/lib/expenses/taxonomy';
import { groupForCategory } from '@/lib/expenses/groups';
import { hintAction, hintFor, type Hint } from '@/lib/expenses/hints';
import * as hintStore from '@/lib/data/categoryHints';
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
interface Draft { amount: string; date: string; slug: string }

export default function InboundInbox({ propertyId, userId, propertyName, onFiled }: Props) {
  const supabase = createClient();
  const [rows, setRows] = useState<inbound.MessageRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [hints, setHints] = useState<Hint[]>([]);

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
        slug: resolveCategory(r.category) || '',
      }])));
    });
    // ΟΙ ΚΑΝΟΝΕΣ ΤΟΥ ΙΔΙΟΚΤΗΤΗ ΔΙΑΒΑΖΟΝΤΑΙ ΓΙΑ ΔΥΟ ΛΟΓΟΥΣ: για να ξέρει η οθόνη
    // ΓΙΑΤΙ μια κατηγορία ήρθε έτσι, και για να μη γραφτεί ξανά κανόνας που
    // υπάρχει ήδη. Η αποτυχία δεν έχει μήνυμα: τα εισερχόμενα δουλεύουν και
    // χωρίς αυτούς, όπως δούλευαν πάντα.
    hintStore.forUser(supabase, userId).then(({ rows: found }) => {
      if (live) setHints(hintStore.asHints(found));
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
    // Η ΚΑΤΗΓΟΡΙΑ ΤΗΣ ΟΘΟΝΗΣ ΕΙΝΑΙ Η ΚΑΤΗΓΟΡΙΑ ΠΟΥ ΓΡΑΦΕΤΑΙ. Πριν, ό,τι κι αν
    // έδειχνε η γραμμή, καταχωρούνταν η πρόταση της βάσης.
    const cat = draft.slug ? BY_SLUG[draft.slug] : null;
    const label = cat ? cat.label : (r.category || 'Άλλο');
    setBusy(r.id);
    const res = await inbound.fileAsExpense(supabase, r.id, {
      propertyId, userId,
      description: expenseTitle(r.vendor, r.subject || '', label),
      amount,
      date: draft.date,
      category: label,
      expenseGroup: cat ? groupForCategory(cat) : (r.expense_group || undefined),
      vendor: r.vendor,
    });
    // Η ΔΙΟΡΘΩΣΗ ΜΑΘΑΙΝΕΤΑΙ ΜΟΝΟ ΟΤΑΝ ΕΓΙΝΕ. Οποιος δέχτηκε την πρόταση δεν
    // δίδαξε τίποτα, και δεν πρέπει να γραφτεί κανόνας στο όνομά του.
    if (cat && draft.slug !== (resolveCategory(r.category) || '')) {
      const action = hintAction(r.vendor, r.subject || '', cat.label);
      if (action && 'forget' in action) await hintStore.forget(supabase, userId, action.key);
      else if (action) await hintStore.learn(supabase, userId, action.key, action.category);
    }
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
          const draft = drafts[r.id] || { amount: '', date: '', slug: '' };
          const amount = parseFloat((draft.amount || '').replace(',', '.'));
          const ready = Number.isFinite(amount) && amount > 0 && !!draft.date;
          const known = r.amount !== null;
          const learned = hintFor(hints, r.vendor) === r.category;
          const stamp = r.due_date || r.issue_date;
          // Η ΕΤΙΚΕΤΑ ΚΟΥΒΑΛΑΕΙ ΤΗΝ ΠΡΟΕΛΕΥΣΗ. «Ημερομηνία λήξης» και
          // «Ημερομηνία έκδοσης» δεν είναι το ίδιο πράγμα για τα βιβλία, και
          // πριν η διάκριση ζούσε σε ξεχωριστή γραμμή κειμένου.
          const dateLabel = r.due_date ? 'Ημερομηνία λήξης'
            : r.issue_date ? 'Ημερομηνία έκδοσης'
            : 'Ημερομηνία';
          // ΤΙ ΔΙΑΒΑΣΤΗΚΕ, ΟΤΑΝ Ο ΑΝΘΡΩΠΟΣ ΤΟ ΑΛΛΑΞΕ. Χωρίς αυτό, η διόρθωση
          // σβήνει το μόνο ίχνος του τι έλεγε το μήνυμα.
          const readAmount = r.amount === null ? null : Number(r.amount);
          const amountChanged = readAmount != null && Number.isFinite(amount)
            && Math.abs(amount - readAmount) > 0.005;
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
              </div>

              <div style={{ ...TT.bodySm, color: 'var(--text-secondary)' }}>
                {r.subject || 'Χωρίς θέμα'}
              </div>

              {/* Η ΚΑΤΗΓΟΡΙΑ ΕΦΥΓΕ ΑΠΟ ΕΔΩ ΚΑΙ ΕΓΙΝΕ ΕΠΙΛΟΓΗ. Γραμμένη ως κείμενο,
                  ήταν πρόταση που για να διορθωθεί ήθελε καταχώρηση, άνοιγμα του
                  καθολικού και δεύτερη φόρμα. Τώρα διορθώνεται εκεί που
                  φαίνεται, και η διόρθωση κρατιέται για την επόμενη φορά. */}
              {/* Η ΗΜΕΡΟΜΗΝΙΑ ΕΦΥΓΕ ΑΠΟ ΕΔΩ ΚΑΙ ΜΠΗΚΕ ΣΤΗΝ ΕΤΙΚΕΤΑ ΤΟΥ ΠΕΔΙΟΥ.
                  Γραμμένη και στις δύο θέσεις, το ίδιο νούμερο λεγόταν δύο
                  φορές· η ετικέτα λέει ΤΙ διάβασε το μήνυμα («λήξης» ή
                  «έκδοσης») και το πεδίο ΤΙ θα γραφτεί. */}
              {(!stamp || r.attachments > 0) && (
                <div style={{ ...TT.bodySm, color: 'var(--text-tertiary)' }}>
                  {[
                    stamp ? '' : 'Χωρίς ημερομηνία στο μήνυμα',
                    r.attachments > 0 ? (r.attachments === 1 ? 'Ενα συνημμένο' : `${r.attachments} συνημμένα`) : '',
                  ].filter(Boolean).join(' · ')}
                </div>
              )}

              <div style={fieldRow(180)}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ ...TT.bodySm, display: 'block', marginBottom: 6, color: 'var(--text-secondary)' }}>Κατηγορία</span>
                  <CustomSelect value={draft.slug} onChange={v => patch(r.id, { slug: v })}
                    ariaLabel="Κατηγορία δαπάνης" placeholder="Χωρίς κατηγορία"
                    options={CATEGORIES.map(c => ({ value: c.slug, label: c.label }))} />
                </div>
                {/* ══════════════════════════════════════════════════════════
                    ΤΟ ΔΙΑΒΑΣΜΕΝΟ ΠΟΣΟ ΔΕΝ ΕΙΝΑΙ ΟΡΙΣΤΙΚΟ

                    Οταν ο αναγνώστης έβγαζε ποσό, το πεδίο ΔΕΝ αποδιδόταν
                    καθόλου: το νούμερο τυπωνόταν ως κείμενο στην κεφαλίδα και
                    δεν υπήρχε τρόπος να διορθωθεί. Ο ιδιοκτήτης που έβλεπε
                    λάθος ποσό είχε ΜΟΝΟ μία έξοδο, το «Δεν είναι δαπάνη», και
                    μετά χειροκίνητη καταχώρηση από την αρχή.

                    Και το λάθος ποσό είναι υπαρκτό, όχι θεωρητικό: το ίδιο
                    αρχείο του αναγνώστη κρατά τέσσερα σχήματα λογαριασμού που
                    έβγαζαν ημερομηνία, χιλιάδες ή αριθμό λογαριασμού στη θέση
                    του ποσού. Ο,τι διαβάζει μηχανή, ο άνθρωπος το διορθώνει.
                    ══════════════════════════════════════════════════════════ */}
                <NumberInput label="Ποσό" value={draft.amount} suffix="€"
                  onChange={v => patch(r.id, { amount: v })} placeholder="" step={0.01} />
                <DatePicker label={dateLabel} value={draft.date} onChange={v => patch(r.id, { date: v })} />
              </div>

              {/* ΤΟ ΓΙΑΤΙ, ΟΤΑΝ Η ΚΑΤΗΓΟΡΙΑ ΔΕΝ ΒΓΗΚΕ ΑΠΟ ΤΟ ΚΕΙΜΕΝΟ. Μια
                  κατηγορία που εμφανίζεται χωρίς εξήγηση είναι μαντεψιά· αυτή
                  εδώ την έγραψε ο ίδιος ο ιδιοκτήτης, και το λέμε μία φορά. */}
              {learned && draft.slug === (resolveCategory(r.category) || '') && (
                <div style={{ ...TT.bodySm, color: 'var(--text-tertiary)' }}>
                  Η κατηγορία ήρθε από προηγούμενη διόρθωσή σου για αυτόν τον πάροχο.
                </div>
              )}

              {!known && (
                <div style={{ ...TT.bodySm, color: 'var(--text-tertiary)' }}>
                  Το ποσό δεν διαβάστηκε από το μήνυμα. Συμπληρώνεται από τον λογαριασμό.
                </div>
              )}

              {amountChanged && (
                <div style={{ ...TT.bodySm, color: 'var(--text-tertiary)' }}>
                  Από το μήνυμα διαβάστηκε {fe(readAmount!)}. Καταχωρείται ό,τι γράφει το πεδίο.
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
