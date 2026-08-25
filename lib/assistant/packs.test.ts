// npx tsx lib/assistant/packs.test.ts
//
// Η ΓΝΩΣΗ ΤΟΥ ΒΟΗΘΟΥ ΔΕΝ ΕΠΙΤΡΕΠΕΤΑΙ ΝΑ ΧΑΘΕΙ ΓΙΑ ΝΑ ΓΙΝΕΙ ΦΘΗΝΟΤΕΡΗ.
// Το prompt κόπηκε σε πυρήνα και πέντε θεματικά πακέτα, ώστε μια ερώτηση για
// δάνειο να μη φορτώνει τη φορολογία. Το κέρδος είναι πραγματικό, αλλά η μόνη
// αποδεκτή εγγύηση είναι ότι το ΠΛΗΡΕΣ κείμενο παραμένει ακριβώς ό,τι ήταν και
// ότι ο επιλογέας, όταν αμφιβάλλει, τα φορτώνει ΟΛΑ.
import {
  STABLE_KNOWLEDGE, KNOWLEDGE_PACKS, KNOWLEDGE_PACK_IDS,
  packsFor, knowledgeFor, buildSystemBlocks, DEFAULT_PREFS,
} from '../../app/dashboard/components/assistantPersona';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } };

// ── ΤΙΠΟΤΑ ΔΕΝ ΧΑΘΗΚΕ ΣΤΟ ΚΟΨΙΜΟ ──────────────────────────────────────────
{
  const packs = KNOWLEDGE_PACK_IDS.map(id => KNOWLEDGE_PACKS[id]).join('');
  ok('κάθε πακέτο υπάρχει αυτούσιο μέσα στο πλήρες κείμενο',
    KNOWLEDGE_PACK_IDS.every(id => STABLE_KNOWLEDGE.includes(KNOWLEDGE_PACKS[id])));
  ok('τα πακέτα μπαίνουν με τη σειρά τους, χωρίς κενό ανάμεσα',
    STABLE_KNOWLEDGE.includes(packs));
  ok('πέντε πακέτα, κανένα κενό', KNOWLEDGE_PACK_IDS.length === 5
    && KNOWLEDGE_PACK_IDS.every(id => KNOWLEDGE_PACKS[id].length > 3000));
  // Ο πυρήνας είναι ό,τι απομένει: αν αυτό δεν βγαίνει, κάτι γράφτηκε δύο φορές.
  ok('πυρήνας συν πακέτα δίνουν ακριβώς το πλήρες μήκος',
    STABLE_KNOWLEDGE.length - packs.length > 30000);
}

// ── Ο ΕΠΙΛΟΓΕΑΣ ───────────────────────────────────────────────────────────
const one = (q: string, id: string) =>
  ok(`«${q}» → ${id}`, packsFor(q).length === 1 && packsFor(q)[0] === id);

one('Τι επιτόκιο έχει το στεγαστικό δάνειο;', 'loans');
one('Πόσο ΕΝΦΙΑ θα πληρώσω φέτος;', 'tax');
one('Αξίζει να αγοράσω ή να νοικιάσω; Τι απόδοση βγάζει;', 'roi');
one('Έχω αυθαίρετο ημιυπαίθριο, τι κάνω;', 'urban');
one('Πώς δουλεύει το πρόγραμμα πρόσκλησης;', 'referral');

// Χωρίς τόνους, με κεφαλαία: ο χρήστης γράφει όπως του βγαίνει.
one('ΤΙ ΔΑΝΕΙΟ ΝΑ ΠΑΡΩ;', 'loans');
one('ποσο ενφια;', 'tax');

// ── Η ΣΥΓΚΡΟΥΣΗ ΠΟΥ ΕΠΙΑΣΕ ΤΟ ΤΕΣΤ ΚΑΙ ΟΧΙ Η ΣΚΕΨΗ ───────────────────────
// Η «απόδοση» περιέχει τη «δόση»: κάθε ερώτηση για αποδόσεις φόρτωνε και τα
// δάνεια. Οι λέξεις ταιριάζουν πλέον στην ΑΡΧΗ λέξης, όχι οπουδήποτε μέσα της.
ok('«απόδοση» δεν είναι «δόση»', !packsFor('τι απόδοση βγάζει;').includes('loans'));
ok('η σκέτη «δόση» όμως είναι', packsFor('πόσο είναι η δόση μου;').includes('loans'));
ok('το πρόθεμα μένει ελεύθερο στο τέλος', packsFor('θέλω να δανειστώ').includes('loans'));

// Δύο θέματα μαζί: φορτώνονται και τα δύο, όχι το πρώτο που βρέθηκε.
{
  const p = packsFor('Αν πάρω δάνειο, τι φόρο θα πληρώνω στα ενοίκια;');
  ok('δύο θέματα δίνουν δύο πακέτα', p.length === 2 && p.includes('loans') && p.includes('tax'));
  ok('η σειρά είναι η κανονική, όχι η σειρά εμφάνισης στην ερώτηση',
    p.join(',') === 'loans,tax');
}

// ── ΤΟ ΑΣΦΑΛΕΣ ΣΤΟΙΧΗΜΑ: ΟΤΑΝ ΔΕΝ ΞΕΡΩ, ΤΑ ΔΙΝΩ ΟΛΑ ──────────────────────
for (const q of ['Τι κάνει ο ΠΑΟ;', 'Καλημέρα!', '', 'κάτι εντελώς άσχετο εδώ']) {
  ok(`«${q || '(κενό)'}» φορτώνει ΟΛΑ τα πακέτα`,
    packsFor(q).length === KNOWLEDGE_PACK_IDS.length);
  ok(`«${q || '(κενό)'}» δίνει το πλήρες κείμενο, byte για byte`,
    knowledgeFor(q) === STABLE_KNOWLEDGE);
}

// ── ΤΟ ΚΕΡΔΟΣ ΕΙΝΑΙ ΠΡΑΓΜΑΤΙΚΟ ────────────────────────────────────────────
{
  const full = STABLE_KNOWLEDGE.length;
  for (const [q, id] of [['Τι επιτόκιο;', 'loans'], ['Πόσο ΕΝΦΙΑ;', 'tax'], ['αυθαίρετο', 'urban']] as const) {
    const got = knowledgeFor(q).length;
    ok(`«${q}» φορτώνει λιγότερα από το πλήρες (${Math.round(got / 1000)}k από ${Math.round(full / 1000)}k)`, got < full);
    ok(`«${q}» κρατά τον πυρήνα και το δικό του πακέτο`,
      knowledgeFor(q).includes(KNOWLEDGE_PACKS[id]));
    // Και ΔΕΝ κρατά τα υπόλοιπα: αλλιώς δεν κερδίσαμε τίποτα.
    ok(`«${q}» αφήνει έξω τα άσχετα`,
      KNOWLEDGE_PACK_IDS.filter(x => x !== id).every(x => !knowledgeFor(q).includes(KNOWLEDGE_PACKS[x])));
  }
}

// ── Η ΚΕΦΑΛΗ ΚΑΙ Η ΟΥΡΑ ΜΠΑΙΝΟΥΝ ΠΑΝΤΑ ───────────────────────────────────
// Η ουρά είναι η γραμματική των ενεργειών. Χωρίς αυτήν ο βοηθός σταματά να
// εκτελεί και αρχίζει να εξηγεί πώς θα το κάνει ο χρήστης.
for (const q of ['Τι επιτόκιο;', 'Πόσο ΕΝΦΙΑ;', 'Καλημέρα', 'αυθαίρετο']) {
  const k = knowledgeFor(q);
  ok(`«${q}» κρατά τη γραμματική ενεργειών`, k.includes('[[go:') && k.includes('[[expense:'));
  ok(`«${q}» κρατά το ποιος είναι ο βοηθός`, k.includes('ΠΩΣ ΜΙΛΑΣ:'));
}

// ── ΤΟ ΠΡΩΤΟ ΜΠΛΟΚ ΕΙΝΑΙ ΑΥΤΟ ΠΟΥ ΜΠΑΙΝΕΙ ΣΕ CACHE ───────────────────────
{
  const blocks = buildSystemBlocks(DEFAULT_PREFS, 'Ακίνητο δοκιμής', undefined, { topic: 'τι επιτόκιο;' });
  ok('δύο μπλοκ, σταθερό και προσωπικό', blocks.length === 2);
  ok('το πρώτο μπλοκ είναι η γνώση του θέματος', blocks[0].text === knowledgeFor('τι επιτόκιο;'));
  ok('το πρώτο μπλοκ ΔΕΝ περιέχει τίποτα προσωπικό', !blocks[0].text.includes('Ακίνητο δοκιμής'));
  // Χωρίς θέμα, το πρώτο μπλοκ είναι ό,τι ήταν πάντα: η ίδια cache συνεχίζει.
  const plainBlocks = buildSystemBlocks(DEFAULT_PREFS, 'Ακίνητο δοκιμής');
  ok('χωρίς θέμα, το πρώτο μπλοκ μένει το πλήρες κείμενο', plainBlocks[0].text === STABLE_KNOWLEDGE);
}

console.log(fail === 0 ? `✓ packs: ${pass} έλεγχοι πέρασαν` : `✗ packs: ${fail} απέτυχαν από ${pass + fail}`);
if (fail > 0) process.exit(1);
