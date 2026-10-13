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
  measured_rt60_s      numeric(6, 2),
  measurement_method   text check (char_length(measurement_method) <= 40),
  predicted_rt60_s     numeric(6, 2),
  treatment_status     text not null check (treatment_status in ('No treatment', 'Not selected', 'Planned', 'Predicted', 'Measured after treatment')),
  app_version          text check (char_length(app_version) <= 40)
);

comment on table public.report_submissions is 'Report form submissions from the Acoustic Measurement app. Written only by the app server (secret key).';

alter table public.report_submissions enable row level security;
-- No policies on purpose: with RLS on, no row is visible or writable through the anon / authenticated roles.
revoke all on table public.report_submissions from anon, authenticated;
-- The app server (secret key = service_role) only ever adds rows and looks one up by its submission ID.
grant select, insert on table public.report_submissions to service_role;

create index if not exists report_submissions_submitted_at on public.report_submissions (submitted_at desc);
create index if not exists report_submissions_project_id on public.report_submissions (project_id);
