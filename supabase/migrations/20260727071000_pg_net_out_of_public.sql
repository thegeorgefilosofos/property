-- ═══════════════════════════════════════════════════════════════════════════
-- Μετακίνηση της επέκτασης pg_net εκτός του public schema.
--
-- Όταν μια επέκταση ζει στο `public`, οι συναρτήσεις της (π.χ. net.http_post)
-- βρίσκονται στο προεπιλεγμένο search_path κάθε ρόλου. Αυτό διευρύνει άσκοπα την
-- επιφάνεια επίθεσης και μπερδεύει τα ονόματα με τους δικούς μας πίνακες.
-- Η σύσταση της Supabase είναι να ζει σε δικό της schema (`extensions`).
--
-- Το pg_net το χρησιμοποιούν μόνο τα cron jobs μέσω `net.http_post(...)`, τα
-- οποία δηλώνουν ρητά το schema, οπότε η μετακίνηση δεν σπάει κλήσεις.
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists extensions;

do $$
begin
  if exists (
    select 1 from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_net' and n.nspname = 'public'
  ) then
    execute 'alter extension pg_net set schema extensions';
  end if;
end
$$;

-- Τα cron jobs καλούν «net.http_post»· διασφαλίζουμε ότι το schema είναι ορατό.
grant usage on schema extensions to postgres, service_role;
