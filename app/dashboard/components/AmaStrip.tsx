'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Η ΜΟΝΙΜΗ ΓΡΑΜΜΗ ΤΟΥ ΑΜΑ — ίδια στην κορυφή των «Πελάτες» και «Τιμολόγηση».
//
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ. Το app ήξερε ότι κάνεις Airbnb (`readStatus` → `rent_short`)
// και ΔΕΝ σου ζητούσε ποτέ τον ΑΜΑ: ζούσε ως ελεύθερο κείμενο σε κλειστό
// accordion άλλης καρτέλας, πίσω από τρίτο ανεξάρτητο διακόπτη. Το 2025
// στάλθηκαν 12.145 καταχωρίσεις για απενεργοποίηση επειδή ο ΑΜΑ έλειπε ή ήταν
// άκυρος — κυρίως επειδή δεν αναγραφόταν στην αγγελία.
//
// ΤΡΕΙΣ ΚΑΤΑΣΤΑΣΕΙΣ, ΟΧΙ ΔΥΟ. Η εγγραφή στο μητρώο δεν αρκεί: (α) δεν δηλώθηκε,
// (β) δηλώθηκε αλλά δεν επιβεβαιώθηκε ότι ΑΝΑΓΡΑΦΕΤΑΙ στην αγγελία, (γ) εντάξει
// — και τότε η γραμμή είναι σβηστή, ουδέτερη, δεν διεκδικεί προσοχή.
//
// ΔΕΝ ΕΙΝΑΙ ΠΙΣΩ ΑΠΟ PAYWALL, ΜΕ ΚΑΤΑΣΚΕΥΗ. Δεν δέχεται plan/entitlement, δεν
// τα διαβάζει, δεν έχει FeatureLock. «Ποτέ δεν χρεώνουμε για να δει κάποιος ότι
// έχει πρόβλημα» (docs/STRATEGY.md §3).
//
// ΔΕΝ ΕΙΝΑΙ ΔΙΑΓΝΩΣΗ ΜΟΝΟ, ΕΙΝΑΙ ΚΑΙ ΔΙΟΡΘΩΣΗ. Ο ΑΜΑ γράφεται από εδώ, στο
// `user_properties.ama` — μία στήλη του ακινήτου, όχι κείμενο σε ρυθμίσεις.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, Btn, fd } from '@/components/Theme';
import { saved } from '@/components/dbWrite';
import { TextInput } from './UIComponents';
import { amaState, amaSummary, cleanAma, isValidAmaFormat, amaLengthLooksUnusual, AMA_COPY, type AmaRow } from '@/lib/property/ama';

interface AmaProperty extends AmaRow { id: string; name: string }

export default function AmaStrip({ userId, propertyId }: { userId: string; propertyId?: string }) {
  const supabase = createClient();
  const [props, setProps] = useState<AmaProperty[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    let q = supabase.from('user_properties')
      .select('id,name,status_detail,rental_mode,ama,ama_listed_confirmed_at')
      .eq('user_id', userId);
    if (propertyId) q = q.eq('id', propertyId);
    const { data } = await q.order('created_at');
    setProps((data || []) as AmaProperty[]);
    setLoaded(true);
  }, [userId, propertyId]);

  useEffect(() => { load(); }, [load]);

  // Ζωντανή ενημέρωση: αν αλλάξει η κατάσταση του ακινήτου σε βραχυχρόνια από
  // άλλη οθόνη, η γραμμή εμφανίζεται μόνη της. Δεν περιμένει refresh.
  // Το όνομα του καναλιού είναι ΜΟΝΑΔΙΚΟ ανά προσάρτηση. Με σταθερό όνομα, δύο
  // αντίγραφα του ίδιου component στην ίδια σελίδα —ή ένα που ξαναπροσαρτάται
  // πριν προλάβει να καθαρίσει το προηγούμενο— πέφτουν πάνω στο ίδιο κανάλι, και
  // το `.on()` μετά το `subscribe()` πετά εξαίρεση που ρίχνει όλη την καρτέλα.
  // Η διπλοτυπία διορθώθηκε στο σημείο της· αυτό εδώ κάνει το λάθος αδύνατο.
  useEffect(() => {
    // Το μοναδικό επίθεμα παράγεται ΜΕΣΑ στο effect. Στο σώμα του component θα
    // ήταν ακάθαρτη κλήση κατά την απόδοση — και ο ίδιος ο έλεγχος lint το πιάνει.
    const unique = Math.random().toString(36).slice(2, 10);
    const ch = supabase.channel(`ama-strip-${userId}${propertyId || ''}-${unique}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_properties', filter: `user_id=eq.${userId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, propertyId, load]);

  const sum = useMemo(() => amaSummary(props), [props]);

  const saveAma = async (p: AmaProperty, value: string) => {
    const v = cleanAma(value);
    if (!isValidAmaFormat(v)) return;
    setBusy(true);
    // Νέος ΑΜΑ ⇒ η προηγούμενη επιβεβαίωση αγγελίας ΔΕΝ ισχύει πια.
    const ok = await saved('Ο αριθμός μητρώου δεν αποθηκεύτηκε', supabase.from('user_properties')
      .update({ ama: v, ama_listed_confirmed_at: v === (p.ama || '') ? p.ama_listed_confirmed_at : null })
      .eq('id', p.id));
    setBusy(false);
    if (!ok) return;
    setEditing(null); setDraft('');
    load();
  };

  const confirmListed = async (p: AmaProperty, on: boolean) => {
    setBusy(true);
    await saved('Η επιβεβαίωση αγγελίας δεν αποθηκεύτηκε', supabase.from('user_properties')
      .update({ ama_listed_confirmed_at: on ? new Date().toISOString() : null })
      .eq('id', p.id));
    setBusy(false);
    load();
  };

  // Κανένα ακίνητο βραχυχρόνιας ⇒ καμία γραμμή. Δεν ενοχλούμε όποιον δεν αφορά.
  if (!loaded || sum.shortTermCount === 0) return null;

  const rows = [...sum.missing, ...sum.unconfirmed, ...sum.ok];
  const worst = sum.worst as Exclude<typeof sum.worst, 'not_required'>;
  const allOk = worst === 'ok';
  const tone = AMA_COPY[worst].tone;

  const lbl: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
    color: 'var(--text-tertiary)', fontFamily: T.font.sans,
  };

  return (
    <div style={{
      // (γ) «εντάξει» = σβηστό: ουδέτερη επιφάνεια, κανένα χρώμα συναγερμού.
      background: allOk ? 'var(--bg-elevated)' : `var(--${tone}-soft)`,
      border: `1px solid ${allOk ? 'var(--border-subtle)' : `var(--${tone}-border)`}`,
      borderRadius: T.radius.inner, padding: '12px 16px', marginBottom: 14,
      fontFamily: T.font.sans,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 6,
          background: allOk ? 'var(--border-strong)' : `var(--${tone})`,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: allOk ? 'var(--text-secondary)' : `var(--${tone})` }}>
            {AMA_COPY[worst].title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 3 }}>
            {AMA_COPY[worst].body}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: rows.length ? 12 : 0 }}>
            {rows.map(p => {
              const st = amaState(p);
              const isEditing = editing === p.id;
              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                  borderRadius: 10, padding: '9px 12px',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', minWidth: 0, flex: '1 1 140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                  </span>

                  {isEditing ? (
                    <>
                      <div style={{ flex: '1 1 190px', minWidth: 150 }}>
                        <TextInput value={draft} onChange={v => setDraft(cleanAma(v))} placeholder="Αριθμός Μητρώου Ακινήτου" />
                      </div>
                      <Btn variant="primary" onClick={() => saveAma(p, draft)} disabled={busy || !isValidAmaFormat(draft)}>Αποθήκευση</Btn>
                      <Btn variant="ghost" onClick={() => { setEditing(null); setDraft(''); }}>Ακύρωση</Btn>
                    </>
                  ) : st === 'missing' ? (
                    <Btn variant="primary" onClick={() => { setEditing(p.id); setDraft(cleanAma(p.ama || '')); }}>Καταχώρησε τον ΑΜΑ</Btn>
                  ) : (
                    <>
                      <span style={{ fontSize: 12, fontFamily: T.font.mono, color: 'var(--text-secondary)' }}>ΑΜΑ {p.ama}</span>
                      <button onClick={() => { setEditing(p.id); setDraft(cleanAma(p.ama || '')); }}
                        style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontFamily: T.font.sans, padding: 0 }}>
                        Αλλαγή
                      </button>
                      {/* Η επιβεβαίωση είναι ρητή πράξη με ημερομηνία, όχι σιωπηλή
                          παραδοχή: όποιος αλλάξει αγγελία πρέπει να την ξανακάνει. */}
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
                        <input type="checkbox" checked={st === 'ok'} disabled={busy}
                          onChange={e => confirmListed(p, e.target.checked)}
                          style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer' }} />
                        Αναγράφεται στην αγγελία
                        {st === 'ok' && p.ama_listed_confirmed_at && (
                          <span style={{ ...lbl, color: 'var(--text-tertiary)' }}>επιβεβαιώθηκε {fd(p.ama_listed_confirmed_at)}</span>
                        )}
                      </label>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {editing && amaLengthLooksUnusual(draft) && (
            <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 8 }}>
              Ο αριθμός έχει {draft.length} ψηφία, που είναι ασυνήθιστο. Έλεγξέ τον στο myAADE πριν τον αποθηκεύσεις.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
