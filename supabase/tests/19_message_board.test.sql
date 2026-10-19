-- Message Board: members post and reply, only the commissioner pins, deletes are limited.
-- Run with: npx supabase test db
begin;
select plan(8);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000000', 'a@test.dev'),
  ('b0000000-0000-0000-0000-000000000000', 'b@test.dev'),
  ('c0000000-0000-0000-0000-000000000000', 'c@test.dev'),
  ('d0000000-0000-0000-0000-000000000000', 'd@test.dev');
insert into pools (id, name, slug, sport, season, commissioner_id, settings) values
  ('50000000-0000-0000-0000-000000000000', 'Board', 'board-pool', 'ncaaf', 2026, 'a0000000-0000-0000-0000-000000000000',
   '{"pick_type":"straight_up","picks_per_slate":1,"picks_mode":"exact","confidence":null,
     "scoring":{"win":1,"push":0.5,"loss":0},"lock":{"mode":"per_game"},
     "lines":{"bookmaker":"draftkings","freeze_at":"publish","force_half_point":false}}');
insert into pool_members (pool_id, user_id, role) values
  ('50000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'commissioner'),
  ('50000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000', 'player'),
  ('50000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000000', 'player');

set local role authenticated;

-- B posts; D replies.
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
insert into board_posts (id, pool_id, title, body) values
  ('90000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000000', 'Trash talk', 'Week 8 is mine.');
select throws_ok($$insert into board_posts (pool_id, title, body, pinned) values
  ('50000000-0000-0000-0000-000000000000', 'Sneaky', 'pin me', true)$$, '42501', null, 'a player can''t post pinned');
select throws_like($$select set_post_pinned('90000000-0000-0000-0000-000000000001', true)$$, 'Only the commissioner%',
                   'or pin a post');

select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
insert into board_replies (post_id, body) values ('90000000-0000-0000-0000-000000000001', 'Doubt it.');
select is((select count(*) from board_replies), 1::bigint, 'another member can reply');
delete from board_posts where id = '90000000-0000-0000-0000-000000000001';
select is((select count(*) from board_posts), 1::bigint, 'but can''t delete someone else''s post');

-- C isn't in the pool.
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
select is((select count(*) from board_posts), 0::bigint, 'outsiders can''t read the board');
select throws_ok($$insert into board_posts (pool_id, title, body) values
  ('50000000-0000-0000-0000-000000000000', 'Hi', 'let me in')$$, '42501', null, 'or post to it');

-- A, the commissioner, pins and can delete anything.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
select set_post_pinned('90000000-0000-0000-0000-000000000001', true);
select is((select pinned from board_posts where id = '90000000-0000-0000-0000-000000000001'), true, 'the commissioner pins');
delete from board_replies;
select is((select count(*) from board_replies), 0::bigint, 'and can delete any reply');

select * from finish();
rollback;
