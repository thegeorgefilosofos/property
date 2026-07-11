// Καθαρή λογική για το «auto-mark-paid» του ενοικίου: υπολογισμός της εμφάνισης
// (occurrence) της μηνιαίας υπενθύμισης rent_due και συγχώνευση/αφαίρεση από τα
// recurrence_exdates. Χωρίς I/O → δοκιμάζεται ντετερμινιστικά· ο wrapper στο
// TabTenantHelpers κάνει μόνο fetch/update.

// Η ημέρα της εμφάνισης ταυτίζεται με τη μέρα της βάσης (μηνιαία επανάληψη).
export function rentDueOccurrence(eventDate: string, year: number, month: number): string {
  const day = (eventDate || '').slice(8, 10) || '01'
  return `${year}-${String(month).padStart(2, '0')}-${day}`
}

// Επιστρέφει τα ΝΕΑ exdates αν άλλαξε κάτι, αλλιώς null (no-op).
//  paid=true  → πρόσθεσε το occ (κλείσε την υπενθύμιση εκείνου του μήνα)
//  paid=false → αφαίρεσέ το (ξανα-άνοιξέ τη)
export function applyExdate(current: string[] | null | undefined, occ: string, paid: boolean): string[] | null {
  const cur = Array.isArray(current) ? current.slice() : []
  const has = cur.includes(occ)
  if (paid && !has) { cur.push(occ); return cur }
  if (!paid && has) { cur.splice(cur.indexOf(occ), 1); return cur }
  return null
}
