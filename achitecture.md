# CONCEPTION BACKEND — SFMC Bénin
## Architecture Microservices · AdonisJS 6 · REST + GraphQL

---

| Référence       | ARCH-SFMC-2025-002                       |
|-----------------|------------------------------------------|
| Version         | 2.0                                      |
| Phase           | Conception — Livrable Phase 2            |
| Stack           | AdonisJS 6 · Node.js 20 · TypeScript     |
| Protocoles      | REST (OpenAPI 3.0) · GraphQL (Apollo)    |
| Dépend de       | ARB-SFMC-2025-001 · CDC-SFMC-2025-001    |
| Auteur          | Architecte Logiciel Senior               |
| Date            | 2025-04-16                               |

---

## Table des matières

1. [Vue d'ensemble de l'architecture](#1-vue-densemble-de-larchitecture)
2. [Choix techniques justifiés](#2-choix-techniques-justifiés)
3. [Décomposition des microservices](#3-décomposition-des-microservices)
4. [Modèles de données](#4-modèles-de-données)
5. [Contrats d'API](#5-contrats-dapi)
6. [Communication inter-services](#6-communication-inter-services)
7. [Gestion des transactions distribuées — Saga Pattern](#7-gestion-des-transactions-distribuées--saga-pattern)
8. [Sécurité](#8-sécurité)
9. [Exigences non fonctionnelles & scalabilité](#9-exigences-non-fonctionnelles--scalabilité)
10. [Infrastructure & déploiement](#10-infrastructure--déploiement)
11. [Planning & sprints](#11-planning--sprints)
12. [Gestion des risques](#12-gestion-des-risques)

---

## 1. Vue d'ensemble de l'architecture

### 1.1 Schéma général

```
                          ┌─────────────────────────────────┐
                          │            CLIENTS               │
                          │  Web App · Mobile · Partenaires  │
                          └──────────────┬───────────────────┘
                                         │ HTTPS / TLS 1.3
                          ┌──────────────▼───────────────────┐
                          │          API GATEWAY             │
                          │  Routing · Auth · Rate Limit     │
                          │  CORS · Load Balancing           │
                          │  (Nginx dev / Kong prod)         │
                          └──┬──────────┬─────────────┬──────┘
                    REST ────┘          │ REST/GQL    └──── GraphQL
        ┌───────────────────────────────┼──────────────────────────────┐
        │                               │                              │
 ┌──────▼──────┐  ┌──────────┐  ┌──────▼───────┐  ┌──────────────────┐
 │ Auth Service│  │  User    │  │   Product    │  │    Inventory     │
 │   :3001     │  │ Service  │  │   Service    │  │     Service      │
 │   REST      │  │  :3002   │  │    :3003     │  │      :3004       │
 └──────┬──────┘  │  REST    │  │  REST+GQL    │  │    REST+GQL      │
        │         └────┬─────┘  └──────┬───────┘  └──────┬───────────┘
        │              │               │                  │
 ┌──────▼──────┐  ┌────▼─────┐  ┌─────▼──────┐  ┌───────▼──────────┐
 │   Order     │  │Produc.   │  │  Billing   │  │  Notification    │
 │  Service    │  │ Service  │  │  Service   │  │    Service       │
 │   :3005     │  │  :3006   │  │   :3007    │  │     :3008        │
 │  REST+GQL   │  │  REST    │  │   REST     │  │     REST         │
 └──────┬──────┘  └────┬─────┘  └─────┬──────┘  └──────┬───────────┘
        │              │              │                  │
        └──────────────┴──────┬───────┴──────────────────┘
                               │
               ┌───────────────▼────────────────┐
               │          MESSAGE BUS            │
               │   RabbitMQ (topic exchange)     │
               │   Dead Letter Queue · Retry     │
               └───────────────┬────────────────┘
                               │
               ┌───────────────▼────────────────┐
               │      Reporting Service          │
               │           :3009                │
               │    GraphQL · CQRS Read Side     │
               └────────────────────────────────┘
```

### 1.2 Chaînes métier couvertes (CDC §2.1)

| Chaîne            | Services impliqués                                              |
|-------------------|-----------------------------------------------------------------|
| **Production**    | Inventory (appro. MP) → Production → Inventory (produits finis) → Quality* |
| **Commerciale**   | User → Order → Billing → Notification                          |
| **Logistique**    | Inventory (multi-entrepôts) → Order (expédition) → Notification |

> *Le contrôle qualité est intégré comme statut dans le Production Service (voir §3.6).

### 1.3 Principes d'architecture retenus

| Principe                   | Décision                                                      |
|----------------------------|---------------------------------------------------------------|
| 1 service = 1 domaine métier | DDD strict — 9 services (CDC §3.1)                          |
| 1 service = 1 base de données | PostgreSQL dédié par service (Database per Service)         |
| Communication synchrone    | REST — requêtes immédiates et bloquantes (CDC §3.3)           |
| Communication asynchrone   | RabbitMQ — événements métier découplés (CDC §3.3)             |
| Transactions distribuées   | Saga Pattern (Choreography) — CDC §4.3                        |
| Cohérence des données      | Eventual Consistency — CDC §4.3                               |
| Exposition GraphQL         | Order, Inventory, Product, Reporting                          |
| Exposition REST pure       | Auth, User, Billing, Notification, Production                 |
| Service Discovery          | Consul (CDC §3.5)                                             |
| Scalabilité                | Horizontale — Kubernetes HPA (CDC §6)                         |

---

## 2. Choix techniques justifiés

### 2.1 Stack par service

```
AdonisJS 6 (TypeScript)
├── ORM              → Lucid ORM (Active Record)
├── Validation       → VineJS
├── Auth             → @adonisjs/auth (JWT + OAuth2)
├── GraphQL          → @adonisjs/graphql + Apollo Server
├── Message Broker   → amqplib (RabbitMQ client)
├── HTTP Client      → undici (appels inter-services REST)
├── Circuit Breaker  → opossum
├── Tests            → Japa (unitaires) + Supertest (intégration)
├── Docs REST        → Swagger UI (OpenAPI 3.0)
└── Docs GraphQL     → GraphQL Playground / Apollo Sandbox
```

### 2.2 Justification RabbitMQ vs Kafka (CDC §3.3)

Le CDC mentionne Kafka et RabbitMQ comme alternatives. **RabbitMQ est retenu** pour les raisons suivantes :

| Critère              | RabbitMQ ✅                     | Kafka                              |
|----------------------|---------------------------------|------------------------------------|
| Complexité opé.      | Faible — adapté équipe réduite  | Élevée (ZooKeeper/KRaft)           |
| Routage fin          | Topic exchange + routing keys   | Partitions uniquement              |
| Acquittement message | Natif (ack/nack)                | Offset géré par le consommateur    |
| Dead Letter Queue    | Natif                           | Configuration manuelle             |
| Cas d'usage SFMC     | File d'événements métier < 10k/s | Streaming haute volumétrie > 100k/s |

> Pour les volumes actuels de la SFMC Bénin, RabbitMQ offre le meilleur rapport complexité/fonctionnalité. Une migration vers Kafka sera envisageable si le volume dépasse 50 000 événements/heure.

### 2.3 Bases de données

| Service       | SGBD                        | Justification                            |
|---------------|-----------------------------|------------------------------------------|
| Auth          | PostgreSQL                  | Sessions, tokens, sécurité               |
| User          | PostgreSQL                  | Relations, RBAC complexe                 |
| Product       | PostgreSQL                  | Catalogue structuré, recherche full-text |
| Inventory     | PostgreSQL                  | Transactions ACID critiques sur les stocks |
| Order         | PostgreSQL                  | Cohérence du cycle de vie                |
| Production    | PostgreSQL                  | Planification temporelle                 |
| Billing       | PostgreSQL                  | Conformité comptable, auditabilité       |
| Notification  | PostgreSQL                  | File d'attente + historique              |
| Reporting     | PostgreSQL (Read Replica)   | CQRS read side — lectures intensives     |

---

## 3. Décomposition des microservices

### 3.1 Auth Service — `:3001`

**Responsabilité unique :** Gestion de l'identité, émission et validation des tokens.

Couvre les exigences CDC §5.1 : JWT (stateless) et OAuth2 pour intégrations externes.

```
app/
├── controllers/
│   └── auth_controller.ts      # POST /auth/login, /refresh, /logout, /oauth/*
├── services/
│   ├── token_service.ts        # Émission JWT, refresh, révocation
│   ├── oauth_service.ts        # Flux OAuth2 Authorization Code
│   └── password_service.ts     # Hash bcrypt
├── middleware/
│   └── authenticate.ts         # Middleware partageable (package interne)
├── models/
│   ├── refresh_token.ts
│   └── oauth_client.ts         # Clients OAuth2 enregistrés
└── validators/
    └── auth_validator.ts
```

**Endpoints REST :**

| Méthode | Route                  | Description                                       |
|---------|------------------------|---------------------------------------------------|
| POST    | `/auth/login`          | Authentification locale → JWT + Refresh Token     |
| POST    | `/auth/refresh`        | Renouvellement du token                           |
| POST    | `/auth/logout`         | Révocation du refresh token                       |
| POST    | `/auth/validate`       | Validation token (usage inter-service)            |
| GET     | `/auth/oauth/authorize`| Initialisation flux OAuth2 (partenaires externes) |
| POST    | `/auth/oauth/token`    | Échange code → access token (OAuth2)              |
| POST    | `/auth/oauth/revoke`   | Révocation token OAuth2                           |

**Configuration JWT :**

```typescript
// config/auth.ts
{
  guards: {
    api: {
      driver: 'jwt',
      secret: Env.get('JWT_SECRET'),   // ≥ 256 bits — variable d'environnement
      expiresIn: '15m',
    },
    refresh: {
      driver: 'opaque',
      expiresIn: '7d',
    }
  }
}
```

---

### 3.2 User Service — `:3002`

**Responsabilité unique :** CRUD utilisateurs, gestion des rôles RBAC (CDC §5.2).

```
app/
├── controllers/
│   └── users_controller.ts
├── services/
│   └── user_service.ts
├── models/
│   ├── user.ts
│   └── role.ts
└── policies/
    └── user_policy.ts          # Bouncer RBAC
```

**Endpoints REST :**

| Méthode | Route              | Rôle requis      |
|---------|--------------------|------------------|
| GET     | `/users`           | Admin            |
| POST    | `/users`           | Admin            |
| GET     | `/users/:id`       | Admin, Self      |
| PUT     | `/users/:id`       | Admin, Self      |
| DELETE  | `/users/:id`       | Admin            |
| PUT     | `/users/:id/role`  | Admin            |

**Rôles disponibles :** `ADMIN` · `OPERATOR` · `CLIENT` (CDC §3.2)

---

### 3.3 Product Service — `:3003`

**Responsabilité unique :** Catalogue produits — ciment, fer, briques, granulats (CDC §1.1).

**Endpoints REST :**

| Méthode | Route              | Description               |
|---------|--------------------|---------------------------|
| GET     | `/products`        | Liste avec filtres        |
| POST    | `/products`        | Création (Admin)          |
| GET     | `/products/:id`    | Détail                    |
| PUT     | `/products/:id`    | Mise à jour (Admin)       |
| DELETE  | `/products/:id`    | Désactivation (Admin)     |

**Schéma GraphQL :**

```graphql
enum ProductCategory {
  CIMENT
  FER
  BRIQUES
  GRANULATS
}

type Product {
  id: ID!
  name: String!
  category: ProductCategory!
  unit: String!
  description: String
  isActive: Boolean!
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
```

---

### 3.4 Inventory Service — `:3004`

**Responsabilité unique :** Gestion multi-entrepôts, mouvements de stock, alertes seuil critique, approvisionnement en matières premières (CDC §2.1, §3.2).

Ce service gère deux types de stocks :
- **Matières premières** (INPUT) — utilisées par la production
- **Produits finis** (OUTPUT) — issus de la production, destinés à la vente

**Endpoints REST :**

| Méthode | Route                            | Description                              |
|---------|----------------------------------|------------------------------------------|
| GET     | `/stocks`                        | Stocks par entrepôt/produit              |
| GET     | `/stocks/:productId/warehouses`  | Vue multi-entrepôts                      |
| POST    | `/stocks/movements`              | Enregistrer un mouvement (IN/OUT/ADJUST) |
| GET     | `/stocks/movements`              | Historique des mouvements                |
| GET     | `/stocks/alerts`                 | Produits en seuil critique               |
| PUT     | `/stocks/:id/threshold`          | Modifier le seuil d'alerte               |
| POST    | `/stocks/check-availability`     | Vérification disponibilité (interne)     |
| POST    | `/stocks/reserve`                | Réservation stock pour commande (Saga)   |
| POST    | `/stocks/release`                | Libération réservation (compensation)    |

**Schéma GraphQL :**

```graphql
enum MovementType { IN OUT ADJUSTMENT }
enum StockType { RAW_MATERIAL FINISHED_PRODUCT }

type Stock {
  id: ID!
  product: Product!
  warehouse: Warehouse!
  stockType: StockType!
  quantity: Float!
  reserved: Float!          # Quantité réservée (en attente de commande)
  available: Float!         # quantity - reserved
  threshold: Float!
  isCritical: Boolean!
}

type StockMovement {
  id: ID!
  type: MovementType!
  quantity: Float!
  origin: String!
  referenceId: ID
  date: DateTime!
}

type Query {
  stocks(warehouseId: ID, productId: ID, stockType: StockType): [Stock!]!
  stockMovements(productId: ID, from: DateTime, to: DateTime): [StockMovement!]!
  criticalStocks: [Stock!]!
}
```

---

### 3.5 Order Service — `:3005`

**Responsabilité unique :** Cycle de vie complet des commandes (CDC §3.2, cas d'usage §2.2).

**Diagramme d'états :**

```
  [PENDING] ──────────────────────────────────────────► [CANCELLED]
      │                                                      ▲
      │ stock OK (Saga step 1)                               │ (annulation possible avant SHIPPED)
      ▼                                                      │
 [VALIDATED] ──────────────────────────────────────────────►│
      │                                                      │
      │ (si production requise)                              │
      ▼                                                      │
[IN_PRODUCTION] ───────────────────────────────────────────►│
      │                                                      │
      │ production.completed                                 │
      ▼                                                      │
   [READY] ─────────────────────────────────────────────────►│
      │
      │ expédition confirmée
      ▼
  [SHIPPED]
      │
      │ livraison confirmée
      ▼
 [DELIVERED]
```

**Endpoints REST + GraphQL :**

| Méthode | Route                  | Description                         |
|---------|------------------------|-------------------------------------|
| POST    | `/orders`              | Créer une commande                  |
| GET     | `/orders`              | Liste (filtres : status, client)    |
| GET     | `/orders/:id`          | Détail commande                     |
| PUT     | `/orders/:id/status`   | Transition de statut (opérateurs)   |
| DELETE  | `/orders/:id`          | Annulation + compensation Saga      |

**Schéma GraphQL :**

```graphql
type Order {
  id: ID!
  customer: User!
  lines: [OrderLine!]!
  status: OrderStatus!
  totalAmount: Float!
  createdAt: DateTime!
}

type Mutation {
  createOrder(input: CreateOrderInput!): Order!
  cancelOrder(id: ID!): Order!
}

type Subscription {
  orderStatusUpdated(orderId: ID!): Order!   # Temps réel via WebSocket
}
```

---

### 3.6 Production Service — `:3006`

**Responsabilité unique :** Ordres de fabrication, planification, gestion ressources machines, **contrôle qualité** (CDC §2.1 — chaîne de production).

Le statut `QUALITY_CHECK` est ajouté pour couvrir l'exigence de contrôle qualité avant la mise en stock des produits finis.

```
app/
├── controllers/
│   ├── production_orders_controller.ts
│   └── machines_controller.ts
├── services/
│   ├── production_service.ts
│   ├── quality_check_service.ts   # Contrôle qualité (CDC §2.1)
│   └── scheduling_service.ts     # Planification intelligente
├── listeners/
│   └── order_production_required.ts
└── models/
    ├── production_order.ts
    └── machine.ts
```

**Statuts d'un ordre de fabrication :**

```
PLANNED → IN_PROGRESS → QUALITY_CHECK → COMPLETED
                                       └──► REJECTED (retour IN_PROGRESS)
         └──► CANCELLED
```

**Endpoints REST :**

| Méthode | Route                              | Description                          |
|---------|------------------------------------|--------------------------------------|
| GET     | `/production-orders`               | Liste des ordres de fabrication (OF) |
| POST    | `/production-orders`               | Créer un OF                          |
| GET     | `/production-orders/:id`           | Détail d'un OF                       |
| PUT     | `/production-orders/:id/status`    | Avancement (opérateur)               |
| POST    | `/production-orders/:id/quality`   | Résultat contrôle qualité            |
| GET     | `/machines`                        | État des ressources machines         |
| PUT     | `/machines/:id/status`             | Mettre à jour le statut machine      |

**Événements RabbitMQ :**

| Direction | Événement                    |
|-----------|------------------------------|
| Consomme  | `order.production_required`  |
| Produit   | `production.started`         |
| Produit   | `production.completed`       |
| Produit   | `production.quality_failed`  |

---

### 3.7 Billing Service — `:3007`

**Responsabilité unique :** Facturation, paiements, avoirs (CDC §2.1 — chaîne commerciale).

**Endpoints REST :**

| Méthode | Route                         | Description                   |
|---------|-------------------------------|-------------------------------|
| GET     | `/invoices`                   | Liste des factures            |
| GET     | `/invoices/:id`               | Détail facture                |
| POST    | `/invoices/:id/payments`      | Enregistrer un paiement       |
| POST    | `/invoices/:id/credit-note`   | Émettre un avoir              |
| GET     | `/invoices/:id/pdf`           | Export PDF                    |

**Événements consommés :**

| Événement           | Action                                             |
|---------------------|----------------------------------------------------|
| `order.validated`   | Générer la facture automatiquement                 |
| `order.cancelled`   | Émettre un avoir si facture existante              |

---

### 3.8 Notification Service — `:3008`

**Responsabilité unique :** Dispatcher les notifications multi-canal — Email (SMTP) et SMS (Orange API Bénin / Twilio).

**Architecture interne :**

```
RabbitMQ → Consumer → Dispatcher ──► Email Provider (SMTP / Mailgun)
                                └──► SMS Provider (Orange API Bénin ou Twilio)
```

**Matrice des notifications (CDC §3.2) :**

| Événement                     | Destinataire                         | Canal        |
|-------------------------------|--------------------------------------|--------------|
| `order.validated`             | Client                               | Email + SMS  |
| `order.shipped`               | Client                               | Email + SMS  |
| `order.cancelled`             | Client                               | Email        |
| `production.completed`        | Responsable Logistique               | Email        |
| `production.quality_failed`   | Responsable Production               | Email + SMS  |
| `inventory.critical_stock`    | Resp. Logistique + Resp. Production  | Email + SMS  |
| `billing.invoice_generated`   | Client + Équipe Finance              | Email        |

---

### 3.9 Reporting Service — `:3009`

**Responsabilité unique :** Agrégation des données, tableaux de bord, exports — pattern CQRS Read Side (CDC §3.1).

Ce service dispose de sa propre base de données (read replica alimentée par les événements). Il ne requête **jamais** directement les autres services.

**Schéma GraphQL :**

```graphql
type DashboardKPIs {
  totalOrders: Int!
  pendingOrders: Int!
  totalRevenue: Float!
  criticalStockCount: Int!
  activeProductionOrders: Int!
  qualityFailureRate: Float!       # % OF rejetés en contrôle qualité
}

type StockReport {
  product: Product!
  totalQuantity: Float!
  movements: [StockMovement!]!
}

type Query {
  dashboardKPIs(period: DateRange): DashboardKPIs!
  stockReport(productId: ID, warehouseId: ID): [StockReport!]!
  salesReport(period: DateRange!): SalesReport!
  productionReport(period: DateRange!): ProductionReport!
  qualityReport(period: DateRange!): QualityReport!   # CDC §2.1
}
```

---

## 4. Modèles de données

### 4.1 Diagramme de classes global

```
┌──────────────────────────────────────────────────────────────┐
│                       USER SERVICE                           │
│  ┌─────────────┐       ┌──────────────┐                      │
│  │    User     │ N───N │     Role     │                      │
│  ├─────────────┤       ├──────────────┤                      │
│  │ id: UUID    │       │ id: UUID     │                      │
│  │ firstName   │       │ name: Enum   │                      │
│  │ lastName    │       │  ADMIN       │                      │
│  │ email       │       │  OPERATOR    │                      │
│  │ phone       │       │  CLIENT      │                      │
│  │ isActive    │       └──────────────┘                      │
│  │ createdAt   │                                              │
│  └─────────────┘                                              │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                     INVENTORY SERVICE                        │
│  ┌────────────┐  1   ┌──────────────┐  N  ┌──────────────┐  │
│  │  Warehouse │────N │    Stock     │─────│ StockMove    │  │
│  ├────────────┤      ├──────────────┤     ├──────────────┤  │
│  │ id: UUID   │      │ id: UUID     │     │ id: UUID     │  │
│  │ name       │      │ productId    │     │ stockId      │  │
│  │ location   │      │ warehouseId  │     │ type: Enum   │  │
│  │ capacity   │      │ stockType    │     │  IN/OUT      │  │
│  └────────────┘      │ quantity     │     │  ADJUST      │  │
│                      │ reserved     │     │ quantity     │  │
│                      │ threshold    │     │ origin       │  │
│                      │ updatedAt    │     │ referenceId  │  │
│                      └──────────────┘     │ date         │  │
│                                           │ createdBy    │  │
│                                           └──────────────┘  │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                       ORDER SERVICE                          │
│  ┌──────────────┐  1   ┌──────────────┐                      │
│  │    Order     │────N │  OrderLine   │                      │
│  ├──────────────┤      ├──────────────┤                      │
│  │ id: UUID     │      │ id: UUID     │                      │
│  │ customerId   │      │ orderId      │                      │
│  │ status: Enum │      │ productId    │                      │
│  │ sagaStatus   │      │ quantity     │                      │
│  │ totalAmount  │      │ unitPrice    │                      │
│  │ createdAt    │      └──────────────┘                      │
│  └──────────────┘                                             │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                    PRODUCTION SERVICE                        │
│  ┌──────────────────┐  N   ┌──────────────┐                  │
│  │ ProductionOrder  │────1 │   Machine    │                  │
│  ├──────────────────┤      ├──────────────┤                  │
│  │ id: UUID         │      │ id: UUID     │                  │
│  │ productId        │      │ name         │                  │
│  │ quantity         │      │ status: Enum │                  │
│  │ orderId (opt.)   │      │  AVAILABLE   │                  │
│  │ machineId        │      │  IN_USE      │                  │
│  │ status: Enum     │      │  MAINTENANCE │                  │
│  │  PLANNED         │      │ lastMaint    │                  │
│  │  IN_PROGRESS     │      └──────────────┘                  │
│  │  QUALITY_CHECK   │                                         │
│  │  COMPLETED       │                                         │
│  │  REJECTED        │                                         │
│  │  CANCELLED       │                                         │
│  │ startedAt        │                                         │
│  │ completedAt      │                                         │
│  └──────────────────┘                                         │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                      BILLING SERVICE                         │
│  ┌──────────────┐  1   ┌──────────────┐                      │
│  │   Invoice    │────N │   Payment    │                      │
│  ├──────────────┤      ├──────────────┤                      │
│  │ id: UUID     │      │ id: UUID     │                      │
│  │ orderId      │      │ invoiceId    │                      │
│  │ customerId   │      │ amount       │                      │
│  │ amount       │      │ method: Enum │                      │
│  │ status: Enum │      │  TRANSFER    │                      │
│  │  PENDING     │      │  CASH        │                      │
│  │  PAID        │      │  CREDIT      │                      │
│  │  PARTIAL     │      │ paidAt       │                      │
│  │  CANCELLED   │      └──────────────┘                      │
│  │ dueDate      │                                             │
│  │ issuedAt     │                                             │
│  └──────────────┘                                             │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 Cohérence éventuelle (Eventual Consistency — CDC §4.3)

La plateforme adopte le modèle de **cohérence éventuelle** entre services. Chaque service est la source de vérité pour son domaine. Les données dénormalisées (ex : informations produit dans l'Order Service) peuvent présenter un décalage temporaire résolu par les événements RabbitMQ.

**Règles :**
- Les lectures inter-services se font via API REST synchrone (pour les données fraîches) ou depuis la read replica du Reporting Service (pour les agrégats).
- Aucune transaction distribuée 2PC (Two-Phase Commit) — remplacée par le **Saga Pattern** (§7).
- Chaque consumer implémente l'idempotence via une table `processed_events`.

### 4.3 Exemple de migration AdonisJS (Inventory)

```typescript
// database/migrations/TIMESTAMP_create_stocks_table.ts
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('stocks', (table) => {
      table.uuid('id').primary()
        .defaultTo(this.db.rawQuery('gen_random_uuid()').knexQuery)
      table.uuid('product_id').notNullable()
      table.uuid('warehouse_id').references('warehouses.id').notNullable()
      table.enu('stock_type', ['RAW_MATERIAL', 'FINISHED_PRODUCT']).notNullable()
      table.decimal('quantity', 12, 3).defaultTo(0).notNullable()
      table.decimal('reserved', 12, 3).defaultTo(0).notNullable()
      table.decimal('threshold', 12, 3).defaultTo(0).notNullable()
      table.timestamp('updated_at')
      table.unique(['product_id', 'warehouse_id'])
    })
  }

  async down() {
    this.schema.dropTable('stocks')
  }
}
```

---

## 5. Contrats d'API

### 5.1 Conventions REST (CDC §3.2)

| Convention     | Règle                                                                    |
|----------------|--------------------------------------------------------------------------|
| Versioning     | `/api/v1/...` sur tous les services                                      |
| Format         | JSON · `Content-Type: application/json`                                  |
| Auth header    | `Authorization: Bearer <JWT>`                                            |
| Pagination     | `?page=1&limit=20` → `{ data, meta: { total, page, lastPage } }`         |
| Erreurs        | `{ error: { code, message, details? } }`                                 |
| Codes HTTP     | 200 · 201 · 400 · 401 · 403 · 404 · 409 (conflict) · 422 · 500          |

### 5.2 Exemples de réponses

```json
// GET /api/v1/orders/uuid-123  →  200 OK
{
  "data": {
    "id": "uuid-123",
    "status": "VALIDATED",
    "customer": { "id": "uuid-456", "name": "Client X" },
    "lines": [
      { "productId": "uuid-789", "quantity": 50, "unitPrice": 5000 }
    ],
    "totalAmount": 250000,
    "createdAt": "2025-04-16T08:00:00Z"
  }
}

// Erreur de validation  →  422 Unprocessable Entity
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "La validation a échoué",
    "details": [
      { "field": "quantity", "rule": "min", "message": "Doit être supérieur à 0" }
    ]
  }
}

// Conflit de stock  →  409 Conflict
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Stock insuffisant pour le produit demandé",
    "details": { "productId": "uuid-789", "requested": 50, "available": 30 }
  }
}
```

### 5.3 Conventions GraphQL

- **Queries** → lectures (idempotentes)
- **Mutations** → écritures
- **Subscriptions** → temps réel WebSocket (Order Service uniquement)
- Format d'erreur : `{ errors: [{ message, extensions: { code, field? } }] }`
- Authentification : `Authorization: Bearer <JWT>` dans les headers HTTP

---

## 6. Communication inter-services

### 6.1 Synchrone — REST (CDC §3.3)

Utilisé uniquement pour les requêtes **immédiates et bloquantes** entre services.

```
Order Service ──REST──► Inventory Service
  POST /api/v1/stocks/check-availability
  Body:     { productId, quantity }
  Response: { available: true|false, currentStock: number }
```

**Règles de robustesse :**

| Règle           | Valeur                                              |
|-----------------|-----------------------------------------------------|
| Timeout         | 2 secondes maximum                                  |
| Circuit Breaker | Ouverture après 5 échecs consécutifs (opossum)      |
| Fallback        | Retourner `available: false` — pas de blocage       |
| Retry           | 2 tentatives avec backoff fixe (500ms)              |

### 6.2 Asynchrone — RabbitMQ (CDC §3.3)

**Topologie des exchanges :**

```
Exchange: sfmc.events (type: topic, durable: true)
│
├── Routing Key: order.*
│   ├── order.created              → [inventory, notification]
│   ├── order.validated            → [billing, notification]
│   ├── order.cancelled            → [inventory, billing, notification]
│   └── order.shipped              → [inventory, notification]
│
├── Routing Key: production.*
│   ├── production.required        → [production]
│   ├── production.started         → [notification]
│   ├── production.completed       → [inventory, order, notification]
│   └── production.quality_failed  → [notification]
│
├── Routing Key: inventory.*
│   └── inventory.critical         → [notification, production]
│
└── Routing Key: billing.*
    └── billing.invoice_created    → [notification]
```

**Structure d'un message événement :**

```typescript
interface DomainEvent {
  id: string           // UUID unique de l'événement
  type: string         // Ex : 'order.validated'
  version: string      // '1.0' — versioning du contrat
  timestamp: string    // ISO 8601
  payload: object      // Données spécifiques à l'événement
  metadata: {
    sourceService: string
    correlationId: string   // Tracing distribué
    sagaId?: string         // Présent si l'événement fait partie d'une Saga
  }
}
```

**Garanties de livraison :**

| Garantie       | Mécanisme                                                              |
|----------------|------------------------------------------------------------------------|
| Durabilité     | Messages persistés sur disque (durable queues)                         |
| Idempotence    | Table `processed_events` par consumer — déduplication sur `event.id`   |
| Retry          | 3 tentatives : backoff exponentiel 1s → 5s → 30s                       |
| DLQ            | Dead Letter Queue après 3 échecs — monitoring et alerting              |

---

## 7. Gestion des transactions distribuées — Saga Pattern

> **Exigence CDC §4.3** : cohérence éventuelle et Saga pattern pour les transactions distribuées.

### 7.1 Principe retenu — Saga Choreography

Le pattern **Choreography** est adopté : chaque service réagit aux événements et publie les siens, sans orchestrateur central. Ce choix maximise le découplage et évite un Single Point of Failure.

### 7.2 Saga : Création de commande

Cette saga coordonne la vérification et la réservation de stock lors de la création d'une commande.

```
Étape 1 — Order Service
  Action     : créer l'Order en statut PENDING
  Événement  : order.created

Étape 2 — Inventory Service (consomme order.created)
  Action     : vérifier disponibilité + réserver le stock
  Succès     : inventory.reserved → Order Service → statut VALIDATED
  Échec      : inventory.reservation_failed → Order Service → statut CANCELLED

Étape 3 — Billing Service (consomme order.validated)
  Action     : générer la facture
  Succès     : billing.invoice_created → Notification Service
```

**Transaction compensatoire (rollback) :**

```
Si inventory.reservation_failed :
  └── Order Service      → annuler l'Order (statut CANCELLED)
  └── Notification Svc   → notifier le client de l'indisponibilité

Si order.cancelled après réservation :
  └── Inventory Service  → libérer la réservation (POST /stocks/release)
  └── Billing Service    → émettre un avoir si facture existante
```

### 7.3 Saga : Commande nécessitant une production

```
order.validated
  └── Order Service      → détecter stock insuffisant en produits finis
  └── Inventory Service  → émettre order.production_required

order.production_required
  └── Production Service → créer OF, statut PLANNED → IN_PROGRESS
  └── Notification Svc   → notifier Resp. Production

production.completed
  └── Inventory Service  → incrémenter le stock produits finis
  └── Order Service      → passer la commande en statut READY
  └── Notification Svc   → notifier Resp. Logistique
```

### 7.4 Table de suivi des Sagas

```typescript
// Dans chaque service participant à une Saga
// database/migrations/create_saga_log_table.ts
this.schema.createTable('saga_log', (table) => {
  table.uuid('id').primary()
  table.string('saga_id').notNullable()        // Corrèle les étapes
  table.string('saga_type').notNullable()      // 'order_creation', 'order_production'
  table.string('step').notNullable()           // Étape courante
  table.enu('status', ['PENDING', 'COMPLETED', 'COMPENSATING', 'FAILED'])
  table.json('payload')
  table.timestamps(true, true)
})
```

---

## 8. Sécurité

### 8.1 Authentification (CDC §5.1)

Deux mécanismes coexistent selon le type de client :

```
[Client interne — Web/Mobile]
  POST /auth/login → { accessToken (15min), refreshToken (7j) }
  Requête API → Authorization: Bearer <accessToken>
  API Gateway → POST /auth/validate → { valid, userId, roles }

[Partenaire externe — OAuth2]
  GET  /auth/oauth/authorize → redirect vers page de consentement
  POST /auth/oauth/token     → { access_token, token_type, expires_in }
  Requête API → Authorization: Bearer <oauth_token>
```

### 8.2 Autorisation RBAC (CDC §5.2)

```typescript
// app/policies/order_policy.ts — Bouncer
export const OrderPolicy = class {
  create(user: User) {
    return ['ADMIN', 'OPERATOR', 'CLIENT'].includes(user.role)
  }
  updateStatus(user: User) {
    return ['ADMIN', 'OPERATOR'].includes(user.role)
  }
  delete(user: User, order: Order) {
    return user.role === 'ADMIN' || order.customerId === user.id
  }
}
```

### 8.3 Sécurité applicative (CDC §5.4 — OWASP)

| Vecteur d'attaque | Mitigation                                                              |
|-------------------|-------------------------------------------------------------------------|
| Injection SQL     | Lucid ORM — requêtes paramétrées exclusivement                          |
| XSS               | Sanitisation VineJS + headers CSP via `@adonisjs/shield`               |
| CSRF              | Désactivé pour les APIs stateless JWT — actif si cookie de session      |
| Brute force       | Rate limiting `/auth/login` : 5 tentatives / 15 min (Redis)             |
| Secrets           | Variables d'environnement uniquement — jamais dans le code source       |
| HTTPS             | TLS 1.3 minimum — forcé au niveau Gateway (CDC §5.3)                   |
| Dépendances       | Audit `npm audit` en CI/CD — Snyk ou Dependabot                        |
| Logs              | Aucune donnée sensible (tokens, MDP) dans les logs                      |

---

## 9. Exigences non fonctionnelles & scalabilité

> Alignement direct sur le tableau CDC §6.

| Critère           | Exigence CDC | Implémentation technique                                        |
|-------------------|--------------|-----------------------------------------------------------------|
| **Performance**   | < 2s (p95)   | Nginx load balancing · Lucid query optimization · Redis cache   |
| **Disponibilité** | 99.9%        | Kubernetes multi-replica · Health checks · Rolling deploys      |
| **Scalabilité**   | Horizontale  | Kubernetes HPA (CPU/mémoire) · Stateless services · RabbitMQ   |
| **Maintenabilité**| Indépendante | Monorepo · Shared packages · OpenAPI docs · Tests ≥ 80%         |
| **Sécurité**      | OWASP        | Voir §8 — audit automatisé en pipeline CI/CD                   |

### 9.1 Scalabilité horizontale — Kubernetes HPA

```yaml
# infra/k8s/hpa-order-service.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: order-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: order-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

Tous les services AdonisJS sont **stateless** (pas de session serveur — JWT uniquement), ce qui garantit une scalabilité horizontale sans contrainte de session sticky.

---

## 10. Infrastructure & déploiement

### 10.1 Structure monorepo

```
sfmc-backend/
├── services/
│   ├── auth-service/
│   ├── user-service/
│   ├── product-service/
│   ├── inventory-service/
│   ├── order-service/
│   ├── production-service/
│   ├── billing-service/
│   ├── notification-service/
│   └── reporting-service/
├── packages/
│   ├── shared-types/          # Interfaces TypeScript partagées
│   ├── event-contracts/       # Schémas RabbitMQ typés
│   └── auth-middleware/       # Middleware JWT réutilisable
├── infra/
│   ├── docker-compose.yml     # Développement local
│   ├── docker-compose.prod.yml
│   ├── nginx/
│   └── k8s/                   # Manifests Kubernetes + HPA
└── docs/
    └── openapi/               # Specs OpenAPI 3.0 par service
```

### 10.2 Infrastructure transversale

| Composant        | Développement          | Production               |
|------------------|------------------------|--------------------------|
| Conteneurisation | Docker + Compose       | Kubernetes               |
| API Gateway      | Nginx                  | Kong                     |
| Message Broker   | RabbitMQ               | RabbitMQ (cluster)       |
| Service Discovery| Consul                 | Consul (cluster)         |
| Monitoring       | —                      | Prometheus + Grafana     |
| Logs             | Console                | Winston + ELK Stack      |
| Tracing          | —                      | Jaeger                   |
| Secrets          | `.env`                 | Kubernetes Secrets       |

### 10.3 Structure d'un service AdonisJS

```
[service-name]/
├── app/
│   ├── controllers/
│   ├── services/             # Logique métier pure (testable)
│   ├── models/               # Lucid ORM
│   ├── validators/           # VineJS
│   ├── policies/             # RBAC Bouncer
│   ├── events/               # Définition des événements internes
│   └── listeners/            # Handlers RabbitMQ
├── config/
├── database/
│   └── migrations/
├── start/
│   ├── routes.ts
│   └── kernel.ts
├── tests/
│   ├── unit/
│   └── integration/
├── .env
├── .env.example
└── Dockerfile                # Multi-stage build
```

### 10.4 Dockerfile multi-stage (optimisé)

```dockerfile
# Stage 1 — Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN node ace build

# Stage 2 — Production
FROM node:20-alpine AS production
WORKDIR /app
COPY --from=builder /app/build ./
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "bin/server.js"]
```

---

## 11. Planning & sprints

> **Calendrier global CDC §7 :**
> Analyse 2j · Conception 3j · **Développement 4j** · Tests 1j · Déploiement 1j
>
> Ce document couvre les phases Développement, Tests et Déploiement.
> Les phases Analyse et Conception sont documentées dans ARB-SFMC-2025-001.

---

### Sprint 0 — Fondations (½ journée pré-développement)

**Objectif :** Environnement de travail commun opérationnel.

| Tâche                    | Détail                                          |
|--------------------------|-------------------------------------------------|
| Monorepo                 | Initialisation Turborepo + workspaces npm       |
| `shared-types`           | Interfaces TypeScript : User, Order, DomainEvent|
| `event-contracts`        | Schémas RabbitMQ typés + versioning             |
| `auth-middleware`        | Middleware JWT réutilisable par tous les services|
| Docker Compose complet   | RabbitMQ + Consul + PostgreSQL × 9              |
| Nginx config             | Routing vers les 9 services                     |
| Variables d'environnement| `.env.example` documenté pour chaque service    |

**Critère de sortie :** `docker-compose up` démarre tous les services — RabbitMQ UI et Consul accessibles.

---

### Sprint 1 — Jour 1 : Socle Identité, Utilisateurs & Catalogue

**Objectif :** Fondations transversales dont tous les autres services dépendent.

#### Auth Service
- [ ] Migration `refresh_tokens`, `oauth_clients`
- [ ] `POST /auth/login` → JWT + Refresh Token
- [ ] `POST /auth/refresh` · `POST /auth/logout`
- [ ] `POST /auth/validate` (inter-service)
- [ ] Flux OAuth2 Authorization Code (`/oauth/authorize`, `/oauth/token`)
- [ ] Rate limiting login : 5 requêtes / 15 min
- [ ] Tests unitaires `TokenService` et `OAuthService`

#### User Service
- [ ] Migrations `users`, `roles`
- [ ] CRUD complet `/users`
- [ ] Policies RBAC (Bouncer) : ADMIN, OPERATOR, CLIENT
- [ ] `PUT /users/:id/role`
- [ ] Tests unitaires + intégration

#### Product Service
- [ ] Migrations `products`, `categories`
- [ ] CRUD REST + schéma GraphQL (queries / mutations)
- [ ] Seed catalogue initial : ciment, fer, briques, granulats
- [ ] Tests unitaires

**Critères de sortie :** Login → JWT valide ✓ · CRUD utilisateurs avec RBAC ✓ · Catalogue requêtable REST et GraphQL ✓

---

### Sprint 2 — Jour 2 : Stock & Commandes (cœur métier)

**Objectif :** Flux principal `Commande → Vérification stock → Validation / Lancement production` fonctionnel.

#### Inventory Service
- [ ] Migrations `warehouses`, `stocks` (avec `stock_type`, `reserved`), `stock_movements`
- [ ] Seed entrepôts et stocks initiaux (matières premières + produits finis)
- [ ] `POST /stocks/movements` (IN / OUT / ADJUSTMENT)
- [ ] `GET /stocks/alerts` — seuils critiques
- [ ] `POST /stocks/check-availability` (endpoint interne)
- [ ] `POST /stocks/reserve` · `POST /stocks/release` (Saga)
- [ ] GraphQL queries : `stocks`, `stockMovements`, `criticalStocks`
- [ ] Consumer : `production.completed` → mise à jour stock produits finis
- [ ] Consumer : `order.cancelled` → libération réservation
- [ ] Émission : `inventory.critical` si seuil atteint
- [ ] Table `processed_events` (idempotence)
- [ ] Tests unitaires : algorithme seuil critique, réservation/libération

#### Order Service
- [ ] Migrations `orders`, `order_lines`, `saga_log`
- [ ] `POST /orders` + appel REST Inventory (`check-availability`)
- [ ] Circuit breaker sur l'appel Inventory (opossum)
- [ ] Saga choreography : `order.created` → `inventory.reserved` / `inventory.reservation_failed`
- [ ] Machine à états des commandes
- [ ] Émission : `order.created`, `order.validated`, `order.cancelled`
- [ ] Consumer : `production.completed` → statut `READY`
- [ ] GraphQL : queries, mutations, Subscription `orderStatusUpdated`
- [ ] Tests intégration : flux complet commande → validation → annulation

**Critères de sortie :** Commande créée, stock vérifié et réservé ✓ · Événements émis sur RabbitMQ ✓ · Compensation Saga fonctionnelle ✓

---

### Sprint 3 — Jour 3 : Production, Finance & Notifications

**Objectif :** Chaînes aval (production, facturation, notifications) connectées.

#### Production Service
- [ ] Migrations `production_orders` (avec statut `QUALITY_CHECK`), `machines`
- [ ] Consumer : `order.production_required` → créer OF
- [ ] `PUT /production-orders/:id/status` — avancement
- [ ] `POST /production-orders/:id/quality` — résultat contrôle qualité
- [ ] Émission : `production.started`, `production.completed`, `production.quality_failed`
- [ ] Gestion ressources machines (disponibilité)
- [ ] Tests intégration : OF → contrôle qualité → completed → stock mis à jour

#### Billing Service
- [ ] Migrations `invoices`, `payments`
- [ ] Consumer : `order.validated` → générer facture automatiquement
- [ ] Consumer : `order.cancelled` → émettre avoir si facture existante
- [ ] `POST /invoices/:id/payments` — enregistrement paiement
- [ ] `GET /invoices/:id/pdf` — génération PDF
- [ ] Tests unitaires : génération facture, paiement partiel, avoir

#### Notification Service
- [ ] Migrations `notifications`, `processed_events`
- [ ] Consumers : tous les événements de la matrice §3.8
- [ ] Intégration SMTP (AdonisJS Mail + Nodemailer)
- [ ] Intégration SMS (Orange API Bénin ou Twilio)
- [ ] Notification `production.quality_failed`
- [ ] Tests unitaires dispatcher

**Critères de sortie :** Flux complet Commande → Production → Contrôle Qualité → Stock → Facture → Notification ✓ · PDF facture généré ✓ · Email + SMS envoyés ✓

---

### Sprint 4 — Jour 4 : Reporting, Qualité & Déploiement

> Le CDC §7 découpe cette journée en deux demi-journées : Tests (1j) et Déploiement (1j). Ce sprint les couvre intégralement.

**Objectif :** Plateforme complète, sécurisée, monitorée et déployée en staging.

#### Reporting Service
- [ ] Migrations read-side (tables dénormalisées)
- [ ] Consumers : agrégation de tous les événements métier
- [ ] GraphQL : `dashboardKPIs`, `stockReport`, `salesReport`, `productionReport`, `qualityReport`
- [ ] Tests GraphQL

#### Sécurité & Qualité (CDC §5, §6)
- [ ] Audit OWASP : injection SQL, XSS, CSRF sur tous les endpoints
- [ ] `@adonisjs/shield` (Helmet + CSP) sur tous les services
- [ ] Revue variables d'environnement — aucun secret en dur
- [ ] Couverture tests ≥ 80% par service (Japa + Istanbul)
- [ ] Tests de charge Artillery : p95 < 2s sous charge nominale

#### Observabilité
- [ ] Structured logging Winston → format JSON, sans données sensibles
- [ ] Correlation ID propagé dans tous les services (header `X-Correlation-Id`)
- [ ] Prometheus metrics endpoint `GET /metrics` sur chaque service
- [ ] Jaeger tracing — spans sur appels inter-services et consommation RabbitMQ
- [ ] Dashboard Grafana : golden signals (latence, erreurs, saturation)

#### Déploiement
- [ ] Dockerfiles multi-stage finalisés
- [ ] `docker-compose.prod.yml` — variables d'env production
- [ ] Manifests Kubernetes : Deployments, Services, HPA, ConfigMaps, Secrets
- [ ] Health check `GET /health` sur chaque service
- [ ] Smoke tests post-déploiement (Artillery + scripts)

**Critères de sortie — Definition of Done :**

| Critère                          | Valeur cible |
|----------------------------------|--------------|
| Endpoints documentés             | OpenAPI + GraphQL Playground ✓ |
| Couverture tests                 | ≥ 80% par service ✓ |
| Temps de réponse p95             | < 2s sous charge ✓ |
| Disponibilité staging            | 99.9% validée ✓ |
| Vulnérabilités OWASP critiques   | Zéro ✓ |
| Dashboard Grafana                | Opérationnel ✓ |
| Flux OAuth2                      | Testé avec partenaire externe ✓ |

---

### Récapitulatif global (CDC §7)

| Phase         | Durée CDC | Sprint      | Services / Activités                              |
|---------------|-----------|-------------|---------------------------------------------------|
| Analyse       | 2 jours   | —           | ARB-SFMC-2025-001                                 |
| Conception    | 3 jours   | —           | ARCH-SFMC-2025-002 (ce document)                  |
| Développement | 4 jours   | Sprint 0–3  | 9 microservices AdonisJS                          |
| Tests         | 1 jour    | Sprint 4a   | Couverture ≥ 80% · Tests de charge · OWASP        |
| Déploiement   | 1 jour    | Sprint 4b   | Docker · Kubernetes · Smoke tests · Monitoring    |

---

## 12. Gestion des risques

> Alignement sur CDC §8.

| Risque                                    | Probabilité | Impact | Mitigation                                                                   |
|-------------------------------------------|-------------|--------|------------------------------------------------------------------------------|
| Complexité communication inter-services   | Haute       | Haute  | Circuit breaker · Timeout 2s · Fallback gracieux · Tests intégration         |
| Transactions distribuées incohérentes     | Moyenne     | Haute  | Saga Pattern (§7) · Idempotence · Table `saga_log`                           |
| Latence réseau dégradée                   | Moyenne     | Moyenne| Cache Redis (lectures fréquentes) · Jaeger tracing pour diagnostics          |
| Désynchronisation des données             | Moyenne     | Moyenne| Eventual Consistency assumée · Dead Letter Queue · Monitoring RabbitMQ       |
| Surcharge d'un service                    | Faible      | Haute  | Kubernetes HPA · Rate limiting API Gateway · Queues RabbitMQ comme buffer   |
| Failure du Message Broker                 | Faible      | Haute  | RabbitMQ cluster (3 nœuds en prod) · Alerting Prometheus                    |
| Vulnérabilité sécurité                    | Faible      | Haute  | Audit OWASP Sprint 4 · `npm audit` en CI · Snyk                             |

---

## Annexes

### A. Facteurs clés de succès (CDC §9)

1. **Bonne définition des domaines métier (DDD)** — 9 services aux responsabilités clairement délimitées.
2. **Tests automatisés** — couverture ≥ 80%, tests d'intégration sur les flux critiques.
3. **Monitoring efficace** — Prometheus + Grafana + Jaeger opérationnels dès le déploiement.
4. **Sécurité robuste** — OWASP, TLS 1.3, RBAC, OAuth2, secrets en variables d'environnement.
5. **Documentation vivante** — OpenAPI 3.0 et GraphQL Playground co-localisés avec le code.

### B. Glossaire

| Terme              | Définition                                                              |
|--------------------|-------------------------------------------------------------------------|
| DDD                | Domain Driven Design — modélisation centrée sur le domaine métier       |
| CQRS               | Command Query Responsibility Segregation — séparation lectures/écritures|
| Saga               | Pattern de transaction distribuée sans 2PC                              |
| Eventual Consistency | Cohérence atteinte de façon différée via les événements               |
| DLQ                | Dead Letter Queue — file des messages en échec après retry              |
| HPA                | Horizontal Pod Autoscaler — scalabilité automatique Kubernetes          |
| OF                 | Ordre de Fabrication                                                    |
| RBAC               | Role-Based Access Control — contrôle d'accès basé sur les rôles        |

---

*Document de Conception Backend — SFMC Bénin*
*Référence : ARCH-SFMC-2025-002 · Version 2.0*
*Ce document est le livrable de la Phase 2 (Conception) et constitue la base contractuelle de la Phase 3 (Développement).*
*Aligné sur le Cahier des Charges CDC-SFMC-2025-001.*
