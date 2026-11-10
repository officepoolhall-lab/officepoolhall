-- First-round tee time per golfer, for the golf home page's scroll when ESPN's live page
-- isn't used (the demo pool). Real events read tee times live from ESPN.
alter table golf_results add column if not exists tee_at timestamptz;
