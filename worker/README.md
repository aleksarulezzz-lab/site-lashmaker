# lashmaker-booking worker

Cloudflare Worker behind the site: booking API, Telegram bot, appointment
reminders, and privacy-friendly site analytics.

## Commands

```sh
npm test           # run the unit tests (also runs in CI on every push touching worker/)
npm run dev        # local wrangler dev
npm run deploy     # publish to Cloudflare  ← a git push does NOT do this
```

`wrangler` is already OAuth-logged-in on this machine. If it ever isn't:
`npx wrangler login`.

## Secrets (set with `wrangler secret put <NAME>`, never in wrangler.toml)

| Name             | Purpose                                             |
|------------------|----------------------------------------------------|
| `BOT_TOKEN`      | Telegram bot API token                              |
| `WEBHOOK_SECRET` | shared secret in the Telegram webhook header        |
| `STATS_TOKEN`    | query-string key for `GET /api/stats`               |

Non-secret vars (`BOT_USERNAME`, `SITE_DOMAIN`) live in `wrangler.toml`.

## Database migrations

D1 database: `lashmaker-bookings`. Migrations are applied by hand.

```sh
# see what's already applied
npx wrangler d1 execute lashmaker-bookings --remote -y \
  --command "SELECT name, applied_at FROM schema_migrations ORDER BY name;"

# apply the next one
npx wrangler d1 execute lashmaker-bookings --remote -y \
  --file=migration-000N-<slug>.sql
```

`migration-0005` created `schema_migrations` and backfilled 0002–0004. From
0006 on, every `migration-*.sql` must end with
`INSERT OR IGNORE INTO schema_migrations (name) VALUES ('migration-000N-<slug>');`
so the table stays authoritative. `schema.sql` is the full fresh-install schema
and should be kept in sync with the sum of the migrations.

## Deploy checklist

1. `npm test` green.
2. Apply any new migration (above).
3. `npm run deploy`.
4. If a bundled site asset changed (e.g. `lashmaker/assets/track.js`), also bump
   its `?v=N` in the page and `git push` so GitHub Pages picks it up.
