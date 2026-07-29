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
    fileParallelism: false,
    env: {
      EQOUTATION_DB_PATH: ':memory:'
    }
  }
})
