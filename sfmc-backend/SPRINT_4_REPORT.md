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
