'use client';

// ═══════════════════════════════════════════════════════════════════════════
// OrgTeam, «Οργανισμός & Ομάδα» (tier Επαγγελματίας). Ο ιδιοκτήτης ονομάζει τον
// οργανισμό του και διαχειρίζεται μια λίστα μελών με ρόλους και προσκλήσεις με
// email. Αποδίδεται ΓΥΜΝΟ μέσα σε υπάρχουσα Card του γονέα (δεν τυλίγεται σε δική
// του Card, ο γονέας δίνει <Card><SecHdr label="Οργανισμός & Ομάδα" />…).
//
// Πηγή αλήθειας για χρώματα/κενά/ακτίνες: app/globals.css (μόνο CSS variables).
// Τα μέλη ξεκινούν με πρόσβαση ΑΝΑΓΝΩΣΗΣ στο χαρτοφυλάκιο. Ο ιδιοκτήτης μπορεί να
// τους δώσει και δικαιώματα ΕΠΕΞΕΡΓΑΣΙΑΣ, ανά μέλος, εγκρίνοντας το αίτημά τους.
//
// Το component εξυπηρετεί ΔΥΟ όψεις: του ΙΔΙΟΚΤΗΤΗ (διαχείριση οργανισμού, μελών
// και προσβάσεων) και του ΜΕΛΟΥΣ (προβολή του οργανισμού και αιτήματα προς τον
// ιδιοκτήτη). Η όψη επιλέγεται αυτόματα κατά τη φόρτωση.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState, type CSSProperties, type FocusEvent, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, Btn, Chip } from '@/components/Theme';
import { CustomSelect } from './UIComponents';

// Κοινές επιλογές ρόλου (ίδιο dropdown με το υπόλοιπο app: CustomSelect).
const ROLE_OPTIONS = [{ value: 'admin', label: 'Διαχειριστής' }, { value: 'member', label: 'Μέλος' }];

type Role = 'owner' | 'admin' | 'member';
type Status = 'invited' | 'active' | 'revoked';
type InviteRole = 'admin' | 'member';

interface Org {
  id: string;
  name: string;
  owner_user_id: string;
  upgrade_requested_at: string | null;
  created_at: string;
}
interface Member {
  email: string;
  role: Role;
  status: Status;
  joined_at: string | null;
  user_id: string | null;
  can_edit: boolean;
  edit_requested_at: string | null;
}

// Η δική μου εγγραφή στον πίνακα μελών (για την ανίχνευση όψης).
interface MyRow {
  org_id: string;
  role: Role;
  can_edit: boolean;
  edit_requested_at: string | null;
  status: Status;
}
// Τα δεδομένα της όψης μέλους (read-only για το μέλος).
interface Membership {
  orgId: string;
  orgName: string;
  role: Role;
  canEdit: boolean;
  editRequestedAt: string | null;
}

// ── Κοινά στυλ πεδίων (ίδια «γεωμετρία» με τα υπόλοιπα Settings) ───────────
const fieldStyle: CSSProperties = {
  height: 40,
  borderRadius: T.radius.inner,
  border: '1px solid var(--border-default)',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontSize: 14,
  padding: '0 14px',
  boxSizing: 'border-box',
  fontFamily: T.font.sans,
  outline: 'none',
};
const subLabel: CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans };
const descStyle: CSSProperties = { fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5, fontFamily: T.font.sans, marginTop: 3 };
const errStyle: CSSProperties = { fontSize: 12, color: 'var(--negative)', fontFamily: T.font.sans, marginTop: 8 };
const microLabel: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontFamily: T.font.sans };

// Πλέγμα σειράς μητρώου (κοινό σε κεφαλίδα & γραμμές, για τέλεια ευθυγράμμιση).
const ROW_COLS = 'minmax(180px, 1fr) 104px 116px 250px 232px';
const ROW_MIN = 960;

const focusOn = (e: FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = 'var(--accent)'; };
const focusOff = (e: FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = 'var(--border-default)'; };

// Chips μητρώου: ουδέτερα (η ετικέτα λέει τα πάντα). Κρατάμε το χρώμα μόνο για
// ό,τι είναι πραγματικά actionable (π.χ. εκκρεμές αίτημα), όχι για διακόσμηση.
function RoleChip({ role }: { role: Role }) {
  const label = role === 'owner' ? 'Ιδιοκτήτης' : role === 'admin' ? 'Διαχειριστής' : 'Μέλος';
  return <Chip tone="neutral">{label}</Chip>;
}

function StatusChip({ status }: { status: Status }) {
  const label = status === 'active' ? 'Ενεργό' : status === 'invited' ? 'Προσκεκλημένο' : 'Ανακλήθηκε';
  return <Chip tone="neutral">{label}</Chip>;
}

function AccessChip({ canEdit }: { canEdit: boolean }) {
  return <Chip tone="neutral">{canEdit ? 'Επεξεργασία' : 'Ανάγνωση'}</Chip>;
}

// ── Πλήκτρο τμηματικού ελέγχου «Ανάγνωση | Επεξεργασία» ────────────────────
function SegBtn({ active, disabled, divider, onClick, children }: {
  active: boolean; disabled?: boolean; divider?: boolean; onClick: () => void; children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      style={{
        height: 30, padding: '0 12px', fontSize: 12, fontWeight: 600, fontFamily: T.font.sans,
        cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap',
        border: 'none', borderLeft: divider ? '1px solid var(--border-default)' : 'none',
        background: active ? 'var(--accent-soft)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
      }}
    >{children}</button>
  );
}

export default function OrgTeam({ userId }: { userId: string }) {
  const supabase = createClient();

  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Όψη: ιδιοκτήτης (διαχείριση) ή μέλος (προβολή + αιτήματα)
  const [mode, setMode] = useState<'owner' | 'member' | null>(null);
  const [me, setMe] = useState<Membership | null>(null);
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [editSent, setEditSent] = useState(false);
  const [upgradeSent, setUpgradeSent] = useState(false);

  // Όνομα οργανισμού (inline-editable)
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // Πρόσκληση μέλους
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InviteRole>('member');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Ενέργειες ανά γραμμή
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const loadMembers = async (orgId: string) => {
    const { data } = await supabase
      .from('organization_members')
      .select('email, role, status, joined_at, user_id, can_edit, edit_requested_at')
      .eq('org_id', orgId)
      .order('invited_at');
    setMembers((data as Member[] | null) ?? []);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      // 1) Είμαι ήδη μέλος ενεργού οργανισμού κάποιου άλλου;
      const { data: mine } = await supabase
        .from('organization_members')
        .select('org_id, role, can_edit, edit_requested_at, status')
        .eq('user_id', userId)
        .eq('status', 'active');
      if (!active) return;

      const memberRow = (mine as MyRow[] | null)?.find(r => r.role !== 'owner');
      if (memberRow) {
        // ── ΟΨΗ ΜΕΛΟΥΣ: χωρίς ensure_organization (δεν δημιουργούμε φανταστικό οργανισμό)
        const { data: orgRow } = await supabase
          .from('organizations')
          .select('name, owner_user_id')
          .eq('id', memberRow.org_id)
          .maybeSingle();
        if (!active) return;
        setMe({
          orgId: memberRow.org_id,
          orgName: ((orgRow?.name as string | null) ?? '').trim(),
          role: memberRow.role,
          canEdit: !!memberRow.can_edit,
          editRequestedAt: memberRow.edit_requested_at,
        });
        setMode('member');
        setLoading(false);
        return;
      }

      // 2) ── ΟΨΗ ΙΔΙΟΚΤΗΤΗ
      const { data, error } = await supabase.rpc('ensure_organization');
      if (!active) return;
      if (error || !data) { setLoading(false); return; }
      const o = (Array.isArray(data) ? data[0] : data) as Org;
      setOrg(o);
      setNameDraft(o?.name ?? '');
      await loadMembers(o.id);
      if (active) { setMode('owner'); setLoading(false); }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEditName = () => { setNameDraft(org?.name ?? ''); setNameError(null); setNameSaved(false); setEditingName(true); };
  const cancelEditName = () => { setEditingName(false); setNameError(null); };

  const saveName = async () => {
    if (!org) return;
    const p_name = nameDraft.trim();
    setNameSaving(true); setNameError(null);
    const { error } = await supabase.rpc('rename_organization', { p_name });
    setNameSaving(false);
    if (error) { setNameError('Η αποθήκευση δεν ολοκληρώθηκε.'); return; }
    setOrg(prev => (prev ? { ...prev, name: p_name } : prev));
    setEditingName(false);
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 2500);
  };

  const invite = async () => {
    if (!org) return;
    const email = inviteEmail.trim();
    if (!email || !email.includes('@')) { setInviteError('Δώσε ένα έγκυρο email.'); return; }
    setInviting(true); setInviteError(null);
    const { error } = await supabase.rpc('invite_org_member', { p_email: email, p_role: inviteRole });
    if (error) { setInviteError('Η πρόσκληση δεν στάλθηκε.'); setInviting(false); return; }
    setInviteEmail('');
    await loadMembers(org.id);
    setInviting(false);
  };

  const changeRole = async (email: string, role: InviteRole) => {
    if (!org) return;
    setRowBusy(email); setRowError(null);
    const { error } = await supabase.rpc('set_org_member_role', { p_email: email, p_role: role });
    if (error) setRowError('Η αλλαγή ρόλου δεν ολοκληρώθηκε.');
    else await loadMembers(org.id);
    setRowBusy(null);
  };

  const revoke = async (email: string) => {
    if (!org) return;
    setRowBusy(email); setRowError(null);
    const { error } = await supabase.rpc('revoke_org_member', { p_email: email });
    if (error) setRowError('Η αφαίρεση δεν ολοκληρώθηκε.');
    else await loadMembers(org.id);
    setRowBusy(null);
  };

  // Ιδιοκτήτης: ορίζει/εγκρίνει δικαιώματα επεξεργασίας ανά μέλος
  const setMemberEdit = async (email: string, can: boolean) => {
    if (!org) return;
    setRowBusy(email); setRowError(null);
    const { error } = await supabase.rpc('set_member_edit', { p_email: email, p_can: can });
    if (error) setRowError('Η αλλαγή πρόσβασης δεν ολοκληρώθηκε.');
    else await loadMembers(org.id);
    setRowBusy(null);
  };

  // Ιδιοκτήτης: σβήνει το αίτημα αναβάθμισης αφού το δει
  const clearUpgrade = async () => {
    const { error } = await supabase.rpc('clear_org_upgrade_request');
    if (error) return;
    setOrg(prev => (prev ? { ...prev, upgrade_requested_at: null } : prev));
  };

  // Μέλος: ζητά δικαιώματα επεξεργασίας
  const requestEdit = async () => {
    setMemberBusy(true); setMemberError(null);
    const { error } = await supabase.rpc('request_member_edit');
    setMemberBusy(false);
    if (error) { setMemberError('Το αίτημα δεν στάλθηκε.'); return; }
    setEditSent(true);
  };

  // Μέλος: ζητά αναβάθμιση συνδρομής
  const requestUpgrade = async () => {
    setMemberBusy(true); setMemberError(null);
    const { error } = await supabase.rpc('request_org_upgrade');
    setMemberBusy(false);
    if (error) { setMemberError('Το αίτημα δεν στάλθηκε.'); return; }
    setUpgradeSent(true);
  };

  if (loading) {
    return (
      <div style={{ padding: '20px 0', fontSize: 13, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
        Φόρτωση…
      </div>
    );
  }

  // ═══ ΟΨΗ ΜΕΛΟΥΣ ═══════════════════════════════════════════════════════════
  if (mode === 'member' && me) {
    const editPending = !me.canEdit && (me.editRequestedAt != null || editSent);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Ο οργανισμός σου ─────────────────────────────────────────── */}
        <section className="acc-section">
          <div style={subLabel}>Ο οργανισμός σου</div>
          <div style={{
            marginTop: 12, fontSize: 15, fontWeight: 600, fontFamily: T.font.sans, color: 'var(--text-primary)',
          }}>
            {me.orgName ? `Είσαι μέλος του οργανισμού: ${me.orgName}` : 'Είσαι μέλος ενός οργανισμού.'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <RoleChip role={me.role} />
            <AccessChip canEdit={me.canEdit} />
          </div>
        </section>

        {/* ── Δικαιώματα επεξεργασίας ──────────────────────────────────── */}
        <section className="acc-section" style={{ animationDelay: '60ms' }}>
          <div style={subLabel}>Δικαιώματα επεξεργασίας</div>
          <div style={descStyle}>Η πρόσβασή σου στο χαρτοφυλάκιο του οργανισμού.</div>
          <div style={{ marginTop: 12 }}>
            {me.canEdit ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--positive)', fontFamily: T.font.sans }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--positive)', flexShrink: 0 }} />
                Έχεις δικαιώματα επεξεργασίας στο χαρτοφυλάκιο.
              </div>
            ) : editPending ? (
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
                Το αίτημα επεξεργασίας στάλθηκε στον ιδιοκτήτη.
              </div>
            ) : (
              <Btn variant="secondary" onClick={requestEdit} disabled={memberBusy}>Ζήτησε δικαιώματα επεξεργασίας</Btn>
            )}
          </div>
        </section>

        {/* ── Αναβάθμιση συνδρομής ─────────────────────────────────────── */}
        <section className="acc-section" style={{ animationDelay: '120ms' }}>
          <div style={subLabel}>Αναβάθμιση συνδρομής</div>
          <div style={descStyle}>Ζήτησε από τον ιδιοκτήτη να αναβαθμίσει τη συνδρομή του οργανισμού.</div>
          <div style={{ marginTop: 12 }}>
            {upgradeSent ? (
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
                Το αίτημα στάλθηκε στον ιδιοκτήτη.
              </div>
            ) : (
              <Btn variant="secondary" onClick={requestUpgrade} disabled={memberBusy}>Ζήτησε αναβάθμιση συνδρομής</Btn>
            )}
          </div>
        </section>

        {memberError && <div style={errStyle}>{memberError}</div>}

        {/* ── Ειλικρινής σημείωση (μία γραμμή) ─────────────────────────── */}
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5, fontFamily: T.font.sans, paddingTop: 2 }}>
          Η επεξεργασία ενεργοποιείται μόνο αφού ο ιδιοκτήτης εγκρίνει το αίτημά σου.
        </div>
      </div>
    );
  }

  const nameEmpty = !org?.name?.trim();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Αίτημα αναβάθμισης από μέλος ──────────────────────────────── */}
      {org?.upgrade_requested_at && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: T.radius.inner, padding: '10px 16px',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 200, fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
            Ένα μέλος σου ζήτησε αναβάθμιση συνδρομής.
          </span>
          <Btn variant="secondary" onClick={clearUpgrade}>Το είδα</Btn>
        </div>
      )}

      {/* ── Όνομα οργανισμού ─────────────────────────────────────────── */}
      <section className="acc-section">
        <div style={subLabel}>Όνομα οργανισμού</div>
        <div style={descStyle}>Η ονομασία που βλέπει η ομάδα σου.</div>

        {editingName ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              onFocus={focusOn}
              onBlur={focusOff}
              onKeyDown={e => { if (e.key === 'Enter') void saveName(); if (e.key === 'Escape') cancelEditName(); }}
              placeholder="Η επωνυμία του γραφείου σου"
              autoFocus
              style={{ ...fieldStyle, flex: 1, minWidth: 220 }}
            />
            <Btn variant="primary" onClick={saveName} disabled={nameSaving}>
              {nameSaving ? 'Αποθήκευση…' : 'Αποθήκευση'}
            </Btn>
            <Btn variant="secondary" onClick={cancelEditName} disabled={nameSaving}>Άκυρο</Btn>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            <span style={{
              flex: 1, minWidth: 200, fontSize: 15, fontWeight: 600, fontFamily: T.font.sans,
              color: nameEmpty ? 'var(--text-tertiary)' : 'var(--text-primary)',
            }}>
              {nameEmpty ? 'Η επωνυμία του γραφείου σου' : org?.name}
            </span>
            {nameSaved && (
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--positive)', fontFamily: T.font.sans }}>Αποθηκεύτηκε ✓</span>
            )}
            <Btn variant="secondary" onClick={startEditName}>Αλλαγή</Btn>
          </div>
        )}
        {nameError && <div style={errStyle}>{nameError}</div>}
      </section>

      {/* ── Μέλη ─────────────────────────────────────────────────────── */}
      <section className="acc-section" style={{ animationDelay: '60ms' }}>
        <div style={subLabel}>Μέλη</div>
        <div style={descStyle}>Η ομάδα του οργανισμού σου.</div>

        {members.length === 0 ? (
          <div style={{ padding: '16px 0', fontSize: 13, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
            Κανένα μέλος ακόμη.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <div style={{ minWidth: ROW_MIN }}>
              {/* Κεφαλίδα στηλών */}
              <div style={{
                display: 'grid', gridTemplateColumns: ROW_COLS, gap: 16, alignItems: 'center',
                padding: '0 0 8px', borderBottom: '1px solid var(--border-subtle)',
              }}>
                <div style={microLabel}>Μέλος</div>
                <div style={microLabel}>Ρόλος</div>
                <div style={microLabel}>Κατάσταση</div>
                <div style={microLabel}>Πρόσβαση</div>
                <div style={microLabel} />
              </div>

              {members.map((m, i) => {
                const isOwner = m.role === 'owner';
                const isYou = m.user_id != null && m.user_id === userId;
                const canAct = !isOwner && m.status !== 'revoked';
                const busy = rowBusy === m.email;
                return (
                  <div
                    key={m.email || `row-${i}`}
                    style={{
                      display: 'grid', gridTemplateColumns: ROW_COLS, gap: 16, alignItems: 'center',
                      padding: '12px 0',
                      borderBottom: i < members.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      opacity: m.status === 'revoked' ? 0.55 : 1,
                    }}
                  >
                    {/* Μέλος (email + «Εσύ») */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{
                        fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{m.email || '—'}</span>
                      {isYou && <Chip tone="neutral">Εσύ</Chip>}
                    </div>

                    {/* Ρόλος */}
                    <div><RoleChip role={m.role} /></div>

                    {/* Κατάσταση */}
                    <div><StatusChip status={m.status} /></div>

                    {/* Πρόσβαση: έγκριση αιτήματος ή τμηματικός έλεγχος Ανάγνωση/Επεξεργασία */}
                    <div style={{ minWidth: 0 }}>
                      {canAct && (
                        m.edit_requested_at && !m.can_edit ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Chip tone="accent">Ζητά επεξεργασία</Chip>
                            <Btn variant="primary" onClick={() => setMemberEdit(m.email, true)} disabled={busy}>Έγκριση</Btn>
                            <Btn variant="secondary" onClick={() => setMemberEdit(m.email, false)} disabled={busy}>Όχι</Btn>
                          </div>
                        ) : (
                          <div style={{ display: 'inline-flex', border: '1px solid var(--border-default)', borderRadius: 8, overflow: 'hidden', opacity: busy ? 0.6 : 1 }}>
                            <SegBtn active={!m.can_edit} disabled={busy} onClick={() => { if (m.can_edit) void setMemberEdit(m.email, false); }}>Ανάγνωση</SegBtn>
                            <SegBtn active={m.can_edit} disabled={busy} divider onClick={() => { if (!m.can_edit) void setMemberEdit(m.email, true); }}>Επεξεργασία</SegBtn>
                          </div>
                        )
                      )}
                    </div>

                    {/* Ενέργειες */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {canAct && (
                        <>
                          <div style={{ width: 140, opacity: busy ? 0.6 : 1 }}>
                            <CustomSelect
                              value={m.role === 'admin' ? 'admin' : 'member'}
                              onChange={v => changeRole(m.email, v as InviteRole)}
                              options={ROLE_OPTIONS}
                              disabled={busy}
                            />
                          </div>
                          <Btn variant="secondary" onClick={() => revoke(m.email)} disabled={busy}>Αφαίρεση</Btn>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {rowError && <div style={errStyle}>{rowError}</div>}
      </section>

      {/* ── Πρόσκληση μέλους ─────────────────────────────────────────── */}
      <section className="acc-section" style={{ animationDelay: '120ms' }}>
        <div style={subLabel}>Πρόσκληση μέλους</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <input
            type="email"
            value={inviteEmail}
            onChange={e => { setInviteEmail(e.target.value); if (inviteError) setInviteError(null); }}
            onFocus={focusOn}
            onBlur={focusOff}
            onKeyDown={e => { if (e.key === 'Enter') void invite(); }}
            placeholder="Email του μέλους"
            style={{ ...fieldStyle, flex: 1, minWidth: 220 }}
          />
          <div style={{ width: 150 }}>
            <CustomSelect
              value={inviteRole}
              onChange={v => setInviteRole(v as InviteRole)}
              options={ROLE_OPTIONS}
            />
          </div>
          <Btn variant="primary" onClick={invite} disabled={inviting || !inviteEmail.trim()}>
            {inviting ? 'Πρόσκληση…' : 'Πρόσκληση'}
          </Btn>
        </div>
        {inviteError && <div style={errStyle}>{inviteError}</div>}
        <div style={{ ...descStyle, marginTop: 10 }}>
          Το μέλος αποκτά πρόσβαση μόλις συνδεθεί με το ίδιο email και ξεκινά με δικαίωμα ανάγνωσης. Την επεξεργασία την επιτρέπει ο ιδιοκτήτης από τη στήλη «Πρόσβαση».
        </div>
      </section>

      {/* ── Επεξήγηση ρόλων (μία γραμμή) ─────────────────────────────── */}
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5, fontFamily: T.font.sans, paddingTop: 2 }}>
        Ο ιδιοκτήτης έχει την πλήρη διαχείριση. Τα μέλη βλέπουν το χαρτοφυλάκιο και το επεξεργάζονται μόνο μετά από δική σου έγκριση.
      </div>
    </div>
  );
}
