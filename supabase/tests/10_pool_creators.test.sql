-- Pool creation allowlist. Run with: npx supabase test db
begin;
select plan(5);

insert into auth.users (id, email) values
  ('d0000000-0000-0000-0000-000000000001', 'approved@test.dev'),
  ('d0000000-0000-0000-0000-000000000002', 'random@test.dev');
insert into pool_creators (email) values ('approved@test.dev');

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000002","email":"random@test.dev","role":"authenticated"}', true);
select is(can_create_pools(), false, 'unlisted account cannot create pools');
select throws_like(
  $$select create_pool('Nope', 'nope-pool', 'ncaab', 2026, 0, '{}'::jsonb)$$,
  'Starting a pool is limited%', 'create_pool rejects an unlisted account');
select is((select count(*) from pool_creators), 0::bigint, 'the allowlist is not readable by players');

select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000001","email":"Approved@Test.dev","role":"authenticated"}', true);
select is(can_create_pools(), true, 'listed account can create pools (email match is case-insensitive)');
select lives_ok(
  $$select create_pool('Yes', 'yes-pool', 'ncaab', 2026, 0, '{"pick_type":"straight_up"}'::jsonb)$$,
  'create_pool works for a listed account');

select * from finish();
rollback;
