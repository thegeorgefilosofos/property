-- ═══════════════════════════════════════════════════════════════════════════
-- Οριστική διαγραφή λογαριασμού (self-service, μη αναστρέψιμη)
--
-- Ο χρήστης μπορεί να διαγράψει τον λογαριασμό του από τις Ρυθμίσεις. Επειδή η
-- διαγραφή του auth χρήστη απαιτεί αυξημένα δικαιώματα, χρησιμοποιούμε SECURITY
-- DEFINER function. Σβήνει:
--   1) όλες τις εγγραφές σε πίνακες public που έχουν στήλη user_id (δυναμικά,
--      χωρίς να χρειάζεται συντήρηση λίστας πινάκων),
--   2) τα αρχεία του χρήστη στο storage,
--   3) τον ίδιο τον χρήστη από το auth.users.
-- Επιστρέφει μόνο για τον συνδεδεμένο χρήστη (auth.uid()).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  t   record;
begin
  if uid is null then
    raise exception 'Δεν υπάρχει συνδεδεμένος χρήστης';
  end if;

  -- 1) Σβήσε όλες τις εγγραφές του χρήστη από κάθε πίνακα public με στήλη user_id
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'user_id'
      and tb.table_type = 'BASE TABLE'
  loop
    execute format('delete from public.%I where user_id = $1', t.table_name) using uid;
  end loop;

  -- 2) Σβήσε τα ανεβασμένα αρχεία του χρήστη από το storage
  begin
    delete from storage.objects where owner = uid;
  exception when others then
    -- αν δεν υπάρχει πρόσβαση/πίνακας, μη μπλοκάρεις τη διαγραφή
    null;
  end;

  -- 3) Σβήσε τον ίδιο τον χρήστη (auth). Ό,τι έχει FK με on delete cascade φεύγει μαζί.
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
