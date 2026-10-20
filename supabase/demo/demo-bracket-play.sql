-- Hoops Sandbox demo: lock brackets and play the First and Second Rounds of the demo NCAA
-- Tournament (mostly favorites, a few upsets), then score every bracket.
-- Run AFTER demo-bracket.sql (and after you've filled out your bracket).
-- Paste into Supabase → SQL Editor → Run. Running it again replays those rounds.
-- Admin → Bracket → Results takes it from there (Sweet 16 on), or edit these winners.
begin;

do $$
declare
  v_id uuid;
  v_res jsonb := '{}';
  v_r int;
  v_g int;
  v_a text;
  v_b text;
  v_sa int;
  v_sb int;
begin
  select b.id into v_id from brackets b join pools p on p.id = b.pool_id where p.slug = 'hoops-demo';
  if v_id is null then raise exception 'Run demo-bracket.sql first.'; end if;
  update brackets set lock_at = least(lock_at, now() - interval '1 minute') where id = v_id;

  for v_r in 1..2 loop
    for v_g in 0..(32 >> (v_r - 1)) - 1 loop
      if v_r = 1 then
        select team_id::text into v_a from bracket_teams where bracket_id = v_id and slot = 2 * v_g;
        select team_id::text into v_b from bracket_teams where bracket_id = v_id and slot = 2 * v_g + 1;
      else
        v_a := v_res ->> ((v_r - 1) || '-' || (2 * v_g));
        v_b := v_res ->> ((v_r - 1) || '-' || (2 * v_g + 1));
      end if;
      select bracket_seed(slot) into v_sa from bracket_teams where bracket_id = v_id and team_id::text = v_a;
      select bracket_seed(slot) into v_sb from bracket_teams where bracket_id = v_id and team_id::text = v_b;
      v_res := v_res || jsonb_build_object(v_r || '-' || v_g,
        case when (('x' || substr(md5(v_id::text || 'play' || v_r || '-' || v_g), 1, 4))::bit(16)::int % 100)
                  < 45 - 3 * abs(v_sa - v_sb)
             then (case when v_sa < v_sb then v_b else v_a end)
             else (case when v_sa < v_sb then v_a else v_b end) end);
    end loop;
  end loop;

  insert into bracket_results (bracket_id, results, updated_at) values (v_id, v_res, now())
  on conflict (bracket_id) do update set results = excluded.results, updated_at = now();
  perform grade_bracket(v_id);
  raise notice 'First and Second Rounds played; brackets scored. See Standings → Bracket.';
end $$;

commit;
