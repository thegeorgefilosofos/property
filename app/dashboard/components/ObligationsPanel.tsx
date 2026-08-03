'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ObligationsPanel, «Υποχρεώσεις & Προθεσμίες» στην Επισκόπηση.
//
// Διαβάζει δεδομένα ΑΛΛΩΝ tabs (ασφάλιση, ενοικιαστής, απογραφή) και τις θεσμικές
// προθεσμίες από τη ΜΙΑ πηγή (lib/tax/greekTaxCalendar.ts), και μπορεί να γράψει
// στο Ημερολόγιο με ένα κλικ — με ΤΟ ΙΔΙΟ κλειδί ταυτότητας (`source`) που
// χρησιμοποιεί και το Ημερολόγιο. Δεύτερο πάτημα, από όποια οθόνη: αντικατάσταση,
// όχι δεύτερη εγγραφή με άλλη ημερομηνία.
//
// Κάθε γραμμή λέει ΠΟΙΟΣ το κάνει (εμείς / εσύ / ο λογιστής) και, στις θεσμικές,
// ΠΟΣΟ σίγουρη είναι η ημερομηνία — «του νόμου» ή «περσινή, επιβεβαίωσέ την».
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, fdLong, SecHdr, Skeleton, Chip } from '@/components/Theme';
import { computeObligations, oblToCalendarCategory, calendarWritable, type Obligation, type OblProp, type OblMaint } from './obligations';
import { CONFIDENCE_LABEL, taxProfileOf } from '@/lib/tax/greekTaxCalendar';
import { WHO_LABEL } from '@/lib/accounting/dossier';
import { notifyError } from '@/components/Toast';

export default function ObligationsPanel({ propertyId, userId, prop, onNavigate }: {
  propertyId: string; userId: string; prop: OblProp; onNavigate: (tab: string) => void;
}) {
  const supabase = createClient();
  const [obls, setObls] = useState<Obligation[]>([]);
  const [added, setAdded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // Η load τρέχει τρία ερωτήματα· ώσπου να γυρίσουν, το `obls` ήταν κενό και η
  // κάρτα ΔΕΝ αποδιδόταν καθόλου. Εμφανιζόταν απότομα και έσπρωχνε προς τα κάτω
  // ό,τι είχε ήδη διαβάσει ο χρήστης στην Επισκόπηση.
  const [loading, setLoading] = useState(true);
  // Το φορολογικό προφίλ βγαίνει από την ΜΙΑ κατάσταση του ακινήτου, με τον ίδιο
  // κανόνα που χρησιμοποιεί το Ημερολόγιο. Καμία δεύτερη ανάγνωση της βάσης.
  const profile = taxProfileOf(prop);

  const load = useCallback(async () => {
    const { data: ten } = await supabase.from('tenants').select('id,lease_start,lease_end,monthly_rent').eq('property_id', propertyId).order('updated_at', { ascending: false }).limit(1);
    // Συντήρηση εξοπλισμού από την Απογραφή (graceful αν λείπει η στήλη est_cost πριν το migration).
    const { data: maint } = await supabase.from('inventory_maintenance').select('task,item_name,next_due,est_cost').eq('property_id', propertyId);
    const list = computeObligations(prop, ten?.[0] || null, (maint || []) as OblMaint[], new Date(), profile);
    setObls(list);
    // Δες αν οι υποχρεώσεις που γράφει ΑΥΤΗ η οθόνη είναι ήδη στο Ημερολόγιο —
    // με τα ίδια κλειδιά που θα έγραφε, όχι με ένα γενικό source. «Προστέθηκε»
    // λέγεται μόνο όταν υπάρχουν ΟΛΑ: ένα κλειδί μπορεί να το έχει γράψει άλλη
    // καρτέλα (π.χ. η λήξη μίσθωσης), και τότε οι φορολογικές λείπουν ακόμη.
    const keys = calendarWritable(list).map(o => o.source);
    if (keys.length) {
      const { data: rows } = await supabase.from('calendar_events').select('source').eq('property_id', propertyId).in('source', keys);
      const have = new Set((rows || []).map(r => r.source as string));
      setAdded(keys.every(k => have.has(k)));
    } else setAdded(false);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, profile, prop.insurance_expiry, prop.enfia]);

  useEffect(() => { load(); }, [load]);

  const writable = useMemo(() => calendarWritable(obls), [obls]);

  // Toggle: αν δεν είναι στο Ημερολόγιο τις προσθέτει, αλλιώς τις αφαιρεί.
  // Και στις δύο κατευθύνσεις μιλάμε για ΤΑ ΙΔΙΑ κλειδιά — αυτά που δείχνει η κάρτα.
  const toggleCalendar = async () => {
    if (!writable.length) return;
    const keys = writable.map(o => o.source);
    setSyncing(true);
    // Παλιές εγγραφές με το γενικό source 'obligations' (πριν το ενιαίο κλειδί):
    // φεύγουν πάντα, ώστε να μη μείνει ΕΝΦΙΑ με περσινή, λάθος ημερομηνία.
    await supabase.from('calendar_events').delete().eq('property_id', propertyId).eq('source', 'obligations');
    if (added) {
      const { error } = await supabase.from('calendar_events').delete().eq('property_id', propertyId).in('source', keys);
      setSyncing(false);
      if (!error) setAdded(false);
      else notifyError('Σφάλμα: ' + error.message);
      return;
    }
    // Upsert με το χέρι: σβήσε ΤΑ ΙΔΙΑ κλειδιά και ξαναγράψε (idempotent).
    await supabase.from('calendar_events').delete().eq('property_id', propertyId).in('source', keys);
    const rows = writable.map(o => ({
      property_id: propertyId, user_id: userId, title: o.title, event_date: o.date,
      category: oblToCalendarCategory(o.category), priority: o.priority, status: 'pending',
      recurring: false, notes: o.note, source: o.source,
    }));
    const { error } = await supabase.from('calendar_events').insert(rows);
    setSyncing(false);
    if (!error) setAdded(true);
    else notifyError('Σφάλμα: ' + error.message);
  };

  if (loading) return (
    <div className="card" style={{ marginBottom: 16 }}>
      <Skeleton w={180} h={10} style={{ marginBottom: 16 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[0, 1, 2].map(i => <Skeleton key={i} h={44} r={T.radius.inner} />)}
      </div>
    </div>
  );
  if (!obls.length) return null;
  const shown = obls.slice(0, 6);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <SecHdr label="Υποχρεώσεις & Προθεσμίες" sub="Φορολογικές και θεσμικές προθεσμίες, λήξεις ασφάλισης/μίσθωσης, συντήρηση" right={
        <button onClick={toggleCalendar} disabled={syncing || !writable.length}
          title={writable.length
            ? (added ? 'Αφαίρεση από το Ημερολόγιο' : `Προσθήκη ${writable.length} προθεσμιών στο Ημερολόγιο. Οι λήξεις ασφάλισης/μίσθωσης και οι συντηρήσεις μπαίνουν από τις δικές τους καρτέλες.`)
            : 'Δεν υπάρχει προθεσμία που να γράφει αυτή η κάρτα στο Ημερολόγιο'}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: T.h.sm, padding: '0 14px', borderRadius: T.radius.pill, border: added ? '1px solid var(--border-default)' : 'none', background: added ? 'transparent' : 'var(--accent)', color: added ? 'var(--text-secondary)' : 'var(--accent-text)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, cursor: syncing ? 'wait' : writable.length ? 'pointer' : 'not-allowed', opacity: writable.length ? 1 : 0.5, flexShrink: 0, transition: 'background 0.15s, color 0.15s' }}>
          {syncing ? 'Ενημέρωση…' : added ? 'Προστέθηκε στο Ημερολόγιο' : 'Προσθήκη στο Ημερολόγιο'}
        </button>
      } />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shown.map(o => {
          const overdue = o.daysUntil < 0;
          const dabs = Math.abs(o.daysUntil);
          const badge = overdue ? `${dabs} ${dabs === 1 ? 'ημέρα' : 'ημέρες'} πριν` : o.daysUntil === 0 ? 'Σήμερα' : `σε ${o.daysUntil} ${o.daysUntil === 1 ? 'ημέρα' : 'ημέρες'}`;
          return (
            <div key={o.id} onClick={() => {
                // Οι φορολογικές προθεσμίες οδηγούν στη Λογιστική, εκεί που ο φάκελος
                // λέει αναλυτικά ποιος φέρνει τι.
                onNavigate(o.category === 'tax' ? 'accounting' : o.category === 'financial' ? 'settings' : o.category === 'contract' ? 'tenant' : o.category === 'maintenance' ? 'inventory' : 'calendar');
                // Λήξη μίσθωσης: άνοιξε κατευθείαν το μισθωτήριο για ανανέωση, αντί να
                // αφήσει τον χρήστη να το ψάξει μόνος του στην καρτέλα.
                if (o.id === 'lease_end') setTimeout(() => window.dispatchEvent(new CustomEvent('pos:lease')), 60);
              }}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '10px 16px', cursor: 'pointer' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border-subtle)', marginTop: 6, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{o.title}</span>
                  <span style={{ fontFamily: T.font.mono, fontSize: 11, fontWeight: 700, color: o.tone === 'negative' ? 'var(--negative)' : o.tone === 'warning' ? 'var(--warning)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{badge}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', margin: '5px 0 3px' }}>
                  <Chip tone="neutral" title="Ποιος κάνει αυτή τη δουλειά">{WHO_LABEL[o.who]}</Chip>
                  {o.confidence && (
                    <Chip tone={o.confidence === 'statutory' ? 'neutral' : 'warning'} title={o.confidence === 'statutory' ? 'Σταθερή προθεσμία που ορίζει ο νόμος' : 'Η ακριβής ημερομηνία ανακοινώνεται κάθε χρόνο — επιβεβαίωσέ την στην πηγή'}>
                      {CONFIDENCE_LABEL[o.confidence]}
                    </Chip>
                  )}
                  {o.officialUrl && (
                    <a href={o.officialUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                      style={{ fontFamily: T.font.sans, fontSize: 11, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>myAADE</a>
                  )}
                </div>
                <div style={{ fontFamily: T.font.sans, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
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
