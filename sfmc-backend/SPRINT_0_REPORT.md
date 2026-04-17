# SPRINT 0 — Rapport de réalisation
## SFMC Bénin · Architecture Microservices AdonisJS 6

| Champ         | Valeur                                    |
|---------------|-------------------------------------------|
| Référence     | SPRINT-0-SFMC-2025                        |
| Date          | 2026-04-17                                |
| Auteur        | Architecte Logiciel & Lead Developer      |
| Statut        | ✅ TERMINÉ — tous les critères de sortie validés |

---

## 1. Ce qui a été fait — Arborescence finale générée

```
sfmc-backend/
├── docker-compose.yml              ← Infrastructure locale complète
├── package.json                    ← Racine monorepo (npm workspaces)
├── package-lock.json
├── SPRINT_0_REPORT.md
│
├── packages/                       ← Code partagé entre services
│   ├── shared-types/
│   │   ├── package.json            (@sfmc/shared-types)
│   │   └── index.ts                (User, Order, DomainEvent, ...)
│   ├── event-contracts/
│   │   ├── package.json            (@sfmc/event-contracts)
│   │   └── index.ts                (EventType, createEvent, routing keys)
│   └── auth-middleware/
│       ├── package.json            (@sfmc/auth-middleware)
│       └── index.ts                (JwtPayload, extractBearerToken, hasRole)
│
└── services/                       ← 9 microservices AdonisJS 6
    ├── auth-service/               ← :3001 / DB port 5431
    │   ├── package.json            (@sfmc/auth-service)
    │   ├── adonisrc.ts
    │   ├── tsconfig.json
    │   ├── .env.example            (PORT=3001, DB_PORT=5431)
    │   ├── ace.js
    │   ├── app/
    │   │   ├── exceptions/handler.ts
    │   │   └── middleware/
    │   │       ├── container_bindings_middleware.ts
    │   │       └── force_json_response_middleware.ts
    │   ├── bin/
    │   │   ├── server.ts
    │   │   ├── console.ts
    │   │   └── test.ts
    │   ├── config/
    │   │   ├── app.ts
    │   │   ├── bodyparser.ts
    │   │   ├── cors.ts
    │   │   ├── database.ts         (Lucid + PostgreSQL)
    │   │   ├── hash.ts
    │   │   └── logger.ts
    │   ├── start/
    │   │   ├── env.ts              (validation vars dont DB_*)
    │   │   ├── kernel.ts
    │   │   └── routes.ts
    │   ├── tests/bootstrap.ts
    │   └── build/                  ← Généré par node ace build ✅
    │
    ├── user-service/               ← :3002 / DB port 5432
    ├── product-service/            ← :3003 / DB port 5433
    ├── inventory-service/          ← :3004 / DB port 5434
    ├── order-service/              ← :3005 / DB port 5435
    ├── production-service/         ← :3006 / DB port 5436
    ├── billing-service/            ← :3007 / DB port 5437
    ├── notification-service/       ← :3008 / DB port 5438
    └── reporting-service/          ← :3009 / DB port 5439
        (même structure que auth-service)
```

**Résumé des artefacts créés :**

| Artefact                  | Quantité | Détail                                       |
|---------------------------|----------|----------------------------------------------|
| Microservices AdonisJS 6  | 9        | API Kit, TypeScript, Lucid ORM + PostgreSQL  |
| Packages partagés         | 3        | shared-types, event-contracts, auth-middleware |
| Bases de données Docker   | 9        | PostgreSQL 15, une par service               |
| Message broker Docker     | 1        | RabbitMQ 3 (management UI)                   |
| Fichiers `.env.example`   | 9        | PORT app + DB_PORT dédiés par service        |

---

## 2. Comment cela a été fait — Commandes clés

### Étape 1 — Monorepo (package.json racine)

```json
// sfmc-backend/package.json
{
  "name": "sfmc-backend",
  "private": true,
  "workspaces": ["services/*", "packages/*"]
}
```

### Étape 2 — Packages partagés

Création manuelle de `packages/{shared-types,event-contracts,auth-middleware}/package.json` et `index.ts`.

### Étape 3 — Initialisation des 9 microservices AdonisJS 6

```bash
# Premier service créé via la CLI officielle (dans services/)
npm init adonisjs@latest -- auth-service \
  --kit=github:adonisjs/api-starter-kit \
  --pkg=npm \
  --skip-migrations

# Problème rencontré : npm install échoue à l'intérieur d'un workspace npm
# Solution : le CLI crée quand même tous les fichiers sources,
#            l'installation est gérée à la racine du monorepo.

# Les 8 services restants ont été créés en copiant la structure auth-service
cp -r services/auth-service services/user-service
cp -r services/auth-service services/product-service
# ... (idem pour les 7 autres)

# Chaque package.json a été mis à jour avec le scope @sfmc/:
# name: "@sfmc/<service-name>"
# + ajout de la dépendance "pg" pour le driver PostgreSQL natif
```

### Étape 4 — Infrastructure Docker

```bash
# Création de docker-compose.yml à la racine
# Contenu : RabbitMQ + 9 PostgreSQL 15 avec ports dédiés sans conflit
# Validation :
docker compose config
```

### Étape 5 — Variables d'environnement

```bash
# Mise à jour des .env.example (port APP + port DB par service)
sed -i "s/^PORT=.*/PORT=3001/" services/auth-service/.env.example
# ... (idem pour les 8 autres avec leurs ports respectifs)
```

Variables DB ajoutées dans chaque `.env.example` :

```env
DB_HOST=127.0.0.1
DB_PORT=5431          # port dédié selon docker-compose.yml
DB_USER=postgres
DB_PASSWORD=postgres
DB_DATABASE=sfmc_auth
DB_SSL=false
```

Variables DB validées dans chaque `start/env.ts` :

```typescript
DB_HOST: Env.schema.string({ format: 'host' }),
DB_PORT: Env.schema.number(),
DB_USER: Env.schema.string(),
DB_PASSWORD: Env.schema.string.optional(),
DB_DATABASE: Env.schema.string(),
DB_SSL: Env.schema.boolean.optional(),
```

### Étape 6 — Tests de validation

```bash
# Test 1 — Validation YAML Docker
cd sfmc-backend && docker compose config

# Test 2 — Workspace npm
npm install

# Test 3 — Build TypeScript
cd services/auth-service && node ace build
```

---

## 3. Pourquoi ces choix — Justifications architecturales

### Monorepo npm workspaces
Le monorepo permet de partager les packages `@sfmc/*` (types, contrats d'événements, middleware) sans les publier sur un registre npm. Les 9 services partagent `node_modules` à la racine (déduplication), réduisant l'espace disque et les incohérences de versions. C'est la recommandation du document d'architecture (ARCH-SFMC-2025-002 §10.1).

### 1 base de données PostgreSQL par service
Principe **Database per Service** (§1.3 architecture) : chaque service est souverain sur son schéma. Cela empêche le couplage inter-services via la base, facilite le déploiement indépendant et permet des migrations sans impact sur les autres services. Sur Docker, chaque instance expose un port externe unique (5431–5439) pour éviter les conflits locaux.

### AdonisJS 6 — API Kit
Le kit API fournit : Lucid ORM (Active Record), VineJS (validation), support JWT natif, configuration TypeScript stricte. Aucune vue HTML — parfait pour une architecture microservices REST + GraphQL. Conforme à §2.1 du document d'architecture.

### RabbitMQ plutôt que Kafka
Choix documenté en §2.2 : RabbitMQ est retenu pour sa faible complexité opérationnelle, son support natif des Dead Letter Queues, et les volumes attendus (< 10 000 événements/s). L'image `rabbitmq:3-management-alpine` inclut l'UI de management accessible sur le port 15672.

### Ports externes dédiés (5431–5439)
Sur un poste de développement, plusieurs instances PostgreSQL ne peuvent pas toutes écouter sur 5432. L'attribution d'un port unique par service (5431 pour auth, 5432 pour user, ...) permet de démarrer les 9 bases simultanément sans conflit.

---

## 4. Résultats des tests de validation (Étape 6)

### Test 1 — `docker compose config` ✅ SUCCÈS

```
Commande : docker compose config
Résultat : YAML valide — configuration complète affichée

Contenu validé :
  - 1 service rabbitmq (image: rabbitmq:3-management-alpine)
    ports: 5672:5672, 15672:15672
  - 9 services PostgreSQL 15 (auth-db → reporting-db)
    ports externes: 5431, 5432, 5433, 5434, 5435, 5436, 5437, 5438, 5439
    aucun conflit de port détecté
  - 9 volumes nommés (auth_db_data, user_db_data, ...)
  - réseau bridge par défaut : sfmc-backend_default

Avertissement : aucun
Erreur : aucune
```

### Test 2 — `npm install` (workspaces) ✅ SUCCÈS

```
Commande : npm install (depuis sfmc-backend/)
Résultat : up to date, audited 615 packages in 10s

Workspaces résolus et liés (symlinks) :
  @sfmc/auth-middleware   → packages/auth-middleware
  @sfmc/event-contracts   → packages/event-contracts
  @sfmc/shared-types      → packages/shared-types
  @sfmc/auth-service      → services/auth-service
  @sfmc/billing-service   → services/billing-service
  @sfmc/inventory-service → services/inventory-service
  @sfmc/notification-service → services/notification-service
  @sfmc/order-service     → services/order-service
  @sfmc/product-service   → services/product-service
  @sfmc/production-service → services/production-service
  @sfmc/reporting-service → services/reporting-service
  @sfmc/user-service      → services/user-service

Avertissements non bloquants :
  - EBADENGINE node v22.11.0 < v22.12.0 requis par certains packages (eslint-visitor-keys)
  - 13 vulnérabilités npm audit (6 moderate, 7 high) — non critiques pour Sprint 0
    → à traiter en Sprint 4 (audit OWASP)
Erreur : aucune
```

### Test 3 — `node ace build` (auth-service) ✅ SUCCÈS

```
Commande : cd services/auth-service && node ace build
Résultat : [ success ] build completed

Étapes du build :
  [info] cleaning up output directory (build)
  [info] compiling typescript source (tsc)
  [info] rewrited ace file (build/ace.js)
  [info] copying meta files to the output directory
  [success] build completed

Artefact généré : services/auth-service/build/
Prêt pour déploiement :
  cd build && npm ci --omit="dev" && node bin/server.js

Avertissement : ExperimentalWarning JSON modules (Node 22) — non bloquant
Erreur : aucune
```

---

## 5. Critères de sortie Sprint 0 — Bilan

| Critère                                       | Statut |
|-----------------------------------------------|--------|
| Monorepo npm workspaces opérationnel          | ✅     |
| 3 packages partagés créés (`@sfmc/*`)         | ✅     |
| 9 microservices AdonisJS 6 initialisés        | ✅     |
| `docker compose config` valide sans erreur   | ✅     |
| `npm install` résout tous les workspaces      | ✅     |
| Build TypeScript d'un service sans erreur     | ✅     |
| 9 bases PostgreSQL avec ports distincts       | ✅     |
| RabbitMQ avec UI management configuré        | ✅     |
| `.env.example` documenté par service         | ✅     |

**Sprint 0 : TERMINÉ ✅**

---

## 6. Prochaines étapes — Sprint 1

Le Sprint 0 livre un environnement de développement commun opérationnel. Le Sprint 1 peut démarrer immédiatement :

1. `docker compose up -d` — démarrer PostgreSQL × 9 et RabbitMQ
2. Copier les `.env.example` en `.env` dans chaque service
3. Implémenter Auth Service : migrations `refresh_tokens` + `oauth_clients`, `POST /auth/login` (JWT), `POST /auth/validate`
4. Implémenter User Service : migrations `users` + `roles`, CRUD + RBAC Bouncer
5. Implémenter Product Service : migrations `products`, CRUD REST + schéma GraphQL

---

*Rapport Sprint 0 — SFMC Bénin*
*Référence ARCH-SFMC-2025-002 · Version 2.0*
