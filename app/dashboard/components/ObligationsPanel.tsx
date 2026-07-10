'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ObligationsPanel, «Υποχρεώσεις & Προθεσμίες» στην Επισκόπηση. Διαβάζει
// δεδομένα ΑΛΛΩΝ tabs (ασφάλιση, ενοικιαστής) και θεσμικές προθεσμίες, και
// μπορεί να τα ΓΡΑΨΕΙ στο Ημερολόγιο (cross-tab) με ένα κλικ.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, fdLong } from '@/components/Theme';
import { computeObligations, oblToCalendarCategory, type Obligation, type OblProp } from './obligations';

export default function ObligationsPanel({ propertyId, userId, prop, onNavigate }: {
  propertyId: string; userId: string; prop: OblProp; onNavigate: (tab: string) => void;
}) {
  const supabase = createClient();
  const [obls, setObls] = useState<Obligation[]>([]);
  const [added, setAdded] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    const { data: ten } = await supabase.from('tenants').select('lease_start,lease_end,monthly_rent').eq('property_id', propertyId).order('updated_at', { ascending: false }).limit(1);
    // Συντήρηση εξοπλισμού από την Απογραφή (graceful αν λείπει η στήλη est_cost πριν το migration).
    const { data: maint } = await supabase.from('inventory_maintenance').select('task,item_name,next_due,est_cost').eq('property_id', propertyId);
    setObls(computeObligations(prop, ten?.[0] || null, (maint || []) as any));
    // Δες αν οι υποχρεώσεις είναι ήδη περασμένες στο Ημερολόγιο
    const { count } = await supabase.from('calendar_events').select('id', { count: 'exact', head: true }).eq('property_id', propertyId).eq('source', 'obligations');
    setAdded((count || 0) > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, prop.insurance_expiry, prop.enfia]);

  useEffect(() => { load(); }, [load]);

  // Toggle: αν δεν είναι στο Ημερολόγιο τις προσθέτει, αλλιώς τις αφαιρεί.
  const toggleCalendar = async () => {
    if (!obls.length) return;
    setSyncing(true);
    if (added) {
      const { error } = await supabase.from('calendar_events').delete().eq('property_id', propertyId).eq('source', 'obligations');
      setSyncing(false);
      if (!error) setAdded(false);
      else alert('Σφάλμα: ' + error.message);
      return;
    }
    // Καθάρισε τυχόν παλιές αυτόματες εγγραφές και ξαναγράψε (idempotent)
    await supabase.from('calendar_events').delete().eq('property_id', propertyId).eq('source', 'obligations');
    const rows = obls.map(o => ({
      property_id: propertyId, user_id: userId, title: o.title, event_date: o.date,
      category: oblToCalendarCategory(o.category), priority: o.priority, status: 'pending',
      recurring: false, notes: o.note, source: 'obligations',
    }));
    const { error } = await supabase.from('calendar_events').insert(rows);
    setSyncing(false);
    if (!error) setAdded(true);
    else alert('Σφάλμα: ' + error.message);
  };

  if (!obls.length) return null;
  const shown = obls.slice(0, 6);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>Υποχρεώσεις & Προθεσμίες</div>
            <div style={{ fontFamily: T.font.sans, fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>Φορολογικές & θεσμικές προθεσμίες + λήξεις ασφάλισης/μίσθωσης + συντήρηση</div>
          </div>
        </div>
        <button onClick={toggleCalendar} disabled={syncing} title={added ? 'Αφαίρεση από το Ημερολόγιο' : 'Προσθήκη στο Ημερολόγιο'}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: T.radius.pill, border: added ? '1px solid var(--border-default)' : 'none', background: added ? 'transparent' : 'var(--accent)', color: added ? 'var(--text-secondary)' : 'var(--accent-text)', fontFamily: T.font.sans, fontSize: 11, fontWeight: 700, cursor: syncing ? 'wait' : 'pointer', flexShrink: 0, transition: 'background 0.15s, color 0.15s' }}>
          {syncing ? 'Ενημέρωση…' : added ? 'Προστέθηκε στο Ημερολόγιο' : 'Προσθήκη στο Ημερολόγιο'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shown.map(o => {
          const overdue = o.daysUntil < 0;
          const dabs = Math.abs(o.daysUntil);
          const badge = overdue ? `${dabs} ${dabs === 1 ? 'ημέρα' : 'ημέρες'} πριν` : o.daysUntil === 0 ? 'Σήμερα' : `σε ${o.daysUntil} ${o.daysUntil === 1 ? 'ημέρα' : 'ημέρες'}`;
          return (
            <div key={o.id} onClick={() => onNavigate(o.category === 'financial' ? 'settings' : o.category === 'contract' ? 'tenant' : o.category === 'maintenance' ? 'inventory' : 'calendar')}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '10px 14px', cursor: 'pointer' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border-subtle)', marginTop: 6, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{o.title}</span>
                  <span style={{ fontFamily: T.font.mono, fontSize: 11, fontWeight: 700, color: o.tone === 'negative' ? 'var(--negative)' : o.tone === 'warning' ? 'var(--warning)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{badge}</span>
                </div>
                <div style={{ fontFamily: T.font.sans, fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, lineHeight: 1.5 }}>
                  <span style={{ fontFamily: T.font.mono, color: 'var(--text-secondary)' }}>{fdLong(o.date)}</span> · {o.note}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
