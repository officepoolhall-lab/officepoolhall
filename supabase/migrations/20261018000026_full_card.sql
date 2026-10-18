-- Full card: in pools with settings.full_card, a player's picks only save when the card is
-- complete (picks_per_slate picks). Per-game locking is unchanged: once saved, picks on
-- games that haven't locked can still be swapped, and the card has to stay full.
-- submit_picks is the 20261017000022 version plus the full-card check.

create or replace function submit_picks(p_slate_id uuid, p_picks jsonb, p_user_id uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_slate slates%rowtype;
  v_settings jsonb;
  v_user uuid;
  v_game uuid;
  v_started boolean;
  v_conf int;
  v_on_behalf boolean;
  v_before jsonb;
  v_after jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into v_slate from slates where id = p_slate_id;
  if not found or not is_pool_member(v_slate.pool_id) then
    raise exception 'Slate not found';
  end if;

  v_user := coalesce(p_user_id, auth.uid());
  v_on_behalf := v_user <> auth.uid();
  if v_on_behalf then
    if not is_commissioner(v_slate.pool_id) then
      raise exception 'Only the commissioner can enter picks for another player';
    end if;
    if not exists (select 1 from pool_members where pool_id = v_slate.pool_id and user_id = v_user) then
      raise exception 'That player is not in this pool';
    end if;
    -- An on-behalf save regrades the slate below, and grade_slate (like the poller's
    -- grade_game) locks the slate row before touching picks. Take it first here too, so
    -- both paths lock in the same order and can't deadlock.
    select * into v_slate from slates where id = p_slate_id for update;
  end if;

  if v_on_behalf then
    if v_slate.status = 'draft' then
      raise exception 'This slate is not open for picks';
    end if;
  else
    if v_slate.status <> 'open' then
      raise exception 'This slate is not open for picks';
    end if;
    -- Every per-game deadline is at or before the slate's, so past it nothing can change.
    if v_slate.lock_at is not null and now() >= v_slate.lock_at then
      raise exception 'Picks for this slate are locked';
    end if;
  end if;
  if jsonb_typeof(p_picks) is distinct from 'array' then
    raise exception 'picks must be a JSON array';
  end if;

  select settings into v_settings from pools where id = v_slate.pool_id;

  -- One save at a time per player per slate.
  perform pg_advisory_xact_lock(hashtextextended(p_slate_id::text || v_user::text, 0));

  create temp table if not exists _submitted (
    game_id uuid, picked_side text, confidence int
  ) on commit drop;
  truncate _submitted;
  insert into _submitted
    select s.game_id, s.picked_side, s.confidence
    from jsonb_to_recordset(p_picks) as s(game_id uuid, picked_side text, confidence int);

  -- Lock state of every game on the slate, evaluated once. On the commissioner's
  -- on-behalf edits nothing is locked.
  create temp table if not exists _locks (
    game_id uuid, voided boolean, locked boolean, started boolean
  ) on commit drop;
  truncate _locks;
  insert into _locks
    select sg.game_id, sg.voided,
           not v_on_behalf and game_locked(g.start_at, g.time_tbd, g.status, coalesce(sg.lock_at, v_slate.lock_at)),
           game_started(g.start_at, g.time_tbd, g.status)
    from slate_games sg join games g on g.id = sg.game_id
    where sg.slate_id = p_slate_id;

  -- Shape
  if exists (select 1 from _submitted where game_id is null or picked_side is null
                                         or picked_side not in ('home','away')) then
    raise exception 'Each pick needs a game and a side (home or away)';
  end if;
  select game_id into v_game from _submitted group by game_id having count(*) > 1 limit 1;
  if found then
    raise exception 'More than one pick on %', game_label(v_game);
  end if;

  -- Every game must be on this slate
  select s.game_id into v_game
  from _submitted s
  left join _locks l on l.game_id = s.game_id
  where l.game_id is null
  limit 1;
  if found then
    raise exception 'A picked game is not on this slate';
  end if;

  -- Locked games are frozen: a submitted pick on a locked game must match what's saved...
  select s.game_id, l.started into v_game, v_started
  from _submitted s
  join _locks l on l.game_id = s.game_id
  left join picks p on p.slate_id = p_slate_id and p.user_id = v_user and p.game_id = s.game_id
  where l.locked
    and (p.id is null or p.picked_side <> s.picked_side or p.confidence is distinct from s.confidence)
  limit 1;
  if found then
    raise exception '% %; that pick is locked', game_label(v_game),
      case when v_started then 'has started' else 'is past its pick deadline' end;
  end if;

  -- ...and a saved pick on a locked game can't be dropped.
  select p.game_id, l.started into v_game, v_started
  from picks p
  join _locks l on l.game_id = p.game_id
  where p.slate_id = p_slate_id and p.user_id = v_user and l.locked
    and not exists (select 1 from _submitted s where s.game_id = p.game_id)
  limit 1;
  if found then
    raise exception '% %; that pick is locked', game_label(v_game),
      case when v_started then 'has started' else 'is past its pick deadline' end;
  end if;

  -- No new or changed picks on voided games. (The commissioner's form resubmits a pick
  -- already saved on a voided game, so only an actual change is refused there.)
  select s.game_id into v_game
  from _submitted s
  join _locks l on l.game_id = s.game_id
  left join picks p on p.slate_id = p_slate_id and p.user_id = v_user and p.game_id = s.game_id
  where l.voided and not l.locked
    and (not v_on_behalf or p.id is null or p.picked_side <> s.picked_side
         or p.confidence is distinct from s.confidence)
  limit 1;
  if found then
    raise exception '% was voided by the commissioner', game_label(v_game);
  end if;

  -- Count (frozen + unlocked)
  if (select count(*) from _submitted) > (v_settings->>'picks_per_slate')::int then
    raise exception 'Too many picks: this pool allows %', (v_settings->>'picks_per_slate')::int;
  end if;

  -- Full card: a player saves every pick at once. Picks on locked games are in _submitted
  -- too (frozen, checked above), so a later edit of an open game still counts the whole card.
  -- The commissioner's on-behalf edits are exempt so they can fix a single pick.
  if coalesce((v_settings->>'full_card')::boolean, false) and not v_on_behalf
     and (select count(*) from _submitted) < (v_settings->>'picks_per_slate')::int then
    raise exception 'Make all % picks to save (you have %)',
      (v_settings->>'picks_per_slate')::int, (select count(*) from _submitted);
  end if;

  -- Confidence tiers
  if jsonb_typeof(v_settings->'confidence') = 'object' then
    if exists (select 1 from _submitted where confidence is null) then
      raise exception 'Every pick needs a confidence value';
    end if;

    select u.confidence into v_conf
    from (select confidence, count(*) as n from _submitted group by confidence) u
    left join (
      select (t->>'points')::int as points, sum((t->>'count')::int) as allowed
      from jsonb_array_elements(v_settings->'confidence'->'tiers') t
      group by 1
    ) a on a.points = u.confidence
    where a.points is null or u.n > a.allowed
    limit 1;
    if found then
      raise exception 'Too many %-point picks for this pool''s tiers', v_conf;
    end if;
  elsif exists (select 1 from _submitted where confidence is not null) then
    raise exception 'This pool doesn''t use confidence points';
  end if;

  if v_on_behalf then
    select coalesce(jsonb_agg(jsonb_build_object('game_id', game_id, 'picked_side', picked_side,
                                                 'confidence', confidence) order by game_id), '[]')
      into v_before
    from picks where slate_id = p_slate_id and user_id = v_user;
  end if;

  -- Write: only unlocked games change. A change by the player clears an earlier
  -- commissioner mark; a change on their behalf sets it. Unchanged rows keep theirs.
  delete from picks p
  using _locks l
  where p.slate_id = p_slate_id and p.user_id = v_user
    and l.game_id = p.game_id and not l.locked
    and not exists (select 1 from _submitted s where s.game_id = p.game_id);

  insert into picks (slate_id, game_id, user_id, picked_side, confidence, edited_by, edited_at)
  select p_slate_id, s.game_id, v_user, s.picked_side, s.confidence,
         case when v_on_behalf then auth.uid() end,
         case when v_on_behalf then now() end
  from _submitted s
  join _locks l on l.game_id = s.game_id
  where not l.locked
  on conflict (slate_id, user_id, game_id) do update
    set picked_side = excluded.picked_side,
        confidence = excluded.confidence,
        edited_by = excluded.edited_by,
        edited_at = excluded.edited_at,
        updated_at = now()
    where (picks.picked_side, picks.confidence)
          is distinct from (excluded.picked_side, excluded.confidence);

  if v_on_behalf then
    select coalesce(jsonb_agg(jsonb_build_object('game_id', game_id, 'picked_side', picked_side,
                                                 'confidence', confidence) order by game_id), '[]')
      into v_after
    from picks where slate_id = p_slate_id and user_id = v_user;

    insert into audit_log (pool_id, actor_id, action, detail)
    values (v_slate.pool_id, auth.uid(), 'picks_on_behalf',
            jsonb_build_object('slate_id', p_slate_id, 'user_id', v_user, 'picks', p_picks,
                               'before', v_before, 'after', v_after));

    -- A changed pick can change results, points, the upset split, standings, and whether
    -- the week counts as missed (a closed slate with no finals yet still scores that).
    -- grade_slate recomputes all of it from scratch and is idempotent, and a pick on an
    -- undecided game goes back to ungraded.
    if v_before is distinct from v_after then
      perform grade_slate(p_slate_id);
    end if;
  end if;
end;
$$;

-- Football pools are NCAAF Supercontests (the only ncaaf preset): turn the rule on for them.
-- full_card isn't one of the core settings guard_pool_settings protects, so open pools can change.
update pools
set settings = settings || '{"full_card": true}'::jsonb
where sport = 'ncaaf' and settings->'full_card' is null;
