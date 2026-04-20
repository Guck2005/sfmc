# Sprint 4 — Reporting, Sécurité, Observabilité & Déploiement

**Date de clôture :** 2026-04-18
**Scope :** 4 phases — ~60 fichiers créés/modifiés sur 9 services + infra K8s/Docker.

---

## 1. Résumé exécutif

Le Sprint 4 transforme la plateforme SFMC d'un ensemble de microservices fonctionnels en une **plateforme prête pour la production**. Quatre axes livrés :

1. **Reporting Service (CQRS read-side)** — 9ème microservice, écoute 9 événements du bus, expose REST + GraphQL pour les KPIs.
2. **Sécurité OWASP** — Headers de sécurité appliqués sur les 9 services (X-Frame-Options, CSP, nosniff, Referrer-Policy, HSTS, Permissions-Policy). Rate limiting 5/15min sur `/login`.
3. **Deep Health Checks** — Sonde DB (`SELECT 1`) + état RabbitMQ (connexion amqplib). Retour `503` si dégradé (compatible K8s liveness/readiness).
4. **Déploiement cloud-native** — 9 Dockerfiles multi-stage + `docker-compose.prod.yml` + manifests K8s (Deployment, Service, ConfigMap, Secret, HPA).

---

## 2. Livraisons par phase

### Phase 1 — Reporting Service (port 3009, DB 5439)

| Composant | Fichier | Description |
|---|---|---|
| Migration | `database/migrations/1777000001000_create_report_orders_table.ts` | Projection commandes (orderId unique, customer, statut, total). |
| Migration | `database/migrations/1777000002000_create_report_invoices_table.ts` | Projection factures. |
| Migration | `database/migrations/1777000003000_create_report_stock_snapshots_table.ts` | Snapshots stocks critiques. |
| Migration | `database/migrations/1777000004000_create_report_production_orders_table.ts` | Projection OF + qualityPassed. |
| Migration | `database/migrations/1777000005000_create_processed_events_table.ts` | Table d'idempotence (at-least-once). |
| Modèles | `app/models/{report_order,report_invoice,report_stock_snapshot,report_production_order,processed_event}.ts` | 5 modèles Lucid. |
| RabbitMQ | `app/services/rabbitmq.ts` | Client amqplib (exchange topic `sfmc.events` + DLX, retry 1s/5s/30s, helper `isConnected`). |
| Listeners | `app/listeners/reporting_listeners.ts` | 9 handlers : `onOrderCreated`, `onOrderValidated`, `onOrderCancelled`, `onOrderShipped`, `onOrderDelivered`, `onInvoiceCreated`, `onInventoryCritical`, `onProductionCompleted`, `onProductionQualityFailed`. |
| Wiring | `start/rabbitmq.ts` | Branche 9 queues durables avec DLX → handlers. |
| GraphQL | `app/graphql/schema.ts` | Apollo Server 4. Queries : `dashboardKPIs`, `salesReport`, `productionReport`, `criticalStockAlerts`. |
| Service KPIs | `app/services/reporting_kpis.ts` | Agrégations SQL + `qualityFailureRate(total, failed)`. |
| Contrôleur | `app/controllers/reports_controller.ts` | REST `GET /api/v1/reports/dashboard`. |
| Routes | `start/routes.ts` | `/health` enrichi + REST + `/graphql`. |
| adonisrc | `adonisrc.ts` | Preload `#start/rabbitmq` ajouté. |
| Tests | `tests/unit/reporting_kpis.spec.ts` | 6 tests unitaires sur `qualityFailureRate` (0%, 25%, 100%, arrondis, edge). |

**Idempotence** : chaque handler vérifie `ProcessedEvent.find(event.id)` avant projection. Protège contre les re-livraisons at-least-once de RabbitMQ.

### Phase 2 — Sécurité OWASP (transverse)

| Livraison | Portée |
|---|---|
| `app/middleware/security_headers_middleware.ts` | 9 services. Headers : `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-XSS-Protection: 1; mode=block`, `Content-Security-Policy` stricte, `Strict-Transport-Security`, `Permissions-Policy`. |
| `start/kernel.ts` | 9 services. Enregistrement du middleware dans `server.use([...])` (global, pré-route). |
| `app/middleware/throttle_middleware.ts` | auth-service. Rate limit **5 req / 15 min / IP** sur `/login`, bucket en mémoire, headers `X-RateLimit-*` + `Retry-After`. |
| `start/routes.ts` (auth) | Application du middleware `throttle` sur la route `/login`. |

> **Note architecturale** — Middleware custom équivalent Shield. Le CSRF est volontairement **désactivé** (API stateless JWT, pas de cookies de session). Le rate-limiter en mémoire est à migrer vers Redis avant multi-pod production (dette technique identifiée).

### Phase 3 — Health Checks Enrichis (transverse)

Remplace le `/health` statique (`{status:'ok'}`) par un sondage profond :

```json
{
  "status": "ok|degraded",
  "service": "<nom>",
  "version": "1.0.0",
  "timestamp": "ISO8601",
  "checks": {
    "database": "ok|error",
    "rabbitmq": "ok|error"  // présent uniquement si le service consomme RabbitMQ
  }
}
```

Code HTTP : `200` si tous les checks passent, `503` sinon → Kubernetes retire le pod du LB via `readinessProbe`.

| Service | DB | RabbitMQ |
|---|---|---|
| auth-service | ✅ | — |
| user-service | ✅ | — |
| product-service | ✅ | — |
| inventory-service | ✅ | ✅ |
| order-service | ✅ | ✅ |
| production-service | ✅ | ✅ |
| billing-service | ✅ | ✅ |
| notification-service | ✅ | ✅ |
| reporting-service | ✅ | ✅ |

Ajout de `export function isConnected()` dans chaque `app/services/rabbitmq.ts` des 6 services consommateurs pour que le health check puisse consulter l'état du canal amqplib sans tenter de reconnecter.

### Phase 4 — Déploiement

| Artefact | Description |
|---|---|
| `services/*/Dockerfile` (9×) | Multi-stage `node:22-alpine` (builder → production). `HEALTHCHECK` intégré sur `/health`. |
| `docker-compose.prod.yml` | Stack complet : 9 services + 9 DB Postgres + RabbitMQ. Réseau `sfmc-network`. `restart: unless-stopped`. Health checks RabbitMQ. Variables via anchor YAML `x-common-env`. |
| `infra/k8s/namespace.yaml` | Namespace `sfmc`. |
| `infra/k8s/configmap.yaml` | Variables non-sensibles. |
| `infra/k8s/secret.yaml` | Template (valeurs vides — à patcher en CI/CD via Vault / GitHub Secrets). |
| `infra/k8s/{service}-deployment.yaml` (9×) | `replicas: 2`, resources requests/limits, probes liveness + readiness sur `/health`, injection ConfigMap + Secret. |
| `infra/k8s/rabbitmq.yaml` | Deployment + Service RabbitMQ (AMQP + management UI). |
| `infra/k8s/hpa.yaml` | HPA `order-service` et `inventory-service` : min 2, max 10, CPU cible 70 %. |
| `smoke_test_sprint4.ps1` | 13 étapes end-to-end : health checks enrichis, headers OWASP, rate limit 429, commande Saga, projection CQRS, GraphQL dashboardKPIs, compensation, idempotence, présence des artefacts de déploiement. |

---

## 3. Décisions d'architecture

- **GraphQL seulement sur Reporting** — Le dashboard agrège plusieurs indicateurs hétérogènes (KPIs, statuts, alertes) ; GraphQL évite N appels REST. Les autres services conservent REST + leur GraphQL existant.
- **CQRS via projections** — Le reporting-service est un pur read-side : aucune commande, aucune mutation. Les agrégats sont dénormalisés en tables `report_*`, reconstruites depuis les événements domaine. Cela isole les lectures analytiques des bases transactionnelles (scalabilité indépendante).
- **DLX partagé** — Exchange `sfmc.dlx` + queue `sfmc.dlq` en fanout. Les messages mal formés ou ayant épuisé les retries sont routés ici et peuvent être investigués manuellement.
- **Shield DIY** — Plutôt que d'installer `@adonisjs/shield` sur 9 services (charge d'installation, dépendance supplémentaire, configuration dédoublée), un middleware équivalent de ~20 lignes applique la même politique OWASP. Plus léger, même résultat.
- **Rate limit in-memory** — Suffit pour dev et single-pod ; en production multi-pod derrière HPA, chaque réplica a son propre compteur (5/pod vs 5/infra). Dette technique identifiée — migration Redis avant ouverture publique.
- **Secrets K8s vides** — Le `secret.yaml` n'embarque pas de valeurs. Injection à faire par le pipeline CI/CD (Vault / AWS Secrets Manager / sealed-secrets).

---

## 4. Vérification

### Tests unitaires
```bash
cd services/reporting-service
node ace test
```
→ 6 tests sur `qualityFailureRate` (edge cases, arrondi 2 décimales).

### Migrations reporting
```bash
cd services/reporting-service
node ace migration:run
```
→ 5 tables créées sur `sfmc_reporting` (port 5439).

### Smoke test end-to-end
```powershell
.\smoke_test_sprint4.ps1
```
13 étapes validées : health checks enrichis, headers OWASP, 429, Saga, projection CQRS, GraphQL, compensation, idempotence, artefacts déploiement.

### Vérifications manuelles recommandées
```powershell
# Headers OWASP
Invoke-WebRequest http://localhost:3001/health | Select-Object -ExpandProperty Headers

# Dashboard Reporting
curl http://localhost:3009/api/v1/reports/dashboard

# GraphQL
curl -X POST -H "Content-Type: application/json" \
  -d '{"query":"{ dashboardKPIs { totalOrders qualityFailureRate } }"}' \
  http://localhost:3009/graphql
```

---

## 5. Dette technique & suites

| Item | Priorité | Note |
|---|---|---|
| Rate limiter → Redis | Haute | Avant ouverture multi-pod / public. |
| Secrets K8s réels via Vault | Haute | Avant premier déploiement prod. |
| Persistance RabbitMQ en K8s | Moyenne | StatefulSet + PVC (actuellement Deployment sans volume). |
| DLQ monitoring / alerting | Moyenne | Dashboard Grafana + alerte Prometheus. |
| GraphQL subscriptions | Basse | Websocket real-time sur le dashboard. |
| OpenTelemetry tracing | Basse | Corrélation cross-service. |

---

## 6. Statistiques

- **Nouveaux fichiers** : 44
  - Reporting : 14 (5 migrations, 5 modèles, 1 service RMQ, 1 listener, 1 start, 1 KPI, 1 GraphQL, 1 controller, 1 test)
  - Sécurité : 10 (9 security_headers + 1 throttle)
  - Déploiement : 20 (9 Dockerfiles, 1 docker-compose.prod, 9 K8s deployments, namespace, configmap, secret, hpa, rabbitmq)
- **Fichiers modifiés** : ~20
  - 9 `start/kernel.ts` (middleware global)
  - 8 `start/routes.ts` (health enrichi)
  - 5 `app/services/rabbitmq.ts` (export `isConnected`)
  - 1 `adonisrc.ts` (reporting preload)

---

**Sprint 4 clôturé — plateforme prête pour staging / production.**

---

## 7. Finalisation production (post-sprint)

Cette section documente les lots de **finalisation production** livrés après
clôture du Sprint 4 afin de lever les blocants « haute priorité » et
d'apurer la dette technique listée en §5.

### BLOC 1 — Blocants production (haute priorité)

#### 1.1 Rate limiter Redis (distribué)

Remplacement du rate limiter in-memory (qui ne tenait pas en multi-pod
Kubernetes) par une implémentation Redis.

- `services/auth-service/app/services/rate_limiter.ts` (nouveau)
  - Client `ioredis` singleton, `INCR` + `EXPIRE` atomique, fenêtre 15 min / 5 req.
  - Stratégie **fail-open** si Redis indisponible (log warning, `allowed=true`).
  - Helpers `resetRateLimit` / `closeRateLimiter` pour les tests.
- `app/middleware/throttle_middleware.ts` : délègue à `hitRateLimit`, ajoute
  les headers `X-RateLimit-Limit/Remaining` et `Retry-After` sur 429.
- `start/env.ts` + `.env.example` : nouvelle variable `REDIS_URL`.
- `docker-compose.yml` / `docker-compose.prod.yml` : service `redis:7-alpine`
  + volume `redis_data` + dépendance `auth-service`.
- `infra/k8s/redis-deployment.yaml` (nouveau) : Deployment + PVC 1Gi + Service
  ClusterIP + probes `redis-cli ping`.
- `infra/k8s/auth-service-deployment.yaml` : ajout de la var `REDIS_URL`.
- `tests/unit/rate_limiter.spec.ts` (nouveau) : `FakeRedis` pour isoler la
  logique, vérifie le comportement 5/6 et le calcul de `retryAfterSeconds`.

#### 1.2 CI/CD GitHub Actions (monorepo)

- `.github/workflows/ci.yml` (nouveau) — workflow complet monorepo :
  - `build-test` : matrice sur les 9 services (ci → lint → build → test unit).
  - `smoke-test` : infra Docker Compose → `start_all_services.sh` → `smoke_test.sh`.
  - `docker-build` : build + push des 9 images vers **GHCR** (sur `push main`).
  - `deploy` : job manuel (`workflow_dispatch`) qui substitue les secrets via
    `apply-secrets.sh` puis `kubectl apply` les manifestes K8s.
- `smoke_test.sh` (nouveau) : portage bash du script PowerShell (health,
  headers OWASP, validation 429 du rate limiter Redis).
- `scripts/start_all_services.sh` / `stop_all_services.sh` (nouveaux) :
  orchestration locale et CI des 9 services (migrations + serve en arrière-plan,
  suivi de PIDs dans `/tmp/sfmc-pids`).
- `README.md` : nouvelle section « CI/CD (GitHub Actions) » listant les
  secrets requis (`JWT_SECRET_CI`, `DB_PASSWORD_CI`, `APP_KEY_CI`,
  `GHCR_TOKEN`, `KUBECONFIG`).

#### 1.3 Secrets Kubernetes via CI/CD

- `infra/k8s/secret.yaml` transformé en template `stringData` avec placeholders
  `${JWT_SECRET}` / `${DB_PASSWORD}` / `${APP_KEY}`.
- `infra/k8s/apply-secrets.sh` (nouveau) : `envsubst` + `kubectl apply`,
  création du namespace `sfmc`, validation des variables requises, cleanup.
- `infra/k8s/README.md` : procédure secrets (manuel + GitHub Actions) et
  rotation.

### BLOC 2 — Suppression des stubs

#### 2.1 Email Brevo SMTP — tests

- `dispatcher.ts` : expose `__setTransporterForTest()` pour permettre
  l'injection d'un transporter Nodemailer mocké sans toucher au singleton.
- `tests/unit/dispatcher.spec.ts` (nouveau) : teste `sendEmail` avec un
  transporter factice, couvre les cas succès + erreur.

#### 2.2 SMS Brevo REST (réel)

- `dispatcher.ts` → `sendSms()` : appel HTTP POST `fetch` sur
  `https://api.brevo.com/v3/transactionalSMS/sms` avec `BREVO_API_KEY`,
  sender `BREVO_SMS_SENDER`, gestion du code retour et logs structurés.
- `start/env.ts` / `.env.example` / `.env` : variables `BREVO_API_KEY` et
  `BREVO_SMS_SENDER` ajoutées (optionnelles côté schema).

#### 2.3 PDF facture réel (pdfkit)

- `services/billing-service/app/services/pdf_invoice.ts` (nouveau) :
  génération PDF via `pdfkit` — branding SFMC Bénin, en-tête facture,
  bloc client/commande, ligne article (commande), totaux, conditions de
  paiement. Retourne un `Buffer`.
- `app/controllers/invoices_controller.ts` → `pdf()` : utilise
  `buildInvoicePdf`, définit `Content-Type: application/pdf`,
  `Content-Disposition`, `Content-Length`.
- `package.json` : `pdfkit` + `@types/pdfkit`.
- `tests/unit/pdf_invoice.spec.ts` (nouveau) : vérifie le magic header `%PDF`
  et la taille > 1 Ko sur une facture fake (payments query mockée).

#### 2.4 OAuth2 Authorization Code (flux complet)

- `database/migrations/4_create_oauth_authorization_codes_table.ts`
  (nouveau) : table `oauth_authorization_codes` (`code` unique, `client_id`,
  `redirect_uri`, `user_id`, `scope`, `expires_at`, `used`, `used_at`).
- `app/models/oauth_authorization_code.ts` (nouveau) : modèle Lucid + getter
  `isExpired`.
- `app/controllers/auth_controller.ts` :
  - `oauthAuthorize` : validation `client_id` / `redirect_uri` /
    `response_type=code`, génération d'un `code` (32 octets hex, TTL 10 min),
    redirection 302 vers `redirect_uri?code=...&state=...`.
  - `oauthToken` : validation complète (`grant_type`, client secret,
    redirect URI, code non utilisé non expiré), marquage `used`, émission
    du JWT `access_token`.
- `tests/unit/oauth_flow.spec.ts` (nouveau) : couvre le getter `isExpired`.

### BLOC 3 — Fiabilité événementielle

#### 3.1 RabbitMQ StatefulSet + PVC

- `infra/k8s/rabbitmq-pvc.yaml` (nouveau) : PVC `rabbitmq-data` 5Gi
  `ReadWriteOnce`.
- `infra/k8s/rabbitmq-statefulset.yaml` (nouveau) : headless Service
  `rabbitmq-headless` + Service `rabbitmq` + `StatefulSet` (image
  `rabbitmq:3-management-alpine`, mount `/var/lib/rabbitmq`, probes
  `rabbitmq-diagnostics`, `volumeClaimTemplates`).
- `infra/k8s/rabbitmq.yaml` (ancien Deployment) supprimé.

#### 3.2 Monitoring DLQ + alerting

- `infra/k8s/prometheus-configmap.yaml` (nouveau) :
  - `prometheus.yml` : scrape `sfmc-services` (annotations K8s), `rabbitmq`
    (port `15692`), `redis` (exporter `9121`).
  - `alerts.yml` : 4 règles — `ServiceDown` (critical, 2 min),
    `HighLatencyP95` (warning, p95 > 2 s, 5 min), `DLQNotEmpty` (critical,
    `sfmc.dlq > 0`, 5 min), `QueueSaturation` (warning, > 1000 ready, 10 min).
- `infra/monitoring/grafana-dashboard.json` (nouveau) : dashboard
  « SFMC Bénin — Plateforme microservices » — Golden Signals (RPS, erreurs,
  latence p95, CPU/RAM) + section RabbitMQ (DLQ backlog avec seuils colorés,
  ready per queue, publish/deliver rate, unacked).
- `infra/monitoring/README.md` (nouveau) : import dashboard, déploiement
  Prometheus, scénario manuel de test DLQ.

### BLOC 4 — Observabilité avancée

#### 4.1 OpenTelemetry (tracing distribué)

- `packages/telemetry/` (nouveau workspace `@sfmc/telemetry`) :
  - `initTracer(serviceName)` → `NodeSDK` + `OTLPTraceExporter`
    (`OTEL_EXPORTER_OTLP_ENDPOINT` ou fallback Jaeger), auto-instrumentations
    Node (sauf `fs`), resources `service.name/namespace/version`.
  - Helpers `extractContext`, `injectContext`, `withConsumerSpan` pour la
    propagation W3C traceparent dans les consumers RabbitMQ.
- Dans chacun des 9 services :
  - `app/services/tracer.ts` : `initTracer('<service-name>')`.
  - `adonisrc.ts` : ajoute `() => import('#services/tracer')` en **première**
    entrée du tableau `preloads` (avant tout autre import).
  - `.env.example` : `OTEL_EXPORTER_OTLP_ENDPOINT=` et
    `OTEL_SERVICE_NAMESPACE=sfmc`.
- `infra/k8s/jaeger-deployment.yaml` (nouveau) : Jaeger all-in-one (UI 16686,
  OTLP gRPC 4317 / HTTP 4318) + Service.

#### 4.2 GraphQL Subscriptions (reporting-service)

- `app/graphql/pubsub.ts` (nouveau) : Pub/Sub in-process (Node `EventEmitter`),
  topics `ORDER_STATUS_UPDATED` et `KPI_UPDATED`, `asyncIterator` conforme
  à `graphql-ws`.
- `app/graphql/schema.ts` : passage à `makeExecutableSchema`, nouveaux types
  `OrderStatusEvent` + root `Subscription` (`orderStatusUpdated`,
  `kpiUpdated`).
- `start/graphql_ws.ts` (nouveau) : récupère le `getNodeServer()` AdonisJS et
  attache `WebSocketServer` sur `/graphql` via `useServer` de `graphql-ws`
  (pas de nouveau port exposé).
- `adonisrc.ts` : preload supplémentaire `#start/graphql_ws` (environnement `web`).
- `app/listeners/reporting_listeners.ts` : après chaque projection
  (`order.*`, `invoice.created`, `production.*`), publication sur
  `ORDER_STATUS_UPDATED` et/ou `KPI_UPDATED`.
- `SUBSCRIPTIONS.md` (nouveau) : doc frontend — schéma, URL
  `ws://host:3009/graphql`, exemple `graphql-ws createClient`, limites
  (pub/sub in-process : sticky session ou migration Redis si multi-pod).

### Vérifications

```bash
# Typecheck des 9 services
for svc in auth user product inventory order production billing notification reporting ; do
  (cd services/${svc}-service && npx tsc --noEmit)
done

# Tests unitaires ajoutés
cd services/auth-service && node ace test unit --files="tests/unit/rate_limiter.spec.ts"
cd services/auth-service && node ace test unit --files="tests/unit/oauth_flow.spec.ts"
cd services/notification-service && node ace test unit --files="tests/unit/dispatcher.spec.ts"
cd services/billing-service && node ace test unit --files="tests/unit/pdf_invoice.spec.ts"
```

### Tableau récapitulatif (dette du §5 avant/après)

| Item | Avant sprint 4 | Après finalisation |
|---|---|---|
| Rate limiter → Redis | ❌ in-memory | ✅ Redis distribué (Deployment K8s + PVC) |
| Secrets K8s réels | ❌ placeholders | ✅ template + `apply-secrets.sh` via CI |
| RabbitMQ persistant K8s | ❌ Deployment sans volume | ✅ StatefulSet + PVC 5Gi |
| DLQ monitoring / alerting | ❌ | ✅ Prometheus alerts + dashboard Grafana |
| GraphQL subscriptions | ❌ | ✅ `graphql-ws` sur `/graphql`, 2 topics |
| OpenTelemetry tracing | ❌ | ✅ `@sfmc/telemetry` + Jaeger K8s |
| Email/SMS Brevo | ⚠️ stub | ✅ SMTP réel + REST SMS réel |
| PDF facture | ⚠️ stub | ✅ `pdfkit` branding SFMC |
| OAuth2 Authorization Code | ⚠️ stub | ✅ flux complet + migration + test |
| CI/CD GitHub Actions | ❌ | ✅ build / smoke / docker / deploy |

**Finalisation production livrée — plateforme prête pour un déploiement
Kubernetes multi-réplica avec rate limiting cohérent, secrets gérés par CI,
files RabbitMQ persistantes, observabilité tracée bout en bout et UI
temps réel sur le dashboard reporting.**
