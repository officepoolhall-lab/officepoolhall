-- pool_member_accounts: the commissioner sees each member's account status; players don't.
-- Run with: npx supabase test db
begin;
select plan(4);

insert into auth.users (id, email, raw_user_meta_data, last_sign_in_at) values
  ('a0000000-0000-0000-0000-000000000000', 'commish@test.dev', '{"password_set": true}', now()),
  ('b0000000-0000-0000-0000-000000000000', 'player@test.dev', '{}', null);
insert into pools (id, name, slug, sport, season, commissioner_id, settings) values
  ('50000000-0000-0000-0000-000000000000', 'Accounts', 'accounts-pool', 'ncaaf', 2026,
   'a0000000-0000-0000-0000-000000000000',
   '{"pick_type":"ats","picks_per_slate":5,"picks_mode":"exact","confidence":null,
     "scoring":{"win":1,"push":0.5,"loss":0},"lock":{"mode":"per_game"},
     "lines":{"bookmaker":"draftkings","freeze_at":"publish","force_half_point":false}}');
insert into pool_members (pool_id, user_id, role) values
  ('50000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'commissioner'),
  ('50000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000', 'player');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
select is((select password_set from pool_member_accounts('50000000-0000-0000-0000-000000000000') where user_id = 'a0000000-0000-0000-0000-000000000000'),
          true, 'a member who chose a password shows as set');
select is((select password_set from pool_member_accounts('50000000-0000-0000-0000-000000000000') where user_id = 'b0000000-0000-0000-0000-000000000000'),
          false, 'a member without one shows as not set');
select is((select email from pool_member_accounts('50000000-0000-0000-0000-000000000000') where user_id = 'b0000000-0000-0000-0000-000000000000'),
          'player@test.dev', 'emails come along');

select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
select throws_like($$select * from pool_member_accounts('50000000-0000-0000-0000-000000000000')$$,
                   'Only the commissioner%', 'a player can''t list accounts');

select * from finish();
rollback;
