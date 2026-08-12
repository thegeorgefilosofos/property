// npx tsx lib/billing/addons.test.ts
//
// ΤΟ ΠΟΣΟ ΠΟΥ ΦΕΥΓΕΙ ΑΠΟ ΤΗΝ ΚΑΡΤΑ ΤΟΥ ΧΡΗΣΤΗ. Εδώ κλειδώνει ότι η τιμή του
// πακέτου δεν αλλάζει ποτέ σιωπηλά, ότι κάθε επιπλέον χρέωση έχει δική της
// γραμμή με μονάδα και πλήθος, και ότι ένα πρόσθετο χωρίς τιμή δεν φτάνει ποτέ
// στην πληρωμή.
import { ADDONS, available, checkoutLines, checkoutTotal, hasExtras } from './addons';
import { PLANS } from './plans';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n); } };

// ── Η ΣΥΝΔΡΟΜΗ ΜΟΝΗ ΤΗΣ ───────────────────────────────────────────────────
{
  const l = checkoutLines({ plan: 'owner' });
  ok('μία γραμμή όταν δεν υπάρχει πρόσθετο', l.length === 1);
  ok('η τιμή είναι ακριβώς η τιμή του πακέτου', l[0].total === PLANS.owner.priceMonthly);
  ok('καμία ανάλυση για μία γραμμή', !hasExtras(l));
  ok('το σύνολο ισούται με τη γραμμή', checkoutTotal(l) === PLANS.owner.priceMonthly);
}
{
  const l = checkoutLines({ plan: 'owner', annual: true });
  ok('ετήσια: η ετήσια τιμή, όχι δωδεκάπλασιο της μηνιαίας', l[0].total === PLANS.owner.priceAnnual);
  ok('και είναι φθηνότερη από δώδεκα μήνες', PLANS.owner.priceAnnual < PLANS.owner.priceMonthly * 12);
}

// ── ΕΠΙΠΛΕΟΝ ΑΚΙΝΗΤΑ ──────────────────────────────────────────────────────
{
  const l = checkoutLines({ plan: 'owner', extraProperties: 3 });
  ok('δεύτερη γραμμή για τα επιπλέον ακίνητα', l.length === 2);
  ok('πλήθος τρία', l[1].qty === 3);
  ok('τιμή μονάδας η τιμή του πακέτου', l[1].unitPrice === PLANS.owner.extraPropertyPrice);
  ok('σύνολο γραμμής = τιμή επί πλήθος', l[1].total === PLANS.owner.extraPropertyPrice * 3);
  ok('το γενικό σύνολο αθροίζει',
     checkoutTotal(l) === PLANS.owner.priceMonthly + PLANS.owner.extraPropertyPrice * 3);
  ok('η γραμμή εξηγείται', (l[1].note || '').length > 10);

  const y = checkoutLines({ plan: 'owner', annual: true, extraProperties: 2 });
  ok('στην ετήσια, το επιπλέον ακίνητο επί δώδεκα',
     y[1].unitPrice === PLANS.owner.extraPropertyPrice * 12);
}
{
  const l = checkoutLines({ plan: 'solo', extraProperties: 4 });
  ok('πακέτο χωρίς επιπλέον ακίνητα δεν χρεώνει γραμμή', l.length === 1);
}
{
  const l = checkoutLines({ plan: 'owner', extraProperties: -2 });
  ok('αρνητικό πλήθος δεν γίνεται ποτέ έκπτωση', l.length === 1);
}

// ── Η ΣΥΝΔΕΣΗ ΜΕ ΤΗΝ ΤΡΑΠΕΖΑ ──────────────────────────────────────────────
{
  const bank = ADDONS.bank_link;
  ok('η μονάδα χρέωσης είναι ο λογαριασμός, όχι ο χρήστης',
     bank.unit.includes('λογαριασμό'));
  ok('η γραμμή του τιμολογίου εξηγείται', bank.invoiceNote.length > 40);

  if (bank.priceMonthly == null) {
    ok('χωρίς τιμή, το πρόσθετο δεν προσφέρεται', !available('bank_link'));
    ok('και δεν φτάνει ποτέ στην πληρωμή',
       checkoutLines({ plan: 'owner', bankAccounts: 3 }).length === 1);
  } else {
    ok('με τιμή, προσφέρεται', available('bank_link'));
    const l = checkoutLines({ plan: 'owner', bankAccounts: 3 });
    ok('δική του γραμμή', l.some(x => x.key === 'bank_link'));
    const line = l.find(x => x.key === 'bank_link')!;
    ok('πλήθος = λογαριασμοί', line.qty === 3);
    ok('σύνολο = τιμή επί λογαριασμούς', line.total === bank.priceMonthly * 3);
    ok('η τιμή του πακέτου μένει ανέγγιχτη',
       l.find(x => x.key === 'plan')!.total === PLANS.owner.priceMonthly);
    ok('η ετήσια δεν εκπτώνει το πρόσθετο',
       checkoutLines({ plan: 'owner', annual: true, bankAccounts: 1 })
         .find(x => x.key === 'bank_link')!.unitPrice === bank.priceMonthly * 12);
  }
}

// ── ΚΑΝΟΝΕΣ ΠΟΥ ΙΣΧΥΟΥΝ ΓΙΑ ΚΑΘΕ ΓΡΑΜΜΗ ──────────────────────────────────
{
  const l = checkoutLines({ plan: 'agency', extraProperties: 7, bankAccounts: 2 });
  ok('η πρώτη γραμμή είναι πάντα η συνδρομή', l[0].key === 'plan');
  ok('κάθε γραμμή έχει θετικό πλήθος', l.every(x => x.qty > 0));
  ok('κάθε ποσό σε ακέραια λεπτά',
     l.every(x => Math.abs(x.total * 100 - Math.round(x.total * 100)) < 1e-9));
  ok('καμία ετικέτα κενή', l.every(x => x.label.trim().length > 0));
  ok('μοναδικά κλειδιά', new Set(l.map(x => x.key)).size === l.length);
}

console.log(`${pass} πέρασαν, ${fail} απέτυχαν`);
if (fail) process.exit(1);
