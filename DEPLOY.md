# Deploying Signal AI on one Hostinger VPS

Everything runs with Docker Compose on a single server:

| Address | What |
|---|---|
| `https://your-domain.com` | Marketing website (`website/`) |
| `https://app.your-domain.com` | React app (`frontend/`) |
| `https://app.your-domain.com/api/v1` | API (`backend/`, same origin as the app) |

Containers: `nginx` (HTTPS, the only one with open ports), `website`, `frontend`, `api`, `worker`, `mongo`, `redis`, plus `certbot` for SSL.

## 1. Server

- **Plan:** Hostinger **KVM 2** (2 vCPU, 8 GB RAM) is the minimum. MongoDB, Redis, two Node processes and headless Chrome for PDF reports need the memory. Move to KVM 4 when you pass a few hundred active brands.
- **OS:** Ubuntu 24.04. The "Ubuntu 24.04 with Docker" template saves a step.
- Note the server's IP address from hPanel.

## 2. DNS

In the DNS zone of your domain, create three **A records** pointing at the server IP:

| Name | Type | Value |
|---|---|---|
| `@` | A | server IP |
| `www` | A | server IP |
| `app` | A | server IP |

Wait until `ping app.your-domain.com` shows the server IP before step 5.

## 3. Prepare the server

```bash
ssh root@SERVER_IP

# Docker (skip if you picked the Docker template)
curl -fsSL https://get.docker.com | sh

# Firewall: only SSH and web
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

# 4 GB swap so builds don't run out of memory
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 4. Get the code and configure it

```bash
git clone https://github.com/techaijaz/geo-signal-visibility.git /opt/signal-ai
cd /opt/signal-ai
cp .env.docker.example .env
nano .env
```

Fill in every value. Generate each secret and password with `openssl rand -hex 32`.

Also fill in the company details in `website/src/config/site.ts` (legal name, address, GSTIN, grievance officer). They appear in the footer and the policies.

## 5. SSL certificate

```bash
chmod +x deploy/*.sh
./deploy/init-ssl.sh
```

This gets one Let's Encrypt certificate for `your-domain.com`, `www.your-domain.com` and `app.your-domain.com`.

## 6. Start everything

```bash
docker compose up -d --build
docker compose ps          # all services should be "running" / "healthy"
```

The first build takes 5 to 10 minutes.

## 7. First-time data

```bash
docker compose exec api node script/seed-categories.js
docker compose exec api node script/sync-ai-models.js
```

Then:

1. Open `https://app.your-domain.com`, sign up with your own email and confirm it.
2. Make yourself admin:
   ```bash
   docker compose exec api node script/make-admin.js you@your-domain.com
   ```
3. Log out and back in, open **Admin > API Keys** and add the keys for OpenAI, Gemini, Anthropic, xAI, DeepSeek and Perplexity.

## 8. Scheduled jobs (cron)

```bash
crontab -e
```

Add:

```
# Renew SSL (only renews when close to expiry)
0 3 * * * /opt/signal-ai/deploy/renew-ssl.sh >> /var/log/signal-ssl.log 2>&1
# Daily database backup, keeps the last 14
30 2 * * * /opt/signal-ai/deploy/backup-mongo.sh >> /var/log/signal-backup.log 2>&1
```

Backups are stored in `/opt/signal-ai/backups`. Also turn on Hostinger's weekly VPS backups or copy that folder elsewhere; a backup on the same disk doesn't survive a lost server.

Restore with `./deploy/restore-mongo.sh backups/<file>` (asks before replacing data).

## Everyday operations

| Task | Command |
|---|---|
| Deploy a new version | `git pull && docker compose up -d --build` |
| See logs | `docker compose logs -f api worker` |
| Restart one service | `docker compose restart api` |
| Check memory use | `docker stats --no-stream` |
| Open a Mongo shell | `docker compose exec mongo mongosh -u $MONGO_USER -p` |

## Checklist before taking payments

- [ ] Razorpay live keys in `.env`, and the website policies reviewed by a lawyer (Razorpay checks the Terms, Privacy, Refund and Contact pages during activation)
- [ ] SMTP works: sign-up confirmation emails arrive
- [ ] A test purchase activates the plan and shows an invoice
- [ ] `docker compose logs worker` shows "[Scheduler] Tick complete" lines every 5 minutes
- [ ] A backup file appears in `backups/` the morning after setting up cron
