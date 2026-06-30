'use client';

import { useState, useMemo, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NumberInput, CustomSelect, Toggle, DatePicker } from './UIComponents';
import { useBillsSettings } from './BillsSettings';

const fe = (n: number, d = 2) => `${n.toLocaleString('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
const fk = (n: number) => `${n.toFixed(4)} €`;
const LAST_UPDATED = 'Ιούνιος 2026';

const T = {
  radius: { card: 14, inner: 10, badge: 6, btn: 10, pill: 100 },
  font: { sans: "Inter, 'Google Sans', sans-serif", mono: "'JetBrains Mono', monospace" },
};

interface GasTariff {
  id: string; name: string; badge: 'ΜΠΛΕ' | 'ΚΙΤΡΙΝΟ' | 'ΕΙΔΙΚΟ' | 'FLAT';
  type: 'fixed' | 'variable' | 'special' | 'flat';
  kwh: number; fixed: number; vat: number; desc: string;
  contract_months?: number; no_fixed?: boolean; dual_fuel_discount?: number;
  segment: 'residential' | 'business';
}

// ── Network operators by region (ΕΔΑ Αττικής / ΕΔΑ ΘΕΣΣ / ΔΕΔΑ) ──────────────
const NETWORK_OPERATORS = [
  { value: 'eda_attikis', label: 'ΕΔΑ Αττικής', region: 'Αττική', url: 'https://www.edaattikis.gr' },
  { value: 'eda_thess',   label: 'ΕΔΑ ΘΕΣΣ',     region: 'Θεσσαλονίκη / Θεσσαλία', url: 'https://www.edathess.gr' },
  { value: 'deda',        label: 'ΔΕΔΑ',          region: 'Λοιπή Ελλάδα', url: 'https://www.deda.gr' },
];

const GAS_PROVIDERS: { value: string; label: string; url: string; tariffs: GasTariff[] }[] = [
  {
    value: 'dei', label: 'ΔΕΗ', url: 'https://www.dei.gr',
    tariffs: [
      { id: 'dei_gas_basic', name: 'myHome Φυσικό Αέριο', badge: 'ΜΠΛΕ', type: 'fixed', kwh: 0.0420, fixed: 5.00, vat: 6, segment: 'residential', contract_months: 12, desc: 'Σταθερό 12μηνο. Dual fuel έκπτωση με ρεύμα ΔΕΗ.' },
      { id: 'dei_gas_biz',   name: 'myBusiness Αέριο',     badge: 'ΜΠΛΕ', type: 'fixed', kwh: 0.0450, fixed: 7.00, vat: 24, segment: 'business', contract_months: 12, desc: 'Σταθερό επαγγελματικό.' },
    ],
  },
  {
    value: 'fysiko_aerio', label: 'Φυσικό Αέριο Ελλάδος', url: 'https://www.fysikoaerioellados.gr',
    tariffs: [
      { id: 'fae_maxi150', name: 'MAXI Home 150',      badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh: 0.0370, fixed: 4.90,  vat: 6, segment: 'residential', desc: 'Κυμαινόμενο. Ακολουθεί TTF.' },
      { id: 'fae_safe',    name: 'MAXI Home Safe',      badge: 'ΜΠΛΕ',    type: 'fixed',    kwh: 0.0490, fixed: 5.90,  vat: 6, segment: 'residential', contract_months: 12, desc: 'Νέο σταθερό 12μηνο.' },
      { id: 'fae_eee',     name: 'Ειδικό Τιμολόγιο',    badge: 'ΕΙΔΙΚΟ',  type: 'special',  kwh: 0.0387, fixed: 4.90,  vat: 6, segment: 'residential', desc: 'Ρυθμιζόμενο ΡΑΑΕΥ. Ανανεώνεται μηνιαίως.' },
      { id: 'fae_biz1',    name: 'Business 1 Save',      badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh: 0.0990, fixed: 14.90, vat: 24, segment: 'business', desc: 'Επαγγελματικό αυτόνομο/κοινόχρηστο.' },
      { id: 'fae_biz_eid', name: 'Επαγγελματικό 1',      badge: 'ΕΙΔΙΚΟ',  type: 'special',  kwh: 0.1760, fixed: 5.00,  vat: 24, segment: 'business', desc: 'Ειδικό επαγγελματικό τιμολόγιο.' },
    ],
  },
  {
    value: 'protergia', label: 'Protergia', url: 'https://www.protergia.gr',
    tariffs: [
      { id: 'prot_gas_secure', name: 'Value Gas Secure',           badge: 'ΜΠΛΕ',    type: 'fixed',    kwh: 0.0369, fixed: 5.00, vat: 6,  segment: 'residential', contract_months: 12, dual_fuel_discount: 0.003, desc: 'Σταθερό. Δώρο πάγιο καλοκαίρι. Power&Gas έκπτωση 0.003€/kWh.' },
      { id: 'prot_gas_single', name: 'Single Value Gas',           badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh: 0.0410, fixed: 5.00, vat: 6,  segment: 'residential', no_fixed: false, desc: 'Αυτόνομο. Χωρίς ρήτρα TTF (απορροφάται).' },
      { id: 'prot_gas_koin',   name: 'Οικιακό Κοινόχρηστο',        badge: 'ΕΙΔΙΚΟ',  type: 'special',  kwh: 0.0395, fixed: 5.00, vat: 6,  segment: 'residential', desc: 'Για κεντρική θέρμανση πολυκατοικίας.' },
      { id: 'prot_gas_biz',    name: 'Φυσικό Αέριο Εμπορικό',      badge: 'ΕΙΔΙΚΟ',  type: 'special',  kwh: 0.1000, fixed: 5.00, vat: 24, segment: 'business', desc: 'Επαγγελματικό, χωρίς ρήτρα TTF.' },
    ],
  },
  {
    value: 'heron', label: 'Ήρων', url: 'https://www.heron.gr',
    tariffs: [
      { id: 'heron_gas_blue',  name: 'Ήρων Gas Σταθερό',    badge: 'ΜΠΛΕ',    type: 'fixed',    kwh: 0.0440, fixed: 5.50, vat: 6,  segment: 'residential', contract_months: 12, desc: 'Σταθερό 12μηνο.' },
      { id: 'heron_gas_yellow',name: 'Ήρων Gas Κυμαινόμενο',badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh: 0.0395, fixed: 4.50, vat: 6,  segment: 'residential', desc: 'Κυμαινόμενο, χωρίς δέσμευση.' },
      { id: 'heron_gas_biz',   name: 'Ήρων Gas Business',   badge: 'ΜΠΛΕ',    type: 'fixed',    kwh: 0.0480, fixed: 7.50, vat: 24, segment: 'business', contract_months: 12, desc: 'Σταθερό επαγγελματικό.' },
    ],
  },
  {
    value: 'zenith', label: 'Zenith', url: 'https://www.zenith.gr',
    tariffs: [
      { id: 'zen_gas',     name: 'Zenith Gas Home',     badge: 'ΜΠΛΕ', type: 'fixed', kwh: 0.0450, fixed: 5.00, vat: 6,  segment: 'residential', contract_months: 12, desc: 'Σταθερό 12μηνο. Pair έκπτωση με ρεύμα.' },
      { id: 'zen_gas_biz', name: 'Zenith Gas Business', badge: 'ΜΠΛΕ', type: 'fixed', kwh: 0.0490, fixed: 7.00, vat: 24, segment: 'business', contract_months: 12, desc: 'Σταθερό επαγγελματικό.' },
    ],
  },
  {
    value: 'elpedison', label: 'Elpedison', url: 'https://www.elpedison.gr',
    tariffs: [
      { id: 'elp_gas', name: 'Elpedison Gas Home', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh: 0.0405, fixed: 5.00, vat: 6, segment: 'residential', desc: 'Κυμαινόμενο.' },
    ],
  },
  {
    value: 'nrg', label: 'NRG', url: 'https://www.nrg.gr',
    tariffs: [
      { id: 'nrg_gas', name: 'NRG Gas Now', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh: 0.0415, fixed: 5.50, vat: 6, segment: 'residential', desc: 'Κυμαινόμενο, χωρίς δέσμευση.' },
    ],
  },
];

const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 };
const secHdr = (title: string, sub?: string) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{title}</div>
    {sub && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, fontFamily: T.font.sans }}>{sub}</div>}
  </div>
);

const bc = (badge: string) => {
  switch (badge) {
    case 'ΜΠΛΕ':    return { bg: 'rgba(26,115,232,0.08)',  border: 'rgba(26,115,232,0.25)',  color: 'var(--info)' };
    case 'ΚΙΤΡΙΝΟ': return { bg: 'rgba(242,153,0,0.08)',   border: 'rgba(242,153,0,0.25)',   color: 'var(--warning)' };
    case 'ΕΙΔΙΚΟ':  return { bg: 'rgba(52,168,83,0.08)',   border: 'rgba(52,168,83,0.25)',   color: 'var(--positive)' };
    case 'FLAT':     return { bg: 'rgba(212,175,66,0.08)',  border: 'rgba(212,175,66,0.25)',  color: 'var(--accent)' };
    default:         return { bg: 'var(--bg-elevated)', border: 'var(--border-subtle)', color: 'var(--text-secondary)' };
  }
};

interface Props { propertyId: string; userId?: string; onNavigateTab?: (tab: string) => void; }

const DEFAULTS = {
  gasProvider: 'fysiko_aerio', gasTariffId: '', gasMonthly: '', gasKwhMonthly: '',
  networkOperator: 'eda_attikis', gasContractStart: '', gasContractMonths: '',
  hasGasConnection: true, heatingType: 'autonomous_gas',
};

export default function BillsGas({ propertyId, userId = '', onNavigateTab }: Props) {
  const [s, su, saving] = useBillsSettings(propertyId, userId, 'gas', DEFAULTS);
  const [segmentFilter, setSegmentFilter] = useState<'residential' | 'business'>('residential');

  const upd = (patch: Partial<typeof DEFAULTS>) => su(patch);

  const kwh        = parseFloat(s.gasKwhMonthly) || 0;
  const provider    = GAS_PROVIDERS.find(p => p.value === s.gasProvider);
  const tariff      = provider?.tariffs.find(t => t.id === s.gasTariffId) || provider?.tariffs[0];
  const calcMonthly = tariff ? (tariff.type === 'flat' ? tariff.fixed : kwh * tariff.kwh + tariff.fixed) : 0;
  const manual      = parseFloat(s.gasMonthly) || 0;
  const effective   = manual > 0 ? manual : calcMonthly;

  const allTariffs = useMemo(() => {
    return GAS_PROVIDERS.flatMap(p => p.tariffs.filter(t => t.segment === segmentFilter).map(t => {
      const monthly = t.type === 'flat' ? t.fixed : kwh * t.kwh + t.fixed;
      return { ...t, providerLabel: p.label, providerUrl: p.url, monthly, isCurrent: t.id === s.gasTariffId };
    })).sort((a, b) => a.monthly - b.monthly);
  }, [kwh, s.gasTariffId, segmentFilter]);

  const bestMonthly = allTariffs[0]?.monthly || 0;
  const savings     = effective - bestMonthly;

  const providerOptions = GAS_PROVIDERS.map(p => ({ value: p.value, label: p.label }));
  const tariffOptions   = (provider?.tariffs ?? []).filter(t => t.segment === segmentFilter)
    .sort((a, b) => a.kwh - b.kwh)
    .map(t => ({ value: t.id, label: `${t.name} — ${t.badge} — ${fk(t.kwh)}/kWh` }));
  const networkOptions  = NETWORK_OPERATORS.map(n => ({ value: n.value, label: `${n.label} (${n.region})` }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* ── Επισκόπηση κόστους ── */}
      <div style={card}>
        {secHdr('Φυσικό Αέριο — Τρέχον Κόστος', `Ενημέρωση: ${LAST_UPDATED}`)}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div style={{ background: 'var(--bg-base)', borderRadius: T.radius.inner, padding: 16 }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6 }}>Μηνιαίο Κόστος</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: T.font.mono, color: 'var(--accent)' }}>{fe(effective)}</div>
          </div>
          <div style={{ background: 'var(--bg-base)', borderRadius: T.radius.inner, padding: 16 }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6 }}>Ετήσιο Κόστος</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: T.font.mono, color: 'var(--text-primary)' }}>{fe(effective * 12)}</div>
          </div>
          <div style={{ background: 'var(--bg-base)', borderRadius: T.radius.inner, padding: 16 }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6 }}>Δίκτυο Διανομής</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginTop: 4 }}>{NETWORK_OPERATORS.find(n => n.value === s.networkOperator)?.label}</div>
          </div>
        </div>
      </div>

      {/* ── Στοιχεία σύνδεσης ── */}
      <div style={card}>
        {secHdr('Στοιχεία Σύνδεσης & Πάροχος')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <CustomSelect label="Διαχειριστής Δικτύου (ΕΔΑ)" value={s.networkOperator} onChange={v => upd({ networkOperator: v })} options={networkOptions} />
          <CustomSelect label="Τύπος Θέρμανσης" value={s.heatingType} onChange={v => upd({ heatingType: v })}
            options={[
              { value: 'autonomous_gas', label: 'Αυτόνομη Θέρμανση Αερίου' },
              { value: 'central_gas',    label: 'Κεντρική Θέρμανση (Κοινόχρηστο)' },
              { value: 'combi',          label: 'Συνδυαστικό (Αέριο + Άλλη Πηγή)' },
            ]}/>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <CustomSelect label="Πάροχος Φυσικού Αερίου" value={s.gasProvider}
            onChange={v => upd({ gasProvider: v, gasTariffId: GAS_PROVIDERS.find(p => p.value === v)?.tariffs[0]?.id || '' })}
            options={providerOptions}/>
          <CustomSelect label="Πρόγραμμα" value={s.gasTariffId || provider?.tariffs[0]?.id || ''} onChange={v => upd({ gasTariffId: v })} options={tariffOptions}/>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <NumberInput label="Μηνιαία Κατανάλωση (kWh)" value={s.gasKwhMonthly} onChange={v => upd({ gasKwhMonthly: v })} suffix="kWh"/>
          <NumberInput label="Πραγματικό Κόστος / Μήνα (€)" value={s.gasMonthly} onChange={v => upd({ gasMonthly: v })} suffix="€"/>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
          <DatePicker label="Έναρξη Σύμβασης" value={s.gasContractStart} onChange={v => upd({ gasContractStart: v })}/>
          <NumberInput label="Διάρκεια Σύμβασης (μήνες)" value={s.gasContractMonths} onChange={v => upd({ gasContractMonths: v })} suffix="μήνες"/>
        </div>

        {tariff && (
          <div style={{ marginTop: 16, padding: 14, background: 'var(--bg-base)', borderRadius: T.radius.inner, border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{tariff.name}</span>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 9px', borderRadius: T.radius.badge, background: bc(tariff.badge).bg, border: `1px solid ${bc(tariff.badge).border}`, color: bc(tariff.badge).color }}>{tariff.badge}</span>
              </div>
              <a href={provider?.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: 'var(--info)', textDecoration: 'none', fontWeight: 600 }}>Επίσκεψη →</a>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{tariff.desc}</div>
            <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' as const }}>
              <span style={{ fontSize: 11, fontFamily: T.font.mono, color: 'var(--text-secondary)' }}>Χρέωση kWh:{'  '}<strong style={{ color: bc(tariff.badge).color }}>{fk(tariff.kwh)} / kWh</strong></span>
              <span style={{ fontSize: 11, fontFamily: T.font.mono, color: 'var(--text-secondary)' }}>Μηνιαίο πάγιο:{'  '}<strong>{fe(tariff.fixed)} / μήνα</strong></span>
              {tariff.dual_fuel_discount && (
                <span style={{ fontSize: 11, fontFamily: T.font.mono, color: 'var(--positive)' }}>Dual Fuel:{'  '}<strong>−{fk(tariff.dual_fuel_discount)} / kWh</strong></span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Σύγκριση παρόχων ── */}
      {kwh > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, flexWrap: 'wrap' as const, gap: 10 }}>
            {secHdr('Σύγκριση Όλων των Παρόχων Φυσικού Αερίου', `Βάσει ${kwh} kWh/μήνα — ${LAST_UPDATED}`)}
            <div style={{ display: 'flex', background: 'var(--bg-base)', borderRadius: T.radius.pill, padding: 3, border: '1px solid var(--border-default)' }}>
              {(['residential', 'business'] as const).map(seg => (
                <button key={seg} onClick={() => setSegmentFilter(seg)}
                  style={{ padding: '6px 16px', borderRadius: T.radius.pill, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                    background: segmentFilter === seg ? 'var(--accent)' : 'transparent',
                    color: segmentFilter === seg ? '#1a1a1a' : 'var(--text-secondary)' }}>
                  {seg === 'residential' ? 'Οικιακό' : 'Επιχειρηματικό'}
                </button>
              ))}
            </div>
          </div>

          {savings > 1 && (
            <div style={{ background: 'rgba(52,168,83,0.05)', border: '1px solid rgba(52,168,83,0.2)', borderRadius: T.radius.inner, padding: '10px 16px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--positive)' }}/>
              <span style={{ fontSize: 12 }}>Μπορείς να εξοικονομήσεις <strong style={{ fontFamily: T.font.mono, color: 'var(--positive)' }}>{fe(savings)} / μήνα</strong> ({fe(savings * 12)} / έτος) με το καλύτερο τιμολόγιο</span>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>{['Πάροχος', 'Πρόγραμμα', 'Τύπος', 'kWh', 'Πάγιο', 'Μήνας', 'Έτος', 'Διαφορά'].map(h => (
                  <th key={h} style={{ fontSize: 9, color: 'var(--text-secondary)', padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', background: 'var(--bg-elevated)' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {allTariffs.map((t, i) => {
                  const rowBc = bc(t.badge);
                  const isBest = i === 0;
                  const diff   = t.monthly - bestMonthly;
                  return (
                    <tr key={t.id} style={{ background: t.isCurrent ? 'rgba(212,175,66,0.04)' : isBest ? 'rgba(52,168,83,0.03)' : 'transparent' }}>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 600 }}>
                        {isBest && <span style={{ color: 'var(--positive)', fontSize: 9, fontWeight: 700, marginRight: 4 }}>★ ΚΑΛΥΤΕΡΟ</span>}
                        {t.providerLabel}
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)' }}>{t.name}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: T.radius.badge, background: rowBc.bg, border: `1px solid ${rowBc.border}`, color: rowBc.color }}>{t.badge}</span>
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', fontFamily: T.font.mono }}>{fk(t.kwh)}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', fontFamily: T.font.mono }}>{fe(t.fixed)}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', fontFamily: T.font.mono, fontWeight: 700, color: 'var(--accent)' }}>{fe(t.monthly)}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', fontFamily: T.font.mono, color: 'var(--text-tertiary)' }}>{fe(t.monthly * 12)}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', fontFamily: T.font.mono, color: diff === 0 ? 'var(--text-tertiary)' : diff > 0 ? 'var(--negative)' : 'var(--positive)' }}>
                        {diff === 0 ? '—' : diff > 0 ? `+${fe(diff)}` : fe(diff)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Πληροφορίες ── */}
      <div style={card}>
        {secHdr('Χρήσιμες Πληροφορίες')}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ background: 'rgba(26,115,232,0.04)', border: '1px solid rgba(26,115,232,0.15)', borderRadius: T.radius.inner, padding: '10px 14px', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Το δίκτυο διανομής ανήκει στον τοπικό διαχειριστή (ΕΔΑ Αττικής, ΕΔΑ ΘΕΣΣ ή ΔΕΔΑ) — δεν αλλάζει όποιον πάροχο κι αν επιλέξεις. Η αλλαγή παρόχου είναι καθαρά εμπορική.
          </div>
          <div style={{ background: 'rgba(242,153,0,0.04)', border: '1px solid rgba(242,153,0,0.15)', borderRadius: T.radius.inner, padding: '10px 14px', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Τα κίτρινα/κυμαινόμενα τιμολόγια ακολουθούν τον δείκτη TTF (ευρωπαϊκή χονδρεμπορική αγορά αερίου). Σε περίοδο γεωπολιτικής έντασης, τα σταθερά τιμολόγια προσφέρουν προστασία.
          </div>
          <a href="https://compareprices.energy.gov.gr" target="_blank" rel="noopener noreferrer"
            style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: 600, color: 'var(--info)', background: 'rgba(26,115,232,0.06)', border: '1px solid rgba(26,115,232,0.2)', borderRadius: T.radius.pill, padding: '8px 18px', textDecoration: 'none' }}>
            Σύγκριση Τιμών ΡΑΑΕΥ →
          </a>
        </div>
      </div>
    </div>
  );
}