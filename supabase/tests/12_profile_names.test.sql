-- First/last names on profiles. Run with: npx supabase test db
begin;
select plan(10);

-- An account created with a name (seed / roster import) counts as named; one created by
-- signing in with an email starts unconfirmed.
insert into auth.users (id, email, raw_user_meta_data) values
  ('e0000000-0000-0000-0000-000000000001', 'named@test.dev', '{"display_name":"Ada Lovelace"}'),
  ('e0000000-0000-0000-0000-000000000002', 'fresh@test.dev', '{}');

select is((select count(*) from profiles where not name_confirmed and id not in
           ('e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002')),
          0::bigint, 'every profile from before the migration is confirmed');
select results_eq(
  $$select first_name, last_name, name_confirmed from profiles where id = 'e0000000-0000-0000-0000-000000000001'$$,
  $$values ('Ada'::text, 'Lovelace'::text, true)$$,
  'an account created with a name is split and confirmed');
select results_eq(
  $$select display_name, first_name, last_name, name_confirmed from profiles where id = 'e0000000-0000-0000-0000-000000000002'$$,
  $$values ('fresh'::text, null::text, null::text, false)$$,
  'a new sign-up starts unconfirmed with the email prefix');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select throws_like($$select set_my_name('  ', 'Hopper')$$, 'Enter your first and last name%', 'both names are required');
select throws_like($$select set_my_name(repeat('a', 51), 'Hopper')$$, 'Names can be up to 50%', 'names have a max length');

select lives_ok($$select set_my_name('  Grace ', ' Brewster  Hopper ')$$, 'a player can set their own name');
select results_eq(
  $$select display_name, first_name, last_name, name_confirmed from profiles where id = 'e0000000-0000-0000-0000-000000000002'$$,
  $$values ('Grace Brewster Hopper'::text, 'Grace'::text, 'Brewster Hopper'::text, true)$$,
  'names are trimmed and display_name becomes "First Last"');

-- No direct writes: someone else's row, or one's own display_name out of step with the names.
update profiles set display_name = 'Hacked' where id = 'e0000000-0000-0000-0000-000000000001';
update profiles set display_name = 'Hacked' where id = 'e0000000-0000-0000-0000-000000000002';
select is((select count(*) from profiles where display_name = 'Hacked'), 0::bigint, 'profiles cannot be updated directly');
select is((select display_name from profiles where id = 'e0000000-0000-0000-0000-000000000001'), 'Ada Lovelace',
          'set_my_name never touches another player');

select is(has_password(), false, 'a code-only account has no password');

select * from finish();
rollback;
