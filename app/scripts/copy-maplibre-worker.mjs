// MapLibre 6 loads its worker as a separate module that imports a shared chunk by relative name.
// Vite does not emit either file, so copy both next to the app.
import { copyFileSync, mkdirSync } from 'node:fs'
const from = 'node_modules/maplibre-gl/dist/'
const to = 'public/maplibre/'
mkdirSync(to, { recursive: true })
for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) copyFileSync(from + f, to + f)
