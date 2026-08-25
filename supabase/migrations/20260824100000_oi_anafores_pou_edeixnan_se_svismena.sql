-- ═══════════════════════════════════════════════════════════════════════════
--  ΔΕΚΑΠΕΝΤΕ ΑΝΑΦΟΡΕΣ ΠΟΥ ΜΠΟΡΟΥΣΑΝ ΝΑ ΔΕΙΧΝΟΥΝ ΣΕ ΣΒΗΣΜΕΝΗ ΓΡΑΜΜΗ
-- ─────────────────────────────────────────────────────────────────────────
--  ΤΙ ΠΡΟΗΓΗΘΗΚΕ. Το 20260814090000 έκλεισε το `property_id`: δεκατέσσερα
--  κλειδιά υπήρχαν, επτά μπήκαν και όπου ο τύπος ήταν `text` μπήκε σκανδάλη.
--  Εκείνο το αρχείο κοίταξε ΜΟΝΟ τη σχέση με το ακίνητο.
--
--  ΤΙ ΕΜΕΙΝΕ. Μετρημένο στον κατάλογο πάνω σε πραγματικό Postgres, με τις 98
--  μεταναστεύσεις εφαρμοσμένες: τριάντα μία στήλες που μοιάζουν με αναφορά
--  δεν έχουν ξένο κλειδί. Οι δεκαπέντε από αυτές είναι `uuid` και δείχνουν σε
--  δικό μας πίνακα με `uuid` κλειδί — δηλαδή το κλειδί ΓΙΝΕΤΑΙ και απλώς
--  λείπει.
--
--  ΟΙ ΥΠΟΛΟΙΠΕΣ ΔΕΚΑΕΞΙ ΜΕΝΟΥΝ, ΚΑΙ Ο ΛΟΓΟΣ ΓΡΑΦΕΤΑΙ ΜΙΑ ΦΟΡΑ ΕΔΩ:
--    · Αναγνωριστικά ΞΕΝΩΝ συστημάτων, που δεν δείχνουν σε δικό μας πίνακα:
--      mor_customer_id, mor_subscription_id, mor_variant_id (έμπορος),
--      resend_id (ταχυδρομείο), institution_id, bank_id, tariff_id,
--      provider_id, program_id, template_id, campaign_id, copy_id.
--    · `activity_log.entity_id`: ΣΚΟΠΙΜΑ χωρίς κλειδί. Η γραμμή ελέγχου
--      πρέπει να ΕΠΙΖΕΙ της διαγραφής του πράγματος που περιγράφει· ένα
--      CASCADE εδώ θα έσβηνε το ίχνος μαζί με το γεγονός.
--    · `account_deletion_incidents.subject_id`: ίδιος λόγος, το περιστατικό
--      καταγράφει λογαριασμό που ΕΠΑΨΕ να υπάρχει.
--    · `inventory_maintenance.item_id`: είναι `text` ενώ το
--      `inventory_items.id` είναι `uuid`. Χρειάζεται αλλαγή τύπου, που δεν
--      γίνεται σιωπηλά μαζί με τα υπόλοιπα.
--
--  ── ΤΙ ΣΠΑΕΙ ΣΗΜΕΡΑ ΧΩΡΙΣ ΑΥΤΑ ───────────────────────────────────────────
--  Σβήνεις έναν μισθωτή. Η απόδειξη είσπραξης μένει με `tenant_id` που δείχνει
--  στο πουθενά: η οθόνη δείχνει είσπραξη χωρίς όνομα και το ημερολόγιο
--  επικοινωνίας κρατά συνομιλίες με άνθρωπο που δεν υπάρχει στη βάση. Σβήνεις
--  συνεργείο από τις Επαφές: η δαπάνη του μένει με `contact_id` ορφανό και ο
--  λογιστής βλέπει δαπάνη χωρίς προμηθευτή.
--
--  ── ΟΙ ΣΥΜΠΕΡΙΦΟΡΕΣ ΔΙΑΛΕΓΟΝΤΑΙ ΜΙΑ ΜΙΑ, ΔΕΝ ΕΙΝΑΙ ΟΛΕΣ CASCADE ──────────
--  SET NULL όπου η γραμμή ΕΧΕΙ ΔΙΚΗ ΤΗΣ ΑΞΙΑ χωρίς τη σχέση: η δαπάνη υπάρχει
--  και χωρίς επαφή, η είσπραξη υπάρχει και χωρίς παραστατικό, η εκκρεμότητα
--  υπάρχει και χωρίς συνδεδεμένο συμβάν. Το ποσό δεν χάνεται επειδή έφυγε ο
--  προμηθευτής.
--  CASCADE μόνο όπου η γραμμή ΔΕΝ ΕΧΕΙ ΝΟΗΜΑ χωρίς τον γονιό της: το ημερολόγιο
--  επικοινωνίας ενός μισθωτή είναι επικοινωνία ΜΕ ΑΥΤΟΝ και η στήλη είναι
--  ήδη NOT NULL.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. ΟΙ ΟΡΦΑΝΕΣ ΓΡΑΜΜΕΣ ΚΑΘΑΡΙΖΟΝΤΑΙ ΠΡΙΝ ΜΠΕΙ ΤΟ ΚΛΕΙΔΙ ───────────────
-- Χωρίς αυτό, το `add constraint` σκάει σε κάθε βάση που έχει ήδη υπόλειμμα —
-- και το υπόλειμμα είναι ακριβώς ο λόγος που γράφεται το αρχείο. Η καθαριότητα
-- είναι SET NULL, όχι διαγραφή: η γραμμή κρατιέται, η ψεύτικη σχέση φεύγει.
do $$
declare r record;
begin
  for r in
    select * from (values
      ('checklist_items',       'assigned_contact_id', 'contacts'),
      ('checklist_items',       'calendar_event_id',   'calendar_events'),
      ('checklist_items',       'expense_id',          'expenses'),
      ('email_recipients',      'client_id',           'clients'),
      ('expenses',              'contact_id',          'contacts'),
      ('guest_checkins',        'client_id',           'clients'),
      ('inventory_maintenance', 'calendar_event_id',   'calendar_events'),
      ('inventory_maintenance', 'expense_id',          'expenses'),
      ('maintenance_requests',  'tenant_id',           'tenants'),
      ('notification_log',      'event_id',            'calendar_events'),
      ('rent_payments',         'receipt_doc_id',      'property_documents'),
      ('rent_payments',         'tenant_id',           'tenants')
    ) as t(child, col, parent)
  loop
    execute format(
      'update public.%I c set %I = null
        where c.%I is not null
          and not exists (select 1 from public.%I p where p.id = c.%I)',
      r.child, r.col, r.col, r.parent, r.col);
  end loop;
end $$;

-- Ο `tenant_comm_log.tenant_id` είναι NOT NULL: εκεί η ορφανή γραμμή ΔΕΝ
-- μπορεί να αποσυνδεθεί και δεν έχει νόημα χωρίς τον μισθωτή της. Φεύγει.
delete from public.tenant_comm_log c
 where not exists (select 1 from public.tenants t where t.id = c.tenant_id);

-- ── 2. ΤΑ ΚΛΕΙΔΙΑ ───────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select * from (values
      ('checklist_items',       'assigned_contact_id', 'contacts',           'set null'),
      ('checklist_items',       'calendar_event_id',   'calendar_events',    'set null'),
      ('checklist_items',       'expense_id',          'expenses',           'set null'),
      ('email_recipients',      'client_id',           'clients',            'set null'),
      ('expenses',              'contact_id',          'contacts',           'set null'),
      ('guest_checkins',        'client_id',           'clients',            'set null'),
      ('inventory_maintenance', 'calendar_event_id',   'calendar_events',    'set null'),
      ('inventory_maintenance', 'expense_id',          'expenses',           'set null'),
      ('maintenance_requests',  'tenant_id',           'tenants',            'set null'),
      ('notification_log',      'event_id',            'calendar_events',    'set null'),
      ('rent_payments',         'receipt_doc_id',      'property_documents', 'set null'),
      ('rent_payments',         'tenant_id',           'tenants',            'set null'),
      ('tenant_comm_log',       'tenant_id',           'tenants',            'cascade')
    ) as t(child, col, parent, act)
  loop
    execute format('alter table public.%I drop constraint if exists %I',
                   r.child, r.child || '_' || r.col || '_fkey');
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.%I(id) on delete %s',
      r.child, r.child || '_' || r.col || '_fkey', r.col, r.parent, r.act);
    -- ΤΟ ΕΥΡΕΤΗΡΙΟ ΔΕΝ ΕΙΝΑΙ ΠΟΛΥΤΕΛΕΙΑ. Χωρίς αυτό, κάθε διαγραφή γονιού
    -- σαρώνει ΟΛΟΚΛΗΡΟ τον πίνακα-παιδί για να βρει τι να ενημερώσει.
    execute format('create index if not exists %I on public.%I(%I)',
                   'idx_' || r.child || '_' || r.col, r.child, r.col);
  end loop;
end $$;

-- ── 3. ΔΥΟ ΣΤΗΛΕΣ ΠΟΥ ΔΕΝ ΤΙΣ ΓΡΑΦΕΙ ΚΑΝΕΙΣ, ΚΑΙ ΣΚΙΑΖΟΥΝ ΔΥΟ ΠΟΥ ΤΙΣ ΓΡΑΦΕΙ
--
-- Ο `checklist_items` κρατά ΤΕΣΣΕΡΙΣ στήλες για ΔΥΟ σχέσεις:
--     expense_id (12 χρήσεις στον κώδικα)   ·  linked_expense_id (καμία)
--     calendar_event_id (21 χρήσεις)        ·  linked_event_id   (καμία)
--
-- Οι δύο «linked_» υπάρχουν μόνο στο baseline και στον παραγόμενο χάρτη τύπων.
-- Καμία οθόνη, κανένα στρώμα δεδομένων, καμία συνάρτηση δεν τις διαβάζει ή τις
-- γράφει. Δεν είναι απλώς νεκρό βάρος: όποιος διαβάσει το σχήμα βλέπει δύο
-- υποψήφιες στήλες για την ίδια σχέση και δεν έχει τρόπο να ξέρει ποια ισχύει.
-- Η επόμενη οθόνη που θα γραφτεί μπορεί κάλλιστα να διαλέξει τη λάθος.
alter table public.checklist_items drop column if exists linked_expense_id;
alter table public.checklist_items drop column if exists linked_event_id;

comment on constraint rent_payments_tenant_id_fkey on public.rent_payments is
  'Χωρίς αυτό, η διαγραφή μισθωτή άφηνε αποδείξεις είσπραξης που έδειχναν στο πουθενά.';
