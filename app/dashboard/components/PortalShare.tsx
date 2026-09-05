'use client';

// ═══════════════════════════════════════════════════════════════════════════
// PortalShare, πλευρά ιδιοκτήτη για την Πύλη ενοικιαστή. Δημιουργεί/κοινοποιεί
// τον σύνδεσμο και εμφανίζει τα εισερχόμενα αιτήματα βλάβης (cross-tab).
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Inbox } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import * as expenses from '@/lib/data/expenses';
import * as calendar from '@/lib/data/calendar'
import * as tenantStore from '@/lib/data/tenants';
import * as portalStore from '@/lib/data/portal';
import { T, fd, fe, EmptyState, Skeleton, pressable } from '@/components/Theme';
import { notify, notifyOk, notifyError } from '@/components/Toast';
import { athensToday } from '@/lib/core/time';
import { saved, savedData } from '@/components/dbWrite';
import { failed } from '@/lib/core/dbError';
import { photosKey, signMaintenancePhotos } from '@/lib/maintenance/photos';
import { useLoad } from '@/app/hooks/useLoad';

interface Req { id: string; title: string; description: string | null; contact: string | null; status: string; created_at: string; photos?: string[] | null; }

// Ο σύνδεσμος της πύλης ανήκει σε ΑΝΘΡΩΠΟ, όχι σε θέση.
//
// Όσο το portal_links κρατούσε μόνο property_id, η get_portal_data έβρισκε τον
// ενοικιαστή ως «ο πιο πρόσφατος του ακινήτου». Όταν άλλαζε ενοικιαστής, το
// παλιό token συνέχιζε να δουλεύει και άρχιζε να δείχνει τα στοιχεία του νέου:
// ονοματεπώνυμο, μίσθωμα, εγγύηση, IBAN, απλήρωτα. Ο παλιός δεν χρειαζόταν να
// κάνει τίποτα — αρκούσε να ξανανοίξει έναν σύνδεσμο που είχε ήδη.
//
// Εδώ κλείνει η πλευρά της εφαρμογής: κάθε νέος σύνδεσμος γεννιέται δεμένος
// στον σημερινό ενοικιαστή και όταν αλλάξει ενοικιαστής ο ιδιοκτήτης το βλέπει
// και εκδίδει νέο. Το ίδιο σχήμα με τη βάση (uuid χωρίς παύλες).
const newToken = () => crypto.randomUUID().replace(/-/g, '');

export default function PortalShare({ propertyId, userId }: { propertyId: string; userId: string }) {
  const supabase = createClient();
  const [token, setToken] = useState<string | null>(null);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [payLink, setPayLink] = useState('');       // σύνδεσμος πληρωμής ιδιοκτήτη
  const [pinSet, setPinSet] = useState(false);       // αν έχει οριστεί PIN πύλης
  const [pinInput, setPinInput] = useState('');
  const [cfgOpen, setCfgOpen] = useState(false);     // πτυσσόμενες ρυθμίσεις πύλης
  const [synced, setSynced] = useState<Set<string>>(new Set());   // αιτήματα που πήγαν στο Ημερολόγιο (τρέχουσα συνεδρία)
  const [costFor, setCostFor] = useState<string | null>(null);    // ποιο αίτημα καταχωρεί δαπάνη
  const [cost, setCost] = useState('');
  // Όσο τρέχουν τα δύο ερωτήματα, το token είναι null και τα reqs κενά: η κάρτα
  // έδειχνε τη ΛΑΘΟΣ κατάσταση («ενεργοποίησε πύλη», «κανένα αίτημα») και μετά
  // αναβόσβηνε στη σωστή. Ο σκελετός κρατά τη θέση μέχρι να μάθουμε την αλήθεια.
  const [loading, setLoading] = useState(true);
  const [linkTenant, setLinkTenant] = useState<string | null>(null);              // σε ποιον ενοικιαστή είναι δεμένος ο σύνδεσμος
  const [tenant, setTenant] = useState<{ id: string; full_name: string | null } | null>(null);  // ποιος μένει τώρα
  // Το maintenance-photos είναι ΙΔΙΩΤΙΚΟ bucket: το αποθηκευμένο είναι
  // διαδρομή, όχι διεύθυνση. Η κάρτα την έβαζε ωμή στο <img src> και ο
  // περιηγητής τη διάβαζε ως σχετικό URL πάνω στο /dashboard: 404 και
  // σπασμένη εικόνα σε κάθε αίτημα με φωτογραφίες. Ιδια υπογραφή με το
  // MaintenanceView, από το ίδιο σημείο.
  const [signedPhotos, setSignedPhotos] = useState<Record<string, string[]>>({});

  const load = useCallback(async () => {
    const { row } = await portalStore.link(supabase, propertyId, userId);
    setToken(row?.token || null);
    setPayLink(row?.payment_link || '');
    setPinSet(!!row?.pin_hash);
    setLinkTenant(row?.tenant_id || null);
    // «Ο τρέχων μισθωτής» έρχεται από το στρώμα, που τον ορίζει μία φορά για
    // όλη την εφαρμογή: όποιος δεν έχει φύγει, με τη νεότερη μίσθωση πρώτη. Εδώ
    // έλεγε «ο πιο πρόσφατα δημιουργημένος», που είναι άλλος άνθρωπος όταν ο
    // ιδιοκτήτης διορθώσει παλιά καταχώρηση.
    const t = await tenantStore.current<{ id: string; full_name: string }>(supabase, propertyId, tenantStore.NAME_COLUMNS, userId);
    setTenant(t || null);
    const { data: r } = await supabase.from('maintenance_requests').select('*').eq('property_id', propertyId).eq('user_id', userId).order('created_at', { ascending: false });
    setReqs((r as Req[]) || []);
    setLoading(false);
  }, [propertyId, userId]);

  const saveLink = async () => {
    setBusy(true);
    const v = payLink.trim();
    const ok = await saved('Ο σύνδεσμος πληρωμής δεν αποθηκεύτηκε',
      portalStore.savePaymentLink(supabase, propertyId, userId, v));
    setBusy(false);
    if (ok) notifyOk('Ο σύνδεσμος πληρωμής αποθηκεύτηκε');
  };
  // Η ΚΛΕΙΔΑΡΙΑ ΠΟΥ ΕΛΕΓΕ «ΚΛΕΙΔΩΣΑ» ΧΩΡΙΣ ΝΑ ΤΟ ΞΕΡΕΙ.
  //
  // Η set_portal_pin επιστρέφει boolean: ψευδές όταν το UPDATE δεν άγγιξε καμία
  // γραμμή — ξένο ή ανύπαρκτο token, ληγμένη συνεδρία. Οι δύο χειριστές πέταγαν
  // και το `data` και το `error` και έλεγαν ΠΑΝΤΑ «Ο κωδικός πύλης ορίστηκε».
  // Ο ιδιοκτήτης έφευγε πιστεύοντας ότι κλείδωσε την πύλη του ενοικιαστή, με
  // pin_hash ακόμη null: ο σύνδεσμος άνοιγε σε όποιον τον είχε. Δίπλα, η
  // saveLink έκανε ήδη το σωστό με τη `saved`. Ιδια σύμβαση και εδώ.
  const writePin = async (pin: string): Promise<boolean> => {
    if (!token) return false;
    const what = pin ? 'Ο κωδικός πύλης δεν ορίστηκε' : 'Ο κωδικός πύλης δεν καταργήθηκε';
    setBusy(true);
    const ok = await savedData<boolean>(what, supabase.rpc('set_portal_pin', { p_token: token, p_pin: pin }));
    setBusy(false);
    // `null` σημαίνει σφάλμα και ο χρήστης το έχει ήδη δει. `false` σημαίνει
    // ότι η κλήση πέτυχε αλλά δεν βρέθηκε δική σου γραμμή με αυτό το token.
    if (ok === null) return false;
    if (!ok) { notifyError(failed(what)); return false; }
    return true;
  };
  const savePin = async () => {
    const pin = pinInput.trim();
    if (!await writePin(pin)) return;
    setPinSet(!!pin); setPinInput('');
    notifyOk(pin ? 'Ο κωδικός πύλης ορίστηκε' : 'Ο κωδικός πύλης καταργήθηκε');
  };
  const clearPin = async () => {
    if (!await writePin('')) return;
    setPinSet(false); setPinInput(''); notifyOk('Ο κωδικός πύλης καταργήθηκε');
  };

  useLoad(load);

  const photoSig = useMemo(() => photosKey(reqs), [reqs]);
  useEffect(() => {
    let alive = true;
    signMaintenancePhotos(supabase, reqs).then(map => { if (alive) setSignedPhotos(map); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoSig]);

  const enable = async () => {
    setBusy(true);
    // Το tenant_id μπαίνει ΤΩΡΑ, στη γέννηση του συνδέσμου. Αν το ακίνητο δεν
    // έχει ακόμη ενοικιαστή μένει null — δεν υπάρχει κάτι να διαρρεύσει — και ο
    // ιδιοκτήτης θα δει το κουμπί δεσίματος μόλις καταχωρήσει τον πρώτο.
    const { data, error } = await portalStore.create(supabase, propertyId, userId, tenant?.id ?? null);
    setBusy(false);
    if (!error && data) { setToken(data.token); setLinkTenant(data.tenant_id || null); }
    else if (error) notifyError(failed('Η ρύθμιση της πύλης δεν αποθηκεύτηκε', error));
  };

  // Δέσιμο σε ενοικιαστή που δεν είχε δεθεί ποτέ. Ο σύνδεσμος ήδη έδειχνε αυτόν
  // (fallback «ο πιο πρόσφατος»), οπότε κανείς δεν χάνει και δεν κερδίζει
  // πρόσβαση — το token μένει ίδιο και ο ενοικιαστής δεν χρειάζεται νέο.
  const bind = async () => {
    if (!tenant) return;
    setBusy(true);
    const { error } = await portalStore.bindTenant(supabase, propertyId, userId, tenant.id);
    setBusy(false);
    if (error) { notifyError(failed('Η ρύθμιση της πύλης δεν αποθηκεύτηκε', error)); return; }
    setLinkTenant(tenant.id);
    notifyOk('Ο σύνδεσμος δέθηκε στον τρέχοντα ενοικιαστή');
  };

  // Αλλαγή ενοικιαστή: ΔΕΝ αρκεί να αλλάξει το tenant_id — ο προηγούμενος έχει
  // ήδη το token στο κινητό του. Γυρίζει και το token, οπότε ο παλιός σύνδεσμος
  // πεθαίνει την ίδια στιγμή και ο νέος ενοικιαστής παίρνει δικό του.
  const reissue = async () => {
    if (!tenant) return;
    setBusy(true);
    const t = newToken();
    const { error } = await portalStore.reissue(supabase, propertyId, userId, tenant.id, t);
    setBusy(false);
    if (error) { notifyError(failed('Η ρύθμιση της πύλης δεν αποθηκεύτηκε', error)); return; }
    setToken(t); setLinkTenant(tenant.id); setCopied(false);
    notifyOk('Νέος σύνδεσμος. Ο παλιός έπαψε να ισχύει· στείλε τον νέο στον ενοικιαστή.');
  };

  // Δεμένος σε ΑΛΛΟΝ από αυτόν που μένει τώρα: ο παλιός σύνδεσμος δείχνει σε
  // άνθρωπο που έφυγε. Χωρίς τρέχοντα ενοικιαστή δεν υπάρχει κρίση να γίνει.
  const staleLink = !!token && !!tenant && !!linkTenant && linkTenant !== tenant.id;
  const unboundLink = !!token && !!tenant && !linkTenant;

  // Η ΔΙΕΥΘΥΝΣΗ ΕΡΧΕΤΑΙ ΑΠΟ ΤΟ ΠΕΡΙΒΑΛΛΟΝ, ΟΧΙ ΑΠΟ ΤΟΝ ΠΕΡΙΗΓΗΤΗ. Αυτός ο
  // σύνδεσμος φεύγει σε άλλον άνθρωπο: γραμμένος από το `location.origin`, ο
  // ιδιοκτήτης που δούλευε σε διεύθυνση προεπισκόπησης θα έστελνε στον μισθωτή
  // του διεύθυνση που αύριο δεν απαντά.
  const url = portalStore.portalUrl(token);
  const copy = () => { if (url) { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } };
  const setStatus = async (id: string, status: string) => {
    if (await saved('Η κατάσταση του αιτήματος δεν άλλαξε',
      supabase.from('maintenance_requests').update({ status }).eq('id', id))) load();
  };

  // Cross-tab: αίτημα βλάβης → Ημερολόγιο (προγραμματισμός επισκευής)
  const toCalendar = async (r: Req) => {
    const today = athensToday();
    const { error } = await calendar.insert(supabase, [calendar.row({ propertyId, userId }, 'portal', {
      title: `Επισκευή: ${r.title}`, category: 'maintenance',
      event_date: today, priority: 'high',
      notes: r.description ? `Αίτημα ενοικιαστή, ${r.description}` : 'Αίτημα ενοικιαστή',
    })]);
    if (error) { notifyError('Σφάλμα μεταφοράς στο Ημερολόγιο'); return; }
    setSynced(prev => new Set(prev).add(r.id));
    if (r.status === 'new') setStatus(r.id, 'in_progress');
    notifyOk(`«${r.title}» προστέθηκε στο Ημερολόγιο (σήμερα), άλλαξε ημερομηνία από την καρτέλα Ημερολόγιο.`);
  };

  // Cross-tab: ολοκληρωμένο αίτημα ως Δαπάνη (κόστος επισκευής)
  const toExpense = async (r: Req) => {
    const amt = parseFloat(cost.replace(',', '.'));
    if (!amt || amt <= 0) { notify('Βάλε έγκυρο ποσό', { tone: 'warning' }); return; }
    const { error } = await expenses.insert(supabase, [expenses.row({ propertyId, userId }, {
      description: `Επισκευή: ${r.title}`, amount: amt,
      category: 'Συντήρηση & Επισκευές',
      date: athensToday(), paid: true,
      notes: r.description ? `Από αίτημα ενοικιαστή, ${r.description}` : 'Από αίτημα ενοικιαστή',
    })]);
    if (error) { notifyError('Σφάλμα καταχώρησης δαπάνης'); return; }
    setCostFor(null); setCost('');
    notifyOk(`Δαπάνη ${fe(amt)} καταχωρήθηκε στις Δαπάνες.`);
  };

  const pending = reqs.filter(r => r.status !== 'done');
  const STATUS_META: Record<string, { label: string; tone: string }> = {
    new:         { label: 'Νέο',          tone: 'neutral' },
    in_progress: { label: 'Σε εξέλιξη',   tone: 'accent' },
    done:        { label: 'Ολοκληρώθηκε', tone: 'positive' },
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="po-disclosure" {...pressable(() => setOpen(o => !o))}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: T.font.sans, fontSize: 'var(--fs-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>Πύλη ενοικιαστή</div>
            <div style={{ fontFamily: T.font.sans, fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', marginTop: 1 }}>Κοινοποίηση συνδέσμου και αιτήματα βλάβης</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {pending.length > 0 && <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'var(--fs-xs)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', fontFamily: T.font.sans }}>{pending.length}</span>}
          <svg aria-hidden="true" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><path d="m6 9 6 6 6-6"/></svg>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skeleton h={T.h.md} r={10} />
              {[0, 1].map(i => <Skeleton key={i} h={56} r={10} />)}
            </div>
          ) : !token ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5, flex: 1, minWidth: 200 }}>Ενεργοποίησε έναν ασφαλή σύνδεσμο που μπορεί να μοιραστεί ο ενοικιαστής σου, βλέπει ενοίκιο/σύμβαση και στέλνει αιτήματα.</div>
              <button onClick={enable} disabled={busy} style={{ height: T.h.md, padding: '0 16px', borderRadius: T.radius.pill, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{busy ? 'Ενεργοποίηση…' : 'Ενεργοποίηση πύλης'}</button>
            </div>
          ) : (
            <>
              {/* Ο σύνδεσμος δείχνει σε άνθρωπο που έφυγε. Ο ιδιοκτήτης δεν είχε
                  ως τώρα κανέναν τρόπο να το δει — και ο παλιός ενοικιαστής
                  έβλεπε τα στοιχεία του νέου. Μία πρόταση, ένα κουμπί. */}
              {staleLink && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                  <div style={{ fontFamily: T.font.sans, fontSize: 'var(--fs-xs)', color: 'var(--warning-on-container)', lineHeight: 1.5, flex: 1, minWidth: 200 }}>
                    Ο σύνδεσμος ανήκει στον προηγούμενο ενοικιαστή. Έκδωσε νέον για <strong>{tenant?.full_name || 'τον σημερινό ενοικιαστή'}</strong>, ο παλιός παύει αμέσως να ισχύει.
                  </div>
                  <button onClick={reissue} disabled={busy} style={{ height: T.h.sm, padding: '0 14px', borderRadius: T.radius.pill, border: 'none', background: 'var(--warning)', color: 'var(--on-tone)', fontFamily: T.font.sans, fontSize: 'var(--fs-xs)', fontWeight: 700, cursor: busy ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>{busy ? 'Έκδοση…' : 'Έκδοση νέου συνδέσμου'}</button>
                </div>
              )}
              {unboundLink && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                  <div style={{ fontFamily: T.font.sans, fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', lineHeight: 1.5, flex: 1, minWidth: 200 }}>
                    Ο σύνδεσμος δεν είναι δεμένος σε ενοικιαστή, οπότε θα ακολουθεί όποιον μένει κάθε φορά. Δέσ&apos; τον στον <strong>{tenant?.full_name || 'σημερινό ενοικιαστή'}</strong>, ο ίδιος σύνδεσμος συνεχίζει να δουλεύει.
                  </div>
                  <button onClick={bind} disabled={busy} style={{ height: T.h.sm, padding: '0 14px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 'var(--fs-xs)', fontWeight: 700, cursor: busy ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>{busy ? 'Δέσιμο…' : 'Δέσιμο στον ενοικιαστή'}</button>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                <input aria-label="Σύνδεσμος πύλης" readOnly value={url} onFocus={e => e.currentTarget.select()} style={{ flex: 1, minWidth: 200, background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '9px 12px', fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.mono, outline: 'none' }} />
                <button onClick={copy} style={{ height: T.h.md, padding: '0 16px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{copied ? 'Αντιγράφηκε' : 'Αντιγραφή'}</button>
                <a href={url} target="_blank" rel="noopener noreferrer" style={{ height: T.h.md, display: 'inline-flex', alignItems: 'center', padding: '0 16px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Άνοιγμα</a>
              </div>

              {/* Ρυθμίσεις πύλης: κωδικός προστασίας + σύνδεσμος πληρωμής */}
              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
                <div className="po-disclosure" style={{ gap: 10 }} {...pressable(() => setCfgOpen(o => !o))}>
                  <div style={{ fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Ρυθμίσεις πύλης</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 'var(--fs-xs)', fontFamily: T.font.sans, color: pinSet ? 'var(--positive)' : 'var(--text-tertiary)' }}>{pinSet ? 'Κωδικός ενεργός' : 'Χωρίς κωδικό'}</span>
                    <svg aria-hidden="true" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: cfgOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </div>
                {cfgOpen && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <div style={{ fontSize: 'var(--fs-xs)', fontFamily: T.font.sans, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 6 }}>Σύνδεσμος πληρωμής (προαιρετικό)</div>
                      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginBottom: 8, lineHeight: 1.5 }}>Επικόλλησε τον σύνδεσμο του παρόχου σου (Stripe, Viva, PayPal, Revolut). Ο ενοικιαστής βλέπει κουμπί «Πληρωμή τώρα» και πληρώνει εκεί, όχι εδώ.</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input aria-label="Σύνδεσμος πληρωμής" value={payLink} onChange={e => setPayLink(e.target.value)} placeholder="https://..." style={{ flex: 1, minWidth: 180, background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '9px 12px', fontSize: 12, color: 'var(--text-primary)', fontFamily: T.font.mono, outline: 'none' }} />
                        <button onClick={saveLink} disabled={busy} style={{ height: T.h.md, padding: '0 16px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Αποθήκευση</button>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 'var(--fs-xs)', fontFamily: T.font.sans, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 6 }}>Κωδικός προστασίας</div>
                      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginBottom: 8, lineHeight: 1.5 }}>Χωρίς αυτόν δεν ανοίγει η πύλη. Δώσ&apos; τον μόνο στον ενοικιαστή σου.</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input aria-label="Κωδικός PIN" value={pinInput} onChange={e => setPinInput(e.target.value)} inputMode="numeric" placeholder={pinSet ? 'Νέος κωδικός' : 'π.χ. 4 ψηφία'} style={{ flex: 1, minWidth: 140, background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '9px 12px', fontSize: 12, color: 'var(--text-primary)', fontFamily: T.font.num, outline: 'none' }} />
                        <button onClick={savePin} disabled={busy || !pinInput.trim()} style={{ height: T.h.md, padding: '0 16px', borderRadius: T.radius.pill, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, cursor: pinInput.trim() ? 'pointer' : 'not-allowed', opacity: pinInput.trim() ? 1 : 0.6 }}>{pinSet ? 'Αλλαγή' : 'Ορισμός'}</button>
                        {pinSet && <button onClick={clearPin} disabled={busy} style={{ height: T.h.md, padding: '0 14px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Κατάργηση</button>}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ fontFamily: T.font.sans, fontSize: 'var(--fs-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 8 }}>Αιτήματα ({pending.length} εκκρεμή)</div>
              {reqs.length === 0 ? (
                <EmptyState icon={<Inbox size={20} />} title="Κανένα αίτημα ακόμη" hint="Όταν ο ενοικιαστής στείλει αίτημα βλάβης από την πύλη, θα εμφανιστεί εδώ." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {reqs.slice(0, 8).map(r => {
                    const st = STATUS_META[r.status] || STATUS_META.new;
                    const done = r.status === 'done';
                    return (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '10px 12px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontFamily: T.font.sans, fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.6 : 1 }}>{r.title}</span>
                            <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: `var(--${st.tone})`, background: `var(--${st.tone}-soft)`, border: `1px solid var(--${st.tone}-border)`, borderRadius: T.radius.badge, padding: '3px 9px', fontFamily: T.font.sans }}>{st.label}</span>
                          </div>
                          {r.description && <div style={{ fontFamily: T.font.sans, fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', marginTop: 4, lineHeight: 1.5 }}>{r.description}</div>}
                          {(signedPhotos[r.id]?.length ?? 0) > 0 && (
                            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                              {signedPhotos[r.id].slice(0, 4).map((url, pi) => (
                                <a key={pi} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: 44, height: 44, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} alt="Φωτογραφία βλάβης" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                </a>
                              ))}
                            </div>
                          )}
                          <div style={{ fontFamily: T.font.sans, fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', marginTop: 4 }}>{fd(r.created_at)}{r.contact ? ` · ${r.contact}` : ''}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                          {r.status === 'new' && <button onClick={() => setStatus(r.id, 'in_progress')} style={{ height: T.h.sm, padding: '0 10px', borderRadius: T.radius.pill, border: '1px solid var(--accent-border)', background: 'var(--bg-surface)', color: 'var(--accent)', fontFamily: T.font.sans, fontSize: 'var(--fs-xs)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Ξεκίνησε</button>}
                          {r.status === 'in_progress' && <button onClick={() => setStatus(r.id, 'done')} style={{ height: T.h.sm, padding: '0 10px', borderRadius: T.radius.pill, border: '1px solid var(--accent-border)', background: 'var(--bg-surface)', color: 'var(--accent)', fontFamily: T.font.sans, fontSize: 'var(--fs-xs)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Ολοκλήρωση</button>}
                          {!done && <button onClick={() => toCalendar(r)} disabled={synced.has(r.id)} style={{ height: T.h.sm, padding: '0 10px', borderRadius: T.radius.pill, border: '1px solid var(--accent-border)', background: 'transparent', color: synced.has(r.id) ? 'var(--text-tertiary)' : 'var(--accent)', fontFamily: T.font.sans, fontSize: 'var(--fs-xs)', fontWeight: 700, cursor: synced.has(r.id) ? 'default' : 'pointer', whiteSpace: 'nowrap', opacity: synced.has(r.id) ? 0.6 : 1 }}>{synced.has(r.id) ? 'Στο Ημερολόγιο' : 'Ημερολόγιο'}</button>}
                          {done && costFor !== r.id && <button onClick={() => { setCostFor(r.id); setCost(''); }} style={{ height: T.h.sm, padding: '0 10px', borderRadius: T.radius.pill, border: '1px solid var(--accent-border)', background: 'transparent', color: 'var(--accent)', fontFamily: T.font.sans, fontSize: 'var(--fs-xs)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>ως Δαπάνη</button>}
                          {done && costFor === r.id && (
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <input aria-label="Ποσό δαπάνης σε ευρώ" autoFocus value={cost} onChange={e => setCost(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') toExpense(r); if (e.key === 'Escape') setCostFor(null); }} placeholder="€" inputMode="decimal" style={{ width: 56, height: T.h.sm, background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '0 8px', fontSize: 'var(--fs-xs)', color: 'var(--text-primary)', fontFamily: T.font.mono, outline: 'none', textAlign: 'right' }} />
                              <button onClick={() => toExpense(r)} style={{ height: T.h.sm, padding: '0 8px', borderRadius: T.radius.badge, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontFamily: T.font.sans, fontSize: 'var(--fs-xs)', fontWeight: 700, cursor: 'pointer' }}>OK</button>
                            </div>
                          )}
                          {done && <button onClick={() => setStatus(r.id, 'new')} style={{ height: T.h.sm, padding: '0 10px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-tertiary)', fontFamily: T.font.sans, fontSize: 'var(--fs-xs)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Επαναφορά</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
