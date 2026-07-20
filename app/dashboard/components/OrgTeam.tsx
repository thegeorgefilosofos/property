'use client';

// ═══════════════════════════════════════════════════════════════════════════
// OrgTeam, «Οργανισμός & Ομάδα» (tier Επαγγελματίας). Ο ιδιοκτήτης ονομάζει τον
// οργανισμό του και διαχειρίζεται μια λίστα μελών με ρόλους και προσκλήσεις με
// email. Αποδίδεται ΓΥΜΝΟ μέσα σε υπάρχουσα Card του γονέα (δεν τυλίγεται σε δική
// του Card, ο γονέας δίνει <Card><SecHdr label="Οργανισμός & Ομάδα" />…).
//
// Πηγή αλήθειας για χρώματα/κενά/ακτίνες: app/globals.css (μόνο CSS variables).
// Τα μέλη έχουν πρόσβαση ΑΝΑΓΝΩΣΗΣ στο χαρτοφυλάκιο σε αυτή την έκδοση, καμία
// επεξεργασία, και το UI δεν υπόσχεται κάτι διαφορετικό.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState, type CSSProperties, type FocusEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, Btn } from '@/components/Theme';

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
const selectStyle: CSSProperties = {
  height: 38,
  borderRadius: 8,
  border: '1px solid var(--border-default)',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontFamily: T.font.sans,
  fontSize: 13,
  fontWeight: 600,
  padding: '0 10px',
  boxSizing: 'border-box',
  cursor: 'pointer',
};
const subLabel: CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans };
const descStyle: CSSProperties = { fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5, fontFamily: T.font.sans, marginTop: 3 };
const errStyle: CSSProperties = { fontSize: 12, color: 'var(--negative)', fontFamily: T.font.sans, marginTop: 8 };
const microLabel: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontFamily: T.font.sans };

// Πλέγμα σειράς μητρώου (κοινό σε κεφαλίδα & γραμμές, για τέλεια ευθυγράμμιση).
const ROW_COLS = 'minmax(200px, 1fr) 120px 140px 250px';
const ROW_MIN = 760;

const focusOn = (e: FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = 'var(--accent)'; };
const focusOff = (e: FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = 'var(--border-default)'; };

// ── Chip ρόλου: διακριτικό· owner με accent-soft, admin/member ουδέτερα ────
function RoleChip({ role }: { role: Role }) {
  const owner = role === 'owner';
  const label = role === 'owner' ? 'Ιδιοκτήτης' : role === 'admin' ? 'Διαχειριστής' : 'Μέλος';
  return (
    <span style={{
      display: 'inline-flex', borderRadius: 100, padding: '3px 9px', fontSize: 10, fontWeight: 700,
      fontFamily: T.font.sans, whiteSpace: 'nowrap',
      background: owner ? 'var(--accent-soft)' : 'var(--bg-elevated)',
      color: owner ? 'var(--accent)' : 'var(--text-secondary)',
      border: `1px solid ${owner ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
    }}>{label}</span>
  );
}

// ── Chip κατάστασης: Ενεργό (positive soft) / Προσκεκλημένο (ουδέτερο) /
//    Ανακλήθηκε (σβησμένο) ───────────────────────────────────────────────
function StatusChip({ status }: { status: Status }) {
  const cfg =
    status === 'active'
      ? { label: 'Ενεργό', bg: 'var(--positive-soft)', color: 'var(--positive)', border: 'var(--positive-border)' }
      : status === 'invited'
      ? { label: 'Προσκεκλημένο', bg: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: 'var(--border-subtle)' }
      : { label: 'Ανακλήθηκε', bg: 'transparent', color: 'var(--text-tertiary)', border: 'var(--border-subtle)' };
  return (
    <span style={{
      display: 'inline-flex', borderRadius: 100, padding: '3px 9px', fontSize: 10, fontWeight: 700,
      fontFamily: T.font.sans, whiteSpace: 'nowrap', background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
    }}>{cfg.label}</span>
  );
}

export default function OrgTeam({ userId }: { userId: string }) {
  const supabase = createClient();

  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

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
      .select('email, role, status, joined_at, user_id')
      .eq('org_id', orgId)
      .order('invited_at');
    setMembers((data as Member[] | null) ?? []);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase.rpc('ensure_organization');
      if (!active) return;
      if (error || !data) { setLoading(false); return; }
      const o = (Array.isArray(data) ? data[0] : data) as Org;
      setOrg(o);
      setNameDraft(o?.name ?? '');
      await loadMembers(o.id);
      if (active) setLoading(false);
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

  if (loading) {
    return (
      <div style={{ padding: '20px 0', fontSize: 13, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
        Φόρτωση…
      </div>
    );
  }

  const nameEmpty = !org?.name?.trim();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

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
                      {isYou && (
                        <span style={{
                          flexShrink: 0, borderRadius: 100, padding: '2px 7px', fontSize: 10, fontWeight: 700,
                          fontFamily: T.font.sans, background: 'var(--bg-elevated)', color: 'var(--text-tertiary)',
                          border: '1px solid var(--border-subtle)',
                        }}>Εσύ</span>
                      )}
                    </div>

                    {/* Ρόλος */}
                    <div><RoleChip role={m.role} /></div>

                    {/* Κατάσταση */}
                    <div><StatusChip status={m.status} /></div>

                    {/* Ενέργειες */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {canAct && (
                        <>
                          <select
                            value={m.role === 'admin' ? 'admin' : 'member'}
                            onChange={e => changeRole(m.email, e.target.value as InviteRole)}
                            onFocus={focusOn}
                            onBlur={focusOff}
                            disabled={busy}
                            aria-label="Ρόλος μέλους"
                            style={{ ...selectStyle, opacity: busy ? 0.6 : 1 }}
                          >
                            <option value="admin">Διαχειριστής</option>
                            <option value="member">Μέλος</option>
                          </select>
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
          <select
            value={inviteRole}
            onChange={e => setInviteRole(e.target.value as InviteRole)}
            onFocus={focusOn}
            onBlur={focusOff}
            aria-label="Ρόλος πρόσκλησης"
            style={{ ...selectStyle, height: 40 }}
          >
            <option value="admin">Διαχειριστής</option>
            <option value="member">Μέλος</option>
          </select>
          <Btn variant="primary" onClick={invite} disabled={inviting || !inviteEmail.trim()}>
            {inviting ? 'Πρόσκληση…' : 'Πρόσκληση'}
          </Btn>
        </div>
        {inviteError && <div style={errStyle}>{inviteError}</div>}
        <div style={{ ...descStyle, marginTop: 10 }}>
          Το μέλος μπαίνει αυτόματα με το που συνδεθεί με το ίδιο email. Σε αυτή την έκδοση, τα μέλη έχουν πρόσβαση ανάγνωσης στο χαρτοφυλάκιο.
        </div>
      </section>

      {/* ── Επεξήγηση ρόλων (μία γραμμή) ─────────────────────────────── */}
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5, fontFamily: T.font.sans, paddingTop: 2 }}>
        Ο Ιδιοκτήτης διαχειρίζεται τα πάντα· ο Διαχειριστής και το Μέλος μόνο βλέπουν.
      </div>
    </div>
  );
}
