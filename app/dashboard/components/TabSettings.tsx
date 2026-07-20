'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Λογαριασμός — μία καθαρή σελίδα με κύλιση (προφίλ, συνδρομή, προτιμήσεις,
// ειδοποιήσεις, δεδομένα & απόρρητο). Στυλ fintech: κάρτες, SecHdr, tokens.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import NotificationSettings from './NotificationSettings';
import { CustomSelect, Toggle } from './UIComponents';
import { T, Card, SecHdr, Btn, TierBadge, InfoBanner, PageTitle, fdLong } from '@/components/Theme';
import { AppPreferences, DEFAULT_PREFERENCES } from './useAppPreferences';
import { downloadCsv } from './exportCsv';
import Billing from './Billing';
import ReportBranding from './ReportBranding';
import { ThemeToggle } from './ThemeToggle';
import SettingsRoadmap from './SettingsRoadmap';
import PlanComparison from './PlanComparison';
import SecuritySettings from './SecuritySettings';
import OrgTeam from './OrgTeam';
import { exportAllData } from '@/lib/dataExport';
import { PLANS } from '@/lib/billing/plans';
import { effectivePlan, activeComp, planAtLeast, propertyLimit } from '@/lib/billing/entitlements';

type ProfileType = 'individual' | 'professional';

// Ρυθμίσεις ακινήτου: κρατούνται μόνο για την εξαγωγή CSV (η επεξεργασία γίνεται
// πλέον στον οδηγό ακινήτου).
type S = Record<string, unknown>;

// ── Κοινά δομικά κομμάτια της σελίδας ─────────────────────────────────────
const divider = { borderTop: '1px solid var(--border-subtle)', paddingTop: 16, marginTop: 16 } as const;

// Γραμμή «ετικέτα … τιμή» (στατικά στοιχεία, π.χ. email).
function InfoLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '11px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

// Γραμμή ρύθμισης «τίτλος + περιγραφή … control».
function SettingRow({ title, desc, control }: { title: string; desc?: string; control: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '13px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{title}</div>
        {desc && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 3, lineHeight: 1.5 }}>{desc}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{control}</div>
    </div>
  );
}

// ── Σύνδεσμος λογιστή (read-only, ανά χρήστη), bare block ──────────────────
function AccountantLink({ userId }: { userId: string }) {
  const supabase = createClient();
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.from('accountant_links').select('token').eq('user_id', userId).maybeSingle().then(({ data }) => { if (data?.token) setUrl(`${window.location.origin}/accountant/${data.token}`); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  const gen = async () => {
    setBusy(true);
    const { data } = await supabase.from('accountant_links').upsert({ user_id: userId, active: true }, { onConflict: 'user_id' }).select('token').maybeSingle();
    setBusy(false);
    if (data?.token) { const u = `${window.location.origin}/accountant/${data.token}`; setUrl(u); try { await navigator.clipboard.writeText(u); setCopied(true); setTimeout(() => setCopied(false), 2600); } catch { /* ignore */ } }
  };
  return (
    <div style={divider}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans, marginBottom: 4 }}>Σύνδεσμος για τον λογιστή σου</div>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.55, marginBottom: 12 }}>Δώσε στον λογιστή σου έναν ασφαλή σύνδεσμο μόνο ανάγνωσης με την εικόνα εσόδων και δαπανών των ακινήτων σου ανά έτος. Δεν βλέπει πελατολόγιο ούτε στοιχεία τρίτων.</div>
      {url && <div style={{ fontFamily: T.font.mono, fontSize: 12, color: 'var(--accent)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '9px 12px', marginBottom: 10, wordBreak: 'break-all' }}>{url}</div>}
      <Btn variant="secondary" onClick={gen} disabled={busy}>{busy ? 'Δημιουργία…' : copied ? 'Αντιγράφηκε ✓' : url ? 'Αντιγραφή συνδέσμου' : 'Δημιουργία συνδέσμου'}</Btn>
    </div>
  );
}

// ── Συγκατάθεση δεδομένων κοινότητας (opt-out), bare row ──────────────────
function MarketDataSharing({ userId }: { userId: string }) {
  const supabase = createClient();
  const [on, setOn] = useState(true);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    supabase.from('billing_profiles').select('share_market_data').eq('user_id', userId).maybeSingle()
      .then(({ data }) => { if (data && data.share_market_data === false) setOn(false); setLoaded(true); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  const toggle = async (v: boolean) => {
    setOn(v);
    await supabase.from('billing_profiles').upsert({ user_id: userId, share_market_data: v }, { onConflict: 'user_id' });
  };
  return (
    <div style={{ ...divider, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans, marginBottom: 4 }}>Συνεισφορά στα δεδομένα κοινότητας</div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.55 }}>
          Τα ακίνητά σου συμμετέχουν <strong>ανώνυμα και συγκεντρωτικά</strong> στα δεδομένα αγοράς ανά περιοχή (διάμεση απόδοση και τιμή), που βοηθούν κάθε ιδιοκτήτη να συγκρίνει ρεαλιστικά. Δεν κοινοποιείται ποτέ μεμονωμένο ακίνητο, διεύθυνση ή στοιχείο σου· εμφανίζονται μόνο περιοχές με τουλάχιστον πέντε ακίνητα. Μπορείς να εξαιρεθείς όποτε θέλεις.
        </div>
      </div>
      {loaded && <Toggle on={on} onChange={toggle} size="sm" />}
    </div>
  );
}

// ── Οριστική διαγραφή λογαριασμού (μη αναστρέψιμη), bare block ─────────────
function DeleteAccount() {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = confirmText.trim().toUpperCase() === 'ΔΙΑΓΡΑΦΗ';

  const del = async () => {
    if (!ready || busy) return;
    setBusy(true); setError(null);
    const { error } = await supabase.rpc('delete_my_account');
    if (error) { setError(error.message || 'Κάτι πήγε στραβά. Δοκίμασε ξανά.'); setBusy(false); return; }
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div style={divider}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--negative)', fontFamily: T.font.sans, marginBottom: 4 }}>Διαγραφή λογαριασμού</div>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginBottom: 14, lineHeight: 1.55 }}>
        Διαγράφει οριστικά τον λογαριασμό σου και όλα τα δεδομένα σου: ακίνητα, ενοικιαστές, πελάτες, δαπάνες, λογαριασμούς, έγγραφα και αρχεία. Η ενέργεια δεν αναιρείται. Αν θέλεις αντίγραφο, κάνε πρώτα εξαγωγή δεδομένων από κάθε καρτέλα.
      </div>
      {!open ? (
        <button onClick={() => setOpen(true)}
          style={{ appearance: 'none', cursor: 'pointer', padding: '9px 18px', borderRadius: T.radius.btn, border: '1px solid var(--negative-border)', background: 'transparent', color: 'var(--negative)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700 }}>
          Διαγραφή του λογαριασμού μου
        </button>
      ) : (
        <div style={{ background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: T.radius.inner, padding: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: T.font.sans, marginBottom: 10 }}>
            Για επιβεβαίωση, γράψε <strong>ΔΙΑΓΡΑΦΗ</strong> στο πεδίο και πάτησε την οριστική διαγραφή.
          </div>
          <input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="ΔΙΑΓΡΑΦΗ" autoFocus
            style={{ width: '100%', maxWidth: 260, height: 40, padding: '0 14px', borderRadius: T.radius.inner, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: T.font.sans, fontSize: 14, outline: 'none', marginBottom: 12 }} />
          {error && <div style={{ fontSize: 12, color: 'var(--negative)', fontFamily: T.font.sans, marginBottom: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={del} disabled={!ready || busy}
              style={{ appearance: 'none', cursor: ready && !busy ? 'pointer' : 'not-allowed', padding: '9px 18px', borderRadius: T.radius.btn, border: 'none', background: ready && !busy ? 'var(--negative)' : 'var(--bg-elevated)', color: ready && !busy ? '#fff' : 'var(--text-tertiary)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700 }}>
              {busy ? 'Διαγραφή...' : 'Οριστική διαγραφή'}
            </button>
            <button onClick={() => { setOpen(false); setConfirmText(''); setError(null); }} disabled={busy}
              style={{ appearance: 'none', cursor: 'pointer', padding: '9px 18px', borderRadius: T.radius.btn, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 500 }}>
              Ακύρωση
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Πεδίο σε γραμμή «ετικέτα … τιμή / επεξεργασία» ─────────────────────────
const fieldStyle = {
  width: '100%', height: 40, padding: '0 14px', borderRadius: T.radius.inner,
  border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
  color: 'var(--text-primary)', fontSize: 14, fontFamily: T.font.sans, outline: 'none', boxSizing: 'border-box',
} as const;

// ── Προφίλ: email (επεξεργάσιμο) + όνομα (μία αλλαγή ανά μήνα) ─────────────
function ProfileCard({ userId, email }: { userId: string; email: string }) {
  const supabase = createClient();
  const [name, setName] = useState('');
  const [afm, setAfm] = useState('');
  const [changedAt, setChangedAt] = useState<string | null>(null);

  const [emailEdit, setEmailEdit] = useState(false);
  const [emailVal, setEmailVal] = useState('');
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  const [nameEdit, setNameEdit] = useState(false);
  const [nameVal, setNameVal] = useState('');
  const [nameErr, setNameErr] = useState('');
  const [nameBusy, setNameBusy] = useState(false);

  useEffect(() => {
    supabase.from('billing_profiles').select('full_name, afm, full_name_changed_at').eq('user_id', userId).maybeSingle()
      .then(({ data }) => { if (data) { setName((data.full_name as string) || ''); setAfm((data.afm as string) || ''); setChangedAt((data.full_name_changed_at as string) || null); } });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const daysLeft = changedAt ? Math.max(0, 30 - Math.floor((Date.now() - new Date(changedAt).getTime()) / 86400000)) : 0;
  const nameLocked = daysLeft > 0;

  const saveEmail = async () => {
    const v = emailVal.trim();
    if (!v || v === email) { setEmailEdit(false); return; }
    setEmailBusy(true); setEmailMsg(null);
    const { error } = await supabase.auth.updateUser({ email: v });
    setEmailBusy(false);
    if (error) { setEmailMsg({ ok: false, text: 'Δεν ήταν δυνατή η αλλαγή. Δοκίμασε ξανά.' }); return; }
    setEmailMsg({ ok: true, text: 'Σου στείλαμε σύνδεσμο επιβεβαίωσης στη νέα διεύθυνση.' });
    setEmailEdit(false);
  };
  const saveName = async () => {
    const v = nameVal.trim();
    if (!v || v === name || nameLocked) { setNameEdit(false); return; }
    setNameBusy(true); setNameErr('');
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from('billing_profiles').upsert({ user_id: userId, full_name: v, full_name_changed_at: nowIso }, { onConflict: 'user_id' });
    setNameBusy(false);
    if (error) { setNameErr('Κάτι πήγε στραβά. Δοκίμασε ξανά.'); return; }
    setName(v); setChangedAt(nowIso); setNameEdit(false);
  };

  const editBtn = (onClick: () => void, disabled = false) => (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.color = 'var(--accent)'; }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.color = 'var(--text-secondary)'; }}
      style={{ appearance: 'none', border: 'none', background: 'transparent', cursor: disabled ? 'default' : 'pointer', color: disabled ? 'var(--text-tertiary)' : 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, padding: 0, transition: 'color 0.15s' }}>
      Αλλαγή
    </button>
  );

  return (
    <Card className="acc-section">
      <SecHdr label="Προφίλ" />

      {/* Email */}
      <div style={{ padding: '11px 0', borderBottom: '1px solid var(--border-subtle)' }}>
        {!emailEdit ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Email</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans, marginTop: 2, overflowWrap: 'anywhere' }}>{email || '—'}</div>
            </div>
            {editBtn(() => { setEmailVal(email); setEmailMsg(null); setEmailEdit(true); })}
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, marginBottom: 6 }}>Νέο email</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input type="email" autoFocus value={emailVal} onChange={e => setEmailVal(e.target.value)} style={{ ...fieldStyle, flex: 1, minWidth: 200 }} placeholder="name@example.com" />
              <Btn variant="primary" onClick={saveEmail} disabled={emailBusy}>{emailBusy ? 'Αποθήκευση…' : 'Αποθήκευση'}</Btn>
              <Btn variant="secondary" onClick={() => setEmailEdit(false)} disabled={emailBusy}>Ακύρωση</Btn>
            </div>
          </div>
        )}
        {emailMsg && <div style={{ fontSize: 12, color: emailMsg.ok ? 'var(--positive)' : 'var(--negative)', fontFamily: T.font.sans, marginTop: 8, lineHeight: 1.5 }}>{emailMsg.text}</div>}
      </div>

      {/* Όνομα (μία αλλαγή / μήνα) */}
      <div style={{ padding: '11px 0', borderBottom: '1px solid var(--border-subtle)' }}>
        {!nameEdit ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Όνομα</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: name ? 'var(--text-primary)' : 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 2 }}>{name || 'Δεν έχει οριστεί'}</div>
            </div>
            {editBtn(() => { setNameVal(name); setNameErr(''); setNameEdit(true); }, nameLocked)}
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, marginBottom: 6 }}>Όνομα ή επωνυμία</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input autoFocus value={nameVal} onChange={e => setNameVal(e.target.value)} style={{ ...fieldStyle, flex: 1, minWidth: 200 }} placeholder="Το όνομά σου" />
              <Btn variant="primary" onClick={saveName} disabled={nameBusy}>{nameBusy ? 'Αποθήκευση…' : 'Αποθήκευση'}</Btn>
              <Btn variant="secondary" onClick={() => setNameEdit(false)} disabled={nameBusy}>Ακύρωση</Btn>
            </div>
          </div>
        )}
        {nameErr && <div style={{ fontSize: 12, color: 'var(--negative)', fontFamily: T.font.sans, marginTop: 8 }}>{nameErr}</div>}
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 6, lineHeight: 1.5 }}>
          {nameLocked ? `Το όνομα αλλάζει μία φορά τον μήνα. Θα μπορείς ξανά σε ${daysLeft} ${daysLeft === 1 ? 'ημέρα' : 'ημέρες'}.` : 'Το όνομα μπορεί να αλλάξει μία φορά τον μήνα.'}
        </div>
      </div>

      {afm && <InfoLine label="ΑΦΜ" value={afm} />}
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════

export default function TabSettings({ propertyId, userId, profileType = 'individual', onProfileChange }: { propertyId: string; userId: string; profileType?: ProfileType; onProfileChange?: (v: ProfileType) => void }) {
  const supabase = createClient();

  // Ταυτότητα λογαριασμού & χρέωσης
  const [accountEmail, setAccountEmail] = useState('');
  const [plan, setPlan] = useState('free');
  const [partner, setPartner] = useState(false);
  const [compPlan, setCompPlan] = useState<string | null>(null);
  const [compUntil, setCompUntil] = useState<string | null>(null);
  const [propertyCount, setPropertyCount] = useState<number | null>(null);
  const [inOrg, setInOrg] = useState(false);

  // Ρυθμίσεις ακινήτου (μόνο για εξαγωγή CSV)
  const [s, setS] = useState<S>({});

  // Προτιμήσεις εφαρμογής (κρατάμε μόνο τα δεκαδικά ορατά εδώ, χωρίς απώλεια των υπολοίπων)
  const [prefs, setPrefs] = useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [prefsSaved, setPrefsSaved] = useState(false);
  const prefsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Αποκάλυψη διαχείρισης συνδρομής (νηφάλια χρέωση) & σύγκρισης πλάνων (aspirational)
  const [showBilling, setShowBilling] = useState(false);
  const billingRef = useRef<HTMLDivElement | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const comparisonRef = useRef<HTMLDivElement | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState('');
  const [reduceMotion, setReduceMotion] = useState(false);
  const [largeText, setLargeText] = useState(false);

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setAccountEmail(data.user?.email || '')); }, []);

  useEffect(() => {
    supabase.from('billing_profiles').select('plan, comp_plan, comp_until').eq('user_id', userId).maybeSingle()
      .then(({ data }) => { if (data) { setPlan((data.plan as string) || 'free'); setCompPlan((data.comp_plan as string) || null); setCompUntil((data.comp_until as string) || null); } });
    supabase.from('referral_partners').select('user_id').eq('user_id', userId).maybeSingle()
      .then(({ data }) => setPartner(!!data));
    supabase.from('user_properties').select('id', { count: 'exact', head: true }).eq('user_id', userId)
      .then(({ count }) => setPropertyCount(count ?? 0));
    supabase.from('organization_members').select('id').eq('user_id', userId).eq('status', 'active').limit(1)
      .then(({ data }) => setInOrg((data?.length ?? 0) > 0));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => { loadSettings(); loadPrefs(); }, [propertyId]);

  async function loadSettings() {
    const { data } = await supabase.from('property_settings').select('*').eq('property_id', propertyId).maybeSingle();
    if (data) setS(data);
  }
  async function loadPrefs() {
    const { data } = await supabase.from('bills_settings').select('data')
      .eq('property_id', propertyId).eq('section', 'app_preferences').maybeSingle();
    if (data?.data) setPrefs(p => ({ ...p, ...data.data }));
    else setPrefs(DEFAULT_PREFERENCES);
  }
  function updatePrefs(partial: Partial<AppPreferences>) {
    setPrefs(prev => {
      const next = { ...prev, ...partial };
      if (prefsTimer.current) clearTimeout(prefsTimer.current);
      prefsTimer.current = setTimeout(async () => {
        await supabase.from('bills_settings').upsert({
          property_id: propertyId, user_id: String(userId),
          section: 'app_preferences', data: next, updated_at: new Date().toISOString(),
        }, { onConflict: 'property_id,section' });
        setPrefsSaved(true); setTimeout(() => setPrefsSaved(false), 1800);
      }, 800);
      return next;
    });
  }

  // Έξυπνη αλλαγή τύπου προφίλ (persist όπως πριν· η ειδοποίηση εμφανίζεται από το derived state)
  const setProfile = async (v: ProfileType) => {
    if (v === profileType) return;
    onProfileChange?.(v);
    await supabase.from('billing_profiles').upsert({ user_id: userId, profile_type: v }, { onConflict: 'user_id' });
  };

  const openBilling = () => {
    setShowBilling(true);
    setTimeout(() => billingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  const openComparison = () => {
    setShowComparison(true);
    setTimeout(() => comparisonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const ent = { plan, profileType, partner, compPlan, compUntil };
  const effPlan = effectivePlan(ent);
  const comp = activeComp(ent);
  const propLimit = propertyLimit(ent);
  const propLimitLabel = propLimit === Infinity ? 'απεριόριστα' : String(propLimit);
  const usagePct = propLimit === Infinity || !propertyCount ? 0 : Math.min(100, Math.round((propertyCount / propLimit) * 100));
  const atLimit = propLimit !== Infinity && (propertyCount ?? 0) >= propLimit;
  const nearLimit = propLimit !== Infinity && !atLimit && propLimit > 1 && (propertyCount ?? 0) >= propLimit - 1;
  const planMeta = PLANS[effPlan];
  const isProPlan = effPlan === 'agency';
  const needsUpgrade = profileType === 'professional' && !planAtLeast(effPlan, 'agency');
  const tier: 'owner' | 'agency' | 'partner' = partner ? 'partner' : profileType === 'professional' ? 'agency' : 'owner';

  const exportSettingsCsv = () => {
    const rows = Object.entries(s as Record<string, unknown>).map(([k, v]) => [k, v == null ? '' : String(v)]);
    downloadCsv(`rythmiseis_akinitou_${new Date().toISOString().slice(0, 10)}`, ['Πεδίο', 'Τιμή'], rows);
  };

  const exportAll = async () => {
    if (exporting) return;
    setExporting(true); setExportErr('');
    const res = await exportAllData(userId);
    setExporting(false);
    if (!res.ok) setExportErr('Δεν ήταν δυνατή η εξαγωγή αυτή τη στιγμή. Δοκίμασε ξανά.');
  };

  // Προσβασιμότητα: διάβασε τις αποθηκευμένες προτιμήσεις, εφάρμοσέ τες ζωντανά.
  useEffect(() => {
    try {
      setReduceMotion(localStorage.getItem('po_reduce_motion') === '1');
      setLargeText(localStorage.getItem('po_large_text') === '1');
    } catch { /* ignore */ }
  }, []);
  const setA11y = (key: 'po_reduce_motion' | 'po_large_text', cls: string, v: boolean, setter: (b: boolean) => void) => {
    setter(v);
    try {
      localStorage.setItem(key, v ? '1' : '0');
      document.documentElement.classList.toggle(cls, v);
    } catch { /* ignore */ }
  };

  const PROFILE_OPTS: { v: ProfileType; title: string; sub: string }[] = [
    { v: 'individual', title: 'Ιδιώτης', sub: 'Ένα ή λίγα δικά μου ακίνητα. Απλό, καθαρό, χωρίς περιττά.' },
    { v: 'professional', title: 'Επαγγελματίας', sub: 'Πολλά ακίνητα. Χαρτοφυλάκιο, σύγκριση, εργαλεία διαχείρισης.' },
  ];

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)', maxWidth: 880, margin: '0 auto' }}>

      <PageTitle title="Λογαριασμός" sub="Ο λογαριασμός, η συνδρομή και οι προτιμήσεις σου." />

      {/* ── 1. ΠΡΟΦΙΛ ─────────────────────────────────────────────────── */}
      <ProfileCard userId={userId} email={accountEmail} />

      {/* ── 2. ΣΥΝΔΡΟΜΗ (hero) ────────────────────────────────────────── */}
      <Card className="acc-section" style={{ animationDelay: '70ms', background: 'var(--surface-hero)', boxShadow: 'var(--highlight-inset), var(--elev-2)' }}>
        <SecHdr label="Συνδρομή" right={<TierBadge tier={tier} size={32} />} />

        {/* Τρέχον πλάνο */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid var(--border-subtle)', borderRadius: 100, padding: '4px 12px' }}>
              <span className={isProPlan ? 'acc-live-dot accent' : 'acc-live-dot'} style={{ width: 6, height: 6, background: isProPlan ? 'var(--accent)' : 'var(--positive)' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans }}>Πλάνο {planMeta.name}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 8, lineHeight: 1.5, maxWidth: 440 }}>{planMeta.tagline}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn variant="primary" onClick={openComparison}>Σύγκρινε πλάνα</Btn>
            <Btn variant="secondary" onClick={openBilling}>Διαχείριση συνδρομής</Btn>
          </div>
        </div>

        {/* Μετρητής ακινήτων: προ-πουλά ήρεμα το όριο, χωρίς τοίχο-έκπληξη */}
        {propertyCount != null && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 7 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Ακίνητα</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans, fontVariantNumeric: 'tabular-nums' }}>{propertyCount} από {propLimitLabel}</span>
            </div>
            {propLimit !== Infinity && (
              <div style={{ height: 6, borderRadius: 100, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                <div style={{ width: `${usagePct}%`, height: '100%', borderRadius: 100, background: atLimit ? 'var(--warning)' : 'var(--accent)', transition: 'width 0.4s cubic-bezier(0.2,0,0,1)' }} />
              </div>
            )}
            {(atLimit || nearLimit) && (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 8, lineHeight: 1.5 }}>
                {atLimit
                  ? 'Έφτασες το όριο του πλάνου σου. Αναβάθμισε για να κρατάς κι άλλα ακίνητα σε ένα σημείο.'
                  : 'Ένα ακόμη ακίνητο και φτάνεις το όριο του πλάνου σου.'}
              </div>
            )}
          </div>
        )}

        {/* Ενεργή δωρεάν πρόσβαση (κερδισμένοι μήνες) */}
        {comp && (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--positive-soft)', border: '1px solid var(--positive-border)', borderRadius: T.radius.inner, padding: '12px 14px' }}>
            <span className="acc-live-dot" style={{ width: 6, height: 6, background: 'var(--positive)', flexShrink: 0, marginTop: 6 }} />
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.55 }}>
              Έχεις δωρεάν πρόσβαση <strong style={{ color: 'var(--text-primary)' }}>{PLANS[comp.plan].name}</strong> έως τις {fdLong(comp.until)}. Την κέρδισες από το Πρόγραμμα Πρόσκλησης, χωρίς καμία χρέωση.
            </div>
          </div>
        )}

        {/* Τρόπος χρήσης: Ιδιώτης / Επαγγελματίας */}
        <div style={divider}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans, marginBottom: 3 }}>Τρόπος χρήσης</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginBottom: 14, lineHeight: 1.5 }}>
            Προσαρμόζει το περιβάλλον στις ανάγκες σου. Μπορείς να το αλλάξεις όποτε θες.{partner ? ' Είσαι ενεργός Συνεργάτης Property OS.' : ''}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12 }}>
            {PROFILE_OPTS.map(o => {
              const on = profileType === o.v;
              return (
                <button key={o.v} onClick={() => setProfile(o.v)} className="acc-choice"
                  style={{ textAlign: 'left', cursor: 'pointer', borderRadius: 14, padding: '16px 16px 15px', border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`, background: on ? 'var(--accent-soft)' : 'var(--bg-surface)', boxShadow: on ? '0 0 0 3px var(--accent-dim)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: on ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.sans }}>{o.title}</span>
                    <span style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, border: `2px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`, background: on ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {on && <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, marginTop: 5, lineHeight: 1.5 }}>{o.sub}</div>
                </button>
              );
            })}
          </div>

          {/* Έξυπνη ειδοποίηση αναβάθμισης */}
          {needsUpgrade && (
            <div style={{ marginTop: 12, background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', borderRadius: T.radius.inner, padding: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warning)', flexShrink: 0, marginTop: 6 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans, marginBottom: 3 }}>Ο τρόπος «Επαγγελματίας» απαιτεί αναβάθμιση συνδρομής</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>Οι δυνατότητες χαρτοφυλακίου και ομαδικής διαχείρισης ξεκλειδώνουν με το πλάνο Επαγγελματίας.</div>
                </div>
              </div>
              <Btn variant="primary" onClick={openComparison}>Δες τα πλάνα</Btn>
            </div>
          )}
        </div>

        {/* Επωνυμία αναφορών (μόνο για Επαγγελματία) */}
        {profileType === 'professional' && (
          <div style={divider}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans, marginBottom: 10 }}>Επωνυμία αναφορών</div>
            <ReportBranding userId={userId} onUpgrade={openComparison} />
          </div>
        )}
      </Card>

      {/* Σύγκριση πλάνων (αποκάλυψη, aspirational, N26-style highlight-gains) */}
      {showComparison && (
        <div ref={comparisonRef} style={{ scrollMarginTop: 16, marginBottom: 16 }}>
          <PlanComparison userId={userId} profileType={profileType} currentPlan={effPlan} onUpgrade={openBilling} />
        </div>
      )}

      {/* Διαχείριση συνδρομής (αποκάλυψη, νηφάλια χρέωση) */}
      {showBilling && (
        <div ref={billingRef} style={{ scrollMarginTop: 16 }}>
          <Billing userId={userId} />
        </div>
      )}

      {/* ── ΟΡΓΑΝΙΣΜΟΣ & ΟΜΑΔΑ (Επαγγελματίας ή μέλος ομάδας) ───────────── */}
      {(profileType === 'professional' || inOrg) && (
        <Card className="acc-section" style={{ animationDelay: '110ms' }}>
          <SecHdr label="Οργανισμός & Ομάδα" />
          <OrgTeam userId={userId} />
        </Card>
      )}

      {/* ── 3. ΕΙΔΟΠΟΙΗΣΕΙΣ (υψηλή αξία/συχνότητα, πάνω από την Εμφάνιση) ─── */}
      <Card className="acc-section" style={{ animationDelay: '140ms' }}>
        <SecHdr label="Ειδοποιήσεις" />
        <NotificationSettings userId={userId} />
      </Card>

      {/* ── 4. ΕΜΦΑΝΙΣΗ & ΓΛΩΣΣΑ ──────────────────────────────────────── */}
      <Card className="acc-section" style={{ animationDelay: '210ms' }}>
        <SecHdr label="Εμφάνιση & Γλώσσα" />
        <SettingRow title="Θέμα" desc="Εναλλαγή ανάμεσα σε φωτεινό και σκοτεινό." control={<ThemeToggle />} />
        <SettingRow title="Γλώσσα" control={<span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Ελληνικά</span>} />
        <SettingRow title="Νόμισμα" control={<span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Ευρώ (€)</span>} />
        <SettingRow title="Δεκαδικά στα ποσά" desc="Πλήθος δεκαδικών ψηφίων για την εμφάνιση χρηματικών ποσών."
          control={<div style={{ width: 264 }}>
            <CustomSelect value={prefs.decimals}
              onChange={v => updatePrefs({ decimals: v as AppPreferences['decimals'] })}
              options={[
                { value: '0', label: 'Χωρίς δεκαδικά (1.234 €)' },
                { value: '2', label: 'Δύο δεκαδικά (1.234,56 €)' },
              ]} />
          </div>} />
        <SettingRow title="Μειωμένη κίνηση" desc="Περιορίζει τα εφέ κίνησης σε όλη την εφαρμογή, για πιο ήρεμη εμπειρία."
          control={<Toggle on={reduceMotion} onChange={v => setA11y('po_reduce_motion', 'a11y-reduce-motion', v, setReduceMotion)} size="sm" />} />
        <SettingRow title="Μεγαλύτερο κείμενο" desc="Ήπια μεγέθυνση της διεπαφής για πιο άνετη ανάγνωση."
          control={<Toggle on={largeText} onChange={v => setA11y('po_large_text', 'a11y-large-text', v, setLargeText)} size="sm" />} />
        <div style={{ height: 18, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 8 }}>
          {prefsSaved && (
            <span style={{ fontSize: 11, color: 'var(--positive)', fontFamily: T.font.sans, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--positive)' }} />
              Αποθηκεύτηκε
            </span>
          )}
        </div>
      </Card>

      {/* ── ΑΣΦΑΛΕΙΑ ─────────────────────────────────────────────────── */}
      <Card className="acc-section" style={{ animationDelay: '280ms' }}>
        <SecHdr label="Ασφάλεια" />
        <SecuritySettings userId={userId} />
      </Card>

      {/* ── ΔΕΔΟΜΕΝΑ & ΑΠΟΡΡΗΤΟ ──────────────────────────────────────── */}
      <Card className="acc-section" style={{ animationDelay: '340ms' }}>
        <SecHdr label="Δεδομένα & Απόρρητο" />
        <SettingRow title="Εξαγωγή όλων των δεδομένων σου" desc="Κατέβασε σε ένα αρχείο όλα σου τα δεδομένα (ακίνητα, δαπάνες, λογαριασμοί, ενοικιαστές, πελάτες, έγγραφα). Δικό σου, όποτε το θελήσεις."
          control={<Btn variant="secondary" onClick={exportAll} disabled={exporting}>{exporting ? 'Εξαγωγή…' : 'Εξαγωγή όλων'}</Btn>} />
        {exportErr && <div style={{ fontSize: 12, color: 'var(--negative)', fontFamily: T.font.sans, marginTop: 8 }}>{exportErr}</div>}
        <SettingRow title="Εξαγωγή ρυθμίσεων ακινήτου" desc="Μόνο τις ρυθμίσεις αυτού του ακινήτου, σε αρχείο CSV για γρήγορη ματιά."
          control={<Btn variant="secondary" onClick={exportSettingsCsv}>Εξαγωγή CSV</Btn>} />
        <div style={{ marginTop: 12 }}>
          <InfoBanner tone="info">Για αναλυτικά δεδομένα ανά κατηγορία, κάθε καρτέλα (δαπάνες, λογαριασμοί, ενοικιαστές) έχει και τη δική της εξαγωγή CSV.</InfoBanner>
        </div>
        <AccountantLink userId={userId} />
        <MarketDataSharing userId={userId} />
        <SettingsRoadmap userId={userId} />
        <DeleteAccount />
      </Card>

    </div>
  );
}
