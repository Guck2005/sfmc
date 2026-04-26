# SFMC Bénin — Matrice de traçabilité besoins ↔ implémentation ↔ tests

Ce document relie les **besoins fonctionnels (BF)** des sections **1 → 7** et les **cas d’utilisation CU-01 / CU-02 / CU-03** (smoke) aux services, événements ou endpoints principaux, aux tests automatisés et aux écrans du back-office.

Les **cas d’utilisation détaillés côté backend** (`UC-AUTH-01`, `UC-PROD-02`, `UC-BILL-05`, `UC-NOTIF-05`, etc.) sont catalogués dans [PRESENTATION_BACKEND.md](PRESENTATION_BACKEND.md) ; la section **Correspondance BF ↔ UC** ci-dessous en donne la synthèse.

**Légende des colonnes**

| Colonne | Contenu |
|---------|---------|
| **Besoin** | Identifiant BF ou CU + formulation courte |
| **Service** | Microservice AdonisJS concerné en premier (voir [ENDPOINTS.md](ENDPOINTS.md)) |
| **Endpoint / événement** | Route REST, query GraphQL ou type d’événement RabbitMQ (`sfmc.events`) |
| **Test unitaire** | Fichier `tests/unit` ou `tests/functional` (Japa), relatif à `sfmc-backend/services/<svc>/` |
| **Test intégration** | Specs `tests/integration` nécessitant une stack live (ports 3001–3009 + Postgres + RabbitMQ) |
| **Assertion smoke** | Libellé issu de [`sfmc-backend/smoke_test_cu.sh`](sfmc-backend/smoke_test_cu.sh) (28 assertions) |
| **Page front** | Route ou page Vite/React (`sfmc-frontend/src/pages/`) ; `—` si couverture uniquement API |

> Chaque ligne comporte **au moins une** trace de vérification (colonne test unitaire, intégration, smoke **ou** page front + E2E).

---

## Tableau principal

| Besoin | Service | Endpoint / événement | Test unitaire | Test intégration | Assertion smoke | Page front |
|--------|---------|------------------------|---------------|------------------|-------------------|--------------|
| **1.1** Entrées de matières premières en stock (mouvements IN) | inventory-service | `POST /api/v1/stocks/movements` (type `IN`, `RAW_MATERIAL`) | `inventory-service/tests/unit/stock_rules.spec.ts` | — | CU-03 #2 (mouvement OUT, même pipeline mouvements) | `Inventory.tsx` |
| **1.1** Alerte seuil critique matières premières | inventory-service | `inventory.critical` → RabbitMQ | `inventory-service/tests/unit/stock_rules.spec.ts` | `inventory-service/tests/integration/cu03_critical.spec.ts` | CU-03 #3 `CRITICAL_STOCK` | `Inventory.tsx`, `Notifications.tsx` |
| **1.2** Création et suivi des ordres de fabrication (OF) | production-service | `POST/GET /api/v1/production-orders`, `PUT …/status` | `production-service/tests/unit/production_planner.spec.ts` | — | CU-02 #1, #3 | `Production.tsx`, `OrderDetail.tsx` (timeline) |
| **1.2** Planification intelligente des OF (FIFO machine / catégorie) | production-service | Assignation machine à la création d’OF | `production-service/tests/unit/production_planner.spec.ts` | — | (couvert par CU-02 #1) | `Production.tsx` |
| **1.2** Suivi temps réel avancement OF | reporting-service | GraphQL subscriptions `productionOrderUpdated(id)`, `productionOrdersUpdated` (schéma reporting) | `reporting-service/tests/unit/reporting_kpis.spec.ts` | — | Health `reporting=ok` | `Production.tsx`, `Dashboard.tsx` |
| **1.2** Disponibilité machines `AVAILABLE` / `IN_USE` / `MAINTENANCE` | production-service | `GET/POST /api/v1/machines`, `PUT …/status` | `production-service/tests/unit/machines_state.spec.ts` | — | Health `production=ok` | `Production.tsx` |
| **1.3** Étape contrôle qualité avant stock produit fini | production-service | `POST /api/v1/production-orders/:id/quality`, statuts `QUALITY_CHECK` → `COMPLETED` | `production-service/tests/functional/production_api.spec.ts` | — | CU-02 #2, #3 | `Production.tsx` |
| **1.3** Échec QC → OF `REJECTED` + alerte | production-service, notification-service | `production.quality_failed` (routing) | `notification-service/tests/functional/notification_listeners.spec.ts` | — | — | `Production.tsx`, `Notifications.tsx` |
| **1.4** Mise en stock produits finis via `production.completed` | inventory-service, production-service | Événement `production.completed` → incrément `FINISHED_PRODUCT` | `inventory-service/tests/unit/stock_rules.spec.ts` | — | CU-02 #4, #5 | `Inventory.tsx` |
| **2.1** Comptes clients (CRUD / désactivation) | user-service | `GET/POST/PUT/DELETE /api/v1/users`, `PUT /api/v1/users/:id/role` | `user-service/tests/unit/user_policy.spec.ts` | — | Health `user=ok` | `Users.tsx` |
| **2.1** Rôles `ADMIN` / `OPERATOR` / `CLIENT` + synchro auth | auth-service, user-service | `user.role_changed` → mise à jour `auth_users` | `auth-service/tests/unit/role_sync.spec.ts` | — | — | `Users.tsx` |
| **2.2** Commande multi-lignes + vérification stock (saga) | order-service, inventory-service | `POST /api/v1/orders` ; `order.created` / `inventory.reserved` | `order-service/tests/unit/order_state_machine.spec.ts` | `order-service/tests/integration/cu01_flow.spec.ts` | CU-01 #1–#3 | `Orders.tsx`, `OrderDetail.tsx` |
| **2.2** Commande sans stock → production / annulation saga | order-service | `inventory.reservation_failed` → `CANCELLED` | `order-service/tests/unit/order_state_machine.spec.ts` | `order-service/tests/integration/cu01_production.spec.ts`, `cu_compensation.spec.ts` | — | `Orders.tsx`, `OrderDetail.tsx` |
| **2.2** Transitions manuelles de statut (opérateur) | order-service | `PUT /api/v1/orders/:id/status` (rôles `ADMIN` / `OPERATOR`) | `order-service/tests/unit/orders_policy.spec.ts` | — | — | `OrderDetail.tsx` |
| **2.2** Annulation avant expédition + libération réservations | order-service, inventory-service | `order.cancelled`, `POST …/cancel` | `order-service/tests/unit/order_state_machine.spec.ts` | `order-service/tests/integration/order_saga.spec.ts` | — | `Orders.tsx`, `OrderDetail.tsx` |
| **2.3** Facture auto sur commande validée | billing-service | `order.validated` → création facture | `billing-service/tests/functional/billing_listeners.spec.ts` | — | CU-01 #4–#6 | `Billing.tsx`, `OrderDetail.tsx` |
| **2.3** Paiement + statuts facture + PDF | billing-service | `POST /api/v1/invoices/:id/payments`, `GET /api/v1/invoices/:id/pdf` ; à `PAID` (hors cas déjà couverts) → `billing.invoice_paid` | `billing-service/tests/unit/pdf_invoice.spec.ts`, `billing-service/tests/functional/billing_listeners.spec.ts` | — | — | `Billing.tsx` |
| **2.3** Avoir + PDF avoir + événement | billing-service | `GET /api/v1/invoices/:id/credit-note`, `GET …/credit-note/pdf` ; `billing.credit_note_created` | `billing-service/tests/unit/pdf_credit_note.spec.ts`, `billing-service/tests/functional/billing_listeners.spec.ts` | — | — | `Billing.tsx` |
| **2.3** Annulation commande → facture `CANCELLED` | billing-service | Compensation saga / listeners | `billing-service/tests/functional/billing_listeners.spec.ts` | — | — | `Billing.tsx` |
| **2.3** E-mails client / finance avec **PJ PDF** (facture créée, payée, avoir) | notification-service, billing-service | `billing.invoice_created`, `billing.invoice_paid`, `billing.credit_note_created` ; fetch HTTP `GET …/pdf` (`BILLING_SERVICE_URL`, `JWT_SECRET`) | `notification-service/tests/functional/notification_matrix.spec.ts` ; PDF côté billing : `billing-service/tests/unit/pdf_invoice.spec.ts`, `billing-service/tests/unit/pdf_credit_note.spec.ts` | — | — | `Billing.tsx`, `Notifications.tsx` |
| **2.4** Expédition / livraison → notifications client | order-service, notification-service | `order.shipped`, `order.delivered` (canal email dans la matrice actuelle) | `notification-service/tests/unit/dispatcher.spec.ts`, `notification-service/tests/functional/notification_matrix.spec.ts` | — | — | `OrderDetail.tsx`, `e2e/order-flow.spec.ts` |
| **3.1** Stocks `RAW_MATERIAL` / `FINISHED_PRODUCT` + mouvements | inventory-service | `GET /api/v1/stocks`, mouvements `IN`/`OUT`/`ADJUSTMENT` | `inventory-service/tests/unit/stock_rules.spec.ts` | — | CU-02 #4, CU-03 #2 | `Inventory.tsx` |
| **3.1** Disponible = quantité − réservé | inventory-service | Règles métier stock | `inventory-service/tests/unit/stock_rules.spec.ts` | `order-service/tests/integration/cu01_flow.spec.ts` | CU-01 #3 (réservation implicite) | `Inventory.tsx` |
| **3.1** Événement `inventory.critical` + notification | inventory-service, notification-service | Publication `inventory.critical` | — | `inventory-service/tests/integration/cu03_critical.spec.ts` | CU-03 #3 | `Inventory.tsx`, `Dashboard.tsx` |
| **3.2** Multi-entrepôts + stocks par entrepôt | inventory-service | `GET/POST/PUT/DELETE /api/v1/warehouses`, stocks filtrés | — | — | Health `inventory=ok` | `Inventory.tsx` |
| **3.3** Historique des mouvements (filtres produit / période) | inventory-service | `GET /api/v1/stocks/movements` (+ query params) | `inventory-service/tests/unit/stock_rules.spec.ts` | `inventory-service/tests/integration/cu03_critical.spec.ts` | CU-03 #2 (POST mouvement) | `Inventory.tsx` |
| **4** Catalogue produits (catégories, prix, actif/inactif, filtres, `imageUrl`, upload) | product-service | `GET/POST/PUT/DELETE /api/v1/products`, `POST /api/v1/products/upload-image` (`multipart/form-data`), GraphQL catalogue | `product-service/tests/unit/product_model.spec.ts` | — | Health `product=ok` | `Products.tsx` |
| **5.1** Login JWT + refresh + déconnexion (révocation refresh) | auth-service | `POST /api/v1/auth/login`, `refresh`, `logout` | `auth-service/tests/unit/token_service.spec.ts` | — | Préparation login admin (hors 28 comptées) ; CU-01 utilise token | `Login.tsx`, `e2e/login.spec.ts` |
| **5.1** OAuth2 Authorization Code (intégrations partenaires) | auth-service | `GET /oauth/authorize`, `POST /oauth/token` | `auth-service/tests/unit/oauth_flow.spec.ts` | — | — | — |
| **5.2** RBAC `ADMIN` / `OPERATOR` / `CLIENT` | order-service, user-service | Policies + routes protégées | `order-service/tests/unit/orders_policy.spec.ts`, `user-service/tests/unit/user_policy.spec.ts` | — | — | `ProtectedRoute`, `e2e/login.spec.ts` |
| **5.3** Rate limiting login (5 / 15 min / IP) | auth-service | `POST /api/v1/auth/login` + Redis | `auth-service/tests/unit/rate_limiter.spec.ts` | — | `Rate limit /auth/login → 429` | `Login.tsx` |
| **5.3** En-têtes OWASP (CSP, XFO, XCTO) | auth-service (middleware global) | Réponses HTTP sécurisées | — | — | `Header X-Frame-Options=DENY`, `X-Content-Type-Options=nosniff`, `Header CSP présent` | — |
| **6** Matrice notifications **e-mail** (commande, production, stock, facturation, **PJ PDF** billing) | notification-service | Consommation événements → Brevo SMTP ; pièces jointes via HTTP vers billing | `notification-service/tests/functional/notification_matrix.spec.ts`, `notification-service/tests/functional/notification_listeners.spec.ts`, `notification-service/tests/unit/dispatcher.spec.ts` | — | CU-01 #7 `ORDER_VALIDATED` ; CU-02 #5 `PRODUCTION_COMPLETED` | `Notifications.tsx` (liste paginée) |
| **7** Tableau de bord KPI + agrégats temps réel (CQRS) | reporting-service | `GET /api/v1/reports/dashboard` ; GraphQL query `dashboardKPIs`, subscription `kpiUpdated` | `reporting-service/tests/unit/reporting_kpis.spec.ts` | — | Health `reporting=ok` + flux KPI via events | `Dashboard.tsx`, `e2e/dashboard-realtime.spec.ts` |
| **7** Rapports par période + export CSV | reporting-service | Paramètres période + export manuel CSV | `reporting-service/tests/unit/date_range.spec.ts`, `reporting-service/tests/unit/csv_export.spec.ts` | — | — | `Reports.tsx` |
| **CU-01** Création commande : stock OK → `VALIDATED` → facture → notif | order, inventory, billing, notification | Saga `order.created` → … | `order-service/tests/unit/order_state_machine.spec.ts` | `order-service/tests/integration/cu01_flow.spec.ts` | CU-01 #1–#7 | `Orders.tsx`, `OrderDetail.tsx`, `e2e/order-flow.spec.ts` |
| **CU-02** Fin production validée → `production.completed` → stock fini | production, inventory, order | `production.completed` | `production-service/tests/unit/production_planner.spec.ts` | — | CU-02 #1–#5 | `Production.tsx`, `Inventory.tsx` |
| **CU-03** Mouvement stock → sous-seuil → `inventory.critical` → e-mail | inventory-service, notification-service | `PUT /api/v1/stocks/:id/threshold`, `POST /api/v1/stocks/movements` | `inventory-service/tests/unit/stock_rules.spec.ts` | `inventory-service/tests/integration/cu03_critical.spec.ts` | CU-03 #1–#3 | `Inventory.tsx`, `Notifications.tsx` |

---

## Correspondance BF / thème ↔ UC backend

Référence condensée ; le détail métier (préconditions, acteurs, critères d’acceptation) est dans [PRESENTATION_BACKEND.md](PRESENTATION_BACKEND.md).

| Thème (BF §) | UC backend |
|--------------|------------|
| Auth, refresh, logout, JWT inter-services, OAuth2 | UC-AUTH-01 … UC-AUTH-05 |
| Comptes clients, rôles, synchro auth | UC-USER-01, UC-USER-02 |
| Catalogue REST + médias (`imageUrl`, upload) + GraphQL | UC-PROD-01, UC-PROD-02, UC-PROD-03 |
| Stocks, mouvements, réservation saga, alerte critique, réception fin prod | UC-INV-01 … UC-INV-06 |
| Commande, annulation, statuts opérateur, suivi | UC-ORD-01 … UC-ORD-04 |
| OF, QC, machines | UC-PROD-04 … UC-PROD-07 |
| Facture auto, paiement, annulation facture, PDF facture/avoir, événements `invoice_paid` / `credit_note_created` | UC-BILL-01 … UC-BILL-06 |
| E-mails transactionnels + PJ PDF facturation | UC-NOTIF-01 … UC-NOTIF-05 |
| KPI, GraphQL rapports, alertes stock côté reporting, subscriptions | UC-RPT-01 … UC-RPT-04 |
| Santé des services | UC-OBS-01 (`GET /health` sur chaque service) |

---

## Synthèse des jeux de tests

> **Note (BF 5.3 — TLS 1.3)** : le chiffrement en transit est assuré par la couche réseau (reverse proxy, Ingress Kubernetes, certificats). Il n’y a pas de test automatisé dédié dans le dépôt applicatif ; la conformité se valide au niveau **infra / pentest**.

| Jeu | Commande / emplacement | Rôle |
|-----|------------------------|------|
| Tests unitaires & fonctionnels (9 services) | `cd sfmc-backend && npm test` (ou `npm test -w @sfmc/<service>`) | Couverture par domaine (voir colonne *Test unitaire*). |
| Tests d’intégration CU | `cd sfmc-backend/services/order-service && node ace test --groups integration` (et équivalent inventory selon `adonisrc`) | Nécessite les services et bases joignables aux ports attendus. |
| Smoke CU + sécurité (28 assertions) | `./smoke_test_cu.sh` ou `.\smoke_test_cu.ps1` depuis `sfmc-backend/` | Chaîne CU-01/02/03 + health + en-têtes + rate limit. |
| E2E navigateur | `cd sfmc-frontend && npm run test:e2e` | Login multi-rôles, flux commande, badge temps réel (`e2e/*.spec.ts`). |

---

## Definition of Done (v1.0.0-rc1) — contrôle du 2026-04-26

| Critère | Résultat |
|---------|----------|
| `smoke_test_cu.sh` / `smoke_test_cu.ps1` → **28 / 28** PASS | OK (stack live + Redis pour rate-limit) |
| `npm run build` monorepo `sfmc-backend` (9 services + packages) | OK après correctifs TS (`auth-service` cast payload ; `tsconfig` packages `event-contracts`, `shared-types`, `auth-middleware`) |
| `npm run build` + `npm run test:e2e` sur `sfmc-frontend` | OK |
| Tests d’intégration CU (`order-service` : `cu01_flow`, `cu01_production`, `cu_compensation` ; `inventory-service` : `cu03_critical`) | OK (`node ace test integration --files=…`) avec API sur localhost |
| `node ace test integration` **complet** sur `order-service` (incl. `order_saga.spec.ts` legacy) | Peut échouer si les ports Postgres des *hosts* dans `.env` ne correspondent pas aux conteneurs Docker locaux — les specs **CU** ci-dessus sont la référence Lot 6/9 |
| `docker compose -f docker-compose.prod.yml up -d` → 9 services **healthy** | Non exécuté ici (conflit possible avec `sfmc-rabbitmq` / `sfmc-redis` de la stack dev) ; fichier compose **validé** (`docker compose … config`) |
| Matrice **TRACEABILITY** ↔ catalogue **UC** ([PRESENTATION_BACKEND.md](PRESENTATION_BACKEND.md)) | Aligné (catalogue produits + image, billing PDF / événements, notifications PJ, `inventory.critical`) |

---

*Document généré dans le cadre du **Lot 9** — traçabilité et définition des finitions (DoD) v1.0.0-rc1 ; révision **2026-04-26** (UC backend, billing/notifications PDF).*
