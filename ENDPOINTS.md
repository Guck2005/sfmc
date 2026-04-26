# SFMC Bénin — Référence des endpoints

> Document de synthèse généré depuis le code source (`start/routes.ts`, validators VineJS, controllers et schémas GraphQL).
> Préfixe REST commun : **`/api/v1/...`**. Les payloads sont JSON (`Content-Type: application/json`) **sauf** `POST /api/v1/products/upload-image` (`multipart/form-data`, champ `file`).
> **GraphQL** : chaque service Apollo expose **`ANY /graphql`** à la **racine du port** (ex. `http://localhost:3003/graphql`). Le front Vite réécrit `/api/product/graphql` et `/api/inventory/graphql` vers ces endpoints ; le **reporting** partage `ws://…/graphql` pour les subscriptions.

## Légende

| Marque | Signification |
|---|---|
| Public | Aucun middleware d'auth |
| JWT | `middleware.auth()` — header `Authorization: Bearer <accessToken>` requis |
| Rôle | `middleware.role([...])` — le JWT doit porter ce rôle |
| Throttle | `middleware.throttle()` — rate-limit Redis |
| — | Pas de payload (body vide) |

Rôles : `ADMIN`, `OPERATOR`, `CLIENT`.

## Cartographie des services

| # | Service | Port | Base DB | GraphQL |
|---|---|---|---|---|
| 1 | auth-service | 3001 | `sfmc_auth` | — |
| 2 | user-service | 3002 | `sfmc_user` | — |
| 3 | product-service | 3003 | `sfmc_product` | `ANY /graphql` (mutations JWT + `ADMIN`) |
| 4 | inventory-service | 3004 | `sfmc_inventory` | `ANY /graphql` (JWT + `ADMIN` \| `OPERATOR`) |
| 5 | order-service | 3005 | `sfmc_order` | `POST /graphql` (JWT) |
| 6 | production-service | 3006 | `sfmc_production` | — |
| 7 | billing-service | 3007 | `sfmc_billing` | — |
| 8 | notification-service | 3008 | `sfmc_notification` | — |
| 9 | reporting-service | 3009 | `sfmc_reporting` | `POST /graphql` + WS `graphql-ws` sur `/graphql` (JWT) |

Tous les services exposent `GET /health` (public, retourne `200 ok` ou `503 degraded` + checks DB/RabbitMQ).

---

## 1. auth-service — port 3001

| Méthode | Path | Auth | Payload | Réponse |
|---|---|---|---|---|
| GET | `/health` | Public | — | `{ status, service, version, checks }` |
| POST | `/api/v1/auth/register` | Public + Throttle | `{ email, password (min 8), fullName?, role? }` — `role` uniquement si l'appelant est ADMIN (sinon `CLIENT` par défaut) | `201 { data: { accessToken, refreshToken, tokenType, expiresIn, user: { id, email, role, fullName } } }` — publie l'event RabbitMQ `user.created` |
| POST | `/api/v1/auth/login` | Public + Throttle | `{ email: string, password: string (min 6) }` | `{ data: { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: 900, user: { id, email, role } } }` |
| POST | `/api/v1/auth/refresh` | Public | `{ refreshToken: string }` | `{ data: { accessToken, refreshToken, tokenType, expiresIn: 900 } }` |
| POST | `/api/v1/auth/logout` | Public | `{ refreshToken: string }` | `{ data: { message: 'Déconnexion réussie' } }` |
| POST | `/api/v1/auth/validate` | Header `Authorization` | — | `{ data: { valid: true, userId, email, role } }` |
| GET | `/api/v1/auth/oauth/authorize` | Public | Query : `client_id`, `redirect_uri`, `response_type=code`, `user_id`, `state?`, `scope?` | `302` vers `redirect_uri?code=...&state=...` |
| POST | `/api/v1/auth/oauth/token` | Public | `{ grant_type: 'authorization_code', code, client_id, client_secret, redirect_uri }` | `{ access_token, token_type: 'Bearer', expires_in: 3600, scope? }` |

Erreurs : `401 INVALID_CREDENTIALS`, `401 INVALID_REFRESH_TOKEN`, `401 INVALID_TOKEN`, `400 UNSUPPORTED_GRANT_TYPE`, `400 INVALID_GRANT`, `401 INVALID_CLIENT`.

**Consumer RabbitMQ** : queue `auth.user_role_changed_q` (routing `user.role_changed`). Lorsqu'un ADMIN change le rôle d'un utilisateur via `PUT /api/v1/users/:id/role` (user-service), auth-service met à jour localement `users.role` et **révoque tous les refresh tokens** du user (force un re-login qui émet un JWT avec le nouveau rôle).

---

## 2. user-service — port 3002

Toutes les routes `/api/v1/users/*` sont protégées par **JWT**.

| Méthode | Path | Auth | Payload | Réponse |
|---|---|---|---|---|
| GET | `/health` | Public | — | health standard |
| GET | `/api/v1/users` | JWT | Query : `page?`, `limit?`, `role?`, `isActive?` | Liste paginée |
| POST | `/api/v1/users` | JWT | `{ firstName, lastName, email, phone?, role? }` | `201 { data: User }` — profil seul (pas de mot de passe). Préférer `auth-service POST /auth/register` pour créer un compte authentifiable. |
| GET | `/api/v1/users/:id` | JWT | — | `{ data: User }` |
| PUT | `/api/v1/users/:id` | JWT | `{ firstName?, lastName?, phone?, isActive? }` | `{ data: User }` |
| DELETE | `/api/v1/users/:id` | JWT | — | `204` |
| PUT | `/api/v1/users/:id/role` | JWT | `{ role: 'ADMIN' \| 'OPERATOR' \| 'CLIENT' }` | `{ data: User }` |

Contraintes validators : `firstName`/`lastName` 2-100 car., `email` normalisé unique.

**Consumer RabbitMQ** : queues `user.user_created_q` (routing `user.created`) et `user.user_deleted_q` (routing `user.deleted`). Provisionne / désactive automatiquement le profil lorsqu'un compte est créé ou supprimé côté auth-service.

**Publisher RabbitMQ** : `PUT /users/:id/role` publie `user.role_changed` (payload `{ userId, oldRole, newRole, changedBy }`) lorsque le rôle change effectivement. Consommé par auth-service pour synchroniser le rôle dans `sfmc_auth` + révoquer les refresh tokens du user.

---

## 3. product-service — port 3003

Lecture publique, écriture réservée aux ADMIN.

| Méthode | Path | Auth | Payload | Réponse |
|---|---|---|---|---|
| GET | `/health` | Public | — | health |
| GET | `/api/v1/products` | Public | Query : `category?`, `isActive?`, `page?`, `limit?` (défaut pagination Lucid) | `{ data: Product[], meta: { total, page, lastPage } }` |
| GET | `/api/v1/products/assets/:name` | Public | `:name` = UUID + extension (jpg/jpeg/png/gif/webp) — image servie en binaire (`Cache-Control` 24 h) | `200` image / `404` |
| GET | `/api/v1/products/:id` | Public | — | `{ data: Product }` |
| POST | `/api/v1/products/upload-image` | JWT + Rôle `ADMIN` | `multipart/form-data`, champ **`file`** — jpeg/png/gif/webp, max **5 Mo** (copie vers `storage/uploads/products/`) | `200 { data: { url: "/api/v1/products/assets/<uuid>.<ext>" } }` |
| POST | `/api/v1/products` | JWT + Rôle `ADMIN` | `{ name (2-255), category: 'CIMENT'\|'FER'\|'BRIQUES'\|'GRANULATS', unit, description?, imageUrl? (https ou chemin `/api/v1/products/assets/...`), unitPrice > 0, isActive? }` | `201 { data: Product }` |
| PUT | `/api/v1/products/:id` | JWT + Rôle `ADMIN` | Champs optionnels dont `imageUrl` (`null` pour effacer) | `{ data: Product }` |
| DELETE | `/api/v1/products/:id` | JWT + Rôle `ADMIN` | — | `200 { data: { message, id } }` (désactivation logicielle) |
| ANY | `/graphql` | **Queries** sans token ; **mutations** JWT + rôle `ADMIN` | Requête GraphQL | Cf. schéma ci-dessous |

### GraphQL — `ANY http://localhost:3003/graphql`

```graphql
enum ProductCategory { CIMENT FER BRIQUES GRANULATS }

type Product {
  id: ID!
  name: String!
  category: ProductCategory!
  unit: String!
  description: String
  imageUrl: String
  unitPrice: Float!
  isActive: Boolean!
  createdAt: String!
}

type Query {
  products(category: ProductCategory, isActive: Boolean): [Product!]!
  product(id: ID!): Product
}

type Mutation {
  createProduct(input: CreateProductInput!): Product!
  updateProduct(id: ID!, input: UpdateProductInput!): Product!
  deactivateProduct(id: ID!): Product!
}

input CreateProductInput {
  name: String!
  category: ProductCategory!
  unit: String!
  description: String
  imageUrl: String
  unitPrice: Float!
}

input UpdateProductInput {
  name: String
  category: ProductCategory
  unit: String
  description: String
  imageUrl: String
  unitPrice: Float
  isActive: Boolean
}
```

---

## 4. inventory-service — port 3004

**Auth :** la plupart des routes exigent **JWT** + rôle **`ADMIN`** ou **`OPERATOR`**. Seules **`POST /api/v1/stocks/check-availability`** et **`POST /api/v1/stocks/fulfill-shipment`** sont **publiques** (appel inter-service par `order-service` avant / pendant la saga — à protéger au niveau réseau / API gateway en production).

### Inter-service (sans JWT)

| Méthode | Path | Auth | Payload |
|---|---|---|---|
| POST | `/api/v1/stocks/check-availability` | Public | `{ productId: uuid, quantity > 0 }` |
| POST | `/api/v1/stocks/fulfill-shipment` | Public | `{ orderId, lines[{ productId, quantity }], warehouseId?, allocations? }` (validator `fulfillShipmentValidator`) |

### Warehouses — JWT + rôle `ADMIN` \| `OPERATOR`

| Méthode | Path | Auth | Payload |
|---|---|---|---|
| GET | `/api/v1/warehouses` | JWT + Rôle | Query : `page?`, `limit?` |
| GET | `/api/v1/warehouses/:id` | JWT + Rôle | — |
| POST | `/api/v1/warehouses` | JWT + Rôle | `{ name (2-120), location (2-200), capacity > 0 }` → `201 { data: Warehouse }` |
| PUT | `/api/v1/warehouses/:id` | JWT + Rôle | `{ name?, location?, capacity? }` → `{ data: Warehouse }` |
| DELETE | `/api/v1/warehouses/:id` | JWT + Rôle | — → `204`. Retourne `422 WAREHOUSE_NOT_EMPTY` si des stocks sont associés. |

### Stocks — JWT + rôle `ADMIN` \| `OPERATOR`

| Méthode | Path | Auth | Payload |
|---|---|---|---|
| GET | `/api/v1/stocks` | JWT + Rôle | Query : `warehouseId?`, `productId?`, `stockType?`, `page?`, `limit?` |
| GET | `/api/v1/stocks/alerts` | JWT + Rôle | — (stocks sous seuil) |
| POST | `/api/v1/stocks/reserve` | JWT + Rôle | `{ orderId: uuid, sagaId?: string, lines: [{ productId: uuid, quantity > 0 }, ...] }` (min 1 ligne) |
| POST | `/api/v1/stocks/release` | JWT + Rôle | Même schéma que `reserve` |
| POST | `/api/v1/stocks/movements` | JWT + Rôle | `{ stockId: uuid, type: 'IN'\|'OUT'\|'ADJUSTMENT', quantity > 0, origin, referenceId?: uuid }` |
| GET | `/api/v1/stocks/movements` | JWT + Rôle | Query : `stockId?`, `productId?`, `type?`, `from?`, `to?` |
| GET | `/api/v1/stocks/pending-receptions` | JWT + Rôle | — |
| POST | `/api/v1/stocks/pending-receptions/:id/confirm` | JWT + Rôle | — (confirmation réception stock) |
| PUT | `/api/v1/stocks/:id/threshold` | JWT + Rôle | `{ threshold >= 0 }` |
| GET | `/api/v1/stocks/:productId/warehouses` | JWT + Rôle | — (répartition d'un produit par entrepôt) |

### GraphQL — `ANY http://localhost:3004/graphql`

**JWT + rôle `ADMIN` \| `OPERATOR`** (même garde-fou que le REST).

```graphql
type Query {
  stocks(warehouseId: ID, productId: ID, stockType: StockType): [Stock!]!
  stockMovements(productId: ID, stockId: ID, from: String, to: String): [StockMovement!]!
  criticalStocks: [Stock!]!
  warehouses: [Warehouse!]!
}
```

---

## 5. order-service — port 3005

Toutes les routes `/api/v1/orders/*` sont protégées par **JWT**.

| Méthode | Path | Auth | Payload |
|---|---|---|---|
| POST | `/api/v1/orders` | JWT | `{ customerId: uuid, lines: [{ productId: uuid, quantity > 0, unitPrice >= 0 }, ...] }` (min 1 ligne) |
| GET | `/api/v1/orders` | JWT | Query : `status?`, `customerId?`, `page?`, `limit?` |
| GET | `/api/v1/orders/:id` | JWT | — |
| POST | `/api/v1/orders/:id/cancel` | JWT | — |
| PUT | `/api/v1/orders/:id/status` | JWT + Rôle `ADMIN` \| `OPERATOR` | `{ status: 'PENDING' \| 'VALIDATED' \| 'IN_PRODUCTION' \| 'READY' \| 'SHIPPED' \| 'DELIVERED' \| 'CANCELLED' }` |
| DELETE | `/api/v1/orders/:id` | JWT | — |
| POST | `/api/v1/orders/:id/mobile-money/init` | JWT | Démarrage encaissement mobile money (flux démo / intégration PSP) |
| POST | `/api/v1/orders/:id/mobile-money/complete-local` | JWT | Finalisation locale (dev / tests) |
| POST | `/api/v1/webhooks/mobile-money` | **Public** (HMAC) | Webhook PSP — en-tête **`X-Payment-Signature`** (hex HMAC-SHA256) + corps validé ; secret `PAYMENT_WEBHOOK_SECRET` sur order-service |
| POST | `/graphql` | JWT | Requête GraphQL (`POST` sur la racine du port **3005**, pas sous `/api/v1/orders`) |

> La création de commande déclenche une **saga** via RabbitMQ : réservation stock, génération facture, ordre de production.

### GraphQL — `POST http://localhost:3005/graphql`

```graphql
type Query {
  orders(status: OrderStatus, customerId: ID): [Order!]!
  order(id: ID!): Order
}

type Mutation {
  createOrder(input: CreateOrderInput!): Order!
  cancelOrder(id: ID!): Order!
}
```

---

## 6. production-service — port 3006

Toutes les routes métier ci-dessous : **JWT** + rôle **`ADMIN`** ou **`OPERATOR`**.

### Ordres de fabrication

| Méthode | Path | Auth | Payload |
|---|---|---|---|
| GET | `/health` | Public | — |
| GET | `/api/v1/production-orders` | JWT + Rôle | Query : `status?`, `productId?`, `orderId?`, `page?`, `limit?` → liste paginée |
| GET | `/api/v1/production-orders/:id` | JWT + Rôle | — → `{ data: ProductionOrder }` |
| POST | `/api/v1/production-orders` | JWT + Rôle | `{ productId: uuid, quantity > 0, orderId: uuid }` → statut initial `PLANNED` |
| PUT | `/api/v1/production-orders/:id/status` | JWT + Rôle | `{ status: 'PLANNED' \| 'IN_PROGRESS' \| 'QUALITY_CHECK' \| 'COMPLETED' \| 'REJECTED' \| 'CANCELLED' }` |
| POST | `/api/v1/production-orders/:id/quality` | JWT + Rôle | `{ passed: boolean, notes?: string }` — si `passed=true` → `COMPLETED` + event RabbitMQ, sinon `REJECTED` |

> Consomme également l'event `order.validated` (RabbitMQ) pour créer automatiquement les ordres de fabrication.

### Machines

| Méthode | Path | Auth | Payload |
|---|---|---|---|
| GET | `/api/v1/machines` | JWT + Rôle | Query : `status?` (`AVAILABLE`\|`IN_USE`\|`MAINTENANCE`), `category?` (`CIMENT`\|`FER`\|`BRIQUES`\|`GRANULATS`), `page?`, `limit?` |
| GET | `/api/v1/machines/:id` | JWT + Rôle | — → `{ data: Machine }` |
| POST | `/api/v1/machines` | JWT + Rôle | `{ name (2-120), category?, status? }` → `201 { data: Machine }` |
| PUT | `/api/v1/machines/:id/status` | JWT + Rôle | `{ status: 'AVAILABLE' \| 'IN_USE' \| 'MAINTENANCE' }` — `422 INVALID_MACHINE_TRANSITION` si transition interdite |

Transitions autorisées :

```
AVAILABLE   → IN_USE, MAINTENANCE
IN_USE      → AVAILABLE, MAINTENANCE
MAINTENANCE → AVAILABLE          (interdit : MAINTENANCE → IN_USE directement)
```

---

## 7. billing-service — port 3007

Toutes les routes `/api/v1/invoices/*` : **JWT** (tout rôle authentifié, sauf contrainte métier côté controller si applicable).

| Méthode | Path | Auth | Payload |
|---|---|---|---|
| GET | `/health` | Public | — |
| GET | `/api/v1/invoices` | JWT | Query : `status?`, `customerId?`, `orderId?`, `page?`, `limit?` → liste paginée |
| GET | `/api/v1/invoices/:id` | JWT | — (retourne la facture + paiements) |
| GET | `/api/v1/invoices/:id/payments` | JWT | — → `{ data: Payment[] }` |
| POST | `/api/v1/invoices/:id/payments` | JWT | `{ amount > 0, method: 'CASH' \| 'MOBILE_MONEY' \| 'BANK_TRANSFER' }` — passage à `PAID` peut publier `billing.invoice_paid` |
| GET | `/api/v1/invoices/:id/pdf` | JWT | — (stream `application/pdf` généré par `pdfkit` ; montants formatés pour affichage PDF) |
| GET | `/api/v1/invoices/:id/credit-note` | JWT | — → `{ data: CreditNote }` si avoir existe |
| GET | `/api/v1/invoices/:id/credit-note/pdf` | JWT | — (stream PDF avoir) |

> Les factures sont créées automatiquement par consommation de `order.validated` via RabbitMQ. Colonne optionnelle **`customer_email`** sur les factures pour les e-mails client. Événements émis côté billing : `billing.invoice_created`, `billing.invoice_paid`, `billing.credit_note_created` (voir notification-service).

---

## 8. notification-service — port 3008

Service majoritairement event-driven, avec quelques routes de consultation protégées par **JWT**.

| Méthode | Path | Auth | Payload |
|---|---|---|---|
| GET | `/health` | Public | — |
| GET | `/api/v1/notifications` | JWT | Query : `status?` (`PENDING`\|`SENT`\|`FAILED`), `channel?`, `type?`, `recipient?`, `page?`, `limit?` (max 100) → `{ data: Notification[], meta: { total, currentPage, perPage, lastPage } }` |
| GET | `/api/v1/notifications/:id` | JWT | — → `{ data: Notification }` |

**Canal unique : Email (Brevo SMTP via Nodemailer).** Le code SMS reste en place mais n'est plus appelé — aucun listener n'émet via `sendSms`. Les e-mails métier peuvent inclure des **pièces jointes PDF** (facture / avoir) : le service appelle le billing en HTTP (`GET …/pdf`) avec un JWT court (**`JWT_SECRET`** identique à la stack) — configurer **`BILLING_SERVICE_URL`** (ex. `http://127.0.0.1:3007` en dev).

Matrice des notifications consommées (queue → routing key → destinataire) :

| Queue RabbitMQ | Routing key | Destinataire(s) | Handler |
|---|---|---|---|
| `notif.order_validated_q` | `order.validated` | Client (`customerEmail`) | `onOrderValidated` |
| `notif.order_shipped_q` | `order.shipped` | Client | `onOrderShipped` |
| `notif.order_delivered_q` | `order.delivered` | Client | `onOrderDelivered` |
| `notif.order_cancelled_q` | `order.cancelled` | Client | `onOrderCancelled` |
| `notif.production_completed_q` | `production.completed` | `LOGISTICS_EMAIL` | `onProductionCompleted` |
| `notif.quality_failed_q` | `production.quality_failed` | `PRODUCTION_EMAIL` | `onProductionQualityFailed` |
| `notif.inventory_critical_q` | `inventory.critical` | `LOGISTICS_EMAIL` + `PRODUCTION_EMAIL` (dédupliqués) | `onInventoryCritical` |
| `notif.inventory_pending_reception_q` | `inventory.pending_reception` | `LOGISTICS_EMAIL` | `onInventoryPendingReception` |
| `notif.invoice_created_q` | `billing.invoice_created` | Client + `FINANCE_EMAIL` | `onBillingInvoiceCreated` (PJ facture si fetch OK) |
| `notif.invoice_paid_q` | `billing.invoice_paid` | Client + `FINANCE_EMAIL` | `onBillingInvoicePaid` (PJ facture si fetch OK) |
| `notif.credit_note_created_q` | `billing.credit_note_created` | Client + `FINANCE_EMAIL` | `onBillingCreditNoteCreated` (PJ avoir si fetch OK) |

Variables d'environnement (`notification-service/.env`) :

- `LOGISTICS_EMAIL`, `PRODUCTION_EMAIL`, `FINANCE_EMAIL` — destinataires internes (défaut : `ADMIN_FALLBACK_EMAIL`)
- `ADMIN_FALLBACK_EMAIL` — fallback global (défaut dev : `davidyd07@gmail.com`)
- `BILLING_SERVICE_URL` — base HTTP du billing pour récupérer les PDF (optionnel ; défaut local possible)

Idempotence : un `ProcessedEvent` (PK = `event.id`) est inséré après envoi — un second passage du même `event.id` est ignoré. Une ligne `Notification` (status `SENT`/`FAILED`) est créée par destinataire.

---

## 9. reporting-service — port 3009

| Méthode | Path | Auth | Payload |
|---|---|---|---|
| GET | `/health` | Public | — |
| GET | `/api/v1/reports/dashboard` | JWT + rôle `ADMIN` \| `OPERATOR` \| `CLIENT` | — → KPIs agrégés (vue client filtrée côté serveur) |
| GET | `/api/v1/reports/sales` | JWT + rôle `ADMIN` \| `OPERATOR` | Query: `from`, `to` (ISO `YYYY-MM-DD`) |
| GET | `/api/v1/reports/production` | JWT + rôle `ADMIN` \| `OPERATOR` | Query: `from`, `to` |
| GET | `/api/v1/reports/quality` | JWT + rôle `ADMIN` \| `OPERATOR` | Query: `from`, `to` — taux d'échec + top produits rejetés |
| GET | `/api/v1/reports/stock` | JWT + rôle `ADMIN` \| `OPERATOR` | Query: `from`, `to`, `warehouseId` |
| GET | `/api/v1/reports/:type/export.csv` | JWT + rôle `ADMIN` \| `OPERATOR` | `:type` ∈ `sales\|production\|quality\|stock\|orders\|invoices` — Query: `from`, `to`, `warehouseId` — renvoie `text/csv` |
| POST | `/graphql` | JWT + rôle `ADMIN` \| `OPERATOR` | Requête GraphQL (`POST` racine port **3009**) |
| WS | `ws://localhost:3009/graphql` | JWT (`connectionParams` ou en-tête — voir `SUBSCRIPTIONS.md`) | Subscriptions GraphQL (`graphql-ws`) |

### GraphQL — `http://localhost:3009/graphql`

```graphql
type DashboardKPIs {
  totalOrders: Int!
  totalRevenue: Float!
  paidInvoices: Int!
  pendingInvoices: Int!
  ordersByStatus: [StatusCount!]!
  productionCompleted: Int!
  productionQualityFailed: Int!
  qualityFailureRate: Float!
  criticalStockCount: Int!
}

type Period {
  from: String
  to: String
}

type SalesReport {
  period: Period!
  ordersByStatus: [StatusCount!]!
  totalOrders: Int!
  totalRevenue: Float!
  averageOrderValue: Float!
}

type ProductionReport {
  period: Period!
  byStatus: [StatusCount!]!
  totalProductionOrders: Int!
  completedCount: Int!
  rejectedCount: Int!
}

type QualityReport {
  period: Period!
  totalInspected: Int!
  completedCount: Int!
  rejectedCount: Int!
  failureRate: Float!
  topRejectedProducts: [QualityTopRejected!]!
}

type StockReport {
  period: Period!
  warehouseId: ID
  totalAlerts: Int!
  distinctProducts: Int!
  latestSnapshots: [StockAlert!]!
}

type Query {
  dashboardKPIs: DashboardKPIs!
  salesReport(from: String, to: String): SalesReport!
  productionReport(from: String, to: String): ProductionReport!
  qualityReport(from: String, to: String): QualityReport!
  stockReport(warehouseId: ID, from: String, to: String): StockReport!
  criticalStockAlerts: [StockAlert!]!
}

type Subscription {
  orderStatusUpdated: OrderStatusEvent!
  kpiUpdated: DashboardKPIs!
  productionOrderUpdated(id: ID!): ProductionOrderProgress!
  productionOrdersUpdated: ProductionOrderProgress!
}
```

> Détails additionnels : `sfmc-backend/services/reporting-service/SUBSCRIPTIONS.md`.

---

## Format de réponse standard

**Succès**

```json
{ "data": { ... } }
```

**Erreur**

```json
{ "error": { "code": "INVALID_CREDENTIALS", "message": "Email ou mot de passe incorrect" } }
```

**Validation VineJS (`422`)**

```json
{
  "errors": [
    { "field": "email", "message": "The email field must be a valid email", "rule": "email" }
  ]
}
```

## En-têtes communs

| Header | Usage |
|---|---|
| `Authorization: Bearer <jwt>` | Requis pour toute route protégée |
| `Content-Type: application/json` | Requis sur les `POST/PUT` avec body |
| `X-Request-Id` | Propagé pour la traçabilité distribuée (OpenTelemetry → Jaeger) |

## Flux saga commande (référence)

```
POST /api/v1/orders (order-service)
  ├─▶ publish order.created (RabbitMQ)
  │     └─▶ inventory-service : /stocks/reserve
  │           └─▶ publish stock.reserved
  │                 └─▶ order-service : VALIDATED
  │                       ├─▶ billing-service : création facture
  │                       └─▶ production-service : création production order
  │                             └─▶ (COMPLETED) → order-service : READY → SHIPPED → DELIVERED
  │                                   └─▶ notification-service : email client
  │                                   └─▶ reporting-service : subscription kpiUpdated
  └─▶ (stock insuffisant) publish stock.reservation.failed
        └─▶ order-service : CANCELLED
```

---

Dernière mise à jour : **2026-04-26** — alignée sur `sfmc-backend/services/*/start/routes.ts`, validators VineJS et schémas GraphQL (`app/graphql/schema.ts`).
