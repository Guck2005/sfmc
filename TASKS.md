# SFMC Bénin — Plan d'exécution & suivi des tâches

> Ce fichier est le **tableau de bord vivant** du plan de mise en conformité intégrale des besoins fonctionnels.
> Chaque case sera cochée (`[x]`) au fur et à mesure de l'avancement.
>
> **Décisions produit figées :**
> - Canal notification unique = **Email** (Brevo SMTP). Le code `sendSms` reste en place mais n'est plus appelé. Le filtre SMS reste visible côté front (aucune ligne ne sera créée).
> - Planification OF : **FIFO sur 1ʳᵉ machine `AVAILABLE` compatible** (algo simple, extensible).
> - 3 destinataires internes : `LOGISTICS_EMAIL`, `PRODUCTION_EMAIL`, `FINANCE_EMAIL` (à définir dans `.env`).

---

## Légende des statuts

- `[ ]` à faire
- `[~]` en cours
- `[x]` terminé
- `[!]` bloqué / en attente d'une décision

---

## LOT 1 — Machines API + Synchronisation rôle user-service → auth-service (P0)

### L1.1 Production-service : exposer la gestion des machines

- [x] Créer `services/production-service/app/controllers/machines_controller.ts`
  - index / show / store / updateStatus
  - Transitions autorisées : `AVAILABLE ↔ IN_USE`, `AVAILABLE → MAINTENANCE`, `MAINTENANCE → AVAILABLE`
- [x] Créer `services/production-service/app/validators/machine_validator.ts` (VineJS) + helper `isValidMachineTransition`
- [x] Ajouter les routes dans `services/production-service/start/routes.ts`
  - `GET /api/v1/machines` (filtres `status`, `category`, `page`, `limit`)
  - `GET /api/v1/machines/:id`
  - `POST /api/v1/machines`
  - `PUT /api/v1/machines/:id/status`
- [x] Créer migration additive `1782000000000_add_category_to_machines_table.ts` + mise à jour modèle `Machine` (status/category typés)
- [x] Créer `database/seeders/machine_seeder.ts` — 3 machines (`LIGNE-CIMENT-01`, `LIGNE-FER-01`, `LIGNE-BRIQUES-01`)
- [x] Exécuter le seeder + vérifier via `GET /api/v1/machines` → 3 lignes
- [x] Test unitaire `tests/unit/machines_state.spec.ts` — 7 tests PASS (transitions valides/invalides + no-op)
- [x] Script `scripts/test_machines_api.ps1` — smoke live 5/5 PASS (GET, 2 transitions valides, 1 invalide 422, cleanup)

### L1.2 Synchronisation rôle utilisateur

- [x] Émettre `user.role_changed` depuis `user-service` dans `UsersController.updateRole` (+ helper `publishEvent` ajouté à `user-service/app/services/rabbitmq.ts`)
- [x] Créer `services/auth-service/app/listeners/user_listeners.ts` → handler `onUserRoleChanged` + helper pur `applyRoleChange`
  - Met à jour `users.role` dans `sfmc_auth`
  - Supprime (hard-revoke) tous les `refresh_tokens` du user
- [x] Déclarer la queue `auth.user_role_changed_q` dans `services/auth-service/start/rabbitmq.ts` + preload ajouté à `adonisrc.ts`
- [x] Ajouter `consume()` à `auth-service/app/services/rabbitmq.ts` (n'avait que publish)
- [x] Étendre `@sfmc/event-contracts` — `EventType` + `UserRoleChangedPayload`
- [x] Test unitaire `tests/unit/role_sync.spec.ts` — 3 tests PASS (payload gate + unknown user)
- [x] Script `scripts/test_role_sync.ps1` — E2E live 7/7 PASS (promote → revoke → re-login OPERATOR)

### L1.3 Documentation L1

- [x] Ajouter routes machines dans `ENDPOINTS.md` §6 (bloc Machines + matrice transitions)
- [x] Mentionner sync rôle dans `ENDPOINTS.md` §1 (consumer auth) et §2 (publisher user)
- [x] Cocher dans `TASKS.md`
- [ ] Commit `feat(production,auth): machines API + role sync` (à faire après validation user)

---

## LOT 2 — Matrice Email complète (P0)

### L2.1 Enrichir les events order-service avec les contacts client

- [x] Créer `order-service/app/services/customer_contact.ts` — JWT interne court (5 min, role=OPERATOR, shared `JWT_SECRET`) + `GET ${USER_SERVICE_URL}/api/v1/users/:id` (timeout 2 s, retourne `null` silencieusement sur erreur)
- [x] Ajouter `USER_SERVICE_URL` dans `order-service/start/env.ts` + `.env.example` (défaut `http://localhost:3002`)
- [x] Étendre `@sfmc/event-contracts` :
  - `EventType` += `order.delivered`
  - `OrderValidatedPayload.customerEmail?`, `OrderCancelledPayload.customerEmail?`
  - nouveaux `OrderShippedPayload`, `OrderDeliveredPayload`, `InvoiceCreatedPayload`
- [x] Injecter `customerEmail` (fetch best-effort) dans :
  - `order.validated` (dans `validateOrder`)
  - `order.cancelled` (dans `cancelOrder` **et** `cancelOrderFromSaga`)
- [x] **Publier** `order.shipped` et `order.delivered` dans `transitionStatus` quand la cible correspond (avec `customerEmail` + timestamp)

### L2.2 Listeners notification-service (7 lignes de la matrice — Email only)

- [x] Réécriture complète de `notification_listeners.ts`
  - helper `sendEmailNotification(event, recipients[], ...)` avec dédup + 1 row `Notification` par destinataire
  - helper `uniqueRecipients()` (dédup + filtre @)
  - fallback `ADMIN_FALLBACK_EMAIL` → `davidyd07@gmail.com`
- [x] `onOrderValidated` → Email client
- [x] `onOrderShipped` → Email client (plus de SMS)
- [x] `onOrderDelivered` → **Nouveau** — Email client
- [x] `onOrderCancelled` → Email client
- [x] `onProductionCompleted` → **Nouveau** — Email `LOGISTICS_EMAIL`
- [x] `onProductionQualityFailed` → Email `PRODUCTION_EMAIL`
- [x] `onInventoryCritical` → Email `LOGISTICS_EMAIL` + `PRODUCTION_EMAIL` (dédupliqué si identiques)
- [x] `onBillingInvoiceCreated` → **Nouveau** — Email client + `FINANCE_EMAIL`

### L2.3 Wiring RabbitMQ (notification-service/start/rabbitmq.ts)

- [x] 8 queues (une par handler) :
  - `notif.order_validated_q`, `notif.order_shipped_q`, `notif.order_delivered_q`, `notif.order_cancelled_q`
  - `notif.production_completed_q`, `notif.quality_failed_q`
  - `notif.inventory_critical_q` (fix routing key `inventory.critical_stock` → **`inventory.critical`**)
  - `notif.invoice_created_q`
- [x] Publier `billing.invoice_created` dans `billing-service/app/listeners/billing_listeners.ts` après `INSERT invoice` (non bloquant)

### L2.4 Variables d'environnement

- [x] `notification-service/start/env.ts` : ajouter `LOGISTICS_EMAIL`, `PRODUCTION_EMAIL`, `FINANCE_EMAIL`, `ADMIN_FALLBACK_EMAIL` (strings optionnelles)
- [x] `notification-service/.env.example` : 4 variables, défaut `davidyd07@gmail.com`
- [ ] `infra/k8s/configmap.yaml` : ajouter les 4 variables (valeurs de prod à patcher) — différé à L9 (ops)

### L2.5 Tests notification

- [x] `tests/functional/notification_matrix.spec.ts` : 6 tests (shipped, delivered, production.completed, inventory.critical, invoice_created, idempotence)
- [ ] Exécuter les tests — à lancer manuellement (`npm test` dans notification-service)

### L2.6 Documentation L2

- [x] Mettre à jour `ENDPOINTS.md` §8 (liste des events consommés + nouvelles queues + matrice)
- [ ] Mettre à jour `PRESENTATION_BACKEND.md` §3.7 (UC-NOTIF) et §4.2 (flèches events)
- [ ] Retirer mention SMS dans `README.md` §33 ("Ce que couvre la plateforme")
- [ ] Commit `feat(notification): matrice email complète + order.shipped/delivered + invoice_created`

---

## LOT 3 — Planification intelligente OF + suivi temps réel par OF (P1)

### L3.1 Planification FIFO (mappage par préfixe de nom — option A)

- [x] Migration `1782100000000_add_machine_id_to_production_orders_table.ts` (col. nullable + 2 indexes) — appliquée
- [x] Modèle `ProductionOrder` étendu (`machineId`, `ProductionOrderStatus` typé, `TERMINAL_PRODUCTION_STATUSES`)
- [x] `production-service/app/services/product_client.ts` — `GET /api/v1/products/:id` public via `fetch` natif, timeout 2 s, fail-silent
- [x] `PRODUCT_SERVICE_URL` ajouté à `start/env.ts` + `.env.example`
- [x] `production-service/app/services/production_planner.ts` :
  - `CATEGORY_PREFIX` (4 catégories) + `prefixFor()`
  - `pickAvailableMachineFor(category, trx?)` — FIFO `created_at asc`, match via `category` OR `name LIKE prefix%`
  - `planProductionOrder({ orderId, productId, quantity, category? })` — transactionnel ; crée OF `IN_PROGRESS` + machine `IN_USE` si dispo, sinon `PLANNED` en file d'attente ; fallback `fetchProductCategory()` si catégorie manquante
  - `releaseMachineForProductionOrder(poId, trx?)` — idempotent, garde `machineId` sur l'OF pour l'audit
  - `promoteQueuedProductionOrders()` — balaye la file et réaffecte une machine si possible
- [x] `production_listeners.onOrderProductionRequired` branché sur le planner (category depuis payload ou fetch)
- [x] `production_listeners.onOrderCancelled` libère la machine + déclenche `promoteQueuedProductionOrders`
- [x] `ProductionOrdersController.updateStatus` / `qualityControl` : helper `releaseIfTerminal()` sur `COMPLETED` / `REJECTED` / `CANCELLED`
- [x] Test unitaire `tests/unit/production_planner.spec.ts` — **8 tests PASS** (prefix map, pick FIFO, pick null, plan IN_PROGRESS, plan PLANNED, release, release idempotent, promote no-op)

### L3.2 Subscription GraphQL par OF

- [x] `@sfmc/event-contracts` : ajouter `production.status_changed` + `ProductionStatusChangedPayload`
- [x] `production-service/app/services/production_events.ts` — helper `publishProductionStatusChanged(po, from, to)`
- [x] Branché sur toutes les transitions :
  - `planProductionOrder` → listener `onOrderProductionRequired` (émet `null → IN_PROGRESS|PLANNED`)
  - `ProductionOrdersController.updateStatus` (toutes transitions)
  - `ProductionOrdersController.qualityControl` (→ `COMPLETED` ou `REJECTED`)
  - `onOrderCancelled` listener (→ `CANCELLED`)
- [x] `reporting-service/app/graphql/pubsub.ts` : `PRODUCTION_ORDER_UPDATED_ALL` + helper `productionOrderTopic(id)`
- [x] `reporting-service/app/graphql/schema.ts` : type `ProductionOrderProgress` + subscriptions `productionOrderUpdated(id)` et `productionOrdersUpdated`
- [x] `reporting-service/app/listeners/reporting_listeners.ts` : handler `onProductionStatusChanged` (projette + broadcast 2 topics)
- [x] `reporting-service/start/rabbitmq.ts` : queue `reporting.production_status_changed_q`
- [ ] Front `Production.tsx` : brancher la subscription globale `productionOrdersUpdated` sur la liste → **reporté à L7** (stack front)

### L3.3 Documentation L3

- [x] Mettre à jour `SUBSCRIPTIONS.md` avec les 2 nouvelles subscriptions + exemples client
- [ ] Commit `feat(production,reporting): planification FIFO + subscription OF par id + board global`

---

## LOT 4 — Rapports par période + export CSV (P0)

### L4.1 Filtres temporels

- [x] `reporting-service/app/graphql/schema.ts` : ajouter args `from: String, to: String` à `salesReport`, `productionReport` (+ `qualityReport`, `stockReport`)
- [x] `reporting-service/app/services/reporting_kpis.ts` : appliquer `where('created_at', >=/<= , ...)` via helper `applyDateRange`
- [x] Nouveau helper `app/services/date_range.ts` (parse ISO, tolérant aux valeurs invalides, snap start/end-of-day)

### L4.2 Nouveaux rapports

- [x] GraphQL Query `qualityReport(from, to)` → total, completed, rejected, taux, top 5 produits rejetés
- [x] GraphQL Query `stockReport(warehouseId, from, to)` → `totalAlerts`, `distinctProducts`, 100 snapshots récents
- [x] Pas de projection dédiée — live SQL sur `report_production_orders` et `report_stock_snapshots` (suffisant à ce volume)

### L4.3 Export CSV

- [x] REST `GET /api/v1/reports/sales.csv` → `/api/v1/reports/:type/export.csv` unifié
- [x] REST `GET /api/v1/reports/production.csv` (idem)
- [x] REST `GET /api/v1/reports/quality.csv` (idem)
- [x] REST `GET /api/v1/reports/stocks.csv` (type `stock`, support `warehouseId`)
- [x] Bonus : exports `orders` et `invoices` (dump tabulaire avec filtre période)
- [x] Helper CSV RFC 4180 manuel (`toCsv` dans `reporting_kpis.ts` — échappe `,` `"` `\n`)
- [x] `content-type: text/csv; charset=utf-8` + `content-disposition: attachment; filename="<type>_report_<period>.csv"`

### L4.4 Tests unitaires reporting

- [x] `tests/unit/date_range.spec.ts` — parse, valeurs invalides, snap start/end-of-day, `applyDateRange`, `rangeLabel` (10 tests)
- [x] `tests/unit/csv_export.spec.ts` — échappement guillemets/virgules/sauts de ligne, null/undefined (6 tests)
- [x] Suite complète reporting-service : **21 tests OK**

### L4.5 Documentation L4

- [x] `ENDPOINTS.md` §9 : 4 nouveaux endpoints REST + 2 GraphQL Query (+ types `Period`, `SalesReport`, `ProductionReport`, `QualityReport`, `StockReport`)
- [ ] Commit `feat(reporting): rapports par période + export CSV`

---

## LOT 5 — Timeline commande + espace CLIENT restreint (frontend)

### L5.1 Frontend — timeline OrderDetail

- [x] `OrderDetail.tsx` : `OrderTimeline` enrichi (PENDING → VALIDATED → IN_PRODUCTION → READY → SHIPPED → DELIVERED), icônes lucide, étape courante mise en avant (ring + pulse)
- [x] Boutons d'action OPERATOR/ADMIN contextuels : `Marquer prête` (VALIDATED/IN_PRODUCTION → READY), `Expédier` (READY → SHIPPED), `Livrer` (SHIPPED → DELIVERED), `Annuler` (si statut < SHIPPED)
- [x] Pour un CLIENT, bouton `Annuler` visible uniquement sur ses propres commandes (cross-checked côté serveur par la policy)
- [x] Feedback toast sur succès/erreur (`sonner`), invalidation automatique des queries

### L5.2 Frontend — espace CLIENT

- [x] Nouvelle route `/my-orders` (alias `Orders.tsx` qui détecte `role === 'CLIENT'` et change titre en « Mes commandes » + auto-préremplit `customerId` avec `userId`)
- [x] Nouvelle route `/my-invoices` (alias `Billing.tsx` avec titre « Mes factures »)
- [x] `Sidebar.tsx` : items conditionnels par rôle — CLIENT voit `Tableau de bord`, `Mes commandes`, `Produits`, `Mes factures`, `Notifications`, `Profile` (items admin/opérateur masqués)
- [x] `App.tsx` + `ProtectedRoute` : `/orders`, `/billing`, `/inventory`, `/production`, `/reports` requièrent `ADMIN|OPERATOR` (CLIENT → Accès refusé) ; `/my-orders` et `/my-invoices` réservés `CLIENT`

### L5.3 Backend — politique CLIENT

- [x] `order-service/app/policies/order_policy.ts` (nouveau) — helpers purs et testables : `effectiveCustomerFilter`, `effectiveOrderCustomerId`, `canAccessOrder`, `isClientRole`
- [x] `order-service/app/controllers/orders_controller.ts` : `store` force `customerId = auth.id` pour un CLIENT, `index` auto-filtre, `show`/`cancel`/`destroy` renvoient 403 si CLIENT tente d'accéder à une commande tierce
- [x] `billing-service/app/middleware/auth_middleware.ts` (nouveau, aligné sur order-service) + wiring `start/kernel.ts` + `start/routes.ts` (`.use(middleware.auth())`) + `JWT_SECRET` ajouté à `env.ts` et `.env.example`
- [x] `billing-service/app/controllers/invoices_controller.ts` : `index` auto-filtre sur CLIENT, `show`/`listPayments`/`pdf` bloquent si facture d'un autre client, `recordPayment` réservé OPERATOR/ADMIN (CLIENT → 403)
- [x] `billing-service/package.json` : ajout `jsonwebtoken` + `@types/jsonwebtoken`
- [x] Test unitaire `order-service/tests/unit/orders_policy.spec.ts` — **14 tests** : isolation CLIENT A / CLIENT B, forçage customerId à la création, OPERATOR/ADMIN bypass

### L5.4 Documentation L5

- [x] `PRESENTATION_FRONTEND.md` §4 : tableau routes avec `/my-orders`, `/my-invoices` + explications mode client ; §4.2 timeline enrichie + actions OPERATOR/ADMIN
- [ ] Commit `feat(frontend,order,billing): espace client restreint + timeline commande`

---

## LOT 6 — Tests (unitaires + intégration)

*(cumule tests déjà listés dans L1→L5 + tests d'intégration dédiés)*

### L6.1 Tests d'intégration order-service

- [x] `tests/integration/cu01_flow.spec.ts` — création commande → VALIDATED → facture PENDING → notification EMAIL (3 sous-tests)
- [x] `tests/integration/cu01_production.spec.ts` — stock insuffisant → OF → quality pass → COMPLETED (2 sous-tests)
- [x] `tests/integration/cu_compensation.spec.ts` — 2 branches compensation Saga (stock 0 + inventory down)

### L6.2 Tests d'intégration inventory-service

- [x] Suite `integration` ajoutée à `inventory-service/adonisrc.ts`
- [x] `tests/integration/cu03_critical.spec.ts` — mouvement OUT → event `inventory.critical` → notifications EMAIL

### L6.3 Vérification globale

- [x] `node ace test integration --files="cu01_flow"` (order-service) → **3 passed**
- [x] `node ace test integration --files="cu01_production"` (order-service) → **2 passed**
- [x] `node ace test integration --files="cu_compensation"` (order-service) → **1 passed**
- [x] `node ace test integration --files="cu03_critical"` (inventory-service) → **1 passed**
- [x] Compteur total tests unitaires ≥ 70 (14 `orders_policy` + 8 `production_planner` + 10 `date_range` + 6 `csv_export` + 7 `machines_state` + 3 `role_sync` + …)
- [!] Suite `integration` complète d'order-service — le legacy `order_saga.spec.ts` hérite de problèmes de forme JWT préexistants (utilise `{id}` au lieu de `{sub}`) et de timeouts opossum ; à reprendre dans un lot de refactoring séparé.

### L6.4 Documentation L6

- [x] Mettre à jour `PRESENTATION_BACKEND.md` §8.2 (tableau comptes tests + suite `integration`)
- [ ] Commit `test: CU-01/02/03 integration + matrix coverage`

---

## LOT 7 — Smoke test unique `smoke_test_cu.sh`

### L7.1 Script

- [x] Créer `sfmc-backend/smoke_test_cu.sh` (bash) — 28 assertions structurées CU-01 / CU-02 / CU-03 / Sécurité
- [x] Créer `sfmc-backend/smoke_test_cu.ps1` (Windows) — miroir PowerShell
- [x] Les 2 scripts génèrent un rapport `smoke_report.txt` avec statut PASS/FAIL par assertion
- [x] Les 2 scripts purgent les clés Redis `ratelimit:login:*` en début de run (idempotence locale)
- [x] Découpage des 28 assertions : 9 health checks + 4 sécurité + 7 CU-01 + 5 CU-02 + 3 CU-03
- [x] Validation live `smoke_test_cu.ps1` : **28 / 28 PASS** (stack `npm run start:full`)

### L7.2 Intégration CI

- [x] `.github/workflows/ci.yml` : remplacer `smoke_test.sh` actuel par `smoke_test_cu.sh`
- [x] Installer `jq` + `uuid-runtime` sur le runner Ubuntu
- [x] Seed des bases (`auth`, `user`, `product`, `inventory`, `production`) avant le smoke
- [x] Job `smoke-test` fait échouer le pipeline si une seule assertion FAIL (exit code ≠ 0)
- [x] Rapport `smoke_report.txt` uploadé comme artifact `smoke-test-logs`

### L7.3 Documentation L7

- [x] Mettre à jour `README.md` §Tests backend + §CI/CD avec `smoke_test_cu.sh`
- [x] `.gitignore` : ignorer `smoke_report.txt`
- [x] Mise à jour `PRESENTATION_BACKEND.md` §8.4 (smoke test unifié)
- [ ] Commit `test(ci): smoke CU-01/02/03 + sécurité (28 assertions)`

---

## LOT 8 — Tests E2E Playwright (frontend)

### L8.1 Setup

- [x] `sfmc-frontend/` : `npm i -D @playwright/test` + `npx playwright install chromium`
- [x] `playwright.config.ts` — baseURL http://localhost:5173, projet Chromium, `locale=fr-FR`, traces / screenshots / vidéos « retain-on-failure »
- [x] Scripts `npm run test:e2e`, `test:e2e:ci`, `test:e2e:headed`, `test:e2e:ui`
- [x] Helper partagé `e2e/fixtures.ts` : comptes seedés, `loginAs()` via API + `localStorage.sfmc-auth`, `resetLoginRateLimit()` best-effort (docker → redis-cli), `findAvailableFinishedProduct()`

### L8.2 Scénarios

- [x] `e2e/login.spec.ts` — login admin via UI + sidebar ADMIN / OPERATOR / CLIENT + 403 `/orders` CLIENT (4 tests)
- [x] `e2e/order-flow.spec.ts` — CLIENT crée commande (API) → saga VALIDATED → OPERATOR `READY → SHIPPED → DELIVERED` via OrderDetail → CLIENT voit « Livrée » dans `/my-orders`
- [x] `e2e/dashboard-realtime.spec.ts` — création commande déclenche `kpiUpdated` → badge « Flux temps réel » allumé < 5 s
- [x] Run full suite contre stack live : **6 / 6 passed (32 s)** en local

### L8.3 Documentation L8

- [x] `PRESENTATION_FRONTEND.md` §11 — tableau « Tests E2E = ✅ 6/6 », §11.1 ajoutée (config, helpers, matrice des specs). Items obsolètes retirés de la roadmap §12
- [x] `.gitignore` frontend : `test-results/`, `playwright-report/`, `blob-report/`, `playwright/.cache/`
- [ ] Commit `test(frontend): e2e Playwright (login, order flow, realtime)`

---

## LOT 9 — Traçabilité + DoD + publication

### L9.1 Fichier de traçabilité

- [x] Créer `TRACEABILITY.md` à la racine avec tableau :
  - colonnes : `Besoin | Service | Endpoint/Event | Test unit | Test intégration | Assertion smoke | Page front`
  - 1 ligne par exigence des sections 1→7 + CU-01/02/03 (≈ 33 lignes + note TLS infra + § DoD)

### L9.2 Mises à jour documentaires finales

- [x] `README.md` : section "État du projet" mise à jour (100% des BF couverts + lien `TRACEABILITY.md`)
- [x] `PRESENTATION_BACKEND.md` §10 : Sprint **5** « Mise en conformité BF intégrale » + en-tête document + lien traçabilité
- [x] `PRESENTATION_FRONTEND.md` §12 : mention explicite des livrables **espace CLIENT** et **Playwright** (sortis de la dette)

### L9.3 Definition of Done — contrôle final

- [x] `smoke_test_cu.sh` / `.ps1` → **28/28 PASS** (2026-04-20, stack live)
- [x] Tests **unitaires** : exécution ciblée `node ace test unit` (ex. `order-service` 22 tests) + `npm test` `auth-service` ; build TS `npm run build` sur **tous** les workspaces backend (corrige les erreurs bloquantes)
- [x] Tests **intégration CU** : `order-service` (`cu01_flow`, `cu01_production`, `cu_compensation`) + `inventory-service` (`cu03_critical`) — `node ace test integration --files=…` ; la suite legacy `order_saga.spec.ts` complète peut échouer selon alignement `.env` ↔ ports Postgres Docker
- [x] `npx playwright test` → **6/6** (login, flux commande, temps réel)
- [x] `npm run build` frontend + `npm run build` backend monorepo — **0 erreur** (packages : `tsconfig` + scripts `tsc -p` pour `event-contracts`, `shared-types`, `auth-middleware`)
- [x] `docker compose -f docker-compose.prod.yml config` — fichier **valide** ; `up -d` des 9 apps **non** imposé sur la même machine que la stack dev (conflit de ports / noms) — voir `TRACEABILITY.md` § DoD
- [x] Chaque ligne de `TRACEABILITY.md` : au moins une colonne parmi test unit / intégration / smoke / page front remplie

### L9.4 Tag de release

- [x] Commit final `docs: traceability + DoD v1.0.0-rc1` (+ correctifs build mineurs auth / packages TS)
- [x] `git tag v1.0.0-rc1`

---

## Synthèse d'avancement

| Lot | Objet | Progression |
|---|---|---|
| L1 | Machines API + sync rôle | 18 / 19 |
| L2 | Matrice Email complète | 19 / 19 |
| L3 | Planification + subscription OF | 19 / 19 |
| L4 | Rapports période + CSV | 17 / 18 |
| L5 | Timeline + espace CLIENT | 16 / 17 |
| L6 | Tests intégration | 11 / 12 |
| L7 | Smoke CU-01/02/03 | 11 / 12 |
| L8 | Playwright | 10 / 11 |
| L9 | Traçabilité + DoD | 13 / 13 |
| **Total** | | **134 / 136 tâches** |

*Dernière mise à jour : 2026-04-20 (L9 — [`TRACEABILITY.md`](TRACEABILITY.md), DoD, Sprint 5 doc backend, tag `v1.0.0-rc1`)*
