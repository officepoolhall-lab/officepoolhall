-- §6.1 close job: open → locked every 5 minutes. Per-game locking itself needs no job.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('close-slates', '*/5 * * * *', $$select public.close_slates()$$);
