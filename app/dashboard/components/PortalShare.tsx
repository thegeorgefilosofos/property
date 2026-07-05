'use client';

// ═══════════════════════════════════════════════════════════════════════════
// PortalShare — πλευρά ιδιοκτήτη για την Πύλη Ενοικιαστή. Δημιουργεί/κοινοποιεί
// τον σύνδεσμο και εμφανίζει τα εισερχόμενα αιτήματα βλάβης (cross-tab).
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, fd } from '@/components/Theme';

interface Req { id: string; title: string; description: string | null; contact: string | null; status: string; created_at: string; }

export default function PortalShare({ propertyId, userId }: { propertyId: string; userId: string }) {
  const supabase = createClient();
  const [token, setToken] = useState<string | null>(null);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const { data: link } = await supabase.from('portal_links').select('token').eq('property_id', propertyId).eq('user_id', userId).maybeSingle();
    setToken(link?.token || null);
    const { data: r } = await supabase.from('maintenance_requests').select('*').eq('property_id', propertyId).eq('user_id', userId).order('created_at', { ascending: false });
    setReqs((r as Req[]) || []);
  }, [propertyId, userId]);

  useEffect(() => { load(); }, [load]);

  const enable = async () => {
    setBusy(true);
    const { data, error } = await supabase.from('portal_links').insert({ property_id: propertyId, user_id: userId }).select('token').single();
    setBusy(false);
    if (!error && data) setToken(data.token);
    else if (error) alert('Σφάλμα: ' + error.message);
  };

  const url = token && typeof window !== 'undefined' ? `${window.location.origin}/portal/${token}` : '';
  const copy = () => { if (url) { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } };
  const markDone = async (id: string) => { await supabase.from('maintenance_requests').update({ status: 'done' }).eq('id', id); load(); };

  const pending = reqs.filter(r => r.status !== 'done');

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>Πύλη Ενοικιαστή</div>
            <div style={{ fontFamily: T.font.sans, fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>Κοινοποίησε σύνδεσμο & δες αιτήματα βλάβης</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {pending.length > 0 && <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: 'var(--negative)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', fontFamily: T.font.sans }}>{pending.length}</span>}
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><path d="m6 9 6 6 6-6"/></svg>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
          {!token ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5, flex: 1, minWidth: 200 }}>Ενεργοποίησε έναν ασφαλή σύνδεσμο που μπορεί να μοιραστεί ο ενοικιαστής σου — βλέπει ενοίκιο/σύμβαση και στέλνει αιτήματα.</div>
              <button onClick={enable} disabled={busy} style={{ height: 36, padding: '0 16px', borderRadius: T.radius.pill, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{busy ? 'Ενεργοποίηση…' : 'Ενεργοποίηση πύλης'}</button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                <input readOnly value={url} onFocus={e => e.currentTarget.select()} style={{ flex: 1, minWidth: 200, background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.mono, outline: 'none' }} />
                <button onClick={copy} style={{ height: 36, padding: '0 16px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{copied ? 'Αντιγράφηκε ✓' : 'Αντιγραφή'}</button>
                <a href={url} target="_blank" rel="noopener noreferrer" style={{ height: 36, display: 'inline-flex', alignItems: 'center', padding: '0 16px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Άνοιγμα</a>
              </div>

              <div style={{ fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 8 }}>Αιτήματα ({pending.length} εκκρεμή)</div>
              {reqs.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, padding: '8px 0' }}>Κανένα αίτημα ακόμη.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {reqs.slice(0, 6).map(r => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: r.status === 'done' ? 'var(--bg-elevated)' : 'var(--warning-soft)', border: `1px solid ${r.status === 'done' ? 'var(--border-subtle)' : 'var(--warning-border)'}`, borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', textDecoration: r.status === 'done' ? 'line-through' : 'none', opacity: r.status === 'done' ? 0.6 : 1 }}>{r.title}</div>
                        {r.description && <div style={{ fontFamily: T.font.sans, fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, lineHeight: 1.5 }}>{r.description}</div>}
                        <div style={{ fontFamily: T.font.sans, fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>{fd(r.created_at)}{r.contact ? ` · ${r.contact}` : ''}</div>
                      </div>
                      {r.status !== 'done' && <button onClick={() => markDone(r.id)} style={{ flexShrink: 0, height: 28, padding: '0 10px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Ολοκληρώθηκε</button>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
