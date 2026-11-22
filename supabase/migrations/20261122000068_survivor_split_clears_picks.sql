-- Survivor split: once the pot is split, the week it was split in (and anything after) has no
-- picks. Picks made that week hadn't kicked off (splitting closes when one does), so they're
-- simply dropped. Also clears them for a pool that was already split.

create or replace function clear_picks_after_split() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.week is not null then
    delete from survivor_picks p
    using slates s
    where s.id = p.slate_id and p.pool_id = new.pool_id and s.week >= new.week;
  end if;
  return new;
end;
$$;
revoke execute on function clear_picks_after_split() from public, anon, authenticated;

drop trigger if exists clear_picks_on_split on survivor_splits;
create trigger clear_picks_on_split after insert on survivor_splits
  for each row execute function clear_picks_after_split();

-- Pools already split.
delete from survivor_picks p
using slates s, survivor_splits sp
where s.id = p.slate_id and sp.pool_id = p.pool_id and sp.week is not null and s.week >= sp.week;
