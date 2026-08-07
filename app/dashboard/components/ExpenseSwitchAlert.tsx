'use client';

// ═══════════════════════════════════════════════════════════════════════════
// «ΠΛΗΡΩΝΕΙΣ ΠΑΡΑΠΑΝΩ» — ΕΙΔΟΠΟΙΗΣΗ, ΟΧΙ ΚΑΡΤΕΛΑ.
//
// Η σύγκριση παρόχων και ασφαλειών ήταν δύο ολόκληρες καρτέλες. Κανείς δεν
// ανοίγει την εφαρμογή για να συγκρίνει τιμολόγια· ο ιδιοκτήτης θέλει να του
// ΠΟΥΝ ότι πληρώνει παραπάνω, και μετά να δει τη σύγκριση αν θέλει. Οι καρτέλες
// δεν σβήστηκαν: μπήκαν πίσω από το «Περισσότερα», και μπροστά έμεινε αυτή η μία
// γραμμή.
//
// ΠΟΤΕ ΔΕΝ ΕΜΦΑΝΙΖΕΤΑΙ: όταν δεν υπάρχουν δεδομένα να στηρίξουν διαφορά. Οι δύο
// συναρτήσεις που τη ζωντανεύουν (electricitySwitchFinding, insuranceSwitchFinding)
// επιστρέφουν `null` χωρίς πραγματική κατανάλωση ή χωρίς γνωστό ασφάλιστρο, και
// τότε αυτό το component δεν αποδίδει τίποτα. Καμία «ενδεικτική» ειδοποίηση.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, feAuto } from '@/components/Theme';
import { electricitySwitchFinding, type SwitchFinding } from './BillsElectricity';
import { insuranceSwitchFinding } from './BillsInsurance';

type Section = 'electricity' | 'insurance';

interface Row extends SwitchFinding { section: Section; title: string }

export default function ExpenseSwitchAlert({ propertyId, onOpen }: {
  propertyId: string;
  onOpen?: (section: Section) => void;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [dismissed, setDismissed] = useState<Set<Section>>(new Set());

  useEffect(() => {
    if (!propertyId) return;
    let alive = true;
    (async () => {
      try {
        const [{ data: setts }, { data: kwhRows }] = await Promise.all([
          supabase.from('bills_settings').select('section,data').eq('property_id', propertyId).in('section', ['electricity', 'insurance']),
          supabase.from('bills').select('kwh').eq('property_id', propertyId).eq('category', 'electricity').not('kwh', 'is', null).limit(12),
        ]);
        if (!alive) return;

        const bySection = (name: string) =>
          (setts ?? []).find((r: { section: string }) => r.section === name)?.data as Record<string, unknown> | undefined;
        const billsKwh = (kwhRows ?? [])
          .map((b: { kwh?: number | null }) => Number(b.kwh))
          .filter((n: number) => Number.isFinite(n) && n > 0);

        const next: Row[] = [];
        const elec = electricitySwitchFinding(bySection('electricity'), billsKwh);
        if (elec) next.push({ ...elec, section: 'electricity', title: 'Ρεύμα' });
        const ins = insuranceSwitchFinding(bySection('insurance'));
        if (ins) next.push({ ...ins, section: 'insurance', title: 'Ασφάλεια' });
        setRows(next);
      } catch { /* σιωπηλά: μια ειδοποίηση που δεν ήρθε δεν χαλάει καμία οθόνη */ }
    })();
    return () => { alive = false; };
  }, [propertyId]);

  const visible = rows.filter(r => !dismissed.has(r.section));
  if (visible.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      {visible.map(r => (
        <div key={r.section} style={{
          display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
          background: 'var(--surface-raised)', border: '1px solid var(--border-raised)',
          borderRadius: T.radius.card, padding: '12px 16px',
          boxShadow: 'var(--highlight-inset), var(--elev-1)',
        }}>
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 7 }} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
              {r.title}: πληρώνεις{' '}
              <strong style={{ fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{feAuto(r.current)}</strong>
              {' '}τον μήνα. Με {r.bestLabel}{' '}
              <strong style={{ fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{feAuto(r.best)}</strong>
              {' — διαφορά '}
              <strong style={{ fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{feAuto(r.savingsMonthly)}</strong>
              {' τον μήνα, '}
              <span style={{ color: 'var(--text-secondary)' }}>{feAuto(r.savingsMonthly * 12, 0)} τον χρόνο.</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 4 }}>
              Βάσει: {r.basedOn}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {onOpen && (
              <button type="button" onClick={() => onOpen(r.section)}
                style={{ height: T.h.sm, padding: '0 14px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, fontFamily: T.font.sans, cursor: 'pointer' }}>
                Δες τη σύγκριση
              </button>
            )}
            <button type="button" aria-label="Απόκρυψη" title="Απόκρυψη"
              onClick={() => setDismissed(d => new Set(d).add(r.section))}
              style={{ height: T.h.sm, width: T.h.sm, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: T.radius.pill, border: '1px solid transparent', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
