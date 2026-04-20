# SFMC Bénin

Plateforme complète pour la **Société de Fabrication de Matériaux de Construction (SFMC) Bénin** :

- un **backend** microservices event-driven (9 services AdonisJS 6 / TypeScript / PostgreSQL / RabbitMQ, REST + GraphQL + WS)
- un **frontend** back-office web (Vite 5 / React 18+ / TypeScript 5.6 / Tailwind CSS v3 / shadcn/ui)

## Arborescence

```
sfmc/
├── sfmc-backend/          # 9 microservices AdonisJS (monorepo npm workspaces)
├── sfmc-frontend/         # Back-office React (Vite SPA)
├── TRACEABILITY.md        # Matrice BF 1→7 + CU-01/02/03 ↔ services, tests, smoke, UI
├── PRESENTATION_BACKEND.md
├── PRESENTATION_FRONTEND.md
├── ENDPOINTS.md           # Liste exhaustive des routes des 9 services
└── achitecture.md         # Conception détaillée
```

## Documentation

- **Backend** : [PRESENTATION_BACKEND.md](PRESENTATION_BACKEND.md) — contexte, acteurs, cas d'utilisation, architecture, modèle de données, scénarios Saga, tests.
- **Frontend** : [PRESENTATION_FRONTEND.md](PRESENTATION_FRONTEND.md) — stack, arborescence, modules, flux d'authentification, proxy, GraphQL temps réel, design system.
- **Traçabilité** : [TRACEABILITY.md](TRACEABILITY.md) — besoins fonctionnels §1→7 + CU-01/02/03 reliés aux services, événements, tests (unitaire / intégration / smoke / Playwright) et pages React.
- **Endpoints** : [ENDPOINTS.md](ENDPOINTS.md) — toutes les routes REST / GraphQL avec méthode, path, middleware, payload.
- **Conception** : [achitecture.md](achitecture.md).
- **Rapports de sprint** :
  [SPRINT_0](sfmc-backend/SPRINT_0_REPORT.md) ·
  [SPRINT_1](sfmc-backend/SPRINT_1_REPORT.md) ·
  [SPRINT_2](sfmc-backend/SPRINT_2_REPORT.md) ·
  [SPRINT_3](sfmc-backend/SPRINT_3_REPORT.md) ·
  [SPRINT_4](sfmc-backend/SPRINT_4_REPORT.md).

## Ce que couvre la plateforme

- Authentification JWT (access + refresh) et gestion des utilisateurs
- Catalogue produits (matériaux de construction)
- Stocks multi-entrepôts et mouvements logistiques
- Commandes avec Saga event-driven (choreography)
- Production, ordres de fabrication et contrôle qualité
- Facturation, paiements (CASH / MOBILE_MONEY / BANK_TRANSFER) et export PDF
- Notifications email (Brevo SMTP) et SMS (stub)
- Reporting CQRS et dashboard temps réel (GraphQL Subscriptions)
- Sécurité OWASP, health checks profonds (DB + RabbitMQ), rate limiting

## Architecture en bref

- **9 microservices** — 1 domaine = 1 service = 1 base PostgreSQL
- **REST** pour les appels synchrones, **RabbitMQ** (`sfmc.events` + DLX) pour l'async
- **GraphQL** sur product/inventory/order/reporting, **WS graphql-ws** pour les subscriptions reporting
- **Reporting CQRS** : projections des événements dans des tables dédiées
- **Front SPA** : proxy Vite dispatchant `/api/v1/*` et `/graphql` vers les 9 services ; aucun BFF

---

## Démarrage du backend

Depuis `sfmc-backend/` :

```powershell
npm install
npm run start:full   # démarre Docker Compose + les 9 services en parallèle
```

`start:full` exécute `infra:up` (Postgres × 9 + RabbitMQ) puis `dev:all` (les 9 services via `concurrently` avec préfixes de logs colorés).

Initialiser les schémas + données de démo (dans chaque service concerné) :

```powershell
# Migrations (à faire une fois par service)
cd services/auth-service     && node ace migration:run
cd ../user-service           && node ace migration:run
cd ../product-service        && node ace migration:run
cd ../inventory-service      && node ace migration:run
cd ../order-service          && node ace migration:run
cd ../production-service     && node ace migration:run
cd ../billing-service        && node ace migration:run
cd ../notification-service   && node ace migration:run
cd ../reporting-service      && node ace migration:run

# Seeders (utilisateurs + catalogue + stocks)
cd ../auth-service      && node ace db:seed
cd ../user-service      && node ace db:seed
cd ../product-service   && node ace db:seed
cd ../inventory-service && node ace db:seed
```

### Comptes par défaut (seedés)

| Rôle       | Email              | Mot de passe     |
|------------|--------------------|------------------|
| `ADMIN`    | admin@sfmc.bj      | `Admin@2026`     |
| `OPERATOR` | operator@sfmc.bj   | `Operator@2026`  |
| `CLIENT`   | client@sfmc.bj     | `Client@2026`    |

> ⚠️ **`JWT_SECRET` doit être identique sur les 9 services** (`services/*/.env`). Valeur partagée par défaut : `sfmc-auth-jwt-secret-2025-change-in-production`.

## Démarrage du frontend

Depuis `sfmc-frontend/` (avec le backend démarré) :

```powershell
npm install
npm run dev
# → http://localhost:5173
```

Build production :

```powershell
npm run build      # tsc -b && vite build → dist/
npm run preview
```

---

## Tests backend

- **Tests unitaires** par service : `node ace test unit` (95+ tests au vert)
- **Tests d'intégration** (stack live requise) : `node ace test integration`
  - `order-service/tests/integration/cu01_flow.spec.ts` — CU-01 nominal (order → saga → facture → notif email)
  - `order-service/tests/integration/cu01_production.spec.ts` — CU-01 production (stock insuffisant → OF → COMPLETED)
  - `order-service/tests/integration/cu_compensation.spec.ts` — saga compensation `INSUFFICIENT_STOCK`
  - `inventory-service/tests/integration/cu03_critical.spec.ts` — CU-03 (mouvement OUT < seuil → notif EMAIL)
- **Smoke test unifié CU-01 / CU-02 / CU-03 + sécurité** (28 assertions) :
  - Windows : `sfmc-backend\smoke_test_cu.ps1`
  - Linux / CI : `sfmc-backend/smoke_test_cu.sh` (requiert `jq`, `uuid-runtime`)
  - Génère `smoke_report.txt` (PASS/FAIL par assertion) ; exit code ≠ 0 si un test échoue.
- Vérification Brevo email : `.\test_email_brevo.ps1`

## Services backend et ports

| Service              | Port | Base PostgreSQL     | DB port | API                        |
|----------------------|------|---------------------|---------|----------------------------|
| auth-service         | 3001 | `sfmc_auth`         | 5431    | REST                       |
| user-service         | 3002 | `sfmc_user`         | 5440    | REST                       |
| product-service      | 3003 | `sfmc_product`      | 5433    | REST + GraphQL             |
| inventory-service    | 3004 | `sfmc_inventory`    | 5434    | REST + GraphQL             |
| order-service        | 3005 | `sfmc_order`        | 5435    | REST + GraphQL             |
| production-service   | 3006 | `sfmc_production`   | 5436    | REST                       |
| billing-service      | 3007 | `sfmc_billing`      | 5437    | REST                       |
| notification-service | 3008 | `sfmc_notification` | 5438    | REST (consommateur)        |
| reporting-service    | 3009 | `sfmc_reporting`    | 5439    | REST + GraphQL + WebSocket |
| RabbitMQ AMQP        | 5672 | —                   | —       | —                          |
| RabbitMQ UI          | 15672| —                   | —       | guest / guest              |

## État du projet

- **Couverture fonctionnelle** : les besoins **BF §1 à §7** (production, commercial, logistique, catalogue, auth & sécurité, notifications e-mail, reporting) et les cas **CU-01 / CU-02 / CU-03** sont implémentés et tracés dans [TRACEABILITY.md](TRACEABILITY.md) (chaque ligne dispose d’au moins une preuve de test ou d’UI).
- **Backend** : sprints **0 → 5** (voir [PRESENTATION_BACKEND.md](PRESENTATION_BACKEND.md) §10) — 9 services AdonisJS, `npm run build` sur l’ensemble des workspaces, smoke unifié **28/28** assertions (`smoke_test_cu.sh` / `.ps1`), tests d’intégration CU sur **order-service** et **inventory-service** avec stack live, facturation et matrice e-mail couvertes par tests fonctionnels + smoke CU-01.
- **Frontend** : back-office (dashboard, commandes & timeline saga, production, stocks, facturation, rapports CSV/période, catalogue, utilisateurs, notifications) — **espace CLIENT** (`/my-orders`, `/my-invoices`), **Playwright** (6 scénarios : login 3 rôles, flux commande, badge temps réel en moins de 5 s). Build : `npm run build` (0 erreur TypeScript).
- **Infra** : Docker Compose développement ; fichier `docker-compose.prod.yml` validé (`docker compose … config`). Manifests Kubernetes dans `sfmc-backend/infra/k8s/`. Le démarrage complet des **9 images applicatives** en mode prod sur une machine unique peut entrer en conflit avec la stack dev (ports / noms de conteneurs) : à valider sur environnement dédié ou en pipeline d’images.

## CI/CD (GitHub Actions)

Le pipeline `.github/workflows/ci.yml` exécute à chaque `push` / `pull_request` :

- un job `build-test` en matrice sur les 9 services (install monorepo, lint, build TS, tests unitaires)
- un job `smoke-test` qui démarre l'infra (`docker compose up`), lance les 9 services via
  `scripts/start_all_services.sh`, réhydrate les bases (seeders admin + produits + stocks)
  puis exécute `smoke_test_cu.sh` (28 assertions CU-01/02/03 + sécurité). Le pipeline échoue
  dès qu'une assertion est FAIL.
- un job `docker-build` (sur `push main`) qui construit et pousse les 9 images vers
  `ghcr.io/<owner>/sfmc-<service>:<sha>` et `:latest`
- un job `deploy` manuel (`workflow_dispatch`) qui applique les manifests Kubernetes après
  substitution des secrets via `infra/k8s/apply-secrets.sh`

### Secrets GitHub à configurer

Dans *Settings → Secrets and variables → Actions* :

| Secret             | Usage                                                    |
|--------------------|----------------------------------------------------------|
| `JWT_SECRET_CI`    | Valeur injectée dans `.env` CI et dans le Secret K8s     |
| `DB_PASSWORD_CI`   | Mot de passe Postgres (dev = `postgres` par défaut)      |
| `APP_KEY_CI`       | `APP_KEY` AdonisJS (≥ 32 caractères)                     |
| `GHCR_TOKEN`       | PAT avec scope `write:packages` si `GITHUB_TOKEN` ne suffit pas |
| `KUBECONFIG`       | Kubeconfig encodé base64 (job `deploy` uniquement)       |

> Le job `docker-build` utilise `GITHUB_TOKEN` par défaut (`packages: write` déjà autorisé
> dans le workflow). Créer un `GHCR_TOKEN` seulement si on publie dans une autre org.
