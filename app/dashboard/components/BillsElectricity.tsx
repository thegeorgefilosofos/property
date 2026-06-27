'use client';

import { useState, useMemo, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NumberInput, CustomSelect, Toggle } from './UIComponents';
import { useBillsSettings } from './BillsSettings';

const MONTHS_GR = ['Ιαν','Φεβ','Μαρ','Απρ','Μαΐ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
const fe = (n: number, d = 2) => `${n.toLocaleString('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
const fk = (n: number) => `${n.toFixed(4)} €`;
const LAST_UPDATED = 'Ιούνιος 2026';
const RAAYEY_URL  = 'https://energycost.gr/%CF%85%CF%80%CE%BF%CE%BB%CE%BF%CE%B3%CE%B9%CF%83%CE%BC%CF%8C%CF%82-%CF%84%CE%B9%CE%BC%CE%AE%CF%82-%CE%B2%CE%AC%CF%83%CE%B5%CE%B9-%CE%BA%CE%B1%CF%84%CE%B1%CE%BD%CE%AC%CE%BB%CF%89%CF%83%CE%B7%CF%82-2/';
const ERT    = 0.00856;
const ETMEAR = 0.0152;

const T = {
  radius: { card: 14, inner: 10, badge: 6, btn: 10, pill: 100 },
  font: { sans: "Inter, 'Google Sans', sans-serif", mono: "'JetBrains Mono', monospace" },
};

const histInputStyle = (isCurrent: boolean, isHovered = false): React.CSSProperties => ({
  width: '100%',
  background: isCurrent ? 'rgba(212,175,66,0.09)' : isHovered ? 'var(--bg-elevated)' : 'var(--bg-base)',
  border: `1px solid ${isCurrent ? 'var(--accent)' : isHovered ? 'var(--border-default)' : 'var(--border-subtle)'}`,
  borderRadius: T.radius.badge, padding: '6px 4px', color: 'var(--text-primary)',
  fontSize: 11, fontFamily: T.font.mono, outline: 'none', textAlign: 'center',
  boxSizing: 'border-box', transition: 'all 0.15s', cursor: 'pointer',
});

const PROVIDERS = [
  { value: 'dei', label: 'ΔΕΗ', url: 'https://www.dei.gr',
    tariffs: [
      { id: 'dei_prasino',       name: 'Γ1 Πράσινο',            badge: 'ΠΡΑΣΙΝΟ',  type: 'variable',      kwh_day: 0.1440, kwh_night: null,   fixed: 5.00, fixed_ebill: 3.50, vat: 6, desc: 'Κυμαινόμενο — Ειδικό Οικιακό (Γ1). Απαιτεί e-bill + πάγια εντολή για πάγιο 3.50 €.' },
      { id: 'dei_prasino_n',     name: 'Γ1Ν Πράσινο Νυχτερινό', badge: 'ΠΡΑΣΙΝΟ',  type: 'variable',      kwh_day: 0.1440, kwh_night: 0.1160, fixed: 5.00, fixed_ebill: 3.50, vat: 6, desc: 'Κυμαινόμενο με νυχτερινή ζώνη (23:00-07:00). Ιδανικό για πλυντήρια/θερμοσίφωνα.' },
      { id: 'dei_kitrino',       name: 'myHome 4All',            badge: 'ΚΙΤΡΙΝΟ', type: 'variable',      kwh_day: 0.1370, kwh_night: null,   fixed: 5.00, fixed_ebill: 3.50, vat: 6, kwh_tier2: 0.1870, tier2_threshold: 500, desc: 'Κυμαινόμενο. 0.137 €/kWh (0-500 kWh), 0.187 €/kWh (>500 kWh).' },
      { id: 'dei_mple_entertwo', name: 'myHome EnterTwo',        badge: 'ΜΠΛΕ',    type: 'fixed',         kwh_day: 0.1450, kwh_night: 0.0950, fixed: 5.00, fixed_ebill: 3.50, vat: 6, desc: 'Σταθερό 24 μήνες με νυχτερινή ζώνη.' },
      { id: 'dei_mple_online',   name: 'myHome Online',          badge: 'ΜΠΛΕ',    type: 'fixed',         kwh_day: 0.1420, kwh_night: null,   fixed: 5.00, fixed_ebill: 3.50, vat: 6, desc: 'Σταθερό online. Απαιτεί e-bill + πάγια εντολή.' },
      { id: 'dei_maxima',        name: 'myHome Maxima',          badge: 'ΜΠΛΕ',    type: 'fixed',         kwh_day: 0.1320, kwh_night: null,   kwh_tier2: 0.1220, tier2_threshold: 600, fixed: 5.00, fixed_ebill: 3.50, vat: 6, desc: 'Σταθερό κλιμακωτό. 0.132 € (0-600 kWh), 0.122 € (>600 kWh).' },
      { id: 'dei_plan',          name: 'myHome Plan',            badge: 'ΜΠΛΕ',    type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 60.00, fixed: 0, vat: 6, desc: 'Flat 60 €/μήνα. Ιδανικό για 2.500-4.500 kWh/έτος.' },
      { id: 'dei_dynamic',       name: 'myHome Dynamic',         badge: 'ΔΥΝΑΜΙΚΟ',type: 'dynamic',       kwh_day: 0, kwh_night: null, fixed: 5.00, vat: 6, desc: 'Ωριαία τιμολόγηση χονδρεμπορικής. Απαιτεί έξυπνο μετρητή.' },
    ],
  },
  { value: 'heron',     label: 'Ήρων',     url: 'https://www.heron.gr',     tariffs: [{ id: 'heron_value_special', name: 'Protergia Οικιακό Value Special', badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1642, kwh_night: null, fixed: 7.00, vat: 6, desc: 'Κυμαινόμενο. Έκπτωση συνέπειας 7 λεπτά/kWh.' },{ id: 'heron_stable', name: 'Ήρων Σταθερό Οικιακό', badge: 'ΜΠΛΕ', type: 'fixed', kwh_day: 0.1480, kwh_night: null, fixed: 7.20, vat: 6, desc: 'Σταθερό τιμολόγιο.' },{ id: 'heron_ena', name: 'Ε.ΝΑ (Virtual Net Metering)', badge: 'VNM', type: 'vnm', kwh_day: 0.1290, kwh_night: null, fixed: 7.00, vat: 6, desc: 'Συμμετοχή σε κοινό φωτοβολταϊκό. Χαμηλότερη τιμή + περιβαλλοντικό όφελος.' }] },
  { value: 'protergia', label: 'Protergia', url: 'https://www.protergia.gr', tariffs: [{ id: 'prot_value', name: 'Protergia Value', badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1580, kwh_night: null, fixed: 6.80, vat: 6, desc: 'Κυμαινόμενο.' },{ id: 'prot_fix', name: 'Protergia Fix', badge: 'ΜΠΛΕ', type: 'fixed', kwh_day: 0.1520, kwh_night: null, fixed: 7.00, vat: 6, desc: 'Σταθερό 12 μήνες.' }] },
  { value: 'volterra',  label: 'Volterra',  url: 'https://www.volterra.gr',  tariffs: [{ id: 'volt_easy', name: 'Volterra Easy', badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1610, kwh_night: null, fixed: 6.50, vat: 6, desc: 'Κυμαινόμενο.' },{ id: 'volt_stable', name: 'Volterra Stable', badge: 'ΜΠΛΕ', type: 'fixed', kwh_day: 0.1490, kwh_night: null, fixed: 7.00, vat: 6, desc: 'Σταθερό 24 μήνες.' }] },
  { value: 'nrg',       label: 'NRG',       url: 'https://www.nrg.gr',       tariffs: [{ id: 'nrg_now', name: 'NRG Now Οικιακό', badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1595, kwh_night: null, fixed: 6.90, vat: 6, desc: 'Κυμαινόμενο.' }] },
  { value: 'zenith',    label: 'Zenith',    url: 'https://www.zenith.gr',    tariffs: [{ id: 'zen_start', name: 'Power Home Start', badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1595, kwh_night: null, fixed: 6.80, vat: 6, desc: 'Κυμαινόμενο.' }] },
  { value: 'elin',      label: 'Elin',      url: 'https://www.elin.gr',      tariffs: [{ id: 'elin_home', name: 'Elin Home', badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1598, kwh_night: null, fixed: 7.10, vat: 6, desc: 'Κυμαινόμενο.' }] },
];

const BADGE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  'ΠΡΑΣΙΝΟ':  { bg: 'rgba(52,168,83,0.1)',  color: 'var(--positive)', border: 'rgba(52,168,83,0.25)'  },
  'ΚΙΤΡΙΝΟ':  { bg: 'rgba(242,153,0,0.1)',  color: 'var(--warning)',  border: 'rgba(242,153,0,0.25)'  },
  'ΜΠΛΕ':     { bg: 'rgba(26,115,232,0.1)', color: 'var(--info)',     border: 'rgba(26,115,232,0.25)' },
  'VNM':      { bg: 'rgba(212,175,66,0.1)', color: 'var(--accent)',   border: 'rgba(212,175,66,0.25)' },
  'ΔΥΝΑΜΙΚΟ': { bg: 'rgba(139,92,246,0.1)', color: '#8b5cf6',         border: 'rgba(139,92,246,0.25)' },
};
const bc = (badge: string) => BADGE_COLORS[badge] || { bg: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: 'var(--border-subtle)' };

export default function BillsElectricity({ propertyId, userId }: { propertyId: string; userId?: string }) {
  const supabase = createClient();
  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 };
  const g2: React.CSSProperties   = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 };
  const g3: React.CSSProperties   = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 };
  const currentMonth = new Date().getMonth();
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

  // Cross-tab: insurance data
  const [insData, setInsData] = useState<{ eq: boolean; fl: boolean } | null>(null);
  useEffect(() => {
    if (!propertyId) return;
    (async () => {
      try {
        const { data } = await supabase.from('bills_settings').select('data').eq('property_id', propertyId).eq('section', 'insurance').maybeSingle();
        if (data?.data) {
          const d = data.data as any;
          setInsData({ eq: !!d.insCustomEarthquake, fl: !!d.insCustomFlood });
        }
      } catch (_) {}
    })();
  }, [propertyId]);

  const [settings, updateSettings] = useBillsSettings(propertyId, userId || '', 'electricity', {
    provider: 'dei', tariffId: 'dei_prasino', useEbill: true,
    dimotika: '4.8', dimotikaCalcCons: '', dimotikaCalcAmt: '',
    showCustom: false, customKwh: '', customNight: '', customFixed: '',
    kwhHistory: [180,160,140,120,100,120,180,200,160,120,150,170].map(String),
    vnmEnabled: false, vnmCapital: '', vnmKwp: '', vnmSharedPct: '30',
    lastBillAmount: '', lastBillKwh: '',
  });

  const { provider, tariffId, useEbill, dimotika, dimotikaCalcCons, dimotikaCalcAmt,
    showCustom, customKwh, customNight, customFixed, kwhHistory,
    vnmEnabled, vnmCapital, vnmKwp, vnmSharedPct, lastBillAmount, lastBillKwh } = settings;

  const s = (k: string, v: any) => updateSettings({ [k]: v });
  const provData = PROVIDERS.find(p => p.value === provider)!;
  const tariff   = (provData?.tariffs.find(t => t.id === tariffId) || provData?.tariffs[0]) as any;
  const useNight = !!tariff?.kwh_night;
  const tariffBc = bc(tariff?.badge || '');

  const calc = useMemo(() => {
    if (!tariff) return null;
    const kwh_day   = parseFloat(customKwh)   || tariff.kwh_day   || 0;
    const kwh_night = parseFloat(customNight)  || tariff.kwh_night || 0;
    const fixed_base= parseFloat(customFixed)  || (useEbill && tariff.fixed_ebill ? tariff.fixed_ebill : tariff.fixed) || 0;
    const avgKwh    = kwhHistory.filter((k: string) => k).length > 0
      ? kwhHistory.reduce((s: number, k: string) => s + (parseFloat(k) || 0), 0) / kwhHistory.filter((k: string) => k).length : 150;
    if (tariff.type === 'fixed_monthly') return { total: tariff.flat_monthly, avgKwh, flat: true, predictedBill: tariff.flat_monthly, predictedKwh: Math.round(avgKwh), annualCost: tariff.flat_monthly * 12, consumption: tariff.flat_monthly, ert: 0, etmear: 0, dimotikaAmt: 0, vatAmt: 0, fixed: 0, consumptionPct: 100, taxesPct: 0, dimotikaPct: 0, fixedPct: 0, vatPct: 0, annualKwh: avgKwh * 12, vnmMonthly: 0, vnmPayback: 0, vnmROI: 0, yourProd: 0 };
    const dayKwh = useNight ? avgKwh * 0.65 : avgKwh;
    const nightKwh = useNight ? avgKwh * 0.35 : 0;
    let consumption = dayKwh * kwh_day + nightKwh * kwh_night;
    if (tariff.tier2_threshold && tariff.kwh_tier2) { const t1 = Math.min(dayKwh, tariff.tier2_threshold); const t2 = Math.max(0, dayKwh - tariff.tier2_threshold); consumption = t1 * kwh_day + t2 * tariff.kwh_tier2 + nightKwh * kwh_night; }
    const ert = avgKwh * ERT, etmear = avgKwh * ETMEAR;
    const dimotikaAmt = consumption * (parseFloat(dimotika) || 4.8) / 100;
    const subtotal = consumption + ert + etmear + dimotikaAmt + fixed_base;
    const vatAmt = subtotal * (tariff.vat / 100);
    const total = subtotal + vatAmt;
    const consumptionPct = total > 0 ? (consumption / total) * 100 : 0;
    const taxesPct       = total > 0 ? ((ert + etmear) / total) * 100 : 0;
    const dimotikaPct    = total > 0 ? (dimotikaAmt / total) * 100 : 0;
    const fixedPct       = total > 0 ? (fixed_base / total) * 100 : 0;
    const vatPct         = total > 0 ? (vatAmt / total) * 100 : 0;
    const annualKwh      = kwhHistory.reduce((s: number, k: string) => s + (parseFloat(k) || 0), 0);
    const seasonalFactor = [1.1,1.0,0.9,0.8,0.85,1.1,1.4,1.5,1.2,0.9,1.0,1.1][(currentMonth + 1) % 12];
    const predictedKwh   = Math.round(avgKwh * seasonalFactor);
    const predictedBill  = total * (predictedKwh / avgKwh);
    const vnmKwpN = parseFloat(vnmKwp) || 0, vnmCap = parseFloat(vnmCapital) || 0;
    const yourProd = vnmKwpN * 1350 * (parseFloat(vnmSharedPct) / 100);
    const vnmSaving = yourProd * kwh_day, vnmMonthly = vnmSaving / 12;
    const vnmPayback = vnmCap > 0 && vnmSaving > 0 ? vnmCap / vnmSaving : 0;
    const vnmROI     = vnmCap > 0 ? (vnmSaving / vnmCap) * 100 : 0;
    return { total, avgKwh, consumption, ert, etmear, dimotikaAmt, vatAmt, fixed: fixed_base, consumptionPct, taxesPct, dimotikaPct, fixedPct, vatPct, annualKwh, annualCost: total * 12, predictedBill, predictedKwh, flat: false, vnmMonthly, vnmPayback, vnmROI, yourProd };
  }, [tariff, customKwh, customNight, customFixed, useEbill, kwhHistory, dimotika, vnmKwp, vnmCapital, vnmSharedPct, useNight, currentMonth]);

  const maxKwh      = Math.max(...kwhHistory.map((k: string) => parseFloat(k) || 0), 1);
  const provOptions = PROVIDERS.map(p => ({ value: p.value, label: p.label }));
  const tariffOptions = (provData?.tariffs || []).map((t: any) => ({ value: t.id, label: `${t.badge} — ${t.name}` }));

  const secHdr = (label: string, link?: { url: string; text: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}/>
      <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--text-secondary)', fontFamily: T.font.sans, flex: 1 }}>{label}</span>
      {link?.url && (
        <a href={link.url} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 10, color: 'var(--info)', textDecoration: 'none', fontWeight: 600, fontFamily: T.font.sans, background: 'rgba(26,115,232,0.06)', border: '1px solid rgba(26,115,232,0.18)', borderRadius: T.radius.pill, padding: '3px 10px', whiteSpace: 'nowrap' as const }}>
          {link.text}
        </a>
      )}
    </div>
  );

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>

      {/* Cross-tab: insurance ΕΝΦΙΑ discount */}
      {insData && (insData.eq || insData.fl) && (
        <div style={{ background: 'rgba(52,168,83,0.07)', border: '1px solid rgba(52,168,83,0.25)', borderRadius: T.radius.inner, padding: '11px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--positive)', flexShrink: 0 }}/>
          <div style={{ flex: 1, fontSize: 12, fontFamily: T.font.sans }}>
            <span style={{ fontWeight: 700, color: 'var(--positive)' }}>Έκπτωση ΕΝΦΙΑ 10-20% </span>
            <span style={{ color: 'var(--text-secondary)' }}>Ρύθμισε στο tab Υπηρεσίες → ΕΝΦΙΑ → Μειώσεις → Ασφάλεια</span>
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '2px 10px', borderRadius: T.radius.pill, whiteSpace: 'nowrap' as const, fontFamily: T.font.sans }}>Ασφάλεια</span>
        </div>
      )}

      {/* ΡΑΑΕΥ Banner */}
      <div style={{ background: 'rgba(26,115,232,0.06)', border: '1px solid rgba(26,115,232,0.2)', borderRadius: T.radius.inner, padding: '11px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--info)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 2, fontFamily: T.font.sans }}>Επίσημη Σύγκριση Τιμολογίων — ΡΑΑΕΥ</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>energycost.gr — ανεξάρτητη σύγκριση όλων των παρόχων</div>
        </div>
        <a href={RAAYEY_URL} target="_blank" rel="noopener noreferrer"
          style={{ background: 'var(--info)', color: '#fff', borderRadius: T.radius.btn, padding: '8px 16px', fontSize: 11, fontWeight: 700, textDecoration: 'none', fontFamily: T.font.sans, whiteSpace: 'nowrap' as const }}>
          Σύγκριση τώρα →
        </a>
      </div>

      {/* KPIs */}
      {calc && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Εκτιμώμενος Λογαριασμός',                   value: fe(calc.total)                                        },
            { label: 'Μέση Κατανάλωση',                            value: `${calc.avgKwh.toFixed(0)} kWh`                      },
            { label: 'Εκτιμώμενο Ετήσιο',                         value: fe(calc.annualCost)                                   },
            { label: `Πρόβλεψη ${MONTHS_GR[(currentMonth+1)%12]}`, value: fe(calc.predictedBill),                               },
          ].map((k, i) => (
            <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono, lineHeight: 1 }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Πάροχος & Τιμολόγιο */}
      <div style={card}>
        {secHdr('Πάροχος & Τιμολόγιο')}
        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 12, fontFamily: T.font.sans }}>Τελευταία ενημέρωση τιμών: {LAST_UPDATED}</div>
        <div style={g2}>
          <CustomSelect label="Πάροχος Ρεύματος" value={provider}
            onChange={v => { s('provider', v); const p = PROVIDERS.find(x => x.value === v); if (p) s('tariffId', p.tariffs[0].id); }}
            options={provOptions}/>
          <CustomSelect label="Τιμολόγιο" value={tariffId} onChange={v => s('tariffId', v)} options={tariffOptions}/>
        </div>

        {tariff && (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: 16, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: tariffBc.color, background: tariffBc.bg, padding: '3px 10px', borderRadius: T.radius.badge, border: `1px solid ${tariffBc.border}` }}>{tariff.badge}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{tariff.name}</span>
              <a href={provData.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: 'var(--accent)', textDecoration: 'none', marginLeft: 'auto', fontFamily: T.font.sans, fontWeight: 600 }}>Επίσημη σελίδα →</a>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 10, fontFamily: T.font.sans }}>{tariff.desc}</div>
            {tariff.type !== 'fixed_monthly' && tariff.type !== 'dynamic' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                {[
                  { label: 'Τιμή kWh Ημέρας',   value: fk(parseFloat(customKwh) || tariff.kwh_day),                                                         color: 'var(--text-primary)'   },
                  tariff.kwh_night && { label: 'Τιμή kWh Νύχτας', value: fk(parseFloat(customNight) || tariff.kwh_night),                                   color: 'var(--info)'           },
                  tariff.kwh_tier2 && { label: 'kWh Τ2 (>όριο)',  value: fk(tariff.kwh_tier2),                                                               color: 'var(--warning)'        },
                  { label: 'Πάγιο / μήνα',       value: `${(parseFloat(customFixed) || (useEbill && tariff.fixed_ebill ? tariff.fixed_ebill : tariff.fixed) || 0).toFixed(2)} €`, color: 'var(--text-secondary)' },
                  { label: 'ΦΠΑ',                value: `${tariff.vat}%`,                                                                                    color: 'var(--text-secondary)' },
                ].filter(Boolean).map((k: any, i: number) => (
                  <div key={i}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: k.color, fontFamily: T.font.mono }}>{k.value}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, fontFamily: T.font.sans, marginTop: 2 }}>{k.label}</div>
                  </div>
                ))}
              </div>
            )}
            {tariff.type === 'fixed_monthly' && <div style={{ fontSize: 22, fontWeight: 700, color: tariffBc.color, fontFamily: T.font.mono }}>{tariff.flat_monthly?.toFixed(2)} €/μήνα flat</div>}
          </div>
        )}

        {tariff?.fixed_ebill && (
          <div style={{ marginBottom: 12 }}>
            <Toggle on={useEbill} onChange={v => s('useEbill', v)} label={`e-bill + Πάγια Εντολή (${tariff.fixed_ebill?.toFixed(2)} €/μήνα)`} labelOff={`Κανονικό πάγιο (${tariff.fixed?.toFixed(2)} €/μήνα)`}/>
          </div>
        )}

        {/* ── Δημοτικά — FIX: compact pill like Providers ──────────────── */}
        <div style={{ background: 'rgba(26,115,232,0.04)', border: '1px solid rgba(26,115,232,0.12)', borderRadius: T.radius.inner, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--info)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 14, fontFamily: T.font.sans }}>
            Δημοτικά Τέλη — Ορισμός Ποσοστού
          </div>
          {/* 3 inputs same row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 12 }}>
            <NumberInput label="Ποσοστό % (αν το γνωρίζεις)"          value={dimotika}          onChange={v => s('dimotika', v)}          suffix="%" step={0.1}/>
            <NumberInput label="Κατανάλωση λογαριασμού ρεύματος (€)"  value={dimotikaCalcCons}  onChange={v => s('dimotikaCalcCons', v)}  suffix="€" step={1}/>
            <NumberInput label="Δημοτικά Τέλη στον λογαριασμό (€)"    value={dimotikaCalcAmt}   onChange={v => s('dimotikaCalcAmt', v)}   suffix="€" step={0.5}/>
          </div>
          {/* FIX: compact inline result — same as Providers, no big box */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: dimotika ? 'rgba(26,115,232,0.07)' : 'var(--bg-base)', border: `1px solid ${dimotika ? 'rgba(26,115,232,0.2)' : 'var(--border-subtle)'}`, borderRadius: T.radius.inner, padding: '8px 14px' }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--info)', fontFamily: T.font.mono, lineHeight: 1 }}>
                {dimotika ? `${dimotika}%` : '—'}
              </span>
              <div>
                <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans }}>Ενεργό ποσοστό</div>
                <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Αθήνα: ~5% · Τυπικό: 3–6%</div>
              </div>
            </div>
            {dimotikaCalcCons && dimotikaCalcAmt && parseFloat(dimotikaCalcCons) > 0 && (
              <button
                onClick={() => s('dimotika', (parseFloat(dimotikaCalcAmt) / parseFloat(dimotikaCalcCons) * 100).toFixed(1))}
                style={{ background: 'var(--info)', color: '#fff', border: 'none', borderRadius: T.radius.btn, padding: '8px 16px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans, whiteSpace: 'nowrap' as const }}>
                Εφαρμογή {(parseFloat(dimotikaCalcAmt) / parseFloat(dimotikaCalcCons) * 100).toFixed(1)}%
              </button>
            )}
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Συγχρονίζεται με tab Παροχοί</span>
          </div>
        </div>

        <button onClick={() => s('showCustom', !showCustom)}
          style={{ fontSize: 11, color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: T.font.sans, padding: 0, marginBottom: 4 }}>
          {showCustom ? 'Απόκρυψη' : 'Χειροκίνητη καταχώρηση τιμών (αν το πρόγραμμά σου διαφέρει)'}
        </button>
        {showCustom && (
          <div style={{ ...g3, marginTop: 10 }}>
            <NumberInput label="Τιμή kWh Ημέρας (€)"  value={customKwh}   onChange={v => s('customKwh', v)}   suffix="€" step={0.001}/>
            <NumberInput label="Τιμή kWh Νύχτας (€)"  value={customNight} onChange={v => s('customNight', v)} suffix="€" step={0.001}/>
            <NumberInput label="Πάγιο / μήνα (€)"      value={customFixed} onChange={v => s('customFixed', v)} suffix="€" step={0.5}/>
          </div>
        )}
      </div>

      {/* Ιστορικό kWh */}
      <div style={card}>
        {secHdr('Ιστορικό Κατανάλωσης kWh — 12 Μήνες')}
        <div style={{ position: 'relative', display: 'flex', gap: 5, alignItems: 'flex-end', height: 90, marginBottom: 8, padding: '0 2px' }}>
          {calc && maxKwh > 0 && (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${(calc.avgKwh / maxKwh) * 76}px`, borderTop: '1px dashed rgba(212,175,66,0.5)', pointerEvents: 'none', zIndex: 1 }}>
              <span style={{ position: 'absolute', right: 0, top: '-11px', fontSize: 8, color: 'var(--accent)', background: 'var(--bg-surface)', padding: '0 4px', fontFamily: T.font.mono, borderRadius: 3 }}>μ.ο. {calc.avgKwh.toFixed(0)}</span>
            </div>
          )}
          {MONTHS_GR.map((m, i) => {
            const kwh   = parseFloat(kwhHistory[i]) || 0;
            const pct   = kwh / maxKwh;
            const isCur = i === currentMonth;
            const isHov = hoveredMonth === i;
            const isHigh = calc && kwh > 0 && kwh > calc.avgKwh * 1.2;
            const barBg  = isCur ? 'var(--accent)' : isHigh ? 'var(--negative)' : isHov ? 'rgba(26,115,232,0.7)' : 'rgba(26,115,232,0.45)';
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 1, cursor: 'pointer' }}
                onMouseEnter={() => setHoveredMonth(i)} onMouseLeave={() => setHoveredMonth(null)}>
                <div style={{ fontSize: 7, color: isHigh ? 'var(--negative)' : isCur ? 'var(--accent)' : isHov ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontFamily: T.font.mono, height: 14, display: 'flex', alignItems: 'flex-end' }}>
                  {kwh > 0 ? kwh : ''}
                </div>
                <div style={{ width: '100%', height: `${Math.max(pct * 76, kwh > 0 ? 3 : 1)}px`, background: barBg, borderRadius: '3px 3px 0 0', transition: 'background 0.15s' }}/>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 5, marginBottom: 14 }}>
          {MONTHS_GR.map((m, i) => (
            <div key={i} style={{ flex: 1, fontSize: 8, color: i === currentMonth ? 'var(--accent)' : hoveredMonth === i ? 'var(--text-primary)' : 'var(--text-tertiary)', textAlign: 'center' as const, fontWeight: i === currentMonth ? 700 : hoveredMonth === i ? 600 : 400, fontFamily: T.font.sans, cursor: 'pointer', transition: 'color 0.15s', padding: '3px 0' }}
              onMouseEnter={() => setHoveredMonth(i)} onMouseLeave={() => setHoveredMonth(null)}>{m}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6 }}>
          {MONTHS_GR.map((m, i) => (
            <div key={i}>
              <label style={{ fontSize: 8, color: i === currentMonth ? 'var(--accent)' : hoveredMonth === i ? 'var(--text-secondary)' : 'var(--text-tertiary)', display: 'block', marginBottom: 3, textAlign: 'center' as const, fontFamily: T.font.sans, fontWeight: i === currentMonth ? 700 : 400, transition: 'color 0.15s' }}>{m}</label>
              <input type="number" value={kwhHistory[i]}
                onChange={e => { const n = [...kwhHistory]; n[i] = e.target.value; s('kwhHistory', n); }}
                onMouseEnter={() => setHoveredMonth(i)} onMouseLeave={() => setHoveredMonth(null)}
                onFocus={() => setHoveredMonth(i)} onBlur={() => setHoveredMonth(null)}
                style={histInputStyle(i === currentMonth, hoveredMonth === i)}/>
            </div>
          ))}
        </div>
        {calc && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 14 }}>
            {[
              { label: 'Ετήσια Κατανάλωση',                         value: `${calc.annualKwh.toFixed(0)} kWh` },
              { label: 'Μέση Μηνιαία',                               value: `${calc.avgKwh.toFixed(0)} kWh`   },
              { label: `Πρόβλεψη ${MONTHS_GR[(currentMonth+1)%12]}`, value: `${calc.predictedKwh} kWh`        },
            ].map((k, i) => (
              <div key={i} style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '12px 14px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6, fontFamily: T.font.sans, fontWeight: 600 }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono }}>{k.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ανάλυση Λογαριασμού */}
      {calc && !calc.flat && (
        <div style={card}>
          {secHdr('Ανάλυση Λογαριασμού')}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              {[
                { label: 'Κατανάλωση (πραγματική)',      value: fe(calc.consumption),  pct: calc.consumptionPct, color: 'var(--text-primary)'   },
                { label: 'ΕΡΤ',                           value: fe(calc.ert),           pct: calc.taxesPct * 0.36, color: 'var(--warning)'       },
                { label: 'ΕΤΜΕΑΡ (Ανανεώσιμες Πηγές)',   value: fe(calc.etmear),        pct: calc.taxesPct * 0.64, color: 'var(--warning)'       },
                { label: `Δημοτικά Τέλη (${dimotika}%)`, value: fe(calc.dimotikaAmt),   pct: calc.dimotikaPct,    color: 'var(--info)'           },
                { label: 'Πάγιο',                         value: fe(calc.fixed),         pct: calc.fixedPct,       color: 'var(--text-secondary)' },
                { label: `ΦΠΑ ${tariff?.vat}%`,           value: fe(calc.vatAmt),        pct: calc.vatPct,         color: 'var(--text-tertiary)'  },
              ].map((r, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{r.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: r.color, fontFamily: T.font.mono }}>{r.value} ({r.pct.toFixed(1)}%)</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--bg-overlay)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${r.pct}%`, background: r.color, borderRadius: 2 }}/>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '2px solid var(--border-subtle)', marginTop: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: T.font.sans }}>Σύνολο Λογαριασμού</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono }}>{fe(calc.total)}</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.mono }}>
                Πραγματικό κόστος/kWh: {calc.avgKwh > 0 ? (calc.total / calc.avgKwh).toFixed(4) : '—'} €
              </div>
            </div>
            <div>
              <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: 14, marginBottom: 12, border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>Κατανομή Λογαριασμού</div>
                {[
                  { label: 'Κατανάλωση',          pct: calc.consumptionPct,         color: 'var(--positive)'      },
                  { label: 'Τέλη (ΕΡΤ+ΕΤΜΕΑΡ)',   pct: calc.taxesPct,               color: 'var(--warning)'       },
                  { label: 'Δημοτικά Τέλη',        pct: calc.dimotikaPct,            color: 'var(--info)'          },
                  { label: 'Πάγιο + ΦΠΑ',         pct: calc.fixedPct + calc.vatPct, color: 'var(--text-secondary)'},
                ].map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, flexShrink: 0 }}/>
                    <div style={{ flex: 1, height: 5, background: 'var(--bg-overlay)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${r.pct}%`, background: r.color, borderRadius: 2 }}/>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, color: r.color, fontFamily: T.font.mono, minWidth: 35 }}>{r.pct.toFixed(1)}%</span>
                    <span style={{ fontSize: 9, color: 'var(--text-secondary)', minWidth: 110, fontFamily: T.font.sans }}>{r.label}</span>
                  </div>
                ))}
              </div>
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6, fontFamily: T.font.sans }}>Πρόβλεψη {MONTHS_GR[(currentMonth+1)%12]}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: calc.predictedBill > calc.total ? 'var(--negative)' : 'var(--text-primary)', fontFamily: T.font.mono }}>{fe(calc.predictedBill)}</div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4, fontFamily: T.font.sans }}>{calc.predictedKwh} kWh — εποχική εκτίμηση</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Σύγκριση Παρόχων */}
      <div style={card}>
        {secHdr('Σύγκριση Παρόχων', { url: RAAYEY_URL, text: 'ΡΑΑΕΥ →' })}
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 12, fontFamily: T.font.sans }}>
          Εκτίμηση βάσει {calc?.avgKwh.toFixed(0) || 150} kWh/μήνα · {LAST_UPDATED} · Πάτα γραμμή για επιλογή
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 700 }}>
            <thead>
              <tr>{['Πάροχος','Τιμολόγιο','Τύπος','Τιμή kWh','Εκτ. Μηνιαίο','Εκτ. Ετήσιο','Διαφορά/έτος'].map((h, i) => (
                <th key={i} style={{ fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: 'var(--text-secondary)', padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontWeight: 600, fontFamily: T.font.sans, background: 'var(--bg-elevated)', whiteSpace: 'nowrap' as const }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {PROVIDERS.flatMap(p => p.tariffs.map((t: any) => {
                const isCur = t.id === tariffId;
                const avgKwh = calc?.avgKwh || 150;
                let tot = 0;
                if (t.type === 'fixed_monthly') { tot = t.flat_monthly; }
                else if (t.type !== 'dynamic') {
                  const dayK = avgKwh * 0.65, nightK = avgKwh * 0.35;
                  let cons = t.kwh_night ? (dayK * t.kwh_day + nightK * t.kwh_night) : avgKwh * t.kwh_day;
                  if (t.kwh_tier2) { const t1 = Math.min(avgKwh, t.tier2_threshold || 500); const t2 = Math.max(0, avgKwh - (t.tier2_threshold || 500)); cons = t1 * t.kwh_day + t2 * t.kwh_tier2; }
                  const e = avgKwh * ERT, etm = avgKwh * ETMEAR, dim = cons * (parseFloat(dimotika) || 4.8) / 100;
                  tot = (cons + e + etm + dim + (t.fixed || 0)) * (1 + t.vat / 100);
                }
                const diff = calc ? (calc.total - tot) * 12 : 0;
                const tbc = bc(t.badge || '');
                return (
                  <tr key={t.id} onClick={() => { s('provider', p.value); s('tariffId', t.id); }} style={{ cursor: 'pointer', background: isCur ? 'rgba(212,175,66,0.08)' : 'transparent', transition: 'background 0.15s' }}>
                    <td style={{ padding: '8px', fontWeight: isCur ? 700 : 400, color: isCur ? 'var(--accent)' : 'var(--text-primary)', whiteSpace: 'nowrap' as const, fontFamily: T.font.sans }}>{p.label}{isCur && <span style={{ fontSize: 9, marginLeft: 4 }}>✓</span>}</td>
                    <td style={{ padding: '8px', color: 'var(--text-secondary)', fontSize: 10, fontFamily: T.font.sans }}>{t.name}</td>
                    <td style={{ padding: '6px 8px' }}><span style={{ fontSize: 8, fontWeight: 700, padding: '2px 8px', borderRadius: T.radius.badge, background: tbc.bg, color: tbc.color, border: `1px solid ${tbc.border}`, whiteSpace: 'nowrap' as const, fontFamily: T.font.sans }}>{t.badge}</span></td>
                    <td style={{ padding: '8px', fontFamily: T.font.mono, fontSize: 11 }}>{t.type === 'fixed_monthly' ? `${t.flat_monthly}€ flat` : t.type === 'dynamic' ? 'Ωριαίο' : t.kwh_day > 0 ? `${t.kwh_day.toFixed(4)} €` : '—'}</td>
                    <td style={{ padding: '8px', fontWeight: 600, color: isCur ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.mono, whiteSpace: 'nowrap' as const }}>{t.type === 'dynamic' ? '—' : fe(tot)}</td>
                    <td style={{ padding: '8px', color: 'var(--text-secondary)', fontFamily: T.font.mono, fontSize: 10, whiteSpace: 'nowrap' as const }}>{t.type === 'dynamic' ? '—' : fe(tot * 12)}</td>
                    <td style={{ padding: '8px', fontWeight: 700, color: isCur ? 'var(--text-tertiary)' : diff > 0 ? 'var(--positive)' : diff < 0 ? 'var(--negative)' : 'var(--text-tertiary)', fontFamily: T.font.mono, fontSize: 11 }}>{isCur ? 'Τρέχον' : t.type === 'dynamic' ? '—' : `${diff > 0 ? '+' : ''}${fe(diff)}`}</td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10, fontSize: 9, color: 'var(--text-tertiary)', padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: T.radius.badge, fontFamily: T.font.sans }}>
          Τιμές ενδεικτικές βάσει δημοσιευμένων τιμολογίων {LAST_UPDATED} — επαλήθευσε πάντα στον επίσημο ιστότοπο του παρόχου
        </div>
      </div>

      {/* VNM */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}/>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Virtual Net Metering — E.NA Ήρων</span>
          </div>
          <Toggle on={vnmEnabled} onChange={v => s('vnmEnabled', v)} label="Ενεργό" labelOff="Ανενεργό"/>
        </div>
        {!vnmEnabled ? (
          <div style={{ textAlign: 'center' as const, padding: '20px', color: 'var(--text-tertiary)', fontSize: 11, fontFamily: T.font.sans }}>
            <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.3 }}>☀</div>
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Ενεργοποίησε για υπολογισμό εξοικονόμησης</div>
            <div>Επενδύεις σε κοινό φωτοβολταϊκό — η ενέργεια συμψηφίζεται αυτόματα στον λογαριασμό σου.</div>
          </div>
        ) : (
          <>
            <div style={g3}>
              <NumberInput label="Κεφάλαιο Επένδυσης (€)"   value={vnmCapital}   onChange={v => s('vnmCapital', v)}   suffix="€"   step={500}/>
              <NumberInput label="Ισχύς που Αγοράζεις (kWp)" value={vnmKwp}       onChange={v => s('vnmKwp', v)}       suffix="kWp" step={0.5}/>
              <NumberInput label="Μερίδιο Παραγωγής %"        value={vnmSharedPct} onChange={v => s('vnmSharedPct', v)} suffix="%"   step={5}/>
            </div>
            {calc && parseFloat(vnmKwp) > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                {[
                  { label: 'Παραγωγή σου / έτος', value: `${calc.yourProd?.toFixed(0) || 0} kWh`, color: 'var(--positive)' },
                  { label: 'Εξοικονόμηση / μήνα', value: fe(calc.vnmMonthly || 0),                 color: 'var(--positive)' },
                  { label: 'Εξοικονόμηση / έτος',  value: fe((calc.vnmMonthly || 0) * 12),          color: 'var(--positive)' },
                  { label: 'Απόσβεση (χρόνια)',    value: calc.vnmPayback > 0 ? `${calc.vnmPayback.toFixed(1)} χρ` : '—', color: 'var(--text-primary)' },
                ].map((k, i) => (
                  <div key={i} style={{ background: 'rgba(52,168,83,0.06)', borderRadius: T.radius.inner, padding: '12px 14px', border: '1px solid rgba(52,168,83,0.2)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, marginBottom: 6, fontFamily: T.font.sans, fontWeight: 600 }}>{k.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: k.color, fontFamily: T.font.mono }}>{k.value}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Τελευταίος Λογαριασμός */}
      <div style={card}>
        {secHdr('Καταχώρηση Τελευταίου Λογαριασμού')}
        <div style={g2}>
          <NumberInput label="Ποσό Λογαριασμού (€)" value={lastBillAmount} onChange={v => s('lastBillAmount', v)} suffix="€"   step={1}/>
          <NumberInput label="Κατανάλωση (kWh)"      value={lastBillKwh}   onChange={v => s('lastBillKwh', v)}   suffix="kWh" step={10}/>
        </div>
        {lastBillAmount && lastBillKwh && parseFloat(lastBillKwh) > 0 && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '12px 14px', fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans, border: '1px solid var(--border-subtle)' }}>
            Πραγματικό κόστος: <strong style={{ color: 'var(--accent)', fontFamily: T.font.mono }}>{(parseFloat(lastBillAmount) / parseFloat(lastBillKwh)).toFixed(4)} €/kWh</strong> (συμπ. όλα τέλη)
            {calc && <span style={{ marginLeft: 14 }}>Εκτίμηση app: <strong style={{ color: 'var(--info)', fontFamily: T.font.mono }}>{(calc.total / calc.avgKwh).toFixed(4)} €/kWh</strong></span>}
          </div>
        )}
      </div>
    </div>
  );
}