# Deployment

The container images (`infrastructure/docker/`), the local compose stack, and
the monitoring stack (`monitoring/`). How to go live is in
`documentation/LAUNCH.md`:

- the go-live checklist
- monitoring and alert runbooks
- scheduled encrypted backups and restore checks (the `backup` image)
- load-test results
- store builds

Provisioning the server itself (VPS, reverse proxy with TLS, secret store)
depends on the hosting chosen and is not scripted here.

What is already true and should stay true:

- Run the `migrate` image to completion before starting new `api` containers.
  Migrations are forward-only and take an advisory lock, so two runners cannot
  collide.
- The API is stateless; run two or more replicas behind the reverse proxy and set
  `TRUST_PROXY_HOPS` to the number of proxies in front of it.
- `/health/live` is for restarts, `/health/ready` for load-balancer routing.
- Secrets come from the environment only (`apps/api/.env.example` documents each
  one). `NODE_ENV=production` refuses to start with the console SMS provider.
- Logs are JSON on stdout with request ids; authorization headers, OTP codes and
  tokens are redacted.
