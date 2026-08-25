// ═══════════════════════════════════════════════════════════════════════════
// Ο ΠΑΓΚΟΣ ΠΛΗΚΤΡΟΛΟΓΙΟΥ: ΤΑ ΑΛΗΘΙΝΑ ΧΕΙΡΙΣΤΗΡΙΑ ΤΟΥ ΠΙΝΑΚΑ ΕΛΕΓΧΟΥ
// ─────────────────────────────────────────────────────────────────────────
// Ο πίνακας ελέγχου ζει πίσω από σύνδεση, οπότε καμία σουίτα δημόσιων σελίδων
// δεν τον φτάνει: τα παράθυρα, ο επιλογέας, το ημερολόγιο και οι διακόπτες του
// δεν έχουν ελεγχθεί ΠΟΤΕ με πληκτρολόγιο. Εδώ αποδίδονται τα ΙΔΙΑ στοιχεία
// που τρέχουν στην παραγωγή, με ολόκληρο το globals.css, χωρίς διακομιστή και
// χωρίς λογαριασμό.
//
// Κάθε στοιχείο ζει μέσα σε δικό του τμήμα με σταθερή λαβή `data-k`, ώστε ο
// έλεγχος να μη χρειάζεται να πατά ελληνικές ετικέτες που αλλάζουν.
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { Modal, SideSheet, Btn } from '@/components/Theme';
import { ActionMenu } from '@/components/ActionMenu';
import { ConfirmHost, confirmDialog } from '@/components/ConfirmDialog';
import {
  CustomSelect, DatePicker, Toggle, SegmentControl, TextInput, NumberInput,
} from '@/app/dashboard/components/UIComponents';

function Bench() {
  const [modal, setModal] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [sel, setSel] = useState('a');
  const [date, setDate] = useState('');
  const [on, setOn] = useState(false);
  const [seg, setSeg] = useState('m');
  const [txt, setTxt] = useState('');
  const [num, setNum] = useState('');
  const [confirmed, setConfirmed] = useState('—');

  return (
    <div className="app-shell"><main className="app-main"><div className="app-content" style={{ padding: 24, display: 'grid', gap: 24, maxWidth: 720 }}>
      <h1>Πάγκος πληκτρολογίου</h1>

      <section data-k="modal">
        <button data-k="modal-open" onClick={() => setModal(true)}>Άνοιγμα παραθύρου</button>
        <Modal open={modal} onClose={() => setModal(false)} title="Παράθυρο δοκιμής"
          footer={<><Btn onClick={() => setModal(false)}>Ακύρωση</Btn><Btn variant="primary" onClick={() => setModal(false)}>Αποθήκευση</Btn></>}>
          <TextInput label="Όνομα" value={txt} onChange={setTxt} />
          <NumberInput label="Ποσό" value={num} onChange={setNum} suffix="€" />
        </Modal>
      </section>

      <section data-k="sheet">
        <button data-k="sheet-open" onClick={() => setSheet(true)}>Άνοιγμα ντοσιέ</button>
        <SideSheet open={sheet} onClose={() => setSheet(false)} ariaLabel="Ντοσιέ δοκιμής"
          header={<div>Ντοσιέ</div>} footer={<Btn onClick={() => setSheet(false)}>Κλείσιμο</Btn>}>
          <TextInput label="Σημείωση" value={txt} onChange={setTxt} />
        </SideSheet>
      </section>

      <section data-k="select">
        <CustomSelect label="Κατηγορία" value={sel} onChange={setSel}
          options={[{ value: 'a', label: 'Ρεύμα' }, { value: 'b', label: 'Νερό' }, { value: 'c', label: 'Αέριο' }]} />
      </section>

      <section data-k="date">
        <DatePicker label="Ημερομηνία" value={date} onChange={setDate} />
      </section>

      <section data-k="toggle">
        <Toggle on={on} onChange={setOn} label="Ενεργό" />
      </section>

      <section data-k="segment">
        <SegmentControl value={seg} onChange={setSeg} ariaLabel="Περίοδος"
          options={[{ value: 'm', label: 'Μήνας' }, { value: 'y', label: 'Έτος' }]} />
      </section>

      <section data-k="menu">
        <ActionMenu label="Ενέργειες" items={[
          { key: 'a', label: 'Πρώτη', onClick: () => {} },
          { key: 'b', label: 'Δεύτερη', onClick: () => {} },
        ]} />
      </section>

      {/* Το πεδίο ποσού έξω από παράθυρο, με κουμπί που αλλάζει την τιμή από
          ΕΞΩ: έτσι ελέγχεται ότι το πεδίο ακολουθεί τον γονέα του όταν δεν
          γράφει κανείς και ότι κρατά ό,τι πληκτρολογείς όσο γράφεις. */}
      <section data-k="num">
        <NumberInput label="Ποσό ελέγχου" value={num} onChange={setNum} suffix="€" />
        <button data-k="num-set" onClick={() => setNum('250')}>Βάλε 250</button>
        <span data-k="num-value">{num}</span>
      </section>

      <section data-k="confirm">
        <button data-k="confirm-open" onClick={async () => {
          const r = await confirmDialog({ title: 'Σίγουρα;', message: 'Δοκιμή επιβεβαίωσης.' });
          setConfirmed(String(r));
        }}>Ερώτηση</button>
        <span data-k="confirm-result">{confirmed}</span>
      </section>

      <ConfirmHost />
    </div></main></div>
  );
}

createRoot(document.body.appendChild(document.createElement('div'))).render(<Bench />);
