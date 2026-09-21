-- JNS quoting & invoicing — initial schema.
--
-- Step 1 does not need a database: the form and the PDF run with no environment
-- configured at all. This migration exists so steps 2 to 5 have somewhere to
-- land, and so the shape is decided before there is data to migrate.
--
-- Money is stored in CENTS as integers. Never floats.
-- Dates that represent a calendar day are DATE, in Australia/Sydney terms.

create extension if not exists postgis;

create table customers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  email        text,
  phone        text,
  billing_address text,
  created_at   timestamptz not null default now()
);

create table properties (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid references customers (id) on delete cascade,
  address_line  text not null,
  suburb        text not null,
  state         text not null default 'NSW',
  postcode      text,

  -- Step 2/4: geocode + the parcel polygon straight off the NSW cadastre.
  location      geography (point, 4326),
  parcel        geography (polygon, 4326),
  -- The lawn polygons you drag on the aerial. Area is derived, but cached here
  -- so a quote can be reproduced exactly as it was priced.
  lawn_areas    geography (multipolygon, 4326),

  lawn_area_m2     numeric(10, 2),
  edge_metres      numeric(10, 2),
  hard_surface_m2  numeric(10, 2),
  access_notes     text,
  created_at    timestamptz not null default now()
);

create index properties_location_idx on properties using gist (location);

create table quotes (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique,
  customer_id   uuid not null references customers (id) on delete restrict,
  property_id   uuid not null references properties (id) on delete restrict,
  status        text not null default 'draft'
                  check (status in ('draft', 'sent', 'accepted', 'declined', 'expired')),
  issued_date   date not null,
  valid_until   date not null,

  -- The full request + result, exactly as priced. If you change the rate card
  -- later, an old quote still explains itself.
  request       jsonb not null,
  estimate      jsonb not null,
  rate_card     jsonb not null,

  needs_site_visit boolean not null default false,
  accepted_option  text,
  created_at    timestamptz not null default now()
);

create index quotes_customer_idx on quotes (customer_id);
create index quotes_status_idx on quotes (status);

-- Step 3: the photos a quote was based on, and what the model made of them.
create table quote_photos (
  id           uuid primary key default gen_random_uuid(),
  quote_id     uuid not null references quotes (id) on delete cascade,
  storage_path text not null,
  taken_at     timestamptz,
  assessment   jsonb,
  created_at   timestamptz not null default now()
);

create table invoices (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique,
  quote_id      uuid references quotes (id) on delete set null,
  customer_id   uuid not null references customers (id) on delete restrict,
  status        text not null default 'draft'
                  check (status in ('draft', 'sent', 'paid', 'overdue', 'void')),
  issued_date   date not null,
  due_date      date not null,
  subtotal_cents integer not null,
  gst_cents      integer not null,
  total_cents    integer not null,
  paid_at       timestamptz,
  xero_id       text,
  created_at    timestamptz not null default now()
);

create table invoice_items (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references invoices (id) on delete cascade,
  sort          integer not null default 0,
  description   text not null,
  quantity      numeric(10, 2),
  unit          text,
  amount_cents  integer not null
);

-- Step 5: the feedback loop. Every completed job records what it ACTUALLY took,
-- next to what the engine predicted. After 50-odd rows you can fit the rate card
-- to your own data instead of the seed guesses.
create table jobs (
  id                uuid primary key default gen_random_uuid(),
  quote_id          uuid references quotes (id) on delete set null,
  property_id       uuid not null references properties (id) on delete restrict,
  scheduled_for     date,
  completed_at      timestamptz,
  estimated_minutes numeric(10, 2),
  actual_minutes    numeric(10, 2),
  invoice_id        uuid references invoices (id) on delete set null,
  crew_notes        text,
  created_at        timestamptz not null default now()
);

create index jobs_property_idx on jobs (property_id);
