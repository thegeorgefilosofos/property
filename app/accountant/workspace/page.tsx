'use client';
// ═══════════════════════════════════════════════════════════════════════════
// Ο ΧΩΡΟΣ ΤΟΥ ΛΟΓΙΣΤΗ: ΟΛΟΙ ΟΙ ΠΕΛΑΤΕΣ ΤΟΥ, ΣΕ ΜΙΑ ΛΙΣΤΑ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΥΠΗΡΧΕ. Ένας σύνδεσμος ανά ιδιοκτήτη, μόνο για ανάγνωση, ένας πελάτης τη
// φορά. Ο λογιστής όμως δεν έχει έναν πελάτη, έχει ογδόντα: θα κρατούσε
// ογδόντα συνδέσμους σε σελιδοδείκτες.
//
// ΤΙ ΚΑΝΕΙ ΑΥΤΗ Η ΟΘΟΝΗ. Μία λίστα, μία στήλη που λέει τι λείπει από τον
// καθένα, και ένα κουμπί που το ζητά. Ο ιδιοκτήτης το βλέπει στον πίνακά του.
// Δηλαδή το τηλεφώνημα «στείλε μου το εκκαθαριστικό» γίνεται γραμμή που
// κλείνει.
//
// ΤΙ ΔΕΝ ΔΕΙΧΝΕΙ. Ποσά. Ο λογιστής μπαίνει εδώ για να δει ΠΟΙΟΝ πρέπει να
// κυνηγήσει, όχι για να κάνει λογιστική· τη λογιστική τη διαβάζει στον φάκελο.
// Μια στήλη «έσοδα» θα γέμιζε την οθόνη με αριθμούς που δεν οδηγούν σε καμία
// ενέργεια, και θα έκρυβε τον έναν αριθμό που οδηγεί.
//
// ΤΑ ΝΟΥΜΕΡΑ ΔΕΝ ΦΤΑΝΟΥΝ ΠΟΤΕ ΩΜΑ ΣΤΗΝ ΟΘΟΝΗ. Η βάση μετρά, το
// lib/data/accountant.ts κρίνει, εδώ μόνο στοιχίζεται. Ο ίδιος κανόνας για
// κάθε πελάτη, γραμμένος μία φορά και δοκιμασμένος χωριστά.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from 'react';
import BrandMark from '@/components/BrandMark';
import { createClient } from '@/lib/supabase/client';
import { T, Card } from '@/components/Theme';
import { CustomSelect } from '@/app/dashboard/components/UIComponents';
import { claim, clients, request, gapsOf, readinessOf, type ClientCounts } from '@/lib/data/accountant';

/** Το τελευταίο κλεισμένο έτος: εκεί δουλεύει ο λογιστής τον περισσότερο χρόνο. */
const defaultYear = () => new Date().getFullYear() - 1;

export default function AccountantWorkspace() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [year, setYear] = useState(defaultYear);
  const [rows, setRows] = useState<ClientCounts[] | null>(null);
  const [token, setToken] = useState('');
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState('');
  const [asked, setAsked] = useState<Record<string, true>>({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, [supabase]);

  const load = useCallback(async (y: number) => {
    setRows(await clients(supabase, y));
  }, [supabase]);

  // ΤΟ ΑΠΟΤΕΛΕΣΜΑ ΓΡΑΦΕΤΑΙ ΜΟΝΟ ΑΝ Η ΟΘΟΝΗ ΤΟ ΠΕΡΙΜΕΝΕΙ ΑΚΟΜΗ. Χωρίς το `alive`,
  // δύο γρήγορες αλλαγές έτους αφήνουν το ΑΡΓΟΤΕΡΟ ερώτημα να απαντήσει πρώτο:
  // ο λογιστής διαλέγει 2025 και βλέπει τους πελάτες του 2024. Και η κλήση
  // φεύγει από το σώμα του effect, όπου ένα σύγχρονο setState προκαλεί
  // αλυσιδωτές αποδόσεις.
  useEffect(() => {
    if (!email) return;
    let alive = true;
    clients(supabase, year).then(r => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, [supabase, email, year]);

  // ΑΠΟ ΤΟΝ ΣΥΝΔΕΣΜΟ, ΟΧΙ ΜΟΝΟ ΑΠΟ ΤΟ TOKEN. Ο ιδιοκτήτης στέλνει ολόκληρη τη
  // διεύθυνση· το να ζητάμε από τον λογιστή να ψαλιδίσει το τελευταίο κομμάτι
  // είναι δουλειά που μπορούμε να κάνουμε εμείς.
  const addClient = async () => {
    const raw = token.trim();
    if (!raw) return;
    setAdding(true);
    const t = raw.includes('/') ? raw.replace(/[?#].*$/, '').split('/').filter(Boolean).pop() ?? raw : raw;
    const res = await claim(supabase, t);
    setAdding(false);
    if (res.ok) {
      setToken('');
      setNotice(`Προστέθηκε: ${res.owner}`);
      await load(year);
    } else {
      setNotice(res.reason === 'self'
        ? 'Αυτός ο σύνδεσμος είναι δικός σου.'
        : 'Ο σύνδεσμος δεν ισχύει. Ζήτησε καινούριο από τον ιδιοκτήτη.');
    }
  };

  const ask = async (owner: string, key: string, item: string) => {
    if (await request(supabase, owner, item)) {
      setAsked(a => ({ ...a, [`${owner}:${key}`]: true }));
    }
  };

  const wrap: React.CSSProperties = { maxWidth: 960, margin: '0 auto', padding: '0 clamp(16px,5vw,24px)' };
  const label: React.CSSProperties = {
    fontSize: 10, letterSpacing: '0.5px', textTransform: 'uppercase',
    color: 'var(--text-tertiary)', fontFamily: T.font.sans, margin: 0,
  };

  if (email === undefined) return <main style={{ ...wrap, padding: '64px 24px' }} />;

  if (email === null) {
    return (
      <main style={{ ...wrap, paddingTop: 72 }}>
        <BrandMark />
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '28px 0 8px', fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
          Ο χώρος του λογιστή
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)', margin: 0, fontFamily: T.font.sans, maxWidth: 560 }}>
          Συνδέσου με τον λογαριασμό σου για να δεις όλους τους ιδιοκτήτες που σε εξουσιοδότησαν, μαζί, και τι λείπει από τον καθένα.
        </p>
        <a href="/login?next=/accountant/workspace" style={{
          display: 'inline-flex', alignItems: 'center', height: T.h.lg, padding: '0 18px', marginTop: 22,
          borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-text)',
          fontSize: 13, fontWeight: 600, textDecoration: 'none', fontFamily: T.font.sans,
        }}>Σύνδεση</a>
      </main>
    );
  }

  const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

  return (
    <main style={{ ...wrap, paddingTop: 40, paddingBottom: 72 }}>
      <BrandMark />

      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', margin: '26px 0 0' }}>
        <div>
          <p style={label}>Χώρος λογιστή</p>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '6px 0 0', fontFamily: T.font.sans, color: 'var(--text-primary)', letterSpacing: '-0.4px' }}>
            Οι πελάτες σου
          </h1>
        </div>
        <div style={{ minWidth: 132 }}>
          <CustomSelect value={String(year)} onChange={v => setYear(Number(v))} options={years.map(y => ({ value: y, label: `Χρήση ${y}` }))} />
        </div>
      </header>

      {/* Η ΠΡΟΣΘΗΚΗ ΚΑΘΕΤΑΙ ΠΑΝΩ, ΓΙΑΤΙ ΕΙΝΑΙ Η ΠΡΩΤΗ ΚΙΝΗΣΗ ΠΟΥ ΚΑΝΕΙΣ ΕΔΩ.
          Όταν η λίστα γεμίσει, παύει να είναι η πρώτη — αλλά ούτε ενοχλεί, γιατί
          είναι μία γραμμή. */}
      <Card style={{ marginTop: 22 }}>
        <p style={label}>Νέος πελάτης</p>
        <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <input
            value={token}
            onChange={e => { setToken(e.target.value); setNotice(''); }}
            onKeyDown={e => { if (e.key === 'Enter') void addClient(); }}
            placeholder="Επικόλλησε τον σύνδεσμο που σου έστειλε ο ιδιοκτήτης"
            style={{
              flex: '1 1 340px', height: T.h.lg, padding: '0 13px', borderRadius: T.radius.inner,
              border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)',
              color: 'var(--text-primary)', fontSize: 13, fontFamily: T.font.sans,
            }}
          />
          <button
            onClick={() => void addClient()}
            disabled={adding || !token.trim()}
            style={{
              height: T.h.lg, padding: '0 18px', borderRadius: T.radius.inner, border: 'none',
              background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 13, fontWeight: 600,
              fontFamily: T.font.sans, cursor: adding || !token.trim() ? 'default' : 'pointer',
              opacity: adding || !token.trim() ? 0.5 : 1,
            }}
          >{adding ? 'Προσθήκη…' : 'Πρόσθεσε'}</button>
        </div>
        {notice && (
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '10px 0 0', fontFamily: T.font.sans }}>{notice}</p>
        )}
      </Card>

      {rows === null ? null : rows.length === 0 ? (
        <Card style={{ marginTop: 16 }}>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.7, fontFamily: T.font.sans }}>
            Κανένας πελάτης ακόμη. Ο ιδιοκτήτης βγάζει τον σύνδεσμο από τη Λογιστική του, στον φάκελο για τον λογιστή, και σου τον στέλνει.
          </p>
        </Card>
      ) : (
        <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          {rows.map(c => {
            const gaps = gapsOf(c);
            const ready = readinessOf(gaps);
            return (
              <Card key={c.ownerId}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)', fontFamily: T.font.sans }}>
                      {c.name}
                    </h2>
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '4px 0 0', fontFamily: T.font.sans }}>
                      {c.properties === 1 ? '1 ακίνητο' : `${c.properties} ακίνητα`}
                      {c.afm ? ` · ΑΦΜ ${c.afm}` : ''}
                    </p>
                  </div>
                  {/* Η ΚΑΤΑΣΤΑΣΗ ΕΙΝΑΙ ΛΕΞΗ, ΟΧΙ ΧΡΩΜΑ. Η ιεραρχία βγαίνει από
                      το βάρος και τη θέση: όποιος δεν κλείνει, το λέει δυνατά. */}
                  <p style={{
                    fontSize: 13, margin: 0, fontFamily: T.font.sans,
                    fontWeight: ready.blocking > 0 ? 700 : 500,
                    color: ready.blocking > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  }}>{ready.label}</p>
                </div>

                {gaps.length > 0 && (
                  <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', display: 'grid', gap: 1 }}>
                    {gaps.map(g => {
                      const done = asked[`${c.ownerId}:${g.key}`];
                      return (
                        <li key={g.key} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          gap: 14, padding: '9px 0', borderTop: '1px solid var(--border-subtle)',
                        }}>
                          <span style={{
                            fontSize: 13, fontFamily: T.font.sans, lineHeight: 1.5,
                            color: g.blocking ? 'var(--text-primary)' : 'var(--text-secondary)',
                            fontWeight: g.blocking ? 600 : 400,
                          }}>{g.item}</span>
                          <button
                            onClick={() => void ask(c.ownerId, g.key, g.item)}
                            disabled={done}
                            style={{
                              flexShrink: 0, height: 30, padding: '0 13px', borderRadius: 8,
                              border: '1px solid var(--border-subtle)', background: 'transparent',
                              color: done ? 'var(--text-tertiary)' : 'var(--text-primary)',
                              fontSize: 12, fontWeight: 600, fontFamily: T.font.sans,
                              cursor: done ? 'default' : 'pointer',
                            }}
                          >{done ? 'Ζητήθηκε' : 'Ζήτησέ το'}</button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {c.openRequests > 0 && (
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '12px 0 0', fontFamily: T.font.sans }}>
                    {c.openRequests === 1 ? '1 αίτημα σε εκκρεμότητα' : `${c.openRequests} αιτήματα σε εκκρεμότητα`}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '26px 0 0', lineHeight: 1.7, fontFamily: T.font.sans }}>
        Βλέπεις μόνο όσους σε εξουσιοδότησαν, και μόνο όσο κρατά ο σύνδεσμός τους. Ο ιδιοκτήτης μπορεί να τον ανακαλέσει οποτεδήποτε.
      </p>
    </main>
  );
}
