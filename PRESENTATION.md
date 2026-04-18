# SFMC Bénin — Document de présentation du projet

| Champ         | Valeur                                                   |
|---------------|----------------------------------------------------------|
| Projet        | Plateforme backend SFMC Bénin                            |
| Domaine       | Matériaux de construction — ciment, fer, briques, granulats |
| Architecture  | Microservices event-driven (9 services) · REST + GraphQL |
| Stack         | AdonisJS 6 · Node.js 22 · TypeScript · PostgreSQL · RabbitMQ |
| Déploiement   | Docker Compose (dev) · Kubernetes (prod)                 |
| Statut        | Sprints 0 → 4 livrés — plateforme prête pour staging     |
| Date document | 2026-04-18                                               |

> Ce document consolide les livrables des sprints 0 à 4. Les détails d'implémentation par sprint restent dans [SPRINT_0_REPORT.md](sfmc-backend/SPRINT_0_REPORT.md), [SPRINT_1_REPORT.md](sfmc-backend/SPRINT_1_REPORT.md), [SPRINT_2_REPORT.md](sfmc-backend/SPRINT_2_REPORT.md), [SPRINT_3_REPORT.md](sfmc-backend/SPRINT_3_REPORT.md), [SPRINT_4_REPORT.md](sfmc-backend/SPRINT_4_REPORT.md). La conception détaillée est dans [achitecture.md](achitecture.md).

---

## Table des matières

1. [Contexte et objectifs](#1-contexte-et-objectifs)
2. [Acteurs](#2-acteurs)
3. [Cas d'utilisation](#3-cas-dutilisation)
4. [Liens acteurs ↔ cas d'utilisation](#4-liens-acteurs--cas-dutilisation)
5. [Architecture utilisée](#5-architecture-utilisée)
6. [Modèle de données — tables](#6-modèle-de-données--tables)
7. [Scénarios métier (Saga)](#7-scénarios-métier-saga)
8. [Tests — stratégie et exécution](#8-tests--stratégie-et-exécution)
9. [Récapitulatif des sprints](#9-récapitulatif-des-sprints)

---

## 1. Contexte et objectifs

La **SFMC (Société de Fabrication de Matériaux de Construction) Bénin** gère la production, le stockage et la commercialisation de matériaux de construction. Le projet livre un backend cloud-native composé de **9 microservices** couvrant trois chaînes métier :

| Chaîne        | Services impliqués                                                    |
|---------------|-----------------------------------------------------------------------|
| Production    | Inventory (MP) → Production → Contrôle qualité → Inventory (PF)       |
| Commerciale   | User → Order → Billing → Notification                                 |
| Logistique    | Inventory (multi-entrepôts) → Order (expédition) → Notification       |

**Objectifs techniques clés :**

- Indépendance de déploiement par domaine (1 service = 1 DB).
- Cohérence éventuelle via **Saga Choreography** (pas de 2PC).
- Reporting analytique sans charge sur les bases transactionnelles (**CQRS read-side**).
- Sécurité OWASP, observabilité native (health checks profonds), scalabilité horizontale (K8s HPA).

---

## 2. Acteurs

### 2.1 Acteurs humains

| Acteur                    | Rôle technique | Description                                                         |
|---------------------------|----------------|---------------------------------------------------------------------|
| **Client**                | `CLIENT`       | Passe des commandes, consulte ses factures et notifications.        |
| **Opérateur logistique**  | `OPERATOR`     | Gère les stocks (entrées/sorties/ajustements), expédie les commandes. |
| **Opérateur production**  | `OPERATOR`     | Lance/suit les ordres de fabrication, déclare le contrôle qualité.  |
| **Responsable finance**   | `OPERATOR`     | Consulte factures, enregistre paiements, émet avoirs.               |
| **Administrateur**        | `ADMIN`        | Gère utilisateurs, rôles, catalogue produits, configuration système. |

### 2.2 Acteurs système (externes)

| Acteur                   | Nature       | Interaction                                                         |
|--------------------------|--------------|---------------------------------------------------------------------|
| **Partenaire OAuth2**    | Système tiers | Authentifié par flux OAuth2 Authorization Code (`/auth/oauth/*`).   |
| **Fournisseur email**    | Brevo SMTP   | Canal d'envoi email via `smtp-relay.brevo.com:587`.                 |
| **Fournisseur SMS**      | Brevo REST (stub) | Canal d'envoi SMS — intégration prévue via API Transactional SMS Brevo. |
| **Cluster Kubernetes**   | Orchestrateur | Consomme `GET /health` pour les sondes liveness/readiness.          |

### 2.3 Acteurs internes (microservices)

Chacun des 9 microservices agit comme acteur dans certains scénarios en produisant/consommant des événements RabbitMQ.

---

## 3. Cas d'utilisation

### 3.1 Authentification & utilisateurs

| ID       | Cas d'utilisation                                  | Service         |
|----------|----------------------------------------------------|-----------------|
| UC-AUTH-01 | Se connecter (login email/password → JWT)        | auth-service    |
| UC-AUTH-02 | Rafraîchir le token d'accès                       | auth-service    |
| UC-AUTH-03 | Se déconnecter (révocation refresh token)         | auth-service    |
| UC-AUTH-04 | Valider un JWT (inter-service)                    | auth-service    |
| UC-AUTH-05 | Authentifier un partenaire externe via OAuth2     | auth-service    |
| UC-USER-01 | Créer / modifier / désactiver un utilisateur      | user-service    |
| UC-USER-02 | Changer le rôle d'un utilisateur                  | user-service    |

### 3.2 Catalogue

| ID         | Cas d'utilisation                                 | Service         |
|------------|---------------------------------------------------|-----------------|
| UC-PROD-01 | Lister / rechercher des produits (filtres)        | product-service |
| UC-PROD-02 | Créer / modifier / désactiver un produit          | product-service |
| UC-PROD-03 | Interroger le catalogue en GraphQL                | product-service |

### 3.3 Stocks

| ID         | Cas d'utilisation                                          | Service           |
|------------|------------------------------------------------------------|-------------------|
| UC-INV-01  | Consulter les stocks par entrepôt / produit                | inventory-service |
| UC-INV-02  | Enregistrer un mouvement de stock (IN/OUT/ADJUSTMENT)      | inventory-service |
| UC-INV-03  | Vérifier la disponibilité d'un produit (inter-service)     | inventory-service |
| UC-INV-04  | Réserver / libérer du stock (Saga)                         | inventory-service |
| UC-INV-05  | Recevoir des alertes de stock critique                     | inventory-service |
| UC-INV-06  | Incrémenter le stock produits finis après production       | inventory-service |

### 3.4 Commandes

| ID         | Cas d'utilisation                                                   | Service       |
|------------|---------------------------------------------------------------------|---------------|
| UC-ORD-01  | Créer une commande (déclenche Saga)                                 | order-service |
| UC-ORD-02  | Consulter l'état d'une commande (polling ou subscription GraphQL)   | order-service |
| UC-ORD-03  | Annuler une commande (avec compensation)                            | order-service |
| UC-ORD-04  | Changer le statut d'une commande (opérateur)                        | order-service |

### 3.5 Production

| ID          | Cas d'utilisation                                               | Service            |
|-------------|-----------------------------------------------------------------|--------------------|
| UC-PROD-04  | Créer un ordre de fabrication (automatique ou manuel)           | production-service |
| UC-PROD-05  | Faire avancer un OF (PLANNED → IN_PROGRESS → QUALITY_CHECK)     | production-service |
| UC-PROD-06  | Déclarer le résultat du contrôle qualité (COMPLETED / REJECTED) | production-service |
| UC-PROD-07  | Consulter l'état des machines                                   | production-service |

### 3.6 Facturation

| ID          | Cas d'utilisation                                             | Service         |
|-------------|---------------------------------------------------------------|-----------------|
| UC-BILL-01  | Générer automatiquement une facture depuis `order.validated`  | billing-service |
| UC-BILL-02  | Enregistrer un paiement (CASH / MOBILE_MONEY / BANK_TRANSFER) | billing-service |
| UC-BILL-03  | Annuler une facture depuis `order.cancelled`                  | billing-service |
| UC-BILL-04  | Télécharger le PDF d'une facture                              | billing-service |

### 3.7 Notifications

| ID           | Cas d'utilisation                                               | Service              |
|--------------|-----------------------------------------------------------------|----------------------|
| UC-NOTIF-01  | Envoyer un email de confirmation de commande (Brevo SMTP)       | notification-service |
| UC-NOTIF-02  | Alerter l'admin en cas de stock critique                        | notification-service |
| UC-NOTIF-03  | Alerter l'admin en cas d'échec qualité                          | notification-service |
| UC-NOTIF-04  | Informer le client de l'expédition (SMS, stub)                  | notification-service |

### 3.8 Reporting & observabilité

| ID         | Cas d'utilisation                                                      | Service           |
|------------|------------------------------------------------------------------------|-------------------|
| UC-RPT-01  | Consulter le tableau de bord KPIs (REST `/api/v1/reports/dashboard`)   | reporting-service |
| UC-RPT-02  | Interroger les rapports ventes / production / qualité (GraphQL)        | reporting-service |
| UC-RPT-03  | Consulter la liste des alertes stock critique                          | reporting-service |
| UC-OBS-01  | Vérifier la santé d'un service (DB + RabbitMQ)                         | tous (`GET /health`) |

---

## 4. Liens acteurs ↔ cas d'utilisation

### 4.1 Matrice acteurs humains / cas d'utilisation

| Cas d'utilisation            | CLIENT | OPERATOR | ADMIN | Partenaire OAuth2 |
|------------------------------|:------:|:--------:|:-----:|:-----------------:|
| UC-AUTH-01 Login             |   ✓    |    ✓     |   ✓   |         —         |
| UC-AUTH-05 OAuth2            |   —    |    —     |   —   |         ✓         |
| UC-USER-01 CRUD users        |   —    |    —     |   ✓   |         —         |
| UC-USER-02 Change role       |   —    |    —     |   ✓   |         —         |
| UC-PROD-01 Lister produits   |   ✓    |    ✓     |   ✓   |         ✓         |
| UC-PROD-02 CRUD produit      |   —    |    —     |   ✓   |         —         |
| UC-INV-01 Consulter stocks   |   —    |    ✓     |   ✓   |         —         |
| UC-INV-02 Mouvement stock    |   —    |    ✓     |   ✓   |         —         |
| UC-INV-05 Alertes            |   —    |    ✓     |   ✓   |         —         |
| UC-ORD-01 Créer commande     |   ✓    |    ✓     |   ✓   |         ✓         |
| UC-ORD-03 Annuler commande   |   ✓¹   |    ✓     |   ✓   |         —         |
| UC-ORD-04 Changer statut     |   —    |    ✓     |   ✓   |         —         |
| UC-PROD-05 Avancer OF        |   —    |    ✓     |   ✓   |         —         |
| UC-PROD-06 Contrôle qualité  |   —    |    ✓     |   ✓   |         —         |
| UC-BILL-02 Payer facture     |   ✓    |    ✓     |   ✓   |         —         |
| UC-BILL-04 Télécharger PDF   |   ✓    |    ✓     |   ✓   |         —         |
| UC-RPT-01 Dashboard          |   —    |    ✓     |   ✓   |         —         |

> ¹ Le client ne peut annuler **que ses propres commandes** et seulement avant l'état `SHIPPED`.

### 4.2 Liens inter-services (événements RabbitMQ)

Chaque flèche représente un lien **acteur système → acteur système** via un événement.

```
order-service       ──order.created──────► inventory-service
inventory-service   ──inventory.reserved──► order-service
inventory-service   ──inventory.reservation_failed──► order-service
order-service       ──order.validated────► billing-service
order-service       ──order.validated────► notification-service
order-service       ──order.validated────► reporting-service
order-service       ──order.cancelled────► billing-service
order-service       ──order.cancelled────► inventory-service
order-service       ──order.cancelled────► notification-service
order-service       ──order.production_required──► production-service
production-service  ──production.completed──► inventory-service
production-service  ──production.completed──► order-service
production-service  ──production.completed──► reporting-service
production-service  ──production.quality_failed──► notification-service
inventory-service   ──inventory.critical_stock──► notification-service
inventory-service   ──inventory.critical_stock──► reporting-service
billing-service     ──billing.invoice_created──► notification-service
```

---

## 5. Architecture utilisée

### 5.1 Vue d'ensemble

```
                    ┌─────────────────────────────────┐
                    │          CLIENTS                 │
                    │  Web · Mobile · Partenaires      │
                    └──────────────┬──────────────────┘
                                   │ HTTPS / JWT
                    ┌──────────────▼──────────────────┐
                    │        API GATEWAY              │
                    │  Nginx (dev) · Kong (prod)      │
                    └──┬──────────┬─────────────┬─────┘
       ┌───────────────┴────┬─────┴──────┬──────┴─────────────┐
  ┌────▼─────┐  ┌────▼─────┐  ┌────▼─────┐  ┌────▼──────────┐
  │ Auth     │  │ User     │  │ Product  │  │ Inventory     │
  │ :3001    │  │ :3002    │  │ :3003    │  │ :3004         │
  │ REST     │  │ REST     │  │ REST+GQL │  │ REST+GQL      │
  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬──────────┘
       │             │             │              │
  ┌────▼─────┐  ┌────▼─────┐  ┌────▼─────┐  ┌────▼──────────┐
  │ Order    │  │ Produc.  │  │ Billing  │  │ Notification  │
  │ :3005    │  │ :3006    │  │ :3007    │  │ :3008         │
  │ REST+GQL │  │ REST     │  │ REST     │  │ REST          │
  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬──────────┘
       └──────────┬──┴─────────────┴──────────────┘
                  │
       ┌──────────▼──────────────────┐
       │   RabbitMQ (topic exchange) │
       │   sfmc.events + DLX         │
       └──────────┬──────────────────┘
                  │
       ┌──────────▼──────────────────┐
       │   Reporting Service :3009   │
       │   GraphQL · CQRS read-side  │
       └─────────────────────────────┘
```

### 5.2 Principes d'architecture retenus

| Principe                      | Décision                                                          |
|-------------------------------|-------------------------------------------------------------------|
| 1 service = 1 domaine métier  | DDD strict — 9 services                                           |
| 1 service = 1 base de données | PostgreSQL dédié (Database per Service)                           |
| Communication synchrone       | REST (timeout 2s, circuit breaker opossum)                        |
| Communication asynchrone      | RabbitMQ topic exchange `sfmc.events`                             |
| Transactions distribuées      | Saga Choreography (pas d'orchestrateur central)                   |
| Cohérence                     | Eventual consistency + idempotence (`processed_events`)           |
| Reads analytiques             | CQRS — reporting-service projette les événements                  |
| Sécurité                      | JWT stateless + RBAC (Bouncer-style) + OWASP headers + rate limit |
| Scalabilité                   | Kubernetes HPA (CPU 70%, 2→10 replicas)                           |

### 5.3 Stack par service

```
AdonisJS 6 (TypeScript, Node 22)
├── ORM              → Lucid (Active Record)
├── Validation       → VineJS
├── Auth             → jsonwebtoken + policies TS
├── GraphQL          → Apollo Server 4 (Product, Inventory, Order, Reporting)
├── Message Broker   → amqplib (RabbitMQ client)
├── HTTP inter-svc   → undici + opossum (circuit breaker)
├── Email            → nodemailer + Brevo SMTP
└── Tests            → Japa (unit + integration)
```

### 5.4 Garanties de livraison RabbitMQ

| Garantie      | Mécanisme                                                        |
|---------------|------------------------------------------------------------------|
| Durabilité    | Queues `durable: true`, messages persistés sur disque            |
| Idempotence   | Table `processed_events` par service, dédupe sur `event.id`      |
| Retry         | Backoff 1s → 5s → 30s (3 tentatives)                             |
| DLQ           | Exchange `sfmc.dlx` + queue `sfmc.dlq` (fanout)                  |
| At-least-once | Ack manuel après persistance de la projection                    |

---

## 6. Modèle de données — tables

### 6.1 Répartition (Database per Service)

| Service              | Base PostgreSQL      | Port hôte |
|----------------------|----------------------|-----------|
| auth-service         | `sfmc_auth`          | 5431      |
| user-service         | `sfmc_user`          | 5440 ¹    |
| product-service      | `sfmc_product`       | 5433      |
| inventory-service    | `sfmc_inventory`     | 5434      |
| order-service        | `sfmc_order`         | 5435      |
| production-service   | `sfmc_production`    | 5436      |
| billing-service      | `sfmc_billing`       | 5437      |
| notification-service | `sfmc_notification`  | 5438      |
| reporting-service    | `sfmc_reporting`     | 5439      |

> ¹ `user-db` exposé sur 5440 (et non 5432) car un PostgreSQL local occupait le port standard — cf. SPRINT_1_REPORT §3.

### 6.2 Tables par service

**auth-service (`sfmc_auth`)**
- `users` — UUID, email (unique), password (bcrypt), fullName, role (enum), isActive
- `refresh_tokens` — UUID, userId (FK), token, expiresAt
- `oauth_clients` — UUID, clientId, clientSecret, redirectUri

**user-service (`sfmc_user`)**
- `users` — UUID, firstName, lastName, email, phone, role (`ADMIN`|`OPERATOR`|`CLIENT`), isActive

**product-service (`sfmc_product`)**
- `products` — UUID, name, category (`CIMENT`|`FER`|`BRIQUES`|`GRANULATS`), unit, unitPrice, isActive, description

**inventory-service (`sfmc_inventory`)**
- `warehouses` — UUID, name, location, capacity
- `stocks` — UUID, productId, warehouseId (FK), stockType (`RAW_MATERIAL`|`FINISHED_PRODUCT`), quantity, reserved, threshold, updatedAt (unique: productId+warehouseId)
- `stock_movements` — UUID, stockId, type (`IN`|`OUT`|`ADJUSTMENT`), quantity, origin, referenceId, date, createdBy
- `processed_events` — eventId (PK), eventType, processedAt

**order-service (`sfmc_order`)**
- `orders` — UUID, customerId, status (`PENDING`|`VALIDATED`|`IN_PRODUCTION`|`READY`|`SHIPPED`|`DELIVERED`|`CANCELLED`), sagaStatus, totalAmount, createdAt
- `order_lines` — UUID, orderId (FK), productId, quantity, unitPrice
- `saga_log` — UUID, sagaId, sagaType, step, status, payload

**production-service (`sfmc_production`)**
- `machines` — UUID, name, status (`AVAILABLE`|`IN_USE`|`MAINTENANCE`), lastMaintenanceAt
- `production_orders` — UUID, productId, quantity, orderId (nullable), machineId, status (`PLANNED`|`IN_PROGRESS`|`QUALITY_CHECK`|`COMPLETED`|`REJECTED`|`CANCELLED`), startedAt, completedAt
- `processed_events` — idempotence

**billing-service (`sfmc_billing`)**
- `invoices` — UUID, orderId (unique), customerId, amount, currency, status (`PENDING`|`PAID`|`CANCELLED`), dueDate, issuedAt
- `payments` — UUID, invoiceId (FK), amount, method (`CASH`|`MOBILE_MONEY`|`BANK_TRANSFER`), paidAt
- `processed_events` — idempotence

**notification-service (`sfmc_notification`)**
- `notifications` — UUID, recipient, type, channel (`EMAIL`|`SMS`), status (`SENT`|`FAILED`), payload, createdAt
- `processed_events` — idempotence

**reporting-service (`sfmc_reporting`) — projections CQRS**
- `report_orders` — orderId (unique), customerId, status, totalAmount, updatedAt
- `report_invoices` — invoiceId, orderId, amount, status
- `report_stock_snapshots` — productId, warehouseId, quantity, threshold, snapshotAt
- `report_production_orders` — productionOrderId, status, qualityPassed
- `processed_events` — idempotence

### 6.3 Cohérence et idempotence

- **Aucune clé étrangère inter-services** — chaque service est souverain sur son schéma.
- **Données dénormalisées** (ex. `customerId` sans FK vers `sfmc_user`) résolues par les événements.
- **Table `processed_events`** présente dans chaque service consommateur — déduplication sur `event.id` garantissant la tolérance at-least-once de RabbitMQ.

---

## 7. Scénarios métier (Saga)

### 7.1 Scénario 1 — Création de commande (flux nominal)

```
1. Client         → POST /api/v1/orders
2. order-service  → INSERT order (status=PENDING) + émet `order.created`
3. inventory-svc  → consomme, vérifie stock, réserve → émet `inventory.reserved`
4. order-service  → consomme, UPDATE status=VALIDATED + émet `order.validated`
5. billing-svc    → consomme, INSERT invoice (PENDING) + émet `billing.invoice_created`
6. notif-service  → consomme order.validated, envoie email via Brevo SMTP
7. reporting-svc  → consomme les 3 événements, met à jour les projections
```

**Résultat observable :** commande en `VALIDATED`, facture `PENDING`, email reçu, dashboard KPIs mis à jour.

### 7.2 Scénario 2 — Stock insuffisant (compensation)

```
1. Client         → POST /api/v1/orders
2. order-service  → INSERT order (PENDING) + émet `order.created`
3. inventory-svc  → stock insuffisant → émet `inventory.reservation_failed`
4. order-service  → UPDATE status=CANCELLED + émet `order.cancelled`
5. notif-service  → email "Commande refusée"
```

### 7.3 Scénario 3 — Commande nécessitant une production

```
1. order.validated (stock PF insuffisant détecté par inventory-service)
2. inventory-svc  → émet `order.production_required`
3. production-svc → INSERT production_order (PLANNED)
4. opérateur prod → PUT /production-orders/:id/status → IN_PROGRESS → QUALITY_CHECK
5. opérateur prod → POST /production-orders/:id/quality  { passed: true }
6. production-svc → UPDATE status=COMPLETED + émet `production.completed`
7. inventory-svc  → incrémente stock produits finis
8. order-service  → UPDATE order.status=READY
9. notif-service  → email "Commande prête à expédier"
```

### 7.4 Scénario 4 — Échec contrôle qualité

```
1. POST /production-orders/:id/quality  { passed: false, reason: "fissures" }
2. production-svc → UPDATE status=REJECTED + émet `production.quality_failed`
3. notif-service  → email alerte admin (xeex07864@gmail.com / davidyd07@gmail.com)
```

Aucun événement `production.completed` n'est émis tant que la qualité n'est pas validée — pas d'incrément de stock PF abusif.

### 7.5 Scénario 5 — Annulation après validation

```
1. DELETE /api/v1/orders/:id  (ou PUT status=CANCELLED)
2. order-service  → émet `order.cancelled`
3. inventory-svc  → libère la réservation
4. billing-svc    → UPDATE invoice.status=CANCELLED (ou REFUNDED si paiement)
5. notif-service  → email "Commande annulée"
```

### 7.6 Scénario 6 — Alerte stock critique

```
1. Mouvement OUT sur stocks → quantity ≤ threshold
2. inventory-svc  → émet `inventory.critical_stock`
3. notif-service  → email admin
4. reporting-svc  → insère un snapshot dans `report_stock_snapshots`
5. Admin consulte `GET /api/v1/reports/dashboard` → `criticalStockCount` incrémenté
```

### 7.7 Machine à états — Commande

```
[PENDING] ─stock OK──► [VALIDATED] ─production req──► [IN_PRODUCTION]
    │                      │                                │
    │                      │                                │ production.completed
    │                      │                                ▼
    │                      │                            [READY]
    │                      │                                │
    │                      │                                ▼
    │                      │                           [SHIPPED] ──► [DELIVERED]
    │                      │
    └──────────────────────┴──────────► [CANCELLED]  (possible avant SHIPPED)
```

---

## 8. Tests — stratégie et exécution

### 8.1 Pyramide de tests

| Niveau         | Outil         | Portée                                                              | Couverture |
|----------------|---------------|---------------------------------------------------------------------|------------|
| Unitaires      | Japa          | Policies RBAC, state machines, calculs KPI, services purs           | ~80%       |
| Intégration    | Japa + api-client | Routes REST + DB réelle (transaction jetable), listeners RabbitMQ | flux critiques |
| Smoke E2E      | PowerShell    | Écosystème complet démarré (Docker + services) — validation bout-en-bout | sprints 2/3/4 |

### 8.2 Prérequis communs

1. Docker Desktop lancé.
2. Depuis `sfmc-backend/` :
   ```bash
   docker compose up -d                     # Postgres × 9 + RabbitMQ
   npm install                              # résout les workspaces
   ```
3. Dans chaque service : `cp .env.example .env` puis `node ace migration:run`.
4. Démarrer les services (dans 9 terminaux — ou `docker compose -f docker-compose.prod.yml up`) :
   ```bash
   cd services/<service> && node ace serve
   ```

### 8.3 Tests unitaires

Depuis chaque dossier service :

```bash
node ace test unit
```

| Service              | Tests | Couverture clé                                               |
|----------------------|-------|--------------------------------------------------------------|
| auth-service         | 4     | JWT génération / secret invalide / expiration / rôle         |
| user-service         | 12    | Policies RBAC (list/create/view/update/delete/updateRole × 3 rôles) |
| product-service      | 5     | Catégories, prix, filtres, règles nom                        |
| order-service        | 10    | State machine (transitions autorisées / interdites)          |
| inventory-service    | 7     | Seuil critique, réservation, libération                      |
| production-service   | 5     | Création OF, contrôle qualité, compensation                  |
| billing-service      | 4     | `onOrderValidated`, `onOrderCancelled`, idempotence          |
| notification-service | 2     | Payload JSON, génération notifications                       |
| reporting-service    | 6     | `qualityFailureRate` (0%, 25%, 100%, arrondis, edge cases)   |

**Total : 55+ tests unitaires**, tous au vert.

### 8.4 Tests d'intégration

```bash
cd services/order-service && node ace test integration
```

Scénarios couverts :
- Flux Saga nominal (création → validation).
- Flux Saga avec échec stock (compensation).
- Circuit breaker opossum (5 échecs consécutifs → ouverture).
- Idempotence (rejeu du même event.id).

### 8.5 Smoke tests E2E

#### Sprint 2 — Saga Order + Inventory

```powershell
.\smoke_test_sprint2.ps1
```

Vérifie : health, login JWT, création commande, vérification stock, état VALIDATED.

#### Sprint 3 — Production, Billing, Notifications

```powershell
.\smoke_test_sprint3.ps1
```

Vérifie : Saga complète + génération facture + contrôle qualité + compensation `order.cancelled`.

#### Sprint 4 — Reporting, sécurité, déploiement

```powershell
.\smoke_test_sprint4.ps1
```

13 étapes :
1. Health checks enrichis (DB + RabbitMQ) sur les 9 services.
2. Headers OWASP (`X-Frame-Options`, CSP, HSTS, etc.).
3. Rate limiting `/login` → 429 après 5 tentatives.
4. JWT + commande Saga.
5. Projection CQRS dans `sfmc_reporting`.
6. GraphQL `{ dashboardKPIs }`.
7. Compensation + idempotence.
8. Présence artefacts déploiement (Dockerfiles, K8s manifests).

Résultat observé : **33/33 checks PASS** (GraphQL corrigé post-run).

#### Test dédié Brevo Email

```powershell
.\test_email_brevo.ps1
```

Script en 6 étapes :
1. Vérifie les 4 services requis (Product, Inventory, Order, Notification).
2. Génère un JWT local de fallback.
3. Récupère un produit existant.
4. `POST /api/v1/orders` → déclenche la Saga.
5. Attente 8s (Saga + dispatch SMTP).
6. Vérifie `order.status === VALIDATED`.

Sortie attendue : logs `[brevo] email sent` dans notification-service + email reçu (sujet `Commande <uuid> validée`).

### 8.6 Vérifications manuelles

```powershell
# Health check enrichi
curl http://localhost:3005/health

# Headers OWASP
Invoke-WebRequest http://localhost:3001/health | Select-Object -ExpandProperty Headers

# Dashboard REST
curl http://localhost:3009/api/v1/reports/dashboard

# GraphQL KPIs
curl -X POST -H "Content-Type: application/json" `
  -d '{"query":"{ dashboardKPIs { totalOrders qualityFailureRate } }"}' `
  http://localhost:3009/graphql

# RabbitMQ UI
start http://localhost:15672    # guest / guest
```

### 8.7 Builds TypeScript

```bash
cd services/<service> && node ace build
```

Tous les services buildent sans erreur (validé en fin de chaque sprint).

---

## 9. Récapitulatif des sprints

| Sprint | Scope                                                          | Statut                 | Rapport détaillé                                        |
|--------|----------------------------------------------------------------|------------------------|---------------------------------------------------------|
| **0**  | Monorepo npm workspaces, 9 services initialisés, Docker stack  | ✅ Terminé             | [SPRINT_0_REPORT.md](sfmc-backend/SPRINT_0_REPORT.md)   |
| **1**  | Auth (JWT), User (RBAC), Product (REST + GraphQL)              | ✅ 21/21 tests PASS    | [SPRINT_1_REPORT.md](sfmc-backend/SPRINT_1_REPORT.md)   |
| **2**  | Order Saga, Inventory, circuit breaker, protection Product     | ✅ Tests + smoke PASS  | [SPRINT_2_REPORT.md](sfmc-backend/SPRINT_2_REPORT.md)   |
| **3**  | Production + contrôle qualité, Billing, Notification (Brevo)   | ✅ Smoke E2E PASS      | [SPRINT_3_REPORT.md](sfmc-backend/SPRINT_3_REPORT.md)   |
| **4**  | Reporting (CQRS), OWASP, health checks profonds, Docker + K8s  | ✅ 33/33 checks PASS   | [SPRINT_4_REPORT.md](sfmc-backend/SPRINT_4_REPORT.md)   |

### Dette technique identifiée (Sprint 4)

| Item                            | Priorité | Action future                                              |
|---------------------------------|----------|------------------------------------------------------------|
| Rate limiter in-memory → Redis  | Haute    | Nécessaire avant ouverture multi-pod production            |
| Secrets K8s réels via Vault     | Haute    | Injection CI/CD avant premier déploiement prod             |
| RabbitMQ StatefulSet + PVC      | Moyenne  | Persistance cluster K8s                                    |
| DLQ monitoring / alerting       | Moyenne  | Dashboard Grafana + alertes Prometheus                     |
| SMS Brevo (API transactionnelle)| Basse    | Finaliser l'intégration au-delà du stub                    |
| GraphQL subscriptions           | Basse    | WebSocket real-time sur dashboard                          |
| OpenTelemetry tracing           | Basse    | Corrélation cross-service                                  |

---

## Annexes

### A. Ports et endpoints

| Service              | App port | DB port | Exposition API                         |
|----------------------|----------|---------|----------------------------------------|
| auth-service         | 3001     | 5431    | REST                                   |
| user-service         | 3002     | 5440    | REST                                   |
| product-service      | 3003     | 5433    | REST + GraphQL (`/graphql`)            |
| inventory-service    | 3004     | 5434    | REST + GraphQL                         |
| order-service        | 3005     | 5435    | REST + GraphQL                         |
| production-service   | 3006     | 5436    | REST                                   |
| billing-service      | 3007     | 5437    | REST                                   |
| notification-service | 3008     | 5438    | REST (health uniquement — consommateur)|
| reporting-service    | 3009     | 5439    | REST + GraphQL                         |
| RabbitMQ             | 5672     | —       | AMQP                                   |
| RabbitMQ UI          | 15672    | —       | HTTP (guest/guest)                     |

### B. Glossaire

| Terme                | Définition                                                           |
|----------------------|----------------------------------------------------------------------|
| DDD                  | Domain Driven Design                                                 |
| CQRS                 | Command Query Responsibility Segregation                             |
| Saga                 | Pattern de transaction distribuée sans 2PC                           |
| Eventual Consistency | Cohérence atteinte de façon différée via les événements              |
| DLQ / DLX            | Dead Letter Queue / Exchange                                         |
| HPA                  | Horizontal Pod Autoscaler (Kubernetes)                               |
| OF                   | Ordre de Fabrication                                                 |
| RBAC                 | Role-Based Access Control                                            |
| OWASP                | Open Web Application Security Project                                |

### C. Références

- Document de conception : [achitecture.md](achitecture.md)
- Rapports de sprint : [SPRINT_0](sfmc-backend/SPRINT_0_REPORT.md) · [SPRINT_1](sfmc-backend/SPRINT_1_REPORT.md) · [SPRINT_2](sfmc-backend/SPRINT_2_REPORT.md) · [SPRINT_3](sfmc-backend/SPRINT_3_REPORT.md) · [SPRINT_4](sfmc-backend/SPRINT_4_REPORT.md)
- Scripts de test : [smoke_test_sprint2.ps1](sfmc-backend/smoke_test_sprint2.ps1) · [smoke_test_sprint3.ps1](sfmc-backend/smoke_test_sprint3.ps1) · [smoke_test_sprint4.ps1](sfmc-backend/smoke_test_sprint4.ps1) · [test_email_brevo.ps1](sfmc-backend/test_email_brevo.ps1)

---

*Document de présentation SFMC Bénin · 2026-04-18 · Consolide les sprints 0 → 4.*
