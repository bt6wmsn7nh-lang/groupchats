# Frxsty Messenger

A real-time group messaging app with:

- Sign up and login
- Securely hashed passwords
- Create private chat groups
- Automatically generated 8-character invite codes
- Join groups using a code
- Real-time messages using Socket.IO
- Saved accounts, groups, memberships, and messages in SQLite
- Mobile-friendly design

## Run locally

1. Install Node.js 20 or newer.
2. Open a terminal in this folder.
3. Run:

```bash
npm install
npm start
```

4. Open `http://localhost:3000`.

## Deploy on Render

Create a new **Web Service** and upload/push this project.

- Build command: `npm install`
- Start command: `npm start`
- Environment variable: `SESSION_SECRET` = a long random secret
- Environment variable: `NODE_ENV` = `production`

### Important persistence setting

Render's normal filesystem can reset during redeploys. To permanently keep the SQLite database:

1. Add a Render Persistent Disk.
2. Mount it at `/var/data`.
3. Add environment variable: `DB_PATH=/var/data/messenger.db`

Without a persistent disk, messages may be erased when the service is redeployed.

## Safety and production notes

This app is suitable as a starter project. Before opening it to a large public audience, add email verification, account recovery, moderation/reporting, rate limits, admin tools, and a managed database such as PostgreSQL.
