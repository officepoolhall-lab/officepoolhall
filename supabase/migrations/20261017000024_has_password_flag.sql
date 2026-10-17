-- GoTrue stores a random password hash for accounts created by emailed code, so
-- encrypted_password can't tell whether a player chose a password. The app now sets
-- user_metadata.password_set when they do (app/account/actions.ts savePassword).
create or replace function has_password() returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select (raw_user_meta_data->>'password_set')::boolean from auth.users where id = auth.uid()), false);
$$;
