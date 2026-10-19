-- Report form submissions: one row per submission ID. Run once in the Supabase dashboard: SQL Editor > New query.
-- The columns match js/data/report-form.js ("columns"); the app server writes them and nothing else.
--
-- Access: row level security is ON and there are NO policies, and the anon / authenticated roles have no privileges,
-- so the browser-side (publishable / anon) key can neither read nor write this table. Only the app server can, with
-- the project's secret key (server/.env), which never leaves the server.

create table if not exists public.report_submissions (
  submission_id        uuid primary key,                       -- made by the browser before sending; a retry reuses it
  submitted_at         timestamptz not null,                   -- set by the app server (UTC)
  full_name            text not null check (char_length(full_name) between 2 and 100),
  email                text not null check (char_length(email) between 3 and 254 and position('@' in email) > 1),
  profession_role      text not null check (profession_role in ('Acoustic Consultant / Engineer', 'Architect', 'Interior Designer',
                         'Contractor / Installer', 'Manufacturer / Supplier', 'Student / Researcher', 'Other')),
  organization         text check (char_length(organization) <= 120),
  country              text not null check (char_length(country) <= 80),
  purpose              text not null check (purpose in ('Acoustic assessment', 'Room design', 'Product / treatment selection',
                         'Existing-room improvement', 'Educational / research use', 'Other')),
  feedback             text check (char_length(feedback) <= 1000),
  consent_given        boolean not null check (consent_given),  -- the form cannot be sent without it
  consent_recorded_at  timestamptz not null,
  marketing_consent    boolean not null default false,         -- separate and optional
  project_id           text not null check (char_length(project_id) <= 64),
  project_name         text check (char_length(project_name) <= 120),
  room_type            text check (char_length(room_type) <= 80),
  room_volume_m3       numeric(12, 1),
  target_rt60_s        numeric(6, 2),
  measured_rt60_s      numeric(6, 2),                          -- RT60 at 1000 Hz, the reference band (decides a take's validity)
  measured_rt60_avg_s  numeric(6, 2),                          -- the room's average RT60, mean of 125–4000 Hz (app 2026.10.15 on; before: 500–2000 Hz)
  measurement_method   text check (char_length(measurement_method) <= 40),
  predicted_rt60_s     numeric(6, 2),                          -- predicted RT60 at 1000 Hz
  predicted_rt60_avg_s numeric(6, 2),                          -- predicted average RT60, mean of 125–4000 Hz (the app's predicted value)
  treatment_status     text not null check (treatment_status in ('No treatment', 'Not selected', 'Planned', 'Predicted', 'Measured after treatment')),
  app_version          text check (char_length(app_version) <= 40),
  custom_materials     jsonb                                    -- materials typed in on Room Setup: [{kind, surface, name, notes}]
);

-- Columns added after the table was first created. Running this whole file again adds them to an existing table and
-- changes nothing else (every statement here can be repeated).
alter table public.report_submissions add column if not exists measured_rt60_avg_s numeric(6, 2);
alter table public.report_submissions add column if not exists predicted_rt60_avg_s numeric(6, 2);
-- Materials typed in on Room Setup ("Other / not listed"): [{kind, surface, name, notes}], validated by the app server.
alter table public.report_submissions add column if not exists custom_materials jsonb;

comment on table public.report_submissions is 'Report form submissions from the Acoustic Measurement app. Written only by the app server (secret key).';

alter table public.report_submissions enable row level security;
-- No policies on purpose: with RLS on, no row is visible or writable through the anon / authenticated roles.
revoke all on table public.report_submissions from anon, authenticated;
-- The app server (secret key = service_role) only ever adds rows and looks one up by its submission ID.
grant select, insert on table public.report_submissions to service_role;

create index if not exists report_submissions_submitted_at on public.report_submissions (submitted_at desc);
create index if not exists report_submissions_project_id on public.report_submissions (project_id);

-- ---------------------------------------------------------------------------------------------------------------------
-- Review of materials typed in by users, for the shared library. Only people with access to this Supabase project (the
-- dashboard or the secret key) can read or change these: row level security is on and there are no policies, so the
-- anon and authenticated roles see nothing. The app never reads them; an approved material reaches the app's library
-- only in a later release, once its acoustic data is sourced (js/data/materials.js). Nothing here is an acoustic value.
--
-- How to review: open the view public.custom_material_queue (most used first), then record a decision with
--   insert into public.material_reviews (name_key, kind, surface, status, reviewer, note)
--   values ('hempcrete blocks', 'construction', 'wall', 'approved', 'your name', 'source: …')
--   on conflict (name_key, kind, surface) do update set status = excluded.status, reviewer = excluded.reviewer,
--     note = excluded.note, reviewed_at = now();
create table if not exists public.material_reviews (
  name_key     text not null check (char_length(name_key) between 2 and 80),  -- lower-case name, spaces collapsed
  kind         text not null check (kind in ('construction', 'finish')),
  surface      text not null check (surface in ('wall', 'floor', 'ceiling')),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer     text check (char_length(reviewer) <= 120),
  note         text check (char_length(note) <= 1000),
  reviewed_at  timestamptz not null default now(),
  primary key (name_key, kind, surface)
);
comment on table public.material_reviews is 'Decisions on materials typed in by users (approved for the library, rejected). Admin only.';
alter table public.material_reviews enable row level security;
-- No policies on purpose: with RLS on, no row is visible or writable through the anon / authenticated roles.

-- Every material typed in, counted across submissions (each submission once), with its review status.
create or replace view public.custom_material_queue with (security_invoker = true) as
  select lower(regexp_replace(trim(m->>'name'), '\s+', ' ', 'g')) as name_key,
         m->>'kind' as kind,
         m->>'surface' as surface,
         min(m->>'name') as example_name,
         count(distinct s.submission_id) as submissions,
         min(s.submitted_at) as first_seen,
         max(s.submitted_at) as last_seen,
         (array_agg(nullif(m->>'notes', '') order by s.submitted_at desc) filter (where nullif(m->>'notes', '') is not null))[1:5] as recent_notes,
         coalesce(r.status, 'pending') as status,
         r.reviewer, r.reviewed_at
  from public.report_submissions s
  cross join lateral jsonb_array_elements(coalesce(s.custom_materials, '[]'::jsonb)) as m
  left join public.material_reviews r
    on r.name_key = lower(regexp_replace(trim(m->>'name'), '\s+', ' ', 'g')) and r.kind = m->>'kind' and r.surface = m->>'surface'
  group by 1, 2, 3, r.status, r.reviewer, r.reviewed_at
  order by submissions desc, last_seen desc;
comment on view public.custom_material_queue is 'Materials typed in by users, most used first, with their review status. Admin only (security_invoker: the caller''s own access applies).';
revoke all on public.custom_material_queue from anon, authenticated;
revoke all on public.material_reviews from anon, authenticated;
