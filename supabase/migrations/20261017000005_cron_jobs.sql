-- Scheduled ingestion (HANDOFF.md §6.4). pg_cron calls the Edge Functions over HTTP
-- via pg_net, using two Vault secrets that you create once per environment:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service role key>', 'service_role_key');
-- Without them the jobs log a notice and do nothing.

create extension if not exists pg_net with schema extensions;

-- Games the score poller should check: on a published slate, started (or about to),
-- not final/cancelled, and not ancient.
create or replace function games_to_poll()
returns table (game_id uuid, sport text, start_at timestamptz)
language sql security definer stable set search_path = public as $$
  select distinct g.id, g.sport, g.start_at
  from games g
  join slate_games sg on sg.game_id = g.id
  join slates s on s.id = sg.slate_id
  where s.status <> 'draft'
    and not sg.voided
    and g.status not in ('final', 'cancelled')
    and g.start_at <= now() + interval '10 minutes'
    and g.start_at >= now() - interval '2 days';
$$;

-- (sport, bookmaker) pairs with an ATS slate still in draft.
create or replace function line_sync_targets()
returns table (sport text, bookmaker text)
language sql security definer stable set search_path = public as $$
  select distinct p.sport, p.settings->'lines'->>'bookmaker'
  from pools p
  join slates s on s.pool_id = p.id
  where s.status = 'draft' and p.settings->>'pick_type' = 'ats';
$$;

create or replace function invoke_edge_function(p_name text, p_body jsonb default '{}')
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
  if v_url is null or v_key is null then
    raise notice 'invoke_edge_function(%): vault secrets project_url / service_role_key not set', p_name;
    return;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/' || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := p_body,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function games_to_poll() from public, anon, authenticated;
revoke execute on function line_sync_targets() from public, anon, authenticated;
revoke execute on function invoke_edge_function(text, jsonb) from public, anon, authenticated;
grant execute on function games_to_poll() to service_role;
grant execute on function line_sync_targets() to service_role;

-- pg_cron runs in UTC. 11:00 UTC = 6:00 CDT / 5:00 CST.
select cron.schedule('sync-schedule', '0 11 * * *',   $$select public.invoke_edge_function('sync-schedule')$$);
select cron.schedule('sync-lines',    '0 */2 * * *',  $$select public.invoke_edge_function('sync-lines')$$);
-- The spec's 11:00–01:00 CT window is handled inside poll-scores: it returns
-- immediately (no ESPN call) when no slate game is live.
select cron.schedule('poll-scores',   '*/2 * * * *',  $$select public.invoke_edge_function('poll-scores')$$);
