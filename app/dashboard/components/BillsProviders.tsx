'use client';

import { useState } from 'react';
import { NumberInput, CustomSelect, TextInput, Toggle, DatePicker } from './UIComponents';
import { useBillsSettings } from './BillsSettings';

// ─── Internet providers ────────────────────────────────────────────────────
const INTERNET_PROVIDERS = [
  { value: 'cosmote', label: 'Cosmote', url: 'https://www.cosmote.gr' },
  { value: 'nova', label: 'Nova', url: 'https://www.nova.gr' },
  { value: 'vodafone', label: 'Vodafone', url: 'https://www.vodafone.gr' },
  { value: 'inalan', label: 'Inalan', url: 'https://www.inalan.gr' },
  { value: 'enterwave', label: 'Enterwave', url: 'https://www.enterwave.gr' },
  { value: 'other', label: 'Άλλος', url: '' },
];
const WATER_PROVIDERS = [
  { value: 'eydap', label: 'ΕΥΔΑΠ (Αττική)', url: 'https://www.eydap.gr' },
  { value: 'eyath', label: 'ΕΥΑΘ (Θεσσαλονίκη)', url: 'https://www.eyath.gr' },
  { value: 'local', label: 'Τοπική ΔΕΥΑ', url: '' },
];
const GAS_PROVIDERS = [
  { value: 'eda_attikis', label: 'ΕΔΑ Αττικής', url: 'https://www.edaattikis.gr' },
  { value: 'eda_thess', label: 'ΕΔΑ Θεσσαλίας', url: 'https://www.edathess.gr' },
  { value: 'heron', label: 'Ήρων', url: 'https://www.heron.gr' },
  { value: 'protergia', label: 'Protergia', url: 'https://www.protergia.gr' },
  { value: 'volterra', label: 'Volterra', url: 'https://www.volterra.gr' },
];
const HEATING_TYPES = [
  { value: 'autonomous_gas', label: 'Αυτόνομη Αερίου' },
  { value: 'autonomous_oil', label: 'Αυτόνομη Πετρελαίου' },
  { value: 'autonomous_heat_pump', label: 'Αντλία Θερμότητας' },
  { value: 'autonomous_ac', label: 'Κλιματιστικό' },
  { value: 'autonomous_pellet', label: 'Pellet' },
  { value: 'autonomous_wood', label: 'Ξύλα/Τζάκι' },
  { value: 'central_gas', label: 'Κεντρική Αερίου' },
  { value: 'central_oil', label: 'Κεντρική Πετρελαίου' },
  { value: 'district', label: 'Τηλεθέρμανση' },
];
const SECURITY_COMPANIES = [
  { value: 'eltrak', label: 'Eltrak', url: 'https://www.eltrak.gr' },
  { value: 'g4s', label: 'G4S', url: 'https://www.g4s.com/gr-gr' },
  { value: 'vaninfo', label: 'Vaninfo', url: 'https://www.vaninfo.gr' },
  { value: 'dsp', label: 'DSP', url: 'https://www.dsp.gr' },
  { value: 'securitas', label: 'Securitas', url: 'https://www.securitas.com/gr' },
  { value: 'other', label: 'Άλλη', url: '' },
];

const fe = (n: number, d = 2) => `${n.toLocaleString('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;

interface Props { propertyId: string; userId?: string; }

const DEFAULTS = {
  // Internet
  internetProvider: 'cosmote', internetPlan: '', internetSpeed: '', internetPrice: '',
  internetPhone: false, internetContract: '24', internetDueDay: '15',
  phoneLocal: true, phoneMobile: false, phoneIntl: false, phoneVoip: false, phoneNotes: '',
  // TV
  hasTV: false, tvProvider: 'cosmote', tvPlan: '', tvPrice: '', tvHasSports: false,
  // Water
  waterProvider: 'eydap', waterBiMonthly: '', waterMonthly: '', waterPersons: '2',
  // Heating
  heatingType: 'autonomous_gas', heatingMonthly: '',
  heatingLitersPerYear: '', heatingOilPricePerLiter: '1.20',
  heatingKgPellet: '', heatingPelletPrice: '0.38',
  heatingCentralShare: '',
  // Gas
  gasProvider: 'eda_attikis', gasPlan: '', gasMonthly: '',
  // Security
  securityCompany: 'other', securityPlan: '', securityMonthly: '',
  securityHasRemote: false, securityHasCamera: false,
  // Dimotika helper
  dimotika: '4.8', dimotikaCalcCons: '', dimotikaCalcAmount: '',
};

export default function BillsProviders({ propertyId, userId = '' }: Props) {
  const [s, upd, loading] = useBillsSettings(propertyId, userId, 'providers', DEFAULTS);
  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', marginBottom: '16px' };
  const g2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' };
  const g3: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' };
  const g4: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '12px' };

  const internetCost = parseFloat(s.internetPrice) || 0;
  const tvCost = s.hasTV ? (parseFloat(s.tvPrice) || 0) : 0;
  const waterM = s.waterBiMonthly ? (parseFloat(s.waterBiMonthly) || 0) / 2 : (parseFloat(s.waterMonthly) || 0);
  const heatingM = (() => {
    if (s.heatingType === 'autonomous_oil' && s.heatingLitersPerYear) return (parseFloat(s.heatingLitersPerYear) * parseFloat(s.heatingOilPricePerLiter)) / 12;
    if (s.heatingType === 'autonomous_pellet' && s.heatingKgPellet) return (parseFloat(s.heatingKgPellet) * parseFloat(s.heatingPelletPrice)) / 12;
    return parseFloat(s.heatingMonthly) || 0;
  })();
  const gasM = parseFloat(s.gasMonthly) || 0;
  const securityM = parseFloat(s.securityMonthly) || 0;
  const totalM = internetCost + tvCost + waterM + heatingM + gasM + securityM;

  const internetProviderData = INTERNET_PROVIDERS.find(p => p.value === s.internetProvider);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Φόρτωση...</div>;

  return (
    <div style={{ fontFamily: 'Inter,sans-serif' }}>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '16px' }}>
        {[
          { label: 'Internet/TV', value: fe(internetCost + tvCost), color: 'var(--info)' },
          { label: 'Νερό + Θέρμανση', value: fe(waterM + heatingM), color: 'var(--warning)' },
          { label: 'Αέριο + Security', value: fe(gasM + securityM), color: 'var(--accent)' },
          { label: 'Σύνολο Παρόχων/μήνα', value: fe(totalM), color: 'var(--positive)' },
        ].map((k, i) => (
          <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '14px 16px' }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: k.color, fontFamily: "'JetBrains Mono',monospace", marginBottom: '4px' }}>{k.value}</div>
            <div style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Dimotika helper — shared with BillsElectricity */}
      <div style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--info)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>🏙 Δημοτικά Τέλη — Υπολογισμός Ποσοστού</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', alignItems: 'flex-end' }}>
          <NumberInput label="Ποσοστό % (αν το γνωρίζεις)" value={s.dimotika} onChange={v => upd({ dimotika: v })} suffix="%" step={0.1} />
          <div>
            <div style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Υπολόγισε από λογαριασμό ρεύματος</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '6px' }}>
              <NumberInput label="Κατανάλωση λογ/σμού (€)" value={s.dimotikaCalcCons} onChange={v => upd({ dimotikaCalcCons: v })} suffix="€" step={1} />
              <NumberInput label="Δημοτικά Τέλη (€)" value={s.dimotikaCalcAmount} onChange={v => upd({ dimotikaCalcAmount: v })} suffix="€" step={0.5} />
            </div>
            {s.dimotikaCalcCons && s.dimotikaCalcAmount && parseFloat(s.dimotikaCalcCons) > 0 && (
              <button onClick={() => upd({ dimotika: (parseFloat(s.dimotikaCalcAmount) / parseFloat(s.dimotikaCalcCons) * 100).toFixed(1) })}
                style={{ background: 'var(--info)', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 12px', fontSize: '10px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                → Εφαρμογή {(parseFloat(s.dimotikaCalcAmount) / parseFloat(s.dimotikaCalcCons) * 100).toFixed(1)}%
              </button>
            )}
          </div>
          <div style={{ background: 'var(--bg-base)', borderRadius: '8px', padding: '12px', textAlign: 'center', border: `1px solid ${s.dimotika ? 'var(--info)' : 'var(--border-subtle)'}` }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--info)', fontFamily: "'JetBrains Mono',monospace" }}>{s.dimotika || '—'}{s.dimotika ? '%' : ''}</div>
            <div style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: '4px' }}>Ενεργό ποσοστό</div>
            <div style={{ fontSize: '9px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Τυπικό: 3-6% · Αθήνα: ~5%</div>
          </div>
        </div>
        <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--text-tertiary)' }}>
          💡 Το ποσοστό αυτό χρησιμοποιείται αυτόματα και στον υπολογισμό του λογαριασμού ρεύματος (tab Ρεύμα).
        </div>
      </div>

      {/* Internet */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '16px' }}>📶</span>
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Internet & Σταθερό Τηλέφωνο</span>
          </div>
          <a href="https://www.eett.gr/opencms/opencms/EETT/Electronic_Communications/Market360/" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: '10px', color: 'var(--info)', textDecoration: 'none', fontWeight: 600 }}>↗ ΕΕΤΤ 360° Επίσημη Σύγκριση</a>
        </div>
        <div style={g4}>
          <CustomSelect label="Πάροχος" value={s.internetProvider} onChange={v => upd({ internetProvider: v })} options={INTERNET_PROVIDERS.map(p => ({ value: p.value, label: p.label }))} />
          <TextInput label="Ονομασία Προγράμματος" value={s.internetPlan} onChange={v => upd({ internetPlan: v })} placeholder="π.χ. Fiber 500 Plus" />
          <TextInput label="Ταχύτητα" value={s.internetSpeed} onChange={v => upd({ internetSpeed: v })} placeholder="π.χ. 500/200 Mbps" />
          <NumberInput label="Μηνιαίο Κόστος (€)" value={s.internetPrice} onChange={v => upd({ internetPrice: v })} suffix="€" step={1} />
        </div>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <Toggle on={s.internetPhone} onChange={v => upd({ internetPhone: v })} label="Περιλαμβάνει Σταθερό Τηλέφωνο" labelOff="Χωρίς Σταθερό" />
        </div>

        {/* Plan summary */}
        {(s.internetPlan || s.internetSpeed || internetCost > 0) && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: '10px', padding: '14px', border: '1px solid var(--border-subtle)', marginBottom: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: s.internetPhone ? '12px' : '0' }}>
              {[
                { label: 'Πρόγραμμα', value: s.internetPlan || '—', color: 'var(--info)' },
                { label: 'Ταχύτητα', value: s.internetSpeed || '—', color: 'var(--text-primary)' },
                { label: 'Σταθερό Τηλ.', value: s.internetPhone ? '✓ Ναι' : '✗ Όχι', color: s.internetPhone ? 'var(--positive)' : 'var(--text-tertiary)' },
                { label: 'Ετήσιο Κόστος', value: internetCost > 0 ? `${(internetCost * 12).toFixed(2)} €` : '—', color: 'var(--warning)' },
              ].map((r, i) => (
                <div key={i}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: r.color, fontFamily: "'JetBrains Mono',monospace" }}>{r.value}</div>
                  <div style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{r.label}</div>
                </div>
              ))}
            </div>
            {s.internetPhone && (
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Τι περιλαμβάνει το σταθερό τηλέφωνο:</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  {[
                    { key: 'phoneLocal', label: 'Απεριόριστα εντός', val: s.phoneLocal },
                    { key: 'phoneMobile', label: 'Απεριόριστα κινητά', val: s.phoneMobile },
                    { key: 'phoneIntl', label: 'Διεθνείς κλήσεις', val: s.phoneIntl },
                    { key: 'phoneVoip', label: 'VoIP/App', val: s.phoneVoip },
                  ].map(f => (
                    <div key={f.key} onClick={() => upd({ [f.key]: !f.val } as any)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', background: f.val ? 'rgba(52,217,123,0.1)' : 'var(--bg-base)', border: `1px solid ${f.val ? 'var(--positive)' : 'var(--border-subtle)'}`, borderRadius: '8px', padding: '6px 12px', cursor: 'pointer' }}>
                      <span style={{ fontSize: '11px', color: f.val ? 'var(--positive)' : 'var(--text-tertiary)' }}>{f.val ? '✓' : '○'}</span>
                      <span style={{ fontSize: '11px', color: f.val ? 'var(--positive)' : 'var(--text-secondary)', fontWeight: f.val ? 600 : 400 }}>{f.label}</span>
                    </div>
                  ))}
                </div>
                <TextInput label="Σημειώσεις πακέτου" value={s.phoneNotes} onChange={v => upd({ phoneNotes: v })} placeholder="π.χ. 100 λεπτά διεθνή, αποκλείονται premium..." />
              </div>
            )}
            {internetProviderData?.url && (
              <a href={internetProviderData.url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: '10px', color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '10px' }}>
                ↗ Επίσημη σελίδα {internetProviderData.label}
              </a>
            )}
          </div>
        )}

        {/* TV */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <span style={{ fontSize: '14px' }}>📺</span>
            <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pay TV</span>
            <Toggle on={s.hasTV} onChange={v => upd({ hasTV: v })} label="Ενεργό" labelOff="Δεν έχω" />
          </div>
          {s.hasTV && (
            <div style={g4}>
              <CustomSelect label="Πάροχος" value={s.tvProvider} onChange={v => upd({ tvProvider: v })}
                options={[{ value: 'cosmote', label: 'Cosmote TV' }, { value: 'nova', label: 'Nova/EON' }, { value: 'other', label: 'Άλλος' }]} />
              <TextInput label="Πρόγραμμα" value={s.tvPlan} onChange={v => upd({ tvPlan: v })} placeholder="π.χ. Cosmote TV Start" />
              <NumberInput label="Μηνιαίο Κόστος (€)" value={s.tvPrice} onChange={v => upd({ tvPrice: v })} suffix="€" step={1} />
              <div style={{ paddingTop: '22px' }}>
                <Toggle on={s.tvHasSports} onChange={v => upd({ tvHasSports: v })} label="🏆 Sports" labelOff="Χωρίς Sports" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Water */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '16px' }}>💧</span>
          <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Νερό</span>
        </div>
        <div style={g4}>
          <CustomSelect label="Πάροχος" value={s.waterProvider} onChange={v => upd({ waterProvider: v })} options={WATER_PROVIDERS.map(p => ({ value: p.value, label: p.label }))} />
          <NumberInput label="Διμηνιαίος Λογαριασμός (€)" value={s.waterBiMonthly} onChange={v => upd({ waterBiMonthly: v, waterMonthly: v ? String(parseFloat(v) / 2) : '' })} suffix="€" step={5} />
          <NumberInput label="Μηνιαία Αναγωγή (€)" value={s.waterMonthly} onChange={v => upd({ waterMonthly: v })} suffix="€" step={2} />
          <NumberInput label="Άτομα" value={s.waterPersons} onChange={v => upd({ waterPersons: v })} suffix="άτ." step={1} />
        </div>
        {waterM > 0 && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: '8px', padding: '10px 14px', fontSize: '11px', color: 'var(--text-secondary)' }}>
            Μηνιαίο: <strong style={{ color: 'var(--info)', fontFamily: "'JetBrains Mono',monospace" }}>{fe(waterM)}</strong>
            {s.waterPersons && <span style={{ marginLeft: '12px' }}>Ανά άτομο: <strong style={{ fontFamily: "'JetBrains Mono',monospace" }}>{fe(waterM / parseInt(s.waterPersons))}</strong></span>}
          </div>
        )}
        {WATER_PROVIDERS.find(p => p.value === s.waterProvider)?.url && (
          <a href={WATER_PROVIDERS.find(p => p.value === s.waterProvider)!.url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: '10px', color: 'var(--accent)', textDecoration: 'none', display: 'block', marginTop: '8px' }}>
            ↗ Επίσημη σελίδα {WATER_PROVIDERS.find(p => p.value === s.waterProvider)?.label}
          </a>
        )}
      </div>

      {/* Heating */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '16px' }}>🔥</span>
          <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Θέρμανση</span>
        </div>
        <div style={g3}>
          <CustomSelect label="Τύπος Θέρμανσης" value={s.heatingType} onChange={v => upd({ heatingType: v })} options={HEATING_TYPES} />
          {(s.heatingType === 'autonomous_gas' || s.heatingType === 'central_gas' || s.heatingType === 'district' || s.heatingType === 'autonomous_heat_pump' || s.heatingType === 'autonomous_ac' || s.heatingType === 'autonomous_wood') && (
            <NumberInput label="Μηνιαίο Κόστος (€)" value={s.heatingMonthly} onChange={v => upd({ heatingMonthly: v })} suffix="€" step={5} />
          )}
          {s.heatingType === 'autonomous_oil' && (
            <>
              <NumberInput label="Λίτρα/έτος" value={s.heatingLitersPerYear} onChange={v => upd({ heatingLitersPerYear: v })} suffix="L" step={50} />
              <NumberInput label="Τιμή/λίτρο (€)" value={s.heatingOilPricePerLiter} onChange={v => upd({ heatingOilPricePerLiter: v })} suffix="€" step={0.01} />
            </>
          )}
          {s.heatingType === 'autonomous_pellet' && (
            <>
              <NumberInput label="Kg/έτος" value={s.heatingKgPellet} onChange={v => upd({ heatingKgPellet: v })} suffix="kg" step={50} />
              <NumberInput label="Τιμή/kg (€)" value={s.heatingPelletPrice} onChange={v => upd({ heatingPelletPrice: v })} suffix="€" step={0.01} />
            </>
          )}
          {(s.heatingType === 'central_oil' || s.heatingType === 'central_gas') && (
            <NumberInput label="Μερίδιό μου %" value={s.heatingCentralShare} onChange={v => upd({ heatingCentralShare: v })} suffix="%" step={1} />
          )}
        </div>
        {heatingM > 0 && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: '8px', padding: '10px 14px', fontSize: '11px', color: 'var(--text-secondary)' }}>
            Μηνιαίο (μ.ο.): <strong style={{ color: 'var(--negative)', fontFamily: "'JetBrains Mono',monospace" }}>{fe(heatingM)}</strong>
            <span style={{ marginLeft: '12px' }}>Ετήσιο: <strong style={{ fontFamily: "'JetBrains Mono',monospace" }}>{fe(heatingM * 12)}</strong></span>
          </div>
        )}
      </div>

      {/* Gas */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '16px' }}>🔵</span>
          <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Αέριο</span>
          <a href="https://energycost.gr" target="_blank" rel="noopener noreferrer" style={{ fontSize: '10px', color: 'var(--info)', textDecoration: 'none', marginLeft: 'auto' }}>↗ ΡΑΑΕΥ energycost.gr</a>
        </div>
        <div style={g3}>
          <CustomSelect label="Πάροχος" value={s.gasProvider} onChange={v => upd({ gasProvider: v })} options={GAS_PROVIDERS.map(p => ({ value: p.value, label: p.label }))} />
          <TextInput label="Πρόγραμμα" value={s.gasPlan} onChange={v => upd({ gasPlan: v })} placeholder="π.χ. Οικιακό Σταθερό" />
          <NumberInput label="Μηνιαίο Κόστος (€)" value={s.gasMonthly} onChange={v => upd({ gasMonthly: v })} suffix="€" step={5} />
        </div>
        {GAS_PROVIDERS.find(p => p.value === s.gasProvider)?.url && (
          <a href={GAS_PROVIDERS.find(p => p.value === s.gasProvider)!.url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: '10px', color: 'var(--accent)', textDecoration: 'none' }}>
            ↗ Επίσημη σελίδα {GAS_PROVIDERS.find(p => p.value === s.gasProvider)?.label}
          </a>
        )}
      </div>

      {/* Security */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '16px' }}>🔒</span>
          <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Security / Συναγερμός</span>
        </div>
        <div style={g4}>
          <CustomSelect label="Εταιρεία" value={s.securityCompany} onChange={v => upd({ securityCompany: v })} options={SECURITY_COMPANIES.map(c => ({ value: c.value, label: c.label }))} />
          <TextInput label="Πρόγραμμα" value={s.securityPlan} onChange={v => upd({ securityPlan: v })} placeholder="π.χ. Basic Monitor" />
          <NumberInput label="Μηνιαίο Κόστος (€)" value={s.securityMonthly} onChange={v => upd({ securityMonthly: v })} suffix="€" step={2} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '22px' }}>
            <Toggle on={s.securityHasRemote} onChange={v => upd({ securityHasRemote: v })} label="📱 Τηλεχειρισμός" labelOff="Χωρίς app" />
            <Toggle on={s.securityHasCamera} onChange={v => upd({ securityHasCamera: v })} label="📷 Κάμερες" labelOff="Χωρίς κάμερες" />
          </div>
        </div>
        {SECURITY_COMPANIES.find(c => c.value === s.securityCompany)?.url && (
          <a href={SECURITY_COMPANIES.find(c => c.value === s.securityCompany)!.url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: '10px', color: 'var(--accent)', textDecoration: 'none' }}>
            ↗ Επίσημη σελίδα {SECURITY_COMPANIES.find(c => c.value === s.securityCompany)?.label}
          </a>
        )}
      </div>

      {/* Summary */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '16px' }}>📊</span>
          <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Σύνοψη Παρόχων</span>
        </div>
        {[
          { label: 'Internet', amount: internetCost, icon: '📶' },
          { label: s.tvProvider === 'cosmote' ? 'Cosmote TV' : 'Nova/EON', amount: tvCost, icon: '📺', skip: !s.hasTV },
          { label: 'Νερό', amount: waterM, icon: '💧' },
          { label: 'Θέρμανση', amount: heatingM, icon: '🔥' },
          { label: 'Αέριο', amount: gasM, icon: '🔵', skip: !gasM },
          { label: 'Security', amount: securityM, icon: '🔒', skip: !securityM },
        ].filter(r => !r.skip && r.amount > 0).map((r, i) => (
          <div key={i} style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{r.icon} {r.label}</span>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)', fontFamily: "'JetBrains Mono',monospace" }}>{fe(r.amount)}/μήνα</span>
                <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginLeft: '8px', fontFamily: "'JetBrains Mono',monospace" }}>{fe(r.amount * 12)}/έτος</span>
              </div>
            </div>
            <div style={{ height: '4px', background: 'var(--bg-overlay)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${totalM > 0 ? (r.amount / totalM) * 100 : 0}%`, background: 'var(--accent)', borderRadius: '2px' }} />
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid var(--border-subtle)', marginTop: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700 }}>Σύνολο Παρόχων</span>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--warning)', fontFamily: "'JetBrains Mono',monospace" }}>{fe(totalM)}/μήνα</div>
            <div style={{ fontSize: '12px', color: 'var(--negative)', fontFamily: "'JetBrains Mono',monospace" }}>{fe(totalM * 12)}/έτος</div>
          </div>
        </div>
      </div>
    </div>
  );
}