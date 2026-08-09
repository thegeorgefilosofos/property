'use client';

import { useState, useMemo } from 'react';
import { NumberInput, CustomSelect, TextInput, Toggle, DatePicker } from './UIComponents';
import { useBillsSettings } from './BillsSettings';
import { T, fe, fp, Spinner, histInputStyle } from '@/components/Theme';
import { estimateENFIA, enfiaInUse, enfiaLastYearAnnual } from '@/lib/billing/enfia';
import { MONTHS_SHORT } from '@/lib/core/months';



const FREQ = [
  { value: 'weekly',   label: 'Εβδομαδιαίος'   },
  { value: 'biweekly', label: 'Δεκαπενθήμερος' },
  { value: 'monthly',  label: 'Μηνιαίος'        },
  { value: 'seasonal', label: 'Εποχικός'         },
  { value: 'annual',   label: 'Ετήσιος'          },
];
const toMonthly = (cost: string, freq: string) => {
  const c = parseFloat(cost) || 0;
  const m: Record<string, number> = { weekly: 4.33, biweekly: 2, monthly: 1, seasonal: 1/3, annual: 1/12 };
  return c * (m[freq] || 1);
};


// Ο υπολογισμός ζει πλέον στο lib/billing/enfia (μία πηγή αλήθειας). Thin wrapper
// με τα ίδια ονόματα πεδίων για συμβατότητα του υπάρχοντος UI.
function calcENFIA(sqm: number, zone: string, floor: string, age: string, ownership: number, totalVal: number, propVal: number, reductions: string[]) {
  // propVal = αντικειμενική αξία ΑΥΤΟΥ του ακινήτου (Ενότητα Γ). Αν δεν δοθεί ξεχωριστά και
  // η συνολική αξία αφορά ένα μόνο ακίνητο, ο χρήστης βάζει το ίδιο ποσό και στα δύο πεδία.
  const r = estimateENFIA({ sqm, zone, floor, age, ownership, totalValue: totalVal, propertyValue: propVal, reductions });
  if (!r) return null;
  return { basic: r.basic, extra: r.extra, suppl: r.supplementary, subtotal: r.subtotal, redAmt: r.reductionAmount, maxPct: r.reductionPct, final: r.annual, installment: r.installment };
}

const DEFAULTS = {
  enfiaAnnual: '', enfiaMonthly: '',
  enfiaLastAnnual: '', enfiaLastInstalment: '', enfiaLastCount: '12', enfiaSqm: '', enfiaZone: '', enfiaFloor: '',
  enfiaAge: '', enfiaOwnership: '100', enfiaTotalVal: '', enfiaPropVal: '', enfiaReductions: [] as string[],
  enfiaShowCalc: true,
  dimotikaHistory: Array(12).fill('') as string[],
  lastBillTotal: '', lastBillDimotika: '',
  hasCleaning: false, cleaningContact: '', cleaningPhone: '', cleaningFreq: 'monthly',
  cleaningCostPerVisit: '', cleaningHours: '', cleaningNotes: '',
  hasGarden: false, gardenContact: '', gardenPhone: '', gardenFreq: 'monthly',
  gardenCost: '', gardenNotes: '',
  hasPool: false, poolContact: '', poolPhone: '', poolWeeklyCost: '',
  poolChemicals: '', poolSeasonOpen: '', poolSeasonClose: '',
  hasAC: false, acContact: '', acPhone: '', acUnits: '1', acServiceCost: '',
  acLastService: '', acNotes: '',
  hasElevator: false, elevatorCompany: '', elevatorPhone: '', elevatorMonthly: '',
  elevatorLastInspection: '', elevatorNotes: '',
  hasPest: false, pestContact: '', pestPhone: '', pestCost: '',
  pestFreq: 'annual', pestLastDate: '',
  otherServices: [] as { name: string; contact: string; phone: string; cost: string; freq: string }[],
};

interface Props { propertyId: string; userId?: string; }

export default function BillsServices({ propertyId, userId = '' }: Props) {
  const [s, upd, loading] = useBillsSettings(propertyId, userId, 'services', DEFAULTS);

  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 };
  const g2: React.CSSProperties  = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 14 };
  const g4: React.CSSProperties  = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 14, marginBottom: 14 };

  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const [newName, setNewName]       = useState('');
  const [newContact, setNewContact] = useState('');
  const [newPhone, setNewPhone]     = useState('');
  const [newCost, setNewCost]       = useState('');
  const [newFreq, setNewFreq]       = useState('monthly');

  // ΤΟ ΔΙΑΣΤΑΥΡΟΥΜΕΝΟ ΕΡΩΤΗΜΑ ΕΦΥΓΕ ΜΑΖΙ ΜΕ ΤΟΝ ΥΠΟΛΟΓΙΣΜΟ ΕΝΦΙΑ.
  // Τέσσερα ερωτήματα στη βάση σε κάθε άνοιγμα της οθόνης, για τρία πλαίσια που
  // αφορούσαν όλα τον ΕΝΦΙΑ — και το ένα από τα τέσσερα διάβαζε πεδίο που δεν
  // γράφει κανείς, οπότε το πλαίσιό του δεν εμφανίστηκε ποτέ. Ό,τι αφορά τον
  // φόρο ζει τώρα στη Λογιστική, μαζί με τα δεδομένα του.

  const enfiaResult = useMemo(() => calcENFIA(
    parseFloat(s.enfiaSqm) || 0, s.enfiaZone, s.enfiaFloor, s.enfiaAge,
    parseFloat(s.enfiaOwnership) || 100, parseFloat(s.enfiaTotalVal) || 0,
    parseFloat(s.enfiaPropVal) || 0, s.enfiaReductions || []
  ), [s.enfiaSqm, s.enfiaZone, s.enfiaFloor, s.enfiaAge, s.enfiaOwnership, s.enfiaTotalVal, s.enfiaPropVal, s.enfiaReductions]);

  // ΤΟ ΔΗΛΩΜΕΝΟ ΠΟΣΟ ΝΙΚΑ ΤΗΝ ΕΚΤΙΜΗΣΗ. Η απόφαση ζει στο lib/billing/enfia.ts,
  // γιατί τη χρειάζεται και ο Προϋπολογισμός — και εκεί διάβαζε ΜΟΝΟ το δηλωμένο,
  // δείχνοντας 0 € για ακίνητο που εδώ έδειχνε δεκάδες ευρώ τον μήνα.
  const enfia = enfiaInUse(s.enfiaAnnual, s.enfiaMonthly, enfiaResult?.final,
    enfiaLastYearAnnual({ annual: s.enfiaLastAnnual, instalment: s.enfiaLastInstalment, instalments: s.enfiaLastCount }));
  const enfiaM = enfia.monthly;
  const dimotikaAvg = (s.dimotikaHistory || []).filter((v: string) => v).length > 0
    ? (s.dimotikaHistory || []).reduce((sum: number, v: string) => sum + (parseFloat(v) || 0), 0) / (s.dimotikaHistory || []).filter((v: string) => v).length : 0;
  const dimotikaPct = s.lastBillTotal && s.lastBillDimotika && parseFloat(s.lastBillTotal) > 0
    ? (parseFloat(s.lastBillDimotika) / parseFloat(s.lastBillTotal)) * 100 : 0;

  const cleaningM = s.hasCleaning ? toMonthly(s.cleaningCostPerVisit, s.cleaningFreq) : 0;
  const gardenM   = s.hasGarden   ? toMonthly(s.gardenCost, s.gardenFreq)             : 0;
  const poolM     = s.hasPool ? ((parseFloat(s.poolWeeklyCost) || 0) * 4.33 + (parseFloat(s.poolChemicals) || 0)) : 0;
  const acM       = s.hasAC       ? toMonthly(s.acServiceCost, 'annual')               : 0;
  const elevM     = s.hasElevator ? (parseFloat(s.elevatorMonthly) || 0)               : 0;
  const pestM     = s.hasPest     ? toMonthly(s.pestCost, s.pestFreq)                  : 0;
  const otherM    = (s.otherServices || []).reduce((sum, o) => sum + toMonthly(o.cost, o.freq), 0);
  const totalServices = enfiaM + dimotikaAvg + cleaningM + gardenM + poolM + acM + elevM + pestM + otherM;

  const today        = new Date();
  const currentMonth = today.getMonth();
  const maxH         = Math.max(...(s.dimotikaHistory || []).map((v: string) => parseFloat(v) || 0), 1);

  const addOther = () => {
    if (!newName || !newCost) return;
    upd({ otherServices: [...(s.otherServices || []), { name: newName, contact: newContact, phone: newPhone, cost: newCost, freq: newFreq }] });
    setNewName(''); setNewContact(''); setNewPhone(''); setNewCost('');
  };
  const delOther   = (i: number) => upd({ otherServices: (s.otherServices || []).filter((_, j) => j !== i) });
  const updHistory = (i: number, v: string) => { const n = [...(s.dimotikaHistory || [])]; n[i] = v; upd({ dimotikaHistory: n }); };

  if (loading) return <Spinner label="Φόρτωση…" />;

  // ── Section header ────────────────────────────────────────────────────────
  const secHdr = (label: string, sub?: string, link?: { url: string; text: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 1 }}>{sub}</div>}
      </div>
      {link?.url && (
        <a href={link.url} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 10, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, fontFamily: T.font.sans, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: T.radius.pill, padding: '3px 10px', whiteSpace: 'nowrap' as const }}>
          {link.text}
        </a>
      )}
    </div>
  );

  // ── FIX: svcHdr, "0" bug: only show cost if active AND cost > 0 ──────────
  const svcHdr = (label: string, active: boolean, onToggle: (v: boolean) => void, cost?: number) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: active ? 16 : 0, paddingBottom: active ? 10 : 0, borderBottom: active ? '1px solid var(--border-subtle)' : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: active ? 'var(--accent)' : 'var(--border-default)', flexShrink: 0 }}/>
        <div>
          {/* FIX: label and cost are separate, no concatenation */}
          <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: active ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: T.font.sans }}>{label}</span>
          {/* FIX: only show if active AND cost is a positive number */}
          {active && typeof cost === 'number' && cost > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', marginLeft: 8 }}>{fe(cost)} / μήνα</span>
          )}
        </div>
      </div>
      <Toggle on={active} onChange={onToggle} ariaLabel="Ενεργή υπηρεσία"/>
    </div>
  );

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>



      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Υπηρεσίες / μήνα',     value: fe(totalServices)                        },
          { label: 'Υπηρεσίες / έτος',     value: fe(totalServices * 12)                   },
          // Ένα ποσό φόρου χωρίς σήμανση διαβάζεται ως βεβαιότητα. Η ετικέτα λέει
          // αν είναι το ποσό του εκκαθαριστικού ή νούμερο του υπολογιστή.
          { label: enfia.source === 'estimate' ? 'ΕΝΦΙΑ / μήνα (εκτίμηση)' : 'ΕΝΦΙΑ / μήνα',
            value: enfiaM > 0 ? fe(enfiaM) : fe(0) },
          { label: 'Δημοτικά Τέλη (μέσος όρος) / μήνα', value: dimotikaAvg > 0 ? fe(dimotikaAvg) : fe(0) },
        ].map((k, i) => (
          <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Ο ΥΠΟΛΟΓΙΣΜΟΣ ΕΝΦΙΑ ΕΦΥΓΕ ΑΠΟ ΕΔΩ, ΚΑΙ ΜΕ ΑΥΤΟΝ ΤΡΙΑ ΣΦΑΛΜΑΤΑ.

          Ζούσε 220 γραμμές μέσα σε πάνελ «Υπηρεσίες», διπλωμένος πίσω από
          κουμπί «Ανάπτυξη». Ο φόρος του ακινήτου δεν είναι υπηρεσία δίπλα στον
          κηπουρό και την απεντόμωση: είναι φόρος, και ζει στη Λογιστική.

          Τα σφάλματα που έφυγαν μαζί του: η δόση τυπωνόταν ετήσιο διά δώδεκα
          κάτω από πίνακα έξι δόσεων· η φόρμα είχε προεπιλεγμένα «2ος όροφος»
          και «10-14 έτη», ξαναφέρνοντας τη μεροληψία +16,15% που η μηχανή είχε
          ρητά αφαιρέσει· και ένα πλαίσιο ανακοίνωνε «αύξηση περίπου 8%» που ο
          υπολογισμός δεν εφάρμοζε πουθενά.

          Τα ΠΟΣΑ μένουν εδώ: το μηνιαίο ΕΝΦΙΑ μετράει κανονικά στο σύνολο των
          υπηρεσιών, διαβασμένο από τις ίδιες ρυθμίσεις. Άλλαξε το πού
          συμπληρώνεται, όχι το πού μετράει. */}


      {/* ── Δημοτικά Τέλη ────────────────────────────────────────────────── */}
      <div style={card}>
        {secHdr('Δημοτικά Τέλη')}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: 14, marginBottom: 14, border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10, fontFamily: T.font.sans }}>Υπολογισμός ποσοστού από τελευταίο λογαριασμό ρεύματος</div>
          {/* FIX: 2 inputs + result, all in same grid, aligned at bottom, no marginBottom on result box */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12, marginBottom: 10 }}>
            <NumberInput label="Σύνολο λογαριασμού"       value={s.lastBillTotal}    onChange={v => upd({ lastBillTotal: v })}    suffix="€" step={1}/>
            <NumberInput label="Δημοτικά τέλη στον λογαριασμό" value={s.lastBillDimotika} onChange={v => upd({ lastBillDimotika: v })} suffix="€" step={0.5}/>
          </div>
          {/* Το αποτέλεσμα ως συμπτυγμένη ενσωματωμένη πλάκα — ίδιο μοτίβο με Παρόχους και Ρεύμα */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: dimotikaPct > 0 ? 'var(--accent-soft)' : 'var(--bg-base)', border: `1px solid ${dimotikaPct > 0 ? 'var(--accent)' : 'var(--border-subtle)'}`, borderRadius: T.radius.inner, padding: '8px 14px' }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: dimotikaPct > 0 ? 'var(--accent)' : 'var(--text-tertiary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {dimotikaPct > 0 ? `${fp(dimotikaPct)}` : fp(0)}
              </span>
              <div>
                <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans }}>Ποσοστό δημοτικών τελών</div>
                <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Αθήνα: ~5% · Τυπικό: 3–6%</div>
              </div>
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Συγχρονίζεται με tab Πάροχοι</span>
          </div>
        </div>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>
          Ιστορικό Δημοτικών Τελών / μήνα, Μέσος Όρος: {dimotikaAvg > 0 ? fe(dimotikaAvg) : 'δεν υπάρχουν δεδομένα'}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 56, marginBottom: 4, padding: '4px 0 0' }}>
          {MONTHS_SHORT.map((m, i) => {
            const val   = parseFloat((s.dimotikaHistory || [])[i]) || 0;
            const pct   = val / maxH;
            const isCur = i === currentMonth;
            const isHov = hoveredMonth === i;
            const isHigh = dimotikaAvg > 0 && val > dimotikaAvg * 1.2;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 1, cursor: 'pointer' }}
                onMouseEnter={() => setHoveredMonth(i)} onMouseLeave={() => setHoveredMonth(null)}>
                <div style={{ fontSize: 9, color: isHigh ? 'var(--negative)' : isCur ? 'var(--accent)' : isHov ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', height: 12, display: 'flex', alignItems: 'flex-end' }}>
                  {val > 0 ? Math.round(val) : ''}
                </div>
                <div style={{ width: '100%', height: `${Math.max(pct * 42, 2)}px`, background: isCur ? 'var(--accent)' : isHigh ? 'var(--negative)' : isHov ? 'color-mix(in srgb, var(--accent) 70%, transparent)' : 'color-mix(in srgb, var(--accent) 45%, transparent)', borderRadius: '3px 3px 0 0', transition: 'background 0.15s' }}/>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderTop: '1px solid var(--border-subtle)', paddingTop: 4 }}>
          {MONTHS_SHORT.map((m, i) => (
            <div key={i} style={{ flex: 1, fontSize: 9, color: i === currentMonth ? 'var(--accent)' : hoveredMonth === i ? 'var(--text-primary)' : 'var(--text-tertiary)', textAlign: 'center' as const, fontWeight: i === currentMonth ? 700 : hoveredMonth === i ? 600 : 400, fontFamily: T.font.sans, cursor: 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={() => setHoveredMonth(i)} onMouseLeave={() => setHoveredMonth(null)}>{m}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 90px), 1fr))', gap: 6 }}>
          {MONTHS_SHORT.map((m, i) => (
            <div key={i}>
              {/* Ίδιος λόγος με το BillsCommon: η ετικέτα περιτυλίγει το πεδίο
                  ώστε να ακούγεται ο μήνας, και μεγαλώνει από 8 σε 10. */}
              <label style={{ fontSize: 10, color: i === currentMonth ? 'var(--accent)' : 'var(--text-secondary)', display: 'block', marginBottom: 4, textAlign: 'center' as const, fontFamily: T.font.sans, transition: 'color 0.15s' }}>
                <span style={{ display: 'block', marginBottom: 4 }}>{m}</span>
                <input aria-label={`${m}, ποσό σε ευρώ`} type="number" min={0} value={(s.dimotikaHistory || [])[i] || ''} onChange={e => updHistory(i, e.target.value)} placeholder="€"
                  onMouseEnter={() => setHoveredMonth(i)} onMouseLeave={() => setHoveredMonth(null)}
                  onFocus={() => setHoveredMonth(i)} onBlur={() => setHoveredMonth(null)}
                  style={histInputStyle(i === currentMonth, hoveredMonth === i)}/>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* ── Καθαρισμός ───────────────────────────────────────────────────── */}
      <div style={card}>
        {svcHdr('Καθαρισμός', s.hasCleaning, v => upd({ hasCleaning: v }), cleaningM)}
        {s.hasCleaning && (
          <>
            <div style={g4}>
              <TextInput    label="Εταιρεία ή όνομα"        value={s.cleaningContact}      onChange={v => upd({ cleaningContact: v })}      placeholder="Παράδειγμα: Μαρία Α."/>
              <TextInput    label="Τηλέφωνο"                 value={s.cleaningPhone}        onChange={v => upd({ cleaningPhone: v })}        placeholder="69xxxxxxxx"/>
              <CustomSelect label="Συχνότητα"               value={s.cleaningFreq}         onChange={v => upd({ cleaningFreq: v })}         options={FREQ}/>
              <NumberInput  label="Κόστος ανά επίσκεψη" value={s.cleaningCostPerVisit} onChange={v => upd({ cleaningCostPerVisit: v })} suffix="€" step={5}/>
            </div>
            <div style={g2}>
              <NumberInput label="Ώρες ανά Επίσκεψη" value={s.cleaningHours} onChange={v => upd({ cleaningHours: v })} suffix="ώρες" step={0.5}/>
              <TextInput   label="Σημειώσεις"         value={s.cleaningNotes} onChange={v => upd({ cleaningNotes: v })} placeholder="Παράδειγμα: κάθε Τετάρτη"/>
            </div>
            {cleaningM > 0 && (
              <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '10px 14px', fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans, border: '1px solid var(--border-subtle)' }}>
                Μηνιαίο: <strong style={{ color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fe(cleaningM)}</strong>
                {s.cleaningHours && s.cleaningCostPerVisit && parseFloat(s.cleaningHours) > 0 && (
                  <span style={{ marginLeft: 14 }}>Ωριαίο: <strong style={{ fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fe(parseFloat(s.cleaningCostPerVisit) / parseFloat(s.cleaningHours))} / ώρα</strong></span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Κηπουρός ─────────────────────────────────────────────────────── */}
      <div style={card}>
        {svcHdr('Κηπουρός', s.hasGarden, v => upd({ hasGarden: v }), gardenM)}
        {s.hasGarden && (
          <div style={g4}>
            <TextInput    label="Κηπουρός ή εταιρεία"      value={s.gardenContact} onChange={v => upd({ gardenContact: v })} placeholder="Παράδειγμα: Νίκος Κ."/>
            <TextInput    label="Τηλέφωνο"                   value={s.gardenPhone}   onChange={v => upd({ gardenPhone: v })}   placeholder="69xxxxxxxx"/>
            <CustomSelect label="Συχνότητα"                 value={s.gardenFreq}    onChange={v => upd({ gardenFreq: v })}    options={FREQ}/>
            <NumberInput  label="Κόστος ανά επίσκεψη"   value={s.gardenCost}    onChange={v => upd({ gardenCost: v })}   suffix="€" step={10}/>
          </div>
        )}
      </div>

      {/* ── Πισίνα ───────────────────────────────────────────────────────── */}
      <div style={card}>
        {svcHdr('Πισίνα', s.hasPool, v => upd({ hasPool: v }), poolM)}
        {s.hasPool && (
          <>
            <div style={g4}>
              <TextInput   label="Τεχνικός ή εταιρεία "     value={s.poolContact}    onChange={v => upd({ poolContact: v })}    placeholder="Pool Service"/>
              <TextInput   label="Τηλέφωνο"                 value={s.poolPhone}      onChange={v => upd({ poolPhone: v })}      placeholder="69xxxxxxxx"/>
              <NumberInput label="Εβδομαδιαίο κόστος"  value={s.poolWeeklyCost} onChange={v => upd({ poolWeeklyCost: v })} suffix="€" step={5}/>
              <NumberInput label="Χημικά τον μήνα"        value={s.poolChemicals}  onChange={v => upd({ poolChemicals: v })} suffix="€" step={5}/>
            </div>
            <div style={g2}>
              <DatePicker label="Άνοιγμα σεζόν"  value={s.poolSeasonOpen}  onChange={v => upd({ poolSeasonOpen: v })}/>
              <DatePicker label="Κλείσιμο σεζόν" value={s.poolSeasonClose} onChange={v => upd({ poolSeasonClose: v })}/>
            </div>
          </>
        )}
      </div>

      {/* ── Κλιματιστικά ─────────────────────────────────────────────────── */}
      <div style={card}>
        {svcHdr('Συντήρηση Κλιματιστικών', s.hasAC, v => upd({ hasAC: v }), acM)}
        {s.hasAC && (
          <>
            <div style={g4}>
              <TextInput   label="Τεχνικός ή εταιρεία"           value={s.acContact}     onChange={v => upd({ acContact: v })}     placeholder="Παναγιώτης Τ."/>
              <TextInput   label="Τηλέφωνο"                        value={s.acPhone}       onChange={v => upd({ acPhone: v })}       placeholder="69xxxxxxxx"/>
              <NumberInput label="Αριθμός κλιματιστικών"           value={s.acUnits}       onChange={v => upd({ acUnits: v })}       suffix="τεμάχια" step={1}/>
              <NumberInput label="Κόστος συντήρησης ανά τεμάχιο"  value={s.acServiceCost} onChange={v => upd({ acServiceCost: v })} suffix="€" step={10}/>
            </div>
            <div style={g2}>
              <DatePicker label="Τελευταία συντήρηση" value={s.acLastService} onChange={v => upd({ acLastService: v })}/>
              <TextInput  label="Σημειώσεις"        value={s.acNotes}      onChange={v => upd({ acNotes: v })}      placeholder="Παράδειγμα: Κάθε Απρίλιο"/>
            </div>
            {s.acServiceCost && s.acUnits && parseFloat(s.acServiceCost) > 0 && (
              <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '10px 14px', fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans, border: '1px solid var(--border-subtle)' }}>
                Ετήσιο σέρβις: <strong style={{ color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fe((parseFloat(s.acServiceCost) || 0) * (parseInt(s.acUnits) || 1))}</strong>
                <span style={{ marginLeft: 14 }}>Μηνιαία αναγωγή: <strong style={{ fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fe((parseFloat(s.acServiceCost) || 0) * (parseInt(s.acUnits) || 1) / 12)}</strong></span>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Ανελκυστήρας ─────────────────────────────────────────────────── */}
      <div style={card}>
        {svcHdr('Ανελκυστήρας', s.hasElevator, v => upd({ hasElevator: v }), elevM)}
        {s.hasElevator && (
          <>
            <div style={g4}>
              <TextInput   label="Τεχνικός ή εταιρεία "   value={s.elevatorCompany}        onChange={v => upd({ elevatorCompany: v })}        placeholder="Otis, Schindler..."/>
              <TextInput   label="Τηλέφωνο"               value={s.elevatorPhone}          onChange={v => upd({ elevatorPhone: v })}          placeholder="210xxxxxxx"/>
              <NumberInput label="Μηνιαία συντήρηση"  value={s.elevatorMonthly}        onChange={v => upd({ elevatorMonthly: v })}        suffix="€" step={5}/>
              <DatePicker  label="Τελευταία συντήρηση"  value={s.elevatorLastInspection} onChange={v => upd({ elevatorLastInspection: v })}/>
            </div>
            <TextInput label="Σημειώσεις" value={s.elevatorNotes} onChange={v => upd({ elevatorNotes: v })} placeholder="Παράδειγμα: Ετήσιος έλεγχος ΕΛΟΤ…"/>
          </>
        )}
      </div>

      {/* ── Απεντόμωση ───────────────────────────────────────────────────── */}
      <div style={card}>
        {svcHdr('Απεντόμωση', s.hasPest, v => upd({ hasPest: v }), pestM)}
        {s.hasPest && (
          <div style={g4}>
            <TextInput    label="Τεχνικός ή εταιρεία"                 value={s.pestContact} onChange={v => upd({ pestContact: v })} placeholder="Anticimex, Rentokil..."/>
            <TextInput    label="Τηλέφωνο"                 value={s.pestPhone}   onChange={v => upd({ pestPhone: v })}   placeholder="69xxxxxxxx"/>
            <NumberInput  label="Κόστος ανά απεντόμωση"  value={s.pestCost}   onChange={v => upd({ pestCost: v })}   suffix="€" step={10}/>
            <CustomSelect label="Συχνότητα"               value={s.pestFreq}    onChange={v => upd({ pestFreq: v })}   options={FREQ}/>
          </div>
        )}
      </div>

      {/* ── Άλλες Υπηρεσίες ──────────────────────────────────────────────── */}
      <div style={card}>
        {secHdr('Άλλες Υπηρεσίες')}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: 14, marginBottom: 14, border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 12, marginBottom: 12 }}>
            <TextInput label="Υπηρεσία"         value={newName}    onChange={setNewName}    placeholder="Παράδειγμα: Βαφή, Υδραυλικός…"/>
            <TextInput label="Τεχνικός ή εταιρεία" value={newContact} onChange={setNewContact} placeholder="Ονοματεπώνυμο ή Εταιρεία"/>
            <TextInput label="Τηλέφωνο"          value={newPhone}   onChange={setNewPhone}   placeholder="69xxxxxxxx"/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'flex-end' }}>
            <NumberInput  label="Κόστος" value={newCost} onChange={setNewCost} suffix="€" step={10}/>
            <CustomSelect label="Συχνότητα"  value={newFreq} onChange={setNewFreq} options={FREQ}/>
            <button onClick={addOther}
              style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: T.radius.btn, padding: '0 20px', height: T.h.lg, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans, whiteSpace: 'nowrap' as const }}>
              + Προσθήκη
            </button>
          </div>
        </div>
        {(s.otherServices || []).map((o, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{o.name}</span>
              {o.contact && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 10, fontFamily: T.font.sans }}>{o.contact}</span>}
              {o.phone   && <span style={{ fontSize: 10, color: 'var(--accent)',           marginLeft: 10, fontFamily: T.font.sans }}>{o.phone}</span>}
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)', marginLeft: 10, fontFamily: T.font.sans }}>{FREQ.find(f => f.value === o.freq)?.label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fe(toMonthly(o.cost, o.freq))} / μήνα</span>
              <button onClick={() => delOther(i)}
                style={{ width: T.h.sm, height: T.h.sm, borderRadius: T.radius.badge, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 12 }}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Σύνοψη ───────────────────────────────────────────────────────── */}
      {totalServices > 0 && (
        <div style={card}>
          {secHdr('Σύνοψη Υπηρεσιών')}
          {([
            { label: 'ΕΝΦΙΑ 2026',              amount: enfiaM      },
            { label: 'Δημοτικά Τέλη (μέσος όρος)',    amount: dimotikaAvg },
            { label: 'Καθαρισμός',              amount: cleaningM   },
            { label: 'Κηπουρός',                amount: gardenM     },
            { label: 'Πισίνα',                  amount: poolM       },
            { label: 'Σέρβις Κλιματιστικών',    amount: acM         },
            { label: 'Ανελκυστήρας',            amount: elevM       },
            { label: 'Απεντόμωση',              amount: pestM       },
            { label: 'Άλλες Υπηρεσίες',         amount: otherM      },
          ] as { label: string; amount: number }[]).filter(r => r.amount > 0).map((r, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{r.label}</span>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fe(r.amount)} / μήνα</span>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 10, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fe(r.amount * 12)} / έτος</span>
                </div>
              </div>
              <div style={{ height: 4, background: 'var(--bg-overlay)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${totalServices > 0 ? (r.amount / totalServices) * 100 : 0}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.3s' }}/>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderTop: '2px solid var(--border-subtle)', marginTop: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: T.font.sans }}>Σύνολο υπηρεσιών</span>
            <div style={{ textAlign: 'right' as const }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fe(totalServices)} / μήνα</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', marginTop: 3 }}>{fe(totalServices * 12)} / έτος</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}