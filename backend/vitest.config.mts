import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        environment: 'node',
        include: ['test/**/*.test.ts'],
        setupFiles: ['test/setup.ts'],
        restoreMocks: true,
        // Unit tests never touch MongoDB, Redis or a payment gateway
        env: { NODE_ENV: 'test' }
    }
})
