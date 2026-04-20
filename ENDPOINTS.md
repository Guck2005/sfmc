# SFMC Bénin — Référence des endpoints

> Document de synthèse généré depuis le code source (`start/routes.ts`, validators VineJS, controllers et schémas GraphQL).
> Préfixe commun : `/api/v1/...`. Tous les payloads sont JSON (`Content-Type: application/json`).

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
| 1 | auth-service | 3001 | `auth_service_db` | — |
| 2 | user-service | 3002 | `user_service_db` | — |
| 3 | product-service | 3003 | `product_service_db` | `POST /graphql` |
| 4 | inventory-service | 3004 | `inventory_service_db` | `POST /graphql` |
| 5 | order-service | 3005 | `order_service_db` | `POST /graphql` |
| 6 | production-service | 3006 | `production_service_db` | — |
| 7 | billing-service | 3007 | `billing_service_db` | — |
| 8 | notification-service | 3008 | `notification_service_db` | — |
| 9 | reporting-service | 3009 | `reporting_service_db` | `POST /graphql` + WS subscriptions |

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
| GET | `/api/v1/products` | Public | Query : `category?`, `isActive?` | `{ data: Product[] }` |
| GET | `/api/v1/products/:id` | Public | — | `{ data: Product }` |
| POST | `/api/v1/products` | JWT + Rôle `ADMIN` | `{ name (2-255), category: 'CIMENT'\|'FER'\|'BRIQUES'\|'GRANULATS', unit, description?, unitPrice > 0, isActive? }` | `201 { data: Product }` |
| PUT | `/api/v1/products/:id` | JWT + Rôle `ADMIN` | Tous champs optionnels (voir POST) | `{ data: Product }` |
| DELETE | `/api/v1/products/:id` | JWT + Rôle `ADMIN` | — | `204` |
| ANY | `/graphql` | Public | Requête GraphQL | Cf. schéma ci-dessous |

### GraphQL — `POST http://localhost:3003/graphql`

```graphql
enum ProductCategory { CIMENT FER BRIQUES GRANULATS }

type Product {
  id: ID!
  name: String!
  category: ProductCategory!
  unit: String!
  description: String
  unitPrice: Float!
  isActive: Boolean!
  createdAt: String!
}

type Query {
  products(category: ProductCategory, isActive: Boolean): [Product!]!
  product(id: ID!): Product
}
```

---

## 4. inventory-service — port 3004

Routes publiques (orchestration interne par RabbitMQ pour la saga commande).

### Warehouses

| Méthode | Path | Auth | Payload |
|---|---|---|---|
| GET | `/api/v1/warehouses` | Public | Query : `page?`, `limit?` |
| GET | `/api/v1/warehouses/:id` | Public | — |
| POST | `/api/v1/warehouses` | Public | `{ name (2-120), location (2-200), capacity > 0 }` → `201 { data: Warehouse }` |
| PUT | `/api/v1/warehouses/:id` | Public | `{ name?, location?, capacity? }` → `{ data: Warehouse }` |
| DELETE | `/api/v1/warehouses/:id` | Public | — → `204`. Retourne `422 WAREHOUSE_NOT_EMPTY` si des stocks sont associés. |

### Stocks

| Méthode | Path | Auth | Payload |
|---|---|---|---|
| GET | `/api/v1/stocks` | Public | Query : `warehouseId?`, `productId?`, `stockType?`, `page?`, `limit?` |
| GET | `/api/v1/stocks/alerts` | Public | — (retourne les stocks sous seuil) |
| POST | `/api/v1/stocks/check-availability` | Public | `{ productId: uuid, quantity > 0 }` |
| POST | `/api/v1/stocks/reserve` | Public | `{ orderId: uuid, sagaId?: string, lines: [{ productId: uuid, quantity > 0 }, ...] }` (min 1 ligne) |
| POST | `/api/v1/stocks/release` | Public | Même schéma que `reserve` |
| POST | `/api/v1/stocks/movements` | Public | `{ stockId: uuid, type: 'IN'\|'OUT'\|'ADJUSTMENT', quantity > 0, origin, referenceId?: uuid }` |
| GET | `/api/v1/stocks/movements` | Public | Query : `stockId?`, `productId?`, `type?`, `from?`, `to?` |
| PUT | `/api/v1/stocks/:id/threshold` | Public | `{ threshold >= 0 }` |
| GET | `/api/v1/stocks/:productId/warehouses` | Public | — (répartition d'un produit par entrepôt) |

### GraphQL — `POST http://localhost:3004/graphql`

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
| PUT | `/api/v1/orders/:id/status` | JWT + Rôle `OPERATOR` | `{ status: 'PENDING' \| 'VALIDATED' \| 'IN_PRODUCTION' \| 'READY' \| 'SHIPPED' \| 'DELIVERED' \| 'CANCELLED' }` |
| DELETE | `/api/v1/orders/:id` | JWT | — |
| POST | `/graphql` | JWT | Requête GraphQL |

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

### Ordres de fabrication

| Méthode | Path | Auth | Payload |
|---|---|---|---|
| GET | `/health` | Public | — |
| GET | `/api/v1/production-orders` | Public | Query : `status?`, `productId?`, `orderId?`, `page?`, `limit?` → liste paginée |
| GET | `/api/v1/production-orders/:id` | Public | — → `{ data: ProductionOrder }` |
| POST | `/api/v1/production-orders` | Public | `{ productId: uuid, quantity > 0, orderId: uuid }` → statut initial `PLANNED` |
| PUT | `/api/v1/production-orders/:id/status` | Public | `{ status: 'PLANNED' \| 'IN_PROGRESS' \| 'QUALITY_CHECK' \| 'COMPLETED' \| 'REJECTED' \| 'CANCELLED' }` |
| POST | `/api/v1/production-orders/:id/quality` | Public | `{ passed: boolean, notes?: string }` — si `passed=true` → `COMPLETED` + event RabbitMQ, sinon `REJECTED` |

> Consomme également l'event `order.validated` (RabbitMQ) pour créer automatiquement les ordres de fabrication.

### Machines

| Méthode | Path | Auth | Payload |
|---|---|---|---|
| GET | `/api/v1/machines` | Public | Query : `status?` (`AVAILABLE`\|`IN_USE`\|`MAINTENANCE`), `category?` (`CIMENT`\|`FER`\|`BRIQUES`\|`GRANULATS`), `page?`, `limit?` |
| GET | `/api/v1/machines/:id` | Public | — → `{ data: Machine }` |
| POST | `/api/v1/machines` | Public | `{ name (2-120), category?, status? }` → `201 { data: Machine }` |
| PUT | `/api/v1/machines/:id/status` | Public | `{ status: 'AVAILABLE' \| 'IN_USE' \| 'MAINTENANCE' }` — `422 INVALID_MACHINE_TRANSITION` si transition interdite |

Transitions autorisées :

```
AVAILABLE   → IN_USE, MAINTENANCE
IN_USE      → AVAILABLE, MAINTENANCE
MAINTENANCE → AVAILABLE          (interdit : MAINTENANCE → IN_USE directement)
```

---

## 7. billing-service — port 3007

| Méthode | Path | Auth | Payload |
|---|---|---|---|
| GET | `/health` | Public | — |
| GET | `/api/v1/invoices` | Public | Query : `status?`, `customerId?`, `orderId?`, `page?`, `limit?` → liste paginée |
| GET | `/api/v1/invoices/:id` | Public | — (retourne la facture + paiements) |
| GET | `/api/v1/invoices/:id/payments` | Public | — → `{ data: Payment[] }` |
| POST | `/api/v1/invoices/:id/payments` | Public | `{ amount > 0, method: 'CASH' \| 'MOBILE_MONEY' \| 'BANK_TRANSFER' }` |
| GET | `/api/v1/invoices/:id/pdf` | Public | — (stream `application/pdf` généré par `pdfkit`) |

> Les factures sont créées automatiquement par consommation de `order.validated` via RabbitMQ.

---

## 8. notification-service — port 3008

Service majoritairement event-driven, avec quelques routes de consultation protégées par **JWT**.

| Méthode | Path | Auth | Payload |
|---|---|---|---|
| GET | `/health` | Public | — |
| GET | `/api/v1/notifications` | JWT | Query : `status?` (`PENDING`\|`SENT`\|`FAILED`), `channel?`, `type?`, `recipient?`, `page?`, `limit?` → liste paginée |
| GET | `/api/v1/notifications/:id` | JWT | — → `{ data: Notification }` |

**Canal unique : Email (Brevo SMTP via Nodemailer).** Le code SMS reste en place mais n'est plus appelé — aucun listener n'émet via `sendSms`.

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
| `notif.invoice_created_q` | `billing.invoice_created` | Client + `FINANCE_EMAIL` | `onBillingInvoiceCreated` |

Variables d'environnement (`notification-service/.env`) :

- `LOGISTICS_EMAIL`, `PRODUCTION_EMAIL`, `FINANCE_EMAIL` — destinataires internes (défaut : `ADMIN_FALLBACK_EMAIL`)
- `ADMIN_FALLBACK_EMAIL` — fallback global (défaut dev : `davidyd07@gmail.com`)

Idempotence : un `ProcessedEvent` (PK = `event.id`) est inséré après envoi — un second passage du même `event.id` est ignoré. Une ligne `Notification` (status `SENT`/`FAILED`) est créée par destinataire.

---

## 9. reporting-service — port 3009

| Méthode | Path | Auth | Payload |
|---|---|---|---|
| GET | `/health` | Public | — |
| GET | `/api/v1/reports/dashboard` | Public | — → KPIs agrégés |
| GET | `/api/v1/reports/sales` | Public | Query: `from`, `to` (ISO `YYYY-MM-DD`) |
| GET | `/api/v1/reports/production` | Public | Query: `from`, `to` |
| GET | `/api/v1/reports/quality` | Public | Query: `from`, `to` — taux d'échec + top produits rejetés |
| GET | `/api/v1/reports/stock` | Public | Query: `from`, `to`, `warehouseId` |
| GET | `/api/v1/reports/:type/export.csv` | Public | `:type` ∈ `sales\|production\|quality\|stock\|orders\|invoices` — Query: `from`, `to`, `warehouseId` — renvoie `text/csv` |
| POST | `/graphql` | Public | Requête GraphQL |
| WS | `ws://localhost:3009/graphql` | Public | Subscription GraphQL (`graphql-ws`) |

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

Dernière mise à jour : générée automatiquement depuis le code (`sfmc-backend/services/*/start/routes.ts`, `app/validators/*.ts`, `app/graphql/schema.ts`).
