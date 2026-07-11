# Deploying tggr on your ZimaOS NAS

The app is now fully self-hosted: a Node/Express API with a SQLite database and
files stored directly on the NAS filesystem. Firebase is gone. One container
serves both the API and the built React frontend on a single port, so the same
URL works on your LAN and through a Cloudflare tunnel.

## Architecture

```
Browser (LAN or Cloudflare tunnel)
        │
        ▼
  tggr container :3001  (published as :3080)
        ├── serves built React app (dist/)
        ├── /api/*   → Express + SQLite (auth, tags, requests, metadata)
        └── /files/* → files streamed from the /data volume
        ▼
  /data volume on the NAS
        ├── app.db            (SQLite: users, tags, files, requests)
        └── files/<tag>/...   (uploaded files, thumbnails in .thumbs/)
```

Auth is JWT in an httpOnly cookie, so file/thumbnail links work as plain
`<a href>` / `<img src>` without exposing tokens.

## 1. Build & run on ZimaOS

ZimaOS runs Docker, so either build on the NAS or build locally and ship the
image.

**Option A — build on the NAS (simplest):**

```bash
# copy the repo to the NAS (or git clone it there), then:
cd tggr-new
docker compose up -d --build
```

**Option B — via the ZimaOS App Store UI:** use "Install a customized app",
image `tggr:latest` (after `docker build -t tggr .`), port `3080 → 3001`,
volume `/DATA/AppData/tggr → /data`.

Edit `docker-compose.yml` first and point the data volume at your NAS data
drive, e.g. `/DATA/AppData/tggr:/data` — that folder will contain the database
and every uploaded file, so include it in your NAS backups.

The app is then available at `http://<NAS-IP>:3080` (e.g. `http://192.168.2.8:3080`
— adjust to your NAS's actual address).

## 2. Migrating your data out of Firebase

Passwords cannot be exported from Firebase (proprietary hash), everything else
can:

1. Firebase console → Project settings → Service accounts → **Generate new
   private key** → save as `serviceAccountKey.json`.
2. On a machine with Node 22+ (can be the NAS itself):

   ```bash
   cd server
   npm install            # server deps
   npm install firebase-admin
   DATA_DIR=/DATA/AppData/tggr node migrate-from-firebase.js /path/to/serviceAccountKey.json
   ```

   Point `DATA_DIR` at the same folder the container mounts as `/data`. The
   script imports users, tags, access requests and file metadata, and downloads
   every Storage object into `files/`. It is idempotent — re-run it if it gets
   interrupted.
3. Start (or restart) the container.
4. Each user **signs up again with the same email address** to set a new
   password. The server detects the imported account and attaches the new
   password to it — uid, tags, files and favorites are all preserved.

## 3. LAN access

Nothing extra needed: `http://<NAS-IP>:3080` from any device on your Wi-Fi.
Give the NAS a static IP / DHCP reservation so the address doesn't change.

## 4. Remote access via Cloudflare Tunnel

1. Cloudflare Zero Trust → Networks → Tunnels → **Create a tunnel** (cloudflared).
2. Run the connector on the NAS. Easiest as another container:

   ```yaml
   # add to docker-compose.yml
     cloudflared:
       image: cloudflare/cloudflared:latest
       restart: unless-stopped
       command: tunnel --no-autoupdate run --token <YOUR_TUNNEL_TOKEN>
   ```

3. In the tunnel's **Public Hostname** tab, map e.g. `tggr.yourdomain.com` →
   `http://tggr:3001` (same compose network) or `http://<NAS-IP>:3080`.
4. Strongly recommended: add a Cloudflare Access policy in front of the
   hostname (Zero Trust → Access → Applications) so the login page isn't
   exposed to the whole internet.

Because the frontend only uses relative URLs (`/api/...`, `/files/...`), the
same build works on both `http://<NAS-IP>:3080` and `https://tggr.yourdomain.com`
with no configuration changes.

## 5. Local development

```bash
# terminal 1 — API (creates ./server/data by default)
cd server && npm install && npm run dev

# terminal 2 — frontend with hot reload (proxies /api and /files to :3001)
npm install && npm run dev
```

## Environment variables (server)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | API + frontend port |
| `DATA_DIR` | `./data` | Where SQLite DB and files live |
| `DIST_DIR` | `../dist` | Built frontend to serve |
| `JWT_SECRET` | auto-generated, persisted in `DATA_DIR/.jwt-secret` | Session signing key |
