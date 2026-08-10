import { describe, it, expect } from 'vitest'

describe('toolchain', () => {
  it('runs unit tests', () => {
    const value = Math.floor(Math.random() * 1000)
    expect(value).toBeGreaterThanOrEqual(0)
  })
})
