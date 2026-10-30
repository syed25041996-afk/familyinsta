# Kinship (familyinsta) — Native Android & iOS Family App + Self-Hosted Home Lab Server

**Kinship (`familyinsta`)** is a private, invite-only, family-only Instagram-style **native mobile app for Android and iOS** (built with React Native & Expo in [`mobile/`](./mobile)) powered by a **self-hosted Home Lab API & Media Server** running on your Proxmox VM (`http://192.168.1.103:3000`).

- **Native Android & iOS App (`mobile/`)**:
  - Native Camera & Photo/Video Library picker (`expo-image-picker`), FaceID / Fingerprint Biometric Passkeys (`expo-local-authentication`), encrypted token storage (`expo-secure-store`), native Push Notifications (`expo-notifications`), and direct ZIP album downloads (`expo-file-system` + `expo-sharing`).
  - Configurable **Home Lab Server URL** right on the login screen (preconfigured for `http://192.168.1.103:3000` or your Tailscale/Cloudflare domain).
  - Elder-friendly `A / A+ / A++` text scaling, Dark/Light mode, and multi-language support (**English**, **हिन्दी Hindi**, **ಕನ್ನಡ Kannada**, **தமிழ் Tamil**).
- **Self-Hosted Home Lab Backend (`/opt/kinship` on `192.168.1.103`)**:
  - Runs in Docker Compose (`db` PostgreSQL 16, `app` API + WebSocket server, `worker` `sharp` WebP/AVIF + `ffmpeg` H.264/HLS media processor, `backup` nightly `pg_dump` + media mirror).
  - Uses `< 450 MB` idle RAM on your 200 GB Proxmox VM.
  - Zero third-party cloud dependencies, zero analytics, `X-Robots-Tag: noindex, nofollow`, and HMAC-SHA256 signed media URLs.

---

## 1. Repository Structure

```text
familyinsta/
├── mobile/                         # Native Android & iOS App (React Native + Expo Router)
│   ├── app.json                    # Android (com.family.kinship) & iOS bundle config
│   ├── eas.json                    # Standalone Android .apk & iOS .ipa build profiles
│   ├── package.json
│   ├── src/
│   │   ├── api/client.ts           # Bearer token auth, SecureStore, chunked upload, WebSocket
│   │   ├── context/AuthContext.tsx # User state, Home Lab URL (192.168.1.103:3000), Theme, A++ Scale
│   │   └── i18n/strings.ts         # English, Hindi, Kannada, Tamil mobile translations
│   └── app/
│       ├── _layout.tsx             # Root Native Stack
│       ├── (auth)/
│       │   ├── login.tsx           # Home Lab Server URL selector + Password/Biometric Login
│       │   └── invite.tsx          # One-time Invite Code Signup screen
│       └── (tabs)/
│           ├── index.tsx           # 24h Stories + On This Day Memories + Chronological Feed
│           ├── search.tsx          # Search People, #Tags, Captions & Albums
│           ├── create.tsx          # Native Camera/Gallery Picker + Post & 24h Story Uploader
│           ├── albums.tsx          # Shared Family Albums + Original Quality .ZIP Download
│           ├── messages.tsx        # Real-time 1:1 & Family Group Chats + Read Receipts
│           ├── activity.tsx        # Notifications & Per-User Notification Toggles
│           └── profile.tsx         # Profile, Relationship Badge, Highlights & Mobile Admin Panel
├── src/                            # Self-Hosted Home Lab API & Media Worker Backend
├── scripts/                        # Nightly backup.sh, restore.sh, and demo family seed.ts
└── docker-compose.yml              # Proxmox VM Docker Compose stack
```

---

## 2. Home Lab Server Setup on Proxmox VM (`192.168.1.103`)

### Step 1: Prepare the Ubuntu VM on Proxmox (`spera@192.168.1.103`)
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl git ufw openssl

# Install Docker Engine & Docker Compose plugin (if not installed)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

### Step 2: Clone Repository & Configure Home Lab Environment
```bash
sudo rm -rf /opt/kinship
sudo git clone https://github.com/syed25041996-afk/familyinsta.git /opt/kinship
sudo chown -R $USER:$USER /opt/kinship
cd /opt/kinship
cp .env.example .env

# Generate strong cryptographic secrets
sed -i "s/change_me_to_a_strong_db_password/$(openssl rand -hex 24)/g" .env
sed -i "s/change_me_to_64_hex_chars_for_session_and_csrf_signing_0123456789/$(openssl rand -hex 32)/g" .env
sed -i "s/change_me_to_64_hex_chars_for_hmac_signed_media_urls_9876543210/$(openssl rand -hex 32)/g" .env
sed -i "s|https://family.example.com|http://192.168.1.103:3000|g" .env
```

### Step 3: Start the Home Lab Backend Containers & Seed Family Data
```bash
cd /opt/kinship
docker compose up -d --build

# Seed the initial family accounts (Admin, Nani, Mom, Cousin, Child) & sample albums
docker exec kinship-app npm run db:seed

# Allow mobile devices on your LAN / Tailscale to reach port 3000
sudo ufw allow 3000/tcp
```

Verify your Home Lab API is live at:
```bash
curl http://192.168.1.103:3000/api/health
```

---

## 3. Running & Building the Android and iOS Mobile App (`mobile/`)

### Option A: Run Instant Live Preview on Your Android or iPhone (Expo Go)
1. Install **Expo Go** from the Google Play Store (Android) or Apple App Store (iPhone).
2. On your computer (or server), run:
   ```bash
   cd mobile
   npm install
   npx expo start
   ```
3. Scan the QR code with your phone.
4. On the app's Login screen, the **Home Lab Server URL** is pre-filled with `http://192.168.1.103:3000`. Tap **Connect**, then sign in or tap any Demo Family Account!

### Option B: Build a Standalone Installable Android `.apk` (No Play Store Needed)
You can generate a standalone `.apk` file to share directly with family members on WhatsApp or host on your server:
```bash
cd mobile
npm install

# Cloud APK build via EAS (free account):
npx eas-cli build -p android --profile preview

# OR Local Android APK build (if Android SDK is installed locally):
npx expo run:android --variant release
```

### Option C: Build for iOS (`.ipa` / Xcode)
```bash
cd mobile
npm install
npx eas-cli build -p ios --profile preview
```

---

## 4. Connecting Relatives Outside Home Wi-Fi (Tailscale VPN or Cloudflare Tunnel)

- **Mode A — Tailscale Mesh VPN (Zero Open Router Ports)**:
  1. Set `TS_AUTHKEY=tskey-auth-...` in `/opt/kinship/.env` and run `docker compose --profile vpn up -d`.
  2. In the mobile app's **Home Lab Server URL** box, enter your Tailscale IP or MagicDNS URL.
- **Mode B — Public Domain via Cloudflare Tunnel (Easiest for Non-Technical Relatives)**:
  1. Set `CLOUDFLARE_TUNNEL_TOKEN=...` in `/opt/kinship/.env` pointing `https://family.yourdomain.com` -> `http://app:3000`.
  2. Run `docker compose --profile tunnel up -d`.
  3. Relatives enter `https://family.yourdomain.com` in the mobile app's **Home Lab Server URL** field once—it is saved permanently in their phone's encrypted Keychain/Keystore.

---

## 5. Pre-Seeded Family Accounts (Password: `FamilyVault2026!`)
| Username | Name | Relationship Badge | Role |
| :--- | :--- | :--- | :--- |
| `aarav` | Aarav Sharma | Admin / Son | `admin` (Full Mobile Admin Panel in Profile tab) |
| `nani` | Kamala Devi | Nani (Grandma) | `member` (Hindi `hi` + `A++` Extra Large Text) |
| `priya` | Priya Sharma | Mom | `member` |
| `rohan` | Rohan Verma | Cousin | `member` |
| `ananya` | Ananya Sharma | Little Sister | `child` (Restricted Child Safety Circle) |

# familyinsta
