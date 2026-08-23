// ═══════════════════════════════════════════════════════════════════════════
// ΕΝΑ ΧΑΡΤΟΦΥΛΑΚΙΟ ΠΟΥ ΔΕΝ ΥΠΑΡΧΕΙ, ΣΕ ΜΕΓΕΘΟΣ ΠΟΥ ΘΑ ΥΠΑΡΞΕΙ
// ─────────────────────────────────────────────────────────────────────────
// Η μεγαλύτερη δοκιμή μέχρι σήμερα είχε λίγα ακίνητα, όσα χωρούσαν σε ένα
// σενάριο γραμμένο με το χέρι. Ο επαγγελματίας πελάτης, όμως, είναι ακριβώς
// αυτός που φέρνει διακόσια — και είναι ο μόνος που πληρώνει το ακριβό πακέτο.
//
// ΤΑ ΝΟΥΜΕΡΑ ΕΙΝΑΙ ΑΝΑΛΟΓΑ, ΟΧΙ ΣΤΡΟΓΓΥΛΑ. Ενα χαρτοφυλάκιο 200 ακινήτων δεν
// έχει 200 γραμμές: έχει 2.400 δόσεις ενοικίου τον χρόνο, χιλιάδες διαμονές,
// χιλιάδες λογαριασμούς. Αν ο πάγκος έδινε 200 γραμμές σε κάθε πίνακα, θα
// μετρούσε κάτι που δεν συμβαίνει ποτέ.
//
// ΚΑΜΙΑ ΤΥΧΑΙΟΤΗΤΑ. Οι τιμές παράγονται από τον δείκτη, ώστε δύο εκτελέσεις να
// δίνουν ΤΑ ΙΔΙΑ δεδομένα. Ενας πάγκος που αλλάζει είσοδο σε κάθε τρέξιμο δεν
// μετράει τον κώδικα· μετράει τον θόρυβο.
// ═══════════════════════════════════════════════════════════════════════════

/** Το έτος του σεναρίου. Σταθερό, ώστε ο πάγκος να μη γερνά με το ρολόι. */
export const YEAR = 2026;

const TYPES = ['apartment', 'maisonette', 'studio', 'shop', 'office'];
const STATUSES = ['rented', 'vacant', 'renovation', 'own_use'];

export interface Bench {
  properties: Array<{ id: string; name: string; prop_type: string; address: string; target_rent: number; value: number }>;
  rows: Record<string, unknown[]>;
}

/**
 * Χτίζει χαρτοφυλάκιο `n` ακινήτων με ό,τι κρέμεται από αυτά.
 *
 * Η αναλογία βραχυχρόνιας προς μακροχρόνια είναι 1 προς 3, όπως στην αγορά:
 * η βραχυχρόνια παράγει τις περισσότερες γραμμές ανά ακίνητο, οπότε ένα
 * χαρτοφυλάκιο αποκλειστικά βραχυχρόνιας θα φούσκωνε τεχνητά τον πάγκο.
 */
export function portfolio(n: number): Bench {
  const properties = [];
  const stays: unknown[] = [];
  const bills: unknown[] = [];
  const expenses: unknown[] = [];
  const tenants: unknown[] = [];
  const checklist: unknown[] = [];
  const rentPays: unknown[] = [];
  const clients: unknown[] = [];
  const propOwners: unknown[] = [];

  for (let i = 0; i < n; i++) {
    const id = `p${i}`;
    const short = i % 4 === 0;
    const rent = 400 + (i % 17) * 50;
    properties.push({
      id,
      name: `Ακίνητο ${i + 1}`,
      prop_type: TYPES[i % TYPES.length],
      address: `Οδός ${i + 1}, Αθήνα`,
      target_rent: rent,
      value: 90_000 + (i % 23) * 7_500,
    });
    propOwners.push({ id, client_id: i % 5 === 0 ? `c${i % 40}` : null });

    if (short) {
      // Βραχυχρόνια: 18 διαμονές τον χρόνο, μέση διάρκεια 4 νύχτες.
      for (let s = 0; s < 18; s++) {
        const month = (s % 12) + 1;
        const day = ((s * 7) % 25) + 1;
        stays.push({
          id: `${id}-s${s}`, property_id: id, client_id: `c${s % 40}`,
          check_in: `${YEAR}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          check_out: `${YEAR}-${String(month).padStart(2, '0')}-${String(Math.min(day + 4, 28)).padStart(2, '0')}`,
          total: 220 + (s % 9) * 35, guests: 2 + (s % 3), status: 'confirmed',
          gross_amount: 240 + (s % 9) * 38, payout_amount: 220 + (s % 9) * 35, platform: s % 2 ? 'airbnb' : 'booking',
        });
      }
    } else {
      // Μακροχρόνια: ένας μισθωτής και δώδεκα δόσεις.
      tenants.push({
        id: `t${i}`, property_id: id, full_name: `Μισθωτής ${i + 1}`,
        monthly_rent: rent, active: true, e_payment: i % 3 !== 0, updated_at: `${YEAR}-01-0${(i % 9) + 1}`,
      });
      for (let m = 1; m <= 12; m++) {
        rentPays.push({
          id: `r${i}-${m}`, property_id: id, tenant_id: `t${i}`, amount: rent,
          paid: m <= 8, period_year: YEAR, period_month: m,
          due_date: `${YEAR}-${String(m).padStart(2, '0')}-05`,
        });
      }
    }

    // Λογαριασμοί: ρεύμα ανά δίμηνο και νερό ανά τρίμηνο.
    for (let b = 0; b < 10; b++) {
      bills.push({
        id: `${id}-b${b}`, property_id: id, user_id: 'u1',
        category: b % 2 ? 'electricity' : 'water', amount: 45 + (b % 7) * 12,
        issue_date: `${YEAR}-${String((b % 12) + 1).padStart(2, '0')}-14`,
        due_date: `${YEAR}-${String((b % 12) + 1).padStart(2, '0')}-28`, paid: b < 8,
      });
    }

    // Δαπάνες της χρήσης.
    for (let e = 0; e < 8; e++) {
      expenses.push({
        id: `${id}-e${e}`, property_id: id, user_id: 'u1',
        amount: 60 + (e % 11) * 24, category: e % 3 ? 'maintenance' : 'insurance',
        expense_date: `${YEAR}-${String((e % 12) + 1).padStart(2, '0')}-09`, deductible: true,
      });
    }

    // Εκκρεμότητες: μία στα τρία ακίνητα έχει ανοιχτή.
    if (i % 3 === 0) {
      checklist.push({
        id: `${id}-k`, property_id: id, title: `Εργασία ${i}`, done: false,
        due_date: `${YEAR}-${String((i % 12) + 1).padStart(2, '0')}-20`, priority: 'normal',
      });
    }
  }

  for (let c = 0; c < 40; c++) clients.push({ id: `c${c}`, full_name: `Πελάτης ${c + 1}` });

  return {
    properties,
    rows: {
      client_stays: stays,
      bills,
      expenses,
      tenants,
      checklist_items: checklist,
      rent_payments: rentPays,
      clients,
      properties: propOwners,
    },
  };
}
