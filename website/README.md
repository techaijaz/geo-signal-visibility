# Signal AI marketing website

Static marketing site (Astro) for Signal AI: home, features, compare, pricing, about, contact, blog and policies.
The product app (login, signup, dashboard) lives in `../frontend`; this site only links to it.

## Run

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static files in dist/
npm run preview
```

## Configure

Copy `.env.example` to `.env`:

- `SITE_URL`: public marketing domain, used for canonical URLs and `sitemap-index.xml`
- `PUBLIC_APP_URL`: where Log in / Start free go (the React app), e.g. `https://app.your-domain.com`

## Where content lives

- `src/config/site.ts`: plans and prices (keep in sync with `backend/src/config/planLimits.ts` and
  `paymentService` PLAN_PRICES), competitor prices with the date they were checked, company details
  used in the footer and policies (fill in the `[bracketed]` placeholders before launch), nav links
- `src/config/posts.ts`: blog index; each post is `src/pages/blog/<slug>.astro` using the `Post` layout
- `src/pages/legal/*`: terms, privacy, cancellation and refund, service delivery. Have a lawyer review
  these before launch
- `src/components/hero-data.ts`: illustrative answers for the homepage demo (made-up brands only)

## Deploy

`npm run build` outputs plain static files in `dist/`. Host on any static host (Cloudflare Pages,
Netlify, Vercel, S3 + CloudFront) or serve `dist/` from nginx.
