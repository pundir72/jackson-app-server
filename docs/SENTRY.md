# Sentry Setup Runbook

Error tracking for all Jackson apps (backend, admin, Android, iOS) via
sentry.io. UAT and production share the same projects — events are separated
by the `environment` tag each SDK sends.

Everything ships **disabled by default**: until a DSN is configured, the SDKs
no-op. Each step below can be done independently and verified before the next.

Plan note: the free Developer plan includes 5k errors/month and 1 user seat.
The SDK config is errors-only (no tracing/replay) to stay within that quota.

---

## 1. Sentry account + projects — DONE (2026-08-04)

Org: **365-aitech** (https://365-aitech.sentry.io), 3 projects created.
Ingestion verified end-to-end with a test event on jackson-backend.

| Project | DSN |
|---|---|
| jackson-backend | `https://da5e6d17d810ceadde715adfc76a5a26@o4511852755550208.ingest.us.sentry.io/4511852772720640` |
| jackson-admin | `https://02d771aaff8b64e50f1ba28d480385d2@o4511852755550208.ingest.us.sentry.io/4511852798148608` |
| jackson-mobile | `https://5edf5b539511322705162cbb7cf7c286@o4511852755550208.ingest.us.sentry.io/4511852816629760` |

(DSNs are write-only credentials — safe to commit and to embed in builds.)

Alerts: each project has the default "notify on high-priority issues" email
rule. Recommended extra rule per project: error-spike alert (e.g. "more than
50 events in 1 hour").

## 2. Backend UAT, then prod (~10 min each, needs: SSH)

```bash
nano /var/www/env-backups/.env.jackson-app-server
```

Add (UAT server → `uat`, prod server → `production`):

```
SENTRY_DSN=https://da5e6d17d810ceadde715adfc76a5a26@o4511852755550208.ingest.us.sentry.io/4511852772720640
SENTRY_ENVIRONMENT=uat
```

Redeploy via Jenkins (the pipeline also stamps `SENTRY_RELEASE=build-<n>`
automatically). Then verify:

```bash
curl https://rewardsuatapi.hireagent.co/debug-sentry
# -> 500 response; the event must appear in Sentry within seconds,
#    tagged environment=uat
```

(`/debug-sentry` only exists when NODE_ENV != production; on prod verify by
watching for the first real error.)

Repeat on prod with `SENTRY_ENVIRONMENT=production`.

## 3. Admin panel (~5 min, needs: Vercel access)

Vercel → rewards-admin project → Settings → Environment Variables:

```
NEXT_PUBLIC_SENTRY_DSN=https://02d771aaff8b64e50f1ba28d480385d2@o4511852755550208.ingest.us.sentry.io/4511852798148608
NEXT_PUBLIC_SENTRY_ENV=production   # or uat for preview envs
```

Redeploy. Verify: log in to the admin, run
`throw new Error("sentry test")` in the browser console — the event appears
with the admin's user id/email attached.

## 4. Mobile apps (needs: Codemagic access / Android build env)

- **iOS**: codemagic.yaml already contains the `jackson-mobile` DSN and
  `NEXT_PUBLIC_SENTRY_ENV: uat` — nothing to do for UAT builds; flip the
  env to `production` for App Store builds.
- **Android**: set in the `.env` used when running `build-aab.bat`:
  `NEXT_PUBLIC_SENTRY_DSN=https://5edf5b539511322705162cbb7cf7c286@o4511852755550208.ingest.us.sentry.io/4511852816629760`
- Verify: TestFlight/internal build → force an API failure or crash →
  event appears tagged `platform: ios|android` with the user id.

## 5. Uptime monitoring (~5 min, no access needed)

UptimeRobot free tier → two HTTP monitors:

- `https://rewardsuatapi.hireagent.co/health`
- `https://rewardsapi.hireagent.co/health`

Alert contact: same email as Sentry alerts.

---

## Notes

- **Quota**: free tier caps at 5k errors/month — if a noisy issue burns
  quota, use the issue's "Delete and discard future events" or add it to
  the SDK `ignoreErrors` list.
- **Seats**: 1 user on the free plan; teammates can't log in until upgraded.
  Alert emails can still go to a shared address/group.
- **Retention**: 30 days on the free plan.
- **If volume outgrows the free tier**: self-hosted GlitchTip is
  API-compatible — switching back is a DSN change only (the stack config
  existed at git history of this branch if ever needed).
