-- Extend the settings guard to the Pool A rules (docs/RULES.md), matching
-- LOCKED_AFTER_OPEN in lib/poolSettings.ts.
--
-- Settings are compared after filling in zod's defaults. The app re-parses
-- settings on every save, so a pool stored before these keys existed
-- ({"tiers": [...]} with no wrong_pick, no upset_bonus/missed_week) comes back
-- with the defaults written in. Comparing the raw JSON would treat that as a
-- change and reject every settings save on an already-open pool.
create or replace function pool_settings_core(s jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_array(
    s->'pick_type',
    s->'picks_per_slate',
    case when jsonb_typeof(s->'confidence') = 'object'
         then jsonb_build_object('wrong_pick', '"zero"'::jsonb) || (s->'confidence')
         else coalesce(s->'confidence', 'null'::jsonb) end,
    coalesce(s->'upset_bonus', 'null'::jsonb),
    coalesce(s->'missed_week', '"zero"'::jsonb)
  );
$$;

create or replace function guard_pool_settings() returns trigger
language plpgsql set search_path = public as $$
begin
  if (old.sport, pool_settings_core(old.settings))
       is distinct from
     (new.sport, pool_settings_core(new.settings))
     and exists (select 1 from slates where pool_id = new.id and status <> 'draft') then
    raise exception 'Sport, pick type, pick count, confidence tiers, wrong-pick, upset bonus and missed-week rules can''t change after the first week opens';
  end if;
  return new;
end;
$$;
