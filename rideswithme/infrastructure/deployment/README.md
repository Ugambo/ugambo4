# Deployment

Phase 1 ships the container images and the local compose stack. Production
deployment (VPS provisioning, reverse proxy with TLS, secrets, backups with tested
restores, monitoring and alerting) is Phase 8.

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
