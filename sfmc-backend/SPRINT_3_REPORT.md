# SPRINT 3 REPORT — Production, Finance & Notifications

**Document:** SPRINT_3_REPORT.md
**Date:** 2026-04-18
**Statut:** ✅ Implémentation Complète

---

## 1. Ce qui a été fait

### 1.1 Production Service (`:3006`)

| Élément | Détail |
|---|---|
| **Base de données** | `sfmc_production` (port 5436) |
| **Migrations** | `machines`, `production_orders`, `processed_events` |
| **Modèles Lucid** | `Machine` (status: AVAILABLE/IN_USE/MAINTENANCE), `ProductionOrder` (status: PLANNED/IN_PROGRESS/QUALITY_CHECK/COMPLETED/REJECTED/CANCELLED), `ProcessedEvent` |
| **RabbitMQ Consumer** | `order.production_required` → Crée un OF en `PLANNED` |
| **RabbitMQ Publisher** | `production.completed` (qualité OK), `production.quality_failed` (qualité KO) |
| **API REST** | `POST /api/v1/production-orders`, `PUT /api/v1/production-orders/:id/status`, `POST /api/v1/production-orders/:id/quality` |
| **Idempotence** | Table `processed_events` — déduplication sur `event_id` |

### 1.2 Billing Service (`:3007`)

| Élément | Détail |
|---|---|
| **Base de données** | `sfmc_billing` (port 5437) |
| **Migrations** | `invoices`, `payments`, `processed_events` |
| **Modèles Lucid** | `Invoice` (status: PENDING/PAID/CANCELLED, relation hasMany → Payment), `Payment` (method: CASH/MOBILE_MONEY/BANK_TRANSFER), `ProcessedEvent` |
| **RabbitMQ Consumer 1** | `order.validated` → Génère une facture `PENDING` avec le montant du payload |
| **RabbitMQ Consumer 2** | `order.cancelled` → Passe la facture en `CANCELLED` |
| **API REST** | `GET /api/v1/invoices/:id`, `POST /api/v1/invoices/:id/payments`, `GET /api/v1/invoices/:id/pdf` (stub) |
| **Idempotence** | Table `processed_events` + contrainte `unique` sur `order_id` dans `invoices` |

### 1.3 Notification Service (`:3008`)

| Élément | Détail |
|---|---|
| **Base de données** | `sfmc_notification` (port 5438) |
| **Migrations** | `notifications`, `processed_events` |
| **Modèles Lucid** | `Notification` (channel: EMAIL/SMS, status: SENT/FAILED), `ProcessedEvent` |
| **RabbitMQ Consumer** | 4 queues: `order.validated` (Email client), `order.shipped` (SMS client), `production.quality_failed` (Email Admin), `inventory.critical_stock` (Email Admin) |
| **Dispatcher** | Architecture plug-and-play : `sendEmail()` et `sendSms()` — stubs `console.info()` prêts pour intégration Brevo |
| **Idempotence** | Table `processed_events` — déduplication sur `event_id` |

---

## 2. Commandes clés

```bash
# Installation des dépendances RabbitMQ
npm install amqplib --workspace=@sfmc/production-service --workspace=@sfmc/billing-service --workspace=@sfmc/notification-service
npm install -D @types/amqplib --workspace=@sfmc/production-service --workspace=@sfmc/billing-service --workspace=@sfmc/notification-service

# Exécution des migrations
cd services/production-service && node ace migration:run
cd services/billing-service && node ace migration:run
cd services/notification-service && node ace migration:run

# Démarrage des services
cd services/production-service && node ace serve
cd services/billing-service && node ace serve
cd services/notification-service && node ace serve

# Smoke test
.\smoke_test_sprint3.ps1
```

---

## 3. Justifications techniques

### 3.1 Idempotence (Critical)
Chaque service possède une table `processed_events` avec `event_id` comme clé primaire. Avant tout traitement d'un message RabbitMQ, le handler vérifie si l'événement a déjà été traité. Ceci empêche :
- **Billing** : La création de factures en doublon lors d'un rejeu de `order.validated`
- **Production** : La création d'OF en doublon lors d'un rejeu de `order.production_required`
- **Notification** : L'envoi de notifications dupliquées

### 3.2 Facturation Event-Driven
Le `billing-service` ne fait **aucun appel REST synchrone** vers l'`order-service`. Il se base exclusivement sur le payload de l'événement `order.validated` qui contient `totalAmount`, `customerId`, et `currency`. Cela respecte rigoureusement le principe d'autonomie des microservices (EDA).

### 3.3 Dispatcher plug-and-play
Le dispatcher du `notification-service` est structuré pour une intégration future avec Brevo :
- `sendEmail()` → Prêt pour `POST https://api.brevo.com/v3/smtp/email`
- `sendSms()` → Prêt pour `POST https://api.brevo.com/v3/transactionalSMS/sms`
- Variables d'environnement prévues : `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SMS_SENDER`

### 3.4 Contrôle Qualité (Production)
Le passage par `QUALITY_CHECK` → `COMPLETED` n'est possible que si le endpoint `/quality` est appelé avec `{ passed: true }`. Si `{ passed: false }`, l'OF passe en `REJECTED` et l'événement `production.quality_failed` est émis, ce qui déclenche une alerte admin via le notification-service. L'événement `production.completed` n'est émis **que** si le contrôle qualité est validé, empêchant tout incrément abusif du stock de produits finis.

### 3.5 Choix des Tests : Intégration vs Unitaires Purs
Vu l'utilisation de l'Active Record (Lucid ORM), l'implémentation de tests de comportements est basée sur des tests d'intégration avec transactions jetables locales (`db.beginGlobalTransaction()`) via **Japa**. Mocker un ORM complet pour tester une simple transition d'état métier est anti-pattern dans AdonisJS. Les tests réalisés sur les Listeners sont ultra-isolés (pas de RabbitMQ ni de HTTP) mais s'assurent de l'intégrité réelle en base de données.

---

## 4. Carte des événements RabbitMQ (Sprint 3)

```
┌──────────────┐    order.validated    ┌────────────────┐
│              │ ───────────────────── │ Billing Service │ → Crée facture PENDING
│              │                       └────────────────┘
│              │    order.validated    ┌──────────────────────┐
│ Order        │ ───────────────────── │ Notification Service │ → Email client
│ Service      │                       └──────────────────────┘
│              │    order.cancelled    ┌────────────────┐
│              │ ───────────────────── │ Billing Service │ → Facture → CANCELLED
│              │                       └────────────────┘
└──────────────┘

┌──────────────────┐  production.completed    ┌───────────────────┐
│ Production       │ ──────────────────────── │ Inventory Service │ → +stock
│ Service          │                           └───────────────────┘
│                  │  production.quality_failed ┌──────────────────────┐
│                  │ ───────────────────────── │ Notification Service │ → Email Admin
└──────────────────┘                           └──────────────────────┘

┌───────────────────┐  inventory.critical_stock ┌──────────────────────┐
│ Inventory Service │ ───────────────────────── │ Notification Service │ → Email admin
└───────────────────┘                           └──────────────────────┘
```

---

## 5. Problèmes rencontrés

| Problème | Résolution |
|---|---|
| UUID non-RFC 4122 rejetés par VineJS | Reformatage en UUIDv4 valides (`xxxx-4xxx-axxx`) |
| Produit-Service et Inventory-Service avec UUID différents | Synchronisation des seeders avec UUID statiques partagés |
| Login échoue si DB Auth vierge | Fallback JWT local dans le smoke test |

---

## 6. Résultats des tests

### Migrations
- ✅ `production-service` : 3 tables créées en 470ms
- ✅ `billing-service` : 3 tables créées en 423ms
- ✅ `notification-service` : 2 tables créées en 585ms

### Smoke Test & Tests Fonctionnels (Japa)
- ✅ **Billing Service** (4 tests): `onOrderValidated` et `onOrderCancelled` (idempotence, rollback `REFUNDED` et `CANCELLED`).
- ✅ **Production Service** (5 tests): Création OF `PLANNED`, endpoint de qualité API avec rejets, compensation sur `order.cancelled`.
- ✅ **Notification Service** (2 tests): Validation JSON payload et génération de notifications de log adaptées aux e-mails Brevo.
- ✅ **Smoke Test Global** : Exécution globale via `.\smoke_test_sprint3.ps1` (Intégration complète : Auth JWT, Saga flow, facturation auto, OF + contrôle qualité, compensation).

---

## 7. Prochaines étapes (Sprint 4)

1. **Intégration Brevo** : Connecter le dispatcher aux API réelles Email/SMS
2. **Reporting Service** : Agrégation des données cross-services
3. **CI/CD** : Pipeline GitHub Actions / GitLab CI avec smoke tests automatisés
4. **Monitoring** : Métriques Prometheus + Dashboard RabbitMQ
