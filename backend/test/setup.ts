import { vi } from 'vitest'

// The real logger opens a MongoDB transport; tests only need a silent stand-in
vi.mock('../src/util/loger', () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))
