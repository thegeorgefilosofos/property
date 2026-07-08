'use client';

// ═══════════════════════════════════════════════════════════════════════════
// OccupancyPanel, Πληρότητα & Βραχυχρόνια μίσθωση (Airbnb/επιπλωμένο).
// Ελληνικό-specific: αριθμός ΑΜΑ (Μητρώο Ακινήτων Βραχυχρόνιας Διαμονής, ΑΑΔΕ).
// Παρακολουθεί νύχτες/μήνα → ποσοστό πληρότητας, έσοδα, σύγκριση με μακροχρόνια.
// Αποθηκεύεται στο bills_settings (section 'occupancy'), κανένα νέο migration.
// Ενιαία πεδία (UIComponents) για ομοιόμορφη, ευθυγραμμισμένη εμφάνιση.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, fe } from '@/components/Theme';
import { NumberInput, TextInput } from './UIComponents';
import { shortTermNet } from '@/lib/billing/greekTax';

const MONTHS = ['Ιαν','Φεβ','Μαρ','Απρ','Μαΐ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
const DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];

interface OccData { shortTerm: boolean; ama: string; nightlyRate: string; nights: string[]; platformFeePct: string; cleaningPerStay: string; avgNightsPerStay: string; }
const INIT: OccData = { shortTerm: false, ama: '', nightlyRate: '', nights: Array(12).fill(''), platformFeePct: '15', cleaningPerStay: '40', avgNightsPerStay: '3' };

export default function OccupancyPanel({ propertyId, userId, longTermMonthly }: { propertyId: string; userId: string; longTermMonthly: number }) {
  const supabase = createClient();
  const [d, setD] = useState<OccData>(INIT);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('bills_settings').select('data').eq('property_id', propertyId).eq('section', 'occupancy').maybeSingle();
    if (data?.data) setD({ ...INIT, ...(data.data as Partial<OccData>) });
  }, [propertyId]);
  useEffect(() => { load(); }, [load]);

  const persist = (next: OccData) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      supabase.from('bills_settings').upsert({ property_id: propertyId, user_id: String(userId), section: 'occupancy', data: next, updated_at: new Date().toISOString() }, { onConflict: 'property_id,section' }).then(() => {});
    }, 700);
  };
  const upd = (patch: Partial<OccData>) => setD(prev => { const next = { ...prev, ...patch }; persist(next); return next; });
  const setNight = (i: number, v: string) => setD(prev => { const n = [...prev.nights]; n[i] = v; const next = { ...prev, nights: n }; persist(next); return next; });

  // Υπολογισμοί
  const rate = parseFloat(d.nightlyRate) || 0;
  const nightsNum = d.nights.map(v => parseInt(v) || 0);
  const totalNights = nightsNum.reduce((s, v) => s + v, 0);
  const totalDays = DAYS.reduce((a, b) => a + b, 0);
  const occupancyPct = totalDays > 0 ? (totalNights / totalDays) * 100 : 0;
  const peakMonth = nightsNum.reduce((best, v, i) => v > nightsNum[best] ? i : best, 0);
  // Καθαρά έσοδα: μεικτά − προμήθειες πλατφορμών − καθαρισμός − Τέλος Ανθεκτικότητας.
  const net = shortTermNet({ nightsByMonth: nightsNum, nightlyRate: rate, platformFeePct: parseFloat(d.platformFeePct) || 0, cleaningPerStay: parseFloat(d.cleaningPerStay) || 0, avgNightsPerStay: parseFloat(d.avgNightsPerStay) || 0 });
  const stRevenue = net.grossRevenue;
  const ltRevenue = longTermMonthly * 12;
  const diff = net.net - ltRevenue;

  const kpi = (label: string, value: string, tone = 'var(--text-primary)') => (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '12px 14px' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, fontFamily: T.font.sans }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: tone, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</div>
    </div>
  );

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}><span title="Ποσοστό κρατημένων νυχτών προς τις διαθέσιμες (occupancy)">Πληρότητα</span> & Βραχυχρόνια</div>
            <div style={{ fontFamily: T.font.sans, fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>Airbnb και επιπλωμένο: <span title="Αριθμός Μητρώου Ακινήτου — αριθμός εγγραφής βραχυχρόνιας μίσθωσης στην ΑΑΔΕ">ΑΜΑ</span>, πληρότητα, σύγκριση με μακροχρόνια</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {d.shortTerm && totalNights > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', fontFamily: T.font.mono }}>{occupancyPct.toFixed(0)}%</span>}
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><path d="m6 9 6 6 6-6"/></svg>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
          {/* Toggle */}
          <button type="button" role="switch" aria-checked={d.shortTerm} onClick={() => upd({ shortTerm: !d.shortTerm })}
            style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', marginBottom: d.shortTerm ? 18 : 0 }}>
            <span style={{ width: 40, height: 24, borderRadius: 12, padding: 2, flexShrink: 0, background: d.shortTerm ? 'var(--accent)' : 'var(--border-strong)', transition: 'background 0.2s', display: 'flex', alignItems: 'center' }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transform: d.shortTerm ? 'translateX(16px)' : 'translateX(0)', transition: 'transform 0.2s cubic-bezier(0.2,0,0,1)' }}/>
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: T.font.sans, fontWeight: 600 }}>Βραχυχρόνια μίσθωση (Airbnb / επιπλωμένο)</span>
          </button>

          {d.shortTerm && (
            <>
              {/* ── Βασικά στοιχεία, ενιαία πεδία ─────────────────────────── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 12, marginBottom: 18 }}>
                <TextInput label="Αριθμός Μητρώου Ακινήτου (ΑΜΑ)" value={d.ama} onChange={v => upd({ ama: v })} placeholder="π.χ. 0000000000000" />
                <NumberInput label="Τιμή ανά νύχτα" value={d.nightlyRate} onChange={v => upd({ nightlyRate: v })} suffix="€" step={5} placeholder="60" />
                <NumberInput label="Προμήθεια πλατφόρμας" value={d.platformFeePct} onChange={v => upd({ platformFeePct: v })} suffix="%" step={1} max={100} />
                <NumberInput label="Καθαρισμός ανά διαμονή" value={d.cleaningPerStay} onChange={v => upd({ cleaningPerStay: v })} suffix="€" step={5} />
                <NumberInput label="Μέσες νύχτες ανά κράτηση" value={d.avgNightsPerStay} onChange={v => upd({ avgNightsPerStay: v })} suffix="νύχτ" step={1} min={1} />
              </div>

              {/* ── Νύχτες με κράτηση ανά μήνα ───────────────────────────── */}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: T.font.sans }}>Νύχτες με κράτηση ανά μήνα</span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Σύνολο <strong style={{ color: 'var(--text-secondary)', fontFamily: T.font.mono }}>{totalNights}</strong> / {totalDays}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 6, marginBottom: 18 }}>
                {MONTHS.map((m, i) => {
                  const isPeak = totalNights > 0 && i === peakMonth;
                  return (
                    <div key={m} style={{ textAlign: 'center', minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: isPeak ? 'var(--accent)' : 'var(--text-tertiary)', fontFamily: T.font.sans, marginBottom: 4 }}>{m}</div>
                      <input value={d.nights[i]} onChange={e => setNight(i, e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="0"
                        style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-surface)', border: `1px solid ${isPeak ? 'var(--accent-border)' : 'var(--border-default)'}`, borderRadius: 8, padding: '9px 2px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.mono, textAlign: 'center', outline: 'none', transition: 'border-color 0.15s' }}
                        onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-dim)'; }}
                        onBlur={e => { e.currentTarget.style.borderColor = isPeak ? 'var(--accent-border)' : 'var(--border-default)'; e.currentTarget.style.boxShadow = 'none'; }} />
                    </div>
                  );
                })}
              </div>

              {/* ── Αποτελέσματα ─────────────────────────────────────────── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 148px), 1fr))', gap: 10, marginBottom: 14 }}>
                {kpi('Πληρότητα', `${occupancyPct.toFixed(0)}%`, 'var(--accent)')}
                {kpi('Νύχτες / έτος', String(totalNights))}
                {kpi('Μεικτά έσοδα', fe(stRevenue))}
                {kpi('Προμήθειες πλατφορμών', `− ${fe(net.platformFees)}`, 'var(--text-secondary)')}
                {kpi('Καθαρισμός', `− ${fe(net.cleaningTotal)}`, 'var(--text-secondary)')}
                {kpi('Τέλος ανθεκτικότητας', `− ${fe(net.levy)}`, 'var(--text-secondary)')}
                {kpi('Καθαρά έσοδα', fe(net.net), 'var(--text-primary)')}
                {kpi('Διαφορά vs μακροχρόνια', `${diff >= 0 ? '+' : '−'} ${fe(Math.abs(diff))}`, diff >= 0 ? 'var(--positive)' : 'var(--negative)')}
              </div>

              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border-strong)', marginTop: 6, flexShrink: 0 }} />
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.6 }}>
                  Για νόμιμη βραχυχρόνια μίσθωση απαιτείται εγγραφή στο <strong>Μητρώο Ακινήτων Βραχυχρόνιας Διαμονής</strong> της <span title="Ανεξάρτητη Αρχή Δημοσίων Εσόδων">ΑΑΔΕ</span> και αναγραφή του <strong title="Αριθμός Μητρώου Ακινήτου (βραχυχρόνια μίσθωση)">ΑΜΑ</strong> σε κάθε ανάρτηση (Airbnb/Booking). Τα έσοδα δηλώνονται στο <span title="Έντυπο δήλωσης εισοδήματος από ακίνητα (ενοίκια)">Ε2</span>. Τα καθαρά έσοδα αφαιρούν προμήθειες πλατφορμών, καθαρισμό και το <strong>Τέλος Ανθεκτικότητας στην Κλιματική Κρίση</strong>, όχι όμως τον φόρο εισοδήματος. Το τέλος <strong>δεν είναι ενιαίο</strong>: εξαρτάται από τον τύπο του ακινήτου και την περίοδο (ενδεικτικά 2025, διαμερίσματα/κατοικίες περίπου 8 € την υψηλή περίοδο και 2 € τη χαμηλή ανά διανυκτέρευση· μονοκατοικίες άνω των 80 τ.μ. περίπου 15 € και 4 €). Τα ακριβή ποσά και οι μήνες ορίζονται από την <span title="Ανεξάρτητη Αρχή Δημοσίων Εσόδων">ΑΑΔΕ</span>, επιβεβαίωσέ τα εκεί ή με τον λογιστή σου.
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
