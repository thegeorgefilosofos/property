'use client';

// ═══════════════════════════════════════════════════════════════════════════
// «ΜΠΗΚΕ ΤΟ ΕΝΟΙΚΙΟ» — ΑΠΟ ΤΗΝ ΚΑΡΤΑ ΠΟΥ ΤΟ ΛΕΕΙ, ΟΧΙ ΤΡΕΙΣ ΟΘΟΝΕΣ ΠΙΟ ΠΕΡΑ.
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΙΣΧΥΕ. Η κορυφή της Επισκόπησης έλεγε «Μου χρωστάνε 700,00 € · 1
// εκκρεμότητα, η παλαιότερη 12 ημέρες πίσω». Ο ιδιοκτήτης που μόλις είδε το
// έμβασμα στο κινητό του άνοιγε τον Ενοικιαστή, μετά τον φάκελο της μίσθωσης,
// έψαχνε τη δόση μέσα στη λίστα, πατούσε «Επιβεβαίωση είσπραξης» και μετά
// «Καταχώρηση». Τέσσερα πατήματα και μια αναζήτηση, για μια γραμμή που η κάρτα
// ΕΙΧΕ ΗΔΗ βρει και μετρήσει — και η μόνη ενέργεια που πρόσφερε ήταν να τον
// στείλει να την ξαναβρεί.
//
// ΤΟ ΠΑΡΑΘΥΡΟ ΑΝΟΙΓΕΙ ΑΠΟΦΑΣΙΣΜΕΝΟ. Η αρχαιότερη ληξιπρόθεσμη δόση είναι ήδη
// επιλεγμένη, η ημερομηνία είναι σήμερα και ο τρόπος έρχεται από τη μίσθωση.
// Στη συνηθισμένη περίπτωση μένουν δύο πατήματα: άνοιγμα και καταχώρηση.
//
// ── ΤΡΙΑ ΠΡΑΓΜΑΤΑ ΠΟΥ ΔΕΝ ΣΥΝΤΟΜΕΥΟΥΝ ────────────────────────────────────
//
// Ο ΤΡΟΠΟΣ ΕΙΣΠΡΑΞΗΣ ΡΩΤΙΕΤΑΙ, ΓΙΑΤΙ ΑΛΛΑΖΕΙ ΤΟΝ ΦΟΡΟ. Από 1/1/2026
// (ν.5246/2025) η τεκμαρτή έκπτωση 5% προϋποθέτει είσπραξη με τραπεζικό ή
// ηλεκτρονικό μέσο. Μια σιωπηλή προεπιλογή «Τραπεζική κατάθεση» θα ήταν η
// ΚΕΡΔΟΦΟΡΑ εκδοχή: μικρότερος φόρος, χωρίς να το ξέρει ο ιδιοκτήτης. Εδώ η
// προεπιλογή έρχεται από αυτό που ο ίδιος δήλωσε στη μίσθωση, φαίνεται, και
// αλλάζει με ένα πάτημα.
//
// Η ΗΜΕΡΟΜΗΝΙΑ ΕΙΣΠΡΑΞΗΣ ΓΡΑΦΕΤΑΙ, ΓΙΑΤΙ ΓΕΝΝΑ ΤΙΣ ΗΜΕΡΕΣ ΚΑΘΥΣΤΕΡΗΣΗΣ. Ο
// υπολογισμός ζει στο στρώμα δεδομένων (lib/data/rent.ts), μία φορά, και ο
// αριθμός μπαίνει σε βεβαίωση και σε αναφορά προς λογιστή.
//
// ΤΟ ΠΟΣΟ ΔΕΝ ΕΠΕΞΕΡΓΑΖΕΤΑΙ ΕΔΩ. Αυτή η διαδρομή είναι για την κανονική
// περίπτωση: ήρθε το αναμενόμενο ενοίκιο. Μερική πληρωμή ή διαφορετικό ποσό
// είναι αλλαγή της ίδιας της δόσης, και γίνεται εκεί όπου ζει — στον
// Ενοικιαστή. Το υποσέλιδο το λέει, ώστε να μην καταχωρηθεί λάθος ποσό επειδή
// ήταν πιο εύκολο.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { T, TT, Modal, Btn, InfoBanner, fieldRow, fe, fd } from '@/components/Theme';
import { CustomSelect, DatePicker } from './UIComponents';
import { PAY_METHODS, type PayMethod } from './TabTenantTypes';
import { setRentDueOccurrencePaid } from './TabTenantHelpers';
import * as rentStore from '@/lib/data/rent';
import { saved } from '@/components/dbWrite';
import { notifyOk } from '@/components/Toast';
import type { CashLine } from '@/lib/home/cash';

/** Οι γραμμές που μπορούν να εισπραχθούν από εδώ: όσες ξέρουν τη δόση τους. */
export function receivableLines(lines: readonly CashLine[]): CashLine[] {
  return lines.filter(l => l.rent !== null);
}

export default function RentReceived({
  onClose, lines, supabase, propertyId, tenantId, leaseViaBank, today, onSaved,
}: {
  onClose: () => void;
  /** Οι ληξιπρόθεσμες γραμμές ενοικίου, ήδη σε σειρά πίεσης (αρχαιότερη πρώτη). */
  lines: CashLine[];
  supabase: SupabaseClient;
  propertyId: string;
  /** Η τρέχουσα μίσθωση· κλείνει και την υπενθύμιση του ημερολογίου. */
  tenantId: string | null;
  /** `tenants.e_payment`: τι συμφωνήθηκε. Δίνει την προεπιλογή, όχι την απάντηση. */
  leaseViaBank: boolean;
  /** Σήμερα σε ελληνική ώρα. Ίδιο ημερολόγιο με τον μετρητή της κάρτας. */
  today: string;
  onSaved: () => void;
}) {
  const openLines = receivableLines(lines);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [paidDate, setPaidDate] = useState(today);
  const [method, setMethod] = useState<PayMethod>(leaseViaBank ? 'Τραπεζική κατάθεση' : 'Μετρητά');
  const [busy, setBusy] = useState(false);

  // Η επιλογή δεν κρατιέται σε useEffect: όσο δεν έχει αγγίξει τίποτα ο χρήστης,
  // ισχύει η αρχαιότερη — και αν αυτή εισπραχθεί, η επόμενη παίρνει τη θέση της
  // μόνη της. Ένα useEffect εδώ θα κρατούσε επιλεγμένη μια δόση που δεν υπάρχει.
  const picked = openLines.find(l => l.rent?.id === pickedId) ?? openLines[0];

  // Χωρίς εισπράξιμη γραμμή δεν υπάρχει παράθυρο. Ο καλών δεν το προσαρτά ποτέ
  // άδειο· ο φρουρός είναι εδώ ώστε ο τύπος να το εγγυάται και όχι η σύμβαση.
  if (!picked?.rent) return null;

  const record = async () => {
    const ref = picked.rent;
    if (!ref) return;
    setBusy(true);
    const ok = await saved('Η είσπραξη δεν καταχωρήθηκε',
      rentStore.markPaid(supabase, ref.id, picked.due, paidDate, method));
    if (!ok) { setBusy(false); return; }
    // Η υπενθύμιση του ημερολογίου κλείνει μαζί — αλλιώς το app θυμίζει ενοίκιο
    // που μόλις εισπράχθηκε. Best-effort: δεν μπλοκάρει την καταχώρηση.
    if (tenantId && ref.year && ref.month) {
      await setRentDueOccurrencePaid(supabase, tenantId, propertyId, ref.year, ref.month, true);
    }
    setBusy(false);
    onClose();
    onSaved();
    notifyOk('Η είσπραξη καταχωρήθηκε');
  };

  const lateNote = (l: CashLine) =>
    l.daysLeft != null && l.daysLeft < 0
      ? `${Math.abs(l.daysLeft)} ${Math.abs(l.daysLeft) === 1 ? 'ημέρα' : 'ημέρες'} πίσω`
      : '';

  return (
    <Modal open onClose={() => { if (!busy) onClose(); }} width={480} title="Είσπραξη ενοικίου"
      footerInfo="Για μερική πληρωμή ή διαφορετικό ποσό, από τον Ενοικιαστή."
      footer={<>
        <Btn variant="ghost" onClick={busy ? undefined : onClose}>Ακύρωση</Btn>
        <Btn variant="primary" onClick={record} disabled={busy}>{busy ? 'Καταχώρηση…' : 'Καταχώρηση'}</Btn>
      </>}>

      {/* ΜΙΑ ΔΟΣΗ: ΤΙΠΟΤΑ ΝΑ ΔΙΑΛΕΞΕΙ. Η λίστα με ένα στοιχείο ζητά επιλογή που
          δεν υπάρχει· εδώ γίνεται δήλωση του τι πρόκειται να καταχωρηθεί. */}
      {openLines.length === 1 ? (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: T.sp.md, flexWrap: 'wrap' }}>
          <div>
            <div style={{ ...TT.body, fontWeight: 700 }}>{picked.label}</div>
            <div style={{ ...TT.caption, marginTop: 2 }}>
              {[picked.due ? `Προθεσμία ${fd(picked.due)}` : '', lateNote(picked)].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div style={{ ...TT.kpi }}>{fe(picked.amount)}</div>
        </div>
      ) : (
        <div role="radiogroup" aria-label="Δόση προς είσπραξη" style={{ display: 'flex', flexDirection: 'column', gap: T.sp.sm }}>
          {openLines.map(l => {
            const on = l.rent?.id === picked.rent?.id;
            return (
              <button key={l.rent?.id} type="button" role="radio" aria-checked={on}
                onClick={() => setPickedId(l.rent?.id ?? null)}
                style={{
                  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: T.sp.md,
                  minHeight: T.h.lg, padding: '10px 14px', textAlign: 'left',
                  borderRadius: T.radius.inner, cursor: 'pointer',
                  background: on ? 'var(--accent-soft)' : 'transparent',
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--border-subtle)'}`,
                  fontFamily: T.font.sans,
                }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ ...TT.body, fontWeight: on ? 700 : 400, display: 'block' }}>{l.label}</span>
                  <span style={{ ...TT.caption, display: 'block', marginTop: 2 }}>{lateNote(l)}</span>
                </span>
                <span style={{ fontFamily: T.font.num, fontSize: 13, fontWeight: 700,
                               fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)',
                               whiteSpace: 'nowrap' }}>{fe(l.amount)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ΤΑ ΔΥΟ ΠΕΔΙΑ ΜΟΙΡΑΖΟΝΤΑΙ ΤΟ ΠΛΑΤΟΣ, δεν κόβονται σε σταθερή στήλη. Με
          `formGrid` το πεδίο έμενε στα 210 εικονοστοιχεία και άφηνε τη μισή
          γραμμή κενή σε κινητό — μετρήθηκε σε Pixel 7. */}
      <div style={fieldRow(160)}>
        <DatePicker label="Ημερομηνία είσπραξης" value={paidDate} onChange={setPaidDate} />
        <CustomSelect label="Τρόπος είσπραξης" value={method} onChange={v => setMethod(v as PayMethod)}
          options={PAY_METHODS.map(m => ({ value: m, label: m }))} />
      </div>

      {/* ΛΕΓΕΤΑΙ ΜΟΝΟ ΟΤΑΝ ΑΛΛΑΖΕΙ ΚΑΤΙ. Η αντίστροφη πρόταση («με τραπεζική
          κατάθεση διατηρείται η έκπτωση») θα εμφανιζόταν σε κάθε άνοιγμα και θα
          έπαυε να διαβάζεται — μαζί με αυτήν εδώ. */}
      {method === 'Μετρητά' && (
        <InfoBanner tone="warning">
          Με μετρητά δεν εφαρμόζεται η τεκμαρτή έκπτωση 5% σε καμία είσπραξη της χρήσης:
          ο ν.5246/2025 τη συνδέει με είσπραξη μέσω τραπεζικού ή ηλεκτρονικού μέσου.
        </InfoBanner>
      )}
    </Modal>
  );
}
