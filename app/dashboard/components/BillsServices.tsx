'use client';

import { useState, useMemo, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NumberInput, CustomSelect, TextInput, Toggle, DatePicker } from './UIComponents';
import { useBillsSettings } from './BillsSettings';
import { T, fe, Spinner } from '@/components/Theme';

const MONTHS_GR = ['Ιαν','Φεβ','Μαρ','Απρ','Μαΐ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];

// FIX: history input style with hover
const histInputStyle = (isCurrent: boolean, isHovered = false): React.CSSProperties => ({
  width: '100%',
  background: isCurrent ? 'rgba(26,115,232,0.09)' : isHovered ? 'var(--bg-elevated)' : 'var(--bg-base)',
  border: `1px solid ${isCurrent ? 'var(--accent)' : isHovered ? 'var(--border-default)' : 'var(--border-subtle)'}`,
  borderRadius: T.radius.badge,
  padding: '6px 4px',
  color: 'var(--text-primary)',
  fontSize: 11,
  fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums',
  outline: 'none',
  textAlign: 'center',
  boxSizing: 'border-box',
  transition: 'all 0.15s',
});

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

const ENFIA_DEADLINES = [
  { date: '2026-05-31', label: '1η Δόση', month: 'Μαΐ 2026'  },
  { date: '2026-06-30', label: '2η Δόση', month: 'Ιουν 2026' },
  { date: '2026-07-31', label: '3η Δόση', month: 'Ιουλ 2026' },
  { date: '2026-08-31', label: '4η Δόση', month: 'Αυγ 2026'  },
  { date: '2026-09-30', label: '5η Δόση', month: 'Σεπ 2026'  },
  { date: '2026-10-30', label: '6η Δόση', month: 'Οκτ 2026'  },
];
const ZONE_TAX: Record<string, number> = {
  'under_500':2.00,'500_750':2.80,'750_1000':3.70,'1000_1250':4.50,
  '1250_1500':6.00,'1500_2000':7.60,'2000_2500':9.20,'2500_3000':11.10,
  '3000_3500':13.00,'3500_4000':14.50,'over_4000':16.00,
};
const ZONE_OPTIONS = [
  { value: 'under_500',  label: 'Κάτω από 500 € ανά τετραγωνικό'   },
  { value: '500_750',    label: '500 – 750 € ανά τετραγωνικό'       },
  { value: '750_1000',   label: '750 – 1.000 € ανά τετραγωνικό'    },
  { value: '1000_1250',  label: '1.000 – 1.250 € ανά τετραγωνικό'  },
  { value: '1250_1500',  label: '1.250 – 1.500 € ανά τετραγωνικό'  },
  { value: '1500_2000',  label: '1.500 – 2.000 € ανά τετραγωνικό'  },
  { value: '2000_2500',  label: '2.000 – 2.500 € ανά τετραγωνικό'  },
  { value: '2500_3000',  label: '2.500 – 3.000 € ανά τετραγωνικό'  },
  { value: '3000_3500',  label: '3.000 – 3.500 € ανά τετραγωνικό'  },
  { value: '3500_4000',  label: '3.500 – 4.000 € ανά τετραγωνικό'  },
  { value: 'over_4000',  label: 'Άνω των 4.000 € ανά τετραγωνικό'  },
];
const FLOOR_COEF: Record<string, number> = { basement: 0.90, ground: 1.00, first: 1.01, second: 1.02, third: 1.03, fourth: 1.04, fifth_plus: 1.05 };
const FLOOR_OPTIONS = [
  { value: 'basement',   label: 'Υπόγειο'     },{ value: 'ground', label: 'Ισόγειο' },
  { value: 'first',      label: '1ος Όροφος'  },{ value: 'second', label: '2ος Όροφος' },
  { value: 'third',      label: '3ος Όροφος'  },{ value: 'fourth', label: '4ος Όροφος' },
  { value: 'fifth_plus', label: '5ος+ Όροφος' },
];
const AGE_COEF: Record<string, number> = { 'under_5': 1.05,'5_10': 1.00,'10_20': 0.95,'20_25': 0.90,'25_30': 0.85,'over_30': 0.75 };
const AGE_OPTIONS = [
  { value: 'under_5', label: 'Κάτω από 5 χρόνια' },{ value: '5_10',  label: '5 – 10 χρόνια'  },
  { value: '10_20',   label: '10 – 20 χρόνια'    },{ value: '20_25', label: '20 – 25 χρόνια' },
  { value: '25_30',   label: '25 – 30 χρόνια'    },{ value: 'over_30', label: 'Άνω των 30 χρόνων' },
];
const REDUCTIONS = [
  { key: 'main_residence', label: 'Κύρια κατοικία',         pct: 50, note: 'Μόνο αν χαρακτηρισμένη κύρια' },
  { key: 'three_children', label: 'Τρίτεκνοι',              pct: 25, note: 'Α.Φ.Μ. τριτέκνου γονέα'        },
  { key: 'four_children',  label: 'Πολύτεκνοι',             pct: 50, note: 'Α.Φ.Μ. πολυτέκνου γονέα'       },
  { key: 'disability',     label: 'Αναπηρία 80%+',          pct: 50, note: 'Βεβαίωση ΚΕΠΑ'                 },
  { key: 'insurance',      label: 'Ασφάλεια φυσικών κινδύνων', pct: 15, note: 'Α.1005/2026, 10-20% έκπτωση'  },
];
const SUPPL_BRACKETS = [
  { limit: 100_000, rate: 0 },{ limit: 200_000, rate: 0.001 },{ limit: 300_000, rate: 0.002 },
  { limit: 400_000, rate: 0.005 },{ limit: 500_000, rate: 0.010 },{ limit: 600_000, rate: 0.015 },
  { limit: 700_000, rate: 0.020 },{ limit: 800_000, rate: 0.025 },{ limit: 900_000, rate: 0.030 },
  { limit: 1_000_000, rate: 0.033 },{ limit: Infinity, rate: 0.035 },
];

function calcENFIA(sqm: number, zone: string, floor: string, age: string, ownership: number, totalVal: number, reductions: string[]) {
  if (!sqm || !zone) return null;
  const basic = sqm * (ZONE_TAX[zone] || 0) * (FLOOR_COEF[floor] || 1) * (AGE_COEF[age] || 1) * (ownership / 100);
  let suppl = 0;
  if (totalVal > 100_000) {
    const bracket = SUPPL_BRACKETS.find(b => totalVal <= b.limit);
    if (bracket) suppl = totalVal * bracket.rate;
  }
  const subtotal = basic + suppl;
  const maxPct = Math.max(0, ...reductions.map(r => REDUCTIONS.find(rd => rd.key === r)?.pct || 0));
  const redAmt = subtotal * (maxPct / 100);
  const final = Math.max(0, subtotal - redAmt);
  return { basic, suppl, subtotal, redAmt, maxPct, final, installment: Math.ceil(final / 6) };
}

const DEFAULTS = {
  enfiaAnnual: '', enfiaMonthly: '', enfiaSqm: '', enfiaZone: '', enfiaFloor: 'second',
  enfiaAge: '10_20', enfiaOwnership: '100', enfiaTotalVal: '', enfiaReductions: [] as string[],
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
  const supabase = createClient();
  const [s, upd, loading] = useBillsSettings(propertyId, userId, 'services', DEFAULTS);

  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 };
  const g2: React.CSSProperties  = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 14 };
  const g3: React.CSSProperties  = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 14, marginBottom: 14 };
  const g4: React.CSSProperties  = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 14, marginBottom: 14 };

  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const [newName, setNewName]       = useState('');
  const [newContact, setNewContact] = useState('');
  const [newPhone, setNewPhone]     = useState('');
  const [newCost, setNewCost]       = useState('');
  const [newFreq, setNewFreq]       = useState('monthly');

  // ── Cross-tab: live data from other tabs ─────────────────────────────────
  const [crossTabData, setCrossTabData] = useState<{
    enfiaChecklist?: { status: string; daysLeft: number | null };
    insuranceEq?: boolean; insuranceFlood?: boolean;
    electricityDimotika?: string;
    lastExpense?: { amount: number; description: string; date: string };
  }>({});

  useEffect(() => {
    if (!propertyId) return;
    (async () => {
      try {
        // ΕΝΦΙΑ from Checklist
        const { data: chk } = await supabase.from('checklist_items')
          .select('status,due_date').eq('property_id', propertyId)
          .ilike('description', '%ΕΝΦΙΑ%').order('due_date').limit(1);
        // Insurance data (earthquake discount)
        const { data: ins } = await supabase.from('bills_settings')
          .select('data').eq('property_id', propertyId).eq('section', 'insurance').maybeSingle();
        // Electricity dimotika %
        const { data: elec } = await supabase.from('bills_settings')
          .select('data').eq('property_id', propertyId).eq('section', 'electricity').maybeSingle();
        // Last expense
        const { data: exp } = await supabase.from('expenses')
          .select('amount,description,date').eq('property_id', propertyId)
          .order('date', { ascending: false }).limit(1);

        setCrossTabData({
          enfiaChecklist: chk?.[0] ? {
            status: chk[0].status,
            daysLeft: chk[0].due_date ? Math.ceil((new Date(chk[0].due_date).getTime() - Date.now()) / 86400000) : null,
          } : undefined,
          insuranceEq:    (ins?.data as any)?.insCustomEarthquake || false,
          insuranceFlood: (ins?.data as any)?.insCustomFlood || false,
          electricityDimotika: (elec?.data as any)?.dimotika || '',
          lastExpense: exp?.[0] ? { amount: exp[0].amount, description: exp[0].description, date: exp[0].date } : undefined,
        });
      } catch (_) {}
    })();
  }, [propertyId]);

  const enfiaResult = useMemo(() => calcENFIA(
    parseFloat(s.enfiaSqm) || 0, s.enfiaZone, s.enfiaFloor, s.enfiaAge,
    parseFloat(s.enfiaOwnership) || 100, parseFloat(s.enfiaTotalVal) || 0, s.enfiaReductions || []
  ), [s.enfiaSqm, s.enfiaZone, s.enfiaFloor, s.enfiaAge, s.enfiaOwnership, s.enfiaTotalVal, s.enfiaReductions]);

  const enfiaM      = enfiaResult ? enfiaResult.final / 12 : (parseFloat(s.enfiaMonthly) || (parseFloat(s.enfiaAnnual) / 12) || 0);
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
  const otherM    = (s.otherServices || []).reduce((sum: number, o: any) => sum + toMonthly(o.cost, o.freq), 0);
  const totalServices = enfiaM + dimotikaAvg + cleaningM + gardenM + poolM + acM + elevM + pestM + otherM;

  const today        = new Date();
  const currentMonth = today.getMonth();
  const maxH         = Math.max(...(s.dimotikaHistory || []).map((v: string) => parseFloat(v) || 0), 1);
  const nextDeadline = ENFIA_DEADLINES.find(d => new Date(d.date) >= today);
  const daysToDeadline = nextDeadline ? Math.ceil((new Date(nextDeadline.date).getTime() - today.getTime()) / 86400000) : null;

  const toggleReduction = (key: string) => {
    const cur = s.enfiaReductions || [];
    upd({ enfiaReductions: cur.includes(key) ? cur.filter((r: string) => r !== key) : [...cur, key] });
  };
  const addOther = () => {
    if (!newName || !newCost) return;
    upd({ otherServices: [...(s.otherServices || []), { name: newName, contact: newContact, phone: newPhone, cost: newCost, freq: newFreq }] });
    setNewName(''); setNewContact(''); setNewPhone(''); setNewCost('');
  };
  const delOther   = (i: number) => upd({ otherServices: (s.otherServices || []).filter((_: any, j: number) => j !== i) });
  const updHistory = (i: number, v: string) => { const n = [...(s.dimotikaHistory || [])]; n[i] = v; upd({ dimotikaHistory: n }); };

  if (loading) return <Spinner label="Φόρτωση…" />;

  // ── Section header ────────────────────────────────────────────────────────
  const secHdr = (label: string, sub?: string, link?: { url: string; text: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}/>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 1 }}>{sub}</div>}
      </div>
      {link?.url && (
        <a href={link.url} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 10, color: 'var(--info)', textDecoration: 'none', fontWeight: 600, fontFamily: T.font.sans, background: 'rgba(26,115,232,0.06)', border: '1px solid rgba(26,115,232,0.18)', borderRadius: T.radius.pill, padding: '3px 10px', whiteSpace: 'nowrap' as const }}>
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
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', marginLeft: 8 }}>{fe(cost)} / μήνα</span>
          )}
        </div>
      </div>
      <Toggle on={active} onChange={onToggle} label="Ενεργό" labelOff="Δεν έχω"/>
    </div>
  );

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>

      {/* ── Cross-tab: Insurance earthquake ΕΝΦΙΑ discount ───────────────── */}
      {(crossTabData.insuranceEq || crossTabData.insuranceFlood) && !(s.enfiaReductions || []).includes('insurance') && (
        <div style={{ background: 'rgba(52,168,83,0.07)', border: '1px solid rgba(52,168,83,0.25)', borderRadius: T.radius.inner, padding: '11px 18px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--positive)', flexShrink: 0 }}/>
          <div style={{ flex: 1, fontSize: 12, fontFamily: T.font.sans }}>
            <span style={{ fontWeight: 700, color: 'var(--positive)' }}>Έκπτωση ΕΝΦΙΑ 10-20% διαθέσιμη! </span>
            <span style={{ color: 'var(--text-secondary)' }}>Η ασφάλειά σου καλύπτει φυσικές καταστροφές. Πρόσθεσέ την στις μειώσεις ΕΝΦΙΑ.</span>
          </div>
          <button onClick={() => { const cur = s.enfiaReductions || []; upd({ enfiaReductions: [...cur, 'insurance'] }); }}
            style={{ background: 'var(--positive)', color: '#fff', border: 'none', borderRadius: T.radius.btn, padding: '6px 16px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans, whiteSpace: 'nowrap' as const }}>
            Εφαρμογή →
          </button>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '2px 10px', borderRadius: T.radius.pill, whiteSpace: 'nowrap' as const, fontFamily: T.font.sans }}>Ασφάλεια</span>
        </div>
      )}

      {/* ── Cross-tab: Dimotika from Electricity tab ─────────────────────── */}
      {crossTabData.electricityDimotika && parseFloat(crossTabData.electricityDimotika) > 0 && (
        <div style={{ background: 'rgba(26,115,232,0.05)', border: '1px solid rgba(26,115,232,0.15)', borderRadius: T.radius.inner, padding: '11px 18px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--info)', flexShrink: 0 }}/>
          <div style={{ flex: 1, fontSize: 12, fontFamily: T.font.sans, color: 'var(--text-secondary)' }}>
            <span style={{ fontWeight: 600, color: 'var(--info)' }}>Δημοτικά τέλη {crossTabData.electricityDimotika}% </span>
           , από tab Ρεύμα · χρησιμοποιείται στον υπολογισμό λογαριασμού
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '2px 10px', borderRadius: T.radius.pill, whiteSpace: 'nowrap' as const, fontFamily: T.font.sans }}>Ρεύμα</span>
        </div>
      )}

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Υπηρεσίες / μήνα',     value: fe(totalServices)                        },
          { label: 'Υπηρεσίες / έτος',     value: fe(totalServices * 12)                   },
          { label: 'ΕΝΦΙΑ / μήνα',          value: enfiaM > 0 ? fe(enfiaM) : '—'           },
          { label: 'Δημοτικά Τέλη (μέσος όρος) / μήνα', value: dimotikaAvg > 0 ? fe(dimotikaAvg) : '—' },
        ].map((k, i) => (
          <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* ── ΕΝΦΙΑ 2026 ───────────────────────────────────────────────────── */}
      <div style={{ ...card, borderTop: '2px solid var(--accent)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}/>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans }}>ΕΝΦΙΑ 2026, Υπολογιστής</div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 1 }}>Εκτίμηση βάσει Ε9, επαλήθευσε στο myAADE.gr</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--warning)', background: 'rgba(242,153,0,0.08)', padding: '2px 8px', borderRadius: T.radius.pill, fontFamily: T.font.sans, border: '1px solid rgba(242,153,0,0.2)', textTransform: 'uppercase' as const }}>Εκτίμηση</span>
            {/* FIX: direct taxheaven ΕΝΦΙΑ link */}
            <a href="https://www.taxheaven.gr/news/73091/anarthohkan-ta-ekkaoaristika-toy-enfia-2026" target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--info)', fontFamily: T.font.sans, fontWeight: 600, textDecoration: 'none', padding: '2px 10px', background: 'rgba(26,115,232,0.06)', borderRadius: T.radius.pill, border: '1px solid rgba(26,115,232,0.18)' }}>
              taxheaven ΕΝΦΙΑ →
            </a>
            <a href="https://www1.aade.gr/aadeapps3/myaade/" target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans, fontWeight: 600, textDecoration: 'none', padding: '2px 10px', background: 'var(--bg-elevated)', borderRadius: T.radius.pill, border: '1px solid var(--border-subtle)' }}>
              Ε9 / ΕΝΦΙΑ (myAADE) →
            </a>
            <button onClick={() => upd({ enfiaShowCalc: !s.enfiaShowCalc })}
              style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: T.radius.badge, padding: '2px 10px', cursor: 'pointer', fontFamily: T.font.sans }}>
              {s.enfiaShowCalc ? '▲ Σύμπτυξη' : '▼ Ανάπτυξη'}
            </button>
          </div>
        </div>

        {/* Cross-tab Checklist badge */}
        {crossTabData.enfiaChecklist && (
          <div style={{ background: crossTabData.enfiaChecklist.status === 'done' ? 'rgba(52,168,83,0.07)' : 'rgba(26,115,232,0.06)', border: `1px solid ${crossTabData.enfiaChecklist.status === 'done' ? 'rgba(52,168,83,0.2)' : 'rgba(26,115,232,0.15)'}`, borderRadius: T.radius.inner, padding: '9px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, fontFamily: T.font.sans }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: crossTabData.enfiaChecklist.status === 'done' ? 'var(--positive)' : 'var(--info)', flexShrink: 0 }}/>
            <span style={{ flex: 1, color: 'var(--text-secondary)' }}>
              {crossTabData.enfiaChecklist.status === 'done'
                ? 'ΕΝΦΙΑ καταγεγραμμένο ως ολοκληρωμένο στο Checklist'
                : crossTabData.enfiaChecklist.daysLeft !== null && crossTabData.enfiaChecklist.daysLeft <= 30
                  ? `ΕΝΦΙΑ στο Checklist, σε ${crossTabData.enfiaChecklist.daysLeft} ημέρες`
                  : 'ΕΝΦΙΑ εκκρεμεί στο Checklist'}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: T.radius.pill }}>Checklist</span>
          </div>
        )}

        {/* 2026 banner */}
        <div style={{ background: 'rgba(26,115,232,0.05)', border: '1px solid rgba(26,115,232,0.12)', borderRadius: T.radius.inner, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--info)', flexShrink: 0, marginTop: 3 }}/>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, fontFamily: T.font.sans }}>
            <span style={{ fontWeight: 700, color: 'var(--info)' }}>Νέο 2026: </span>
            Αύξηση ~8% στους συντελεστές. Μείωση 10-20% αν ασφαλίζεται για φυσικές καταστροφές (Α.1005/2026).{' '}
            <a href="https://www.taxheaven.gr/news/73091/anarthohkan-ta-ekkaoaristika-toy-enfia-2026" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Ανάλυση ΕΝΦΙΑ 2026 →</a>
          </div>
        </div>

        {/* Deadline strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 90px), 1fr))', gap: 6, marginBottom: 20 }}>
          {ENFIA_DEADLINES.map((d, i) => {
            const isPast = new Date(d.date) < today;
            const isNext = d === nextDeadline;
            const dLeft  = Math.ceil((new Date(d.date).getTime() - today.getTime()) / 86400000);
            return (
              <div key={i} style={{ background: isNext ? 'rgba(26,115,232,0.1)' : isPast ? 'var(--bg-elevated)' : 'var(--bg-surface)', border: `1px solid ${isNext ? 'var(--accent)' : 'var(--border-subtle)'}`, borderRadius: T.radius.inner, padding: '10px 6px', textAlign: 'center' as const, opacity: isPast ? 0.45 : 1, transition: 'all 0.15s' }}>
                <div style={{ fontSize: 8, fontWeight: 700, fontFamily: T.font.sans, marginBottom: 3, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: isPast ? 'var(--positive)' : isNext ? 'var(--accent)' : 'transparent', minHeight: 12 }}>
                  {isPast ? 'ΠΛΗΡΩΜΕΝΗ' : isNext ? 'ΕΠΟΜΕΝΗ' : ''}
                </div>
                <div style={{ fontSize: 11, fontWeight: isNext ? 700 : 500, color: isNext ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.sans }}>{d.label}</div>
                <div style={{ fontSize: 10, color: isNext ? 'var(--accent)' : 'var(--text-tertiary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{d.month}</div>
                {isNext && dLeft >= 0 && dLeft <= 90 && (
                  <div style={{ fontSize: 9, color: 'var(--accent)', fontFamily: T.font.sans, marginTop: 3, fontWeight: 700 }}>{dLeft} ημέρες</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Deadline alert */}
        {nextDeadline && daysToDeadline !== null && daysToDeadline <= 30 && (
          <div style={{ background: daysToDeadline <= 7 ? 'rgba(197,34,31,0.07)' : 'rgba(242,153,0,0.07)', border: `1px solid ${daysToDeadline <= 7 ? 'rgba(197,34,31,0.25)' : 'rgba(242,153,0,0.25)'}`, borderRadius: T.radius.inner, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, fontFamily: T.font.sans }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: daysToDeadline <= 7 ? 'var(--negative)' : 'var(--warning)', flexShrink: 0 }}/>
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
              {nextDeadline.label} ΕΝΦΙΑ 2026{' '}
              <span style={{ color: daysToDeadline <= 7 ? 'var(--negative)' : 'var(--warning)', fontWeight: 700 }}>σε {daysToDeadline} ημέρες</span>
              {enfiaResult && `, Ποσό δόσης: ${fe(enfiaResult.installment)}`}
            </span>
          </div>
        )}

        {/* Calculator */}
        {s.enfiaShowCalc && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 20 }}>
            {/* Left: inputs */}
            <div>
              <div style={g2}>
                <NumberInput label="Εμβαδόν (τετραγωνικά μέτρα)"              value={s.enfiaSqm}      onChange={v => upd({ enfiaSqm: v })}      suffix="τετραγωνικά"/>
                <NumberInput label="Ποσοστό Ιδιοκτησίας (%)"     value={s.enfiaOwnership} onChange={v => upd({ enfiaOwnership: v })} suffix="%" max={100}/>
              </div>
              <div style={{ marginBottom: 14 }}>
                <CustomSelect label="Τιμή Ζώνης (€ ανά τετραγωνικό)" value={s.enfiaZone} onChange={v => upd({ enfiaZone: v })} options={ZONE_OPTIONS}/>
              </div>
              <div style={g2}>
                <CustomSelect label="Όροφος"    value={s.enfiaFloor} onChange={v => upd({ enfiaFloor: v })} options={FLOOR_OPTIONS}/>
                <CustomSelect label="Παλαιότητα" value={s.enfiaAge}  onChange={v => upd({ enfiaAge: v })}  options={AGE_OPTIONS}/>
              </div>
              <div style={{ marginBottom: 14 }}>
                <NumberInput label="Συνολική Αξία Ακινήτων (€), για Συμπληρωματικό Φόρο" value={s.enfiaTotalVal} onChange={v => upd({ enfiaTotalVal: v })} suffix="€"/>
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8, fontFamily: T.font.sans }}>Μειώσεις</div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                {REDUCTIONS.map(r => {
                  const active = (s.enfiaReductions || []).includes(r.key);
                  // Highlight insurance if cross-tab data says they qualify
                  const eligible = r.key === 'insurance' && (crossTabData.insuranceEq || crossTabData.insuranceFlood);
                  return (
                    <div key={r.key} onClick={() => toggleReduction(r.key)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', transition: 'all 0.15s', background: active ? 'rgba(52,168,83,0.07)' : eligible ? 'rgba(52,168,83,0.03)' : 'var(--bg-elevated)', border: `1px solid ${active ? 'var(--positive)' : eligible ? 'rgba(52,168,83,0.3)' : 'var(--border-subtle)'}`, borderRadius: T.radius.inner }}>
                      <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, border: `2px solid ${active ? 'var(--positive)' : 'var(--border-default)'}`, background: active ? 'var(--positive)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {active && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: T.font.sans, fontWeight: active ? 600 : 400 }}>
                          {r.label}
                          {eligible && !active && <span style={{ fontSize: 9, color: 'var(--positive)', marginLeft: 8, fontFamily: T.font.sans }}>✓ Δικαιούσαι</span>}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 1 }}>{r.note}</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--positive)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>-{r.pct}%</span>
                    </div>
                  );
                })}
              </div>
              {!s.enfiaZone && (
                <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
                  <NumberInput label="ΕΝΦΙΑ/έτος (χειροκίνητα)" value={s.enfiaAnnual}
                    onChange={v => upd({ enfiaAnnual: v, enfiaMonthly: v ? String(((parseFloat(v) || 0) / 12).toFixed(2)) : '' })}
                    suffix="€" step={50}/>
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '12px 14px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6, fontFamily: T.font.sans }}>Μηνιαία Αναγωγή</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{enfiaM > 0 ? fe(enfiaM) : '—'}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Right: results */}
            <div>
              {enfiaResult && enfiaResult.final > 0 ? (
                <>
                  <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 18, marginBottom: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12, marginBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6, fontFamily: T.font.sans }}>Τελικός ΕΝΦΙΑ</div>
                        <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--negative)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fe(enfiaResult.final, 0)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6, fontFamily: T.font.sans }}>Δόση (~6 δόσεις)</div>
                        <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--warning)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fe(enfiaResult.installment, 0)}</div>
                      </div>
                    </div>
                    {[
                      { label: 'Βασικός Φόρος',         val: enfiaResult.basic,  pos: false },
                      { label: 'Συμπληρωματικός Φόρος',  val: enfiaResult.suppl,  pos: false },
                      ...(enfiaResult.redAmt > 0 ? [{ label: `Μειώσεις ${enfiaResult.maxPct}%`, val: -enfiaResult.redAmt, pos: true }] : []),
                    ].map((row, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{row.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: row.pos ? 'var(--positive)' : 'var(--text-primary)' }}>
                          {row.val > 0 ? '+' : ''}{fe(row.val)}
                        </span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans }}>Σύνολο ΕΝΦΙΑ</span>
                      <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--negative)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fe(enfiaResult.final)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 6, marginBottom: 14 }}>
                    {ENFIA_DEADLINES.map((d, i) => {
                      const isPast = new Date(d.date) < today;
                      const isNext = d === nextDeadline;
                      return (
                        <div key={i} style={{ background: isNext ? 'rgba(26,115,232,0.1)' : 'var(--bg-elevated)', border: `1px solid ${isNext ? 'var(--accent)' : 'var(--border-subtle)'}`, borderRadius: T.radius.inner, padding: '10px 12px', opacity: isPast ? 0.45 : 1 }}>
                          <div style={{ fontSize: 9, fontWeight: 600, fontFamily: T.font.sans, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 4, color: isPast ? 'var(--positive)' : isNext ? 'var(--accent)' : 'var(--text-tertiary)' }}>{d.label}{isPast ? ' ✓' : ''}</div>
                          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', lineHeight: 1, color: isNext ? 'var(--accent)' : isPast ? 'var(--positive)' : 'var(--text-primary)' }}>{fe(enfiaResult.installment, 0)}</div>
                          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 3 }}>{d.month}</div>
                        </div>
                      );
                    })}
                  </div>
                  {!(s.enfiaReductions || []).includes('insurance') && (
                    <div style={{ background: 'rgba(52,168,83,0.07)', border: '1px solid rgba(52,168,83,0.2)', borderRadius: T.radius.inner, padding: '10px 14px', fontSize: 11, color: 'var(--positive)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
                      Ασφάλεια με κάλυψη φυσικών καταστροφών → μείωση 10-20% ΕΝΦΙΑ (Α.1005/2026)
                    </div>
                  )}
                </>
              ) : (
                <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 24, textAlign: 'center' as const }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans, marginBottom: 8 }}>Συμπλήρωσε εμβαδόν + τιμή ζώνης</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginBottom: 18, lineHeight: 1.5 }}>Η τιμή ζώνης βρίσκεται στο myAADE → Εφαρμογές → Δήλωση Ε9/ΕΝΦΙΑ</div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' as const }}>
                    <a href="https://www1.aade.gr/aadeapps3/myaade/" target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--info)', background: 'rgba(26,115,232,0.08)', padding: '8px 18px', borderRadius: T.radius.pill, border: '1px solid rgba(26,115,232,0.2)', textDecoration: 'none', fontWeight: 600, fontFamily: T.font.sans }}>
                      Δήλωση Ε9/ΕΝΦΙΑ (myAADE) →
                    </a>
                    <a href="https://www.taxheaven.gr/news/73091/anarthohkan-ta-ekkaoaristika-toy-enfia-2026" target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--accent)', background: 'rgba(26,115,232,0.08)', padding: '8px 18px', borderRadius: T.radius.pill, border: '1px solid rgba(26,115,232,0.2)', textDecoration: 'none', fontWeight: 600, fontFamily: T.font.sans }}>
                      ΕΝΦΙΑ 2026 →
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Δημοτικά Τέλη ────────────────────────────────────────────────── */}
      <div style={card}>
        {secHdr('Δημοτικά Τέλη')}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: 14, marginBottom: 14, border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10, fontFamily: T.font.sans }}>Υπολογισμός ποσοστού από τελευταίο λογαριασμό ρεύματος</div>
          {/* FIX: 2 inputs + result, all in same grid, aligned at bottom, no marginBottom on result box */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12, marginBottom: 10 }}>
            <NumberInput label="Σύνολο λογαριασμού (€)"       value={s.lastBillTotal}    onChange={v => upd({ lastBillTotal: v })}    suffix="€" step={1}/>
            <NumberInput label="Δημοτικά Τέλη στον λογαριασμό (€)" value={s.lastBillDimotika} onChange={v => upd({ lastBillDimotika: v })} suffix="€" step={0.5}/>
          </div>
          {/* Result: compact inline pill, same pattern as Providers + Electricity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: dimotikaPct > 0 ? 'rgba(26,115,232,0.08)' : 'var(--bg-base)', border: `1px solid ${dimotikaPct > 0 ? 'var(--accent)' : 'var(--border-subtle)'}`, borderRadius: T.radius.inner, padding: '8px 14px' }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: dimotikaPct > 0 ? 'var(--accent)' : 'var(--text-tertiary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {dimotikaPct > 0 ? `${dimotikaPct.toFixed(1)}%` : '—'}
              </span>
              <div>
                <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans }}>Ποσοστό Δημοτικών Τελών</div>
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
          {MONTHS_GR.map((m, i) => {
            const val   = parseFloat((s.dimotikaHistory || [])[i]) || 0;
            const pct   = val / maxH;
            const isCur = i === currentMonth;
            const isHov = hoveredMonth === i;
            const isHigh = dimotikaAvg > 0 && val > dimotikaAvg * 1.2;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 1, cursor: 'pointer' }}
                onMouseEnter={() => setHoveredMonth(i)} onMouseLeave={() => setHoveredMonth(null)}>
                <div style={{ fontSize: 7, color: isHigh ? 'var(--negative)' : isCur ? 'var(--accent)' : isHov ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', height: 12, display: 'flex', alignItems: 'flex-end' }}>
                  {val > 0 ? Math.round(val) : ''}
                </div>
                <div style={{ width: '100%', height: `${Math.max(pct * 42, 2)}px`, background: isCur ? 'var(--accent)' : isHigh ? 'var(--negative)' : isHov ? 'rgba(26,115,232,0.7)' : 'rgba(26,115,232,0.45)', borderRadius: '3px 3px 0 0', transition: 'background 0.15s' }}/>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderTop: '1px solid var(--border-subtle)', paddingTop: 4 }}>
          {MONTHS_GR.map((m, i) => (
            <div key={i} style={{ flex: 1, fontSize: 8, color: i === currentMonth ? 'var(--accent)' : hoveredMonth === i ? 'var(--text-primary)' : 'var(--text-tertiary)', textAlign: 'center' as const, fontWeight: i === currentMonth ? 700 : hoveredMonth === i ? 600 : 400, fontFamily: T.font.sans, cursor: 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={() => setHoveredMonth(i)} onMouseLeave={() => setHoveredMonth(null)}>{m}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 90px), 1fr))', gap: 6 }}>
          {MONTHS_GR.map((m, i) => (
            <div key={i}>
              <label style={{ fontSize: 8, color: i === currentMonth ? 'var(--accent)' : hoveredMonth === i ? 'var(--text-secondary)' : 'var(--text-secondary)', display: 'block', marginBottom: 4, textAlign: 'center' as const, fontFamily: T.font.sans, transition: 'color 0.15s' }}>{m}</label>
              <input type="number" value={(s.dimotikaHistory || [])[i] || ''} onChange={e => updHistory(i, e.target.value)} placeholder="€"
                onMouseEnter={() => setHoveredMonth(i)} onMouseLeave={() => setHoveredMonth(null)}
                onFocus={() => setHoveredMonth(i)} onBlur={() => setHoveredMonth(null)}
                style={histInputStyle(i === currentMonth, hoveredMonth === i)}/>
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
              <TextInput    label="Εταιρεία / Όνομα"        value={s.cleaningContact}      onChange={v => upd({ cleaningContact: v })}      placeholder="Παράδειγμα: Μαρία Α."/>
              <TextInput    label="Τηλέφωνο"                 value={s.cleaningPhone}        onChange={v => upd({ cleaningPhone: v })}        placeholder="69xxxxxxxx"/>
              <CustomSelect label="Συχνότητα"               value={s.cleaningFreq}         onChange={v => upd({ cleaningFreq: v })}         options={FREQ}/>
              <NumberInput  label="Κόστος / Επίσκεψη (€)" value={s.cleaningCostPerVisit} onChange={v => upd({ cleaningCostPerVisit: v })} suffix="€" step={5}/>
            </div>
            <div style={g2}>
              <NumberInput label="Ώρες ανά Επίσκεψη" value={s.cleaningHours} onChange={v => upd({ cleaningHours: v })} suffix="ώρες" step={0.5}/>
              <TextInput   label="Σημειώσεις"         value={s.cleaningNotes} onChange={v => upd({ cleaningNotes: v })} placeholder="Παράδειγμα: κάθε Τετάρτη"/>
            </div>
            {cleaningM > 0 && (
              <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '10px 14px', fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans, border: '1px solid var(--border-subtle)' }}>
                Μηνιαίο: <strong style={{ color: 'var(--text-primary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(cleaningM)}</strong>
                {s.cleaningHours && s.cleaningCostPerVisit && parseFloat(s.cleaningHours) > 0 && (
                  <span style={{ marginLeft: 14 }}>Ωριαίο: <strong style={{ fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(parseFloat(s.cleaningCostPerVisit) / parseFloat(s.cleaningHours))} / ώρα</strong></span>
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
            <TextInput    label="Κηπουρός / Εταιρεία"      value={s.gardenContact} onChange={v => upd({ gardenContact: v })} placeholder="Παράδειγμα: Νίκος Κ."/>
            <TextInput    label="Τηλέφωνο"                   value={s.gardenPhone}   onChange={v => upd({ gardenPhone: v })}   placeholder="69xxxxxxxx"/>
            <CustomSelect label="Συχνότητα"                 value={s.gardenFreq}    onChange={v => upd({ gardenFreq: v })}    options={FREQ}/>
            <NumberInput  label="Κόστος / Επίσκεψη (€)"   value={s.gardenCost}    onChange={v => upd({ gardenCost: v })}   suffix="€" step={10}/>
          </div>
        )}
      </div>

      {/* ── Πισίνα ───────────────────────────────────────────────────────── */}
      <div style={card}>
        {svcHdr('Πισίνα', s.hasPool, v => upd({ hasPool: v }), poolM)}
        {s.hasPool && (
          <>
            <div style={g4}>
              <TextInput   label="Τεχνικός / Εταιρεία "     value={s.poolContact}    onChange={v => upd({ poolContact: v })}    placeholder="Pool Service"/>
              <TextInput   label="Τηλέφωνο"                 value={s.poolPhone}      onChange={v => upd({ poolPhone: v })}      placeholder="69xxxxxxxx"/>
              <NumberInput label="Εβδομαδιαίο Κόστος (€)"  value={s.poolWeeklyCost} onChange={v => upd({ poolWeeklyCost: v })} suffix="€" step={5}/>
              <NumberInput label="Χημικά / μήνα (€)"        value={s.poolChemicals}  onChange={v => upd({ poolChemicals: v })} suffix="€" step={5}/>
            </div>
            <div style={g2}>
              <DatePicker label="Άνοιγμα Σεζόν"  value={s.poolSeasonOpen}  onChange={v => upd({ poolSeasonOpen: v })}/>
              <DatePicker label="Κλείσιμο Σεζόν" value={s.poolSeasonClose} onChange={v => upd({ poolSeasonClose: v })}/>
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
              <TextInput   label="Τεχνικός / Εταιρεία"           value={s.acContact}     onChange={v => upd({ acContact: v })}     placeholder="Παναγιώτης Τ."/>
              <TextInput   label="Τηλέφωνο"                        value={s.acPhone}       onChange={v => upd({ acPhone: v })}       placeholder="69xxxxxxxx"/>
              <NumberInput label="Αριθμός Κλιματιστικών"           value={s.acUnits}       onChange={v => upd({ acUnits: v })}       suffix="τεμάχια" step={1}/>
              <NumberInput label="Κόστος Συντήρησης / Τεμάχιο (€)"  value={s.acServiceCost} onChange={v => upd({ acServiceCost: v })} suffix="€" step={10}/>
            </div>
            <div style={g2}>
              <DatePicker label="Τελευταία Συντήρηση" value={s.acLastService} onChange={v => upd({ acLastService: v })}/>
              <TextInput  label="Σημειώσεις"        value={s.acNotes}      onChange={v => upd({ acNotes: v })}      placeholder="Παράδειγμα: Κάθε Απρίλιο"/>
            </div>
            {s.acServiceCost && s.acUnits && parseFloat(s.acServiceCost) > 0 && (
              <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '10px 14px', fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans, border: '1px solid var(--border-subtle)' }}>
                Ετήσιο σέρβις: <strong style={{ color: 'var(--text-primary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe((parseFloat(s.acServiceCost) || 0) * (parseInt(s.acUnits) || 1))}</strong>
                <span style={{ marginLeft: 14 }}>Μηνιαία αναγωγή: <strong style={{ fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe((parseFloat(s.acServiceCost) || 0) * (parseInt(s.acUnits) || 1) / 12)}</strong></span>
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
              <TextInput   label="Τεχνικός / Εταιρεία "   value={s.elevatorCompany}        onChange={v => upd({ elevatorCompany: v })}        placeholder="Otis, Schindler..."/>
              <TextInput   label="Τηλέφωνο"               value={s.elevatorPhone}          onChange={v => upd({ elevatorPhone: v })}          placeholder="210xxxxxxx"/>
              <NumberInput label="Μηνιαία Συντήρηση (€)"  value={s.elevatorMonthly}        onChange={v => upd({ elevatorMonthly: v })}        suffix="€" step={5}/>
              <DatePicker  label="Τελευταία Συντήρηση"  value={s.elevatorLastInspection} onChange={v => upd({ elevatorLastInspection: v })}/>
            </div>
            <TextInput label="Σημειώσεις" value={s.elevatorNotes} onChange={v => upd({ elevatorNotes: v })} placeholder="Παράδειγμα: Ετήσιος έλεγχος ΕΛΟΤ..."/>
          </>
        )}
      </div>

      {/* ── Απεντόμωση ───────────────────────────────────────────────────── */}
      <div style={card}>
        {svcHdr('Απεντόμωση', s.hasPest, v => upd({ hasPest: v }), pestM)}
        {s.hasPest && (
          <div style={g4}>
            <TextInput    label="Τεχνικός / Εταιρεία"                 value={s.pestContact} onChange={v => upd({ pestContact: v })} placeholder="Anticimex, Rentokil..."/>
            <TextInput    label="Τηλέφωνο"                 value={s.pestPhone}   onChange={v => upd({ pestPhone: v })}   placeholder="69xxxxxxxx"/>
            <NumberInput  label="Κόστος / Απεντόμωση (€)"  value={s.pestCost}   onChange={v => upd({ pestCost: v })}   suffix="€" step={10}/>
            <CustomSelect label="Συχνότητα"               value={s.pestFreq}    onChange={v => upd({ pestFreq: v })}   options={FREQ}/>
          </div>
        )}
      </div>

      {/* ── Άλλες Υπηρεσίες ──────────────────────────────────────────────── */}
      <div style={card}>
        {secHdr('Άλλες Υπηρεσίες')}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: 14, marginBottom: 14, border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 12, marginBottom: 12 }}>
            <TextInput label="Υπηρεσία"         value={newName}    onChange={setNewName}    placeholder="Παράδειγμα: Βαφή, Υδραυλικός..."/>
            <TextInput label="Τεχνικός / Εταιρεία" value={newContact} onChange={setNewContact} placeholder="Ονοματεπώνυμο ή Εταιρεία"/>
            <TextInput label="Τηλέφωνο"          value={newPhone}   onChange={setNewPhone}   placeholder="69xxxxxxxx"/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'flex-end' }}>
            <NumberInput  label="Κόστος (€)" value={newCost} onChange={setNewCost} suffix="€" step={10}/>
            <CustomSelect label="Συχνότητα"  value={newFreq} onChange={setNewFreq} options={FREQ}/>
            <button onClick={addOther}
              style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: T.radius.btn, padding: '0 20px', height: 40, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans, whiteSpace: 'nowrap' as const }}>
              + Προσθήκη
            </button>
          </div>
        </div>
        {(s.otherServices || []).map((o: any, i: number) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{o.name}</span>
              {o.contact && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 10, fontFamily: T.font.sans }}>{o.contact}</span>}
              {o.phone   && <span style={{ fontSize: 10, color: 'var(--info)',           marginLeft: 10, fontFamily: T.font.sans }}>{o.phone}</span>}
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)', marginLeft: 10, fontFamily: T.font.sans }}>{FREQ.find(f => f.value === o.freq)?.label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(toMonthly(o.cost, o.freq))} / μήνα</span>
              <button onClick={() => delOther(i)}
                style={{ width: 26, height: 26, borderRadius: T.radius.badge, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 12 }}>✕</button>
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
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(r.amount)} / μήνα</span>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 10, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(r.amount * 12)} / έτος</span>
                </div>
              </div>
              <div style={{ height: 4, background: 'var(--bg-overlay)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${totalServices > 0 ? (r.amount / totalServices) * 100 : 0}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 0.3s' }}/>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderTop: '2px solid var(--border-subtle)', marginTop: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: T.font.sans }}>Σύνολο Υπηρεσιών</span>
            <div style={{ textAlign: 'right' as const }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fe(totalServices)} / μήνα</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', marginTop: 3 }}>{fe(totalServices * 12)} / έτος</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}