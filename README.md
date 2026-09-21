# Flora

A static-first, mobile-first prototype for a seasonal food field guide.

## Run locally

From this directory, run any static file server, for example:

```sh
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

The homepage content is fully rendered in `index.html`; JavaScript only adds filtering and dialogs. Seasonal source data lives in `data/seasonal-produce.json`, with separate expected and observed signals so future Flora sightings can refine the baseline calendar.

Market flyer evidence lives in `data/market-observations.json`. Each retailer records its source type, URL, location, validity window and verification level. Market cards remain rendered in HTML so the weekly findings are available without JavaScript; JavaScript progressively adds retailer filtering.

## Information architecture

- `index.html` is a short, visual seasonal catalog.
- `produce/` holds static-first produce guides organized around Find, Eat and Grow. Black Mission figs is the first complete guide.
- `markets.html` holds the longer, source-labeled weekly market watch so the homepage stays focused.

## Live sightings

The Spot flow supports the iPhone camera and photo library. It can optionally capture the browser's current GPS position after an explicit tap. Before any upload, the browser redraws the image into a new JPEG, removing EXIF and other embedded metadata. Exact coordinates and photos stay private; public sightings expose only approved produce and place information.

Photo-first sightings may leave the food and price fields blank. The private analysis function returns a structured list of visible items, varieties, sign prices and any visibly printed market name, then fills those fields in the Spot sheet. Place entry also offers a small built-in market autocomplete. When GPS is explicitly added, Flora can query its own place directory for nearby suggestions; it does not send coordinates to OpenAI.

Raw sightings are readable only by their owner and Flora admins. Contributors can convert the anonymous session created during their first upload into a permanent email account, preserving the same user ID and all attached sightings. Submitting a reviewed sighting places it in an admin queue; only an admin can confirm or reject it.

The community feed reads `public_sightings`, a deliberately narrower view containing only approved produce labels, market, farm, price, date, and an optional coarse location. It excludes contributor IDs, email addresses, private photo paths, original photos, and exact coordinates. A multi-item analysis is reduced to the same public-safe item fields so each fruit in a photo can appear on its own guide.

## Accounts and review

`account.html` uses passwordless email authentication. If the visitor already has an anonymous upload session, Flora links the email identity to that user so their existing sightings stay attached. In Supabase Authentication settings, enable manual identity linking and add `https://rexfm.github.io/flora/account.html*` to the allowed redirect URLs.

`admin.html` is protected in the database as well as the interface. To make the first account an admin, sign in once and then use the Supabase SQL editor with the account email:

```sql
update public.profiles p
set role = 'admin'
from auth.users u
where p.id = u.id and lower(u.email) = lower('you@example.com');
```

Member-facing code cannot change roles or approve records. Row Level Security permits admins to read review photos and pending submissions, and the `review_sighting` function is the only app action that publishes or rejects a submission.

When an anonymous contributor enters an email that already belongs to a Flora account, the app creates a one-hour, single-use transfer claim and includes it in the secure email redirect. After the link signs that account in, a database function moves the anonymous session's sightings to the verified account. Merely knowing an email address is not enough to claim sightings.

The browser uses the public values in `scripts/config.js`. That publishable key is intentionally safe to ship in a website because access is enforced by Row Level Security. Never put a Supabase secret key or an OpenAI API key in that file.

If online sync is temporarily unavailable, the cleaned photo and sighting are retained in IndexedDB on that device.

## Supabase setup

1. Install the Supabase CLI and sign in: `brew install supabase/tap/supabase`, then `supabase login`.
2. In the Supabase dashboard, open **Authentication → Providers → Anonymous Sign-Ins** and enable anonymous sign-ins.
3. Link and deploy the database: `supabase link --project-ref aobkwekoygnldefipjpg`, then `supabase db push`.
4. Create an OpenAI API key at `platform.openai.com/api-keys`. Do not paste it into this repository. Add it directly with `supabase secrets set OPENAI_API_KEY=your_key_here`.
5. Deploy the private analysis function: `supabase functions deploy analyze-sighting`.

The first migration creates private photo storage, PostGIS-backed sightings, model analyses, an immutable aura ledger, and the initial request/bounty tables. Cash bounties are deliberately not exposed in the UI yet; money movement needs identity, disputes, refunds, and a Stripe Connect flow before launch.

The server function gives OpenAI a five-minute signed link to the metadata-free image and requests a structured produce identification. It does not send GPS coordinates. The OpenAI key and Supabase privileged key remain server-side.
