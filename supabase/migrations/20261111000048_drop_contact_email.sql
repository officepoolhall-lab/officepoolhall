-- The commissioner's per-pool contact email (20261111000045) isn't used: rosters show the
-- email each person signs in with. Remove the column.
alter table pool_members drop constraint if exists pool_members_contact_email_check;
alter table pool_members drop column if exists contact_email;
