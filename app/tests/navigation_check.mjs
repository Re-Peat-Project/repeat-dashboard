import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const base = process.argv[2] ?? 'http://127.0.0.1:5173/'
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().startsWith(base + 'data/')) errors.push(response.url())
    })
    await page.goto(base + '#/')
    await page.getByRole('heading', { name: 'Fire situation' }).waitFor()
    await page.getByRole('heading', { name: 'Fire by land status' }).waitFor()
    assert.equal(await page.getByRole('navigation').getByText('More', { exact: true }).count(), 0)
    const fireFilter = page.getByRole('group', { name: 'Fire filter' })
    const year = fireFilter.getByRole('slider', { name: 'Year', exact: true })
    const endMonth = fireFilter.getByRole('slider', { name: 'To', exact: true })
    const metadata = await (await page.request.get(base + 'data/national/fire_tiles.json')).json()
    const lastModisMonth = Number(metadata.hotspots.last.modis.slice(5, 7))
    await page.waitForFunction((month) => document.querySelector('input[aria-label="To"]')?.max === String(month), lastModisMonth)
    await endMonth.press('End')
    assert.equal(await endMonth.inputValue(), String(lastModisMonth))
    await page.waitForFunction(() => {
      const yearInput = document.querySelector('input[aria-label="Year"]')
      return yearInput && yearInput.min !== yearInput.max
    })
    await year.press('ArrowLeft')
    await page.waitForFunction(() => document.querySelector('input[aria-label="To"]')?.max === '12')
    await endMonth.press('End')
    assert.equal(await endMonth.inputValue(), '12')
    await year.press('ArrowRight')
    await page.waitForFunction((month) => document.querySelector('input[aria-label="To"]')?.value === String(month), lastModisMonth)
    await fireFilter.getByRole('button', { name: 'VIIRS S-NPP', exact: true }).click()
    await page.waitForFunction((month) => document.querySelector('input[aria-label="To"]')?.max === String(month), Number(metadata.hotspots.last.viirs.slice(5, 7)))
    await fireFilter.getByRole('button', { name: 'MODIS', exact: true }).click()

    await page.getByRole('textbox', { name: 'Search KHG', exact: true }).fill('16.02.01')
    await page.getByRole('table').first().getByRole('button').first().click()
    await page.getByRole('button', { name: 'Open the working view of this KHG' }).waitFor()
    assert.equal(await page.getByRole('heading', { name: /Fire by land tenure ·/ }).count(), 0)

    await page.getByRole('link', { name: 'Fire by land status' }).click()
    await page.waitForFunction(() => {
      const top = document.getElementById('land-status-title')?.getBoundingClientRect().top
      return top != null && top >= 0 && top < 240
    })
    const tenure = page.getByRole('region', { name: '2026 against earlier years, by land tenure' })
    await tenure.waitFor()
    const dot = tenure.getByRole('img').first()
    const { width: dotWidth, height: dotHeight } = await dot.boundingBox()
    assert.equal(dotWidth, dotHeight, 'tenure marker stays round')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, 'national page fits the viewport')

    await page.getByRole('button', { name: /Open the KHG profile/ }).click()
    const comparePicker = page.getByRole('button', { name: 'Compare with', exact: true })
    await comparePicker.click()
    await page.getByPlaceholder('KHG name, code or province').fill('14.10.03')
    await page.getByRole('option').first().click()
    await page.locator('#p-map2 canvas').waitFor()
    assert.equal(new URLSearchParams(page.url().split('?')[1]).get('k2'), '14.10.03')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, 'comparison fits the viewport')
    await page.reload()
    await page.locator('#p-map2 canvas').waitFor()
    await page.getByRole('button', { name: 'Clear', exact: true }).click()
    await page.locator('#p-map2').waitFor({ state: 'detached' })
    await page.locator('#p-map canvas').waitFor()
    if (width === 1440) {
      await page.goto(base + '#/compare')
      await comparePicker.waitFor()
      assert(page.url().endsWith('#/khg/16.02.01'))
      assert.equal(await page.getByText('Compare model runs', { exact: true }).count(), 0)
      assert.equal(await page.getByRole('tab', { name: 'Compare KHG' }).count(), 0)

      await page.goto(base + '#/khg/16.02.01?view=compare&mode=runs')
      await page.waitForURL((url) => url.hash === '#/khg/16.02.01')
      await comparePicker.waitFor()

      await page.goto(base + '#/khg/16.02.01?view=compare&k2=14.10.03')
      await page.waitForURL((url) => url.hash === '#/khg/16.02.01?k2=14.10.03')
      await page.locator('#p-map2 canvas').waitFor()

      await page.goto(base + '#/investigation')
      await page.getByRole('heading', { name: 'National profile' }).waitFor()
      assert(page.url().endsWith('#/'))
    }
    assert.deepEqual(errors, [])
    await page.close()
    console.log(`${width}px: national layout, KHG search and comparison passed`)
  }
} finally {
  await browser.close()
}
