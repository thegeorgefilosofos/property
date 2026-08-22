// npx tsx lib/push/message.test.ts
import { dailyPush, alreadySentToday, HORIZON_DAYS, PUSH_URL } from './message';
import type { FeedItem } from '@/lib/calendar/feed';

let p = 0, f = 0;
const ok = (c: boolean, m: string) => { if (c) p++; else { f++; console.error('✗', m); } };
const eq = (a: unknown, b: unknown, m: string) => ok(a === b, `${m}\n   πήρα:    ${JSON.stringify(a)}\n   περίμενα: ${JSON.stringify(b)}`);

const TODAY = '2026-09-05';
const it = (uid: string, date: string, title: string, note?: string): FeedItem => ({ uid, date, title, note: note ?? null });

// ── Οταν δεν υπάρχει λόγος, δεν στέλνεται τίποτα ───────────────────────────
eq(dailyPush([], TODAY), null, 'ΚΑΜΙΑ ΠΡΟΘΕΣΜΙΑ, ΚΑΜΙΑ ΕΙΔΟΠΟΙΗΣΗ');
eq(dailyPush([it('a', '2026-09-07', 'ΔΕΗ')], TODAY), null, 'μεθαύριο δεν είναι λόγος να χτυπήσει τηλέφωνο');
eq(dailyPush([it('a', '2026-12-01', 'ΕΝΦΙΑ')], TODAY), null, 'ούτε σε τρεις μήνες');
eq(HORIZON_DAYS, 1, 'ο ορίζοντας είναι σήμερα και αύριο');

// ── Ενα θέμα ───────────────────────────────────────────────────────────────
{
  const m = dailyPush([it('a', TODAY, 'ΔΕΗ · Αλεξάνδρας 12', '87,45 €')], TODAY)!;
  eq(m.title, 'ΔΕΗ · Αλεξάνδρας 12', 'ο τίτλος λέει ΤΙ');
  eq(m.body, 'Λήγει σήμερα, 87,45 €', 'το σώμα λέει ΠΟΤΕ και ΠΟΣΟ');
  eq(m.url, PUSH_URL, 'το πάτημα ανοίγει τον πίνακα');
}
eq(dailyPush([it('a', '2026-09-06', 'Ενοίκιο')], TODAY)!.body, 'Λήγει αύριο', 'το αύριο');
eq(dailyPush([it('a', '2026-09-04', 'Ενοίκιο')], TODAY)!.body, 'Η προθεσμία πέρασε χθες', 'το χθες λέγεται σαν γεγονός');
eq(dailyPush([it('a', '2026-09-01', 'Ενοίκιο')], TODAY)!.body, 'Η προθεσμία πέρασε εδώ και 4 ημέρες', 'και οι μέρες μετριούνται');
eq(dailyPush([it('a', TODAY, 'Ενοίκιο')], TODAY)!.body, 'Λήγει σήμερα', 'χωρίς ποσό, καμία κόμμα στον αέρα');

// ── Πολλά θέματα ───────────────────────────────────────────────────────────
{
  const m = dailyPush([
    it('b', '2026-09-06', 'Ενοίκιο', '450,00 €'),
    it('a', TODAY, 'ΔΕΗ', '87,45 €'),
    it('c', '2026-09-02', 'Ασφάλιστρο'),
  ], TODAY)!;
  eq(m.title, '3 προθεσμίες', 'ο τίτλος μετράει');
  eq(m.body, 'Ασφάλιστρο εκπρόθεσμο · ΔΕΗ σήμερα · Ενοίκιο αύριο',
    'ΠΡΩΤΑ ΤΟ ΠΙΟ ΠΙΕΣΤΙΚΟ: ό,τι πέρασε, μετά το σήμερα, μετά το αύριο');
}
{
  const many = ['a', 'b', 'c', 'd', 'e'].map((u, i) => it(u, TODAY, `Θέμα ${i + 1}`));
  const m = dailyPush(many, TODAY)!;
  eq(m.title, '5 προθεσμίες', 'όλα μετριούνται');
  ok(m.body.endsWith('· και άλλες 2'), 'αλλά μόνο τρία ονομάζονται');
  eq((m.body.match(/·/g) || []).length, 3, 'τρία ονόματα και μία ουρά');
}

// ── Σταθερότητα ────────────────────────────────────────────────────────────
{
  const a = dailyPush([it('b', TODAY, 'Β'), it('a', TODAY, 'Α')], TODAY)!;
  const b = dailyPush([it('a', TODAY, 'Α'), it('b', TODAY, 'Β')], TODAY)!;
  eq(a.body, b.body, 'η σειρά εισόδου δεν αλλάζει το μήνυμα');
}
eq(dailyPush([it('a', 'όχι ημερομηνία', 'Χαλασμένο')], TODAY), null, 'γραμμή χωρίς ημερομηνία δεν ξυπνά κανέναν');

// ── Καμία διπλή στίξη ──────────────────────────────────────────────────────
for (const m of [
  dailyPush([it('a', TODAY, 'Ενα', '10,00 €')], TODAY)!,
  dailyPush([it('a', TODAY, 'Ενα'), it('b', TODAY, 'Δύο')], TODAY)!,
]) {
  ok(!/ {2}|,,|··/.test(m.body), `καθαρή στίξη: «${m.body}»`);
  ok(m.title.trim() === m.title && m.body.trim() === m.body, 'χωρίς κενά στις άκρες');
}

// ── Ο,ΤΙ ΔΕΝ ΧΩΡΑΕΙ ΣΤΗΝ ΚΛΕΙΔΩΜΕΝΗ ΟΘΟΝΗ, ΚΟΒΕΤΑΙ ΑΠΟ ΕΜΑΣ ─────────────────
{
  const long = 'Ανανέωση ασφαλιστηρίου συμβολαίου πυρός και σεισμού για το διαμέρισμα';
  const m = dailyPush([it('a', TODAY, long)], TODAY)!;
  ok(m.title.length <= 48, `ο τίτλος κόβεται στους 48: ${m.title.length}`);
  ok(m.title.endsWith('…'), 'και λέει ότι υπάρχει συνέχεια');
  ok(!m.title.includes('  ') && !/\s…$/.test(m.title), 'το κόψιμο δεν αφήνει κενό πριν από τα αποσιωπητικά');
  ok(long.startsWith(m.title.slice(0, -1)), 'ο κομμένος τίτλος είναι αρχή του πραγματικού');
}
{
  // Οκτώ θέματα με μακριά ονόματα: το σώμα δεν γίνεται σεντόνι.
  const many = Array.from({ length: 8 }, (_, i) =>
    it(`u${i}`, TODAY, `Λογαριασμός κοινοχρήστων πολυκατοικίας ${i}`));
  const m = dailyPush(many, TODAY)!;
  ok(m.body.length <= 140, `το σώμα κόβεται στους 140: ${m.body.length}`);
  eq(m.title, '8 προθεσμίες', 'ο τίτλος μετράει σωστά ακόμη κι όταν το σώμα κόβεται');
}
{
  // Οριακό: ακριβώς 48 χαρακτήρες μένουν ανέγγιχτοι.
  const exact = 'α'.repeat(48);
  eq(dailyPush([it('a', TODAY, exact)], TODAY)!.title, exact, 'το ακριβώς 48 δεν κόβεται');
}

// ── ΜΙΑ ΤΗΝ ΗΜΕΡΑ ──────────────────────────────────────────────────────────
{
  // Η μετάφραση στιγμής σε ελληνική ημέρα δίνεται από έξω: το τεστ δεν
  // εξαρτάται από τη ζώνη ώρας του μηχανήματος που το τρέχει.
  const dayOf = (d: Date) => d.toISOString().slice(0, 10);
  ok(!alreadySentToday(null, TODAY, dayOf), 'συσκευή που δεν έχει πάρει ποτέ, παίρνει');
  ok(!alreadySentToday(undefined, TODAY, dayOf), 'ούτε το κενό μπερδεύει');
  ok(alreadySentToday(`${TODAY}T06:00:00Z`, TODAY, dayOf), 'δεύτερη εκτέλεση την ίδια ημέρα δεν ξαναχτυπά');
  ok(!alreadySentToday('2026-09-04T23:59:00Z', TODAY, dayOf), 'χθεσινή αποστολή δεν εμποδίζει τη σημερινή');
  ok(!alreadySentToday('χαλασμένη ώρα', TODAY, dayOf), 'ώρα που δεν διαβάζεται δεν σταματά την ειδοποίηση');
}

console.log(`\npush/message.ts — ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
console.log('όλα πέρασαν');
