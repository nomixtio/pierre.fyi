# pierre.fyi

Personal portfolio site at [pierre.fyi](https://pierre.fyi), built with Vite, TypeScript, and Tailwind CSS v4, deployed on Cloudflare Workers with static assets and a contact-form API.

## Stack

- **Vite 8** — frontend build
- **Tailwind CSS 4** — styling
- **Cloudflare Workers** — static assets + `POST /api/contact`
- **Cloudflare Email Service** — sends you an email when someone submits the form
- **Cloudflare Turnstile** — bot protection on the contact form

## Development

```bash
npm install
cp .dev.vars.example .dev.vars    # local Worker secrets/vars (optional for dev)
npm run dev                       # frontend only (contact form API not available)
npm run cf:preview                # build + wrangler dev (full stack)
```

## Contact form setup (required before deploy)

The form emails you when someone submits it. Your personal email and Turnstile secret are **not** stored in the repo.

### 1. Turnstile widget

In the [Cloudflare dashboard](https://dash.cloudflare.com/?to=/:account/turnstile):

1. Create a widget for **pierre.fyi** (production).
2. Add **localhost** and **127.0.0.1** as additional domains for local testing.
3. Copy the **site key** (public) and **secret key** (private).

### 2. Site key (public)

Add your Turnstile **site key** to `wrangler.jsonc`:

```jsonc
"vars": {
  "TURNSTILE_SITE_KEY": "your_turnstile_site_key"
}
```

For `npm run dev` only (no Worker), copy `.env.example` to `.env` instead.

### 3. Worker secrets

```bash
npx wrangler secret put TURNSTILE_SECRET
# paste your Turnstile secret key when prompted

npx wrangler secret put CONTACT_TO_EMAIL
# enter your inbox address when prompted
```

Production hostname allowlist is set in `wrangler.jsonc` as `TURNSTILE_HOSTNAMES: "pierre.fyi"`.

For local testing, copy `.dev.vars.example` to `.dev.vars` and include:

```bash
TURNSTILE_HOSTNAMES=localhost,127.0.0.1
```

### 4. Email sending

```bash
npx wrangler email sending enable pierre.fyi
```

### 5. Local testing

```bash
npm run cf:preview
```

Submit the form at `http://localhost:8787`. Submissions are sent from `contact@pierre.fyi` with the visitor's address as `Reply-To`.

## Deploy

```bash
npx wrangler login   # first time only
npm run deploy
```

Attach the `pierre.fyi` custom domain in the Cloudflare dashboard: **Workers & Pages → pierre-fyi → Settings → Domains & Routes**.

## Public repository checklist

Before pushing this repo publicly, confirm:

- **No secrets in git** — `.dev.vars`, `.env`, `.wrangler/`, `node_modules/`, and `dist/` are gitignored. Set `CONTACT_TO_EMAIL` and `TURNSTILE_SECRET` only via `wrangler secret put`.
- **Turnstile configured** — set `TURNSTILE_SITE_KEY` in `wrangler.jsonc`; keep `TURNSTILE_SECRET` in `wrangler secret put` only.
- **Regenerate worker types** — `worker-configuration.d.ts` is gitignored and recreated by `npm run build` (`wrangler types`).

## Structure

- `index.html` — page content and contact form
- `src/main.ts` — scroll reveal, mouse glow, Turnstile + form submission
- `src/worker.ts` — `POST /api/contact` handler with Turnstile siteverify
- `wrangler.jsonc` — Worker, assets, and email binding config
