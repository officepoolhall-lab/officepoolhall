-- Commissioners can add a scheduled game to a week that is already published, while the week
-- is open. The game gets its line (spread pools) and the week's deadlines are recalculated.
-- Players can pick it until its deadline; picks already in are unchanged.
create or replace function add_open_slate_game(p_slate_id uuid, p_game_id uuid, p_home_spread numeric)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_slate slates%rowtype;
  v_pool pools%rowtype;
  v_game games%rowtype;
  v_line numeric;
  v_order int;
begin
  select * into v_slate from slates where id = p_slate_id for update;
  if not found or not is_commissioner(v_slate.pool_id) then
    raise exception 'Week not found';
  end if;
  if v_slate.status <> 'open' then
    raise exception 'Games can only be added to a week that is still open';
  end if;

  select * into v_pool from pools where id = v_slate.pool_id;
  select * into v_game from games where id = p_game_id;
  if not found or v_game.sport <> v_pool.sport then
    raise exception 'Game not found';
  end if;
  if v_game.status <> 'scheduled' or game_started(v_game.start_at, v_game.time_tbd, v_game.status) then
    raise exception 'That game has already started or can''t be picked';
  end if;
  if exists (select 1 from slate_games sg join slates s on s.id = sg.slate_id
             where sg.game_id = p_game_id and s.pool_id = v_slate.pool_id) then
    raise exception 'That game is already on a week''s slate';
  end if;

  if v_pool.settings->>'pick_type' = 'ats' then
    if p_home_spread is null then
      raise exception 'Enter the home team''s spread';
    end if;
    v_line := apply_half_point(p_home_spread, (v_pool.settings->'lines'->>'force_half_point')::boolean);
  end if;

  select coalesce(max(sort_order), -1) + 1 into v_order from slate_games where slate_id = p_slate_id;
  insert into slate_games (slate_id, game_id, sort_order, locked_home_spread)
  values (p_slate_id, p_game_id, v_order, v_line);

  perform refresh_slate_locks(p_slate_id);
end;
$$;
