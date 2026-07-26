# 🔥 WildGuard AI — Wildfire Risk Command

A real-time wildfire threat dashboard. Enter local temperature, humidity, wind speed
and vegetation dryness (NDVI) for any location, and WildGuard AI scores fire risk,
plots a 24-hour danger curve, pulls live NASA FIRMS satellite hotspots within 400 km,
and hands out a field operations checklist tuned to the risk level.

## What's in this build

- **New command-center UI** — dark charcoal ground, ember/amber/ranger-green/alert-red
  risk states, Oswald + Inter + JetBrains Mono type system, a signature radar-style
  Fire Threat gauge with an animated scan sweep.
- **Live location search** — type a place name, get suggestions from OpenStreetMap
  Nominatim, jump the map straight there.
- **Dark satellite map (Leaflet + CartoDB)** — your assessment point plus live NASA
  VIIRS hotspot markers with popups.
- **Four linked charts (Chart.js)** — 24-hour risk curve, contributing factors,
  factor share, and an ember scatter field.
- **Auto-generated field checklist** — precaution list regenerates with the risk level.
- Fully responsive, keyboard-focusable, and respects `prefers-reduced-motion`.

The backend (`app.py`) is unchanged in logic — only the template and static assets
are new — so your existing `/api/analyze` contract still works.

## Project structure

```
WildGuard_AI/
├── app.py                 # Flask app + fire-threat model
├── wsgi.py                 # gunicorn entrypoint
├── requirements.txt
├── render.yaml              # Render.com deploy config
├── Dockerfile
├── templates/
│   └── index.html           # new dashboard UI
└── static/
    ├── css/style.css        # design system
    └── js/main.js            # map, gauge, charts, geocoding, API calls
```

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py                     # http://localhost:5000
```

## Deploy

**Render.com** (uses `render.yaml`):
1. Push this repo to GitHub.
2. In Render, "New +" → "Blueprint" → point at the repo. It reads `render.yaml`
   automatically (`gunicorn wsgi:app`).
3. Set a real `SECRET_KEY` environment variable in the Render dashboard — don't
   ship the placeholder in `app.py` to production.

**Docker** (any host — Fly.io, Railway, a VPS, etc.):
```bash
docker build -t wildguard-ai .
docker run -p 5000:5000 -e SECRET_KEY=$(openssl rand -hex 32) wildguard-ai
```

## Notes

- `requirements.txt` was trimmed to what the Flask app actually imports
  (`Flask`, `requests`, `gunicorn`, `flask-talisman`). If your notebook
  (`WildGuard_AI.ipynb`) trains a model with pandas/scikit-learn/xgboost, keep
  those in a separate `requirements-notebook.txt` so the web service stays
  light and fast to build.
- The app falls back to synthetic hotspot points if the NASA FIRMS feed is
  unreachable, so the dashboard never shows an empty map.
