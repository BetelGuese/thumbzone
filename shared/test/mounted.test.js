import { test, expect, beforeEach, vi } from 'vitest'

/**
 * The latch is module state by design — a page has one of these — so each test
 * takes a fresh copy of the module rather than a reset function the production
 * code would otherwise have to carry for the tests' benefit alone.
 */
async function freshLatch() {
  vi.resetModules()
  return await import('../react/mounted.ts')
}

let latch
beforeEach(async () => {
  latch = await freshLatch()
})

test('a waiter registered before the mark is released by it', async () => {
  let released = false
  const waiting = latch.whenMounted().then(() => {
    released = true
  })
  // Nothing has marked yet, so a turn of the microtask queue must not release it.
  await Promise.resolve()
  expect(released).toBe(false)
  latch.markMounted()
  await waiting
  expect(released).toBe(true)
})

test('a waiter registered after the mark resolves without another mark', async () => {
  latch.markMounted()
  await expect(latch.whenMounted()).resolves.toBeUndefined()
})

test('every pending waiter is released, not just the first', async () => {
  const order = []
  const all = [
    latch.whenMounted().then(() => order.push('a')),
    latch.whenMounted().then(() => order.push('b')),
    latch.whenMounted().then(() => order.push('c')),
  ]
  latch.markMounted()
  await Promise.all(all)
  expect(order).toEqual(['a', 'b', 'c'])
})

test('marking twice releases each waiter once and does not throw', async () => {
  let releases = 0
  const waiting = latch.whenMounted().then(() => {
    releases += 1
  })
  latch.markMounted()
  latch.markMounted()
  await waiting
  await Promise.resolve()
  expect(releases).toBe(1)
})

test('a waiter registered from inside a release callback does not hang', async () => {
  // `markMounted()` sets `mounted = true` and drains `waiting` synchronously,
  // in the same tick, so every `.then()` callback below only runs once both
  // have already happened — their relative order inside that tick doesn't
  // matter, only that both finish before any callback gets a turn. Deferring
  // the `mounted = true` assignment into a microtask that runs *after* the
  // resolve calls breaks that: the reentrant `whenMounted()` below then finds
  // `mounted` still false, joins a `waiting` array that was already spliced
  // and will never be drained again, and hangs forever. That deferral — not
  // a reordering of the two synchronous statements — is the mutation this
  // test exists to kill.
  const reentrant = latch.whenMounted().then(() => latch.whenMounted())
  latch.markMounted()
  await expect(reentrant).resolves.toBeUndefined()
})
