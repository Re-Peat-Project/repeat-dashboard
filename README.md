# repeat-dashboard

Static visual analytics dashboard for RE-PEAT, built for fire investigation: a national fire view of the 865 KHG and a workspace per KHG with four modes (Fire, Water, Land & accountability, Interventions). Vite, React, MapLibre. No server: every layer is a PMTiles or Parquet file read with HTTP range requests.

One fire filter (year, months, confidence, on peat) drives the map, charts and ledger on both pages. The workspace keeps every layer toggleable (DEM and groundwater rasters with legends, canals, blocks, licences, forest area, villages, burn footprint, hotspots); a mode only chooses which layers start on. The Land & accountability ledger counts hotspots per licence, forest area, village and DMPG village, and picking a row filters the map. The Land & accountability mode opens with fire by land tenure: 2026 hotspots per 100 km² of peat against the 2015 to 2025 mean over the same calendar window, for business licences, forest area without a licence and other land, with a DMPG split. The national page compares the profiled KHG. Compare KHG provides small-multiple maps and time series with shared scales.

## Run locally

```bash
cd app
npm install
npm run dev          # http://localhost:5173 ; the basemap needs internet
```

`npm run build` writes `app/dist/`; `npm run preview` serves it.

## Build the data

The data is built from the workspace (`_khg`, `_data`, `re-peat/reports`) with the project Python environment, and written to `app/public/data/` (not in git).

```bash
.venv/Scripts/python.exe repeat-dashboard/pipeline/build_national.py          # national tables, outlines, hotspot grid, SiTMAT
.venv/Scripts/python.exe repeat-dashboard/pipeline/build_all.py --all         # every KHG folder in _khg
.venv/Scripts/python.exe repeat-dashboard/pipeline/build_khg.py --khg 16.02.01 --steps raster,neraca
.venv/Scripts/python.exe repeat-dashboard/pipeline/build_investigation.py --all # exact hotspot/land intersections; cached
.venv/Scripts/python.exe repeat-dashboard/pipeline/build_tenure.py                  # fire by land tenure, from `repeat-national-tenure` (repeat-prioritisation)
```

Run the intersection builder after rebuilding hotspot points or replacing land inputs. Use `--khg CODE` repeatedly for a subset. It reads source polygons at their stored resolution, joins with `intersects`, and writes `khg/<code>/investigation/` with source paths and a cache fingerprint. A KHG without sub-KHG units is supported. These optional exports are independent of the profile and comparison pages.

UI checks: `npm test`, `npm run build`, `node tests/smoke.mjs`, `node tests/workspace_check.mjs` and `node tests/compare_maps_check.mjs` from `app/` with the dev server running.

Data verification: `.venv/Scripts/python.exe repeat-dashboard/pipeline/check_investigation.py --all` from the workspace root checks that original hotspot columns are unchanged and compares sampled licence IDs against the native source geometry.

Steps are cached by a hash of their source files; `--force` rebuilds. Layers, groundwater runs and the DEM zoom cap are set in `pipeline/layers.yaml`. Vector tiles are made with the `repeat-tippecanoe:2.79.0` Docker image (`repeat-prioritisation/tiles/Dockerfile`).

Files over 95 MB are rebuilt one zoom lower, so every file stays under GitHub's 100 MB limit.

## Deploy

```bash
cd app
npm run deploy                      # build, drop unreferenced data files, check size limits, write ../deploy/ (publishes nothing)
npm run deploy -- --publish pages   # replace the gh-pages branch of the remote with the site (asks first)
npm run deploy -- --publish netlify # netlify deploy --prod (run `npx netlify-cli login` once)
```

The site is built on this machine because the data comes from the workspace. GitHub rejects files over 100 MB and a Pages site is limited to about 1 GB; the script fails on either and warns above 95 MB per file or 800 MB in total. The Pages push uses a throwaway repository with one commit, so the branch carries no history of earlier uploads. Routing is hash based, so no rewrite rules are needed on either host.

The satellite basemap is Esri World Imagery (attribution is shown on the map); the light basemap is OpenFreeMap. Both are loaded by the visitor's browser and need internet.

## Layout

```
app/src/pages/       National.tsx (fire situation), Khg.tsx (investigation workspace), Compare.tsx
app/src/components/  LineChart.tsx, DataTable.tsx, FilterBar.tsx, Legend.tsx, Header.tsx
app/src/lib/         data.ts (Parquet, manifests), map.ts, store.ts, i18n.ts
pipeline/            build_national.py, build_khg.py, build_all.py, dem_tiles.py, layers.yaml
```
