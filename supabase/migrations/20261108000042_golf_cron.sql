-- Schedule the PGA season import. Runs every 10 minutes; it only fetches events that
-- aren't final and are within about 8 days of their start.
select cron.schedule('poll-golf', '*/10 * * * *', $$select public.invoke_edge_function('poll-golf')$$);
