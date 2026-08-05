'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NumberInput, TextInput, DatePicker, CustomSelect } from './UIComponents';
import { T, fe, InfoBanner, Card, EmptyState } from '@/components/Theme';
import { notifyOk, notifyError } from '@/components/Toast';
import { HandCoins, BarChart3 } from 'lucide-react';
import { athensToday } from '@/lib/core/time';

const MONTHS_GR = ['Ιαν','Φεβ','Μαρ','Απρ','Μαΐ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];

const MGMT_TYPES = [
  { value: 'traditional', label: 'Παραδοσιακός Διαχειριστής' },
  { value: 'office',      label: 'Γραφείο Διαχείρισης'       },
  { value: 'billys',      label: 'Ψηφιακή Πλατφόρμα'         },
  { value: 'none',        label: 'Χωρίς Διαχειριστή'         },
];

const MGMT_INFO: Record<string, { monthly: number; desc: string; url: string }> = {
  traditional: { monthly: 0, desc: 'Παραδοσιακός διαχειριστής, εθελοντής ή αμειβόμενος ένοικος/ιδιοκτήτης.', url: '' },
  office:      { monthly: 0, desc: 'Γραφείο Διαχείρισης, επαγγελματική εταιρεία, συνήθως 20–50 € / μήνα.',   url: '' },
  billys:      { monthly: 0, desc: 'Ψηφιακή πλατφόρμα κοινοχρήστων, online έκδοση, ειδοποιήσεις, πληρωμές. Δες τη σύγκριση παρόχων παρακάτω.', url: 'https://billys.gr' },
  none:        { monthly: 0, desc: 'Αυτοδιαχείριση, μηδενικό κόστος, απαιτεί χρόνο από τον ιδιοκτήτη.',     url: '' },
};

const MGMT_CARDS = [
  { key: 'traditional', costLabel: 'Εθελοντής',   nameLabel: 'Παραδοσιακός Διαχειριστής', url: '' },
  { key: 'office',      costLabel: '20–50 €/μήνα', nameLabel: 'Γραφείο Διαχείρισης',       url: '' },
  { key: 'billys',      costLabel: 'από 0 €',      nameLabel: 'Ψηφιακή Πλατφόρμα',         url: '' },
  { key: 'none',        costLabel: 'Δωρεάν',        nameLabel: 'Χωρίς Διαχειριστή',        url: '' },
] as const;

// Ελληνικές πλατφόρμες έκδοσης/διαχείρισης κοινοχρήστων, τιμές ενδεικτικές (2026).
// Οι περισσότερες κλιμακώνουν το κόστος ανάλογα με τα διαμερίσματα της πολυκατοικίας.
const KOIN_PLATFORMS: { name: string; price: string; note: string; url: string }[] = [
  { name: 'Billys',            price: 'Δωρεάν – 29 €/μήνα', note: 'Δωρεάν έκδοση. Smart: τραπεζικός λογ. πολυκατοικίας, ψηφοφορίες, ειδοποιήσεις οφειλών. Safe: αστική ευθύνη διαχειριστή.', url: 'https://billys.gr' },
  { name: 'Proper',            price: 'Δωρεάν',             note: 'Δωρεάν έκδοση κοινοχρήστων + υπηρεσίες διαχείρισης στην Αττική.', url: 'https://proper.gr' },
  { name: 'Outgo',             price: 'Δωρεάν – ~86 €/έτος', note: '1 δωρεάν έκδοση/μήνα. Συνδρομή ανάλογα με τα διαμερίσματα.', url: 'https://outgo.gr' },
  { name: 'Κοινόχρηστα24',     price: 'Οικονομικό',         note: '35+ χρόνια στον χώρο. Online υπολογισμός & έκδοση.', url: 'https://www.koinoxrista24.gr' },
  { name: 'e-apps Κοινόχρηστα', price: 'από 19,90 €/έτος',   note: 'Χαμηλό ετήσιο κόστος, online συνδρομή.', url: 'https://e-apps.gr/app-review/koino' },
  { name: 'Κοινόχρηστα.online', price: 'Δωρεάν',            note: 'Δωρεάν online υπολογισμός & εκτύπωση, χωρίς εγγραφή.', url: 'https://koinoxrista.online' },
];

// Ανάλυση κοινοχρήστων ανά κατηγορία, λογική κατανομής με χιλιοστά (Billys-style).
// payer: ποιος επιβαρύνεται κατά τον νόμο/έθιμο (ενοικιαστής=λειτουργικά, ιδιοκτήτης=κεφαλαιουχικά).
const COMMON_CATEGORIES: { key: string; label: string; payer: 'tenant' | 'owner' }[] = [
  { key: 'cleaning',    label: 'Καθαρισμός',              payer: 'tenant' },
  { key: 'power',       label: 'Ρεύμα κοινοχρήστων',      payer: 'tenant' },
  { key: 'elevator',    label: 'Ασανσέρ (λειτουργία)',    payer: 'tenant' },
  { key: 'heating',     label: 'Θέρμανση / πετρέλαιο',    payer: 'tenant' },
  { key: 'water',       label: 'Ύδρευση κοινοχρήστων',    payer: 'tenant' },
  { key: 'garden',      label: 'Κηπουρός / πράσινο',      payer: 'tenant' },
  { key: 'manager',     label: 'Αμοιβή διαχειριστή',      payer: 'tenant' },
  { key: 'maintenance', label: 'Συντήρηση / επισκευές',   payer: 'owner'  },
  { key: 'reserve',     label: 'Αποθεματικό κτηρίου',     payer: 'owner'  },
];

const histInputStyle = (isCurrent: boolean, isHovered: boolean): React.CSSProperties => ({
  width: '100%',
  background: isCurrent ? 'rgba(26,115,232,0.09)' : isHovered ? 'var(--bg-elevated)' : 'var(--bg-base)',
  border: `1px solid ${isCurrent ? 'var(--accent)' : isHovered ? 'var(--border-default)' : 'var(--border-subtle)'}`,
  borderRadius: T.radius.badge,
  padding: '6px 4px',
  color: 'var(--text-primary)',
  fontSize: 11,
  fontFamily: T.font.mono,
  fontVariantNumeric: 'tabular-nums',
  outline: 'none',
  textAlign: 'center',
  boxSizing: 'border-box',
  transition: 'all 0.15s',
  cursor: 'pointer',
});

interface Props { propertyId: string; userId?: string; }

export default function BillsCommon({ propertyId, userId = '' }: Props) {
  const supabase  = createClient();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mgmtType,     setMgmtType]     = useState('traditional');
  const [mgmtCost,     setMgmtCost]     = useState('');
  const [mgmtDueDay,   setMgmtDueDay]   = useState('25');
  const [fundBalance,  setFundBalance]  = useState('');
  const [fundMyPct,    setFundMyPct]    = useState('');
  const [fundMonthly,  setFundMonthly]  = useState('');
  const [fundLastDate, setFundLastDate] = useState('');
  const [extraReason,  setExtraReason]  = useState('');
  const [extraAmount,  setExtraAmount]  = useState('');
  const [extraDate,    setExtraDate]    = useState('');
  const [extras,       setExtras]       = useState<{ reason: string; amount: string; date: string; transferredToExpenses?: boolean }[]>([]);
  const [history,      setHistory]      = useState<string[]>(Array(12).fill(''));
  const [millesimi,    setMillesimi]    = useState('');
  const [catData,      setCatData]      = useState<Record<string, string>>({});
  const [transferring, setTransferring] = useState<number | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const [hoveredCard,  setHoveredCard]  = useState<string | null>(null);

  useEffect(() => {
    if (!propertyId) return;
    (async () => {
      const { data } = await supabase.from('bills_settings').select('data')
        .eq('property_id', propertyId).eq('section', 'common').maybeSingle();
      if (data?.data) {
        const d = data.data as Record<string, unknown>;
        if (d.mgmtType)                  setMgmtType(d.mgmtType as string);
        if (d.mgmtCost !== undefined)    setMgmtCost(String(d.mgmtCost ?? ''));
        if (d.mgmtDueDay)                setMgmtDueDay(d.mgmtDueDay as string);
        if (d.fundBalance !== undefined) setFundBalance(String(d.fundBalance ?? ''));
        if (d.fundMyPct !== undefined)   setFundMyPct(String(d.fundMyPct ?? ''));
        if (d.fundMonthly !== undefined) setFundMonthly(String(d.fundMonthly ?? ''));
        if (d.fundLastDate)              setFundLastDate(d.fundLastDate as string);
        if (d.extras)                    setExtras(d.extras as typeof extras);
        if (d.history)                   setHistory(d.history as string[]);
        if (d.millesimi !== undefined)   setMillesimi(String(d.millesimi ?? ''));
        if (d.catData)                   setCatData(d.catData as Record<string, string>);
      }
    })();
  }, [propertyId]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const save = useCallback((patch: Record<string, unknown>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await supabase.from('bills_settings').upsert({
        property_id: propertyId, user_id: String(userId), section: 'common',
        data: patch, updated_at: new Date().toISOString(),
      }, { onConflict: 'property_id,section' });
    }, 800);
  }, [propertyId, userId]);

  const upd = useCallback((patch: Record<string, unknown>) => {
    save({ mgmtType, mgmtCost, mgmtDueDay, fundBalance, fundMyPct, fundMonthly, fundLastDate, extras, history, millesimi, catData, ...patch });
  }, [mgmtType, mgmtCost, mgmtDueDay, fundBalance, fundMyPct, fundMonthly, fundLastDate, extras, history, millesimi, catData, save]);

  const sMgmt    = (v: string) => { setMgmtType(v);    upd({ mgmtType: v    }); };
  const sMgmtC   = (v: string) => { setMgmtCost(v);    upd({ mgmtCost: v    }); };
  const sMgmtD   = (v: string) => { setMgmtDueDay(v);  upd({ mgmtDueDay: v  }); };
  const sFundBal = (v: string) => { setFundBalance(v);  upd({ fundBalance: v  }); };
  const sFundPct = (v: string) => { setFundMyPct(v);    upd({ fundMyPct: v    }); };
  const sFundM   = (v: string) => { setFundMonthly(v);  upd({ fundMonthly: v  }); };
  const sFundD   = (v: string) => { setFundLastDate(v); upd({ fundLastDate: v }); };
  const sHist    = (i: number, v: string) => {
    const n = [...history]; n[i] = v; setHistory(n); upd({ history: n });
  };
  const sMill    = (v: string) => { setMillesimi(v); upd({ millesimi: v }); };
  const sCat     = (key: string, v: string) => {
    const n = { ...catData, [key]: v }; setCatData(n); upd({ catData: n });
  };

  const addExtra = () => {
    if (!extraReason || !extraAmount) return;
    const n = [...extras, { reason: extraReason, amount: extraAmount, date: extraDate, transferredToExpenses: false }];
    setExtras(n); upd({ extras: n });
    setExtraReason(''); setExtraAmount(''); setExtraDate('');
  };
  const delExtra = (i: number) => {
    const n = extras.filter((_, j) => j !== i); setExtras(n); upd({ extras: n });
  };
  const transferToExpenses = async (i: number) => {
    const e = extras[i];
    if (!e || e.transferredToExpenses || transferring === i) return;
    setTransferring(i);
    try {
      await supabase.from('expenses').insert({
        property_id: propertyId, user_id: String(userId),
        amount: parseFloat(e.amount),
        description: `Κοινόχρηστα, ${e.reason}`,
        date: e.date || athensToday(),
        category: 'Κοινόχρηστα',
      });
      const n = extras.map((ex, j) => j === i ? { ...ex, transferredToExpenses: true } : ex);
      setExtras(n); upd({ extras: n });
      // Ο τόνος (θετικό/αρνητικό) δηλώνεται πια ρητά. Πριν, η επιτυχία ξεχώριζε από
      // την αποτυχία με `transferMsg.startsWith('Σφάλμα')` — αν άλλαζε η διατύπωση
      // του μηνύματος, η αποτυχία εμφανιζόταν ουδέτερη και διαβαζόταν ως επιτυχία.
      notifyOk(`«${e.reason}», ${parseFloat(e.amount).toFixed(2)} € προστέθηκε στις Δαπάνες`);
    } catch {
      notifyError('Σφάλμα, δοκίμασε ξανά');
    } finally {
      setTransferring(null);
    }
  };

  const mgmtInfo    = MGMT_INFO[mgmtType];
  const mgmtMonthly = parseFloat(mgmtCost) || mgmtInfo?.monthly || 0;
  const monthlyAvg  = history.filter(v => v).length > 0
    ? history.reduce((s, v) => s + (parseFloat(v) || 0), 0) / history.filter(v => v).length : 0;
  const totalCommon  = mgmtMonthly + (parseFloat(fundMonthly) || 0) + monthlyAvg;
  const maxH         = Math.max(...history.map(v => parseFloat(v) || 0), 1);
  const currentMonth = new Date().getMonth();
  const myFundShare  = fundBalance && fundMyPct ? parseFloat(fundBalance) * (parseFloat(fundMyPct) / 100) : 0;
  const totalExtras  = extras.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const fundMonths   = fundMonthly && myFundShare > 0 ? Math.floor(myFundShare / (parseFloat(fundMonthly) || 1)) : 0;

  // Ανάλυση κοινοχρήστων ανά κατηγορία, κατανομή με χιλιοστά (Billys logic)
  const millRatio    = (parseFloat(millesimi) || 0) / 1000;          // μερίδιο ιδιοκτησίας
  const catRows      = COMMON_CATEGORIES.map(c => {
    const building = parseFloat(catData[c.key]) || 0;                // μηνιαίο σύνολο κτηρίου
    const myShare  = building * millRatio;                            // το μερίδιό μου
    return { ...c, building, myShare };
  });
  const catBuildingTotal = catRows.reduce((s, r) => s + r.building, 0);
  const myCatTotal       = catRows.reduce((s, r) => s + r.myShare, 0);
  const tenantBurden     = catRows.filter(r => r.payer === 'tenant').reduce((s, r) => s + r.myShare, 0);
  const ownerBurden      = catRows.filter(r => r.payer === 'owner').reduce((s, r) => s + r.myShare, 0);
  const hasCatData       = catBuildingTotal > 0;

  const secHdr = (label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans }}>{label}</span>
    </div>
  );

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      <style>{`
        .mgmt-card { transition: all 0.15s; }
        .mgmt-card:hover { border-color: var(--border-default) !important; background: var(--bg-surface) !important; }
        .mgmt-card.active:hover { border-color: var(--accent) !important; background: rgba(26,115,232,0.1) !important; }
        .hist-bar { transition: opacity 0.15s; }
        .hist-bar:hover { opacity: 0.85; }
      `}</style>

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Διαχείριση / μήνα',  value: mgmtMonthly > 0 ? fe(mgmtMonthly) : 'Δωρεάν' },
          { label: 'Ταμείο / μήνα',      value: parseFloat(fundMonthly) > 0 ? fe(parseFloat(fundMonthly)) : '—' },
          { label: 'Μέσος Όρος Κοινοχρήστων',  value: monthlyAvg > 0 ? fe(monthlyAvg) : '—' },
        ].map((k, i) => (
          <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* ── Οδηγός ευθύνης: ποιος πληρώνει τι (ελληνικό πλαίσιο) ──────────── */}
      <InfoBanner tone="neutral">
        <strong>Ποιος πληρώνει τι:</strong> τα <strong>λειτουργικά κοινόχρηστα</strong> (καθαρισμός, ρεύμα/λάμπες κλιμακοστασίου, ασανσέρ, κηπουρός, αμοιβή διαχειριστή) βαρύνουν τον <strong>ενοικιαστή</strong>. Οι <strong>έκτακτες/κεφαλαιουχικές δαπάνες</strong> (επισκευή στέγης/ασανσέρ, μονώσεις, αντικαταστάσεις) και το <strong>αποθεματικό</strong> βαρύνουν τον <strong>ιδιοκτήτη</strong>. Οι έκτακτες εισφορές παρακάτω μεταφέρονται αυτόματα στις Δαπάνες σου.
      </InfoBanner>

      {/* ── Ανάλυση Κοινοχρήστων ανά Κατηγορία (χιλιοστά, Billys logic) ──── */}
      <Card pad="lg">
        {secHdr('Ανάλυση Κοινοχρήστων ανά Κατηγορία')}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 16 }}>
          <NumberInput label="Τα χιλιοστά μου (‰)" value={millesimi} onChange={sMill} suffix="‰" step={1} max={1000}/>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6, fontFamily: T.font.sans }}>Το μερίδιό μου</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{(millRatio * 100).toFixed(2).replace('.', ',')}%</div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '10px 14px', marginBottom: 16, border: '1px solid var(--border-subtle)', borderLeft: '3px solid var(--accent)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, fontFamily: T.font.sans }}>
            Καταχώρησε το <strong>μηνιαίο σύνολο του κτηρίου</strong> για κάθε κατηγορία. Το μερίδιό σου υπολογίζεται αυτόματα με βάση τα <strong>χιλιοστά</strong> σου, όπως στην κατανομή κοινοχρήστων της πολυκατοικίας.
          </div>
        </div>

        {/* Επικεφαλίδα πίνακα */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 88px', gap: 10, padding: '0 4px 8px', borderBottom: '1px solid var(--border-subtle)', marginBottom: 4 }}>
          {['Κατηγορία', 'Σύνολο κτηρίου', 'Μερίδιό μου', 'Βαρύνει'].map((h, i) => (
            <div key={h} style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontFamily: T.font.sans, textAlign: i === 0 ? 'left' : i === 3 ? 'center' : 'right' }}>{h}</div>
          ))}
        </div>

        {catRows.map(r => (
          <div key={r.key} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 88px', gap: 10, alignItems: 'center', padding: '8px 4px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: T.font.sans, fontWeight: 500 }}>{r.label}</div>
            <input
              type="number" inputMode="decimal" value={catData[r.key] ?? ''} onChange={e => sCat(r.key, e.target.value)} placeholder="0"
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.badge, padding: '7px 10px', fontSize: 12, color: 'var(--text-primary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', textAlign: 'right', outline: 'none' }}/>
            <div style={{ fontSize: 12, fontWeight: 600, color: r.myShare > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{r.myShare > 0 ? fe(r.myShare) : '—'}</div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: 9, fontWeight: 700, fontFamily: T.font.sans, padding: '3px 8px', borderRadius: T.radius.pill, whiteSpace: 'nowrap' as const,
                background: r.payer === 'tenant' ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                border: `1px solid ${r.payer === 'tenant' ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
                color: r.payer === 'tenant' ? 'var(--accent)' : 'var(--text-secondary)' }}>
                {r.payer === 'tenant' ? 'Ενοικιαστής' : 'Ιδιοκτήτης'}
              </span>
            </div>
          </div>
        ))}

        {hasCatData && millRatio > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10, marginTop: 16 }}>
            {[
              { label: 'Το σύνολό μου / μήνα',   value: fe(myCatTotal),   color: 'var(--text-primary)' },
              { label: 'Βαρύνει ενοικιαστή',     value: fe(tenantBurden), color: 'var(--accent)'       },
              { label: 'Βαρύνει εσένα',          value: fe(ownerBurden),  color: 'var(--text-primary)' },
            ].map((k, i) => (
              <div key={i} style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '12px 16px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8, fontFamily: T.font.sans }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{k.value}</div>
              </div>
            ))}
          </div>
        )}

        {hasCatData && millRatio === 0 && (
          <div style={{ textAlign: 'center', padding: '14px 0 4px', fontSize: 11, color: 'var(--warning)', fontFamily: T.font.sans }}>
            Συμπλήρωσε τα χιλιοστά σου παραπάνω για να υπολογιστεί το μερίδιό σου.
          </div>
        )}
      </Card>

      {/* ── Διαχείριση Κτηρίου ───────────────────────────────────────────── */}
      <Card pad="lg">
        {secHdr('Διαχείριση Κτηρίου')}

        {/* FIX: 3 cols so DatePicker has enough room, was 4 cols causing overflow */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 14, marginBottom: 14 }}>
          <CustomSelect label="Τύπος Διαχείρισης"  value={mgmtType}   onChange={sMgmt}  options={MGMT_TYPES}/>
          <NumberInput  label="Μηνιαίο Κόστος (€)" value={mgmtCost}   onChange={sMgmtC} suffix="€" step={5}/>
          <NumberInput  label="Ημέρα Χρέωσης"       value={mgmtDueDay} onChange={sMgmtD} suffix="η" step={1}/>
        </div>

        {/* Info banner */}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '12px 16px', marginBottom: 16, border: '1px solid var(--border-subtle)', borderLeft: '3px solid var(--accent)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, fontFamily: T.font.sans, flex: 1 }}>{mgmtInfo?.desc}</div>
          {mgmtInfo?.url && (
            <a href={mgmtInfo.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, fontFamily: T.font.sans, whiteSpace: 'nowrap' as const, flexShrink: 0 }}>
              Επίσκεψη →
            </a>
          )}
        </div>

        {/* Comparison cards */}
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>Σύγκριση Επιλογών</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 8 }}>
          {MGMT_CARDS.map(opt => {
            const isCur    = mgmtType === opt.key;
            const isHov    = hoveredCard === opt.key && !isCur;
            return (
              <div key={opt.key}
                className={`mgmt-card${isCur ? ' active' : ''}`}
                onClick={() => sMgmt(opt.key)}
                onMouseEnter={() => setHoveredCard(opt.key)}
                onMouseLeave={() => setHoveredCard(null)}
                style={{
                  background: isCur ? 'rgba(26,115,232,0.07)' : isHov ? 'var(--bg-surface)' : 'var(--bg-elevated)',
                  border: `1px solid ${isCur ? 'var(--accent)' : isHov ? 'var(--border-default)' : 'var(--border-subtle)'}`,
                  borderRadius: T.radius.inner, padding: '12px 14px',
                  cursor: 'pointer', position: 'relative',
                }}>
                {isCur && <div style={{ position: 'absolute', top: 8, right: 10, width: 6, height: 6, borderRadius: '50%', background: 'var(--text-tertiary)' }}/>}
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', lineHeight: 1, color: isCur ? 'var(--accent)' : isHov ? 'var(--text-primary)' : 'var(--text-primary)', marginBottom: 4 }}>
                  {opt.costLabel}
                </div>
                <div style={{ fontSize: 11, fontFamily: T.font.sans, color: isCur ? 'var(--text-primary)' : 'var(--text-secondary)', lineHeight: 1.3 }}>
                  {opt.nameLabel}
                </div>
                {opt.url && isCur && (
                  <a href={opt.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                    style={{ fontSize: 9, color: 'var(--accent)', textDecoration: 'none', fontFamily: T.font.sans, marginTop: 5, display: 'block', fontWeight: 600 }}>
                    Επίσκεψη →
                  </a>
                )}
              </div>
            );
          })}
        </div>

        {/* Οδηγός ελληνικών πλατφορμών κοινοχρήστων, εμφανίζεται στην «Ψηφιακή Πλατφόρμα» */}
        {mgmtType === 'billys' && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>Ελληνικές Πλατφόρμες Κοινοχρήστων</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 8 }}>
              {KOIN_PLATFORMS.map(p => (
                <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'block', textDecoration: 'none', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '12px 14px', transition: 'border-color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{p.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' as const }}>{p.price}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.5, fontFamily: T.font.sans }}>{p.note}</div>
                  <span style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 600, fontFamily: T.font.sans, marginTop: 6, display: 'inline-block' }}>Επίσκεψη →</span>
                </a>
              ))}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 10, fontFamily: T.font.sans, lineHeight: 1.5 }}>
              Ενδεικτικές τιμές (2026). Οι περισσότερες πλατφόρμες κλιμακώνουν το κόστος ανάλογα με τα διαμερίσματα της πολυκατοικίας, δες τον εκάστοτε ιστότοπο για ακριβή τιμολόγηση.
            </div>
          </div>
        )}
      </Card>

      {/* ── Ταμείο Κτηρίου ───────────────────────────────────────────────── */}
      <Card pad="lg">
        {secHdr('Ταμείο Κτηρίου')}

        {/* FIX: 2+2 grid layout so DatePicker label doesn't overflow */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 14 }}>
          <NumberInput label="Υπόλοιπο Ταμείου (€)" value={fundBalance}  onChange={sFundBal} suffix="€" step={100}/>
          <NumberInput label="Μερίδιό Μου (%)"        value={fundMyPct}    onChange={sFundPct} suffix="%" step={1} max={100}/>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 14 }}>
          <NumberInput label="Μηνιαία Εισφορά (€)"   value={fundMonthly}  onChange={sFundM}   suffix="€" step={5}/>
          <DatePicker  label="Τελευταία Ενημέρωση"    value={fundLastDate} onChange={sFundD}/>
        </div>

        {myFundShare > 0 && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '14px 18px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' as const }}>
              {[
                { label: 'Μερίδιό σου',     value: fe(myFundShare),                              color: 'var(--text-primary)' },
                { label: 'Απόθεμα (μήνες)', value: `${fundMonths} μήνες`,                         color: fundMonths >= 6 ? 'var(--positive)' : 'var(--warning)' },
                { label: 'Εισφορά / έτος',  value: fe((parseFloat(fundMonthly) || 0) * 12),       color: 'var(--text-primary)' },
              ].map((k, i) => (
                <div key={i}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 5, fontFamily: T.font.sans }}>{k.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{k.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ── Έκτακτες Εισφορές ────────────────────────────────────────────── */}
      <Card pad="lg">
        {secHdr('Έκτακτες Εισφορές')}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: 16, marginBottom: 14, border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <TextInput   label="Αιτία"       value={extraReason} onChange={setExtraReason} placeholder="Παράδειγμα: Ανακαίνιση ταράτσας"/>
            <NumberInput label="Ποσό (€)"    value={extraAmount} onChange={setExtraAmount} suffix="€" step={50}/>
            <DatePicker  label="Ημερομηνία" value={extraDate}   onChange={setExtraDate}/>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={addExtra}
              style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: T.radius.btn, padding: '0 24px', height: T.h.md, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans }}>
              + Προσθήκη
            </button>
          </div>
        </div>

        {extras.length === 0 && (
          <EmptyState
            icon={<HandCoins size={20} />}
            title="Καμία έκτακτη εισφορά"
            hint="Κατέγραψε έκτακτες χρεώσεις κοινοχρήστων (π.χ. ανακαίνιση, ασανσέρ) για σωστό ετήσιο σύνολο."
          />
        )}

        {extras.map((e, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid var(--border-subtle)', opacity: e.transferredToExpenses ? 0.5 : 1 }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{e.reason}</span>
              {e.date && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 12, fontFamily: T.font.sans }}>{new Date(e.date).toLocaleDateString('el-GR')}</span>}
              {e.transferredToExpenses && (
                <span style={{ fontSize: 9, color: 'var(--text-tertiary)', marginLeft: 12, background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: T.radius.pill, fontFamily: T.font.sans }}>
                  Στις Δαπάνες ✓
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(parseFloat(e.amount))}</span>
              {!e.transferredToExpenses && (
                <button onClick={() => transferToExpenses(i)} disabled={transferring === i}
                  style={{ fontSize: 10, color: 'var(--accent)', background: 'rgba(26,115,232,0.06)', border: '1px solid rgba(26,115,232,0.2)', borderRadius: T.radius.badge, padding: '5px 12px', cursor: transferring === i ? 'not-allowed' : 'pointer', fontFamily: T.font.sans, whiteSpace: 'nowrap' as const, fontWeight: 600, opacity: transferring === i ? 0.6 : 1, transition: 'all 0.15s' }}>
                  {transferring === i ? 'Μεταφορά…' : 'Μεταφορά στις Δαπάνες →'}
                </button>
              )}
              <button onClick={() => delExtra(i)}
                style={{ width: 26, height: 26, borderRadius: T.radius.badge, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ✕
              </button>
            </div>
          </div>
        ))}

        {totalExtras > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Σύνολο έκτακτων εισφορών</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(totalExtras)}</span>
          </div>
        )}
      </Card>

      {/* ── Ιστορικό Κοινοχρήστων ────────────────────────────────────────── */}
      <Card pad="lg">
        {secHdr('Ιστορικό Κοινοχρήστων ανά Μήνα')}

        {history.every(v => !v) && (
          <EmptyState
            icon={<BarChart3 size={20} />}
            title="Το γράφημα είναι κενό"
            hint="Καταχώρησε μηνιαία ποσά κοινοχρήστων παρακάτω για να δεις την εξέλιξη του έτους."
          />
        )}

        {/* Bar chart, with hover highlight */}
        <div style={{ position: 'relative', display: 'flex', gap: 4, alignItems: 'flex-end', height: 64, marginBottom: 0, padding: '4px 0 0' }}>
          {monthlyAvg > 0 && (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${(monthlyAvg / maxH) * 54}px`, borderTop: '1px dashed rgba(26,115,232,0.4)', pointerEvents: 'none' }}>
              <span style={{ position: 'absolute', right: 0, top: -11, fontSize: 8, color: 'var(--accent)', background: 'var(--bg-surface)', padding: '0 4px', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', borderRadius: 3 }}>
                μέσος όρος {monthlyAvg.toFixed(0)}
              </span>
            </div>
          )}
          {MONTHS_GR.map((m, i) => {
            const val    = parseFloat(history[i]) || 0;
            const pct    = val / maxH;
            const isCur  = i === currentMonth;
            const isHov  = hoveredMonth === i;
            const isHigh = monthlyAvg > 0 && val > monthlyAvg * 1.2;
            const barBg  = isCur ? 'var(--accent)' : isHigh ? 'var(--negative)' : isHov ? 'rgba(26,115,232,0.7)' : 'rgba(26,115,232,0.45)';
            return (
              <div key={i}
                className="hist-bar"
                style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 1, cursor: 'pointer' }}
                onMouseEnter={() => setHoveredMonth(i)}
                onMouseLeave={() => setHoveredMonth(null)}>
                <div style={{ fontSize: 7, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', height: 12, display: 'flex', alignItems: 'flex-end', color: isHigh ? 'var(--negative)' : isCur ? 'var(--accent)' : isHov ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
                  {val > 0 ? Math.round(val) : ''}
                </div>
                <div style={{ width: '100%', height: `${Math.max(pct * 48, 2)}px`, background: barBg, borderRadius: '3px 3px 0 0', transition: 'background 0.15s' }}/>
              </div>
            );
          })}
        </div>

        {/* Month labels, clickable, highlight on hover */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderTop: '1px solid var(--border-subtle)', paddingTop: 4 }}>
          {MONTHS_GR.map((m, i) => (
            <div key={i}
              style={{ flex: 1, fontSize: 8, textAlign: 'center', fontFamily: T.font.sans, cursor: 'pointer', padding: '2px 0', borderRadius: 3, transition: 'all 0.15s', color: i === currentMonth ? 'var(--accent)' : hoveredMonth === i ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: i === currentMonth ? 700 : hoveredMonth === i ? 600 : 400, background: hoveredMonth === i && i !== currentMonth ? 'var(--bg-elevated)' : 'transparent' }}
              onMouseEnter={() => setHoveredMonth(i)}
              onMouseLeave={() => setHoveredMonth(null)}>
              {m}
            </div>
          ))}
        </div>

        {/* Input grid, hover + focus styles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 90px), 1fr))', gap: 6 }}>
          {MONTHS_GR.map((m, i) => (
            <div key={i}>
              <label style={{ fontSize: 8, color: i === currentMonth ? 'var(--accent)' : hoveredMonth === i ? 'var(--text-secondary)' : 'var(--text-tertiary)', display: 'block', marginBottom: 3, textAlign: 'center', fontFamily: T.font.sans, fontWeight: i === currentMonth ? 700 : 400, transition: 'color 0.15s' }}>{m}</label>
              <input
                type="number"
                value={history[i]}
                onChange={e => sHist(i, e.target.value)}
                placeholder="€"
                onMouseEnter={() => setHoveredMonth(i)}
                onMouseLeave={() => setHoveredMonth(null)}
                onFocus={() => setHoveredMonth(i)}
                onBlur={() => setHoveredMonth(null)}
                style={histInputStyle(i === currentMonth, hoveredMonth === i)}
              />
            </div>
          ))}
        </div>

        {monthlyAvg > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10, marginTop: 14 }}>
            {[
              { label: 'Μέσο Μηνιαίο',      value: fe(monthlyAvg),                                         color: 'var(--text-primary)' },
              { label: 'Ακριβότερος Μήνας',  value: fe(Math.max(...history.map(v => parseFloat(v) || 0))), color: 'var(--text-primary)' },
              { label: 'Ετήσιο Εκτιμώμενο', value: fe(monthlyAvg * 12),                                    color: 'var(--text-primary)' },
            ].map((k, i) => (
              <div key={i} style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '10px 14px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6, fontFamily: T.font.sans }}>{k.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: k.color, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Σύνοψη Κοινοχρήστων ──────────────────────────────────────────── */}
      {totalCommon > 0 && (
        <Card pad="lg">
          {secHdr('Σύνοψη Κοινοχρήστων')}
          {[
            { label: 'Διαχείριση',         amount: mgmtMonthly,                  skip: !mgmtMonthly },
            { label: 'Εισφορά Ταμείου',    amount: parseFloat(fundMonthly) || 0, skip: !(parseFloat(fundMonthly) || 0) },
            { label: 'Μέσος Όρος Κοινοχρήστων',  amount: monthlyAvg,                   skip: !monthlyAvg  },
          ].filter(r => !r.skip && r.amount > 0).map((r, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{r.label}</span>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(r.amount)} / μήνα</span>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 12, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(r.amount * 12)} / έτος</span>
                </div>
              </div>
              <div style={{ height: 4, background: 'var(--bg-overlay)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${totalCommon > 0 ? (r.amount / totalCommon) * 100 : 0}%`, background: 'var(--accent)', borderRadius: 3 }}/>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '2px solid var(--border-subtle)', marginTop: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: T.font.sans }}>Σύνολο Κοινοχρήστων</span>
            <div style={{ textAlign: 'right' as const }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fe(totalCommon)} / μήνα</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', marginTop: 3 }}>{fe(totalCommon * 12)} / έτος</div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}