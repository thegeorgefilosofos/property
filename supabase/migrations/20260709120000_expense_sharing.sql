-- ═══════════════════════════════════════════════════════════════════════════
-- Διαμοιρασμός δαπανών (expense sharing)
-- Επιτρέπει τον διαμοιρασμό μιας δαπάνης μεταξύ ιδιοκτήτη και άλλου προσώπου
-- (συνιδιοκτήτης, οικογένεια, γονείς, 50/50). Το πεδίο «paid_by» υπάρχει ήδη
-- και κρατά την ιδιότητα· εδώ προσθέτουμε το ποσοστό του ιδιοκτήτη και μια
-- προαιρετική σημείωση για το πρόσωπο με το οποίο μοιράζεται.
--
-- Το «μερίδιό μου» υπολογίζεται στην εφαρμογή: amount × share_percent / 100.
-- Το συνολικό κόστος του ακινήτου παραμένει το πλήρες ποσό (έντιμη λογιστική).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.expenses add column if not exists share_percent numeric;
alter table public.expenses add column if not exists share_note    text;

-- Το ίδιο μοντέλο διαμοιρασμού και στους Λογαριασμούς (bills). Οι λογαριασμοί
-- δεν είχαν «paid_by»· το προσθέτουμε ώστε ο διαμοιρασμός να είναι ΕΝΑ μοντέλο
-- σε δαπάνες και λογαριασμούς. Όταν ένας λογαριασμός σημειωθεί πληρωμένος,
-- το ποσοστό/σημείωση περνούν στο συνδεδεμένο έξοδο (mirror) μέσω bill_id.
alter table public.bills add column if not exists paid_by       text default 'owner';
alter table public.bills add column if not exists share_percent numeric;
alter table public.bills add column if not exists share_note    text;
