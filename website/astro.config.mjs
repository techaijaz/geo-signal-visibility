import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'

// SITE_URL is the public marketing domain (used for canonical URLs and the sitemap)
export default defineConfig({
    site: process.env.SITE_URL || 'https://www.example.com',
    integrations: [sitemap()],
    trailingSlash: 'ignore'
})
