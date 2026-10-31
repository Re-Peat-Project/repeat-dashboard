// National fire view and the KHG investigation workspace: modes, filters, ledger, legends. Needs the dev server on :5173.
import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/data/')) errors.push(`${r.status()} ${r.url()}`) })
await mkdir('tests/screenshots', { recursive: true })
const count = async () => Number((await page.locator('[role=group] .font-semibold').first().innerText()).replace(/\D/g, ''))

await page.goto('http://127.0.0.1:5173/#/')
await page.waitForFunction(() => document.querySelectorAll('table tbody tr').length > 10, { timeout: 30000 })
await page.waitForFunction(() => /[1-9]/.test(document.querySelector('[role=group] .font-semibold')?.textContent ?? ''), { timeout: 30000 })
const nat = await count()
assert(nat > 0, 'national count')
await page.waitForTimeout(5000)
await page.screenshot({ path: 'tests/screenshots/national.png' })
assert(!(await page.locator('text=Ranking').count()), 'no ranking panel')
await page.getByRole('button', { name: 'Medium + high' }).click()
assert((await count()) > nat, 'medium + high adds detections')
await page.getByRole('button', { name: 'High confidence' }).click()

await page.goto('http://127.0.0.1:5173/#/khg/16.02.01')
await page.waitForFunction(() => document.querySelector('[data-ready=true]'), { timeout: 30000 })
await page.waitForFunction(() => document.querySelectorAll('svg[role=img]').length > 0, { timeout: 30000 })
const fireN = await count()
assert(fireN > 0, 'khg hotspots')
await page.waitForTimeout(5000)
await page.screenshot({ path: 'tests/screenshots/khg-fire.png' })

await page.getByRole('tab', { name: 'Water' }).click()
await page.waitForTimeout(1500)
await page.waitForTimeout(5000)
await page.screenshot({ path: 'tests/screenshots/khg-water.png' })

await page.getByRole('tab', { name: 'Land & accountability' }).click()
await page.locator('table tbody tr').first().waitFor({ timeout: 20000 })
const total = await count()
await page.locator('table tbody tr').first().click()
assert((await count()) <= total, 'ledger filter')
await page.waitForTimeout(5000)
await page.screenshot({ path: 'tests/screenshots/khg-land.png' })

await page.getByRole('tab', { name: 'Interventions' }).click()
await page.waitForTimeout(800)
await page.waitForTimeout(5000)
await page.screenshot({ path: 'tests/screenshots/khg-action.png' })

// forest layer and time sliders
assert(await page.getByText('Forest area function (Kawasan Hutan)').count(), 'forest layer listed')
assert((await page.locator('[role=group] input[type=range]').count()) === 3, 'year slider and two month thumbs')
await page.getByRole('tab', { name: 'Fire' }).click()
await page.getByRole('button', { name: 'Repeat burns' }).click()
await page.waitForTimeout(1500)
// raster legend
await page.getByLabel('Map layer').selectOption('relief')
await page.waitForTimeout(800)
assert(await page.getByText('Elevation (m)').count(), 'relief legend')
await page.waitForTimeout(5000)
await page.screenshot({ path: 'tests/screenshots/khg-relief.png' })

console.log(JSON.stringify({ national: nat, khg: fireN, errors }))
await browser.close()
assert.deepEqual(errors, [])
