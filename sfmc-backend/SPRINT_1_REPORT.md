# SPRINT 1 — Rapport de réalisation
## SFMC Bénin · Socle Identité, Utilisateurs & Catalogue

| Champ         | Valeur                                         |
|---------------|------------------------------------------------|
| Référence     | SPRINT-1-SFMC-2025                             |
| Date          | 2026-04-17                                     |
| Auteur        | Architecte Logiciel & Lead Developer           |
| Statut        | ✅ TERMINÉ — migrations, builds et tests PASS  |

---

## 1. Ce qui a été fait

### Auth Service (`services/auth-service` — port 3001, DB 5431)

| Artefact                              | Description                                                  |
|---------------------------------------|--------------------------------------------------------------|
| `database/migrations/1_create_users_table.ts`       | UUID, email unique, password, fullName, role enum, isActive |
| `database/migrations/2_create_refresh_tokens_table.ts` | UUID, userId FK, token, expiresAt                        |
| `database/migrations/3_create_oauth_clients_table.ts`  | clientId, clientSecret, redirectUri                      |
| `app/models/user.ts`                  | BaseModel + `@beforeSave` bcrypt, `hasMany` refreshTokens    |
| `app/models/refresh_token.ts`         | BaseModel + `belongsTo` User + `isExpired` getter            |
| `app/models/oauth_client.ts`          | BaseModel                                                    |
| `app/services/token_service.ts`       | JWT (jsonwebtoken), refresh token rotation                   |
| `app/validators/auth_validator.ts`    | VineJS — loginValidator, refreshValidator                    |
| `app/controllers/auth_controller.ts`  | login, refresh, logout, validate, oauthAuthorize, oauthToken |
| `start/routes.ts`                     | Toutes les routes sous `/api/v1/auth`                        |
| `tests/unit/token_service.spec.ts`    | 4 tests JWT (génération, secret invalide, expiration, rôle)  |

### User Service (`services/user-service` — port 3002, DB 5440)

| Artefact                              | Description                                                  |
|---------------------------------------|--------------------------------------------------------------|
| `database/migrations/1_create_users_table.ts`       | UUID, firstName, lastName, email, phone, role enum, isActive |
| `app/models/user.ts`                  | BaseModel + getter `fullName`                                |
| `app/policies/user_policy.ts`         | RBAC : list, create, view, update, delete, updateRole        |
| `app/middleware/auth_middleware.ts`   | Vérifie JWT via `jsonwebtoken`, injecte actor dans ctx       |
| `app/validators/user_validator.ts`    | VineJS — create, update, updateRole                          |
| `app/controllers/users_controller.ts` | CRUD complet + `PUT /:id/role`                              |
| `start/routes.ts`                     | Routes sous `/api/v1/users` + named middleware `auth`        |
| `tests/unit/user_policy.spec.ts`      | 12 tests RBAC (ADMIN, OPERATOR, CLIENT, self)                |

> **Note infra** : Le port hôte de `user-db` a été changé de `5432` → `5440` dans `docker-compose.yml` car un PostgreSQL local occupait le port 5432 sur la machine de développement.

### Product Service (`services/product-service` — port 3003, DB 5433)

| Artefact                              | Description                                                  |
|---------------------------------------|--------------------------------------------------------------|
| `database/migrations/1_create_products_table.ts`    | UUID, name, category enum (4 valeurs), unit, unitPrice, isActive |
| `app/models/product.ts`               | BaseModel                                                    |
| `database/seeders/product_seeder.ts`  | 10 produits initiaux : 2 ciments, 3 fers, 2 briques, 3 granulats |
| `app/validators/product_validator.ts` | VineJS — create, update                                      |
| `app/controllers/products_controller.ts` | CRUD REST complet avec filtres category/isActive/pagination |
| `app/graphql/schema.ts`               | Apollo Server 4 — typeDefs + resolvers (Query + Mutation)    |
| `start/routes.ts`                     | REST `/api/v1/products` + GraphQL `/graphql`                 |
| `tests/unit/product_model.spec.ts`    | 5 tests règles métier (catégories, prix, filtres, nom)       |

---

## 2. Comment cela a été fait — Commandes clés

```bash
# Installation des dépendances par service (depuis la racine monorepo)
npm install jsonwebtoken luxon --workspace=@sfmc/auth-service
npm install @types/jsonwebtoken @types/luxon --workspace=@sfmc/auth-service --save-dev

npm install jsonwebtoken luxon --workspace=@sfmc/user-service
npm install @apollo/server graphql luxon --workspace=@sfmc/product-service

# Migrations (depuis chaque dossier service)
cd services/auth-service  && node ace migration:run
cd services/user-service  && node ace migration:run
cd services/product-service && node ace migration:run

# Seeder
cd services/product-service && node ace db:seed

# Tests unitaires
cd services/auth-service    && node ace test unit   # 4 tests
cd services/user-service    && node ace test unit   # 12 tests
cd services/product-service && node ace test unit   # 5 tests

# Builds TypeScript
cd services/auth-service    && node ace build
cd services/user-service    && node ace build
cd services/product-service && node ace build

# Correction conflit port : remapping docker-compose user-db 5432→5440
docker compose up -d user-db
```

---

## 3. Pourquoi ces choix

### JWT manuel (jsonwebtoken) plutôt que `@adonisjs/auth` JWT guard
`@adonisjs/auth` v9 ne fournit pas de guard JWT natif (retrait depuis AdonisJS 6). Pour rester conforme à l'architecture (§3.1 — access token 15min + refresh token opaque 7j), on implémente directement :
- **Access token** : JWT signé avec `jsonwebtoken` — stateless, vérifiable par n'importe quel service
- **Refresh token** : token opaque en base (table `refresh_tokens`) — rotation à chaque usage

### Policy RBAC inline (sans Bouncer)
`@adonisjs/bouncer` est un package optionnel. Pour éviter une dépendance supplémentaire en Sprint 1 et garder la logique testable sans framework, les policies sont des classes TypeScript pures. Elles sont 100% unitairement testables et facilement remplaçables par Bouncer en Sprint 4.

### Apollo Server 4 intégré manuellement
L'AdonisJS officiel `@adonisjs/graphql` n'existe pas encore pour AdonisJS 6. Apollo Server 4 s'intègre via une route catch-all `/graphql` qui délègue la requête HTTP à `executeHTTPGraphQLRequest`. Cette approche est compatible avec la configuration actuelle sans `express` intermédiaire.

### Soft delete (isActive = false)
Conforme à l'exigence d'auditabilité. Les entités ne sont jamais supprimées physiquement en Sprint 1 — elles sont désactivées (`isActive = false`). La suppression physique sera gérée via une migration de nettoyage planifiée.

### Port user-db : 5432 → 5440
Un PostgreSQL natif Windows occupait le port 5432. Pour ne pas risquer de connexions croisées entre la DB locale et le conteneur Docker, le port hôte a été changé. Cette décision est documentée dans le `docker-compose.yml` et le `.env` du user-service.

---

## 4. Endpoints prêts à tester

### Auth Service — `http://localhost:3001`

| Méthode | URL                              | Description                          | Auth requise |
|---------|----------------------------------|--------------------------------------|--------------|
| POST    | `/api/v1/auth/login`             | Login → JWT + RefreshToken           | Non          |
| POST    | `/api/v1/auth/refresh`           | Renouveler l'access token            | Non          |
| POST    | `/api/v1/auth/logout`            | Révoquer le refresh token            | Non          |
| POST    | `/api/v1/auth/validate`          | Valider un JWT (inter-service)       | Bearer JWT   |
| GET     | `/api/v1/auth/oauth/authorize`   | OAuth2 authorize (stub)              | Non          |
| POST    | `/api/v1/auth/oauth/token`       | OAuth2 token exchange (stub)         | Non          |
| GET     | `/health`                        | Health check                         | Non          |

**Exemple — Login :**
```json
POST /api/v1/auth/login
{ "email": "admin@sfmc.bj", "password": "secret123" }

// Réponse 200
{
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "a1b2c3...",
    "tokenType": "Bearer",
    "expiresIn": 900,
    "user": { "id": "uuid", "email": "admin@sfmc.bj", "role": "ADMIN" }
  }
}
```

### User Service — `http://localhost:3002`

| Méthode | URL                              | Description                    | Rôle requis  |
|---------|----------------------------------|--------------------------------|--------------|
| GET     | `/api/v1/users`                  | Liste paginée                  | ADMIN        |
| POST    | `/api/v1/users`                  | Créer un utilisateur           | ADMIN        |
| GET     | `/api/v1/users/:id`              | Détail utilisateur             | ADMIN / Self |
| PUT     | `/api/v1/users/:id`              | Modifier firstName, lastName…  | ADMIN / Self |
| DELETE  | `/api/v1/users/:id`              | Désactiver (soft delete)       | ADMIN        |
| PUT     | `/api/v1/users/:id/role`         | Changer le rôle                | ADMIN        |
| GET     | `/health`                        | Health check                   | Non          |

**Header requis :** `Authorization: Bearer <accessToken>`

### Product Service — `http://localhost:3003`

| Méthode | URL                              | Description                    | Auth requise |
|---------|----------------------------------|--------------------------------|--------------|
| GET     | `/api/v1/products`               | Liste avec filtres             | Non          |
| POST    | `/api/v1/products`               | Créer un produit               | Non (Sprint 1) |
| GET     | `/api/v1/products/:id`           | Détail produit                 | Non          |
| PUT     | `/api/v1/products/:id`           | Modifier un produit            | Non (Sprint 1) |
| DELETE  | `/api/v1/products/:id`           | Désactiver un produit          | Non (Sprint 1) |
| POST    | `/graphql`                       | Point d'entrée GraphQL         | Non          |
| GET     | `/health`                        | Health check                   | Non          |

**GraphQL — Exemples de requêtes :**
```graphql
# Lister tous les ciments actifs
query {
  products(category: CIMENT, isActive: true) {
    id name unitPrice unit
  }
}

# Récupérer un produit par ID
query {
  product(id: "uuid-ici") {
    id name category unitPrice description
  }
}

# Créer un produit
mutation {
  createProduct(input: {
    name: "Ciment Lafarge 42.5"
    category: CIMENT
    unit: "sac 50kg"
    unitPrice: 5800
  }) { id name }
}
```

---

## 5. Résultats des tests de validation

### Tests unitaires

| Service         | Commande              | Résultat         | Détail                                  |
|-----------------|-----------------------|------------------|-----------------------------------------|
| auth-service    | `node ace test unit`  | ✅ **4/4 PASS**  | JWT génération, secret invalide, expiration, rôle |
| user-service    | `node ace test unit`  | ✅ **12/12 PASS**| RBAC complet : list, create, view, update, delete, updateRole × 3 rôles |
| product-service | `node ace test unit`  | ✅ **5/5 PASS**  | Catégories, prix, filtres, nom          |

**Total : 21 tests / 21 PASS**

### Builds TypeScript

| Service         | Commande           | Résultat         | Erreurs rencontrées & corrections                       |
|-----------------|--------------------|------------------|---------------------------------------------------------|
| auth-service    | `node ace build`   | ✅ **SUCCÈS**    | Aucune                                                  |
| user-service    | `node ace build`   | ✅ **SUCCÈS**    | `HttpContext.auth` inexistant → pattern `(ctx as any).auth` |
| product-service | `node ace build`   | ✅ **SUCCÈS**    | import inutile `buildSchema` + `Map` → `HeaderMap` Apollo 4 |

### Migrations

| Service         | Commande                  | Résultat  | Tables créées                              |
|-----------------|---------------------------|-----------|---------------------------------------------|
| auth-service    | `node ace migration:run`  | ✅ **OK** | `users`, `refresh_tokens`, `oauth_clients`  |
| user-service    | `node ace migration:run`  | ✅ **OK** | `users`                                     |
| product-service | `node ace migration:run`  | ✅ **OK** | `products`                                  |

### Seeder

| Service         | Commande           | Résultat  | Détail                   |
|-----------------|--------------------|-----------|--------------------------|
| product-service | `node ace db:seed` | ✅ **OK** | 10 produits insérés       |

---

## 6. Problèmes rencontrés et solutions

| Problème                                         | Cause                                          | Solution                                             |
|--------------------------------------------------|------------------------------------------------|------------------------------------------------------|
| `luxon` not found lors des migrations            | `luxon` n'était pas dans les deps du service   | `npm install luxon --workspace=@sfmc/auth-service`   |
| Connexion DB user-service : auth échouée         | PostgreSQL local sur port 5432 interceptait    | Port user-db changé `5432→5440` dans docker-compose  |
| `HttpContext.auth` propriété inexistante (TS)    | AdonisJS ne connaît pas la prop injectée       | Pattern `(ctx as any).auth` + type helper `actor()`  |
| `Map` incompatible avec `HeaderMap` Apollo 4     | Apollo Server 4 requiert son propre `HeaderMap`| Import `HeaderMap` depuis `@apollo/server`           |
| `buildSchema` déclaré mais non utilisé           | Import vestigial lors de la rédaction initiale | Import supprimé                                      |

---

## 7. Prochaines étapes — Sprint 2

1. **Inventory Service** — migrations `warehouses`, `stocks`, `stock_movements`; `POST /stocks/reserve` (Saga step 2)
2. **Order Service** — migrations `orders`, `order_lines`, `saga_log`; circuit breaker opossum; Saga choreography
3. **GraphQL subscriptions** (Order Service) — WebSocket `orderStatusUpdated`
4. **RabbitMQ** — connecter les consumers premiers événements (`order.created`, `inventory.reserved`)
5. **Rate limiting** `/api/v1/auth/login` — 5 requêtes/15min (Redis)

---

*Rapport Sprint 1 — SFMC Bénin*
*Référence ARCH-SFMC-2025-002 · Sprint 1 · AdonisJS 6 · TypeScript*
