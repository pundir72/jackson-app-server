# Jackson Rewards API

Node.js and Express backend for the Jackson Rewards application. It serves user
and administrator APIs for offers, surveys, rewards, wallets, subscriptions,
walkathons, and support tickets. Frontend and mobile applications are maintained
separately.

## Status

See [the code review](docs/REVIEW.md) for known security and correctness issues.
Passing the unit tests does not establish production readiness. Several external
integrations and legacy API versions require end-to-end verification.

## Local setup

Use Node.js 20 (the Docker build target), npm, MongoDB, and Redis.

```sh
npm ci
cp .env.example .env
```

Populate `.env` with credentials for a development environment. Generate a JWT
signing secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
and store it privately. `JWT_SECRET` is required at server startup. Google OAuth
and Stripe clients are initialized eagerly, so their credentials are also needed
for startup. Configure other providers before exercising their endpoints.

```sh
npm run dev
```

The template uses port 4001. `config/config.js` defaults to 3000 if `PORT` is not
set. `GET /health` checks liveness; `GET /ready` checks the MongoDB connection.
The HTTP server starts only after MongoDB connects.

Starting the server also starts scheduled jobs that can update database records
and call providers. Use an isolated development database and provider sandbox
accounts. There is no automatic database seeding step.

## Commands

| Command | Purpose |
| --- | --- |
| `npm start` | Start the API and scheduled jobs |
| `npm run dev` | Start with automatic reload |
| `npm test -- --runInBand` | Run the Jest unit suites |
| `npm run lint` | Run the repository's ESLint configuration |
| `npm run backfill:task-classification` | Preview game-task classification backfill |

The backfill script only writes when explicitly passed `--write`; inspect its
output and take a database backup before applying it.

Unit coverage currently focuses on OAuth name normalization, transaction
reference formatting, and Apple receipt verification with mocked HTTP responses.
The ESLint configuration currently provides parsing checks and no enabled
correctness rules.

## Structure

| Path | Responsibility |
| --- | --- |
| `server.js` | Startup, middleware, route registration, sockets, schedulers |
| `config/` | Environment configuration, authentication strategies, OTP settings |
| `routes/` | HTTP handlers; many contain business logic directly |
| `controllers/`, `services/` | Integration handlers and provider clients |
| `models/` | Mongoose schemas and model helpers |
| `middleware/` | Authentication, validation, activity tracking, integrity checks |
| `utils/` | Reward calculations, caching, integrations, scheduled jobs |
| `test/`, `__tests__/` | Unit tests |
| `scripts/` | Maintained operational scripts |
| `load-tests/` | k6 smoke and load scenarios |
| `k8s/`, `grafana/` | Deployment and monitoring templates |

The main accounting records are `User.wallet`, `User.xp`, `Transaction`, and
`PayoutRequest`. A payout request deducts coins as a hold; approval creates a
Tremendous order and rejection paths refund the held coins. These operations
need atomicity and retry review as described in `docs/REVIEW.md`.

Daily reward V1, V2, and V3 routes remain active. V3 uses user-relative weeks.
Confirm which versions each client consumes before changing shared reward logic.

## Containers and deployment

```sh
docker build -t jackson-app-server .
docker run --rm --env-file .env -p 4001:4001 jackson-app-server
```

Database and Redis URLs must be reachable from the container. In Compose, use
`redis://redis:6379` for the Redis service in `docker-compose.yml`; MongoDB must
be supplied separately. The Compose templates load `.env` at runtime. UAT uses
port 8000 and requires a matching `PORT` value in its environment file.

`.dockerignore` excludes credentials, Git history, uploads, logs, dependencies,
and local archives. Environment files are supplied at runtime, not copied into
the image. Uploads require separate persistent storage; move existing assets
through a controlled data migration. Set `IMAGE_BASE_URL`, `FRONTEND_URL`,
`PASSWORD_RESET_CLIENT_URL`, and `ADMIN_API_BASE_URL` for the target deployment.

Jenkins checks out the repository configured in its job, installs the lockfile,
runs validation and security checks, and builds the image. Registry publishing
and deployment are opt-in parameters. Deployment requires a Jenkins secret-file
credential through `ENV_CREDENTIALS_ID`. Configure `SENTRY_RELEASE` in the runtime
environment when release tracking is needed.

Kubernetes manifests are templates: supply the registry, environment secret,
storage, and networking for the target environment. The current multi-replica
configuration needs scheduler coordination before production use. Monitoring
configuration is also a template; Alertmanager has no notification destination
until one is configured. Grafana requires `GRAFANA_ADMIN_PASSWORD`.

See [OAuth configuration](docs/oauth-setup.md), [error monitoring](docs/SENTRY.md),
and [Kubernetes setup](k8s/README.md).

## Repository hygiene

Commit source, tests, the lockfile, blank configuration templates, and maintained
documentation. Keep credentials, database exports, uploads, logs, backups,
private review artifacts, and workstation-specific scripts out of Git.

Scan both the proposed source snapshot and Git history before transferring the
repository. Removing a secret from the current tree does not remove old commits
or revoke the credential. Rotate exposed credentials and choose a reviewed
history strategy before sharing. Do not copy `.git` or local archives into a
fresh client repository.
