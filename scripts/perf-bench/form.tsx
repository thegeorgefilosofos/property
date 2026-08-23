// ═══════════════════════════════════════════════════════════════════════════
// Ο ΠΑΓΚΟΣ ΤΩΝ ΦΟΡΜΩΝ: ΒΛΕΠΩ ΤΗ ΦΟΡΜΑ ΧΩΡΙΣ ΛΟΓΑΡΙΑΣΜΟ
// ─────────────────────────────────────────────────────────────────────────
// Οι φόρμες του πίνακα ελέγχου ήταν αδύνατο να κριθούν με τα μάτια χωρίς
// σύνδεση, οπότε κρίνονταν από στιγμιότυπα που έστελνε ο χρήστης. Εδώ
// προσαρτώνται τα ΠΡΑΓΜΑΤΙΚΑ πεδία, με τον πραγματικό τους ρυθμό.
// ═══════════════════════════════════════════════════════════════════════════
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { theFake } from '../e2e-money/fakeClient';
import { TextInput, NumberInput, Textarea, DatePicker, CustomSelect } from '@/app/dashboard/components/UIComponents';
import { SectionTitle, ChipRow, whyOf } from '@/app/dashboard/components/TabTenantParts';
import { fixedCols } from '@/components/tokens';

window.__respond = () => ({ data: null, error: null });
void theFake;

function Demo() {
  const [v, setV] = useState({ afm: '', name: '', rent: '', day: '1', iban: '', start: '', notes: '' });
  const set = (k: string, x: string) => setV(p => ({ ...p, [k]: x }));
  const chip = (on: boolean) => ({
    padding: '8px 18px', fontSize: 12, cursor: 'pointer', borderRadius: 10,
    border: `1px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`,
    background: on ? 'var(--accent-dim)' : 'transparent',
    color: on ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: on ? 700 : 400,
  });
  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: 28 }}>
      <SectionTitle>Ποιος είναι ο ενοικιαστής</SectionTitle>
      <div {...fixedCols(3, 14, 'start')}>
        <TextInput label="Ονοματεπώνυμο *" value={v.name} onChange={x => set('name', x)} />
        <TextInput label="ΑΦΜ" labelInfo={whyOf('tenant.afm')} value={v.afm} onChange={x => set('afm', x)} />
        <TextInput label="Κινητό τηλέφωνο" value={v.iban} onChange={x => set('iban', x)} />
      </div>
      <div style={{ height: 1, background: 'var(--border-subtle)', margin: '22px 0' }} />
      <SectionTitle>Η μίσθωση</SectionTitle>
      <ChipRow label="Είδος μίσθωσης" info={whyOf('tenant.lease_category')}>
        <button style={chip(true)}>Κατοικία</button>
        <button style={chip(false)}>Επαγγελματική</button>
      </ChipRow>
      <ChipRow label="Διάρκεια" info={whyOf('tenant.lease_type')}>
        {['Μηνιαίο', 'Εξάμηνο', 'Ετήσιο', '18 Μήνες', '24 Μήνες', '36 Μήνες', 'Προσαρμοσμένο'].map((t, i) =>
          <button key={t} style={chip(i === 2)}>{t}</button>)}
      </ChipRow>
      <div {...fixedCols(2, 14, 'start')}>
        <DatePicker label="Έναρξη μίσθωσης" labelInfo={whyOf('tenant.lease_start')} value={v.start} onChange={x => set('start', x)} />
        <DatePicker label="Λήξη μίσθωσης" labelInfo={whyOf('tenant.lease_start')} value="" onChange={() => {}} />
      </div>
      <div style={{ height: 1, background: 'var(--border-subtle)', margin: '22px 0' }} />
      <SectionTitle>Το ενοίκιο</SectionTitle>
      <div {...fixedCols(3, 14, 'start')}>
        <NumberInput label="Μηνιαίο ενοίκιο" value={v.rent} onChange={x => set('rent', x)} suffix="€" />
        <CustomSelect label="Ημέρα πληρωμής" labelInfo={whyOf('tenant.rent_due_day')} value={v.day} onChange={x => set('day', x)}
          options={Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}η` }))} />
        <TextInput label="IBAN Είσπραξης Ενοικίου" labelInfo={whyOf('tenant.rent_iban')} value={v.iban} onChange={x => set('iban', x)} placeholder="GR..." />
      </div>
      <div style={{ marginTop: 18 }}>
        <Textarea label="Σημειώσεις" labelInfo={whyOf('tenant.notes')} value={v.notes} onChange={x => set('notes', x)} />
      </div>
    </div>
  );
}

const host = document.createElement('div');
document.body.appendChild(host);
createRoot(host).render(<Demo />);
