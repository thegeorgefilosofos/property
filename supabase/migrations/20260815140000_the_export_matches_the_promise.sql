-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΕΞΑΓΩΓΗ ΚΑΤΕΒΑΖΕΙ ΠΙΑ ΟΣΑ ΥΠΟΣΧΟΝΤΑΙ ΤΡΕΙΣ ΟΘΟΝΕΣ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΙ ΥΠΗΡΧΕ, ΜΕΤΡΗΜΕΝΟ ΠΑΝΩ ΣΤΟ ΣΧΗΜΑ. Η `export_my_data` σαρώνει το
-- `information_schema` και κατεβάζει κάθε πίνακα του `public` που έχει στήλη
-- ΜΕ ΤΟ ΟΝΟΜΑ `user_id`. Σήμερα αυτό πιάνει 62 από τους 78 πίνακες.
--
-- Απο τους 16 που έμεναν έξω, τέσσερις κρατούν προσωπικά δεδομένα του χρήστη.
-- Δεν τους έλειπε ο σύνδεσμος προς τον χρήστη· τους έλειπε το ΟΝΟΜΑ:
--
--     organizations         owner_user_id
--     referrals             referrer_user_id, referred_user_id
--     accountant_clients    accountant_id, owner_id
--     accountant_requests   accountant_id, owner_id
--
-- Και οι οκτώ αυτές στήλες έχουν ξένο κλειδί προς `auth.users(id)`. Ο κανόνας
-- ιδιοκτησίας ήταν ήδη γραμμένος στο σχήμα, δηλωτικά. Απλώς η εξαγωγή κοίταζε
-- το όνομα της στήλης αντί για τη σχέση.
--
-- ΤΙ ΚΟΣΤΙΖΕ. Τρεις οθόνες λένε ότι κατεβάζεις ΟΛΕΣ τις καταχωρήσεις σου:
-- app/trust/page.tsx (γραμμές 210 και 223), app/privacy/page.tsx (γραμμή 96)
-- και TabSettings.tsx (γραμμή 750, «Κάθε εγγραφή που σε αφορά»). Σε αίτημα
-- φορητότητας του άρθρου 20 αυτό δεν ήταν ατέλεια οθόνης: ήταν ελλιπής
-- απάντηση με ετικέτα που βεβαίωνε το αντίθετο. Ο ιδιοκτήτης δεν έπαιρνε
-- ποιος λογιστής τον βλέπει, τι του ζήτησε, ποια είναι η επιχείρησή του, ούτε
-- τις προσκλήσεις του.
--
-- ΤΟ ΣΗΜΕΙΟ ΠΟΥ ΤΟ ΕΚΑΝΕ ΑΘΟΡΥΒΟ. Η δίδυμη `delete_my_account` σαρώνει τους
-- ΙΔΙΟΥΣ 62 πίνακες, αλλά στο τέλος κάνει `delete from auth.users` και τα ξένα
-- κλειδιά `on delete cascade` παίρνουν μαζί τους και τους τέσσερις. Η διαγραφή
-- είχε δίχτυ, η εξαγωγή δεν είχε. Γι' αυτό η ασυμμετρία δεν φάνηκε ποτέ: όποιος
-- δοκίμαζε «σβήσε τα όλα» έβλεπε σωστό αποτέλεσμα.
--
-- ΤΙ ΑΛΛΑΖΕΙ. Ενας κανόνας ιδιοκτησίας αντί για ένα όνομα στήλης, ως ένωση:
--
--   (α) στήλη που λέγεται `user_id`, όπως πριν. ΔΕΝ φεύγει και δεν είναι
--       περιττή: ο `property_documents` έχει `user_id` ΧΩΡΙΣ ξένο κλειδί, οπότε
--       σκέτος ο κανόνας (β) θα τον πετούσε έξω. Μια «καθαρότερη» εκδοχή αυτού
--       του αρχείου θα αφαιρούσε πίνακα αντί να προσθέσει.
--   (β) στήλη με ξένο κλειδί μιας στήλης προς `auth.users(id)`.
--
-- Σύνολο 66 πίνακες. Οι κανόνες ενώνονται ΑΝΑ ΠΙΝΑΚΑ σε ένα `or`, ώστε πίνακας
-- με δύο συνδέσμους να δίνει μία εγγραφή χωρίς διπλές γραμμές: ο `activity_log`
-- έχει `user_id` ΚΑΙ `actor_id`, οι `referrals` δύο πλευρές.
--
-- ΓΙΑΤΙ ΔΕΝ ΕΙΝΑΙ ΔΙΑΡΡΟΗ. Η επέκταση δίνει ακριβώς όσα διαβάζει ήδη ο χρήστης
-- μέσω RLS: `activity_log` (`user_id = uid or actor_id = uid`),
-- `accountant_clients` και `accountant_requests` (`accountant_id = uid or
-- owner_id = uid`), `organizations` (`owner_user_id = uid`). Ο μόνος πίνακας
-- χωρίς πολιτική είναι ο `referrals`, όπου η γραμμή αφορά κατά κυριολεξία τον
-- ίδιο τον χρήστη: είναι η πρόσκληση που έστειλε ή δέχτηκε. Ο,τι συνοδεύει την
-- αντίπερα πλευρά είναι ένα uuid, όχι όνομα ή διεύθυνση.
--
-- ΚΑΙ Η ΤΑΥΤΟΤΗΤΑ ΤΟΥ ΛΟΓΑΡΙΑΣΜΟΥ. Το email και η ημερομηνία εγγραφής ζουν στον
-- `auth.users`, που δεν είναι πίνακας του `public` και δεν τον έπιανε καμία
-- σάρωση. Μπαίνουν σε ξεχωριστό κλειδί `account`, δίπλα στο `data`.
--
-- ΤΙ ΜΕΝΕΙ ΕΞΩ, ΡΗΤΑ ΚΑΙ ΜΕ ΤΟΝ ΛΟΓΟ ΤΟΥ. Δεν είναι καταχωρήσεις του χρήστη:
--
--   · `portal_pin_attempts`  προσπάθειες PIN του ΜΙΣΘΩΤΗ στην πύλη
--   · `email_outbox`         ουρά εξερχομένων, με παραλήπτες και τρίτους
--   · `account_deletion_incidents`  γράφεται μόνο κατά τη διαγραφή, μετά
--   · `bank_rates`, `energy_tariffs`, `loan_programs`, `market_rates`,
--     `product_updates`, `invoice_counters`, `ai_budget`, `app_admins`,
--     `cron_secrets`  κοινά δεδομένα αναφοράς και υποδομή
--
-- Επίσης δεν κατεβάζει τα ανεβασμένα αρχεία: αυτά ζουν στο Storage και οι τρεις
-- οθόνες το λένε ήδη ρητά, δείχνοντας τον Φάκελο Ακινήτου.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.export_my_data() returns jsonb
    language plpgsql security definer
    set search_path to 'public'
    as $_$
declare
  v_uid  uuid  := auth.uid();
  v_out  jsonb := '{}'::jsonb;
  v_rows jsonb;
  v_acct jsonb;
  r      record;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  for r in
    -- Δύο κανόνες ιδιοκτησίας, ενωμένοι σε ΕΝΑ `or` ανά πίνακα. Το `union`
    -- (όχι `union all`) σβήνει το διπλό ταίριασμα όταν η στήλη λέγεται
    -- `user_id` ΚΑΙ έχει ξένο κλειδί, που ισχύει για τους 61 από τους 62.
    select w.tbl,
           string_agg(format('t.%I::text = $1', w.col), ' or ' order by w.col) as pred
      from (
        select c.table_name::text as tbl, c.column_name::text as col
          from information_schema.columns c
          join information_schema.tables t
            on t.table_schema = c.table_schema and t.table_name = c.table_name
         where c.table_schema = 'public'
           and c.column_name  = 'user_id'
           and t.table_type   = 'BASE TABLE'
        union
        -- Μόνο ξένα κλειδιά ΜΙΑΣ στήλης: σε σύνθετο κλειδί το `conkey[1]` θα
        -- έδινε μισή συνθήκη, δηλαδή γραμμές άλλου χρήστη.
        select cl.relname::text, a.attname::text
          from pg_constraint k
          join pg_class     cl on cl.oid = k.conrelid
          join pg_namespace n  on n.oid  = cl.relnamespace
          join pg_attribute a  on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
         where k.contype   = 'f'
           and k.confrelid = 'auth.users'::regclass
           and n.nspname   = 'public'
           and cl.relkind in ('r', 'p')
           and cardinality(k.conkey) = 1
      ) w
     group by w.tbl
     order by w.tbl
  loop
    -- Το `%s` δέχεται ΜΟΝΟ κείμενο που έφτιαξε το `%I` από πάνω, ποτέ όνομα
    -- όπως ήρθε. Cast και οι δύο πλευρές σε text: τρεις πίνακες κρατούν το
    -- αναγνωριστικό ως text, όχι uuid.
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where %s',
      r.tbl, r.pred
    )
    into v_rows
    using v_uid::text;

    if v_rows <> '[]'::jsonb then
      v_out := v_out || jsonb_build_object(r.tbl, v_rows);
    end if;
  end loop;

  -- Ο λογαριασμός ο ίδιος. Χωρίς κωδικούς και χωρίς tokens: μόνο ό,τι έδωσε ο
  -- χρήστης και ό,τι του λέει πότε ξεκίνησε.
  select to_jsonb(u) into v_acct
    from (
      select email, phone, created_at, last_sign_in_at
        from auth.users where id = v_uid
    ) u;

  return jsonb_build_object(
    'exported_at', now(),
    'user_id',     v_uid,
    'account',     coalesce(v_acct, 'null'::jsonb),
    'data',        v_out
  );
end;
$_$;

alter function public.export_my_data() owner to postgres;


-- ── Η ΑΠΟΔΕΙΞΗ, ΜΕΣΑ ΣΤΗΝ ΙΔΙΑ ΣΥΝΑΛΛΑΓΗ ──────────────────────────────────
-- Ενα `create or replace` που «πέρασε» δεν αποδεικνύει ότι η σάρωση φτάνει πια
-- στους τέσσερις πίνακες. Εδώ τρέχει ΤΟ ΙΔΙΟ ερώτημα ανακάλυψης και απαιτεί να
-- τους βρει· αλλιώς η μετανάστευση γυρίζει πίσω.
do $proof$
declare
  v_found  int;
  v_before int;
  v_miss   text;
begin
  create temporary table _export_scope on commit drop as
    select w.tbl, count(*) as cols
      from (
        select c.table_name::text as tbl, c.column_name::text as col
          from information_schema.columns c
          join information_schema.tables t
            on t.table_schema = c.table_schema and t.table_name = c.table_name
         where c.table_schema = 'public'
           and c.column_name  = 'user_id'
           and t.table_type   = 'BASE TABLE'
        union
        select cl.relname::text, a.attname::text
          from pg_constraint k
          join pg_class     cl on cl.oid = k.conrelid
          join pg_namespace n  on n.oid  = cl.relnamespace
          join pg_attribute a  on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
         where k.contype   = 'f'
           and k.confrelid = 'auth.users'::regclass
           and n.nspname   = 'public'
           and cl.relkind in ('r', 'p')
           and cardinality(k.conkey) = 1
      ) w
     group by w.tbl;

  select count(*) into v_found from _export_scope;

  select count(*) into v_before
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
   where c.table_schema = 'public'
     and c.column_name  = 'user_id'
     and t.table_type   = 'BASE TABLE';

  -- 1. Καμία απώλεια: ο παλιός κανόνας είναι υποσύνολο του νέου.
  if v_found < v_before then
    raise exception 'Η εξαγωγή έχασε πίνακες: % τώρα, % με τον παλιό κανόνα', v_found, v_before;
  end if;

  -- 2. Το κέρδος, ονομαστικά. Αυτοί οι τέσσερις ήταν το εύρημα.
  select string_agg(n, ', ' order by n) into v_miss
    from unnest(array['accountant_clients', 'accountant_requests',
                      'organizations', 'referrals']) n
   where not exists (select 1 from _export_scope s where s.tbl = n);

  if v_miss is not null then
    raise exception 'Η εξαγωγή αφήνει ακόμη έξω: %', v_miss;
  end if;

  raise notice 'export_my_data: % πίνακες (ήταν %)', v_found, v_before;
end $proof$;
