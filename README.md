# Kinship (FamilyGram) — Private Self-Hosted Family Social Vault

**Kinship** is a private, invite-only, Instagram-style Progressive Web App (PWA) built to run on a single home-lab server or Proxmox VM (`< 450 MB` idle RAM).

- **100% Private**: Invite-only signup, `X-Robots-Tag: noindex, nofollow`, HMAC-SHA256 signed media URLs, zero analytics, zero third-party trackers.
- **Family-First UX**: Chronological feed (no algorithm), 24-hour stories + Highlights, shared family albums with 1-click original `.zip` download, "On This Day" memories, 1:1 & group chats with read receipts, relationship badges (`Nani`, `Mom`, `Chacha`, `Cousin`), Child-safe accounts with Admin-approved contact circles, `A++` large text for elders, and multi-language support (**English**, **Hindi हिन्दी**, **Kannada ಕನ್ನಡ**, **Tamil தமிழ்**).

---

## 1. Quick Start (Local & Demo Mode)

```bash
# 1. Install dependencies
npm install

# 2. Seed demo family accounts, photos, stories, albums, memories & group chat
npm run db:seed

# 3. Run unit & integration tests
npm test

# 4. Start the app (http://localhost:3000)
npm run dev
```

### Demo Family Accounts (Password for all: `FamilyVault2026!`)
| Username | Name | Relationship Badge | Role | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `aarav` | Aarav Sharma | Admin / Son | `admin` | Full Admin Panel access (`/admin`) |
| `nani` | Kamala Devi | Nani (Grandma) | `member` | Defaults to Hindi (`hi`) & Extra-Large Text (`A++`) |
| `priya` | Priya Sharma | Mom | `member` | Owns the "Diwali 2026 Family Album" |
| `rohan` | Rohan Verma | Cousin | `member` | Unapproved for Child account until Admin approves |
| `ananya` | Ananya Sharma | Little Sister | `child` | Restricted Child circle (sees only Admin, Mom, Nani) |

---

## 2. Setting Up on Your Proxmox Linux VM (200 GB Storage)

### Step 1: Prepare the Ubuntu / Debian VM on Proxmox
On a fresh Debian 12 or Ubuntu 24.04 LTS VM (2 vCPU, 2–4 GB RAM, 200 GB VirtIO SCSI disk):
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl git ufw

# Install Docker Engine & Docker Compose plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

### Step 2: Clone & Configure Environment
```bash
git clone <your-repo-url> /opt/kinship
cd /opt/kinship
cp .env.example .env

# Generate strong cryptographic secrets
sed -i "s/change_me_to_a_strong_db_password/$(openssl rand -hex 24)/" .env
sed -i "s/change_me_to_64_hex_chars_for_session_and_csrf_signing_0123456789/$(openssl rand -hex 32)/" .env
sed -i "s/change_me_to_64_hex_chars_for_hmac_signed_media_urls_9876543210/$(openssl rand -hex 32)/" .env
```

---

## 3. Network Access Modes (Choose One or Both)

### Mode A (Preferred for Maximum Privacy): Private Mesh VPN (Tailscale / WireGuard)
No ports are opened on your home router.
1. Create a reusable or ephemeral Auth Key in your Tailscale Admin Console (`TS_AUTHKEY=tskey-auth-...`) and add it to `.env`.
2. Start the stack with the `vpn` profile:
   ```bash
   docker compose --profile vpn up -d --build
   ```
3. Share the node with family members via Tailscale MagicDNS (e.g., `https://kinship-family.tail1234.ts.net`).

### Mode B (Easiest for Non-Technical Relatives): Public Domain via Cloudflare Tunnel or Caddy HTTPS
Relatives do not need to install a VPN client—they just open your private family domain on their phone.

- **Option B1 — Cloudflare Zero-Trust Tunnel (No Open Router Ports)**:
  1. Create a tunnel in Cloudflare Zero Trust Dashboard pointing `https://family.yourdomain.com` -> `http://app:3000`.
  2. Paste `CLOUDFLARE_TUNNEL_TOKEN=...` into `.env`.
  3. Launch with:
     ```bash
     docker compose --profile tunnel up -d --build
     ```

- **Option B2 — Direct Port-Forward (80/443) with Caddy Auto-HTTPS**:
  1. Set `DOMAIN=family.yourdomain.com` and `ACME_EMAIL=you@yourdomain.com` in `.env`.
  2. Allow only SSH, HTTP, and HTTPS on the VM firewall:
     ```bash
     sudo ufw default deny incoming
     sudo ufw allow ssh
     sudo ufw allow 80/tcp
     sudo ufw allow 443/tcp
     sudo ufw allow 443/udp
     sudo ufw enable
     ```
  3. Launch with:
     ```bash
     docker compose --profile public up -d --build
     ```

---

## 4. Automated Backups, Retention & Restore Verification Test

### Automated Nightly Backups
The `kinship-backup` container runs `scripts/backup.sh` every night at **02:00 AM**:
- Creates a compressed `pg_dump -Fc` snapshot of PostgreSQL.
- Incrementally mirrors `/data/media` (`originals`, `display`, `thumbs`, `hls`).
- Packages a dated `.tar.gz` archive and prunes old archives according to your retention policy (`BACKUP_KEEP_DAILY=7`, `BACKUP_KEEP_WEEKLY=4`, `BACKUP_KEEP_MONTHLY=6`).
- Admins can also trigger an immediate backup snapshot anytime from `/admin` -> **Run Backup Now**.

### Documented Restore Test Procedure
Always test your backups! Run this verification test on your server:
```bash
# 1. Trigger a fresh backup inside the backup container
docker exec kinship-backup /bin/sh /usr/local/bin/backup.sh

# 2. List available backup archives
docker exec kinship-backup ls -lh /data/backups/daily/

# 3. Restore from the latest archive
LATEST=$(docker exec kinship-backup sh -c 'ls -1t /data/backups/daily/*.tar.gz | head -n1')
docker exec kinship-backup /bin/sh /usr/local/bin/restore.sh "$LATEST"

# 4. Verify application health & media integrity
curl -s http://localhost:3000/api/health
```

---

## 5. Upgrading Kinship

Upgrading takes under 30 seconds and preserves all PostgreSQL data and media volumes:
```bash
cd /opt/kinship
git pull
docker compose pull
docker compose up -d --build
```

---

## 6. How to Add Family Members on Their Phones (Android & iOS PWA Guide)

### Step 1: Create a One-Time Invite Link
1. Log in as Admin and open **🛡️ Admin** (`/admin`).
2. Under **Generate One-Time Family Invite**, enter their relationship label (e.g., `Nani`, `Chacha`, `Mausi`, `Cousin`), choose `Member` or `Child`, and click **+ Create Invite Code**.
3. Send them the invite link (e.g., `https://family.yourdomain.com/invite/DIWALI-2026`) on WhatsApp/SMS.

### Step 2: Install to Home Screen on iPhone / iPad (iOS 16.4+)
1. Open the invite link in **Safari** (must be Safari on iOS).
2. Tap the **Share** button (the square with an upward arrow `⬆️` at the bottom of the screen).
3. Scroll down and tap **Add to Home Screen** -> tap **Add**.
4. Open the **Kinship** app icon from the iPhone Home Screen, sign in, go to the **❤️ Activity** tab, and tap **🔔 Enable Push Notifications**.

### Step 3: Install to Home Screen on Android
1. Open the invite link in **Chrome** on Android.
2. Tap the **three-dot menu (`⋮`)** in the top-right corner and tap **Add to Home screen** / **Install app**.
3. Open **Kinship** from the Home Screen, go to **❤️ Activity**, and tap **🔔 Enable Push Notifications**.

### Elder-Friendly Accessibility Tips
- In the top bar, tap **`A` / `A+` / `A++`** to increase text size across the entire app (`A++` sets 21px base text for effortless reading without glasses).
- Tap the language dropdown in the top bar to switch between **English**, **हिन्दी (Hindi)**, **ಕನ್ನಡ (Kannada)**, and **தமிழ் (Tamil)** anytime.

# familyinsta
