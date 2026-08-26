'use client';

// ═══════════════════════════════════════════════════════════════════════════
// LeaseDeclaration — «Δήλωση μίσθωσης», ο φάκελος που δεν σε αφήνει να κάνεις
// λάθος.
//
// Ο ιδιοκτήτης δεν χάνει χρόνο στο κλικ της υποβολής· χάνει χρόνο επειδή φτάνει
// στη φόρμα της ΑΑΔΕ και του λείπει το ΑΤΑΚ, ή γράφει λάθος ΑΦΜ και η δήλωση
// απορρίπτεται, ή ξεχνά την προθεσμία και πληρώνει πρόστιμο.
//
// Εδώ: όλα ελέγχονται ΠΡΙΝ, με τους πραγματικούς κανόνες (ΑΦΜ mod 11, ΑΤΑΚ 11
// ψηφία, ημερομηνίες), κάθε πεδίο αντιγράφεται με ένα κλικ στη σειρά της φόρμας,
// και η κατάσταση υποβολής καταγράφεται ώστε να υπάρχει ιστορικό.
//
// ΔΕΝ ζητάμε ποτέ κωδικούς Taxisnet και δεν υποβάλλουμε εκ μέρους του χρήστη.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as properties from '@/lib/data/properties';
import * as tenantStore from '@/lib/data/tenants';
import { T, TT, Btn, Modal, Spinner } from '@/components/Theme';
import { Copy, Check, ExternalLink, Printer, AlertTriangle, Clock } from 'lucide-react';
import { notifyError } from '@/components/Toast';
import { must } from '@/lib/supabase/must';
import { logActivity } from '@/lib/activity';
import { INK } from '@/lib/print/ink';
import { aadePath } from '@/lib/tax/aade';
import { failed } from '@/lib/core/dbError';
import {
  buildLeaseDeclaration, declarationSheet, RULES,
  type LeaseDeclarationInput, type DeclField,
} from '@/lib/tax/leaseDeclaration';

const TAB_LABEL: Record<NonNullable<DeclField['fixIn']>, string> = {
  property: 'Ακίνητο', tenant: 'Ενοικιαστής', settings: 'Ρυθμίσεις',
};

// Ενα κλειδί, τρεις χρήσεις: γράψιμο, ανάγνωση πίσω, περιγραφή στο ιστορικό
// (lib/activity.ts). Γραμμένο δεύτερη φορά στο χέρι, οι τρεις θα απέκλιναν.
const DECL_ACTION = 'lease_declaration_submitted';

// Η ΚΑΤΑΣΤΑΣΗ ΥΠΟΒΟΛΗΣ ΖΟΥΣΕ ΜΟΝΟ ΣΕ REACT STATE ΚΑΙ ΔΕΝ ΔΙΑΒΑΖΟΤΑΝ ΠΟΤΕ ΠΙΣΩ.
//
// Κλείσιμο και άνοιγμα του παραθύρου έσβηνε το «Καταγράφηκε» και τον αριθμό
// δήλωσης και η φόρμα ξαναζητούσε «Την υπέβαλα» για δήλωση ήδη υποβληθείσα:
// ο ιδιοκτήτης μπορούσε να καταγράψει την ίδια δήλωση δέκα φορές, με δέκα
// γραμμές στο ιστορικό και καμία ένδειξη ποια ίσχυε.
//
// Πηγή αλήθειας είναι η τελευταία γραμμή του activity_log για ΑΥΤΟ το ακίνητο.
// Το activity_log έχει πολιτική SELECT (baseline.sql:4207), όχι INSERT, οπότε
// η ανάγνωση περνά απευθείας ενώ το γράψιμο μόνο μέσω RPC.
async function readSubmitted(supabase: SupabaseClient, userId: string, propertyId: string):
  Promise<{ at: string; ref: string } | null> {
  const row = await must(supabase.from('activity_log')
    .select('created_at,metadata')
    .eq('user_id', userId).eq('action', DECL_ACTION).eq('entity_id', propertyId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle());
  if (!row) return null;
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  return { at: row.created_at as string, ref: typeof meta.reference === 'string' ? meta.reference : '' };
}

export default function LeaseDeclaration({ open, onClose, propertyId, userId, supabase }: {
  open: boolean; onClose: () => void; propertyId: string; userId: string; supabase: SupabaseClient;
}) {
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState<LeaseDeclarationInput>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ at: string; ref: string } | null>(null);
  const [refInput, setRefInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    // Το setLoading μπαίνει ΜΕΣΑ στο async, ώστε να μη γίνεται σύγχρονο setState
    // στο σώμα του effect (cascading renders).
    (async () => {
      if (alive) setLoading(true);
      try {
        const [prop, tenants, settings, prior] = await Promise.all([
          // ΤΑ ΟΝΟΜΑΤΑ ΤΩΝ ΣΤΗΛΩΝ ΟΠΩΣ ΤΑ ΕΧΕΙ Η ΒΑΣΗ, ΟΧΙ ΟΠΩΣ ΤΑ ΛΕΜΕ ΕΜΕΙΣ.
          //
          // Εδώ ζητούσε στήλη `type`. Ο πίνακας έχει `prop_type` — `type` δεν υπάρχει.
          // Το PostgREST δεν αγνοεί την άγνωστη στήλη: απορρίπτει ΟΛΟΚΛΗΡΟ το ερώτημα
          // (42703). Δηλαδή δεν χανόταν ο τύπος του ακινήτου· χάνονταν ΜΑΖΙ ΤΟΥ το
          // ΑΤΑΚ, η διεύθυνση, ο ΤΚ και τα τετραγωνικά.
          //
          // Τι έβλεπε ο ιδιοκτήτης: ανοίγει τη Δήλωση μίσθωσης —διαδικασία με νομική
          // προθεσμία και πρόστιμο— και ΟΛΑ τα πεδία του ακινήτου έγραφαν «λείπει»,
          // με οδηγία να πάει να τα συμπληρώσει στην καρτέλα Ακίνητο. Ήταν ήδη
          // συμπληρωμένα. Ξανάβρισκε το 11ψήφιο ΑΤΑΚ από το Ε9 για να ξεμπλοκάρει
          // κάτι που δεν ήταν ποτέ κενό.
          properties.one(supabase, propertyId, 'name,atak,address,postal_code,sqm,floor,prop_type,ownership', userId),
          // Ίδιο σφάλμα, δεύτερο σκέλος: ο πίνακας `tenants` ΔΕΝ έχει `created_at`,
          // έχει `updated_at`. Η ταξινόμηση σε ανύπαρκτη στήλη ρίχνει το ερώτημα
          // ακριβώς όπως η ανύπαρκτη στήλη στο select, οπότε «έλειπαν» και το
          // ονοματεπώνυμο και το ΑΦΜ του μισθωτή και οι ημερομηνίες και το μίσθωμα —
          // δηλαδή η μισή δήλωση. Το `updated_at` είναι ό,τι ζητούν ήδη οι υπόλοιπες
          // οθόνες για «τον τρέχοντα μισθωτή» (π.χ. ObligationsPanel).
          tenantStore.currentAll(supabase, propertyId, 'full_name,afm,id_doc_type,id_doc_number,email,phone,lease_start,lease_end,monthly_rent'),
          // ΚΛΕΙΔΙ ΑΚΙΝΗΤΟΥ, ΟΧΙ ΧΡΗΣΤΗ.
          //
          // Εδώ έγραφε `.eq('user_id', userId).maybeSingle()`. Ο πίνακας όμως έχει
          // `UNIQUE (property_id)`: μία γραμμή ανά ΑΚΙΝΗΤΟ. Ιδιοκτήτης με δύο ακίνητα
          // έχει δύο γραμμές και το `.maybeSingle()` πάνω σε δύο γραμμές ΔΕΝ γυρίζει
          // την πρώτη — γυρίζει σφάλμα. Το σφάλμα δεν διαβαζόταν (μόνο το `data`),
          // άρα `settings` γινόταν null σιωπηλά.
          //
          // Τι έβλεπε ο χρήστης: ανοίγει τη δήλωση μισθωτηρίου και του λέει ότι
          // λείπουν το ονοματεπώνυμο και το ΑΦΜ εκμισθωτή — ενώ τα έχει συμπληρώσει
          // και στα δύο ακίνητα. Ο έλεγχος του lib/tax/leaseDeclaration.ts ζητά το ΑΦΜ
          // ως υποχρεωτικό, οπότε μια νόμιμη δήλωση μπλόκαρε από ένα λάθος φίλτρο.
          // Και με ΕΝΑ ακίνητο δούλευε, άρα δεν φαινόταν ποτέ στη δοκιμή.
          must(supabase.from('property_settings').select('owner_name,owner_afm').eq('property_id', propertyId).maybeSingle()),
          // Η προηγούμενη υποβολή, αν υπάρχει. Φορτώνεται μαζί με τα υπόλοιπα
          // ώστε το παράθυρο να ανοίγει ήδη γνωρίζοντας τι έχει καταγραφεί.
          readSubmitted(supabase, userId, propertyId),
        ]);
        const t = (tenants || [])[0] as Record<string, unknown> | undefined;
        const p = prop as Record<string, unknown> | null;
        const s = settings as Record<string, unknown> | null;
        if (!alive) return;
        setSubmitted(prior);
        setRefInput(prior?.ref ?? '');
        setInput({
          owner: { name: (s?.owner_name as string) ?? null, afm: (s?.owner_afm as string) ?? null },
          property: { name: (p?.name as string) ?? null, atak: (p?.atak as string) ?? null, address: (p?.address as string) ?? null,
                      postalCode: (p?.postal_code as string) ?? null, sqm: (p?.sqm as number) ?? null,
                      floor: (p?.floor as string) ?? null, type: (p?.prop_type as string) ?? null,
                      ownershipPct: (p?.ownership as number) ?? null },
          tenant: { fullName: (t?.full_name as string) ?? null, afm: (t?.afm as string) ?? null,
                    idDocType: (t?.id_doc_type as string) ?? null, idDocNumber: (t?.id_doc_number as string) ?? null,
                    email: (t?.email as string) ?? null, phone: (t?.phone as string) ?? null },
          lease: { start: (t?.lease_start as string) ?? null, end: (t?.lease_end as string) ?? null,
                   monthlyRent: (t?.monthly_rent as number) ?? null },
        });
      } catch (e) {
        // ΤΟ ΣΦΑΛΜΑ ΤΗΣ ΑΝΑΓΝΩΣΗΣ ΠΡΕΠΕΙ ΝΑ ΑΚΟΥΓΕΤΑΙ.
        //
        // Πριν διαβαζόταν μόνο το `data` και το `error` πεταγόταν. Γι' αυτό οι δύο
        // λάθος στήλες παραπάνω έζησαν τόσο: η οθόνη δεν χάλαγε, απλώς έλεγε
        // «λείπει» σε όλα. Ο ιδιοκτήτης νόμιζε ότι φταίει η δική του καταχώρηση και
        // πήγαινε να την ξαναγράψει. Αν ξαναμετονομαστεί στήλη, τώρα θα φανεί ως
        // σφάλμα αντί για ψεύτικα κενά πεδία.
        if (alive) notifyError(failed('Δεν φορτώθηκαν τα στοιχεία της δήλωσης', e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [open, propertyId, userId, supabase]);

  const decl = useMemo(() => buildLeaseDeclaration(input), [input]);

  const copy = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1400); } catch { /* αγνόησε */ }
  };

  const printSheet = () => {
    const w = window.open('', '_blank');
    if (!w) { notifyError('Επίτρεψε τα αναδυόμενα παράθυρα.'); return; }
    const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
    w.document.write(`<!doctype html><html lang="el"><head><meta charset="utf-8"><title>Δήλωση μίσθωσης</title><style>body{font-family:'Inter',system-ui,sans-serif;padding:40px;max-width:760px;margin:0 auto;color:${INK}}pre{font-family:'Roboto Mono',monospace;font-size:13px;line-height:1.9;white-space:pre-wrap}@media print{body{padding:0}@page{margin:16mm}}</style></head><body><pre>${esc(declarationSheet(decl))}</pre><script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`);
    w.document.close();
  };

  const markSubmitted = async () => {
    setSaving(true);
    try {
      // ΤΟ ΓΡΑΨΙΜΟ ΠΕΡΝΑ ΜΟΝΟ ΑΠΟ ΤΟ RPC. Εδώ γινόταν απευθείας insert στο
      // activity_log, που έχει πολιτική SELECT και καμία INSERT: η RLS το
      // έκοβε με 42501 και καμία δήλωση δεν μπήκε ποτέ στο ιστορικό.
      await logActivity(supabase, DECL_ACTION, 'property', propertyId,
        { reference: refInput.trim() || null, deadline: decl.deadline.due });
      // Η ΕΠΙΒΕΒΑΙΩΣΗ ΕΡΧΕΤΑΙ ΑΠΟ ΤΗ ΒΑΣΗ, ΟΧΙ ΑΠΟ ΤΗΝ ΠΡΟΘΕΣΗ. Το logActivity
      // σωπαίνει σε αποτυχία, οπότε το «Καταγράφηκε» πριν την ανάγνωση ήταν
      // ακριβώς το ψέμα που έβλεπε ο ιδιοκτήτης δίπλα στο κόκκινο μήνυμα.
      const now = await readSubmitted(supabase, userId, propertyId);
      if (now) setSubmitted(now);
      else notifyError(failed('Η δήλωση δεν καταγράφηκε στο ιστορικό'));
    } catch (e) {
      notifyError(failed('Η δήλωση δεν καταγράφηκε στο ιστορικό', e));
    } finally {
      setSaving(false);
    }
  };

  const tone = decl.readiness === 'ready' ? (decl.deadline.state === 'overdue' ? 'warning' : 'positive')
             : decl.readiness === 'invalid' ? 'negative' : 'warning';
  const toneVar = tone === 'positive' ? 'var(--positive)' : tone === 'warning' ? 'var(--warning)' : 'var(--negative)';

  const row = (f: DeclField) => {
    const bad = f.status !== 'ok';
    const c = f.status === 'invalid' ? 'var(--negative)' : f.status === 'missing' ? 'var(--warning)' : 'var(--positive)';
    return (
      <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '3px 1fr auto', gap: 12, alignItems: 'center', padding: '10px 14px', borderTop: '1px solid var(--border-subtle)' }}>
        <span style={{ alignSelf: 'stretch', background: c, borderRadius: 3, opacity: bad ? 0.9 : 0.5 }} />
        <span style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{f.label}</div>
          {f.value
            ? <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.mono, marginTop: 1 }}>{f.value}</div>
            : <div style={{ fontSize: 13, color: c, fontWeight: 600, marginTop: 1, fontFamily: T.font.sans }}>Λείπει</div>}
          {f.hint && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3, lineHeight: 1.45 }}>
            {f.hint}{f.fixIn && <> <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Συμπληρώνεται στην καρτέλα {TAB_LABEL[f.fixIn]}</span></>}
          </div>}
        </span>
        {f.value && f.status === 'ok' && (
          <button onClick={() => copy(f.key, f.value)} title="Αντιγραφή"
            style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: copied === f.key ? 'var(--positive)' : 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {copied === f.key ? <Check size={14} /> : <Copy size={13} />}
          </button>
        )}
      </div>
    );
  };

  return (
    <Modal open={open} onClose={onClose} size="lg"
      title="Δήλωση μίσθωσης"
      subtitle="Έλεγχος πληρότητας πριν την υποβολή στο myAADE"
      icon={<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15l2 2 4-4"/></svg>}
      footerInfo={<>{decl.fields.filter(f => f.status === 'ok').length} από {decl.fields.length} πεδία έτοιμα</>}
      footer={<>
        <Btn variant="secondary" onClick={printSheet}><Printer size={14} />Εκτύπωση φύλλου</Btn>
        <Btn variant="primary" onClick={() => window.open(RULES.portalUrl, '_blank', 'noopener,noreferrer')}>
          Άνοιξε το myAADE<ExternalLink size={14} />
        </Btn>
      </>}>

      {loading ? <Spinner size={18} label="Φόρτωση…" /> : <>

        {/* Ετυμηγορία */}
        <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '13px 15px', borderRadius: 11,
                      background: `color-mix(in srgb, ${toneVar} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${toneVar} 28%, transparent)` }}>
          <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: toneVar, color: 'var(--on-tone)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, marginTop: 1 }}>
            {decl.readiness === 'ready' ? '✓' : decl.readiness === 'invalid' ? '✕' : '!'}
          </span>
          <span style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>{decl.summary}</span>
        </div>

        {/* Προθεσμία */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 15px', borderRadius: 11,
                      border: `1px solid ${decl.deadline.state === 'overdue' ? 'var(--negative-border)' : 'var(--border-subtle)'}`,
                      background: decl.deadline.state === 'overdue' ? 'var(--negative-soft)' : 'var(--bg-elevated)' }}>
          {decl.deadline.state === 'overdue' ? <AlertTriangle size={15} style={{ color: 'var(--negative)', flexShrink: 0 }} />
                                             : <Clock size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}
          <span style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>{decl.deadline.label}</span>
        </div>

        {/* Πεδία στη σειρά της φόρμας */}
        <div>
          <div style={{ ...TT.label, marginBottom: 8 }}>ΣΤΟΙΧΕΙΑ ΔΗΛΩΣΗΣ</div>
          <div style={{ ...TT.caption, marginBottom: 10, lineHeight: 1.5 }}>
            Με τη σειρά που τα ζητά η φόρμα. Πάτα το εικονίδιο για αντιγραφή και επικόλλησέ τα ένα-ένα.
          </div>
          {/* ΠΟΥ ΠΑΕΙ ΤΟ ΚΟΥΜΠΙ. Το «Άνοιξε το myAADE» άνοιγε την αρχική της
              πύλης και ο χρήστης έψαχνε μόνος του το μενού — με έτοιμα όλα τα
              πεδία στο χέρι. Η διαδρομή γράφεται σε λέξεις γιατί οι διευθύνσεις
              της ΑΑΔΕ αλλάζουν, τα ονόματα των υπηρεσιών της όχι. */}
          <div style={{ ...TT.caption, marginBottom: 10, lineHeight: 1.5, padding: '8px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 10 }}>
            Μέσα στην πύλη: {aadePath('lease')}
          </div>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 11, overflow: 'hidden' }}>
            {decl.fields.map(row)}
          </div>
        </div>

        {/* Καταγραφή υποβολής */}
        <div>
          <div style={{ ...TT.label, marginBottom: 8 }}>ΜΕΤΑ ΤΗΝ ΥΠΟΒΟΛΗ</div>
          {submitted ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 15px', borderRadius: 11, background: 'var(--positive-soft)', border: '1px solid var(--positive-border)' }}>
              <Check size={15} style={{ color: 'var(--positive)', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                Καταγράφηκε στις {new Date(submitted.at).toLocaleDateString('el-GR')}
                {submitted.ref && <> · αρ. δήλωσης <strong style={{ fontFamily: T.font.num }}>{submitted.ref}</strong></>}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input aria-label="Αριθμός δήλωσης μίσθωσης" value={refInput} onChange={e => setRefInput(e.target.value)} placeholder="Αριθμός δήλωσης (προαιρετικό)"
                style={{ flex: 1, minWidth: 200, height: T.h.lg, padding: '0 13px', borderRadius: 10, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 14, fontFamily: T.font.sans, outline: 'none' }} />
              <Btn variant="secondary" onClick={markSubmitted} disabled={saving}>{saving ? 'Αποθήκευση…' : 'Την υπέβαλα'}</Btn>
            </div>
          )}
          <div style={{ ...TT.caption, marginTop: 8, lineHeight: 1.5 }}>
            Ο μισθωτής πρέπει να αποδεχθεί τη δήλωση από τον δικό του λογαριασμό στο myAADE.
            {' '}Πηγή: {RULES.source}. Επιβεβαίωσε πάντα την τρέχουσα διαδικασία στην ΑΑΔΕ.
          </div>
        </div>
      </>}
    </Modal>
  );
}
