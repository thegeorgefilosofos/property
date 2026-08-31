'use client';
// ═══════════════════════════════════════════════════════════════════════════
// Ο ΧΩΡΟΣ ΤΟΥ ΛΟΓΙΣΤΗ: ΟΛΟΙ ΟΙ ΠΕΛΑΤΕΣ ΤΟΥ, ΣΕ ΜΙΑ ΛΙΣΤΑ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΥΠΗΡΧΕ. Ένας σύνδεσμος ανά ιδιοκτήτη, μόνο για ανάγνωση, ένας πελάτης τη
// φορά. Ο λογιστής όμως δεν έχει έναν πελάτη, έχει ογδόντα: θα κρατούσε
// ογδόντα συνδέσμους σε σελιδοδείκτες.
//
// ΤΙ ΚΑΝΕΙ ΑΥΤΗ Η ΟΘΟΝΗ. Μία λίστα, μία στήλη που λέει τι λείπει από τον
// καθένα και ένα κουμπί που το ζητά. Ο ιδιοκτήτης το βλέπει στον πίνακά του.
// Δηλαδή το τηλεφώνημα «στείλε μου το εκκαθαριστικό» γίνεται γραμμή που
// κλείνει.
//
// ΤΙ ΔΕΝ ΔΕΙΧΝΕΙ. Ποσά. Ο λογιστής μπαίνει εδώ για να δει ΠΟΙΟΝ πρέπει να
// κυνηγήσει, όχι για να κάνει λογιστική· τη λογιστική τη διαβάζει στον φάκελο.
// Μια στήλη «έσοδα» θα γέμιζε την οθόνη με αριθμούς που δεν οδηγούν σε καμία
// ενέργεια και θα έκρυβε τον έναν αριθμό που οδηγεί.
//
// ΤΑ ΝΟΥΜΕΡΑ ΔΕΝ ΦΤΑΝΟΥΝ ΠΟΤΕ ΩΜΑ ΣΤΗΝ ΟΘΟΝΗ. Η βάση μετρά, το
// lib/data/accountant.ts κρίνει, εδώ μόνο στοιχίζεται. Ο ίδιος κανόνας για
// κάθε πελάτη, γραμμένος μία φορά και δοκιμασμένος χωριστά.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, Card, Btn, Skeleton } from '@/components/Theme';
import { TextInput } from '@/app/dashboard/components/UIComponents';
import { PortalBar, PortalTitle, portalWrap } from '../Chrome';
import { claim, clients, request, withdrawRequest, dropClient, gapsOf, readinessOf, type ClientCounts } from '@/lib/data/accountant';
import { loadStatements, downloadAll, lastMove, type BulkClient, type ClientStatement } from '../bulk';
import { foldName } from '@/lib/contacts/alpha';
import { notify, notifyError } from '@/components/Toast';
import { confirmDialog } from '@/components/confirmBus';
import { fe, fd } from '@/components/Theme';
import { useRememberedFlag } from '@/components/useRememberedFlag';

/** Η προτίμηση «δείξε ποσά» ζει στον περιηγητή του λογιστή, όχι στη βάση. */
const MONEY_KEY = 'properwise.accountant.money';

/** Από πόσους πελάτες και πάνω εμφανίζεται η αναζήτηση: ένα κατέβασμα οθόνης. */
const SEARCH_FROM = 8;

/** Το τελευταίο κλεισμένο έτος: εκεί δουλεύει ο λογιστής τον περισσότερο χρόνο. */
const defaultYear = () => new Date().getFullYear() - 1;

export default function AccountantWorkspace() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [year, setYear] = useState(defaultYear);
  const [rows, setRows] = useState<ClientCounts[] | null>(null);
  // «Δεν διαβάστηκε» δεν είναι «δεν υπάρχουν». Δες lib/data/accountant.ts.
  const [readFailed, setReadFailed] = useState(false);
  const [token, setToken] = useState('');
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState('');
  const [asked, setAsked] = useState<Record<string, true>>({});
  // ── ΤΑ ΠΟΣΑ ΕΙΝΑΙ ΕΠΙΛΟΓΗ, ΟΧΙ ΠΡΟΕΠΙΛΟΓΗ ──────────────────────────────
  // Η λίστα υπάρχει για να δει ο λογιστής ΠΟΙΟΝ να κυνηγήσει· μια μόνιμη στήλη
  // αριθμών δίπλα στα κενά τραβά το μάτι από αυτά. Με ογδόντα πελάτες όμως
  // θέλει και να ξεχωρίσει τον μεγάλο από τον μικρό, οπότε τα ποσά ανοίγουν με
  // ένα πάτημα και η επιλογή του θυμάται.
  const [showMoney, setShowMoney] = useRememberedFlag(MONEY_KEY);
  // ΤΑ ΠΟΣΑ ΚΟΥΒΑΛΟΥΝ ΤΗ ΧΡΗΣΗ ΤΟΥΣ. Χωρίς αυτό χρειαζόταν ένα «σβήσε τα» σε
  // effect κάθε φορά που άλλαζε η χρονιά — δηλαδή δεύτερη απόδοση — και υπήρχε
  // στιγμή όπου ο λογιστής διάβαζε τα ποσά του 2024 κάτω από τον τίτλο του 2025.
  const [cash, setCash] = useState<{ year: number; map: Map<string, ClientStatement> } | null>(null);
  const money = cash && cash.year === year ? cash.map : null;
  const [busy, setBusy] = useState<'money' | 'zip' | null>(null);
  // ΜΕ ΟΓΔΟΝΤΑ ΠΕΛΑΤΕΣ, Η ΣΕΙΡΑ ΛΥΝΕΙ ΤΗ ΜΙΑ ΧΡΗΣΗ ΚΑΙ Η ΑΝΑΖΗΤΗΣΗ ΤΗΝ ΑΛΛΗ.
  // «Ποιος δεν κλείνει» το απαντά η σειρά· «θέλω τον Παπαδόπουλο τώρα» το
  // απαντούσε μόνο το Ctrl+F του περιηγητή.
  const [find, setFind] = useState('');
  // Η σημείωση προς τον ιδιοκτήτη, ανά κενό. Ζει όσο η οθόνη: μόλις σταλεί, το
  // κείμενο ανήκει στο αίτημα και το διαβάζει ο ιδιοκτήτης στον πίνακά του.
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [openNote, setOpenNote] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, [supabase]);

  const load = useCallback(async (y: number) => {
    const r = await clients(supabase, y);
    setReadFailed(r.failed);
    if (!r.failed) setRows(r.rows);
  }, [supabase]);

  // ΤΟ ΑΠΟΤΕΛΕΣΜΑ ΓΡΑΦΕΤΑΙ ΜΟΝΟ ΑΝ Η ΟΘΟΝΗ ΤΟ ΠΕΡΙΜΕΝΕΙ ΑΚΟΜΗ. Χωρίς το `alive`,
  // δύο γρήγορες αλλαγές έτους αφήνουν το ΑΡΓΟΤΕΡΟ ερώτημα να απαντήσει πρώτο:
  // ο λογιστής διαλέγει 2025 και βλέπει τους πελάτες του 2024. Και η κλήση
  // φεύγει από το σώμα του effect, όπου ένα σύγχρονο setState προκαλεί
  // αλυσιδωτές αποδόσεις.
  useEffect(() => {
    if (!email) return;
    let alive = true;
    clients(supabase, year).then(r => { if (!alive) return; setReadFailed(r.failed); if (!r.failed) setRows(r.rows); });
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
    const k = `${owner}:${key}`;
    // Η ΣΗΜΕΙΩΣΗ ΤΑΞΙΔΕΥΕΙ ΜΕ ΤΟ ΑΙΤΗΜΑ. Χωρίς αυτήν, το εργαλείο έλεγε στον
    // ιδιοκτήτη «λείπει δαπάνη» και τον λογιστή τον έστελνε στο τηλέφωνο για να
    // πει ποια, από πότε και γιατί τη θέλει τώρα.
    if (await request(supabase, owner, item, notes[k]?.trim() || undefined)) {
      setAsked(a => ({ ...a, [k]: true }));
      setOpenNote(null);
      await load(year);
    } else notifyError('Το αίτημα δεν στάλθηκε');
  };

  /** Παίρνει πίσω αίτημα που στάλθηκε κατά λάθος. */
  const unask = async (id: string) => {
    if (await withdrawRequest(supabase, id)) await load(year);
    else notifyError('Το αίτημα δεν αποσύρθηκε');
  };

  const removeClient = async (ownerId: string, name: string) => {
    if (!await confirmDialog({
      title: `Αφαίρεση του ${name};`,
      message: 'Φεύγει από τη λίστα σου. Δεν σβήνει τίποτα δικό του και μπορεί να ξαναμπεί με τον σύνδεσμό του.',
      confirmLabel: 'Αφαίρεση', tone: 'negative',
    })) return;
    if (await dropClient(supabase, ownerId)) { await load(year); notify('Ο πελάτης αφαιρέθηκε'); }
    else notifyError('Ο πελάτης δεν αφαιρέθηκε');
  };

  // ΟΠΟΙΟΣ ΔΕΝ ΚΛΕΙΝΕΙ, ΠΡΩΤΟΣ. Η λίστα ερχόταν αλφαβητικά και ο λογιστής με
  // ογδόντα πελάτες κατέβαινε ολόκληρη για να βρει τους τρεις που τον
  // εμποδίζουν. Μέσα στην ίδια κατηγορία μένει το αλφαβητικό της βάσης, ώστε η
  // σειρά να μην αλλάζει από φόρτωση σε φόρτωση.
  const ordered = useMemo(() => (rows ?? []).map(c => {
    const gaps = gapsOf(c);
    return { c, gaps, ready: readinessOf(gaps) };
  }).sort((a, b) => (b.ready.blocking - a.ready.blocking) || (b.gaps.length - a.gaps.length)), [rows]);

  // ΤΟ ΦΙΛΤΡΟ ΔΕΝ ΚΑΝΕΙ ΔΙΑΚΡΙΣΗ ΣΕ ΤΟΝΟ ΚΑΙ ΣΕ ΚΕΦΑΛΑΙΟ. Ο λογιστής γράφει
  // «παπαδοπουλος» βιαστικά και το ζητούμενο είναι να τον βρει, όχι να τον
  // διορθώσει. Ψάχνει και στο ΑΦΜ, που είναι ο τρόπος που τον ξέρει το σύστημά του.
  const shown = useMemo(() => {
    const q = foldName(find);
    if (!q) return ordered;
    return ordered.filter(x => foldName(x.c.name).includes(q) || (x.c.afm || '').includes(q));
  }, [ordered, find]);

  const stuck = ordered.filter(x => x.ready.blocking > 0).length;
  const done = ordered.filter(x => x.gaps.length === 0).length;

  const bulk = useCallback((): BulkClient[] =>
    (rows ?? []).map(c => ({ ownerId: c.ownerId, name: c.name, token: c.token })), [rows]);

  const fetchMoney = useCallback(async () => {
    if (money || !rows?.length) return money;
    setBusy('money');
    const map = await loadStatements(supabase, bulk(), year);
    setCash({ year, map });
    setBusy(null);
    return map;
  }, [money, rows, supabase, bulk, year]);

  const toggleMoney = async () => {
    const next = !showMoney;
    setShowMoney(next);
    if (next) await fetchMoney();
  };

  // ΕΝΑ ΒΙΒΛΙΟ ΑΝΑ ΠΕΛΑΤΗ, ΟΛΑ ΣΕ ΕΝΑΝ ΦΑΚΕΛΟ. Ο λογιστής αρχειοθετεί ανά
  // πελάτη: ένα βιβλίο με ογδόντα φύλλα θα έπρεπε να το σπάσει μόνος του.
  const downloadEverything = async () => {
    setBusy('zip');
    const m = (await fetchMoney()) ?? money;
    setBusy('zip');
    const ready = Array.from(m?.values() ?? []);
    const n = await downloadAll(ready, year, new Date().toLocaleDateString('el-GR'));
    setBusy(null);
    setNotice(n === 0
      ? 'Κανένα βιβλίο δεν είναι διαθέσιμο για αυτή τη χρήση.'
      : n === 1 ? 'Κατέβηκε ένα βιβλίο.' : `Κατέβηκαν ${n} βιβλία.`);
  };

  const wrap = portalWrap;
  const label: React.CSSProperties = {
    fontSize: 11, letterSpacing: '0.5px', textTransform: 'uppercase',
    color: 'var(--text-tertiary)', fontFamily: T.font.sans, margin: 0,
  };

  if (email === undefined) return <main style={{ ...wrap, padding: '64px 24px' }} />;

  if (email === null) {
    return (
      <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
        <PortalBar />
        {/* ΤΟ ΙΔΙΟ ΠΕΡΙΓΡΑΜΜΑ ΜΕ ΤΗ ΣΥΝΔΕΔΕΜΕΝΗ ΟΘΟΝΗ. Ο τίτλος ήταν γραμμένος με
            το χέρι, με άλλο μέγεθος και χωρίς την υπερκείμενη γραμμή: ο ίδιος
            άνθρωπος, δύο δευτερόλεπτα απόσταση, δύο σχέδια. */}
        <main style={wrap}>
          <PortalTitle
            over="Χωρίς λογαριασμό"
            title="Όλοι οι πελάτες σου σε μία λίστα"
            meta="Με λογαριασμό βλέπεις μαζί κάθε ιδιοκτήτη που σε εξουσιοδότησε και τι λείπει από τον καθένα, χωρίς να κρατάς έναν σύνδεσμο ανά πελάτη."
          />
          <Btn variant="primary" onClick={() => { window.location.href = '/login?next=/accountant/workspace'; }}>Σύνδεση</Btn>
        </main>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh', paddingBottom: 72 }}>
      <PortalBar year={year} onYear={setYear} />
      <main style={wrap}>
        {/* Η ΣΥΝΟΨΗ ΛΕΕΙ ΤΙ ΑΞΙΖΕΙ ΝΑ ΚΟΙΤΑΞΕΙΣ ΠΡΩΤΑ. Ο τίτλος έλεγε μόνο πόσοι
            είναι: με ογδόντα πελάτες, ο αριθμός «80» δεν οδηγεί σε καμία κίνηση,
            ενώ το «3 δεν κλείνουν» οδηγεί κατευθείαν στις τρεις πρώτες κάρτες. */}
        <PortalTitle over={`${rows?.length ?? 0} ${(rows?.length ?? 0) === 1 ? 'πελάτης' : 'πελάτες'}`}
          title="Οι πελάτες σου"
          meta={
            <>
              Χρήση 01/01/{year} έως 31/12/{year}
              {ordered.length > 0 && (
                <> · <strong style={{ color: stuck > 0 ? 'var(--text-primary)' : 'inherit' }}>
                  {stuck === 0 ? 'κανένας δεν μπλοκάρει' : stuck === 1 ? '1 δεν κλείνει' : `${stuck} δεν κλείνουν`}
                </strong> · {done === 1 ? '1 έτοιμος' : `${done} έτοιμοι`}</>
              )}
            </>
          }
          right={ordered.length > 0 ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn variant="ghost" onClick={() => void toggleMoney()} disabled={busy === 'money'}>
                {busy === 'money' ? 'Φόρτωση…' : showMoney ? 'Κρύψε ποσά' : 'Δείξε ποσά'}
              </Btn>
              <Btn variant="secondary" onClick={() => void downloadEverything()} disabled={busy !== null}>
                {busy === 'zip' ? 'Ετοιμάζεται…' : 'Κατέβασε τα όλα'}
              </Btn>
            </div>
          ) : undefined} />

      {/* Η ΠΡΟΣΘΗΚΗ ΚΑΘΕΤΑΙ ΠΑΝΩ, ΓΙΑΤΙ ΕΙΝΑΙ Η ΠΡΩΤΗ ΚΙΝΗΣΗ ΠΟΥ ΚΑΝΕΙΣ ΕΔΩ.
          Όταν η λίστα γεμίσει, παύει να είναι η πρώτη — αλλά ούτε ενοχλεί, γιατί
          είναι μία γραμμή. */}
      {/* ΟΣΑ ΔΕΝ ΠΑΤΙΟΥΝΤΑΙ, ΔΕΝ ΤΥΠΩΝΟΝΤΑΙ. Ο λογιστής τυπώνει τη λίστα για να
          την πάρει μαζί του: η προσθήκη πελάτη, η αναζήτηση και τα κουμπιά είναι
          χειριστήρια, όχι πληροφορία. */}
      <Card style={{ marginTop: 22 }} className="po-noprint">
        <p style={label}>Νέος πελάτης</p>
        {/* ΤΟ ΠΕΔΙΟ ΚΑΙ ΤΟ ΚΟΥΜΠΙ ΕΙΝΑΙ ΤΑ ΚΟΙΝΑ ΤΗΣ ΕΦΑΡΜΟΓΗΣ. Ηταν ζωγραφισμένα
            εδώ, με δικό τους ύψος, δικό τους περίγραμμα και δική τους
            απενεργοποίηση: η μία οθόνη που βλέπει ο λογιστής πρώτη έμοιαζε με
            άλλο προϊόν από τις υπόλοιπες. */}
        <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 340px' }}>
            <TextInput
              ariaLabel="Σύνδεσμος που σου έστειλε ο ιδιοκτήτης"
              value={token}
              onChange={v => { setToken(v); setNotice(''); }}
              onKeyDown={e => { if (e.key === 'Enter') void addClient(); }}
              placeholder="Επικόλλησε τον σύνδεσμο που σου έστειλε ο ιδιοκτήτης"
            />
          </div>
          <Btn variant="primary" onClick={() => void addClient()} disabled={adding || !token.trim()}>
            {adding ? 'Προσθήκη…' : 'Πρόσθεσε'}
          </Btn>
        </div>
        {notice && (
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '10px 0 0', fontFamily: T.font.sans }}>{notice}</p>
        )}
      </Card>

      {/* Η ΑΝΑΖΗΤΗΣΗ ΕΜΦΑΝΙΖΕΤΑΙ ΟΤΑΝ ΑΡΧΙΖΕΙ ΝΑ ΕΧΕΙ ΝΟΗΜΑ. Πάνω από ένα
          κατέβασμα οθόνης, το μάτι δεν σαρώνει πια: ψάχνει. Κάτω από αυτό,
          ένα πεδίο αναζήτησης πάνω από τρεις κάρτες είναι θόρυβος. */}
      {(rows?.length ?? 0) >= SEARCH_FROM && (
        <div style={{ marginTop: 16 }} className="po-noprint">
          <TextInput
            ariaLabel="Αναζήτηση πελάτη"
            value={find}
            onChange={setFind}
            placeholder="Ονομα ή ΑΦΜ"
          />
          {find.trim() && (
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '8px 0 0', fontFamily: T.font.sans }}>
              {shown.length === 0 ? 'Κανένας πελάτης με αυτό το όνομα ή ΑΦΜ.'
                : shown.length === 1 ? '1 πελάτης' : `${shown.length} πελάτες`}
            </p>
          )}
        </div>
      )}

      {readFailed ? (
        /* Η ΛΙΣΤΑ ΔΕΝ ΔΙΑΒΑΣΤΗΚΕ, ΔΕΝ ΑΔΕΙΑΣΕ. Η οθόνη έλεγε «Κανένας πελάτης»
           και έστελνε τον λογιστή να ζητήσει σύνδεσμο από ιδιοκτήτες που τον
           έχουν ήδη εξουσιοδοτήσει. */
        <Card style={{ marginTop: 16 }}>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.7, fontFamily: T.font.sans }}>
            Η λίστα των πελατών σου δεν διαβάστηκε. Δεν σημαίνει ότι είναι άδεια: δεν πήραμε απάντηση.
          </p>
          <Btn onClick={() => void load(year)}>Δοκιμή ξανά</Btn>
        </Card>
      ) : rows === null ? (
        /* ΤΟ ΛΕΥΚΟ ΔΕΝ ΕΙΝΑΙ ΚΑΤΑΣΤΑΣΗ. Οσο τα δεδομένα έρχονταν, η οθόνη δεν
           έδειχνε τίποτα: ο λογιστής δεν ήξερε αν φορτώνει ή αν δεν έχει
           πελάτες. Τρεις σκιές λένε «έρχονται» χωρίς να υποσχεθούν πόσοι. */
        <div style={{ marginTop: 16, display: 'grid', gap: 10 }} aria-busy="true">
          {[0, 1, 2].map(i => (
            <Card key={i}><Skeleton h={54} /></Card>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card style={{ marginTop: 16 }}>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.7, fontFamily: T.font.sans }}>
            Κανένας πελάτης στη λίστα. Ο ιδιοκτήτης βγάζει τον σύνδεσμο από τη Λογιστική του, στον φάκελο για τον λογιστή και σου τον στέλνει.
          </p>
        </Card>
      ) : (
        <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          {shown.map(({ c, gaps, ready }) => {
            return (
              <Card key={c.ownerId}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    {/* ΤΟ ΟΝΟΜΑ ΑΝΟΙΓΕΙ ΤΟΝ ΠΕΛΑΤΗ. Η λίστα έλεγε ποιος δεν
                        κλείνει και δεν είχε κανέναν δρόμο προς τα ποσά του: ο
                        λογιστής γύριζε στο μήνυμα με τον σύνδεσμο. Δηλαδή στους
                        ογδόντα σελιδοδείκτες που αυτή η οθόνη ήρθε να καταργήσει. */}
                    <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)', fontFamily: T.font.sans }}>
                      {c.token ? (
                        <a href={`/accountant/${c.token}?year=${year}`} style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px solid var(--border-default)' }}>
                          {c.name}
                        </a>
                      ) : c.name}
                    </h2>
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '4px 0 0', fontFamily: T.font.sans }}>
                      {c.properties === 1 ? '1 ακίνητο' : `${c.properties} ακίνητα`}
                      {c.afm ? ` · ΑΦΜ ${c.afm}` : ''}
                      {!c.token ? ' · ο σύνδεσμός του δεν ισχύει πια' : ''}
                    </p>
                    {/* ΠΟΤΕ ΚΙΝΗΘΗΚΕ ΤΕΛΕΥΤΑΙΑ ΦΟΡΑ. Δύο πελάτες με τα ίδια κενά
                        είναι εντελώς διαφορετική δουλειά όταν ο ένας καταχώρησε
                        χθες και ο άλλος τον Μάρτιο. */}
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '3px 0 0', fontFamily: T.font.sans }}>
                      {lastMove(c.lastActivity)}
                    </p>
                    {/* ΤΟ ΜΗΔΕΝ ΔΕΝ ΓΡΑΦΕΤΑΙ ΩΣ ΠΟΣΟ. Πελάτης χωρίς καμία
                        καταχώρηση δεν έχει έσοδα «0,00 €»: δεν έχει μέτρηση. Και
                        όποιος δεν απάντησε λείπει, δεν μηδενίζεται. */}
                    {showMoney && money && (
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 0', fontFamily: T.font.mono }}>
                        {(() => {
                          const m = money.get(c.ownerId);
                          if (!m) return <span style={{ fontFamily: T.font.sans, color: 'var(--text-tertiary)' }}>Τα ποσά δεν διαβάστηκαν</span>;
                          if (!m.hasEntries) return <span style={{ fontFamily: T.font.sans, color: 'var(--text-tertiary)' }}>Καμία καταχώρηση στη χρήση</span>;
                          return `${fe(m.income)} έσοδα · ${fe(m.expenses)} δαπάνες`;
                        })()}
                      </p>
                    )}
                  </div>
                  {/* Η ΚΑΤΑΣΤΑΣΗ ΕΙΝΑΙ ΛΕΞΗ, ΟΧΙ ΧΡΩΜΑ. Η ιεραρχία βγαίνει από
                      το βάρος και τη θέση: όποιος δεν κλείνει, το λέει δυνατά. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{
                      fontSize: 13, margin: 0, fontFamily: T.font.sans,
                      fontWeight: ready.blocking > 0 ? 700 : 500,
                      color: ready.blocking > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    }}>{ready.label}</p>
                    {/* Η ΑΦΑΙΡΕΣΗ ΔΕΝ ΕΙΝΑΙ ΑΝΑΚΛΗΣΗ. Η ανάκληση ανήκει στον
                        ιδιοκτήτη και μένει δική του· εδώ ο λογιστής απλώς
                        τακτοποιεί τη ΔΙΚΗ ΤΟΥ λίστα. Οσο δεν υπήρχε, ο πελάτης
                        που έφυγε μετρούσε για πάντα στο «δεν κλείνουν». */}
                    {/* ΛΕΞΗ ΚΑΙ ΟΧΙ ΕΙΚΟΝΙΔΙΟ. Ενα «Χ» δίπλα σε πελάτη διαβάζεται
                        και ως «κόψε του την πρόσβαση»: δύο πολύ διαφορετικά
                        πράγματα με το ίδιο σχήμα. */}
                    <span className="po-noprint">
                      <Btn variant="ghost" onClick={() => void removeClient(c.ownerId, c.name)}>Αφαίρεση</Btn>
                    </span>
                  </div>
                </div>

                {gaps.length > 0 && (
                  <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', display: 'grid', gap: 1 }}>
                    {gaps.map(g => {
                      const k = `${c.ownerId}:${g.key}`;
                      const sent = asked[k] || c.requests.some(r => r.item === g.item);
                      const writing = openNote === k;
                      return (
                        <li key={g.key} style={{ padding: '9px 0', borderTop: '1px solid var(--border-subtle)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                            <span style={{
                              fontSize: 13, fontFamily: T.font.sans, lineHeight: 1.5,
                              color: g.blocking ? 'var(--text-primary)' : 'var(--text-secondary)',
                              fontWeight: g.blocking ? 600 : 400,
                            }}>{g.item}</span>
                            <button
                              type="button"
                              onClick={() => (writing ? void ask(c.ownerId, g.key, g.item) : setOpenNote(k))}
                              disabled={sent}
                              className="po-noprint"
                              // ΣΑΡΑΝΤΑ ΤΕΣΣΕΡΑ, ΟΧΙ ΤΡΙΑΝΤΑ. Ηταν 30 εικονοστοιχεία ψηλό,
                              // δηλαδή κάτω από το δάπεδο αφής, σε κουμπί που ο λογιστής
                              // πατά μία φορά ανά εκκρεμότητα ανά πελάτη.
                              style={{
                                flexShrink: 0, minHeight: 44, padding: '0 14px', borderRadius: T.radius.btn,
                                border: '1px solid var(--border-subtle)', background: 'transparent',
                                color: sent ? 'var(--text-tertiary)' : 'var(--text-primary)',
                                fontSize: 12, fontWeight: 600, fontFamily: T.font.sans,
                                cursor: sent ? 'default' : 'pointer',
                              }}
                            >{sent ? 'Ζητήθηκε' : writing ? 'Στείλ᾽ το' : 'Ζήτησέ το'}</button>
                          </div>
                          {/* Η ΣΗΜΕΙΩΣΗ ΕΙΝΑΙ ΤΟ ΠΡΑΓΜΑΤΙΚΟ ΜΗΝΥΜΑ. Το εργαλείο
                              έλεγε στον ιδιοκτήτη «λείπει δαπάνη» και τον λογιστή
                              τον έστελνε στο τηλέφωνο για να πει ποια, από πότε
                              και γιατί τη θέλει τώρα. Ανοίγει με το πρώτο πάτημα,
                              στέλνει με το δεύτερο: όποιος δεν έχει να πει κάτι,
                              πατά δύο φορές και δεν έγραψε τίποτα. */}
                          {writing && !sent && (
                            <div style={{ marginTop: 8 }}>
                              <TextInput
                                ariaLabel={`Σημείωση προς τον ιδιοκτήτη για «${g.item}»`}
                                value={notes[k] || ''}
                                onChange={v => setNotes(n => ({ ...n, [k]: v }))}
                                onKeyDown={e => { if (e.key === 'Enter') void ask(c.ownerId, g.key, g.item); }}
                                placeholder="Σημείωση προς τον ιδιοκτήτη, προαιρετικά"
                              />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* ΤΑ ΑΙΤΗΜΑΤΑ ΟΛΟΚΛΗΡΑ, ΟΧΙ ΣΕ ΠΛΗΘΟΣ. Εγραφε «2 αιτήματα σε
                    εκκρεμότητα»: έναν αριθμό χωρίς περιεχόμενο, χωρίς ημερομηνία
                    και χωρίς τρόπο να παρθεί πίσω λάθος αίτημα. */}
                {c.requests.length > 0 && (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                    <p style={label}>Σε εκκρεμότητα</p>
                    <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 1 }}>
                      {c.requests.map(r => (
                        <li key={r.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '6px 0',
                        }}>
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
                            {r.item}
                            <span style={{ color: 'var(--text-tertiary)' }}>{` · στάλθηκε ${fd(r.createdAt)}`}</span>
                            {r.note ? <span style={{ display: 'block', color: 'var(--text-tertiary)' }}>{`«${r.note}»`}</span> : null}
                          </span>
                          <span className="po-noprint" style={{ flexShrink: 0 }}>
                            <Btn variant="ghost" onClick={() => void unask(r.id)}>Πάρ᾽ το πίσω</Btn>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '26px 0 0', lineHeight: 1.7, fontFamily: T.font.sans }}>
          Βλέπεις μόνο όσους σε εξουσιοδότησαν και μόνο όσο κρατά ο σύνδεσμός τους. Ο ιδιοκτήτης μπορεί να τον ανακαλέσει οποτεδήποτε.
        </p>
      </main>
    </div>
  );
}
