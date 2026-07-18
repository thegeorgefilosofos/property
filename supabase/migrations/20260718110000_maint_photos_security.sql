-- ─────────────────────────────────────────────────────────────────────────
-- maintenance-photos — διόρθωση ασφάλειας πρόσβασης.
--
-- Πρόβλημα: το bucket επέτρεπε σε ΑΝΩΝΥΜΟΥΣ να απαριθμήσουν και να κατεβάσουν
-- ΟΛΕΣ τις φωτογραφίες βλάβης όλων των χρηστών (πολιτικές select/insert χωρίς
-- περιορισμό). Επίσης οποιοσδήποτε μπορούσε να ανεβάσει αυθαίρετα αρχεία.
--
-- Λύση: το bucket μένει «δημόσιο» ώστε ο ιδιοκτήτης να βλέπει τις φωτογραφίες με
-- μη-μαντεύσιμο capability URL (ίδιο μοντέλο με τα tokens της πύλης), ΑΛΛΑ:
--   • καταργείται η ανώνυμη ανάγνωση/απαρίθμηση μέσω API (τέλος στη μαζική διαρροή)
--   • το ανέβασμα επιτρέπεται ΜΟΝΟ σε φάκελο ίσο με token ΕΝΕΡΓΗΣ πύλης
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.is_active_portal_token(p_token text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists(select 1 from portal_links where token = p_token and active);
$$;
grant execute on function public.is_active_portal_token(text) to anon, authenticated;

create or replace function public.owns_portal_token(p_token text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists(select 1 from portal_links where token = p_token and user_id = auth.uid());
$$;
grant execute on function public.owns_portal_token(text) to authenticated;

update storage.buckets set public = true where id = 'maintenance-photos';

drop policy if exists "maint_photos_insert" on storage.objects;
create policy "maint_photos_insert" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'maintenance-photos' and public.is_active_portal_token((storage.foldername(name))[1]));

drop policy if exists "maint_photos_read" on storage.objects;
drop policy if exists "maint_photos_read_owner" on storage.objects;
create policy "maint_photos_read_owner" on storage.objects for select to authenticated
  using (bucket_id = 'maintenance-photos' and public.owns_portal_token((storage.foldername(name))[1]));
