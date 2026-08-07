'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ClientCompose — μαζική & στοχευμένη επικοινωνία με πελάτες μέσω email.
// Επιλογή παραληπτών (φίλτρα CRM: όλοι με email / VIP / βαθμ. 4+ / αναζήτηση +
// ανά-πελάτη επιλογή), θέμα, κείμενο, «Σύνταξη με AI», και αποστολή τώρα με
// ζωντανό αποτέλεσμα ανά παραλήπτη. Στέλνει μέσω της edge function
// send-client-email (τρέχει με το JWT του χρήστη· RLS· κλειδί Resend server-side).
//
// Σχεδίαση: ίδιο design system με τα υπόλοιπα (Theme tokens, near-monochrome,
// premium overlay + sticky header/footer). Καμία εξάρτηση από MCP.
// ═══════════════════════════════════════════════════════════════════════════
import { brandMarkHtml } from '@/components/BrandMark';
import { useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { T, TT, Btn, Badge } from '@/components/Theme';
import { escHtml as esc } from '@/lib/reportBranding';

// Ελάχιστο σχήμα πελάτη που χρειάζεται η σύνθεση (το Client του TabClients το ικανοποιεί).
export interface ComposeClient {
  id: string; full_name: string; email: string | null;
  rating?: number | null; vip?: boolean | null; do_not_rent?: boolean | null;
}

interface Result { email: string; name: string | null; status: string; error?: string | null }

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// Τυλίγει το κείμενο του χρήστη σε καθαρό, branded HTML (ίδια «κάρτα» με τα άλλα
// emails). Τα {{name}} / {{email}} μένουν ανέπαφα για personalization από τη function.
function wrapEmailHtml(bodyText: string): string {
  const paras = esc(bodyText).trim().split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 14px;font-size:14px;color:#3c4043;line-height:1.7;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f3f4;font-family:-apple-system,'Inter',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="display:flex;align-items:center;margin-bottom:22px;">
      ${brandMarkHtml(34)}
      <span style="font-size:16px;font-weight:700;color:#111;margin-left:10px;">Property OS</span>
    </div>
    <div style="background:#fff;border:1px solid #e8eaed;border-radius:14px;padding:26px 24px;">${paras || '<p style="margin:0;color:#9aa0a6;">—</p>'}</div>
    <p style="text-align:center;font-size:11px;color:#9aa0a6;margin:18px 0 4px;line-height:1.6;">Στάλθηκε μέσω Property OS</p>
  </div></body></html>`;
}

const initials = (name: string) =>
  (name.trim().split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('') || '?').toUpperCase();

export default function ClientCompose({ open, onClose, clients, supabase }: {
  open: boolean; onClose: () => void; clients: ComposeClient[]; supabase: SupabaseClient;
}) {
  // Επιλέξιμοι = όσοι έχουν έγκυρο email. Οι υπόλοιποι δεν εμφανίζονται.
  const emailable = useMemo(
    () => clients.filter(c => c.email && isEmail(String(c.email).trim())),
    [clients]
  );

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [q, setQ] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBrief, setAiBrief] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [results, setResults] = useState<Result[] | null>(null);
  const [summary, setSummary] = useState<{ sent: number; failed: number } | null>(null);

  // Αρχικοποίηση: όλοι οι non-blacklist επιλεγμένοι, μία φορά κατά το άνοιγμα.
  const [primed, setPrimed] = useState(false);
  if (open && !primed) {
    setSelected(new Set(emailable.filter(c => !c.do_not_rent).map(c => c.id)));
    setPrimed(true);
  }
  if (!open && primed) setPrimed(false);

  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return emailable;
    return emailable.filter(c => c.full_name.toLowerCase().includes(t) || String(c.email).toLowerCase().includes(t));
  }, [emailable, q]);

  const selCount = selected.size;
  const toggle = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const setMany = (ids: string[]) => setSelected(new Set(ids));

  if (!open) return null;

  const reset = () => { setResults(null); setSummary(null); setErr(''); };

  const generateAI = async () => {
    if (!aiBrief.trim()) return;
    setAiBusy(true); setAiErr('');
    try {
      const res = await fetch('/api/anthropic', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          max_tokens: 900,
          system: 'Είσαι βοηθός σύνταξης επαγγελματικών email στα ελληνικά για διαχειριστή/ιδιοκτήτη ακινήτων που χρησιμοποιεί το Property OS. Γράψε ευγενικό, καθαρό, σύντομο και επαγγελματικό email προς πελάτες. Χρησιμοποίησε το {{name}} για την προσφώνηση (π.χ. «Αγαπητέ/ή {{name}},»). Μη βάζεις υπογραφή με ψεύτικα στοιχεία. Επίστρεψε ΑΥΣΤΗΡΑ ένα JSON αντικείμενο {"subject": "...", "body": "..."} χωρίς markdown ή σχόλια.',
          messages: [{ role: 'user', content: `Σύνταξε email με βάση: ${aiBrief.trim()}` }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Αποτυχία σύνταξης.');
      const raw = ((data.content || []) as { type: string; text?: string }[]).find(c => c.type === 'text')?.text?.replace(/```json?|```/g, '').trim() || '{}';
      const p = JSON.parse(raw);
      if (p.subject) setSubject(String(p.subject));
      if (p.body) setBody(String(p.body));
      setAiOpen(false);
    } catch (e) {
      // Το `catch` δίνει `unknown`, όχι `any`: ρωτάμε τι είναι πριν το διαβάσουμε.
      const msg = e instanceof Error ? e.message : '';
      setAiErr(msg === 'Unexpected token' || e instanceof SyntaxError ? 'Η απάντηση δεν ήταν έγκυρη. Δοκίμασε ξανά.' : (msg || 'Αποτυχία σύνταξης.'));
    } finally { setAiBusy(false); }
  };

  const send = async () => {
    setErr('');
    const recips = emailable.filter(c => selected.has(c.id)).map(c => ({ email: String(c.email), name: c.full_name, clientId: c.id }));
    if (!subject.trim()) { setErr('Συμπλήρωσε θέμα.'); return; }
    if (!recips.length) { setErr('Διάλεξε τουλάχιστον έναν παραλήπτη.'); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-client-email', {
        body: { subject: subject.trim(), bodyHtml: wrapEmailHtml(body), kind: 'broadcast', recipients: recips },
      });
      if (error) {
        let detail = '';
        // Το σφάλμα μιας συνάρτησης Supabase κουβαλά το σώμα της απάντησης στο
        // `context`. Δεν είναι στον δημόσιο τύπο, γι' αυτό δηλώνεται εδώ ρητά.
        try { const d = await (error as { context?: { json?: () => Promise<{ detail?: string; error?: string }> } }).context?.json?.(); detail = d?.detail || d?.error || ''; } catch { /* ignore */ }
        // ΟΧΙ ΟΝΟΜΑΤΑ FUNCTIONS ΚΑΙ ΜΕΤΑΒΛΗΤΩΝ ΠΕΡΙΒΑΛΛΟΝΤΟΣ ΣΤΗΝ ΟΘΟΝΗ.
        // Το παλιό μήνυμα ζητούσε από τον ιδιοκτήτη ακινήτου να ελέγξει αν
        // «έχει γίνει deploy η function send-client-email» και αν «υπάρχει το
        // RESEND_API_KEY» — δύο πράγματα που ούτε μπορεί ούτε πρέπει να δει.
        // Και ονομάτιζε δημόσια ένα μυστικό της υποδομής.
        throw new Error(detail || 'Η αποστολή δεν έγινε. Δοκίμασε ξανά σε λίγο, και αν επιμείνει γράψε μας.');
      }
      const campaignId = data?.campaignId as string | undefined;
      setSummary({ sent: Number(data?.sent) || 0, failed: Number(data?.failed) || 0 });
      // Ζωντανό αποτέλεσμα ανά παραλήπτη από τον πίνακα email_recipients.
      if (campaignId) {
        const { data: rows } = await supabase.from('email_recipients')
          .select('email,name,status,error').eq('campaign_id', campaignId).order('email');
        setResults((rows || []) as Result[]);
      } else {
        setResults(recips.map(r => ({ email: r.email, name: r.name, status: 'sent' })));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Η αποστολή απέτυχε.');
    } finally { setSending(false); }
  };

  // ── Στυλ ───────────────────────────────────────────────────────────────────
  const field: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: T.radius.inner,
    border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
    color: 'var(--text-primary)', fontSize: 14, fontFamily: T.font.sans, outline: 'none', boxSizing: 'border-box',
  };
  const chip = (on: boolean): React.CSSProperties => ({
    fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: T.radius.pill, cursor: 'pointer',
    border: `1px solid ${on ? 'var(--accent-border)' : 'var(--border-default)'}`,
    background: on ? 'var(--accent-soft)' : 'transparent', color: on ? 'var(--accent)' : 'var(--text-secondary)',
    fontFamily: T.font.sans, whiteSpace: 'nowrap',
  });

  return (
    <div role="dialog" aria-modal="true" aria-label="Σύνταξη μηνύματος" onClick={onClose} style={{ position: 'fixed', inset: 0, background: T.scrim, backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 18, width: 'min(760px, 100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--elev-3)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...TT.h2 }}>Σύνταξη email</div>
            <div style={{ ...TT.bodySm, marginTop: 1 }}>Μαζική, στοχευμένη επικοινωνία με τους πελάτες σου</div>
          </div>
          <button onClick={onClose} aria-label="Κλείσιμο" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {/* Body (scroll) */}
        <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {results ? (
            // ── Αποτέλεσμα αποστολής ────────────────────────────────────────
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: (summary?.failed ? 'var(--warning-soft)' : 'var(--positive-soft)'), border: `1px solid ${summary?.failed ? 'var(--warning-border)' : 'var(--positive-border)'}`, color: summary?.failed ? 'var(--warning)' : 'var(--positive)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>✓</div>
                <div>
                  <div style={{ ...TT.h2 }}>Στάλθηκε</div>
                  <div style={{ ...TT.bodySm }}>{summary?.sent || 0} επιτυχή{summary?.failed ? ` · ${summary.failed} απέτυχαν` : ''}</div>
                </div>
              </div>
              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
                {(results || []).map((r, i) => (
                  <div key={r.email + i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: i ? '1px solid var(--border-subtle)' : 'none' }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{r.name || r.email}</span>
                      {r.name && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 8 }}>{r.email}</span>}
                    </span>
                    <Badge tone={r.status === 'sent' ? 'positive' : r.status === 'failed' ? 'negative' : 'neutral'}>
                      {r.status === 'sent' ? 'Εστάλη' : r.status === 'failed' ? 'Απέτυχε' : 'Εκκρεμεί'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Παραλήπτες */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                  <div style={{ ...TT.label }}>Παραλήπτες</div>
                  <div style={{ ...TT.bodySm }}><b style={{ color: 'var(--text-primary)' }}>{selCount}</b> επιλεγμένοι από {emailable.length} με email</div>
                </div>
                {emailable.length === 0 ? (
                  <div style={{ ...TT.bodySm, padding: '14px 0' }}>Κανένας πελάτης δεν έχει καταχωρημένο email. Πρόσθεσε emails στις καρτέλες πελατών για να στείλεις μαζικά.</div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                      <button style={chip(false)} onClick={() => setMany(emailable.filter(c => !c.do_not_rent).map(c => c.id))}>Όλοι</button>

                      <button style={chip(false)} onClick={() => setMany([])}>Καθαρισμός</button>
                    </div>
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Αναζήτηση ονόματος ή email…" style={{ ...field, marginBottom: 8 }} />
                    <div style={{ maxHeight: 208, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 12 }}>
                      {visible.map((c, i) => {
                        const on = selected.has(c.id);
                        return (
                          <button key={c.id} onClick={() => toggle(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderTop: i ? '1px solid var(--border-subtle)' : 'none', background: on ? 'var(--accent-soft)' : 'transparent', cursor: 'pointer', fontFamily: T.font.sans }}>
                            <span style={{ width: 18, height: 18, borderRadius: 6, flexShrink: 0, border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`, background: on ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {on && <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>}
                            </span>
                            <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)', fontWeight: 700, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials(c.full_name)}</span>
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                              <span style={{ display: 'block', fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</span>
                              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</span>
                            </span>

                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Μήνυμα */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                  <div style={{ ...TT.label }}>Μήνυμα</div>
                  <Btn variant="ghost" onClick={() => setAiOpen(o => !o)}>
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3m0 12v3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M3 12h3m12 0h3M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1"/></svg>
                    Σύνταξη με AI
                  </Btn>
                </div>

                {aiOpen && (
                  <div style={{ border: '1px solid var(--accent-border)', background: 'var(--accent-soft)', borderRadius: 12, padding: 14, marginBottom: 12 }}>
                    <div style={{ ...TT.bodySm, marginBottom: 8 }}>Πες μου με λίγα λόγια τι θέλεις να πεις — θα το γράψω επαγγελματικά.</div>
                    <textarea value={aiBrief} onChange={e => setAiBrief(e.target.value)} rows={2}
                      placeholder="Παράδειγμα: Ευχαριστήριο μετά τη διαμονή + κάλεσμα για κράτηση με 10% έκπτωση την επόμενη φορά"
                      style={{ ...field, resize: 'vertical', marginBottom: 10 }} />
                    {aiErr && <div style={{ fontSize: 12, color: 'var(--negative)', marginBottom: 8 }}>{aiErr}</div>}
                    <Btn variant="primary" onClick={generateAI} disabled={aiBusy || !aiBrief.trim()}>{aiBusy ? 'Σύνταξη…' : 'Σύνταξη κειμένου'}</Btn>
                  </div>
                )}

                <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Θέμα" style={{ ...field, marginBottom: 10 }} />
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={8}
                  placeholder="Γράψε το μήνυμά σου εδώ…" style={{ ...field, resize: 'vertical', lineHeight: 1.6 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Προσωποποίηση:</span>
                  <code style={{ fontSize: 11, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '2px 6px', fontFamily: T.font.mono, color: 'var(--text-secondary)' }}>{'{{name}}'}</code>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>→ το όνομα κάθε παραλήπτη</span>
                </div>
              </div>

              {err && <div style={{ fontSize: 13, color: 'var(--negative)', background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: 10, padding: '10px 14px' }}>{err}</div>}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 24px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0, flexWrap: 'wrap' }}>
          {results ? (
            <>
              <span style={{ ...TT.bodySm }}>Οι απαντήσεις των πελατών θα έρθουν στο email σου.</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn variant="secondary" onClick={() => { reset(); setSubject(''); setBody(''); }}>Νέο μήνυμα</Btn>
                <Btn variant="primary" onClick={onClose}>Κλείσιμο</Btn>
              </div>
            </>
          ) : (
            <>
              <span style={{ ...TT.bodySm }}>{selCount} παραλήπτ{selCount === 1 ? 'ης' : 'ες'} · reply-to το email σου</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn variant="secondary" onClick={onClose}>Ακύρωση</Btn>
                <Btn variant="primary" onClick={send} disabled={sending || !subject.trim() || selCount === 0}>{sending ? 'Αποστολή…' : `Αποστολή${selCount ? ` (${selCount})` : ''}`}</Btn>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
