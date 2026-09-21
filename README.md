# JNS Quote & Invoice System

Quoting for a NSW landscaping business.

**Type an address. Add photos and a note. Get a price.**

- The **address** gives you the block — looked up in the NSW cadastre, measured
  from the real lot boundary, with the house outline subtracted.
- The **photos** give you the state of it — grass height, obstacles, slope and
  access, turned into the rate card's own multipliers.
- The **note** is you telling it what you know, in plain words.

Measurements and conditions are results, not a form to fill in. Both stay
correctable under "Adjust details".

## What the note can do

> "This one's overgrown, hasn't been done in a month. Customer wants the beds
> weeded, about an hour. Take the clippings. Dog in the backyard, gate code 1234."

| In the note | What happens |
|---|---|
| "overgrown" | Sets grass height to overgrown — **×1.6 on mowing and edging** |
| "wants the beds weeded" (no time) | Adds weeding, using the bed area already measured off the plan |
| "about an hour" | Charges **exactly one hour**, no multipliers — you already allowed for them |
| "take the clippings" | Adds green waste removal |
| "dog in the backyard, gate code 1234" | Goes on the quote's note, not the price |

**Your note outranks the photos.** You have seen the place; the model is
squinting at a picture. Where they disagree, the note wins — that rule is in the
prompt in `src/lib/assess/site.ts`.

A note on its own is enough. Photos are optional, and so is the note — but the
quote stays marked indicative until there is at least one of them.

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
npm test
npm run build
```

The address lookup, the pricing and the PDF need nothing configured — both NSW
services are public and free.

**Photo and note assessment needs a key.** Create `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Without it everything else still works; the app tells you the key is missing and
leaves conditions on the assumed defaults.

## The one rule

**The AI never picks the price.**

```
photo + address  →  model  →  structured facts + condition buckets
                                        ↓
                          src/lib/rate-card.ts  →  src/lib/pricing.ts  →  $
```

`src/lib/pricing.ts` is pure and deterministic: same inputs, same price, every
time. That is what makes a quote defensible when a customer queries it, and it
means you tune prices by editing one table instead of arguing with a prompt.

When steps 2 and 3 land, they fill in `SiteMeasurements` (how big) and
`SiteConditions` (how bad). They do not compute dollars.

## The CRM (mockup)

| Screen | What it shows |
|---|---|
| `/` | Today's run sheet, in driving order, with access notes and the day's value |
| `/schedule` | The round, three weeks out, Monday to Friday |
| `/customers` | Every customer by what they are worth per week |
| `/customers/[id]` | Properties, standing plans, and visit history with estimated vs actual |

**Visits are not stored.** Each customer has a *standing plan* — a start date and
a cycle — and the dates are computed from it (`src/lib/crm/schedule.ts`). Move
someone from fortnightly to weekly and every future visit moves with them, with
no re-entry and no rows to clean up. That is the difference between a round
scheduler that stays tidy and one that rots.

"Monthly" means every 28 days, not the same date each month: a round is
organised by weekday, and a true calendar month walks the visit across the week
and wrecks the routing.

Data comes from `src/lib/crm/seed.ts` and **is not real**. The rows follow the
schema in `supabase/migrations/`, so replacing that module with real queries is
the whole migration.

## Security & storing real data

**Right now nothing is exposed.** The app runs on localhost with mock data and
no database. The moment it is deployed with real customers in it, all of the
below applies.

### Three separate jobs

| | What it means | How |
|---|---|---|
| **Login** | Only you get in | Supabase Auth — email + password, or a magic link |
| **Saved** | Data survives a laptop dying | Supabase Postgres, not the browser |
| **Protected** | Nobody else can read it | Row Level Security, per `0002_auth_and_rls.sql` |

They are not the same thing, and a login screen alone gives you none of the
third.

### The Supabase trap

Supabase puts every table behind a public REST API. The **anon key is public** —
it is compiled into the JavaScript the browser downloads. The only thing
protecting your customer list is Row Level Security, and a table without it is
a table on the open internet.

`0002_auth_and_rls.sql` enables and *forces* RLS on all seven tables, restricts
them to signed-in staff on an allow-list, revokes the anon grants, and puts job
photos in a private bucket. Run it **before** the first real customer goes in.

`SUPABASE_SERVICE_ROLE_KEY` bypasses all of it. Server-side only, never with a
`NEXT_PUBLIC_` prefix.

### Two people (or more)

`staff` is an allow-list with two roles:

| Role | Can |
|---|---|
| `owner` | Everything, including adding staff and deleting records |
| `crew` | See customers and properties, do the work. No deletes, no staff changes |

**Saxon and his partner are both owners.** A two-person business has no useful
boundary between them. `crew` exists for a future hire — a new person cannot
delete a customer by accident.

Every customer, property, quote, invoice and job is stamped with who created it
and who last touched it, automatically. With two people, "did you already quote
Hope Street?" stops being a guess.

### Steps only you can do

1. Create a project at supabase.com. Copy the project URL, the anon key and the
   service role key into `.env.local`.
2. Run `0001_init.sql` then `0002_auth_and_rls.sql` in the SQL editor. Both are
   safe to re-run if one fails partway.
3. Authentication → Users → add yourself, then insert yourself into `staff` as
   `owner` from the SQL editor. Nobody can read anything until you do — that
   first insert has to come from the dashboard, which is why the `staff` table
   is the one table without `force row level security` on it.
4. Invite your partner: Authentication → Users → **Invite user**, their email.
   They set their own password from the emailed link — you never see it. Then
   add them to `staff` as `owner` too. An auth account on its own grants
   nothing.
5. To remove someone, set `active = false`. Don't delete the row — it is
   referenced by everything they ever touched.
6. Check what backups your plan includes. Free tiers generally do not include
   point-in-time recovery — if the data matters, that is worth paying for.

### Rules that hold regardless

- `.env.local` is gitignored. Keep it that way; never paste keys into chat,
  screenshots or commits.
- Deploy somewhere with HTTPS by default (Vercel does).
- Customer photos are pictures of people's homes. Private bucket, signed URLs,
  and a real answer to "how long do we keep these?".
- Don't write your own session handling. Use the library.

### Privacy law

You are storing names, addresses, phone numbers and photos of homes — personal
information under the *Privacy Act*.

Businesses under $3M turnover have historically been exempt. That exemption is
being wound back: it has already been removed for some sectors, and the
government has said it is progressing a broader repeal — but at the time of
writing the blanket removal is **direction, not law**, with no confirmed date.
Reporting on this is contradictory, so confirm your own position with the OAIC
or an adviser rather than trusting a blog.

Practically it does not change what you should do. Collect only what you need,
keep it behind a login, don't keep it forever, and be able to tell a customer
what you hold. That is most of the obligation anyway, and doing it now costs
far less than retrofitting it.

## Deploying

Vercel, and it is the right choice — Next.js is theirs, so the deploy is a git
push. Two things about it matter for this app specifically.

**The Hobby plan is not an option.** It is non-commercial use only, and Vercel
defines commercial as any deployment used for the financial gain of anyone
involved. Running the business on it breaks their terms. **Pro is $20 per
developer seat per month** — seats are for people who deploy, not people who
use the app, so a second owner who only uses it costs nothing.

**The 4.5 MB request body limit is an infrastructure cap.** No config raises it,
and going over returns a bare 413. Photo uploads are compressed in the browser
to a 3.5 MB total budget before they are sent (`src/app/quotes/new/page.tsx`),
with a clearer server-side check behind it.

Function duration is fine on Pro — up to 800s, against the 120s the assessment
route asks for. On Hobby it would not be.

### Order of operations

1. `git init`, commit, push to GitHub. **Vercel deploys from a repo — without
   one there is nothing to deploy.**
2. Import the repo on Vercel. It detects Next.js; no build config needed.
3. Add the environment variables in Vercel's dashboard (`ANTHROPIC_API_KEY`,
   the Supabase keys). `.env.local` is gitignored and does not travel.
4. Check `SUPABASE_SERVICE_ROLE_KEY` is **not** prefixed `NEXT_PUBLIC_`.

### One thing that changes in production

The property-lookup cache is in memory. Serverless functions are stateless and
short-lived, so it will hit far less often than it does locally — correctness is
unaffected, but expect more calls to the NSW services. If that becomes a
problem, cache lookups in Postgres instead; the cadastre does not change.

### What it costs to run

Vercel Pro $20/month, plus Supabase (free tier works, but paid is worth it for
backups). Call it $45/month before a line of business logic. Jobber is $55/month
fully featured — worth keeping in view.

## Where things are

| File | What it is |
|---|---|
| `src/lib/rate-card.ts` | **Every number that affects a price.** Start here. |
| `src/lib/property/lookup.ts` | Address → measurements. Orchestrates the services below. |
| `src/lib/property/site-model.ts` | **Every assumption about what is on a block.** |
| `src/lib/property/estimate-site.ts` | Plan → lawn, edges, paving. Pure and tested. |
| `src/lib/property/nsw.ts` | NSW address + cadastre clients. No API key needed. |
| `src/lib/property/buildings.ts` | OSM building footprints, best effort. |
| `src/lib/assess/site.ts` | Photos + note → conditions and extra work. The prompt lives here. |
| `src/lib/crm/schedule.ts` | The round: recurrence, run sheets, estimate-vs-actual. |
| `src/lib/crm/seed.ts` | **Mock CRM data.** Swap for real queries. |
| `src/lib/confidence.ts` | Why size confidence and condition confidence multiply. |
| `src/lib/business.ts` | ABN, contact details, GST registration, terms. **Fill this in.** |
| `src/lib/pricing.ts` | The engine. Pure functions, no I/O. |
| `src/lib/pricing.test.ts` | What the engine is supposed to do. |
| `src/lib/pdf/quote-document.tsx` | The quote PDF layout. |
| `src/app/quotes/new/page.tsx` | The form. Runs the same engine for live pricing. |
| `src/app/api/quote/pdf/route.ts` | POST a quote, get a PDF back. |
| `supabase/migrations/0001_init.sql` | Schema for steps 2–5. Not used yet. |

## Before you send one to a customer

1. `src/lib/business.ts` — ABN, phone, email, address.
2. `gstRegistered` — if you are **not** registered (under $75k turnover) set it
   to `false`. You must not charge GST, and the document becomes an "Invoice"
   rather than a "Tax invoice". The engine and the PDF both follow this flag.
3. Have a look at the seed productivity figures (below).

## The seed numbers are guesses

Every `unitsPerHour` in the rate card is an educated guess, not a measurement.
At $150/hr they price a standard 320 m² suburban mow-and-edge at about **$290
inc GST**, which is well above the usual Sydney mowing-round rate of $70–$120.

That is not necessarily wrong — $150/hr is a landscaping rate, not a mowing
rate — but it means one of these is true and you should decide which:

- $150/hr is for landscaping work, and mowing rounds need their own lower rate.
- The throughput figures are too slow and real jobs go faster than the seeds.
- The price is right and the market rate is what you are choosing to beat.

Log a few real jobs, compare against the estimate, and change the numbers.

## What the address lookup can and cannot know

`GET /api/property/lookup?address=5 Hope Street Penrith`

**Measured, and trustworthy:**

- The lot boundary, area and perimeter, from the NSW cadastre. Authoritative.
- The house outline, *when OpenStreetMap has it*. Roughly half the time in the
  test suburbs. Only buildings whose centroid falls inside the lot are counted,
  so the neighbours do not inflate the footprint.

**Assumed, and only as good as `site-model.ts`:**

- House size when OSM has no outline (32% site coverage).
- Driveway and paths (12% of the block).
- How much of the garden is bed rather than lawn (15%).
- How much of the boundary you actually edge (55% plus 25 m).

Confidence reflects which of those applied: **0.72** with a real footprint,
**0.52** without, less again for an odd-sized block or a fuzzy address match.
Below 0.60 the quote tells the customer you want to see the site first.

Weeding is deliberately **never** quoted from a plan — a lot boundary cannot see
garden beds, and guessed-area × guessed-rate produced a $254 line item on a test
quote. The bed area still comes off the lawn, so mowing stays right.

Lookups are cached in memory for an hour. Both public services rate-limit.

## Two kinds of confidence, and why they multiply

A quote can be wrong two independent ways: not knowing **how big** the job is,
and not knowing **how bad** it is. `src/lib/confidence.ts` multiplies them.

| | Size | Condition | Combined | Result |
|---|---|---|---|---|
| Address only | 0.72 | 0.45 assumed | **0.32** | Quoted as indicative |
| Address + good photos | 0.72 | 0.88 observed | **0.63** | Firm quote |

That is deliberate: **a plan alone cannot tell you what a lawn looks like
today**, so a photo-less quote always says so on the PDF. Photos are what turn
it into a number you can stand behind.

## Next steps

4. Drag the lawn polygon on an aerial to correct the estimate by hand.
5. Log actual minutes on every job, then fit the rate card to your own data.
   This is the part that compounds — and it is the only thing that turns the
   confidence figure from a label into a measured number.

### One licensing trap worth knowing now

Google Maps' terms forbid storing or caching their imagery, and forbid using
Maps content to train models. When step 4 derives lawn areas from aerials and
keeps them, use Mapbox, NSW Government imagery, or Nearmap — not Google.
