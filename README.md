# Frxsty Messenger — Render Free Version

This version uses PostgreSQL instead of SQLite, so the free web service does not need a persistent disk.

## Deploy with Render Blueprint

1. Upload every file to the root of one GitHub repository.
2. In Render, choose **New > Blueprint**.
3. Select the repository.
4. Render reads `render.yaml` and creates the web service and PostgreSQL database.
5. Approve the Blueprint and deploy.

## Important free database limit

Render's free PostgreSQL database currently expires after 30 days. For permanent storage, upgrade the database or connect another long-term PostgreSQL provider and set its URL as `DATABASE_URL`.

## Manual web-service settings

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check: `/health`

Required variables:
- `NODE_ENV=production`
- `SESSION_SECRET=<long random private value>`
- `DATABASE_URL=<PostgreSQL connection string>`

Do not add a disk to the free web service.
