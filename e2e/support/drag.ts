import { type Page } from '@playwright/test'
// Imported from core rather than restated per port: a system that retuned
// the fling threshold would no longer be the same pattern, so every
// registered system is paced against the one set of constants.
import { FLING_VELOCITY } from '../../core/index.js'

// Playwright dispatches each synthetic pointer event only a couple of
// milliseconds apart in real time. Left unpaced, even a drag meant to be
// "slow" reports an instantaneous velocity of several px/ms between two
// consecutive samples — comfortably past FLING_VELOCITY — and would trip the
// fling-dismiss path a distance-only test never intended to exercise.
// Deriving the pacing from FLING_VELOCITY itself (rather than a hardcoded
// duration) keeps "slow" and "fast" meaningfully apart regardless of the
// sheet's actual height, which differs between device projects.
export const SLOW_VELOCITY = FLING_VELOCITY / 3
// A wide margin, paired with few steps in the fast-fling test, so the gesture
// still lands comfortably past FLING_VELOCITY even if CI/parallel load
// stretches the requested per-step delay well beyond what was asked for — a
// few big jumps stay fast under that stretch, where many small ones would not.
export const FAST_VELOCITY = FLING_VELOCITY * 8

/**
 * Presses and drags the sheet down by `distance` px (without releasing),
 * paced to land at roughly `velocity` px/ms so the gesture's real elapsed
 * time — not just its pixel distance — matches what the caller means to
 * exercise. Split out from `dragSheet` so a test can assert on the
 * in-progress state before deciding whether/how to release.
 */
export async function beginDragSheet(page: Page, distance: number, velocity: number, steps = 12): Promise<void> {
  const box = (await page.locator('[data-tz-sheet]').boundingBox())!
  const startX = box.x + box.width / 2
  const startY = box.y + 20
  const stepDelayMs = distance / velocity / steps

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(startX, startY + (distance * i) / steps)
    await page.waitForTimeout(stepDelayMs)
  }
}

/** `beginDragSheet` followed immediately by a release. */
export async function dragSheet(page: Page, distance: number, velocity: number, steps = 12): Promise<void> {
  await beginDragSheet(page, distance, velocity, steps)
  await page.mouse.up()
}

/** Swipes upward from the centre of the trigger by `distance` px and releases. */
export async function swipeUpOnTrigger(page: Page, distance: number, steps = 8): Promise<void> {
  const box = (await page.locator('[data-tz-trigger]').boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2

  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i += 1) await page.mouse.move(x, y - (distance * i) / steps)
  await page.mouse.up()
}
