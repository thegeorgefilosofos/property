'use client';

import { useState } from 'react';
import { NumberInput, CustomSelect, TextInput, Toggle, DatePicker } from './UIComponents';
import { useBillsSettings } from './BillsSettings';

const MONTHS_GR = ['Ιαν','Φεβ','Μαρ','Απρ','Μαΐ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
const fe = (n: number, d = 2) => `${n.toLocaleString('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
const FREQ = [
  { value: 'weekly', label: 'Εβδομαδιαίος' },
  { value: 'biweekly', label: 'Δεκαπενθήμερος' },
  { value: 'monthly', label: 'Μηνιαίος' },
  { value: 'seasonal', label: 'Εποχικός' },
  { value: 'annual', label: 'Ετήσιος' },
];
const toMonthly = (cost: string, freq: string) => {
  const c = parseFloat(cost) || 0;
  const m: any = { weekly: 4.33, biweekly: 2, monthly: 1, seasonal: 1/3, annual: 1/12 };
  return c * (m[freq] || 1);
};

const DEFAULTS = {
  // ΕΝΦΙΑ
  enfiaAnnual: '', enfiaMonthly: '',
  // Δημοτικά — shared with Providers, read from providers section
  dimotikaHistory: Array(12).fill('') as string[],
  lastBillTotal: '', lastBillDimotika: '',
  // Cleaning
  hasCleaning: false, cleaningContact: '', cleaningPhone: '',
  cleaningFreq: 'monthly', cleaningCostPerVisit: '', cleaningHours: '', cleaningNotes: '',
  // Garden
  hasGarden: false, gardenContact: '', gardenPhone: '',
  gardenFreq: 'monthly', gardenCost: '', gardenSqm: '', gardenNotes: '',
  // Pool
  hasPool: false, poolContact: '', poolPhone: '',
  poolWeeklyCost: '', poolChemicals: '', poolSeasonOpen: '', poolSeasonClose: '', poolNotes: '',
  // AC
  hasAC: false, acContact: '', acPhone: '',
  acUnits: '1', acServiceCost: '', acLastService: '', acNotes: '',
  // Elevator
  hasElevator: false, elevatorCompany: '', elevatorPhone: '',
  elevatorMonthly: '', elevatorLastInspection: '', elevatorNotes: '',
  // Pest
  hasPest: false, pestContact: '', pestPhone: '',
  pestCost: '', pestFreq: 'annual', pestLastDate: '',
  // Other
  otherServices: [] as {name:string;contact:string;phone:string;cost:string;freq:string}[],
};

interface Props { propertyId: string; userId?: string; }

export default function BillsServices({ propertyId, userId = '' }: Props) {
  const [s, upd, loading] = useBillsSettings(propertyId, userId, 'services', DEFAULTS);
  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', marginBottom: '16px' };
  const g2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' };
  const g3: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' };
  const g4: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '12px' };

  // Other services form (local only — saves on add)
  const [newName, setNewName] = useState('');
  const [newContact, setNewContact] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCost, setNewCost] = useState('');
  const [newFreq, setNewFreq] = useState('monthly');

  const enfiaM = parseFloat(s.enfiaMonthly) || (parseFloat(s.enfiaAnnual) / 12) || 0;
  const dimotikaAvg = s.dimotikaHistory.filter(v => v).length > 0
    ? s.dimotikaHistory.reduce((sum, v) => sum + (parseFloat(v) || 0), 0) / s.dimotikaHistory.filter(v => v).length : 0;
  const dimotikaPct = s.lastBillTotal && s.lastBillDimotika && parseFloat(s.lastBillTotal) > 0
    ? (parseFloat(s.lastBillDimotika) / parseFloat(s.lastBillTotal)) * 100 : 0;
  const cleaningM = s.hasCleaning ? toMonthly(s.cleaningCostPerVisit, s.cleaningFreq) : 0;
  const gardenM = s.hasGarden ? toMonthly(s.gardenCost, s.gardenFreq) : 0;
  const poolM = s.hasPool ? ((parseFloat(s.poolWeeklyCost) || 0) * 4.33 + (parseFloat(s.poolChemicals) || 0)) : 0;
  const acM = s.hasAC ? toMonthly(s.acServiceCost, 'annual') : 0;
  const elevM = s.hasElevator ? (parseFloat(s.elevatorMonthly) || 0) : 0;
  const pestM = s.hasPest ? toMonthly(s.pestCost, s.pestFreq) : 0;
  const otherM = s.otherServices.reduce((sum, o) => sum + toMonthly(o.cost, o.freq), 0);
  const totalServices = enfiaM + dimotikaAvg + cleaningM + gardenM + poolM + acM + elevM + pestM + otherM;
  const currentMonth = new Date().getMonth();
  const maxH = Math.max(...s.dimotikaHistory.map(v => parseFloat(v) || 0), 1);

  const addOther = () => {
    if (!newName || !newCost) return;
    const list = [...s.otherServices, { name: newName, contact: newContact, phone: newPhone, cost: newCost, freq: newFreq }];
    upd({ otherServices: list });
    setNewName(''); setNewContact(''); setNewPhone(''); setNewCost('');
  };
  const delOther = (i: number) => upd({ otherServices: s.otherServices.filter((_, j) => j !== i) });

  const updHistory = (i: number, v: string) => {
    const n = [...s.dimotikaHistory];
    n[i] = v;
    upd({ dimotikaHistory: n });
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Φόρτωση...</div>;

  return (
    <div style={{ fontFamily: 'Inter,sans-serif' }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '16px' }}>
        {[
          { label: 'Υπηρεσίες/μήνα', value: fe(totalServices), color: 'var(--warning)' },
          { label: 'Υπηρεσίες/έτος', value: fe(totalServices * 12), color: 'var(--negative)' },
          { label: 'ΕΝΦΙΑ/μήνα', value: enfiaM > 0 ? fe(enfiaM) : '—', color: 'var(--info)' },
          { label: 'Δημοτικά/μήνα (μ.ο.)', value: dimotikaAvg > 0 ? fe(dimotikaAvg) : '—', color: 'var(--accent)' },
        ].map((k, i) => (
          <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '14px 16px' }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: k.color, fontFamily: "'JetBrains Mono',monospace", marginBottom: '4px' }}>{k.value}</div>
            <div style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ΕΝΦΙΑ & Δημοτικά */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '16px' }}>🏛</span>
          <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>ΕΝΦΙΑ & Δημοτικά Τέλη</span>
        </div>

        <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>ΕΝΦΙΑ</div>
        <div style={g3}>
          <NumberInput label="ΕΝΦΙΑ/έτος (€)" value={s.enfiaAnnual} onChange={v => upd({ enfiaAnnual: v, enfiaMonthly: v ? String((parseFloat(v)/12).toFixed(2)) : '' })} suffix="€" step={50} />
          <NumberInput label="ΕΝΦΙΑ/μήνα (αν γνωρίζεις)" value={s.enfiaMonthly} onChange={v => upd({ enfiaMonthly: v })} suffix="€" step={5} />
          <div style={{ background: 'var(--bg-elevated)', borderRadius: '10px', padding: '12px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--info)', fontFamily: "'JetBrains Mono',monospace" }}>{enfiaM > 0 ? fe(enfiaM) : '—'}</div>
            <div style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Μηνιαία αναγωγή</div>
          </div>
        </div>
        <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid var(--info)', borderRadius: '8px', padding: '10px 14px', fontSize: '11px', color: 'var(--info)', marginBottom: '16px' }}>
          💡 Αν έχεις ασφάλεια κατοικίας με κάλυψη φυσικών καταστροφών → δικαιούσαι μείωση ΕΝΦΙΑ 10-20% (Α.1005/2026).
        </div>

        {/* Δημοτικά Τέλη */}
        <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>
          Δημοτικά Τέλη — Ιστορικό από Λογαριασμό Ρεύματος
        </div>
        <div style={{ background: 'var(--bg-elevated)', borderRadius: '10px', padding: '14px', marginBottom: '14px', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px' }}>Υπολογισμός ποσοστού από τελευταίο λογαριασμό</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '10px', alignItems: 'flex-end' }}>
            <NumberInput label="Σύνολο λογαριασμού (€)" value={s.lastBillTotal} onChange={v => upd({ lastBillTotal: v })} suffix="€" step={1} />
            <NumberInput label="Δημοτικά στον λογ/σμό (€)" value={s.lastBillDimotika} onChange={v => upd({ lastBillDimotika: v })} suffix="€" step={0.5} />
            <div style={{ background: 'var(--bg-base)', border: `1px solid ${dimotikaPct > 0 ? 'var(--accent)' : 'var(--border-subtle)'}`, borderRadius: '10px', padding: '12px 14px', textAlign: 'center', marginBottom: '12px', minWidth: '80px' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent)', fontFamily: "'JetBrains Mono',monospace" }}>{dimotikaPct > 0 ? `${dimotikaPct.toFixed(1)}%` : '—'}</div>
              <div style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Ποσοστό</div>
            </div>
          </div>
        </div>
        <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>
          Ιστορικό Δημοτικών/μήνα — Μ.Ο.: {dimotikaAvg > 0 ? fe(dimotikaAvg) : '—'}
        </div>
        {/* Mini bar chart */}
        <div style={{ display: 'flex', gap: '5px', alignItems: 'flex-end', height: '50px', marginBottom: '8px' }}>
          {MONTHS_GR.map((m, i) => {
            const val = parseFloat(s.dimotikaHistory[i]) || 0;
            const pct = val / maxH;
            const isCur = i === currentMonth;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                {val > 0 && <div style={{ fontSize: '6px', color: 'var(--text-tertiary)', fontFamily: "'JetBrains Mono',monospace" }}>{Math.round(val)}</div>}
                <div style={{ width: '100%', height: `${Math.max(pct * 40, val > 0 ? 3 : 1)}px`, background: isCur ? 'var(--accent)' : 'var(--info)', borderRadius: '3px 3px 0 0', opacity: isCur ? 1 : 0.7 }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '6px' }}>
          {MONTHS_GR.map((m, i) => (
            <div key={i}>
              <label style={{ fontSize: '8px', color: 'var(--text-secondary)', display: 'block', marginBottom: '3px', textAlign: 'center' }}>{m}</label>
              <input type="number" value={s.dimotikaHistory[i]} onChange={e => updHistory(i, e.target.value)} placeholder="€"
                style={{ width: '100%', background: 'var(--bg-base)', border: `1px solid ${i === currentMonth ? 'var(--accent)' : 'var(--border-subtle)'}`, borderRadius: '6px', padding: '5px 3px', color: 'var(--text-primary)', fontSize: '11px', fontFamily: "'JetBrains Mono',monospace", outline: 'none', textAlign: 'center', boxSizing: 'border-box' }} />
            </div>
          ))}
        </div>
      </div>

      {/* Cleaning */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: s.hasCleaning ? '16px' : '0', paddingBottom: s.hasCleaning ? '10px' : '0', borderBottom: s.hasCleaning ? '1px solid var(--border-subtle)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ fontSize: '16px' }}>🧹</span><span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Συνεργείο Καθαρισμού</span></div>
          <Toggle on={s.hasCleaning} onChange={v => upd({ hasCleaning: v })} label="Ενεργό" labelOff="Δεν έχω" />
        </div>
        {s.hasCleaning && (
          <>
            <div style={g4}>
              <TextInput label="Εταιρεία / Όνομα" value={s.cleaningContact} onChange={v => upd({ cleaningContact: v })} placeholder="π.χ. Καθαρίστρια Μαρία" />
              <TextInput label="Τηλέφωνο" value={s.cleaningPhone} onChange={v => upd({ cleaningPhone: v })} placeholder="69xxxxxxxx" />
              <CustomSelect label="Συχνότητα" value={s.cleaningFreq} onChange={v => upd({ cleaningFreq: v })} options={FREQ} />
              <NumberInput label="Κόστος ανά Επίσκεψη (€)" value={s.cleaningCostPerVisit} onChange={v => upd({ cleaningCostPerVisit: v })} suffix="€" step={5} />
            </div>
            <div style={g2}>
              <NumberInput label="Ώρες ανά Επίσκεψη" value={s.cleaningHours} onChange={v => upd({ cleaningHours: v })} suffix="ω" step={0.5} />
              <TextInput label="Σημειώσεις" value={s.cleaningNotes} onChange={v => upd({ cleaningNotes: v })} placeholder="π.χ. κάθε Τετάρτη" />
            </div>
            {cleaningM > 0 && <div style={{ background: 'var(--bg-elevated)', borderRadius: '8px', padding: '10px 14px', fontSize: '11px', color: 'var(--text-secondary)' }}>Μηνιαίο: <strong style={{ color: 'var(--accent)', fontFamily: "'JetBrains Mono',monospace" }}>{fe(cleaningM)}</strong>{s.cleaningHours && s.cleaningCostPerVisit && <span style={{ marginLeft: '12px' }}>Ωριαίο: <strong style={{ color: 'var(--info)', fontFamily: "'JetBrains Mono',monospace" }}>{fe(parseFloat(s.cleaningCostPerVisit) / parseFloat(s.cleaningHours))}/ω</strong></span>}</div>}
          </>
        )}
      </div>

      {/* Garden */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: s.hasGarden ? '16px' : '0', paddingBottom: s.hasGarden ? '10px' : '0', borderBottom: s.hasGarden ? '1px solid var(--border-subtle)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ fontSize: '16px' }}>🌿</span><span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Κηπουρός</span></div>
          <Toggle on={s.hasGarden} onChange={v => upd({ hasGarden: v })} label="Ενεργό" labelOff="Δεν έχω" />
        </div>
        {s.hasGarden && (
          <div style={g4}>
            <TextInput label="Κηπουρός / Εταιρεία" value={s.gardenContact} onChange={v => upd({ gardenContact: v })} placeholder="π.χ. Κηπουρός Νίκος" />
            <TextInput label="Τηλέφωνο" value={s.gardenPhone} onChange={v => upd({ gardenPhone: v })} placeholder="69xxxxxxxx" />
            <CustomSelect label="Συχνότητα" value={s.gardenFreq} onChange={v => upd({ gardenFreq: v })} options={FREQ} />
            <NumberInput label="Κόστος ανά Επίσκεψη (€)" value={s.gardenCost} onChange={v => upd({ gardenCost: v })} suffix="€" step={10} />
          </div>
        )}
      </div>

      {/* Pool */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: s.hasPool ? '16px' : '0', paddingBottom: s.hasPool ? '10px' : '0', borderBottom: s.hasPool ? '1px solid var(--border-subtle)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ fontSize: '16px' }}>🏊</span><span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Πισίνα</span></div>
          <Toggle on={s.hasPool} onChange={v => upd({ hasPool: v })} label="Ενεργό" labelOff="Δεν έχω" />
        </div>
        {s.hasPool && (
          <>
            <div style={g4}>
              <TextInput label="Εταιρεία Συντήρησης" value={s.poolContact} onChange={v => upd({ poolContact: v })} placeholder="π.χ. Pool Service" />
              <TextInput label="Τηλέφωνο" value={s.poolPhone} onChange={v => upd({ poolPhone: v })} placeholder="69xxxxxxxx" />
              <NumberInput label="Εβδομαδιαίο Κόστος (€)" value={s.poolWeeklyCost} onChange={v => upd({ poolWeeklyCost: v })} suffix="€" step={5} />
              <NumberInput label="Χημικά/μήνα (€)" value={s.poolChemicals} onChange={v => upd({ poolChemicals: v })} suffix="€" step={5} />
            </div>
            <div style={g2}>
              <DatePicker label="Άνοιγμα Σεζόν" value={s.poolSeasonOpen} onChange={v => upd({ poolSeasonOpen: v })} />
              <DatePicker label="Κλείσιμο Σεζόν" value={s.poolSeasonClose} onChange={v => upd({ poolSeasonClose: v })} />
            </div>
          </>
        )}
      </div>

      {/* AC Service */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: s.hasAC ? '16px' : '0', paddingBottom: s.hasAC ? '10px' : '0', borderBottom: s.hasAC ? '1px solid var(--border-subtle)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ fontSize: '16px' }}>❄️</span><span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Συντήρηση Κλιματιστικών</span></div>
          <Toggle on={s.hasAC} onChange={v => upd({ hasAC: v })} label="Ενεργό" labelOff="Δεν έχω" />
        </div>
        {s.hasAC && (
          <>
            <div style={g4}>
              <TextInput label="Τεχνικός / Εταιρεία" value={s.acContact} onChange={v => upd({ acContact: v })} placeholder="π.χ. Τεχνικός Παναγιώτης" />
              <TextInput label="Τηλέφωνο" value={s.acPhone} onChange={v => upd({ acPhone: v })} placeholder="69xxxxxxxx" />
              <NumberInput label="Αριθμός Κλιματιστικών" value={s.acUnits} onChange={v => upd({ acUnits: v })} suffix="τεμ" step={1} />
              <NumberInput label="Κόστος Σέρβις/τεμ. (€)" value={s.acServiceCost} onChange={v => upd({ acServiceCost: v })} suffix="€" step={10} />
            </div>
            <div style={g2}>
              <DatePicker label="Τελευταίο Σέρβις" value={s.acLastService} onChange={v => upd({ acLastService: v })} />
              <TextInput label="Σημειώσεις" value={s.acNotes} onChange={v => upd({ acNotes: v })} placeholder="π.χ. Κάθε Απρίλιο" />
            </div>
            {s.acServiceCost && s.acUnits && <div style={{ background: 'var(--bg-elevated)', borderRadius: '8px', padding: '10px 14px', fontSize: '11px', color: 'var(--text-secondary)' }}>Ετήσιο: <strong style={{ color: 'var(--accent)', fontFamily: "'JetBrains Mono',monospace" }}>{fe(parseFloat(s.acServiceCost) * parseInt(s.acUnits))}</strong> | Μηνιαία αναγωγή: <strong style={{ color: 'var(--info)', fontFamily: "'JetBrains Mono',monospace" }}>{fe(parseFloat(s.acServiceCost) * parseInt(s.acUnits) / 12)}</strong></div>}
          </>
        )}
      </div>

      {/* Elevator */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: s.hasElevator ? '16px' : '0', paddingBottom: s.hasElevator ? '10px' : '0', borderBottom: s.hasElevator ? '1px solid var(--border-subtle)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ fontSize: '16px' }}>🛗</span><span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ανελκυστήρας</span></div>
          <Toggle on={s.hasElevator} onChange={v => upd({ hasElevator: v })} label="Ενεργό" labelOff="Δεν έχω" />
        </div>
        {s.hasElevator && (
          <>
            <div style={g4}>
              <TextInput label="Εταιρεία Συντήρησης" value={s.elevatorCompany} onChange={v => upd({ elevatorCompany: v })} placeholder="π.χ. Otis, Schindler, KONE..." />
              <TextInput label="Τηλέφωνο" value={s.elevatorPhone} onChange={v => upd({ elevatorPhone: v })} placeholder="210xxxxxxx" />
              <NumberInput label="Μηνιαία Συντήρηση (€)" value={s.elevatorMonthly} onChange={v => upd({ elevatorMonthly: v })} suffix="€" step={5} />
              <DatePicker label="Τελευταία Επιθεώρηση" value={s.elevatorLastInspection} onChange={v => upd({ elevatorLastInspection: v })} />
            </div>
            <TextInput label="Σημειώσεις" value={s.elevatorNotes} onChange={v => upd({ elevatorNotes: v })} placeholder="π.χ. Ετήσιος έλεγχος ΕΛΟΤ..." />
          </>
        )}
      </div>

      {/* Pest */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: s.hasPest ? '16px' : '0', paddingBottom: s.hasPest ? '10px' : '0', borderBottom: s.hasPest ? '1px solid var(--border-subtle)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ fontSize: '16px' }}>🐛</span><span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Απεντόμωση</span></div>
          <Toggle on={s.hasPest} onChange={v => upd({ hasPest: v })} label="Ενεργό" labelOff="Δεν έχω" />
        </div>
        {s.hasPest && (
          <div style={g4}>
            <TextInput label="Εταιρεία" value={s.pestContact} onChange={v => upd({ pestContact: v })} placeholder="π.χ. Anticimex, Rentokil..." />
            <TextInput label="Τηλέφωνο" value={s.pestPhone} onChange={v => upd({ pestPhone: v })} placeholder="69xxxxxxxx" />
            <NumberInput label="Κόστος ανά Επέμβαση (€)" value={s.pestCost} onChange={v => upd({ pestCost: v })} suffix="€" step={10} />
            <CustomSelect label="Συχνότητα" value={s.pestFreq} onChange={v => upd({ pestFreq: v })} options={FREQ} />
          </div>
        )}
      </div>

      {/* Other */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '16px' }}>➕</span>
          <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Άλλες Υπηρεσίες</span>
        </div>
        <div style={{ background: 'var(--bg-elevated)', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <TextInput label="Υπηρεσία" value={newName} onChange={setNewName} placeholder="π.χ. Βαφή, Υδραυλικός..." />
            <TextInput label="Επαφή / Εταιρεία" value={newContact} onChange={setNewContact} placeholder="Όνομα ή Εταιρεία" />
            <TextInput label="Τηλέφωνο" value={newPhone} onChange={setNewPhone} placeholder="69xxxxxxxx" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '10px', alignItems: 'flex-end' }}>
            <NumberInput label="Κόστος (€)" value={newCost} onChange={setNewCost} suffix="€" step={10} />
            <CustomSelect label="Συχνότητα" value={newFreq} onChange={setNewFreq} options={FREQ} />
            <button onClick={addOther} style={{ background: 'var(--accent)', color: 'var(--bg-base)', border: 'none', borderRadius: '8px', padding: '9px 20px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif', whiteSpace: 'nowrap', marginBottom: '12px' }}>+ Προσθήκη</button>
          </div>
        </div>
        {s.otherServices.map((o, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>{o.name}</span>
              {o.contact && <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginLeft: '8px' }}>{o.contact}</span>}
              {o.phone && <span style={{ fontSize: '10px', color: 'var(--info)', marginLeft: '8px' }}>📞 {o.phone}</span>}
              <span style={{ fontSize: '9px', color: 'var(--text-tertiary)', marginLeft: '8px' }}>{FREQ.find(f => f.value === o.freq)?.label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)', fontFamily: "'JetBrains Mono',monospace" }}>{fe(toMonthly(o.cost, o.freq))}/μήνα</span>
              <button onClick={() => delOther(i)} style={{ width: '22px', height: '22px', borderRadius: '5px', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '11px' }}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      {totalServices > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '16px' }}>📊</span>
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Σύνοψη Υπηρεσιών</span>
          </div>
          {[
            { label: 'ΕΝΦΙΑ', amount: enfiaM },
            { label: 'Δημοτικά (μ.ο.)', amount: dimotikaAvg },
            { label: 'Καθαρισμός', amount: cleaningM },
            { label: 'Κηπουρός', amount: gardenM },
            { label: 'Πισίνα', amount: poolM },
            { label: 'Κλιματιστικά', amount: acM },
            { label: 'Ανελκυστήρας', amount: elevM },
            { label: 'Pest Control', amount: pestM },
            { label: 'Άλλες', amount: otherM },
          ].filter(r => r.amount > 0).map((r, i) => (
            <div key={i} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{r.label}</span>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)', fontFamily: "'JetBrains Mono',monospace" }}>{fe(r.amount)}/μήνα</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginLeft: '8px', fontFamily: "'JetBrains Mono',monospace" }}>{fe(r.amount * 12)}/έτος</span>
                </div>
              </div>
              <div style={{ height: '4px', background: 'var(--bg-overlay)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${totalServices > 0 ? r.amount / totalServices * 100 : 0}%`, background: 'var(--accent)', borderRadius: '2px' }} />
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid var(--border-subtle)', marginTop: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700 }}>Σύνολο Υπηρεσιών</span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--warning)', fontFamily: "'JetBrains Mono',monospace" }}>{fe(totalServices)}/μήνα</div>
              <div style={{ fontSize: '12px', color: 'var(--negative)', fontFamily: "'JetBrains Mono',monospace" }}>{fe(totalServices * 12)}/έτος</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}