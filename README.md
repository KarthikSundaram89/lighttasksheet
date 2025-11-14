# LightTaskSheet — Internal (single-file UI + JSON storage)

This package contains a small, self-contained web application to track tasks in a lightweight spreadsheet-like UI.
Storage is **one JSON file per user** (stored in `data/`). Authentication is simple username/password with bcrypt-hashed passwords and JWT tokens.

**Contents of the ZIP**
```
lighttasksheet_package/
├─ server.js
├─ package.json
├─ public/
│  ├─ index.html        # main user UI (internal, no external resources)
│  └─ admin.html        # admin UI to manage users & trigger backup
├─ scripts/
│  └─ backup_data.sh    # backup script (creates backups/*.tar.gz)
├─ data/                # created at runtime (users.json and <user>.json files)
└─ backups/             # created by backup script
```

---

## Quick setup (Linux / macOS)

1. **Prerequisites**
   - Node.js (12+) and npm
   - A machine on a trusted internal network (this app is intended for internal use)
   - Optional: configure a reverse proxy (nginx) and TLS if desired

2. **Install**
```bash
# unzip into a directory, then:
cd lighttasksheet_package
npm install
chmod +x scripts/backup_data.sh
```

3. **Configure**
- Set a strong JWT secret (recommended for internal security):
```bash
export JWT_SECRET="replace_this_with_a_long_random_value"
```
- Optional: change `DATA_DIR` location by setting `DATA_DIR=/path/to/data`.

4. **Start the server**
```bash
node server.js
# or
npm start
```
Server listens on port `3000` by default. Open in browser on the host:
- Main UI: http://localhost:3000/
- Admin UI: http://localhost:3000/admin.html

---

## First-time bootstrap (create initial admin)

You can create a user via the regular Register button on the main UI or via `curl`. To bootstrap an initial admin:

1. Register a user:
```bash
curl -s -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"StrongPass1"}' http://localhost:3000/api/register
```

2. Make that user an admin by editing `data/users.json`:
```bash
# Open data/users.json and set "isAdmin": true for "admin"
# Example (do not store plaintext passwords here — the file stores bcrypt hashes):
# {
#   "admin": { "passwordHash": "$2b$10$...", "createdAt": "...", "isAdmin": true }
# }
```

Alternatively, if you already have an admin, use the Admin UI -> Create user (and check the admin box).

---

## Admin UI features

- List users (username, createdAt, admin flag)
- Create user (with optional admin flag)
- Delete user (removes their JSON file)
- Toggle admin flag
- Trigger backup (runs `scripts/backup_data.sh` on the server)

**Admin UI URL**: `http://<host>:3000/admin.html`

---

## Backup script (`scripts/backup_data.sh`)

- Creates `backups/sheets-backup-<UTC-timestamp>.tar.gz` including the `data/` folder.
- Keeps last 7 backups by default (set `KEEP_COUNT` env var to change).
- Example manual run:
```bash
./scripts/backup_data.sh
```

- Example cron (daily at 02:10 AM):
```
10 2 * * * /path/to/lighttasksheet_package/scripts/backup_data.sh >> /var/log/lts_backup.log 2>&1
```

**Note**: Backups include `data/users.json` (bcrypt password hashes). Protect backups accordingly.

---

## Security notes (important)

This application is intentionally minimal for internal use. Do **not** expose it to the public internet without proper hardening:
- Use a strong `JWT_SECRET` (set via `JWT_SECRET` env var).
- Run behind an HTTPS reverse proxy (nginx) with TLS.
- Restrict network/firewall access to trusted hosts.
- Consider switching to server-side sessions and CSRF protections for more security.
- Rotate backups and store them securely.

---

## Files you may want to edit

- `server.js` — main server logic (endpoints, backup trigger)
- `public/index.html` — the user UI
- `public/admin.html` — admin UI
- `scripts/backup_data.sh` — backup implementation
- `data/users.json` — user credentials and admin flags (managed by API)

---

## Troubleshooting

- If you see `backup script missing` when triggering backup, ensure `scripts/backup_data.sh` exists and is executable.
- If `data/` doesn't exist, the server will create it on first run. Ensure the process has write permissions.
- To reset all data, stop the server and remove `data/` and `backups/` (careful — this deletes user sheets and user accounts).

---

If you want, I can:
- Add an nginx example config for internal TLS.
- Add a systemd service file to run the app as a service.
- Create an automated admin bootstrap script that creates an initial admin user.

