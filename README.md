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
