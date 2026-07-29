# Frxsty Messenger

A Render-ready real-time group messaging web service.

## Features

- Sign up, log in, and log out
- Password hashing with bcrypt
- Create groups with generated 8-character invite codes
- Join existing groups through a code
- Real-time Socket.IO chat
- Saved accounts, memberships, sessions, groups, and messages
- Responsive desktop and mobile interface
- SQLite persistent storage

## Run locally

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env` if you want custom settings.
4. Run `npm start`.
5. Open `http://localhost:3000`.

## Deploy to Render with Blueprint

1. Upload this project to a GitHub repository.
2. In Render, choose **New > Blueprint**.
3. Select the repository.
4. Render reads `render.yaml` and creates the web service, environment variables, health check, and persistent disk.

## Deploy manually on Render

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check: `/health`
- Environment variables:
  - `NODE_ENV=production`
  - `SESSION_SECRET=` a long random secret
  - `DB_PATH=/var/data/messenger.db`
- Persistent disk mount path: `/var/data`

A persistent disk is required for SQLite data to survive deployments and restarts. Render may require a paid web-service plan for persistent disks. Without the disk, the app still runs, but stored data may reset after redeployment.
