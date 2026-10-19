-- pool_member_emails: the commissioner sees members' emails; players don't.
-- Run with: npx supabase test db
begin;
select plan(3);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000000', 'commish@test.dev'),
  ('b0000000-0000-0000-0000-000000000000', 'player@test.dev'),
  ('c0000000-0000-0000-0000-000000000000', 'outsider@test.dev');
insert into pools (id, name, slug, sport, season, commissioner_id, settings) values
  ('50000000-0000-0000-0000-000000000000', 'Emails', 'emails-pool', 'ncaaf', 2026,
   'a0000000-0000-0000-0000-000000000000',
   '{"pick_type":"ats","picks_per_slate":5,"picks_mode":"exact","confidence":null,
     "scoring":{"win":1,"push":0.5,"loss":0},"lock":{"mode":"per_game"},
     "lines":{"bookmaker":"draftkings","freeze_at":"publish","force_half_point":false}}');
insert into pool_members (pool_id, user_id, role) values
  ('50000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'commissioner'),
  ('50000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000', 'player');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
select is((select count(*) from pool_member_emails('50000000-0000-0000-0000-000000000000')), 2::bigint,
          'the commissioner gets every member''s email');
select is((select email from pool_member_emails('50000000-0000-0000-0000-000000000000') where user_id = 'b0000000-0000-0000-0000-000000000000'),
          'player@test.dev', 'and they are the sign-in emails');

select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
select throws_like($$select * from pool_member_emails('50000000-0000-0000-0000-000000000000')$$,
                   'Only the commissioner%', 'a player can''t list emails');

select * from finish();
rollback;
