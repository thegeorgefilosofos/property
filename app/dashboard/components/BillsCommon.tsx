'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NumberInput, TextInput, DatePicker, CustomSelect } from './UIComponents';

const T = {
  radius: { card: 14, inner: 10, badge: 6, btn: 10, pill: 100 },
  font: { sans: "Inter, 'Google Sans', sans-serif", mono: "'JetBrains Mono', monospace" },
};

const MONTHS_GR = ['Ιαν','Φεβ','Μαρ','Απρ','Μαΐ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
const fe = (n: number, d = 2) => `${n.toLocaleString('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;

const MGMT_TYPES = [
  { value: 'traditional', label: 'Παραδοσιακός Διαχειριστής' },
  { value: 'office',      label: 'Γραφείο Διαχείρισης'       },
  { value: 'billys',      label: 'Billys — 3 € / μήνα'       },
  { value: 'comfy',       label: 'Comfy — 5 € / μήνα'        },
  { value: 'mycondo',     label: 'My Condo — 4 € / μήνα'     },
  { value: 'none',        label: 'Χωρίς Διαχειριστή'         },
];

const MGMT_INFO: Record<string, { monthly: number; desc: string; url: string }> = {
  traditional: { monthly: 0, desc: 'Παραδοσιακός διαχειριστής — εθελοντής ή αμειβόμενος ένοικος/ιδιοκτήτης.', url: '' },
  office:      { monthly: 0, desc: 'Γραφείο Διαχείρισης — επαγγελματική εταιρεία, συνήθως 20–50 € / μήνα.',   url: '' },
  billys:      { monthly: 3, desc: 'Billys — ψηφιακή διαχείριση, online πληρωμές, αυτόματες ειδοποιήσεις.',    url: 'https://www.billys.gr' },
  comfy:       { monthly: 5, desc: 'Comfy — app για ιδιοκτήτες και ενοίκους, διαχείριση αιτημάτων.',           url: 'https://www.comfy.gr'  },
  mycondo:     { monthly: 4, desc: 'My Condo — ελληνική πλατφόρμα επικοινωνίας κτηρίου.',                      url: 'https://www.mycondo.gr' },
  none:        { monthly: 0, desc: 'Αυτοδιαχείριση — μηδενικό κόστος, απαιτεί χρόνο από τον ιδιοκτήτη.',     url: '' },
};

const MGMT_CARDS = [
  { key: 'traditional', costLabel: 'Εθελοντής',   nameLabel: 'Παραδοσιακός Διαχειριστής', url: '' },
  { key: 'office',      costLabel: 'Αμοιβή',       nameLabel: 'Γραφείο Διαχείρισης',       url: '' },
  { key: 'billys',      costLabel: '3 €/μήνα',     nameLabel: 'Billys',                    url: 'https://www.billys.gr' },
  { key: 'comfy',       costLabel: '5 €/μήνα',     nameLabel: 'Comfy',                     url: 'https://www.comfy.gr'  },
  { key: 'mycondo',     costLabel: '4 €/μήνα',     nameLabel: 'My Condo',                  url: 'https://www.mycondo.gr' },
  { key: 'none',        costLabel: 'Δωρεάν',        nameLabel: 'Χωρίς Διαχειριστή',        url: '' },
] as const;

const histInputStyle = (isCurrent: boolean, isHovered: boolean): React.CSSProperties => ({
  width: '100%',
  background: isCurrent ? 'rgba(212,175,66,0.09)' : isHovered ? 'var(--bg-elevated)' : 'var(--bg-base)',
  border: `1px solid ${isCurrent ? 'var(--accent)' : isHovered ? 'var(--border-default)' : 'var(--border-subtle)'}`,
  borderRadius: T.radius.badge,
  padding: '6px 4px',
  color: 'var(--text-primary)',
  fontSize: 11,
  fontFamily: T.font.mono,
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

  const card: React.CSSProperties = {
    background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
    borderRadius: T.radius.card, padding: 20, marginBottom: 16,
  };

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
  const [transferMsg,  setTransferMsg]  = useState<string | null>(null);
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
    save({ mgmtType, mgmtCost, mgmtDueDay, fundBalance, fundMyPct, fundMonthly, fundLastDate, extras, history, ...patch });
  }, [mgmtType, mgmtCost, mgmtDueDay, fundBalance, fundMyPct, fundMonthly, fundLastDate, extras, history, save]);

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
        description: `Κοινόχρηστα — ${e.reason}`,
        date: e.date || new Date().toISOString().split('T')[0],
        category: 'Κοινόχρηστα',
      });
      const n = extras.map((ex, j) => j === i ? { ...ex, transferredToExpenses: true } : ex);
      setExtras(n); upd({ extras: n });
      setTransferMsg(`"${e.reason}" — ${parseFloat(e.amount).toFixed(2)} € προστέθηκε στις Δαπάνες`);
      setTimeout(() => setTransferMsg(null), 4500);
    } catch {
      setTransferMsg('Σφάλμα — δοκίμασε ξανά');
      setTimeout(() => setTransferMsg(null), 3000);
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

  const secHdr = (label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}/>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans }}>{label}</span>
    </div>
  );

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      <style>{`
        .mgmt-card { transition: all 0.15s; }
        .mgmt-card:hover { border-color: var(--border-default) !important; background: var(--bg-surface) !important; }
        .mgmt-card.active:hover { border-color: var(--accent) !important; background: rgba(212,175,66,0.1) !important; }
        .hist-bar { transition: opacity 0.15s; }
        .hist-bar:hover { opacity: 0.85; }
      `}</style>

      {/* ── Toast ────────────────────────────────────────────────────────── */}
      {transferMsg && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: 'var(--bg-surface)', border: `1px solid ${transferMsg.startsWith('Σφάλμα') ? 'var(--negative)' : 'var(--positive)'}`, borderRadius: T.radius.card, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, fontFamily: T.font.sans, boxShadow: '0 8px 32px rgba(0,0,0,0.25)', minWidth: 300 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: transferMsg.startsWith('Σφάλμα') ? 'var(--negative)' : 'var(--positive)' }}/>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: transferMsg.startsWith('Σφάλμα') ? 'var(--negative)' : 'var(--positive)' }}>{transferMsg}</span>
          <button onClick={() => setTransferMsg(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      )}

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Διαχείριση / μήνα',  value: mgmtMonthly > 0 ? fe(mgmtMonthly) : 'Δωρεάν' },
          { label: 'Ταμείο / μήνα',      value: parseFloat(fundMonthly) > 0 ? fe(parseFloat(fundMonthly)) : '—' },
          { label: 'Μ.Ο. Κοινοχρήστων',  value: monthlyAvg > 0 ? fe(monthlyAvg) : '—' },
        ].map((k, i) => (
          <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono, lineHeight: 1 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* ── Διαχείριση Κτηρίου ───────────────────────────────────────────── */}
      <div style={card}>
        {secHdr('Διαχείριση Κτηρίου')}

        {/* FIX: 3 cols so DatePicker has enough room — was 4 cols causing overflow */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
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
                  background: isCur ? 'rgba(212,175,66,0.07)' : isHov ? 'var(--bg-surface)' : 'var(--bg-elevated)',
                  border: `1px solid ${isCur ? 'var(--accent)' : isHov ? 'var(--border-default)' : 'var(--border-subtle)'}`,
                  borderRadius: T.radius.inner, padding: '12px 14px',
                  cursor: 'pointer', position: 'relative',
                }}>
                {isCur && <div style={{ position: 'absolute', top: 8, right: 10, width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }}/>}
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.font.mono, lineHeight: 1, color: isCur ? 'var(--accent)' : isHov ? 'var(--text-primary)' : 'var(--text-primary)', marginBottom: 4 }}>
                  {opt.costLabel}
                </div>
                <div style={{ fontSize: 11, fontFamily: T.font.sans, color: isCur ? 'var(--text-primary)' : 'var(--text-secondary)', lineHeight: 1.3 }}>
                  {opt.nameLabel}
                </div>
                {opt.url && isCur && (
                  <a href={opt.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                    style={{ fontSize: 9, color: 'var(--info)', textDecoration: 'none', fontFamily: T.font.sans, marginTop: 5, display: 'block', fontWeight: 600 }}>
                    Επίσκεψη →
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Ταμείο Κτηρίου ───────────────────────────────────────────────── */}
      <div style={card}>
        {secHdr('Ταμείο Κτηρίου')}

        {/* FIX: 2+2 grid layout so DatePicker label doesn't overflow */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <NumberInput label="Υπόλοιπο Ταμείου (€)" value={fundBalance}  onChange={sFundBal} suffix="€" step={100}/>
          <NumberInput label="Μερίδιό Μου (%)"        value={fundMyPct}    onChange={sFundPct} suffix="%" step={1} max={100}/>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
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
                  <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontFamily: T.font.mono, lineHeight: 1 }}>{k.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Έκτακτες Εισφορές ────────────────────────────────────────────── */}
      <div style={card}>
        {secHdr('Έκτακτες Εισφορές')}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: 16, marginBottom: 14, border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <TextInput   label="Αιτία"       value={extraReason} onChange={setExtraReason} placeholder="π.χ. Ανακαίνιση ταράτσας"/>
            <NumberInput label="Ποσό (€)"    value={extraAmount} onChange={setExtraAmount} suffix="€" step={50}/>
            <DatePicker  label="Ημερομηνία" value={extraDate}   onChange={setExtraDate}/>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={addExtra}
              style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: T.radius.btn, padding: '0 24px', height: 38, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans }}>
              + Προσθήκη
            </button>
          </div>
        </div>

        {extras.length === 0 && (
          <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-tertiary)', fontSize: 11, fontFamily: T.font.sans }}>
            Δεν υπάρχουν καταγεγραμμένες έκτακτες εισφορές
          </div>
        )}

        {extras.map((e, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid var(--border-subtle)', opacity: e.transferredToExpenses ? 0.5 : 1 }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{e.reason}</span>
              {e.date && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 12, fontFamily: T.font.sans }}>{new Date(e.date).toLocaleDateString('el-GR')}</span>}
              {e.transferredToExpenses && (
                <span style={{ fontSize: 9, color: 'var(--positive)', marginLeft: 12, background: 'rgba(52,168,83,0.1)', padding: '2px 8px', borderRadius: T.radius.pill, fontFamily: T.font.sans }}>
                  Στις Δαπάνες ✓
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--negative)', fontFamily: T.font.mono }}>{fe(parseFloat(e.amount))}</span>
              {!e.transferredToExpenses && (
                <button onClick={() => transferToExpenses(i)} disabled={transferring === i}
                  style={{ fontSize: 10, color: 'var(--info)', background: 'rgba(26,115,232,0.06)', border: '1px solid rgba(26,115,232,0.2)', borderRadius: T.radius.badge, padding: '5px 12px', cursor: transferring === i ? 'not-allowed' : 'pointer', fontFamily: T.font.sans, whiteSpace: 'nowrap' as const, fontWeight: 600, opacity: transferring === i ? 0.6 : 1, transition: 'all 0.15s' }}>
                  {transferring === i ? 'Μεταφορά...' : 'Μεταφορά στις Δαπάνες →'}
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
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--negative)', fontFamily: T.font.mono }}>{fe(totalExtras)}</span>
          </div>
        )}
      </div>

      {/* ── Ιστορικό Κοινοχρήστων ────────────────────────────────────────── */}
      <div style={card}>
        {secHdr('Ιστορικό Κοινοχρήστων ανά Μήνα')}

        {history.every(v => !v) && (
          <div style={{ textAlign: 'center', padding: '12px 0', marginBottom: 10, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
            Καταχώρησε ποσά παρακάτω για να εμφανιστεί το γράφημα
          </div>
        )}

        {/* Bar chart — with hover highlight */}
        <div style={{ position: 'relative', display: 'flex', gap: 4, alignItems: 'flex-end', height: 64, marginBottom: 0, padding: '4px 0 0' }}>
          {monthlyAvg > 0 && (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${(monthlyAvg / maxH) * 54}px`, borderTop: '1px dashed rgba(212,175,66,0.4)', pointerEvents: 'none' }}>
              <span style={{ position: 'absolute', right: 0, top: -11, fontSize: 8, color: 'var(--accent)', background: 'var(--bg-surface)', padding: '0 4px', fontFamily: T.font.mono, borderRadius: 3 }}>
                μ.ο. {monthlyAvg.toFixed(0)}
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
                <div style={{ fontSize: 7, fontFamily: T.font.mono, height: 12, display: 'flex', alignItems: 'flex-end', color: isHigh ? 'var(--negative)' : isCur ? 'var(--accent)' : isHov ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
                  {val > 0 ? Math.round(val) : ''}
                </div>
                <div style={{ width: '100%', height: `${Math.max(pct * 48, 2)}px`, background: barBg, borderRadius: '3px 3px 0 0', transition: 'background 0.15s' }}/>
              </div>
            );
          })}
        </div>

        {/* Month labels — clickable, highlight on hover */}
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

        {/* Input grid — hover + focus styles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6 }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 14 }}>
            {[
              { label: 'Μέσο Μηνιαίο',      value: fe(monthlyAvg),                                         color: 'var(--text-primary)' },
              { label: 'Ακριβότερος Μήνας',  value: fe(Math.max(...history.map(v => parseFloat(v) || 0))), color: 'var(--negative)'     },
              { label: 'Ετήσιο Εκτιμώμενο', value: fe(monthlyAvg * 12),                                    color: 'var(--text-primary)' },
            ].map((k, i) => (
              <div key={i} style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '10px 14px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6, fontFamily: T.font.sans }}>{k.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: k.color, fontFamily: T.font.mono }}>{k.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Σύνοψη Κοινοχρήστων ──────────────────────────────────────────── */}
      {totalCommon > 0 && (
        <div style={card}>
          {secHdr('Σύνοψη Κοινοχρήστων')}
          {[
            { label: 'Διαχείριση',         amount: mgmtMonthly,                  skip: !mgmtMonthly },
            { label: 'Εισφορά Ταμείου',    amount: parseFloat(fundMonthly) || 0, skip: !(parseFloat(fundMonthly) || 0) },
            { label: 'Μ.Ο. Κοινοχρήστων',  amount: monthlyAvg,                   skip: !monthlyAvg  },
          ].filter(r => !r.skip && r.amount > 0).map((r, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{r.label}</span>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.mono }}>{fe(r.amount)} / μήνα</span>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 12, fontFamily: T.font.mono }}>{fe(r.amount * 12)} / έτος</span>
                </div>
              </div>
              <div style={{ height: 4, background: 'var(--bg-overlay)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${totalCommon > 0 ? (r.amount / totalCommon) * 100 : 0}%`, background: 'var(--accent)', borderRadius: 2 }}/>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '2px solid var(--border-subtle)', marginTop: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: T.font.sans }}>Σύνολο Κοινοχρήστων</span>
            <div style={{ textAlign: 'right' as const }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono, lineHeight: 1 }}>{fe(totalCommon)} / μήνα</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.mono, marginTop: 3 }}>{fe(totalCommon * 12)} / έτος</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}