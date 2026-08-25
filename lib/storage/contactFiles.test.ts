// npx tsx lib/storage/contactFiles.test.ts
//
// ΤΑ ΣΥΜΒΟΛΑΙΑ ΤΩΝ ΕΠΑΦΩΝ ΕΦΥΓΑΝ ΑΠΟ ΤΟΝ ΔΗΜΟΣΙΟ ΚΑΔΟ
// ─────────────────────────────────────────────────────────────────────────
// Το κουμπί λέει «συμβόλαια, τιμολόγια ή φωτογραφίες» και δέχεται pdf και xlsx.
// Ολα έπεφταν στον κάδο «avatars», δηλωμένο ΔΗΜΟΣΙΟ· αποθηκευόταν μάλιστα η
// δημόσια διεύθυνσή τους: το μισθωτήριο του υδραυλικού κατέβαινε από οποιονδήποτε ήξερε
// τη διεύθυνση. Και το «Χ» αφαιρούσε μόνο τη γραμμή, αφήνοντας το αντικείμενο
// στον κάδο για πάντα, χωρίς ο χρήστης να έχει πια τρόπο να το βρει.
//
// Εδώ κλειδώνεται η μετάφραση «αρχείο → αντικείμενο προς σβήσιμο», που είναι
// ολόκληρη η διόρθωση: όσο δεν έβγαινε κάδος και μονοπάτι, δεν υπήρχε τι να
// σβηστεί.
import { objectOf, removeFiles, CONTACT_BUCKET, type ContactFile } from './contactFiles';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n); } };

const F = (p: Partial<ContactFile>): ContactFile =>
  ({ name: 'x.pdf', url: '', size: '1 KB', uploaded: '2026-01-01', ...p });

// ── ΤΟ ΝΕΟ ΑΡΧΕΙΟ ΚΡΑΤΑ ΜΟΝΟΠΑΤΙ ─────────────────────────────────────────
{
  const o = objectOf(F({ path: 'uid-1/contact-files/7/1712.pdf' }));
  ok('νέο αρχείο: ιδιωτικός κάδος', o?.bucket === CONTACT_BUCKET);
  ok('και το μονοπάτι όπως γράφτηκε', o?.path === 'uid-1/contact-files/7/1712.pdf');
}

// ── ΤΟ ΠΑΛΙΟ ΚΡΑΤΑ ΔΗΜΟΣΙΑ ΔΙΕΥΘΥΝΣΗ, ΚΑΙ ΔΙΑΒΑΖΕΤΑΙ ─────────────────────
// Χωρίς αυτό, όσα ανέβηκαν ώς σήμερα θα έμεναν άσβηστα για πάντα.
{
  const o = objectOf(F({ url: 'https://abc.supabase.co/storage/v1/object/public/avatars/uid-1/contact-files/7/1712.pdf' }));
  ok('παλιό αρχείο: ο κάδος βγαίνει από τη διεύθυνση', o?.bucket === 'avatars');
  ok('και το μονοπάτι μαζί', o?.path === 'uid-1/contact-files/7/1712.pdf');
}

// Ελληνικά ονόματα ταξιδεύουν κωδικοποιημένα μέσα στη διεύθυνση.
{
  const o = objectOf(F({ url: 'https://abc.supabase.co/storage/v1/object/public/avatars/uid-1/%CE%9C%CE%B9%CF%83%CE%B8%CF%89%CF%84%CE%AE%CF%81%CE%B9%CE%BF.pdf' }));
  ok('το ελληνικό όνομα αποκωδικοποιείται', o?.path === 'uid-1/Μισθωτήριο.pdf');
}

// Και μια διεύθυνση με ερώτημα από πίσω δεν κουβαλά το ερώτημα στο μονοπάτι.
{
  const o = objectOf(F({ url: 'https://abc.supabase.co/storage/v1/object/public/avatars/uid-1/a.pdf?t=123' }));
  ok('το ερώτημα δεν μπαίνει στο μονοπάτι', o?.path === 'uid-1/a.pdf');
}

// ── Ο,ΤΙ ΔΕΝ ΒΓΑΖΕΙ ΑΝΤΙΚΕΙΜΕΝΟ ΔΕΝ ΠΡΟΣΠΟΙΕΙΤΑΙ ────────────────────────
{
  ok('άσχετη διεύθυνση', objectOf(F({ url: 'https://example.com/a.pdf' })) === null);
  ok('τίποτα', objectOf(F({})) === null);
}

async function main() {
  // ── ΚΑΙ ΤΟ ΣΒΗΣΙΜΟ ΦΤΑΝΕΙ ΚΑΙ ΣΤΟΥΣ ΔΥΟ ΚΑΔΟΥΣ ──────────────────────────
  {
    const seen: { bucket: string; paths: string[] }[] = [];
    const fake = {
      storage: {
        from(bucket: string) {
          return { remove: async (paths: string[]) => { seen.push({ bucket, paths }); return { error: null }; } };
        },
      },
    } as never;
    const failed = await removeFiles(fake, [
      F({ path: 'uid-1/new-1.pdf' }),
      F({ path: 'uid-1/new-2.pdf' }),
      F({ url: 'https://abc.supabase.co/storage/v1/object/public/avatars/uid-1/old.pdf' }),
      F({ url: 'χωρίς αντικείμενο' }),
    ]);
    ok('κανένα σφάλμα', failed === '');
    ok('δύο κάδοι, μία κλήση ο καθένας', seen.length === 2);
    const priv = seen.find(s => s.bucket === CONTACT_BUCKET);
    ok('τα δύο νέα μαζί', priv?.paths.length === 2);
    ok('και το παλιό στον δημόσιο', seen.find(s => s.bucket === 'avatars')?.paths[0] === 'uid-1/old.pdf');
  }

  // Το σφάλμα της αποθήκευσης ΔΕΝ καταπίνεται: ο καλών πρέπει να το πει.
  {
    const fake = {
      storage: { from: () => ({ remove: async () => ({ error: { message: 'δεν επιτρέπεται' } }) }) },
    } as never;
    const failed = await removeFiles(fake, [F({ path: 'uid-1/a.pdf' })]);
    ok('η αποτυχία επιστρέφεται με λόγια', failed.includes('δεν επιτρέπεται'));
  }
}

await1: {
  break await1;
}
main().then(() => {
  console.log(`contactFiles — ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
  console.log('✓ όλα πέρασαν');
}).catch(e => { console.error(e); process.exit(1); });
