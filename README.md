# Flora

A static-first, mobile-first prototype for a seasonal food field guide.

## Run locally

From this directory, run any static file server, for example:

```sh
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

The homepage content is fully rendered in `index.html`; JavaScript only adds filtering and dialogs. Seasonal source data lives in `data/seasonal-produce.json`, with separate expected and observed signals so future Flora sightings can refine the baseline calendar.
