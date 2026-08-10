import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['systems/**/test/**/*.test.js'],
    environment: 'node',
  },
})
