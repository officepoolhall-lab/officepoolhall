-- Players' first and last names, so standings list real people rather than email prefixes.
-- display_name stays the column the app reads; set_my_name() keeps it "First Last".
-- New accounts start unconfirmed and are asked for their name once, right after sign-in.

alter table profiles
  add column first_name text check (char_length(first_name) between 1 and 50),
  add column last_name text check (char_length(last_name) between 1 and 50),
  add column name_confirmed boolean not null default false;

-- "Ada Lovelace" -> ('Ada', 'Lovelace'); a single word is a first name only. Best effort,
-- for accounts named before this migration (or by an import) to start /account filled in.
create or replace function split_display_name(p_name text, out first_name text, out last_name text)
language sql immutable set search_path = public as $$
  with n as (select btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')) as s)
  select nullif(left(split_part(s, ' ', 1), 50), ''),
         nullif(left(btrim(substr(s, char_length(split_part(s, ' ', 1)) + 2)), 50), '')
  from n;
$$;

-- Everyone already here keeps their name and is never asked (the imported players were
-- named on import).
update profiles set
  name_confirmed = true,
  first_name = (split_display_name(display_name)).first_name,
  last_name = (split_display_name(display_name)).last_name;

-- An account created with a name (seed data, the roster import) counts as named;
-- one created by signing in with an email does not.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text := nullif(btrim(new.raw_user_meta_data->>'display_name'), '');
begin
  insert into profiles (id, display_name, first_name, last_name, name_confirmed)
  select new.id, coalesce(v_name, split_part(new.email, '@', 1)),
         case when v_name is not null then s.first_name end,
         case when v_name is not null then s.last_name end,
         v_name is not null
  from split_display_name(v_name) s
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function handle_new_user() from public, anon, authenticated;

-- Names change only through set_my_name(), so display_name always matches first/last.
drop policy profiles_self on profiles;

create or replace function set_my_name(p_first_name text, p_last_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_first text := btrim(regexp_replace(coalesce(p_first_name, ''), '\s+', ' ', 'g'));
  v_last  text := btrim(regexp_replace(coalesce(p_last_name, ''), '\s+', ' ', 'g'));
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if v_first = '' or v_last = '' then
    raise exception 'Enter your first and last name';
  end if;
  if char_length(v_first) > 50 or char_length(v_last) > 50 then
    raise exception 'Names can be up to 50 characters';
  end if;

  update profiles
  set first_name = v_first, last_name = v_last, display_name = v_first || ' ' || v_last, name_confirmed = true
  where id = auth.uid();
  if not found then
    raise exception 'No profile for this account';
  end if;
end;
$$;

-- Whether the caller has set a password (sign-in by emailed code never sets one).
create or replace function has_password() returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select coalesce(encrypted_password, '') <> '' from auth.users where id = auth.uid()), false);
$$;

revoke execute on function set_my_name(text, text) from public, anon;
revoke execute on function has_password() from public, anon;
grant execute on function set_my_name(text, text) to authenticated;
grant execute on function has_password() to authenticated;
