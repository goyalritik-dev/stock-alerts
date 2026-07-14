# PS5 Stock Alert (India)

Free, 24x7 PS5 stock tracker for Indian retailers. A Node.js worker (runs on
GitHub Actions every 5 minutes) performs a Search & Match routine across 10+
sites, checks delivery to your pincodes, and alerts you on Telegram/WhatsApp
the moment stock appears. A Next.js dashboard lets you tweak the tracker
settings from any device.

## Structure

```
├── config.json    # Tracker settings — edited via the dashboard, read by the worker
├── web/           # Next.js config dashboard (deploys free to Vercel)
└── worker/        # Node.js stock checker (runs on GitHub Actions)  [coming next]
```

## Frontend (web/)

```bash
cd web
npm install
npm run dev        # http://localhost:3000
```

Configuration is via `web/.env.local` (see `web/.env.example`):

| Variable          | Purpose                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| `ACCESS_PASSWORD` | Password gate for the dashboard. Empty = open (local dev).             |
| `GITHUB_TOKEN`    | Fine-grained PAT with Contents read/write. Set on Vercel in production. |
| `GITHUB_REPO`     | `username/repo`. With the token set, the dashboard edits `config.json` on GitHub so the worker picks changes up. Empty = edits the local file. |

## Status

- [x] Config dashboard (frontend)
- [ ] Worker: Search & Match engine + site adapters
- [ ] Worker: pincode serviceability + Telegram/CallMeBot alerts
- [ ] GitHub Actions workflow (5-min cron, state commit-back)
- [ ] Vercel deployment guide
