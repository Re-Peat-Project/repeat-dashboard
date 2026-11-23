# repeat-dashboard

Static visual analytics dashboard for RE-PEAT. Vite, React, MapLibre, shadcn/ui on Tailwind. No server: every layer is a PMTiles, Parquet or CSV file.

Four sections, each with its state in the URL hash:

| Section | Route | What it shows |
|---|---|---|
| National profile | `#/`, `#/#fire-by-land-status`, `#/?v=water` | Fire map, KHG search, monthly hotspots and SiTMAT, followed by fire by land status. The Water Table Profile maps weekly station observations and compares regions by week. |
| KHG prioritisation | `#/priority` | The national prioritisation (rule of `repeat-national-final`): map by type, intervention or dimension; types; rank shift; weights; the ranked list. Weights and filters are in the query (`fw`, `fm`, `fh`, `fc`, `fa`, `fi`). The live scoring reproduces the pipeline at the pre-registered weights (`data-parity`, `tests/priority.test.ts`). |
| KHG profiles | `#/khg/<code>` (`?k2=<code>` compares) | Key figures, map, indicators, land status, fire by land tenure, time series and DMPG villages. The **Compare with** picker opens side-by-side profiles on the same page. |
| KHG table | `#/table` | KHG indicators, filters, CSV, fire trends and weekly SiTMAT water-table change sparklines. |

The Water Table Profile reads the same SiTMAT Parquet tables as the daily chart. It groups unflagged readings by station and week (Monday to Sunday), then gives each reporting station one vote. Hexagons show measured station medians. Contours interpolate only within the local station hull, with three or more stations in a radius of approximately 25 km. The KHG table shows median weekly changes from each station's first two observed weeks, with a minimum of three comparable stations per point.

The fire map's clustered rings sum detections from filtered monthly grid cells, with separate colours for high and medium confidence. This adapts the glyph approach used by [AGNI](https://github.com/danylaksono/apps/tree/main/agni) to the attributes in the national grid. Individual 2026 points are a separate map mode. The VIIRS seasonal chart uses 2015 as its initial full-year reference and lets readers select another year.

The per-KHG map tiles of the prioritisation (`khg_tiles/KHG.<code>.pmtiles`, about 390 MB) are read where the prioritisation dashboard publishes them (`tiles` in `priority_meta.json`), with CORS and range requests, so they do not count against this site's size.

The national fire map and the KHG working view share year, month, confidence and peat settings. The national land-status section has its own controls for reporting burned area and hotspots by concession, forest area and DMPG village, with filters for land basis, location, sensor and year. The working view provides the hotspot ledger and detailed tenure filters. Its Interventions mode animates canal flow and displays the pump-run budget and its unit costs. The development server provides model-run comparison at `#/dev/model-runs`.

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
.venv/Scripts/python.exe repeat-dashboard/pipeline/build_tenure.py                  # fire by land tenure, from `repeat-national-tenure`, `-dome`, `-water` (repeat-prioritisation)
.venv/Scripts/python.exe repeat-dashboard/pipeline/build_fire_summary.py            # national summary: burned area and hotspots by concession, forest area and DMPG, from `repeat-national-fire-tables`
.venv/Scripts/python.exe repeat-dashboard/pipeline/build_priority.py                # prioritisation, KHG profiles and KHG table, from `repeat-national-final` and `repeat-national-dashboard`
.venv/Scripts/python.exe repeat-dashboard/pipeline/build_national_fire_tiles.py      # national map layers: 2026 hotspot points (VIIRS, MODIS; last date in fire_tiles.json) and KLHK burned area 2015-2026, PMTiles via tippecanoe
```

Run the intersection builder after rebuilding hotspot points or replacing land inputs. Use `--khg CODE` repeatedly for a subset. It reads source polygons at their stored resolution, joins with `intersects`, and writes `khg/<code>/investigation/` with source paths and a cache fingerprint. A KHG without sub-KHG units is supported. These optional exports are independent of the profile and comparison pages.

### Refresh the national fire views

Use `repeat_common.fetch_firms_nrt` with `--extend <existing.gpkg>`, `--start <first day to refresh>`, `--end <last complete UTC day>` and `--output <staging.gpkg>`. This preserves the earlier archive and caches the new NASA FIRMS requests. Run `repeat_prioritisation.investigations.hotspot_splice --data <data-dir> --firms <staged MODIS NRT> --out <review-dir> --write --output <staged combined MODIS>` to build the KLH and FIRMS MODIS series. Verify coverage before promoting the inputs in `_data`.

Rebuild `build_national.py --steps grid,khgmonthly` for the national chart and KHG counts. Run `repeat-national-fire --config configs/examples/national_profile.yaml --force --no-rasters` and `repeat-national-fire-tables` with the same config before rebuilding `build_fire_summary.py` and `build_national_fire_tiles.py --hotspots-only`. The three dashboard builders accept `--out <dashboard-data>` for staging. Seed it with the existing national manifest, cache, burned-area tiles and tile metadata to reuse those outputs. A fresh `REPEAT_WORK` runs the tally without any existing tile cache.

In the National Profile, 2026 opens with MODIS. The VIIRS series uses Suomi-NPP, whose delivery ended on 2 November 2026. The month slider stops at the available month for the selected sensor and year.

UI checks: `npx vitest run --root .` (`npm test`; pass `--root .` on Windows when the shell reports the drive letter in lower case), `npm run build`, `node tests/navigation_check.mjs`, `node tests/priority_check.mjs`, `node tests/smoke.mjs`, `node tests/workspace_check.mjs` and `node tests/compare_maps_check.mjs` from `app/` with the dev server running.

Data verification: `.venv/Scripts/python.exe repeat-dashboard/pipeline/check_investigation.py --all` from the workspace root checks that original hotspot columns are unchanged and compares sampled licence IDs against the native source geometry.

Steps are cached by a hash of their source files; `--force` rebuilds. Layers, groundwater runs and the DEM zoom cap are set in `pipeline/layers.yaml`. Vector tiles are made with the `repeat-tippecanoe:2.79.0` Docker image (`repeat-prioritisation/tiles/Dockerfile`).

Files over 95 MB are rebuilt one zoom lower, so every file stays under GitHub's 100 MB limit.

## Deploy

```bash
cd app
npm run deploy                      # build, drop unreferenced data files, check size limits, write ../deploy/ (publishes nothing)
npm run deploy -- --out <new-dir>    # stage the release in a new directory
npm run deploy -- --publish pages   # replace the gh-pages branch of the remote with the site (asks first)
npm run deploy -- --publish netlify # netlify deploy --prod (run `npx netlify-cli login` once)
```

The site is built on this machine because the data comes from the workspace. The public package excludes the Investigation page and the national hypotheses exports. GitHub rejects files over 100 MB and a Pages site is limited to about 1 GB. The script fails on either and warns above 95 MB per file or 800 MB in total. The scripted Pages push uses a throwaway repository with one commit. Routing is hash based, so no rewrite rules are needed on either host.

The satellite basemap is Esri World Imagery (attribution is shown on the map); the light basemap is OpenFreeMap. Both are loaded by the visitor's browser and need internet.

## Layout

```
app/src/pages/       NationalProfile.tsx (National.tsx fire situation + Summary.tsx fire by land status), Priority.tsx, KhgProfile.tsx, KhgTable.tsx,
                     Khg.tsx (KHG workspace), Compare.tsx, Hypotheses.tsx
app/src/priority/    core.ts (CSV tables, labels, live scoring), render.ts (charts and panels), profileMap.ts, state.ts (weights, filters),
                     defs.gen.js (generated from repeat-prioritisation defs.js), priority.css (styles of these pages, scoped under .pz)
app/src/components/  ui/ (shadcn/ui), Header.tsx, Seg.tsx, LineChart.tsx, DataTable.tsx, FilterBar.tsx, Legend.tsx
app/src/lib/         data.ts (Parquet, manifests), map.ts, store.ts, i18n.ts
pipeline/            build_national.py, build_khg.py, build_all.py, build_priority.py, dem_tiles.py, layers.yaml
```
