'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, fe, fn } from '@/components/Theme';
import { DatePicker } from './UIComponents';
import { rentalModeFromAirbnb } from '@/lib/billing/propertyFacts';

// Ενεργειακή κλάση (ΠΕΑ) & τύποι θέρμανσης — κοινά για wizard και Ρυθμίσεις.
const PEA_CLASSES = ['A+', 'A', 'B+', 'B', 'Γ', 'Δ', 'Ε', 'Ζ', 'Η'];
const HEATING_OPTS: [string, string][] = [
  ['central_gas', 'Κεντρική (αέριο)'], ['autonomous_gas', 'Αυτόνομη (αέριο)'], ['oil', 'Πετρέλαιο'],
  ['heat_pump', 'Αντλία θερμότητας'], ['electric', 'Ηλεκτρική'], ['pellet', 'Pellet / Ξύλο'],
  ['ac_only', 'Κλιματιστικά'], ['none', 'Χωρίς θέρμανση'], ['other', 'Άλλο'],
];

// ── Domain constants (kept in sync με το dashboard/page.tsx) ────────────────
const STATUS_COLORS: Record<string, string> = {
  rented: 'var(--text-secondary)', vacant: 'var(--text-secondary)', own_use: 'var(--text-secondary)',
  renovation: 'var(--text-secondary)', for_sale: 'var(--text-secondary)', seasonal: 'var(--text-secondary)', disputed: 'var(--text-secondary)',
};
const STATUS_LABELS: Record<string, string> = {
  rented: 'Ενοικιάζεται', vacant: 'Κενό', own_use: 'Ιδιοχρησία',
  renovation: 'Ανακαίνιση', for_sale: 'Προς Πώληση', seasonal: 'Εποχιακό', disputed: 'Αμφισβητούμενο',
};
const PROP_TYPE_LABELS: Record<string, string> = {
  apartment: 'Διαμέρισμα', house: 'Μονοκατοικία', studio: 'Στούντιο',
  maisonette: 'Μεζονέτα', office: 'Γραφείο', shop: 'Κατάστημα',
  warehouse: 'Αποθήκη', land: 'Οικόπεδο', parking: 'Parking',
  storage: 'Αποθήκη Κτιρίου', villa: 'Βίλα', other: 'Άλλο',
};
const PROP_TYPES = ['apartment', 'house', 'studio', 'maisonette', 'office', 'shop', 'warehouse', 'land', 'parking', 'storage', 'villa', 'other'];

// Τύποι χωρίς όροφο / έτος κατασκευής (γη & βοηθητικοί χώροι)
const LAND_LIKE = new Set(['land', 'parking', 'storage', 'warehouse']);
// Airbnb εκτίμηση πληρότητας
const OCCUPANCY = 0.6;

const STEPS = ['Τύπος', 'Βασικά', 'Οικονομικά', 'Σύνοψη'];

// ── Εικονίδια ανά τύπο ακινήτου (inline SVG, currentColor) ──────────────────
function TypeIcon({ type }: { type: string }) {
  const p = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (type) {
    case 'apartment': // κτίριο διαμερισμάτων
      return <svg {...p}><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 7h.01M12 7h.01M15 7h.01M9 11h.01M12 11h.01M15 11h.01M9 15h.01M15 15h.01" /><path d="M11 21v-3h2v3" /></svg>;
    case 'house': // μονοκατοικία
      return <svg {...p}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></svg>;
    case 'studio': // ενιαίος χώρος
      return <svg {...p}><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M4 14h16M14 4v10" /></svg>;
    case 'maisonette': // δύο επίπεδα
      return <svg {...p}><path d="M4 21V9l8-6 8 6v12" /><path d="M4 13h16" /><path d="M10 21v-4h4v4" /></svg>;
    case 'office': // γραφείο
      return <svg {...p}><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2" /></svg>;
    case 'shop': // κατάστημα / storefront
      return <svg {...p}><path d="M4 9l1-4h14l1 4" /><path d="M4 9a2 2 0 004 0 2 2 0 004 0 2 2 0 004 0 2 2 0 004 0" /><path d="M5 11v9h14v-9" /><path d="M9 20v-5h4v5" /></svg>;
    case 'warehouse': // αποθήκη
      return <svg {...p}><path d="M3 21V8l9-4 9 4v13" /><path d="M3 21h18" /><rect x="7" y="12" width="10" height="9" /><path d="M7 16h10" /></svg>;
    case 'land': // οικόπεδο / πινακίδα
      return <svg {...p}><path d="M4 20h16" /><path d="M6 20V6l7-2v16" /><path d="M13 8h5v5h-5" /></svg>;
    case 'parking': // parking
      return <svg {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 16V8h3.5a2.5 2.5 0 010 5H9" /></svg>;
    case 'storage': // αποθήκη κτιρίου / κιβώτιο
      return <svg {...p}><rect x="4" y="6" width="16" height="14" rx="1" /><path d="M4 10h16" /><path d="M10 6V4h4v2" /><path d="M10 14h4" /></svg>;
    case 'villa': // βίλα με πισίνα
      return <svg {...p}><path d="M3 10l6-5 6 5" /><path d="M5 9v6h8V9" /><path d="M16 15c1.5-1 3.5-1 5 0v4c-1.5 1-3.5 1-5 0" /><path d="M8 15v0" /></svg>;
    default: // other
      return <svg {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M12 8v.01M12 11v5" /></svg>;
  }
}

const num = (s: string) => { const v = parseFloat(s.replace(',', '.')); return isNaN(v) ? null : v; };

// ── Στυλ inputs (ίδιο look με το υπάρχον modal) ─────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', height: 42, borderRadius: 10,
  border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
  color: 'var(--text-primary)', fontSize: 14, fontFamily: "'Inter', sans-serif",
  letterSpacing: 0, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s',
};
const monoInputStyle: React.CSSProperties = { ...inputStyle, fontFamily: "'Roboto Mono', monospace", fontVariantNumeric: 'tabular-nums' };
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer', appearance: 'none' };
const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600,
  letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 7,
};
const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-dim)'; };
const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.target.style.borderColor = 'var(--border-default)'; e.target.style.boxShadow = 'none'; };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={labelStyle}>{label}</label>{children}</div>;
}

interface ExistingProperty {
  id: string; name?: string | null; prop_type?: string | null; address?: string | null;
  postal_code?: string | null; sqm?: number | null; floor?: number | null; year_built?: number | null;
  value?: number | null; purchase_price?: number | null; target_rent?: number | null;
  ownership?: number | string | null; status_detail?: string | null; atak?: string | null;
  obj_value?: number | string | null; enfia?: number | string | null; pea_class?: string | null;
  heating?: string | null; purchase_date?: string | null; parking_spaces?: number | string | null;
  storage_sqm?: number | string | null; bedrooms?: number | string | null; rental_mode?: string | null;
}
const s = (v: number | string | null | undefined) => (v == null ? '' : String(v));

export default function AddPropertyWizard({ userId, onClose, onSaved, existing }: { userId: string; onClose: () => void; onSaved: () => void; existing?: ExistingProperty | null }) {
  const supabase = createClient();
  const isEdit = !!existing?.id;
  const [step, setStep] = useState(0); // 0..3
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [propType, setPropType] = useState(existing?.prop_type || 'apartment');
  const [status, setStatus] = useState(existing?.status_detail && existing.status_detail !== 'seasonal' ? existing.status_detail : 'vacant');
  const [airbnb, setAirbnb] = useState(existing?.status_detail === 'seasonal' || existing?.rental_mode === 'short_term');

  const [name, setName] = useState(existing?.name || '');
  const [address, setAddress] = useState(existing?.address || '');
  const [postalCode, setPostalCode] = useState(existing?.postal_code || '');
  const [atak, setAtak] = useState(existing?.atak || '');
  const [sqm, setSqm] = useState(s(existing?.sqm));
  const [floor, setFloor] = useState(s(existing?.floor));
  const [yearBuilt, setYearBuilt] = useState(s(existing?.year_built));

  const [value, setValue] = useState(s(existing?.value));
  const [objValue, setObjValue] = useState(s(existing?.obj_value));
  const [enfia, setEnfia] = useState(s(existing?.enfia));
  const [purchasePrice, setPurchasePrice] = useState(s(existing?.purchase_price));
  const [purchaseDate, setPurchaseDate] = useState(existing?.purchase_date || '');
  const [rent, setRent] = useState(s(existing?.target_rent));
  const [ownership, setOwnership] = useState(s(existing?.ownership) || '100');
  const [peaClass, setPeaClass] = useState(existing?.pea_class || '');
  const [heating, setHeating] = useState(existing?.heating || '');
  const [parking, setParking] = useState(s(existing?.parking_spaces));
  const [storageSqm, setStorageSqm] = useState(s(existing?.storage_sqm));
  const [bedrooms, setBedrooms] = useState(s(existing?.bedrooms));

  const isLandLike = LAND_LIKE.has(propType);
  // Airbnb ⇒ status seasonal
  const effStatus = airbnb ? 'seasonal' : status;

  const valueN = num(value);
  // Η αντικειμενική αξία τροφοδοτεί την προεπισκόπηση απόδοσης όταν λείπει η εμπορική
  // (καθρέφτης του resolveValue: εμπορική > αντικειμενική).
  const effValueN = valueN ?? num(objValue);
  const rentN = num(rent);
  // Ετήσιο ενοίκιο: κανονικά μηνιαίο×12, για Airbnb τιμή/διανυκτέρευση×365×πληρότητα
  const annualRent = rentN != null ? (airbnb ? rentN * 365 * OCCUPANCY : rentN * 12) : null;
  const grossYield = (annualRent != null && effValueN != null && effValueN > 0) ? (annualRent / effValueN) * 100 : null;

  const rentLabel = airbnb ? 'Τιμή ανά διανυκτέρευση (€)' : 'Στόχος Ενοικίου (€/μήνα)';
  const sqmLabel = propType === 'land' ? 'Εμβαδόν Οικοπέδου (τετραγωνικά μέτρα)' : 'Εμβαδόν (τετραγωνικά μέτρα)';

  const canNext = step === 0 ? !!propType : step === 1 ? !!name.trim() : true;

  const save = async () => {
    if (!name.trim()) { setStep(1); return; }
    setSaving(true); setError('');
    // Αποθηκευόμενο μηνιαίο ισοδύναμο ενοικίου: Airbnb ⇒ τιμή/νύχτα × 30
    const storedRent = airbnb ? (rentN != null ? rentN * 30 : null) : rentN;
    const payload = {
      name: name.trim(),
      prop_type: propType,
      address: address.trim() || null,
      postal_code: postalCode.trim() || null,
      atak: atak.trim() || null,
      sqm: num(sqm),
      value: valueN,
      purchase_price: num(purchasePrice),
      target_rent: storedRent,
      floor: isLandLike ? null : (floor ? parseInt(floor) : null),
      year_built: isLandLike ? null : (yearBuilt ? parseInt(yearBuilt) : null),
      ownership: num(ownership) ?? 100,
      status_detail: effStatus,
      obj_value: num(objValue),
      enfia: num(enfia),
      purchase_date: purchaseDate || null,
      pea_class: isLandLike ? null : (peaClass || null),
      heating: isLandLike ? null : (heating || null),
      parking_spaces: isLandLike ? null : (parking ? parseInt(parking) : null),
      storage_sqm: isLandLike ? null : num(storageSqm),
      bedrooms: isLandLike ? null : (bedrooms ? parseInt(bedrooms) : null),
      rental_mode: rentalModeFromAirbnb(airbnb),
    };
    const { error: err } = isEdit
      ? await supabase.from('user_properties').update(payload).eq('id', existing!.id)
      : await supabase.from('user_properties').insert({ user_id: userId, ...payload });
    setSaving(false);
    if (err) { setError(err.message || 'Παρουσιάστηκε σφάλμα κατά την αποθήκευση.'); return; }
    onSaved();
  };

  // ── Layout helpers ────────────────────────────────────────────────────────
  const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 16 };
  const grid3: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 16 };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--bg-surface)', borderRadius: 20, width: '100%', maxWidth: 640, maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-xl)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '24px 28px 0' }}>
          <div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 500, color: 'var(--text-primary)', lineHeight: '28px' }}>{isEdit ? 'Επεξεργασία ακινήτου' : 'Νέο Ακίνητο'}</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, letterSpacing: '0.25px' }}>Βήμα {step + 1} από {STEPS.length} · {STEPS[step]}</div>
          </div>
          <button onClick={onClose} aria-label="Κλείσιμο" style={{ width: 36, height: 36, borderRadius: 18, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-overlay)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>✕</button>
        </div>

        {/* Step progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '20px 28px 4px' }}>
          {STEPS.map((label, i) => {
            const done = i < step, active = i === step;
            const on = done || active;
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : '0 0 auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: on ? 'var(--accent)' : 'var(--bg-overlay)', color: on ? 'var(--accent-text)' : 'var(--text-tertiary)',
                    border: active ? '2px solid var(--accent)' : '2px solid transparent',
                    boxShadow: active ? '0 0 0 4px var(--accent-soft)' : 'none',
                    fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, transition: 'all 0.2s',
                  }}>{done ? '✓' : i + 1}</div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 500, color: on ? 'var(--text-primary)' : 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{label}</div>
                </div>
                {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: i < step ? 'var(--accent)' : 'var(--border-subtle)', margin: '0 8px', marginBottom: 22, transition: 'background 0.2s' }} />}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div style={{ padding: '20px 28px', overflowY: 'auto', flex: 1 }}>

          {/* STEP 1, Τύπος & Κατάσταση */}
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div>
                <label style={labelStyle}>Τύπος Ακινήτου</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
                  {PROP_TYPES.map(t => {
                    const sel = propType === t;
                    return (
                      <button key={t} onClick={() => setPropType(t)} style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 8px',
                        borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s',
                        border: sel ? '2px solid var(--accent)' : '1px solid var(--border-default)',
                        background: sel ? 'var(--accent-soft)' : 'var(--bg-surface)',
                        color: sel ? 'var(--accent)' : 'var(--text-secondary)',
                      }}
                        onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'var(--bg-overlay)'; }}
                        onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'var(--bg-surface)'; }}>
                        <TypeIcon type={t} />
                        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, color: sel ? 'var(--text-primary)' : 'var(--text-secondary)', textAlign: 'center' }}>{PROP_TYPE_LABELS[t]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Κατάσταση</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, opacity: airbnb ? 0.5 : 1, pointerEvents: airbnb ? 'none' : 'auto' }}>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => {
                    const sel = status === k;
                    return (
                      <button key={k} onClick={() => setStatus(k)} style={{
                        display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 14px', borderRadius: 100, cursor: 'pointer', transition: 'all 0.15s',
                        border: sel ? '1.5px solid var(--accent)' : '1px solid var(--border-default)',
                        background: sel ? 'var(--accent-soft)' : 'var(--bg-surface)',
                        fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500,
                        color: sel ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[k] || 'var(--text-tertiary)' }} />
                        {v}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button onClick={() => setAirbnb(a => !a)} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                border: airbnb ? '1.5px solid var(--accent)' : '1px solid var(--border-default)',
                background: airbnb ? 'var(--accent-soft)' : 'var(--bg-surface)', transition: 'all 0.15s',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>Βραχυχρόνια μίσθωση (Airbnb / Booking)</div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Ορίζει την κατάσταση σε «Εποχιακό» και τιμολόγηση ανά διανυκτέρευση</div>
                </div>
                <div style={{ width: 44, height: 26, borderRadius: 13, background: airbnb ? 'var(--accent)' : 'var(--bg-overlay)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 3, left: airbnb ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                </div>
              </button>
            </div>
          )}

          {/* STEP 2, Βασικά Στοιχεία */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Field label="Ονομασία Ακινήτου *">
                <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Παράδειγμα: Αράββου 45" onFocus={onFocus} onBlur={onBlur} autoFocus />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                <Field label="Διεύθυνση">
                  <input style={inputStyle} value={address} onChange={e => setAddress(e.target.value)} placeholder="Παράδειγμα: Αράββου 45, Βύρωνας" onFocus={onFocus} onBlur={onBlur} />
                </Field>
                <Field label="Ταχ. Κώδικας">
                  <input style={inputStyle} value={postalCode} onChange={e => setPostalCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))} inputMode="numeric" placeholder="16232" onFocus={onFocus} onBlur={onBlur} />
                </Field>
              </div>
              <Field label="ΑΤΑΚ (Αριθμός Ταυτότητας Ακινήτου)">
                <input style={monoInputStyle} value={atak} onChange={e => setAtak(e.target.value.replace(/[^0-9]/g, '').slice(0, 11))} inputMode="numeric" placeholder="11 ψηφία, από το Ε9 / περιουσιολόγιο" onFocus={onFocus} onBlur={onBlur} />
              </Field>
              {isLandLike ? (
                <Field label={sqmLabel}>
                  <input style={monoInputStyle} type="number" inputMode="decimal" value={sqm} onChange={e => setSqm(e.target.value)} placeholder="250" onFocus={onFocus} onBlur={onBlur} />
                </Field>
              ) : (
                <>
                  <div style={grid3}>
                    <Field label={sqmLabel}>
                      <input style={monoInputStyle} type="number" inputMode="decimal" value={sqm} onChange={e => setSqm(e.target.value)} placeholder="85" onFocus={onFocus} onBlur={onBlur} />
                    </Field>
                    <Field label="Όροφος">
                      <input style={monoInputStyle} type="number" value={floor} onChange={e => setFloor(e.target.value)} placeholder="2" onFocus={onFocus} onBlur={onBlur} />
                    </Field>
                    <Field label="Έτος Κατασκευής">
                      <input style={monoInputStyle} type="number" value={yearBuilt} onChange={e => setYearBuilt(e.target.value)} placeholder="1995" onFocus={onFocus} onBlur={onBlur} />
                    </Field>
                  </div>
                  <div style={grid3}>
                    <Field label="Ενεργειακή Κλάση (ΠΕΑ)">
                      <select style={selectStyle} value={peaClass} onChange={e => setPeaClass(e.target.value)} onFocus={onFocus} onBlur={onBlur}>
                        <option value="">—</option>
                        {PEA_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </Field>
                    <Field label="Τύπος Θέρμανσης">
                      <select style={selectStyle} value={heating} onChange={e => setHeating(e.target.value)} onFocus={onFocus} onBlur={onBlur}>
                        <option value="">—</option>
                        {HEATING_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </Field>
                    <Field label="Θέσεις Στάθμευσης">
                      <input style={monoInputStyle} type="number" value={parking} onChange={e => setParking(e.target.value)} placeholder="1" onFocus={onFocus} onBlur={onBlur} />
                    </Field>
                  </div>
                  <div style={grid2}>
                    <Field label="Υπνοδωμάτια">
                      <input style={monoInputStyle} type="number" value={bedrooms} onChange={e => setBedrooms(e.target.value)} placeholder="2" onFocus={onFocus} onBlur={onBlur} />
                    </Field>
                    <Field label="Αποθήκη (τ.μ.)">
                      <input style={monoInputStyle} type="number" inputMode="decimal" value={storageSqm} onChange={e => setStorageSqm(e.target.value)} placeholder="8" onFocus={onFocus} onBlur={onBlur} />
                    </Field>
                  </div>
                </>
              )}
            </div>
          )}

          {/* STEP 3, Οικονομικά */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={grid2}>
                <Field label="Εμπορική Αξία (€)">
                  <input style={monoInputStyle} type="number" inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} placeholder="145000" onFocus={onFocus} onBlur={onBlur} />
                </Field>
                <Field label="Αντικειμενική Αξία (€)">
                  <input style={monoInputStyle} type="number" inputMode="decimal" value={objValue} onChange={e => setObjValue(e.target.value)} placeholder="110000" onFocus={onFocus} onBlur={onBlur} />
                </Field>
              </div>
              <div style={grid2}>
                <Field label="Τιμή Αγοράς (€)">
                  <input style={monoInputStyle} type="number" inputMode="decimal" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} placeholder="120000" onFocus={onFocus} onBlur={onBlur} />
                </Field>
                <DatePicker label="Ημερομηνία Αγοράς" value={purchaseDate} onChange={setPurchaseDate} />

              </div>
              <div style={grid2}>
                <Field label="Εκτ. ΕΝΦΙΑ (€/έτος)">
                  <input style={monoInputStyle} type="number" inputMode="decimal" value={enfia} onChange={e => setEnfia(e.target.value)} placeholder="320" onFocus={onFocus} onBlur={onBlur} />
                </Field>
                <Field label={rentLabel}>
                  <input style={monoInputStyle} type="number" inputMode="decimal" value={rent} onChange={e => setRent(e.target.value)} placeholder={airbnb ? '75' : '820'} onFocus={onFocus} onBlur={onBlur} />
                </Field>
              </div>
              <div style={grid2}>
                <Field label="Ποσοστό Ιδιοκτησίας (%)">
                  <input style={monoInputStyle} type="number" inputMode="decimal" value={ownership} onChange={e => setOwnership(e.target.value)} placeholder="100" onFocus={onFocus} onBlur={onBlur} />
                </Field>
              </div>

              {grossYield != null && (
                <div style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: 12, padding: '16px 18px' }}>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)', marginBottom: 6 }}>Εκτιμώμενη Μεικτή Απόδοση</div>
                  <div style={{ fontFamily: "'Roboto Mono', monospace", fontSize: 28, fontWeight: 500, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{grossYield.toFixed(1)}%</div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                    {airbnb
                      ? `Ετήσια έσοδα ${fe(annualRent!, 0)} με εκτιμώμενη πληρότητα 60%`
                      : `Ετήσια έσοδα ${fe(annualRent!, 0)} επί ${valueN != null ? 'εμπορικής' : 'αντικειμενικής'} αξίας ${fe(effValueN!, 0)}`}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 4, Σύνοψη */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 12 }}>
                <div style={{ color: 'var(--accent)' }}><TypeIcon type={propType} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name.trim() || '—'}</div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{PROP_TYPE_LABELS[propType]}{address.trim() ? ` · ${address.trim()}` : ''}</div>
                </div>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 12px', borderRadius: 100, border: '1px solid var(--border-subtle)', fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, color: STATUS_COLORS[effStatus] }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLORS[effStatus] }} />{STATUS_LABELS[effStatus]}
                </span>
              </div>

              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
                {([
                  ['Τύπος', PROP_TYPE_LABELS[propType]],
                  ['Κατάσταση', STATUS_LABELS[effStatus]],
                  airbnb ? ['Βραχυχρόνια μίσθωση', 'Ναι (Airbnb / Booking)'] : null,
                  ['Διεύθυνση', address.trim() || '—'],
                  postalCode.trim() ? ['Ταχ. Κώδικας', postalCode.trim()] : null,
                  atak.trim() ? ['ΑΤΑΚ', atak.trim()] : null,
                  [propType === 'land' ? 'Εμβαδόν Οικοπέδου' : 'Εμβαδόν', num(sqm) != null ? `${fn(num(sqm)!)} τετραγωνικά` : '—'],
                  isLandLike ? null : ['Όροφος', floor.trim() ? floor.trim() : '—'],
                  isLandLike ? null : ['Έτος Κατασκευής', yearBuilt.trim() ? yearBuilt.trim() : '—'],
                  isLandLike ? null : (peaClass ? ['Ενεργειακή Κλάση', peaClass] : null),
                  isLandLike ? null : (heating ? ['Θέρμανση', HEATING_OPTS.find(h => h[0] === heating)?.[1] || heating] : null),
                  isLandLike ? null : (parking.trim() ? ['Θέσεις Στάθμευσης', parking.trim()] : null),
                  isLandLike ? null : (num(storageSqm) != null ? ['Αποθήκη', `${fn(num(storageSqm)!)} τ.μ.`] : null),
                  ['Εμπορική Αξία', valueN != null ? fe(valueN, 0) : '—'],
                  num(objValue) != null ? ['Αντικειμενική Αξία', fe(num(objValue)!, 0)] : null,
                  num(enfia) != null ? ['Εκτ. ΕΝΦΙΑ', `${fe(num(enfia)!, 0)} / έτος`] : null,
                  ['Τιμή Αγοράς', num(purchasePrice) != null ? fe(num(purchasePrice)!, 0) : '—'],
                  purchaseDate ? ['Ημ. Αγοράς', new Date(purchaseDate).toLocaleDateString('el-GR')] : null,
                  [airbnb ? 'Τιμή ανά διανυκτέρευση' : 'Στόχος Ενοικίου', rentN != null ? (airbnb ? fe(rentN, 0) : `${fe(rentN, 0)} / μήνα`) : '—'],
                  ['Ποσοστό Ιδιοκτησίας', `${fn(num(ownership) ?? 100)}%`],
                  ['Εκτιμώμενη Μεικτή Απόδοση', grossYield != null ? `${grossYield.toFixed(1)}%` : '—'],
                ].filter(Boolean) as [string, string][]).map(([k, v], i) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)' }}>
                    <span title={k === 'ΑΤΑΚ' ? 'Αριθμός Ταυτότητας Ακινήτου (από το Ε9)' : k === 'Εκτ. ΕΝΦΙΑ' ? 'Ενιαίος Φόρος Ιδιοκτησίας Ακινήτων (ετήσιος)' : undefined} style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--text-secondary)', letterSpacing: '0.25px' }}>{k}</span>
                    <span style={{ fontFamily: k === 'Τύπος' || k === 'Κατάσταση' || k === 'Διεύθυνση' || k === 'Βραχυχρόνια μίσθωση' || k === 'Θέρμανση' || k === 'Ενεργειακή Κλάση' || k === 'Ημ. Αγοράς' ? "'Inter', sans-serif" : "'Roboto Mono', monospace", fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{v}</span>
                  </div>
                ))}
              </div>

              {error && (
                <div style={{ background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: 10, padding: '10px 14px', fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--negative)' }}>{error}</div>
              )}
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', padding: '16px 28px', borderTop: '1px solid var(--border-subtle)' }}>
          <button onClick={() => (step === 0 ? onClose() : setStep(s => s - 1))} style={{ height: 40, padding: '0 20px', borderRadius: 100, border: 'none', background: 'transparent', color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 500, cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-overlay)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            {step === 0 ? 'Ακύρωση' : 'Πίσω'}
          </button>

          {step < STEPS.length - 1 ? (
            <button onClick={() => canNext && setStep(s => s + 1)} disabled={!canNext} style={{
              height: 40, padding: '0 24px', borderRadius: 100, border: 'none',
              background: canNext ? 'var(--accent)' : 'var(--bg-overlay)', color: canNext ? 'var(--accent-text)' : 'var(--text-tertiary)',
              fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 500, cursor: canNext ? 'pointer' : 'not-allowed',
            }}>Συνέχεια</button>
          ) : (
            <button onClick={save} disabled={saving || !name.trim()} style={{
              height: 40, padding: '0 24px', borderRadius: 100, border: 'none',
              background: saving || !name.trim() ? 'var(--bg-overlay)' : 'var(--accent)', color: saving || !name.trim() ? 'var(--text-tertiary)' : 'var(--accent-text)',
              fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 500, cursor: saving || !name.trim() ? 'not-allowed' : 'pointer',
            }}>{saving ? 'Αποθήκευση...' : isEdit ? 'Αποθήκευση αλλαγών' : 'Προσθήκη Ακινήτου'}</button>
          )}
        </div>
      </div>
    </div>
  );
}
