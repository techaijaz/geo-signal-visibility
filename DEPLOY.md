# Deploying Signal AI on one Hostinger VPS

Everything runs with Docker Compose on a single server:

| Address | What |
|---|---|
| `https://your-domain.com` | Marketing website (`website/`) |
| `https://app.your-domain.com` | React app (`frontend/`) |
| `https://app.your-domain.com/api/v1` | API (`backend/`, same origin as the app) |
| `https://status.your-domain.com` | Uptime Kuma: uptime monitoring and alerts |

Containers: `nginx` (HTTPS, rate limits, the only one with open ports), `website`, `frontend`, `api`, `worker`, `mongo`, `redis`, `uptime-kuma`, `autoheal`, plus `certbot` for SSL.

> **Already running another site on the server** (for example a PM2 app behind the server's nginx)?
> Follow [Sharing the server with another site](#sharing-the-server-with-another-site): it replaces step 5 (SSL) and the SSL renewal cron job; everything else stays the same.

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
| `status` | A | server IP |

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

### Email

Signup confirmations and the Monday report emails go out through `EMAIL_PROVIDER`:

- **`smtp` (default):** create a mailbox such as `no-reply@your-domain.com` in Hostinger Email, then set
  `SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER` and `SMTP_PASS` to that mailbox,
  and `EMAIL_FROM="Signal AI" <no-reply@your-domain.com>`.
- **`resend`:** set `RESEND_API_KEY` and an `EMAIL_FROM` on a domain you have verified in Resend.

Make sure the domain has SPF, DKIM and DMARC records (Hostinger adds them when the domain uses Hostinger DNS;
check hPanel > Emails > DNS). Without them, report emails land in spam.

## 5. SSL certificate

```bash
chmod +x deploy/*.sh
./deploy/init-ssl.sh
```

This gets one Let's Encrypt certificate for `your-domain.com`, `www`, `app` and `status`.

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

## 9. Monitoring

Open `https://status.your-domain.com`, create the admin account (do this right away: the first visitor becomes admin), then add monitors:

| Monitor | Type | URL |
|---|---|---|
| Website | HTTP(s) | `https://your-domain.com` |
| App | HTTP(s) | `https://app.your-domain.com` |
| API ready | HTTP(s) | `http://api:8080/readyz` (inside Docker; fails if MongoDB or Redis is down) |
| Worker ready | HTTP(s) | `http://worker:8081/readyz` |

Add a notification (email, Telegram, Slack or a webhook) under Settings > Notifications and attach it to each monitor.

Self-healing: `api` and `worker` have healthchecks (`/healthz`). If one stops answering, `autoheal` restarts it.

## Everyday operations

| Task | Command |
|---|---|
| Deploy a new version | GitHub: **Actions > Deploy > Run workflow** (see [Deploying from GitHub](#deploying-from-github)) |
| See logs | `docker compose logs -f api worker` |
| Restart one service | `docker compose restart api` |
| Check memory use | `docker stats --no-stream` |
| Check the nginx config | `docker compose exec nginx nginx -t` |
| Health of every container | `docker compose ps` (look for `healthy`) |
| Open a Mongo shell | `docker compose exec mongo mongosh -u $MONGO_USER -p` |

## Checklist before taking payments

- [ ] Razorpay live keys in `.env`, and the website policies reviewed by a lawyer (Razorpay checks the Terms, Privacy, Refund and Contact pages during activation)
- [ ] Email works: sign-up confirmation emails arrive, and a report generated from the Reports page downloads as a full PDF
- [ ] A test purchase activates the plan and shows an invoice
- [ ] `docker compose logs worker` shows "[Scheduler] Tick complete" lines every 5 minutes
- [ ] A backup file appears in `backups/` the morning after setting up cron

## Sharing the server with another site

Use this when the VPS already serves another site (e.g. `task.hasanoud.in` with PM2) through the server's own
nginx on ports 80/443. That site is not touched: the server's nginx keeps ports 80/443 and HTTPS, and simply
forwards the Signal AI domains to the Docker stack, which listens only on `127.0.0.1:8088`.

```
Internet ─► server nginx (80/443, HTTPS) ─┬─► task.hasanoud.in ─► PM2 app (unchanged)
                                          └─► geosignalai.com, www., app., status. ─► 127.0.0.1:8088 ─► Docker nginx ─► containers
```

The existing Redis on the server is not used; Signal AI runs its own Redis inside Docker with no open port, so the two never clash.

**1. Check the server first** (nothing here changes anything):

```bash
free -h                                  # want ~2.5 GB free for Signal AI
sudo ss -tlnp | grep -E ':(80|443|8088|8443) '   # 80/443 should be nginx; 8088/8443 must be free
pm2 list
sudo nginx -t                            # the existing nginx config is valid
```

**2. DNS:** A records for `@`, `www`, `app` and `status` of `geosignalai.com` pointing at the server IP.

**3. Docker:** if `docker --version` fails, install it with `curl -fsSL https://get.docker.com | sh`.
Installing Docker does not affect PM2 or nginx.

**4. Code and settings:** steps 4 above, and in `.env` also set:

```
DOMAIN=geosignalai.com
NGINX_HTTP_BIND=127.0.0.1:8088
NGINX_HTTPS_BIND=127.0.0.1:8443
NGINX_TEMPLATES=./nginx/templates-behind-proxy
MONGO_CACHE_GB=0.5
```

**5. Start Signal AI and check it locally:**

```bash
docker compose up -d --build
docker compose ps
curl -s -H 'Host: app.geosignalai.com' http://127.0.0.1:8088/api/v1/health | head -c 120
```

**6. Hand the domains over from the server's nginx:**

```bash
sudo cp deploy/host-nginx/signal-ai.conf /etc/nginx/sites-available/signal-ai.conf
sudo ln -s /etc/nginx/sites-available/signal-ai.conf /etc/nginx/sites-enabled/signal-ai.conf
sudo nginx -t && sudo systemctl reload nginx
```

**7. HTTPS** with the server's certbot (it already renews the other site's certificate, and will renew this one too):

```bash
sudo certbot --nginx -d geosignalai.com -d www.geosignalai.com -d app.geosignalai.com -d status.geosignalai.com
```

Choose "redirect" when asked. Skip `deploy/init-ssl.sh` and the `renew-ssl.sh` cron job in this mode.

**8. Check both sites:** open `https://geosignalai.com`, `https://app.geosignalai.com` and `https://task.hasanoud.in`.

Then continue with steps 7 (first-time data), 8 (backup cron only) and 9 (monitoring) above.

**Undo** (the other site keeps running throughout):

```bash
sudo rm /etc/nginx/sites-enabled/signal-ai.conf && sudo systemctl reload nginx
docker compose down        # never add -v: that deletes the database
```

## Deploying from GitHub

Every merge to `main` builds the images (`.github/workflows/images.yml`) and pushes them to `ghcr.io/techaijaz/signal-ai-*`, tagged with the commit SHA. **Actions > Deploy > Run workflow** (or `gh workflow run deploy.yml --ref main -f environment=staging`) then deploys a commit: wait for the Images run of that commit to finish first.

The workflow logs in as the `deploy` user (repository secrets `DEPLOY_HOST`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`) and runs `deploy/deploy.sh`, which backs up MongoDB, checks out the commit, pulls the images and switches the containers. If `api` or `worker` aren't healthy within 3 minutes it puts the previous version back. The running version is `IMAGE_TAG` in `.env`.

Roll back by hand: run the workflow again with the SHA of an older commit.

## Staging

A second copy of the stack on the same server, at `staging.geosignalai.com` and `app.staging.geosignalai.com`, behind a password. It has its own MongoDB, Redis and secrets, its own frontend and website builds (`signal-ai-frontend-staging`, `signal-ai-website-staging`), and runs without autoheal and Uptime Kuma (`docker-compose.staging.yml`; production's autoheal watches staging's containers too).

One-time setup (DNS A records `staging` and `app.staging` pointing to the server first):

```bash
# as root
mkdir /opt/signal-ai-staging && chown deploy:deploy /opt/signal-ai-staging

# as deploy (su - deploy)
git clone https://github.com/techaijaz/geo-signal-visibility.git /opt/signal-ai-staging
bash /opt/signal-ai-staging/deploy/make-staging-env.sh    # add --copy-ai-keys to share production's AI keys

# as root: host nginx site, password, certificate
cp /opt/signal-ai-staging/deploy/host-nginx/signal-ai-staging.conf /etc/nginx/sites-available/
ln -s /etc/nginx/sites-available/signal-ai-staging.conf /etc/nginx/sites-enabled/
printf 'tester:%s\n' "$(openssl passwd -apr1)" > /etc/nginx/signal-ai-staging.htpasswd
chown root:www-data /etc/nginx/signal-ai-staging.htpasswd && chmod 640 /etc/nginx/signal-ai-staging.htpasswd
nginx -t && systemctl reload nginx
certbot --nginx -d staging.geosignalai.com -d app.staging.geosignalai.com
```

Then deploy to staging from GitHub, and add the first-time data in `/opt/signal-ai-staging` (section 7).

## Moving to Kubernetes later

The Compose setup is built to move over without code changes:

| Here (Compose) | On Kubernetes |
|---|---|
| `api` container | Deployment + Service, scale with replicas. Liveness probe `GET /healthz`, readiness probe `GET /readyz` on port 8080 |
| `worker` container | Deployment (no Service). Probes on port 8081, same paths. Scale with replicas; BullMQ shares the jobs between them |
| `frontend`, `website` | Deployments + Services (static nginx) |
| `nginx` edge + certbot | Ingress (ingress-nginx) + cert-manager. Rate limits move to Ingress annotations (`nginx.ingress.kubernetes.io/limit-rps`) |
| `mongo`, `redis` | Managed services (MongoDB Atlas, managed Redis) or StatefulSets with persistent volumes |
| `.env` | ConfigMap + Secret |
| `autoheal` | Not needed: liveness probes restart pods |
| `uptime-kuma` | Keep as a Deployment with a volume, or use your cloud's monitoring |

Both processes stop cleanly on `SIGTERM` (in-flight requests and running jobs finish, 25 s limit), so rolling updates don't lose work.

