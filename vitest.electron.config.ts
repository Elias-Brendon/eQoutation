import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    include: ['src/**/*.dbtest.ts'],
    environment: 'node',
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    }
  }
})
