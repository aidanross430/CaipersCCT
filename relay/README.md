# CaipersCCT relay

Routes live session traffic between the participant app and the proctor client. It pairs two
sockets by room code and forwards frames between them. It stores nothing and logs no message
content. The frame format lives in `frontend/src/shared/partner/relay.ts`, shared with both apps.

## Run locally

```sh
cd relay
npm install
cp .env.example .env      # then set RELAY_TOKEN
npm run dev               # restarts on change
```

## Test and check

```sh
npm test
npm run typecheck
```

## Build and deploy

The image is built from the **repo root**, because the bundle includes the shared envelope code:

```sh
docker build -f relay/Dockerfile -t caipers-cct-relay .
docker run -p 8080:8080 -e RELAY_TOKEN=... caipers-cct-relay
```

On the host, set `RELAY_TOKEN` as a secret and make sure the service:

- serves `wss://` (the host's TLS in front of port 8080),
- allows long-lived WebSocket connections,
- stays running when idle (no sleeping free tier),
- runs a single instance (rooms live in memory, so two instances would split pairs).

`GET /health` returns 200 for uptime checks.

## Rotate the token

1. Generate a new one: `openssl rand -hex 32`.
2. Update `RELAY_TOKEN` on the host and redeploy.
3. Put the same value in `Options/relay-key.txt` on every participant and proctor machine.

Sessions in progress are cut off by the redeploy, so rotate between sessions.
