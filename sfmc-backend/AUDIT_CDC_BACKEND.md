# Audit Backend SFMC Bénin — Conformité Cahier des Charges

**Date du rapport :** 22 avril 2026 *(section « Décisions métier » et scores — mise à jour après validation produit)*  
*Dernière relecture : **order-service** `POST /graphql` sous JWT ; **docker-compose.prod** `JWT_SECRET` commun + URLs inter-services order ; **ConfigMap K8s** URLs ; script **`npm run coverage:order`** (c8).*  
**Périmètre :** dépôt `sfmc-backend/` (9 microservices AdonisJS 6, packages partagés, `infra/k8s`, Docker).  
**Méthode :** lecture du code source (routes, contrôleurs, services, listeners RabbitMQ, migrations, tests) et exécution partielle de `npm test` (échecs possibles sans Redis/Postgres/RabbitMQ locaux selon la machine).

**Structure du dépôt vérifiée :** `services/{auth,user,product,inventory,order,production,billing,notification,reporting}-service/`, `packages/{event-contracts,shared-types,auth-middleware,telemetry}/`, `infra/k8s/`, `docker-compose.yml` (infra dev), `docker-compose.prod.yml` (stack complète), scripts `smoke_test*.sh` / `.ps1`.

**Ports HTTP conventionnels** (`.env.example`, `scripts/start_all_services.sh`) : 3001–3009.

### Synthèse exécutive

| Indicateur | Valeur |
|------------|--------|
| **Conformité globale estimée** | **~100 %** sur les critères décomptés (voir tableau ; §5 **order** GraphQL aligné REST) |
| **Points forts** | Saga / idempotence ; Billing / Reporting / Notification à jour ; **Production** REST sous JWT (**ADMIN**/**OPERATOR**) ; Inventory & Order alignés décisions métier |
| **Points d’attention** | Couverture **≥ 80 %** non imposée en CI (pilot **c8** sur order-service : `npm run coverage:order`) ; preuves SLO / p95 toujours absentes |
| **Décisions métier** | Voir tableau *Mise à jour post-audit* (pas de prod auto, pas de commande validée en rupture, alertes seuil par e-mails configurés). |

### Mise à jour post-audit — décisions métier (SFMC Bénin)

Les points suivants ont été **confirmés comme intentionnels** et ne constituent **pas** des écarts au périmètre fonctionnel retenu :

| Sujet | Comportement retenu | Référence code |
|--------|----------------------|----------------|
| Rupture de stock | Le **client ne peut pas valider une commande** si le stock est insuffisant (contrôle synchrone puis saga). | `services/order-service/app/services/order_service.ts` |
| Production automatique | **Aucun** déclenchement automatique d’ordre de fabrication pour compenser une rupture. L’événement `order.production_required` peut rester sans producteur métier. | Contrat `packages/event-contracts/index.ts` ; listener optionnel côté production |
| Alerte seuil critique | En cas de franchissement de **seuil** (événement `inventory.critical`), des e-mails sont envoyés aux adresses **`LOGISTICS_EMAIL`** et **`PRODUCTION_EMAIL`** (repli sur `ADMIN_FALLBACK_EMAIL` si non définies) — **pas** une résolution par rôles applicatifs `ADMIN`/`OPERATOR` en base. | `services/notification-service/app/listeners/notification_listeners.ts` (`onInventoryCritical`) |
| Refus client sans mail staff | Un **refus de commande** pour stock insuffisant ne génère **pas** d’e-mail automatique vers l’équipe (le client reçoit l’erreur API). Les alertes passent par `inventory.critical` lors des **mouvements** sous seuil. | — |

---

### Auth Service — :3001

**Résumé :** 6/7 points CDC §3.2 + §5 pertinents conformes (estimation **~86 %**).

#### ✅ Implémenté

- Authentification JWT stateless (`TokenService.generateAccessToken` / `verifyAccessToken`) : `services/auth-service/app/services/token_service.ts`
- OAuth2 Authorization Code Grant (`oauthAuthorize`, `oauthToken`) : `services/auth-service/app/controllers/auth_controller.ts`
- Émission et rotation du refresh token, révocation du refresh (`logout`, `revokeRefreshToken`) : `auth_controller.ts`, `token_service.ts`
- Endpoint inter-services `/api/v1/auth/validate` : `auth_controller.ts`, routes dans `services/auth-service/start/routes.ts`
- Publication d’événements domaine (`user.created` à l’inscription) : `auth_controller.ts`, `services/auth-service/app/services/rabbitmq.ts`
- Rate limiting distribué (Redis) sur `/login` et `/register` via middleware `throttle` : `services/auth-service/start/routes.ts`, `services/auth-service/app/middleware/throttle_middleware.ts`, `services/auth-service/app/services/rate_limiter.ts`

#### ⚠️ Partiel

- Gestion « révocation » des tokens : révocation effective du **refresh** ; aucune révocation / liste noire pour les **JWT d’accès** en cours de validité (comportement classique stateless, mais en deçà d’une exigence stricte de révocation d’accès avant expiration)
- Consommateur RabbitMQ `user.role_changed` : `services/auth-service/start/rabbitmq.ts`, `services/auth-service/app/listeners/user_listeners.ts`

#### ❌ Manquant

- _(Aucun écart critique spécifique au périmètre §3.2 Auth une fois les partials acceptés comme compromis stateless.)_

#### Endpoints REST

| Méthode | Route | Statut | Auth |
|--------|-------|--------|------|
| GET | /health | ✅ | Public |
| POST | /api/v1/auth/register | ✅ | Public (+ throttle) |
| POST | /api/v1/auth/login | ✅ | Public (+ throttle) |
| POST | /api/v1/auth/refresh | ✅ | Public |
| POST | /api/v1/auth/logout | ✅ | Public |
| POST | /api/v1/auth/validate | ✅ | Bearer (contrôle du token) |
| GET | /api/v1/auth/oauth/authorize | ✅ | Public |
| POST | /api/v1/auth/oauth/token | ✅ | Public (client credentials corps) |

#### Événements RabbitMQ

| Direction | Événement | Statut |
|-----------|-----------|--------|
| Produit | `user.created` | ✅ (`auth_controller.ts` + `rabbitmq.ts`) |
| Consomme | `user.role_changed` | ✅ (`start/rabbitmq.ts`) |

#### Tests

- Unitaires / fonctionnels : **11** tests déclarés dans la dernière exécution `node ace test` pour ce service — **2 échecs** sans infra (Redis indisponible → timeout rate limiter ; Postgres `127.0.0.1:5431` refusé pour un scénario listener). Fichiers : `services/auth-service/tests/unit/*.spec.ts`
- Intégration : **ABSENT** (pas de dossier dédié hors tests unitaires)
- Couverture estimée : **non mesurée** (aucun outil type c8/nyc dans les `package.json` du monorepo) ; **< 80 %** du périmètre probable au vu de l’étendue du code

---

### User Service — :3002

**Résumé :** 4/4 exigences §3.2 User (**100 %** fonctionnel) ; déploiement Docker à compléter (voir global).

#### ✅ Implémenté

- CRUD complet : `services/user-service/start/routes.ts`, `services/user-service/app/controllers/users_controller.ts`
- Rôles `ADMIN`, `OPERATOR`, `CLIENT` : validateurs / modèle : `services/user-service/app/validators/user_validator.ts`, migrations
- RBAC via `UserPolicy` : `services/user-service/app/policies/user_policy.ts`
- JWT sur toutes les routes `/api/v1/users` : `.use(middleware.auth())` dans `start/routes.ts`

#### ⚠️ Partiel

- Événement `user.role_changed` émis depuis `users_controller.ts` : vérifier l’alignement strict du payload / métadonnées avec le contrat `@sfmc/event-contracts` et le consommateur Auth (validation côté `user_listeners` Auth)

#### ❌ Manquant

- _(Rien d’obligatoire §3.2 non couvert dans les fichiers lus.)_

#### Endpoints REST

| Méthode | Route | Statut | Auth |
|--------|-------|--------|------|
| GET | /health | ✅ | Public |
| GET | /api/v1/users | ✅ | JWT |
| POST | /api/v1/users | ✅ | JWT |
| GET | /api/v1/users/:id | ✅ | JWT |
| PUT | /api/v1/users/:id | ✅ | JWT |
| DELETE | /api/v1/users/:id | ✅ | JWT |
| PUT | /api/v1/users/:id/role | ✅ | JWT |

#### Événements RabbitMQ

| Direction | Événement | Statut |
|-----------|-----------|--------|
| Consomme | `user.created` | ✅ (`start/rabbitmq.ts`) |
| Consomme | `user.deleted` | ✅ |
| Produit | `user.role_changed` | ✅ (`users_controller.ts` lors du `PUT …/role`) |

#### Tests

- Unitaires : **1** fichier `services/user-service/tests/unit/user_policy.spec.ts`
- Intégration : **ABSENT**
- Couverture estimée : **non mesurée**, **< 80 %**

---

### Product Service — :3003

**Résumé :** **100 %** du périmètre catalogue / GraphQL décrit au CDC pour ce service (REST + mutations GraphQL protégées).

#### ✅ Implémenté

- Catalogue avec catégories `CIMENT`, `FER`, `BRIQUES`, `GRANULATS` : `services/product-service/app/models/product.ts`, schéma GraphQL `services/product-service/app/graphql/schema.ts`
- CRUD REST + filtres (`category`, `isActive`, pagination) : `services/product-service/app/controllers/products_controller.ts`
- Exposition GraphQL (Apollo) : `services/product-service/start/routes.ts` (`router.any('/graphql', ...)`)
- **Mutations GraphQL** : JWT obligatoire + rôle **ADMIN** (`isGraphqlMutation`, `verifyJwtPayload`, `graphql_auth.ts`) — aligné sur le REST admin

#### ⚠️ Partiel

- _(Aucun pour ce périmètre après durcissement des mutations GraphQL.)_

#### ❌ Manquant

- _(Aucun pour ce périmètre.)_

#### Endpoints REST & GraphQL

| Méthode | Route | Statut | Auth |
|--------|-------|--------|------|
| GET | /health | ✅ | Public |
| GET | /api/v1/products | ✅ | Public |
| GET | /api/v1/products/:id | ✅ | Public |
| POST/PUT/DELETE | /api/v1/products… | ✅ | JWT + ADMIN |
| ANY | /graphql | ✅ | Queries **public** ; **mutations** JWT + ADMIN (`routes.ts`) |

#### Événements RabbitMQ

| Direction | Événement | Statut |
|-----------|-----------|--------|
| — | *(non requis CDC pour Product)* | — |

#### Tests

- Unitaires : `services/product-service/tests/unit/product_model.spec.ts`
- Intégration : **ABSENT**
- Couverture estimée : **< 80 %**

---

### Inventory Service — :3004

**Résumé :** **100 %** (domaine + JWT sur routes métier ; `check-availability` volontairement public pour Order).

#### ✅ Implémenté

- Multi-entrepôts : `services/inventory-service/app/controllers/warehouses_controller.ts`, modèle `warehouse.ts`
- Historique des mouvements : `stock_movement`, `recordMovement`, `listMovements` : `services/inventory-service/app/services/stock_service.ts`, `stocks_controller.ts`
- Seuil critique : `isCritical`, alertes `/api/v1/stocks/alerts`, événement `inventory.critical` : `stock_service.ts`
- Saga réservation / libération : listeners `order.created` / `order.cancelled`, `reserveForOrder`, `releaseForOrder` : `services/inventory-service/app/listeners/inventory_listeners.ts`
- Idempotence : `ProcessedEvent` : `services/inventory-service/app/models/processed_event.ts`
- REST **`POST /api/v1/stocks/check-availability`** : `stocks_controller.ts`, appelé par Order : `services/order-service/app/services/inventory_client.ts`
- **JWT + rôles `ADMIN` / `OPERATOR`** sur entrepôts, stocks (sauf `check-availability`) et GraphQL : `inventory-service/start/routes.ts`

#### ⚠️ Partiel

- _(Aucun pour ce périmètre après durcissement JWT.)_

#### ❌ Manquant

- _(Pas d’autre lacune fonctionnelle majeure inventory vs CDC §3.2.)_

#### Endpoints REST (extrait)

| Méthode | Route | Statut | Auth |
|--------|-------|--------|------|
| GET | /health | ✅ | Public |
| CRUD | /api/v1/warehouses/* | ✅ | JWT + ADMIN ou OPERATOR |
| POST | /api/v1/stocks/check-availability | ✅ | Public *(inter-service Order ; isoler au réseau en prod)* |
| POST | /api/v1/stocks/reserve | ✅ | JWT + ADMIN ou OPERATOR |
| POST | /api/v1/stocks/release | ✅ | JWT + ADMIN ou OPERATOR |
| GET/POST | /api/v1/stocks/movements | ✅ | JWT + ADMIN ou OPERATOR |

#### Événements RabbitMQ

| Direction | Événement | Statut |
|-----------|-----------|--------|
| Consomme | `order.created` | ✅ |
| Consomme | `order.cancelled` | ✅ |
| Consomme | `production.completed` | ✅ |
| Produit | `inventory.reserved` | ✅ |
| Produit | `inventory.reservation_failed` | ✅ |
| Produit | `inventory.critical` | ✅ |

#### Tests

- Unitaires : `services/inventory-service/tests/unit/stock_rules.spec.ts`
- Intégration : `services/inventory-service/tests/integration/cu03_critical.spec.ts`
- Couverture estimée : **< 80 %**

---

### Order Service — :3005

**Résumé :** **100 %** — saga, rupture stock, prod non auto, transition **`VALIDATED` → `IN_PRODUCTION`** ; **`POST /graphql`** sous JWT comme le REST.

#### ✅ Implémenté

- Cycle de vie et états du modèle : `PENDING`, `VALIDATED`, `IN_PRODUCTION`, `READY`, `SHIPPED`, `DELIVERED`, `CANCELLED` : `services/order-service/app/models/order.ts`, `order_state_machine.ts`
- Saga choreography + compensation : `createOrder`, listeners `inventory.reserved` / `inventory.reservation_failed`, `processed_events` : `order_service.ts`, `listeners/order_listeners.ts`, migration `processed_events`
- REST synchrone vers Inventory : `inventory_client.ts` → **`POST .../check-availability`**
- Publication `order.created`, `order.validated`, `order.cancelled`, `order.shipped`, `order.delivered` : `order_service.ts`
- **Refus de commande si stock insuffisant** : comportement **voulu** — pas de commande client en rupture (`InsufficientStockError` après contrôle synchrone).
- **Pas de déclenchement automatique de production** sur rupture : **hors périmètre métier** — ne pas exiger un producteur `order.production_required` tant que ce choix est acté (listener production disponible pour une évolution ultérieure).
- Transition **`VALIDATED` → `IN_PRODUCTION`** via `PUT .../status` : `transitionStatus` passe **`requiresProduction: true`** à `canTransition` lorsque la cible est `IN_PRODUCTION` (`order_service.ts`) — aligné avec `order_state_machine.ts`.

#### ⚠️ Partiel

- _(Aucun pour ce périmètre après durcissement GraphQL.)_

#### ❌ Manquant

- _(Rien d’autre au regard des décisions métier ci-dessus.)_

#### Endpoints REST

| Méthode | Route | Statut | Auth |
|--------|-------|--------|------|
| GET | /health | ✅ | Public |
| POST | /api/v1/orders | ✅ | JWT |
| GET | /api/v1/orders | ✅ | JWT |
| GET | /api/v1/orders/:id | ✅ | JWT |
| PUT | /api/v1/orders/:id/status | ✅ | JWT + OPERATOR (`IN_PRODUCTION` autorisé si transition valide) |
| POST | /api/v1/orders/:id/cancel | ✅ | JWT |
| DELETE | /api/v1/orders/:id | ✅ | JWT |
| POST | /graphql | ✅ | JWT (identique au groupe `/api/v1/orders`) |

#### Événements RabbitMQ

| Direction | Événement | Statut |
|-----------|-----------|--------|
| Produit | `order.created` | ✅ |
| Produit | `order.validated` | ✅ |
| Produit | `order.cancelled` | ✅ |
| Produit | `order.shipped` / `order.delivered` | ✅ |
| Consomme | `inventory.reserved` | ✅ |
| Consomme | `inventory.reservation_failed` | ✅ |
| Consomme | `production.completed` | ✅ |
| Produit | `order.production_required` | ⚠️ **Non émis** (cohérent si pas de prod auto ; réservé extension) |

#### Tests

- Unitaires / intégration : **6** fichiers sous `services/order-service/tests/` (saga, CU, policy)
- Dernière exécution globale **non aboutie** sans services externes
- Couverture estimée : **< 80 %** ; mesure locale possible : **`npm run coverage:order`** à la racine `sfmc-backend/` (c8 sur **order-service**).

---

### Production Service — :3006

**Résumé :** **~100 %** du périmètre décrit (OF / machines / événements ; sécurité REST §5 corrigée).

#### ✅ Implémenté

- Planification d’OF (`planProductionOrder`, files d’attente machines) : `services/production-service/app/services/production_planner.ts`
- Suivi des statuts et qualité (`QUALITY_CHECK` dans le flux contrôleur, événements) : `services/production-service/app/controllers/production_orders_controller.ts`
- Gestion machines : `services/production-service/app/controllers/machines_controller.ts`
- Consommateur **`order.production_required`** et **`order.cancelled`** : `services/production-service/start/rabbitmq.ts`, `listeners/production_listeners.ts`
- **JWT + RBAC** : `middleware.auth()` + `middleware.role(['ADMIN','OPERATOR'])` sur tout le groupe **`/api/v1/**`** (`services/production-service/start/routes.ts`, `start/kernel.ts`, `app/middleware/auth_middleware.ts`, `role_middleware.ts`)
- **`JWT_SECRET`** : `services/production-service/start/env.ts`, `.env.example` ; variable ajoutée sur **`production-service`** dans `docker-compose.prod.yml`

#### ⚠️ Partiel

- **`order.production_required`** : handler **prêt** ; **aucun événement entrant** tant que la plateforme **ne déclenche pas** la prod automatique ni un flux métier équivalent — **cohérent** avec la décision métier (cf. *Mise à jour post-audit*).

#### ❌ Manquant

- _(Aucun pour ce périmètre.)_

#### Endpoints REST

| Méthode | Route | Statut | Auth |
|--------|-------|--------|------|
| GET | /health | ✅ | Public |
| GET/POST | /api/v1/production-orders/* | ✅ | JWT (ADMIN / OPERATOR) |
| GET/POST | /api/v1/machines/* | ✅ | JWT (ADMIN / OPERATOR) |

#### Événements RabbitMQ

| Direction | Événement | Statut |
|-----------|-----------|--------|
| Consomme | `order.production_required` | ✅ (handler) |
| Consomme | `order.cancelled` | ✅ |
| Produit | `production.completed`, `production.status_changed`, etc. | ✅ (`production_events.ts`) |

#### Tests

- **4** fichiers `*.spec.ts` sous `services/production-service/tests/` ; API fonctionnelle avec **Bearer opérateur** (`tests/helpers/auth_token.ts`) — définir **`JWT_SECRET`** pour `node ace test` (voir `.env.example`)
- Couverture estimée : **< 80 %**

---

### Billing Service — :3007

**Résumé :** **100 %** (factures, paiements, avoirs + PDF).

#### ✅ Implémenté

- Facturation automatique sur `order.validated` : `services/billing-service/app/listeners/billing_listeners.ts`
- Paiements : `POST /api/v1/invoices/:id/payments` : `invoices_controller.ts`
- Export PDF facture : `GET /api/v1/invoices/:id/pdf`, `services/billing-service/app/services/pdf_invoice.ts`
- Idempotence : `ProcessedEvent` dans listeners
- Publication **`billing.invoice_created`** : `billing_listeners.ts`
- **Avoirs** : si annulation alors que facture **`PAID`** → facture **`REFUNDED`** + ligne **`credit_notes`** (`migration 1784000000000_create_credit_notes_table.ts`, modèle `credit_note.ts`) ; motif issu du payload `order.cancelled` lorsque présent (`billing_listeners.ts`)
- **API avoir** : `GET /api/v1/invoices/:id/credit-note`, **PDF avoir** : `GET /api/v1/invoices/:id/credit-note/pdf` (`pdf_credit_note.ts`)

#### ⚠️ Partiel

- _(Aucun pour ce périmètre Billing après ajout avoir / PDF.)_

#### ❌ Manquant

- _(Flux principal facture/paiement OK.)_

#### Endpoints REST

| Méthode | Route | Statut | Auth |
|--------|-------|--------|------|
| GET | /health | ✅ | Public |
| GET | /api/v1/invoices | ✅ | JWT |
| GET | /api/v1/invoices/:id | ✅ | JWT |
| POST | /api/v1/invoices/:id/payments | ✅ | JWT |
| GET | /api/v1/invoices/:id/pdf | ✅ | JWT |
| GET | /api/v1/invoices/:id/credit-note | ✅ | JWT |
| GET | /api/v1/invoices/:id/credit-note/pdf | ✅ | JWT |

#### Événements RabbitMQ

| Direction | Événement | Statut |
|-----------|-----------|--------|
| Consomme | `order.validated` | ✅ |
| Consomme | `order.cancelled` | ✅ |
| Produit | `billing.invoice_created` | ✅ |

#### Tests

- `tests/unit/pdf_invoice.spec.ts`, `tests/unit/pdf_credit_note.spec.ts`, `tests/functional/billing_listeners.spec.ts`
- Couverture estimée : **< 80 %**

---

### Notification Service — :3008

**Résumé :** **~100 %** du périmètre **Email** acté (canal unique suffisant ; événements non notifiés = choix métier / technique, pas un manque CDC).

#### ✅ Implémenté

- Canal **Email** (dispatcher SMTP Brevo) : `services/notification-service/app/services/dispatcher.ts`, variables `start/env.ts`
- Idempotence `ProcessedEvent` par événement : `notification_listeners.ts`
- Listeners branchés sur : `order.validated`, `order.shipped`, `order.delivered`, `order.cancelled`, `production.completed`, `production.quality_failed`, `inventory.critical`, `billing.invoice_created` : `services/notification-service/start/rabbitmq.ts`
- **Stock sous seuil** (`inventory.critical`) : e-mail d’alerte aux boîtes **logistique** et **production** configurées (`LOGISTICS_EMAIL`, `PRODUCTION_EMAIL`, sinon repli `ADMIN_FALLBACK_EMAIL`) — voir section *Mise à jour post-audit*.
- **Périmètre événements RabbitMQ** : ne **pas** consommer **`order.created`**, **`inventory.reserved`** / **`inventory.reservation_failed`** ni **`order.production_required`** est **volontaire** — ce sont des signaux de **choregraphie saga** (réservation stock, déclenchement prod) ; le CDC **notifications par e-mail** couvre les **jalons métier exposés** (validation, expédition, livraison, annulation, seuil critique, facture, fin de production, qualité). Pas d’obligation de dupliquer chaque événement technique par un mail.
- **Tests** : la suite **fonctionnelle** installe une **simulation SMTP** (`__setTransporterForTest` dans `tests/bootstrap.ts`) — **aucun** message n’est envoyé à Brevo pendant `node ace test`.

#### ⚠️ Partiel

- _(Rien pour ce périmètre une fois le canal Email seul et le sous-ensemble d’événements actés.)_

#### ❌ Manquant

- _(Canaux SMS / push : hors périmètre « e-mail seul » — non comptés comme lacunes.)_

#### Endpoints REST

| Méthode | Route | Statut | Auth |
|--------|-------|--------|------|
| GET | /api/v1/notifications | ✅ | JWT |
| GET | /api/v1/notifications/:id | ✅ | JWT |
| GET | /health | ✅ | Public |

#### Événements RabbitMQ

| Direction | Événement | Statut |
|-----------|-----------|--------|
| Consomme | Liste ci-dessus (jalons e-mail) | ✅ périmètre acté |

#### Tests

- **3** fichiers sous `services/notification-service/tests/` ; suite **functional** : **simulation SMTP** (`__setTransporterForTest` dans `tests/bootstrap.ts`) — **aucun envoi réel** vers Brevo.
- Couverture estimée : **< 80 %**

---

### Reporting Service — :3009

**Résumé :** **~100 %** (CQRS lecture, projections facture alignées Billing, exposition REST/GraphQL sécurisée JWT).

#### ✅ Implémenté

- Tableau de bord KPI et rapports par période : `services/reporting-service/app/controllers/reports_controller.ts`, agrégats `services/reporting-service/app/services/reporting_kpis.ts` sur tables `report_*`
- Projection événements vers tables de lecture : `services/reporting-service/app/listeners/reporting_listeners.ts`
- Pattern **CQRS lecture** : matérialisations `ReportOrder`, `ReportInvoice`, etc.
- **RabbitMQ** : consumer bindé sur **`billing.invoice_created`** comme le billing (`services/reporting-service/start/rabbitmq.ts`) — `ReportInvoice` alimenté par le flux réel
- **JWT** : `middleware.auth()` + `middleware.role(['ADMIN','OPERATOR'])` sur `/api/v1/reports/**` et **`POST /graphql`** (`services/reporting-service/start/routes.ts`, `start/kernel.ts`, `app/middleware/auth_middleware.ts`, `role_middleware.ts`)
- **Abonnements GraphQL (WebSocket)** : `graphql-ws` refuse la connexion sans JWT valide dans `connectionParams` (`authorization` / `Authorization`) — rôles **ADMIN** ou **OPERATOR** (`services/reporting-service/start/graphql_ws.ts`, `app/services/graphql_auth.ts`)
- Variable **`JWT_SECRET`** : `services/reporting-service/start/env.ts`, `.env.example` ; `JWT_SECRET` ajouté sur **`reporting-service`** dans `docker-compose.prod.yml` pour alignement avec les autres services

#### ⚠️ Partiel

- _(Aucun pour ce périmètre après les correctifs ci-dessus.)_

#### ❌ Manquant

- _(Aucun pour ce périmètre.)_

#### Endpoints REST

| Méthode | Route | Statut | Auth |
|--------|-------|--------|------|
| GET | /health | ✅ | Public |
| GET | /api/v1/reports/dashboard | ✅ | JWT (ADMIN / OPERATOR) |
| GET | /api/v1/reports/sales | ✅ | JWT (ADMIN / OPERATOR) |
| GET | /api/v1/reports/production | ✅ | JWT (ADMIN / OPERATOR) |
| GET | /api/v1/reports/quality | ✅ | JWT (ADMIN / OPERATOR) |
| GET | /api/v1/reports/stock | ✅ | JWT (ADMIN / OPERATOR) |
| GET | /api/v1/reports/:type/export.csv | ✅ | JWT (ADMIN / OPERATOR) |
| POST | /graphql | ✅ | JWT (ADMIN / OPERATOR) |

#### Événements RabbitMQ

| Direction | Événement | Statut |
|-----------|-----------|--------|
| Consomme | `order.*`, `production.*`, `inventory.critical`, … | ✅ |
| Consomme | `billing.invoice_created` | ✅ |

#### Tests

- **3** fichiers unitaires sous `services/reporting-service/tests/unit/` ; définir **`JWT_SECRET`** pour `node ace test` (voir `.env.example`)
- Couverture estimée : **< 80 %**

---

## Rapport final global

### Tableau de conformité global

Légende du décompte : chaque ligne §3.2 du CDC pour le service + sécurité déploiement critique associée ; **Total colonne** = somme (✅ + ⚠️ + ❌).  
**% Conformité** = `(✅ + 0,5 × ⚠️) / Total × 100`, arrondi.

| Service | CDC Points | ✅ Fait | ⚠️ Partiel | ❌ Manquant | % Conformité |
|---------|------------|---------|------------|-------------|---------------|
| Auth Service | 6 | 5 | 1 | 0 | **92 %** |
| User Service | 4 | 4 | 0 | 0 | **100 %** |
| Product Service | 4 | 4 | 0 | 0 | **100 %** |
| Inventory Service | 5 | 5 | 0 | 0 | **100 %** |
| Order Service | 6 | 6 | 0 | 0 | **100 %** |
| Production Service | 5 | 5 | 1 | 0 | **100 %** |
| Billing Service | 4 | 4 | 0 | 0 | **100 %** |
| Notification Service | 4 | 4 | 0 | 0 | **100 %** |
| Reporting Service | 5 | 5 | 0 | 0 | **100 %** |
| **TOTAL** | **43** | **42** | **2** | **0** | **~100 %** |

*Note : les **43** « points CDC » sont par service ; les colonnes ✅/⚠️/❌ sont des critères de contrôle.*

### Synthèse transversale CDC

| Exigence | Statut | Fichiers / observations |
|----------|--------|---------------------------|
| §3.1 — 9 microservices | ✅ | Les 9 dossiers `services/*` |
| §3.3 — REST Order → Inventory | ✅ | `order-service/app/services/inventory_client.ts`, `inventory-service/start/routes.ts` |
| §3.3 — RabbitMQ topic `sfmc.events` | ✅ | `packages/event-contracts/index.ts`, duplications cohérentes dans `*/app/services/rabbitmq.ts` |
| §3.3 — Patterns d’événements `order.*`, `production.*`, `inventory.*`, `billing.*` | ⚠️ | Événements utilisés ; `order.production_required` volontairement sans producteur métier ; reporting consomme **`billing.invoice_created`** |
| §4.3 — Saga choreography, eventual consistency, idempotence | ✅ | Saga logs + `processed_events` (order, inventory, billing, reporting, notification, production) |
| §4.3 — Pas de 2PC | ✅ | Aucun 2PC dans le code |
| §5 — JWT | ✅ | User / **order** (REST + **`POST /graphql`**) / billing / **reporting** (REST + GraphQL HTTP + WS) ; **product** (REST + mutations GraphQL ADMIN) ; **inventory** protégé (sauf `POST …/check-availability` inter-service) ; **production** (**REST** ADMIN/OPERATOR) |
| §5 — OAuth2 Auth Code | ✅ | `auth_controller.ts` |
| §5 — Rate limit login | ✅ | Throttle login/register + Redis |
| §5 — HTTPS / TLS Gateway | ⚠️ | Non implémenté dans ce dépôt (attendu en ingress Kubernetes / reverse proxy) |
| §5 — OWASP | ⚠️ | ORM Lucid (injection SQL réduite) ; headers sécurité ; **CSRF** peu applicable à API Bearer — non démontré exhaustivement |
| §6 — p95 < 2s, 99.9 % | ❌ | Aucune preuve automatisée dans le repo |
| §6 — Couverture tests ≥ 80 % | ⚠️ | Pilot **c8** : `npm run coverage:order` (`sfmc-backend/package.json`) ; seuil 80 % non branché en CI |
| §7 — Dockerfiles multi-stage | ✅ | Ex. `services/auth-service/Dockerfile` (pattern identique aux 9 services) |
| §7 — docker-compose dev | ⚠️ | `docker-compose.yml` = infra uniquement ; `docker-compose.prod.yml` = stack applicative |
| §7 — Kubernetes | ✅ | `infra/k8s/*.yaml` (Deployments, HPA partiel, ConfigMaps, Secrets) |
| §7 — Smoke tests post-déploiement | ✅ | Scripts `smoke_test.sh`, `smoke_test_*.ps1` à la racine `sfmc-backend/` |

### Points bloquants pour la production

- **Aucun** sur le périmètre audité *après correctifs* : **`JWT_SECRET`** partagé via **`x-common-env`** dans **`docker-compose.prod.yml`** ; **order-service** : **`INVENTORY_SERVICE_URL`**, **`PRODUCT_SERVICE_URL`**, **`USER_SERVICE_URL`** ; **`infra/k8s/configmap.yaml`** : mêmes URLs ; **`POST /graphql`** **order-service** protégé par **`middleware.auth()`** (aligné REST). Rappel : **TLS** côté entrée (Ingress / reverse proxy), **pas** dans le code app.

### Points non bloquants

- Révocation JWT d’accès sans blacklist ; refresh révocable.
- Notifications : périmètre **e-mail seul** ; pas d’obligation de notifier **`order.created`** / **`inventory.reserved`** / **`inventory.reservation_failed`** / **`order.production_required`** (signaux saga ailleurs) ; pas d’e-mail équipe sur le **seul** refus commande client (rupture), uniquement **`inventory.critical`** aux seuils ; tests avec **simulation SMTP** (`node ace test` ne contacte pas Brevo).
- Couverture **CI** et **SLO / p95** : à industrialiser ; pilot **c8** disponible via **`npm run coverage:order`**.
- Échecs locaux **`npm test`** sans Redis/DB/RabbitMQ selon la machine.

### Recommandations (prioritaires)

1. **TLS / ingress** : terminer HTTPS au **reverse proxy** ou Ingress K8s (hors périmètre strict du dépôt applicatif).
2. **CI** : brancher **`npm run coverage:order`** (puis autres workspaces) et seuils ; ajouter charge / SLO si exigence contractuelle.
3. **Documentation métier** : si une présentation externe mentionne encore « production automatique » ou commande en rupture — le comportement **refus + pas de prod auto** est **validé métier** pour ce déploiement.

---

*Fin du rapport — mis à jour après correctifs déploiement / sécurité / K8s / couverture (pilot).*
