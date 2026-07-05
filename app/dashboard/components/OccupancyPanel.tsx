'use client';

// ═══════════════════════════════════════════════════════════════════════════
// OccupancyPanel — Πληρότητα & Βραχυχρόνια μίσθωση (Airbnb/επιπλωμένο).
// Ελληνικό-specific: αριθμός ΑΜΑ (Μητρώο Ακινήτων Βραχυχρόνιας Διαμονής, ΑΑΔΕ).
// Παρακολουθεί νύχτες/μήνα → ποσοστό πληρότητας, έσοδα, σύγκριση με μακροχρόνια.
// Αποθηκεύεται στο bills_settings (section 'occupancy') — κανένα νέο migration.
// Blueground-aligned: occupancy + performance ανά μονάδα.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, fe } from '@/components/Theme';

const MONTHS = ['Ιαν','Φεβ','Μαρ','Απρ','Μαΐ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
const DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];

interface OccData { shortTerm: boolean; ama: string; nightlyRate: string; nights: string[]; }
const INIT: OccData = { shortTerm: false, ama: '', nightlyRate: '', nights: Array(12).fill('') };

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
  const totalNights = d.nights.reduce((s, v) => s + (parseInt(v) || 0), 0);
  const totalDays = DAYS.reduce((a, b) => a + b, 0);
  const occupancyPct = totalDays > 0 ? (totalNights / totalDays) * 100 : 0;
  const stRevenue = totalNights * rate;
  const ltRevenue = longTermMonthly * 12;
  const diff = stRevenue - ltRevenue;

  const kpi = (label: string, value: string, tone = 'var(--text-primary)') => (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '12px 14px' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, fontFamily: T.font.sans }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: tone, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</div>
    </div>
  );

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>Πληρότητα & Βραχυχρόνια</div>
            <div style={{ fontFamily: T.font.sans, fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>Airbnb / επιπλωμένο — ΑΜΑ, πληρότητα, σύγκριση με μακροχρόνια</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {d.shortTerm && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', fontFamily: T.font.mono }}>{occupancyPct.toFixed(0)}%</span>}
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><path d="m6 9 6 6 6-6"/></svg>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
          {/* Toggle */}
          <button type="button" role="switch" aria-checked={d.shortTerm} onClick={() => upd({ shortTerm: !d.shortTerm })}
            style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', marginBottom: d.shortTerm ? 16 : 0 }}>
            <span style={{ width: 40, height: 24, borderRadius: 12, padding: 2, flexShrink: 0, background: d.shortTerm ? 'var(--accent)' : 'var(--border-strong)', transition: 'background 0.2s', display: 'flex', alignItems: 'center' }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transform: d.shortTerm ? 'translateX(16px)' : 'translateX(0)', transition: 'transform 0.2s cubic-bezier(0.2,0,0,1)' }}/>
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: T.font.sans, fontWeight: 600 }}>Βραχυχρόνια μίσθωση (Airbnb / επιπλωμένο)</span>
          </button>

          {d.shortTerm && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, fontFamily: T.font.sans }}>Αριθμός Μητρώου Ακινήτου (ΑΜΑ)</div>
                  <input value={d.ama} onChange={e => upd({ ama: e.target.value })} placeholder="π.χ. 0000000000000"
                    style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '10px 12px', fontSize: 14, color: 'var(--text-primary)', fontFamily: T.font.mono, outline: 'none' }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, fontFamily: T.font.sans }}>Τιμή ανά νύχτα (€)</div>
                  <input value={d.nightlyRate} onChange={e => upd({ nightlyRate: e.target.value })} type="number" placeholder="60"
                    style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '10px 12px', fontSize: 14, color: 'var(--text-primary)', fontFamily: T.font.mono, outline: 'none' }} />
                </div>
              </div>

              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontFamily: T.font.sans }}>Νύχτες με κράτηση ανά μήνα</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 62px), 1fr))', gap: 6, marginBottom: 16 }}>
                {MONTHS.map((m, i) => (
                  <div key={m} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginBottom: 3 }}>{m}</div>
                    <input value={d.nights[i]} onChange={e => setNight(i, e.target.value)} type="number" min={0} max={DAYS[i]} placeholder="0"
                      style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '7px 4px', fontSize: 13, color: 'var(--text-primary)', fontFamily: T.font.mono, textAlign: 'center', outline: 'none' }} />
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 10, marginBottom: 14 }}>
                {kpi('Πληρότητα', `${occupancyPct.toFixed(0)}%`, 'var(--accent)')}
                {kpi('Νύχτες / έτος', String(totalNights))}
                {kpi('Έσοδα βραχυχρόνιας', fe(stRevenue), 'var(--positive)')}
                {kpi('Διαφορά vs μακροχρόνια', `${diff >= 0 ? '+' : '−'} ${fe(Math.abs(diff))}`, diff >= 0 ? 'var(--positive)' : 'var(--negative)')}
              </div>

              <div style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', borderRadius: T.radius.inner, padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warning)', marginTop: 6, flexShrink: 0 }} />
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.6 }}>
                  Για νόμιμη βραχυχρόνια μίσθωση απαιτείται εγγραφή στο <strong>Μητρώο Ακινήτων Βραχυχρόνιας Διαμονής</strong> της ΑΑΔΕ και αναγραφή του <strong>ΑΜΑ</strong> σε κάθε ανάρτηση (Airbnb/Booking). Τα έσοδα δηλώνονται στο Ε2. Η σύγκριση εδώ είναι μεικτή — δεν περιλαμβάνει πλατφόρμες, καθαρισμό ή κενές περιόδους.
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
