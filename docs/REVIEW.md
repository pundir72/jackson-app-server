# Code review and release follow-up

Review date: 2026-09-21. This is a source review of the backend and its repository
packaging, not a penetration test or a certification of production readiness.
No production database or provider account was accessed.

## Cleanup performed

- Removed obsolete repair scripts, developer diagnostics, backup source, sample
  seeders, and unsupported completion reports from the deliverable.
- Removed diagnostic route registration under `/api/test`.
- Consolidated configuration examples into `.env.example` with blank credentials.
- Replaced the hardcoded Besitos webhook secret and Stripe webhook placeholder
  with environment settings. Removed the JWT fallback; startup requires a secret.
- Removed identified secret/header logging and a token pasted into a comment.
- Added Git and Docker exclusions for private and generated files.
- Added a lockfile and declared directly imported Redis and UUID packages.
- Moved test/lint dependencies to development dependencies and unified unit tests
  under Jest. Restricted test discovery to maintained test directories.
- Updated Docker builds to use the lockfile and runtime environment injection.
- Removed source-repository and workstation paths from Jenkins. Deployment is
  opt-in and reads a Jenkins secret-file credential.
- Replaced organization-specific monitoring notes with configuration guidance.
- Made hardcoded application asset hosts use `IMAGE_BASE_URL`.
- Removed decorative comment markers, obsolete change labels, and commented-out
  Stripe mock code. Useful explanations and unfinished-work markers remain.

Existing deployments must supply `JWT_SECRET`, `BESITOS_WEBHOOK_SECRET`,
`STRIPE_WEBHOOK_SECRET`, and environment-specific URLs. The Besitos hash helper
now rejects verification when its secret is absent. This does not fix every
public callback path described below.

## Release blockers and high-priority findings

### Authentication and authorization

1. **Fixed signup OTP:** `routes/auth.js`, `/send-otp`, creates a fixed code and
   includes it in the response. SMS delivery is commented out. Setting production
   environment variables does not repair this route. Replace the flow with real
   delivery and test expiration, replay, attempt limits, and throttling.
2. **Payout privileges:** several handlers in `routes/payouts.js`, including
   campaign creation, organization API-key creation, and order approval, use
   ordinary authentication. Apply admin authorization and ownership checks before
   any provider call; audit all provider-management routes, not only these examples.
3. **Social account operations:** `/api/auth/social/status` and
   `/api/auth/social/disconnect` in `routes/auth.js` do not use authentication
   middleware. The disconnect route accepts the target user from the request and
   returns social data. Require ownership and review token exposure.
4. **Callback authenticity:** the Besitos conversion POST and Bitlabs completion
   POST in `routes/webhooks.js` lack enforced provider authentication. Everflow
   branches allow missing signatures. `routes/payouts.js` accepts a Tremendous
   webhook without signature verification. Validate every callback before writes.
5. **Disabled protections:** the global rate limiter is not mounted in `server.js`.
   Firebase protections and event validation are commented out in parts of
   `routes/adjust-v2.js`; duplicate detection has an explicit TODO in
   `middleware/eventValidation.js`. These are implementation gaps, not documentation
   cleanup items.
6. **Auth middleware:** `middleware/auth.js` can call `next()` when the user lookup
   returns no account. It also accepts query-string JWTs and returns error stacks.
   Reject missing accounts, avoid tokens in URLs, and sanitize errors and logs.

### Accounting and payment correctness

7. **Non-atomic writes:** reward claims and payout creation save wallet balances,
   transactions, and progress records separately. Read-modify-save operations can
   race; partial failures can leave inconsistent records. Introduce guarded state
   transitions, unique idempotency keys, and appropriate MongoDB transactions.
   Test simultaneous requests, provider retries, and failures between writes.
8. **Stripe raw body:** `server.js` applies JSON parsing before the Stripe webhook
   route's raw parser. Signature verification needs the original request bytes.
   Configure parsing order and verify with provider-signed fixtures.
9. **Payout status vocabulary:** Tremendous callbacks set states such as `approved`,
   `sent`, and `delivered`, while `Transaction.status` permits a different set.
   Define and test explicit mappings rather than storing provider states directly.
10. **Pricing:** `config/config.js` uses `parseInt` for decimal VIP prices. Resolve
    the numeric representation and add price calculation tests.

### Deployment and maintenance

11. **Dependencies:** the resolved tree has known advisories, including high and
    critical findings. Keep dependency and image security gates enabled. Several
    suggested fixes require major-version upgrades; upgrade with focused integration
    testing rather than forcing all changes during packaging cleanup.
12. **Schedulers and scaling:** each API process starts cron jobs, while Kubernetes
    permits multiple replicas. Implement distributed coordination or dedicated
    workers and verify idempotency before horizontal scaling.
13. **Socket authorization:** the connection handler permits clients to choose
    rooms without authentication or room authorization. Review consumers before
    using rooms for private events.
14. **Uploads and assets:** uploads are stored locally and publicly served. The
    deployment templates do not provide persistent upload storage. Migrate the
    referenced assets and define access, retention, and persistence requirements.
15. **Observability:** verbose provider payload and user-data logs remain beyond
    the specific credential logs removed in this pass. Apply structured logging,
    redaction, access controls, and retention policies. Alert delivery needs explicit
    configuration in the target environment.
16. **Architecture and coverage:** multiple reward generations coexist, the user
    model embeds extensive state, and some route files contain thousands of lines.
    Refactor by business boundary after adding behavior tests. Unit coverage is
    limited and lint currently has no correctness rules enabled.

## Verification boundaries

Repository cleanup can be checked with secret scanning, syntax checks, lint,
unit tests, missing-import checks, and a clean source export. These checks cannot
establish correctness of real payouts, receipt lifecycle events, SMS delivery,
provider signatures, MongoDB concurrency, or client compatibility.

Before deployment, use isolated data and provider sandboxes for end-to-end tests.
Review and rotate any previously exposed credentials. If history is retained,
scan and remediate all transferred branches and tags; a clean current tree alone
is insufficient.

## Results of this review pass

- 12 unit tests passed across 3 Jest suites.
- ESLint passed with the existing parsing-only configuration.
- A clean `npm ci --ignore-scripts --offline` installation succeeded from the
  populated package cache. Native dependency install scripts were not executed.
- Gitleaks 8.24.3 reported no findings in the proposed source snapshot.
  Supplementary source checks found no JWT literals, private-key blocks,
  credential-bearing URLs, or previous organization references.
- Existing Git history produced 35 potential secret findings. Do not transfer it
  without reviewing those findings, rotating real credentials, and deciding how
  to handle history.
- The production dependency audit reported 63 vulnerable dependency entries:
  2 critical, 13 high, and 48 moderate. These are scanner results, not proof that
  every advisory is exploitable through this application.
- Local imports resolved and JSON/YAML files parsed. All four Compose templates
  passed configuration validation with environment-file resolution disabled;
  this did not verify real secrets, external networks, volumes, or services.
- The full API, Docker image builds, Jenkins pipeline, provider integrations, and
  database-backed workflows were not run. Local checks used Node.js 24.18.0;
  the Node.js 20 container target still requires build and integration testing.
