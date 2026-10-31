// Build the site, drop everything the pages do not reference, check the size limits, and optionally publish.
//
//   node scripts/deploy.mjs                       build + prune + budget report; writes ../deploy/ (nothing leaves this machine)
//   node scripts/deploy.mjs --publish pages       push ../deploy/ to the gh-pages branch of the remote (asks first; --yes to skip the question)
//   node scripts/deploy.mjs --publish netlify     netlify deploy --prod from ../deploy/ (needs `netlify login`; --site <id> optional)
//   options: --skip-build  --remote <url>  --branch gh-pages
//
// Limits: GitHub rejects a file over 100 MB and a Pages site is limited to about 1 GB. Files over 95 MB, or a total over 800 MB, are reported.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'

const here = dirname(fileURLToPath(import.meta.url))
const app = resolve(here, '..')
const repo = resolve(app, '..')
const dist = join(app, 'dist')
const out = join(repo, 'deploy')
const args = process.argv.slice(2)
const flag = (n) => args.includes(`--${n}`)
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d }
const MB = 1e6
const run = (cmd, a, cwd, inherit = true) => { const r = spawnSync(cmd, a, { cwd, stdio: inherit ? 'inherit' : 'pipe', shell: process.platform === 'win32', encoding: 'utf8' }); if (r.status !== 0) { console.error(`failed: ${cmd} ${a.join(' ')}\n${r.stderr ?? ''}`); process.exit(1) } return r.stdout }

// 1. build
if (!flag('skip-build')) run('npm', ['run', 'build'], app)
if (!existsSync(join(dist, 'index.html'))) { console.error('app/dist/index.html is missing: run without --skip-build'); process.exit(1) }

// 2. copy to deploy/ and keep only the data files the manifests reference
rmSync(out, { recursive: true, force: true })
cpSync(dist, out, { recursive: true })
const data = join(out, 'data')
const json = (p) => JSON.parse(readFileSync(p, 'utf8'))
const keep = new Set(['catalog.json', 'national/manifest.json', 'national/report.json'])
for (const k of json(join(data, 'catalog.json'))) {
  const base = `khg/${k.code}`
  keep.add(`${base}/manifest.json`)
  const m = json(join(data, base, 'manifest.json'))
  for (const name of ['sources.json', 'hotspots.parquet']) {
    const path = `${base}/investigation/${name}`
    if (existsSync(join(data, path))) keep.add(path)
  }
  for (const sec of ['vector', 'raster', 'tables', 'points']) for (const e of m[sec] ?? []) keep.add(`${base}/${e.file}`)
  for (const g of m.groundwater ?? []) for (const e of [...(g.files ?? []), ...(g.rasters ?? [])]) keep.add(`${base}/${e.file}`)
}
const nm = json(join(data, 'national', 'manifest.json'))
for (const e of [...(nm.tables ?? []), ...(nm.files ?? [])]) keep.add(`national/${e.file}`)

const files = []
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.push(p) } }
walk(data)
let dropped = 0, droppedBytes = 0
for (const p of files) {
  const rel = relative(data, p).replaceAll('\\', '/')
  if (!keep.has(rel)) { droppedBytes += statSync(p).size; dropped++; rmSync(p) }
}
// remove empty folders
const prune = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { prune(p); if (!readdirSync(p).length) rmSync(p, { recursive: true }) } } }
prune(data)
writeFileSync(join(out, '.nojekyll'), '')
console.log(`pruned ${dropped} unreferenced files (${(droppedBytes / MB).toFixed(1)} MB: build caches, logs, orphan tiles)`)

// 3. size budget
const sizes = []
const walk2 = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk2(p) : sizes.push([relative(out, p).replaceAll('\\', '/'), statSync(p).size]) } }
walk2(out)
const total = sizes.reduce((a, [, s]) => a + s, 0)
sizes.sort((a, b) => b[1] - a[1])
console.log(`\nsite size ${(total / MB).toFixed(0)} MB in ${sizes.length} files; largest:`)
for (const [p, s] of sizes.slice(0, 8)) console.log(`  ${(s / MB).toFixed(1).padStart(7)} MB  ${p}`)
const perKhg = {}
for (const [p, s] of sizes) { const m = /^data\/khg\/([^/]+)\//.exec(p); if (m) perKhg[m[1]] = (perKhg[m[1]] ?? 0) + s }
console.log('per KHG (MB): ' + Object.entries(perKhg).map(([k, s]) => `${k} ${(s / MB).toFixed(0)}`).join(', '))
const over = sizes.filter(([, s]) => s > 100 * MB)
const near = sizes.filter(([, s]) => s > 95 * MB && s <= 100 * MB)
if (over.length) { console.error(`\nFAIL: ${over.length} file(s) over 100 MB (GitHub rejects them):\n` + over.map(([p, s]) => `  ${(s / MB).toFixed(1)} MB ${p}`).join('\n')); process.exit(1) }
if (total > 1000 * MB) { console.error(`\nFAIL: site is ${(total / MB).toFixed(0)} MB, over the 1 GB limit of a Pages site. Lower the zoom cap in pipeline/layers.yaml or host the data elsewhere.`); process.exit(1) }
if (near.length) console.warn(`\nwarning: ${near.length} file(s) between 95 and 100 MB`)
if (total > 800 * MB) console.warn(`\nwarning: site is over 800 MB (limit 1 GB)`)
console.log(`\nbudget ok. Site written to ${out}`)

// 4. publish
const target = opt('publish')
if (!target) { console.log('Nothing published. Use --publish pages or --publish netlify.'); process.exit(0) }
const confirm = async (q) => { if (flag('yes')) return true; const rl = createInterface({ input: process.stdin, output: process.stdout }); const a = (await rl.question(`${q} [y/N] `)).trim().toLowerCase(); rl.close(); return a === 'y' }

if (target === 'pages') {
  const remote = opt('remote') ?? run('git', ['remote', 'get-url', 'origin'], repo, false).trim()
  const branch = opt('branch', 'gh-pages')
  if (!await confirm(`Replace branch ${branch} of ${remote} with this ${(total / MB).toFixed(0)} MB site?`)) { console.log('Cancelled.'); process.exit(0) }
  // a throwaway repository holds one commit, so the branch carries no history of earlier uploads
  const tmp = mkdtempSync(join(tmpdir(), 'repeat-pages-'))
  cpSync(out, tmp, { recursive: true })
  run('git', ['init', '-q', '-b', branch], tmp)
  run('git', ['add', '-A'], tmp)
  run('git', ['commit', '-q', '-m', `Site-${new Date().toISOString().slice(0, 10)}`], tmp)
  run('git', ['push', '--force', remote, `${branch}:${branch}`], tmp)
  rmSync(tmp, { recursive: true, force: true })
  console.log(`Pushed to ${branch}. Enable Pages for that branch in the repository settings.`)
} else if (target === 'netlify') {
  if (!await confirm(`Deploy ${(total / MB).toFixed(0)} MB to Netlify production?`)) { console.log('Cancelled.'); process.exit(0) }
  const site = opt('site')
  run('npx', ['--yes', 'netlify-cli', 'deploy', '--dir', out, '--prod', ...(site ? ['--site', site] : [])], repo)
} else { console.error(`unknown target ${target}`); process.exit(1) }
