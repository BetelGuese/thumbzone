import { test, expect } from '@playwright/test'

const MIN_HIT_TARGET = 48

test.describe('trigger', () => {
  test('is horizontally centred at the bottom of the viewport', async ({ page }) => {
    await page.goto('/demo/vanilla')
    const trigger = page.locator('[data-tz-trigger]')
    await expect(trigger).toBeVisible()

    const box = (await trigger.boundingBox())!
    const viewport = page.viewportSize()!
    const triggerCentre = box.x + box.width / 2
    expect(Math.abs(triggerCentre - viewport.width / 2)).toBeLessThanOrEqual(1)
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
    expect(box.y).toBeGreaterThan(viewport.height / 2)
  })

  test('meets the minimum hit target', async ({ page }) => {
    await page.goto('/demo/vanilla')
    const box = (await page.locator('[data-tz-trigger]').boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(MIN_HIT_TARGET)
    expect(box.height).toBeGreaterThanOrEqual(MIN_HIT_TARGET)
  })

  test('is hidden at desktop widths', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 })
    await page.goto('/demo/vanilla')
    await expect(page.locator('[data-tz-trigger]')).toBeHidden()
  })

  test('has an accessible name and reports collapsed state', async ({ page }) => {
    await page.goto('/demo/vanilla')
    const trigger = page.locator('[data-tz-trigger]')
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(trigger).toHaveAccessibleName(/menu/i)
  })
})
