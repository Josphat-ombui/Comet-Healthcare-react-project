# Cost Estimate

Comet Healthcare Enterprise Platform — Phase 1  
Version 1.0 · 2026-11-22 · Status: Draft for review

> Planning estimates only. Prices and exchange rates change; verify with providers before purchase. Figures exclude staff time, support contracts, and penetration-test/legal fees unless listed.

---

## 1. Launch tier — single VPS + Docker Compose (recommended)

| Item | Typical specification | Est. monthly USD | Est. monthly KES* | Notes |
|---|---|---:|---:|---|
| VPS | 4 vCPU, 8–16 GB RAM, 160–240 GB NVMe | 25–60 | 3,200–7,700 | Hetzner/Contabo/Lightsail-class; choose region after latency test |
| Domain | `.co.ke` or `.com` | 1–3 | 130–380 | Annual billing amortised |
| TLS | Caddy + Let’s Encrypt | 0 | 0 | Automated renewal |
| PostgreSQL/Redis | Self-hosted in Compose | 0 licence | 0 licence | Backup/storage costs below |
| Cloudflare R2 | 25–100 GB attachments + backups, Class A/B ops | 2–10 | 250–1,300 | No egress fees; confirm region/ODPC review |
| Off-site backup | Included in R2 above or second provider | 3–15 | 380–1,900 | Separate credentials/key |
| Monitoring | Self-hosted Prometheus/Grafana/Loki | 0 licence, extra VPS RAM | 0 | Hosted equivalent: 15–50 USD |
| Error tracking | Self-hosted GlitchTip | 0 licence | 0 | Hosted equivalent: 15–30 USD |
| SMS (Africa’s Talking) | 1,000–5,000 urgent SMS | 5–40 | 650–5,200 | Usage-based; opt-in only |
| Web Push | Self-hosted/web push | 0 | 0 | FCM free tier if Android app added |
| OIDC provider | Basic business identity | 0–15 | 0–1,900 | Provider choice pending |
| External email gateway | Transactional email for external recipients | 0–20 | 0–2,600 | Not used for internal messaging |
| **Estimated total** |  | **36–163** | **4,600–21,000** | Excludes one-off costs |

\* Indicative conversion used only for planning: **1 USD ≈ KES 128**. Confirm current rate at purchase.

---

## 2. One-off launch costs

| Item | Est. USD | Est. KES | Required? |
|---|---:|---:|---|
| Server provisioning/setup automation | 0 licence | 0 | Yes, internal effort |
| OWASP ASVS L2 remediation review | 0–2,000 | 0–256,000 | Recommended |
| Third-party penetration test | 2,500–8,000 | 320,000–1,024,000 | Recommended/possibly contractual |
| ODPC registration/data protection review | Varies | Varies | Required before processing real personal data; confirm fees |
| Statutory rate-table verification (KRA/gazette review) | Internal/legal | Internal/legal | Required before payroll/tax use |
| Restore drill automation | 0 licence | 0 | Yes |

---

## 3. Alternative tiers

### 3.1 Minimum staging / smoke tier

| Item | Est. monthly USD | Notes |
|---|---:|---|
| 2 vCPU, 4 GB VPS | 10–25 | Dev/staging only; not for 500-user production |
| R2 minimal | 1–3 | Test objects |
| **Total** | **11–28** | Suitable for CI smoke, not production |

### 3.2 k3s cluster (future)

| Item | Est. monthly USD | Notes |
|---|---:|---|
| 3 VPS nodes, 4 vCPU/8 GB each | 90–180 | Control plane + 2 workers |
| Managed load balancer | 10–25 | Optional depending provider |
| Hosted monitoring/error tracking | 30–80 | Recommended at this scale |
| Object storage/backups | 10–30 | Grows with usage |
| **Total** | **140–315** | Justified only after load thresholds are exceeded |

### 3.3 AWS Lightsail Cape Town (Africa-adjacent managed VPS)

| Item | Est. monthly USD | Notes |
|---|---:|---|
| 4 vCPU, 8 GB Lightsail plan | 40–80 | Region availability/pricing must be verified |
| Snapshots + R2/S3 off-site | 10–30 | Provider-dependent |
| **Total** | **50–110** | Simpler snapshots; higher cost than Hetzner/Contabo |

### 3.4 Hostinger static + VPS backend

Static frontend on Hostinger with API on a separate VPS is technically possible, but adds cache/CORS/deploy complexity. Recommended only if an existing Hostinger contract must be retained. Backend cost remains launch-tier; static hosting may be 0–15 USD/month.

---

## 4. Scaling triggers

Move from single VPS to k3s or split services when any of these persist for two weeks:

- Sustained CPU > 70% or memory > 80% during business hours.
- API p95 reads > 300 ms after query/index tuning.
- Realtime delivery p95 > 1 s for online users.
- More than 800 concurrent users or >5,000 messages/day.
- Worker backlog > 15 minutes for critical notifications.
- Backup window overlaps business hours.

---

## 5. Licence posture

| Component | Licence/cost posture |
|---|---|
| Node.js, Express, React, Vite, PostgreSQL, Redis, Caddy, Prometheus, Grafana, Loki | Permissive/open source (mostly MIT/Apache-2.0); verify each package at Phase 2 |
| Prisma | Apache-2.0 OSS core; paid cloud features not assumed |
| Socket.IO | MIT |
| BullMQ | MIT |
| ClamAV (if selected) | GPL-2.0 — document carefully; scan hook interface keeps alternatives possible |
| Cloudflare R2, Africa’s Talking, OIDC/email providers | Commercial usage-based; DPAs required |
| Stripe/Pesapal/Flutterwave | Commercial transaction fees; PCI scope via hosted flows |

No GPL-licensed code is linked into client bundles. Third-party services holding personal/financial data are listed in `03-deployment-topology.md` §6.
