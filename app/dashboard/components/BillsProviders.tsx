'use client';

import { useState } from 'react';
import { NumberInput, CustomSelect, TextInput, Toggle, DatePicker } from './UIComponents';
import { useBillsSettings } from './BillsSettings';

const T = {
  radius: { card: 14, inner: 10, badge: 6, btn: 10, pill: 100 },
  font: { sans: "Inter, 'Google Sans', sans-serif", mono: "'JetBrains Mono', monospace" },
};
const fe = (n: number, d = 2) => `${n.toLocaleString('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;

const INTERNET_PROVIDERS = [
  { value: 'cosmote',   label: 'Cosmote',   url: 'https://www.cosmote.gr',    color: '#009fe3' },
  { value: 'nova',      label: 'Nova',       url: 'https://www.nova.gr',       color: '#e4002b' },
  { value: 'vodafone',  label: 'Vodafone',   url: 'https://www.vodafone.gr',   color: '#e60000' },
  { value: 'inalan',    label: 'Inalan',     url: 'https://www.inalan.gr',     color: '#0073ff' },
  { value: 'enterwave', label: 'Enterwave',  url: 'https://www.enterwave.gr',  color: '#f59e0b' },
  { value: 'hol',       label: 'HOL',        url: 'https://www.hol.gr',        color: '#f97316' },
  { value: 'cyta',      label: 'Cyta',       url: 'https://www.cyta.gr',       color: '#003da5' },
  { value: 'wind',      label: 'Wind',       url: 'https://www.wind.com.gr',   color: '#7c3aed' },
  { value: 'other',     label: 'Άλλος',      url: '',                           color: '#94a3b8' },
];

const INTERNET_PLANS: Record<string, { id: string; name: string; speed: string; price: number; hasPhone: boolean; note: string; contract?: string }[]> = {
  cosmote: [
    { id: 'c_fiber100',  name: 'Fiber 100',  speed: '100/50 Mbps',   price: 27.90, hasPhone: true,  note: 'Οπτική ίνα FTTH',    contract: '24μ' },
    { id: 'c_fiber200',  name: 'Fiber 200',  speed: '200/100 Mbps',  price: 33.90, hasPhone: true,  note: 'Οπτική ίνα FTTH',    contract: '24μ' },
    { id: 'c_fiber500',  name: 'Fiber 500',  speed: '500/200 Mbps',  price: 37.90, hasPhone: false, note: 'Internet μόνο',       contract: '24μ' },
    { id: 'c_fiber1000', name: 'Fiber 1Gbps',speed: '1 Gbps FTTH',   price: 45.90, hasPhone: false, note: 'Internet μόνο',       contract: '24μ' },
  ],
  nova: [
    { id: 'n_fiber100',  name: 'Nova Fiber 100',  speed: '100/50 Mbps',  price: 24.90, hasPhone: true,  note: 'FTTH + τηλεφωνία', contract: '24μ' },
    { id: 'n_fiber300',  name: 'Nova Fiber 300',  speed: '300/150 Mbps', price: 27.90, hasPhone: true,  note: 'FTTH + τηλεφωνία', contract: '24μ' },
    { id: 'n_fiber600',  name: 'Nova Fiber 600',  speed: '600/300 Mbps', price: 32.90, hasPhone: true,  note: 'FTTH + τηλεφωνία', contract: '24μ' },
    { id: 'n_fiber1000', name: 'Nova Fiber 1Gbps',speed: '1 Gbps FTTH',  price: 37.90, hasPhone: true,  note: 'FTTH + τηλεφωνία', contract: '24μ' },
  ],
  vodafone: [
    { id: 'v_ff300',  name: 'Full Fiber 300',  speed: '300/150 Mbps', price: 35.00, hasPhone: true,  note: 'FTTH + τηλεφωνία', contract: '24μ' },
    { id: 'v_ff500',  name: 'Full Fiber 500',  speed: '500/200 Mbps', price: 42.00, hasPhone: true,  note: 'FTTH + τηλεφωνία', contract: '24μ' },
    { id: 'v_ff1000', name: 'Full Fiber 1Gbps',speed: '1 Gbps FTTH',  price: 49.00, hasPhone: true,  note: 'FTTH + τηλεφωνία', contract: '24μ' },
  ],
  dei: [
    { id: 'dei_f500',  name: 'ΔΕΗ Fiber 500',    speed: '500 Mbps',   price: 17.90, hasPhone: false, note: 'Φθηνότερο στην αγορά', contract: '24μ' },
    { id: 'dei_f1000', name: 'ΔΕΗ Fiber 1Gbps',  speed: '1 Gbps',     price: 24.90, hasPhone: false, note: 'Νέος πάροχος 2026',   contract: '24μ' },
    { id: 'dei_f2500', name: 'ΔΕΗ Fiber 2.5Gbps',speed: '2.5 Gbps',   price: 52.90, hasPhone: false, note: 'Ultra γρήγορο',       contract: '24μ' },
  ],
  inalan: [
    { id: 'i_100',  name: 'Inalan Fiber 100', speed: '100 Mbps Symmetric', price: 17.90, hasPhone: false, note: 'Χωρίς δέσμευση' },
    { id: 'i_500',  name: 'Inalan Fiber 500', speed: '500 Mbps Symmetric', price: 22.90, hasPhone: false, note: 'Χωρίς δέσμευση' },
    { id: 'i_1000', name: 'Inalan Fiber 1G',  speed: '1 Gbps Symmetric',   price: 27.90, hasPhone: false, note: 'Χωρίς δέσμευση' },
  ],
  enterwave: [
    { id: 'ew_100', name: 'Enterwave 100', speed: '100 Mbps', price: 16.90, hasPhone: false, note: 'FTTH Αθήνα/Θεσσαλονίκη' },
    { id: 'ew_500', name: 'Enterwave 500', speed: '500 Mbps', price: 21.90, hasPhone: false, note: 'FTTH Αθήνα/Θεσσαλονίκη' },
  ],
  cyta: [
    { id: 'cy_100',  name: 'CytaFiber 100', speed: '100 Mbps',  price: 18.90, hasPhone: true,  note: 'Διετία', contract: '24μ' },
    { id: 'cy_500',  name: 'CytaFiber 500', speed: '500 Mbps',  price: 24.90, hasPhone: true,  note: 'Διετία', contract: '24μ' },
    { id: 'cy_1000', name: 'CytaFiber 1G',  speed: '1 Gbps',    price: 29.90, hasPhone: true,  note: 'Διετία', contract: '24μ' },
  ],
  hol: [
    { id: 'h_basic', name: 'HOL Fiber 100', speed: '100/50 Mbps',  price: 19.90, hasPhone: true, note: 'Διετία', contract: '24μ' },
    { id: 'h_plus',  name: 'HOL Fiber 500', speed: '500/200 Mbps', price: 24.90, hasPhone: true, note: 'Διετία', contract: '24μ' },
  ],
};
const WATER_PROVIDERS = [
  { value: 'eydap', label: 'ΕΥΔΑΠ (Αττική)',         url: 'https://www.eydap.gr',  color: '#06b6d4' },
  { value: 'eyath', label: 'ΕΥΑΘ (Θεσσαλονίκη)',     url: 'https://www.eyath.gr',  color: '#0ea5e9' },
  { value: 'local', label: 'Τοπική ΔΕΥΑ',             url: '',                       color: '#38bdf8' },
];

const GAS_PROVIDERS = [
  { value: 'eda_attikis', label: 'ΕΔΑ Αττικής',   url: 'https://www.edaattikis.gr', color: '#f97316' },
  { value: 'eda_thess',   label: 'ΕΔΑ Θεσσαλίας', url: 'https://www.edathess.gr',   color: '#fb923c' },
  { value: 'heron',       label: 'Ήρων',           url: 'https://www.heron.gr',      color: '#e85d04' },
  { value: 'protergia',   label: 'Protergia',       url: 'https://www.protergia.gr', color: '#7c3aed' },
  { value: 'volterra',    label: 'Volterra',        url: 'https://www.volterra.gr',  color: '#059669' },
];

const HEATING_TYPES = [
  { value: 'autonomous_gas',       label: 'Αυτόνομη Φυσικού Αερίου' },
  { value: 'autonomous_oil',       label: 'Αυτόνομη Πετρελαίου'     },
  { value: 'autonomous_heat_pump', label: 'Αντλία Θερμότητας'        },
  { value: 'autonomous_ac',        label: 'Κλιματιστικό'              },
  { value: 'autonomous_pellet',    label: 'Pellet'                    },
  { value: 'autonomous_wood',      label: 'Ξύλα / Τζάκι'             },
  { value: 'central_gas',          label: 'Κεντρική Φυσικού Αερίου'  },
  { value: 'central_oil',          label: 'Κεντρική Πετρελαίου'      },
  { value: 'district',             label: 'Τηλεθέρμανση'              },
];

const SECURITY_COMPANIES = [
  { value: 'eltrak',    label: 'Eltrak',    url: 'https://www.eltrak.gr',        color: '#dc2626' },
  { value: 'g4s',       label: 'G4S',       url: 'https://www.g4s.com/gr-gr',    color: '#166534' },
  { value: 'vaninfo',   label: 'Vaninfo',   url: 'https://www.vaninfo.gr',       color: '#1d4ed8' },
  { value: 'dsp',       label: 'DSP',       url: 'https://www.dsp.gr',           color: '#0f172a' },
  { value: 'securitas', label: 'Securitas', url: 'https://www.securitas.com/gr', color: '#b91c1c' },
  { value: 'other',     label: 'Άλλη',      url: '',                              color: '#64748b' },
];

const BENCHMARKS = {
  internet: { avg: 22.50, label: 'Μ.Ο. Ελλάδας'              },
  water:    { avg: 12.00, label: 'Μ.Ο. Αττικής — ~24 € / 2μ' },
  heating:  { avg: 70.00, label: 'Μ.Ο. χειμώνα'               },
  gas:      { avg: 40.00, label: 'Μ.Ο. οικιακό'               },
  security: { avg: 18.00, label: 'Μ.Ο. αγοράς'                },
};

const DEFAULTS = {
  internetProvider: 'cosmote', internetPlanId: '', internetPlan: '',
  internetSpeed: '', internetPrice: '', internetPhone: false,
  internetContractEnd: '', internetSpeedReal: '',
  phoneLocal: true, phoneMobile: false, phoneIntl: false, phoneVoip: false, phoneNotes: '',
  // FIX: "Συνδρομητική Τηλεόραση" label
  hasTV: false, tvProvider: 'cosmote', tvPlan: '', tvPrice: '', tvHasSports: false,
  waterProvider: 'eydap', waterBiMonthly: '', waterMonthly: '', waterPersons: '2',
  heatingType: 'autonomous_gas', heatingMonthly: '',
  heatingLitersPerYear: '', heatingOilPricePerLiter: '1.20',
  heatingKgPellet: '', heatingPelletPrice: '0.38',
  heatingCentralShare: '',
  gasProvider: 'eda_attikis', gasPlan: '', gasMonthly: '',
  securityCompany: 'other', securityPlan: '', securityMonthly: '',
  securityHasRemote: false, securityHasCamera: false, securityHasDoor: false,
  dimotika: '4.8', dimotikaCalcCons: '', dimotikaCalcAmount: '',
};

interface Props { propertyId: string; userId?: string; }

export default function BillsProviders({ propertyId, userId = '' }: Props) {
  const [s, upd, loading] = useBillsSettings(propertyId, userId, 'providers', DEFAULTS);

  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 };
  const g2: React.CSSProperties   = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 };
  const g3: React.CSSProperties   = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 };
  const g4: React.CSSProperties   = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, marginBottom: 14 };

  const internetCost = parseFloat(s.internetPrice) || 0;
  const tvCost       = s.hasTV ? (parseFloat(s.tvPrice) || 0) : 0;
  const waterM       = s.waterBiMonthly ? (parseFloat(s.waterBiMonthly) || 0) / 2 : (parseFloat(s.waterMonthly) || 0);
  const heatingM     = (() => {
    if (s.heatingType === 'autonomous_oil' && s.heatingLitersPerYear)
      return (parseFloat(s.heatingLitersPerYear) * parseFloat(s.heatingOilPricePerLiter)) / 12;
    if (s.heatingType === 'autonomous_pellet' && s.heatingKgPellet)
      return (parseFloat(s.heatingKgPellet) * parseFloat(s.heatingPelletPrice)) / 12;
    return parseFloat(s.heatingMonthly) || 0;
  })();
  const gasM      = parseFloat(s.gasMonthly)      || 0;
  const securityM = parseFloat(s.securityMonthly) || 0;
  const totalM    = internetCost + tvCost + waterM + heatingM + gasM + securityM;

  const provData     = INTERNET_PROVIDERS.find(p => p.value === s.internetProvider);
  const planOptions  = (INTERNET_PLANS[s.internetProvider] || []).map(p => ({ value: p.id, label: `${p.name} — ${p.speed} — ${p.price.toFixed(2)} €/μήνα` }));
  const selectedPlan = (INTERNET_PLANS[s.internetProvider] || []).find(p => p.id === s.internetPlanId);
  const secData      = SECURITY_COMPANIES.find(c => c.value === s.securityCompany);
  const waterData    = WATER_PROVIDERS.find(p => p.value === s.waterProvider);
  const gasData      = GAS_PROVIDERS.find(p => p.value === s.gasProvider);

  const secHdr = (label: string, link?: { url: string; text: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}/>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans, flex: 1 }}>{label}</span>
      {link?.url && (
        <a href={link.url} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 10, color: 'var(--info)', textDecoration: 'none', fontWeight: 600, fontFamily: T.font.sans, background: 'rgba(26,115,232,0.06)', border: '1px solid rgba(26,115,232,0.18)', borderRadius: T.radius.pill, padding: '3px 10px', whiteSpace: 'nowrap' as const }}>
          {link.text}
        </a>
      )}
    </div>
  );

  const benchmarkBar = (current: number, avg: number, label: string) => {
    if (!current || !avg) return null;
    const pct   = Math.min((current / (avg * 2)) * 100, 100);
    const isHigh = current > avg * 1.15;
    const isLow  = current < avg * 0.85;
    return (
      <div style={{ marginTop: 10, background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '10px 14px', border: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 10, fontFamily: T.font.sans }}>
          <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
          <span style={{ fontWeight: 700, fontFamily: T.font.mono, color: isHigh ? 'var(--negative)' : isLow ? 'var(--positive)' : 'var(--text-primary)' }}>
            {isHigh ? `+${((current / avg - 1) * 100).toFixed(0)}% πάνω από μ.ο.` : isLow ? `-${((1 - current / avg) * 100).toFixed(0)}% κάτω από μ.ο.` : 'Στο μέσο όρο'}
          </span>
        </div>
        <div style={{ position: 'relative', height: 6, background: 'var(--bg-overlay)', borderRadius: 3 }}>
          <div style={{ position: 'absolute', left: '50%', top: -3, width: 2, height: 12, background: 'var(--text-tertiary)', borderRadius: 1 }}/>
          <div style={{ height: '100%', width: `${pct}%`, background: isHigh ? 'var(--negative)' : isLow ? 'var(--positive)' : 'var(--accent)', borderRadius: 3 }}/>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
          <span>0 €</span><span style={{ color: 'var(--text-secondary)' }}>μ.ο. {avg} €</span><span>{(avg * 2).toFixed(0)} €</span>
        </div>
      </div>
    );
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans }}>Φόρτωση...</div>;

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Internet & TV',                   value: fe(internetCost + tvCost), accent: false },
          { label: 'Νερό & Θέρμανση',                 value: fe(waterM + heatingM),     accent: false },
          { label: 'Φυσικό Αέριο & Security',          value: fe(gasM + securityM),      accent: false },
          { label: 'Σύνολο Παρόχων / μήνα',           value: fe(totalM),                accent: totalM > 0 },
        ].map((k, i) => (
          <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.accent ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.mono, lineHeight: 1 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* ── Δημοτικά Τέλη ─────────────────────────────────────────────────
          FIX: compact result — inline pill, not a large box
      ─────────────────────────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, marginBottom: 16 }}>
        {secHdr('Δημοτικά Τέλη — Υπολογισμός Ποσοστού')}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 12 }}>
          <NumberInput
            label="Ποσοστό % (αν το γνωρίζεις)"
            value={s.dimotika}
            onChange={v => upd({ dimotika: v })}
            suffix="%" step={0.1}
          />
          <NumberInput
            label="Κατανάλωση λογαριασμού ρεύματος (€)"
            value={s.dimotikaCalcCons}
            onChange={v => upd({ dimotikaCalcCons: v })}
            suffix="€" step={1}
          />
          <NumberInput
            label="Δημοτικά Τέλη στον λογαριασμό (€)"
            value={s.dimotikaCalcAmount}
            onChange={v => upd({ dimotikaCalcAmount: v })}
            suffix="€" step={0.5}
          />
        </div>

        {/* FIX: compact result row — no big box, just a clean info strip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
          {/* Active % pill */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: s.dimotika ? 'rgba(26,115,232,0.07)' : 'var(--bg-base)', border: `1px solid ${s.dimotika ? 'rgba(26,115,232,0.2)' : 'var(--border-subtle)'}`, borderRadius: T.radius.inner, padding: '8px 14px' }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--info)', fontFamily: T.font.mono, lineHeight: 1 }}>
              {s.dimotika ? `${s.dimotika}%` : '—'}
            </span>
            <div>
              <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans }}>Ενεργό ποσοστό</div>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Αθήνα: ~5% · Τυπικό: 3–6%</div>
            </div>
          </div>

          {/* Apply button — only when calc fields are filled */}
          {s.dimotikaCalcCons && s.dimotikaCalcAmount && parseFloat(s.dimotikaCalcCons) > 0 && (
            <button
              onClick={() => upd({ dimotika: (parseFloat(s.dimotikaCalcAmount) / parseFloat(s.dimotikaCalcCons) * 100).toFixed(1) })}
              style={{ background: 'var(--info)', color: '#fff', border: 'none', borderRadius: T.radius.btn, padding: '8px 16px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans, whiteSpace: 'nowrap' as const }}>
              Εφαρμογή {(parseFloat(s.dimotikaCalcAmount) / parseFloat(s.dimotikaCalcCons) * 100).toFixed(1)}%
            </button>
          )}
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
            Χρησιμοποιείται αυτόματα στον υπολογισμό ρεύματος (tab Ρεύμα).
          </span>
        </div>
      </div>

      {/* ── Internet & Σταθερό Τηλέφωνο ──────────────────────────────────── */}
      <div style={card}>
        {secHdr('Internet & Σταθερό Τηλέφωνο', { url: 'https://www.eett.gr/opencms/opencms/EETT/Electronic_Communications/Market360/', text: 'ΕΕΤΤ 360° Σύγκριση →' })}
        <div style={g4}>
          <CustomSelect label="Πάροχος" value={s.internetProvider}
            onChange={v => upd({ internetProvider: v, internetPlanId: '', internetPrice: '', internetSpeed: '' })}
            options={INTERNET_PROVIDERS.map(p => ({ value: p.value, label: p.label }))}/>
          {planOptions.length > 0 ? (
            <CustomSelect label="Πρόγραμμα (επίσημες τιμές)" value={s.internetPlanId}
              onChange={v => {
                const plan = (INTERNET_PLANS[s.internetProvider] || []).find(p => p.id === v);
                upd({ internetPlanId: v, internetPlan: plan?.name || '', internetSpeed: plan?.speed || '', internetPrice: plan ? String(plan.price) : '', internetPhone: plan?.hasPhone || false });
              }}
              options={[{ value: '', label: '— Επιλογή προγράμματος —' }, ...planOptions]}/>
          ) : (
            <TextInput label="Ονομασία Προγράμματος" value={s.internetPlan} onChange={v => upd({ internetPlan: v })} placeholder="π.χ. Fiber 500"/>
          )}
          <TextInput   label="Ταχύτητα"            value={s.internetSpeed} onChange={v => upd({ internetSpeed: v })} placeholder="π.χ. 500/200 Mbps"/>
          <NumberInput label="Μηνιαίο Κόστος (€)"  value={s.internetPrice} onChange={v => upd({ internetPrice: v })} suffix="€" step={1}/>
        </div>

        {selectedPlan && (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '11px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, fontFamily: T.font.sans }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--info)', flexShrink: 0 }}/>
            <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{selectedPlan.note} · {selectedPlan.hasPhone ? 'Περιλαμβάνει σταθερό τηλέφωνο' : 'Χωρίς σταθερό τηλέφωνο'}</span>
            {provData?.url && (
              <a href={provData.url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 10, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, fontFamily: T.font.sans, whiteSpace: 'nowrap' as const }}>
                Επίσημη σελίδα {provData.label} →
              </a>
            )}
          </div>
        )}

        <div style={g3}>
          <DatePicker  label="Λήξη Συμβολαίου"                      value={s.internetContractEnd || ''} onChange={v => upd({ internetContractEnd: v })}/>
          <NumberInput label="Πραγματική Ταχύτητα Download (Mbps)"   value={s.internetSpeedReal || ''}  onChange={v => upd({ internetSpeedReal: v })} suffix="Mbps" step={10}/>
          <div style={{ display: 'flex', flexDirection: 'column' as const, justifyContent: 'flex-end', paddingBottom: 2 }}>
            {s.internetSpeedReal && s.internetSpeed && (() => {
              const pct = parseFloat(s.internetSpeed) > 0 ? Math.round((parseFloat(s.internetSpeedReal) / parseFloat(s.internetSpeed)) * 100) : 0;
              const good = pct >= 80;
              return (
                <div style={{ background: good ? 'rgba(52,168,83,0.07)' : 'rgba(242,153,0,0.07)', border: `1px solid ${good ? 'rgba(52,168,83,0.25)' : 'rgba(242,153,0,0.25)'}`, borderRadius: T.radius.inner, padding: '10px 14px' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: good ? 'var(--positive)' : 'var(--warning)', fontFamily: T.font.mono }}>{pct}%</div>
                  <div style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans }}>{good ? 'Καλή απόδοση' : 'Μειωμένη ταχύτητα'}</div>
                </div>
              );
            })()}
            {(!s.internetSpeedReal || !s.internetSpeed) && (
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
                Μέτρησε στο{' '}<a href="https://www.speedtest.net" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>speedtest.net</a>
              </div>
            )}
          </div>
        </div>

        {/* Contract renewal alert */}
        {s.internetContractEnd && (() => {
          const days = Math.ceil((new Date(s.internetContractEnd).getTime() - Date.now()) / 86400000);
          if (days > 90 || days < 0) return null;
          return (
            <div style={{ background: days <= 14 ? 'rgba(197,34,31,0.07)' : 'rgba(242,153,0,0.07)', border: `1px solid ${days <= 14 ? 'rgba(197,34,31,0.25)' : 'rgba(242,153,0,0.25)'}`, borderRadius: T.radius.inner, padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, fontFamily: T.font.sans }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: days <= 14 ? 'var(--negative)' : 'var(--warning)', flexShrink: 0 }}/>
              <span style={{ color: 'var(--text-secondary)' }}>
                Λήξη συμβολαίου Internet σε{' '}
                <strong style={{ color: days <= 14 ? 'var(--negative)' : 'var(--warning)' }}>{days} ημέρες</strong>
                {' '}— Σύγκρινε στο ΕΕΤΤ 360° για καλύτερη τιμή.
              </span>
            </div>
          );
        })()}

        <div style={{ marginBottom: 12 }}>
          <Toggle on={s.internetPhone} onChange={v => upd({ internetPhone: v })} label="Περιλαμβάνει Σταθερό Τηλέφωνο" labelOff="Χωρίς Σταθερό Τηλέφωνο"/>
        </div>

        {s.internetPhone && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: 14, marginBottom: 12, border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>Τι περιλαμβάνει το σταθερό τηλέφωνο</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 10 }}>
              {[
                { key: 'phoneLocal',  label: 'Απεριόριστες κλήσεις εντός', val: s.phoneLocal  },
                { key: 'phoneMobile', label: 'Κλήσεις σε κινητά',          val: s.phoneMobile },
                { key: 'phoneIntl',   label: 'Διεθνείς κλήσεις',           val: s.phoneIntl   },
                { key: 'phoneVoip',   label: 'VoIP / App',                  val: s.phoneVoip   },
              ].map(f => (
                <div key={f.key} onClick={() => upd({ [f.key]: !f.val } as any)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: f.val ? 'rgba(52,168,83,0.08)' : 'var(--bg-base)', border: `1px solid ${f.val ? 'var(--positive)' : 'var(--border-subtle)'}`, borderRadius: T.radius.btn, padding: '7px 14px', cursor: 'pointer', transition: 'all 0.15s' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: f.val ? 'var(--positive)' : 'var(--border-default)', flexShrink: 0 }}/>
                  <span style={{ fontSize: 11, color: f.val ? 'var(--positive)' : 'var(--text-secondary)', fontWeight: f.val ? 600 : 400, fontFamily: T.font.sans }}>{f.label}</span>
                </div>
              ))}
            </div>
            <TextInput label="Σημειώσεις πακέτου" value={s.phoneNotes} onChange={v => upd({ phoneNotes: v })} placeholder="π.χ. 100 λεπτά διεθνή, αποκλείονται premium..."/>
          </div>
        )}

        {(INTERNET_PLANS[s.internetProvider] || []).length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>Διαθέσιμα Προγράμματα {provData?.label}</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 500 }}>
                <thead>
                  <tr>{['Πρόγραμμα','Ταχύτητα','Σταθερό Τηλέφωνο','Δέσμευση','Μηνιαίο','Ετήσιο'].map((h, i) => (
                    <th key={i} style={{ fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: 'var(--text-secondary)', padding: '6px 10px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontWeight: 600, fontFamily: T.font.sans, background: 'var(--bg-elevated)', whiteSpace: 'nowrap' as const }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {(INTERNET_PLANS[s.internetProvider] || []).map(plan => {
                    const isCur = plan.id === s.internetPlanId;
                    return (
                      <tr key={plan.id}
                        onClick={() => upd({ internetPlanId: plan.id, internetPlan: plan.name, internetSpeed: plan.speed, internetPrice: String(plan.price), internetPhone: plan.hasPhone })}
                        style={{ cursor: 'pointer', background: isCur ? 'rgba(212,175,66,0.08)' : 'transparent', transition: 'background 0.15s' }}>
                        <td style={{ padding: '7px 10px', fontWeight: isCur ? 700 : 400, color: isCur ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.sans }}>{plan.name}{isCur ? ' ✓' : ''}</td>
                        <td style={{ padding: '7px 10px', color: 'var(--text-secondary)', fontFamily: T.font.mono, fontSize: 10 }}>{plan.speed}</td>
                        <td style={{ padding: '7px 10px', color: plan.hasPhone ? 'var(--positive)' : 'var(--text-tertiary)', fontWeight: 700, textAlign: 'center' as const }}>{plan.hasPhone ? '✓' : '—'}</td>
                        <td style={{ padding: '7px 10px', color: 'var(--text-tertiary)', fontSize: 10, fontFamily: T.font.sans }}>{plan.note}</td>
                        <td style={{ padding: '7px 10px', fontWeight: 600, color: isCur ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.mono, whiteSpace: 'nowrap' as const }}>{fe(plan.price)}</td>
                        <td style={{ padding: '7px 10px', color: 'var(--text-tertiary)', fontFamily: T.font.mono, fontSize: 10, whiteSpace: 'nowrap' as const }}>{fe(plan.price * 12)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {benchmarkBar(internetCost, BENCHMARKS.internet.avg, BENCHMARKS.internet.label)}

        {/* FIX: "Συνδρομητική Τηλεόραση" (was "PAY TV") */}
        <div style={{ marginTop: 16, borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}/>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--text-secondary)', fontFamily: T.font.sans, flex: 1 }}>Συνδρομητική Τηλεόραση</span>
            <Toggle on={s.hasTV} onChange={v => upd({ hasTV: v })} label="Ενεργό" labelOff="Δεν έχω"/>
          </div>
          {s.hasTV && (
            <>
              {/* FIX: 3 cols + separate toggle row — avoids Sports Package label truncation */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 12 }}>
                <CustomSelect label="Πάροχος" value={s.tvProvider} onChange={v => upd({ tvProvider: v })}
                  options={[{ value: 'cosmote', label: 'Cosmote TV' },{ value: 'nova', label: 'Nova / EON' },{ value: 'skyshowtime', label: 'SkyShowtime' },{ value: 'other', label: 'Άλλος' }]}/>
                <TextInput   label="Πρόγραμμα / Πακέτο"  value={s.tvPlan}  onChange={v => upd({ tvPlan: v })}  placeholder="π.χ. Cosmote TV Start"/>
                <NumberInput label="Μηνιαίο Κόστος (€)"   value={s.tvPrice} onChange={v => upd({ tvPrice: v })} suffix="€" step={1}/>
              </div>
              <Toggle on={s.tvHasSports} onChange={v => upd({ tvHasSports: v })} label="Sports Package ενεργό" labelOff="Χωρίς Sports Package"/>
            </>
          )}
        </div>
      </div>

      {/* ── Νερό ─────────────────────────────────────────────────────────── */}
      <div style={card}>
        {secHdr('Νερό')}
        {/* FIX: 2+2 layout — prevents label overflow on narrow screens */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <CustomSelect label="Πάροχος" value={s.waterProvider}  onChange={v => upd({ waterProvider: v })}  options={WATER_PROVIDERS.map(p => ({ value: p.value, label: p.label }))}/>
          <NumberInput  label="Διμηνιαίος Λογαριασμός (€)" value={s.waterBiMonthly}
            onChange={v => upd({ waterBiMonthly: v, waterMonthly: v ? String(((parseFloat(v) || 0) / 2).toFixed(2)) : '' })}
            suffix="€" step={5}/>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <NumberInput  label="Μηνιαία Αναγωγή (€)"   value={s.waterMonthly}  onChange={v => upd({ waterMonthly: v })}  suffix="€"      step={2}/>
          <NumberInput  label="Άτομα στο ακίνητο"      value={s.waterPersons}  onChange={v => upd({ waterPersons: v })}  suffix="άτομα"  step={1}/>
        </div>
        {waterM > 0 && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '10px 14px', fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans, border: '1px solid var(--border-subtle)' }}>
            Μηνιαίο: <strong style={{ color: 'var(--text-primary)', fontFamily: T.font.mono }}>{fe(waterM)}</strong>
            {s.waterPersons && parseInt(s.waterPersons) > 0 && (
              <span style={{ marginLeft: 14 }}>Ανά άτομο: <strong style={{ fontFamily: T.font.mono }}>{fe(waterM / parseInt(s.waterPersons))}</strong> / μήνα</span>
            )}
            {waterData?.url && <a href={waterData.url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 14, fontSize: 10, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Επίσημη σελίδα {waterData.label} →</a>}
          </div>
        )}
        {benchmarkBar(waterM * 2, 24, BENCHMARKS.water.label)}
      </div>

      {/* ── Θέρμανση ─────────────────────────────────────────────────────── */}
      <div style={card}>
        {secHdr('Θέρμανση')}
        <div style={g3}>
          <CustomSelect label="Τύπος Θέρμανσης" value={s.heatingType} onChange={v => upd({ heatingType: v })} options={HEATING_TYPES}/>
          {['autonomous_gas','central_gas','district','autonomous_heat_pump','autonomous_ac','autonomous_wood'].includes(s.heatingType) && (
            <NumberInput label="Μέσο Μηνιαίο Κόστος (€)" value={s.heatingMonthly} onChange={v => upd({ heatingMonthly: v })} suffix="€" step={5}/>
          )}
          {s.heatingType === 'autonomous_oil' && (
            <><NumberInput label="Λίτρα / έτος"     value={s.heatingLitersPerYear}    onChange={v => upd({ heatingLitersPerYear: v })}    suffix="L"   step={50}/><NumberInput label="Τιμή / λίτρο (€)" value={s.heatingOilPricePerLiter} onChange={v => upd({ heatingOilPricePerLiter: v })} suffix="€" step={0.01}/></>
          )}
          {s.heatingType === 'autonomous_pellet' && (
            <><NumberInput label="Kg / έτος"     value={s.heatingKgPellet}    onChange={v => upd({ heatingKgPellet: v })}    suffix="kg" step={50}/><NumberInput label="Τιμή / kg (€)" value={s.heatingPelletPrice} onChange={v => upd({ heatingPelletPrice: v })} suffix="€" step={0.01}/></>
          )}
          {['central_oil','central_gas'].includes(s.heatingType) && (
            <NumberInput label="Μερίδιο Ιδιοκτησίας %" value={s.heatingCentralShare} onChange={v => upd({ heatingCentralShare: v })} suffix="%" step={1}/>
          )}
        </div>
        {heatingM > 0 && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '12px 16px', border: '1px solid var(--border-subtle)', marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' as const, marginBottom: 6 }}>
              {[{ label: 'Μέσο Μηνιαίο', value: fe(heatingM) },{ label: 'Εκτ. Ετήσιο', value: fe(heatingM * 12) }].map((k, i) => (
                <div key={i}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, marginBottom: 4, fontFamily: T.font.sans }}>{k.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono }}>{k.value}</div>
                </div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 8, fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
              Μ.Ο.: Φυσικό αέριο ~0.08 €/kWh · Πετρέλαιο ~0.10 €/kWh · Αντλία θερμότητας ~0.06 €/kWh — 2026
            </div>
          </div>
        )}
        {benchmarkBar(heatingM, BENCHMARKS.heating.avg, BENCHMARKS.heating.label)}
      </div>

      {/* ── Φυσικό Αέριο ─────────────────────────────────────────────────── */}
      <div style={card}>
        {secHdr('Φυσικό Αέριο', { url: 'https://energycost.gr', text: 'ΡΑΑΕΥ energycost.gr →' })}
        <div style={g3}>
          <CustomSelect label="Πάροχος Φυσικού Αερίου" value={s.gasProvider} onChange={v => upd({ gasProvider: v })} options={GAS_PROVIDERS.map(p => ({ value: p.value, label: p.label }))}/>
          <TextInput    label="Πρόγραμμα"               value={s.gasPlan}    onChange={v => upd({ gasPlan: v })}    placeholder="π.χ. Οικιακό Σταθερό"/>
          <NumberInput  label="Μηνιαίο Κόστος (€)"     value={s.gasMonthly} onChange={v => upd({ gasMonthly: v })} suffix="€" step={5}/>
        </div>
        {gasM > 0 && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '10px 14px', fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans, border: '1px solid var(--border-subtle)' }}>
            Ετήσιο κόστος φυσικού αερίου: <strong style={{ color: 'var(--text-primary)', fontFamily: T.font.mono }}>{fe(gasM * 12)}</strong>
            {gasData?.url && <a href={gasData.url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 14, fontSize: 10, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Επίσημη σελίδα {gasData.label} →</a>}
          </div>
        )}
        {benchmarkBar(gasM, BENCHMARKS.gas.avg, BENCHMARKS.gas.label)}
      </div>

      {/* ── Security & Συναγερμός ─────────────────────────────────────────── */}
      <div style={card}>
        {secHdr('Security & Συναγερμός')}
        <div style={g3}>
          <CustomSelect label="Εταιρεία"            value={s.securityCompany}  onChange={v => upd({ securityCompany: v })}  options={SECURITY_COMPANIES.map(c => ({ value: c.value, label: c.label }))}/>
          <TextInput    label="Πρόγραμμα / Πακέτο" value={s.securityPlan}    onChange={v => upd({ securityPlan: v })}    placeholder="π.χ. Basic Monitor"/>
          <NumberInput  label="Μηνιαίο Κόστος (€)" value={s.securityMonthly} onChange={v => upd({ securityMonthly: v })} suffix="€" step={2}/>
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' as const, marginBottom: 12 }}>
          <Toggle on={s.securityHasRemote} onChange={v => upd({ securityHasRemote: v })} label="Τηλεχειρισμός μέσω App" labelOff="Χωρίς τηλεχειρισμό"/>
          <Toggle on={s.securityHasCamera} onChange={v => upd({ securityHasCamera: v })} label="Κάμερες"                 labelOff="Χωρίς κάμερες"/>
          <Toggle on={s.securityHasDoor}   onChange={v => upd({ securityHasDoor: v })}   label="Αυτόματη Πόρτα"         labelOff="Χωρίς αυτόματη πόρτα"/>
        </div>
        {securityM > 0 && secData?.url && (
          <a href={secData.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, fontFamily: T.font.sans }}>
            Επίσημη σελίδα {secData.label} →
          </a>
        )}
        {benchmarkBar(securityM, BENCHMARKS.security.avg, BENCHMARKS.security.label)}
      </div>

      {/* ── Σύνοψη Παρόχων ───────────────────────────────────────────────── */}
      {totalM > 0 && (
        <div style={card}>
          {secHdr('Σύνοψη Παρόχων')}
          {[
            { label: 'Internet',               amount: internetCost, skip: !internetCost },
            { label: s.tvProvider === 'cosmote' ? 'Cosmote TV' : 'Συνδρομητική TV', amount: tvCost, skip: !s.hasTV },
            { label: 'Νερό',                   amount: waterM,       skip: !waterM      },
            { label: 'Θέρμανση',               amount: heatingM,     skip: !heatingM    },
            { label: 'Φυσικό Αέριο',           amount: gasM,         skip: !gasM        },
            { label: 'Security',               amount: securityM,    skip: !securityM   },
          ].filter(r => !r.skip && r.amount > 0).map((r, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{r.label}</span>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.mono }}>{fe(r.amount)} / μήνα</span>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 12, fontFamily: T.font.mono }}>{fe(r.amount * 12)} / έτος</span>
                </div>
              </div>
              <div style={{ height: 4, background: 'var(--bg-overlay)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${totalM > 0 ? (r.amount / totalM) * 100 : 0}%`, background: 'var(--accent)', borderRadius: 2 }}/>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid var(--border-subtle)', marginTop: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: T.font.sans }}>Σύνολο Παρόχων</span>
            <div style={{ textAlign: 'right' as const }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono }}>{fe(totalM)} / μήνα</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.mono }}>{fe(totalM * 12)} / έτος</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}