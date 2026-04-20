# SFMC Bénin — Présentation du frontend (back-office web)

| Champ         | Valeur                                                             |
|---------------|--------------------------------------------------------------------|
| Projet        | Back-office web SFMC Bénin                                         |
| Nature        | Single Page Application (SPA) consommant les 9 microservices       |
| Stack         | Vite 5 · React 18+ · TypeScript 5.6 · Tailwind CSS v3 · shadcn/ui  |
| Auth          | JWT (access + refresh) émis par `auth-service`                     |
| Transport     | REST (Axios) · GraphQL (graphql-request) · WS (graphql-ws)         |
| Module racine | `sfmc-frontend/`                                                    |
| Port dev      | http://localhost:5173                                              |
| Date document | 2026-04-19                                                          |

> La présentation du **backend** (9 microservices AdonisJS) est dans [PRESENTATION_BACKEND.md](PRESENTATION_BACKEND.md).

---

## Table des matières

1. [Contexte et objectifs](#1-contexte-et-objectifs)
2. [Stack technique](#2-stack-technique)
3. [Arborescence du code](#3-arborescence-du-code)
4. [Modules & pages](#4-modules--pages)
5. [Flux d'authentification](#5-flux-dauthentification)
6. [Couche API & proxy](#6-couche-api--proxy)
7. [GraphQL & temps réel](#7-graphql--temps-réel)
8. [Gestion d'état & formulaires](#8-gestion-détat--formulaires)
9. [Design system](#9-design-system)
10. [Démarrage & build](#10-démarrage--build)
11. [Tests & qualité](#11-tests--qualité)
12. [Roadmap & dette](#12-roadmap--dette)

---

## 1. Contexte et objectifs

Le back-office SFMC est l'interface unique d'administration et d'exploitation de la plateforme. Il s'adresse :

- aux **administrateurs** qui gèrent les utilisateurs, le catalogue produits et consultent l'ensemble des rapports ;
- aux **opérateurs** (logistique, production, finance) qui pilotent les stocks, la fabrication, les factures et les expéditions ;
- aux **clients** qui peuvent suivre leurs propres commandes, factures et notifications.

Le frontend consomme directement les 9 microservices backend via leurs APIs REST + GraphQL. Il n'y a **pas de BFF intermédiaire** : le mapping réseau est fait par le proxy Vite en développement (voir §6) et par un reverse-proxy (Nginx / Kong) en production.

**Objectifs :**

- Un seul bundle React servant les 3 rôles, protection fine par `ProtectedRoute`.
- Dashboard temps réel alimenté par les subscriptions GraphQL du `reporting-service`.
- UI cohérente basée sur shadcn/ui + Tailwind, responsive desktop-first.
- Développement rapide via Vite HMR + React Query + Zod.

---

## 2. Stack technique

| Domaine              | Choix                                                                   |
|----------------------|-------------------------------------------------------------------------|
| Bundler              | **Vite 5.4** (downgradé depuis Vite 8 pour rester compatible Node 22.11) |
| Framework UI         | **React 18+** (API ≥ 19 supportées, strict mode actif)                  |
| Langage              | **TypeScript 5.6** — tsconfig strict, `tsc -b` dans la CI                |
| Styling              | **Tailwind CSS v3** + `tailwindcss-animate` + tokens shadcn/ui           |
| Composants primitifs | **shadcn/ui** (copy-in) sur **Radix UI** (Dialog, Dropdown, Select, Avatar, Separator, Tabs, Toast, Tooltip, Popover, Scroll-area, Slot) |
| Icônes               | `lucide-react`                                                          |
| Routing              | **React Router v7** (`createBrowserRouter` style SPA)                   |
| Data fetching        | **TanStack Query v5** + **Axios**                                       |
| GraphQL              | `graphql-request` (queries/mutations) + `graphql-ws` (subscriptions WS) |
| État global          | **Zustand v5** avec middleware `persist` (localStorage)                 |
| Formulaires          | **React Hook Form v7** + **Zod v4** (validation runtime + types)        |
| Notifications toast  | `sonner`                                                                |
| Dates                | `date-fns`                                                              |
| Charts               | `recharts`                                                              |
| JWT decode           | `jwt-decode`                                                            |
| Lint                 | ESLint 9 + `typescript-eslint` + `eslint-plugin-react-hooks`            |

---

## 3. Arborescence du code

```
sfmc-frontend/
├── index.html                    # favicon SVG custom + titre SFMC
├── public/favicon.svg
├── tailwind.config.js            # tokens shadcn + palette SFMC (bleu)
├── postcss.config.js
├── vite.config.ts                # alias @/ + proxy 9 services + WS /graphql
├── tsconfig.json · tsconfig.app.json · tsconfig.node.json
├── package.json                  # scripts: dev, build, preview, lint
└── src/
    ├── main.tsx                  # point d'entrée React
    ├── App.tsx                   # routes + providers (QueryClient, Toaster)
    ├── index.css                 # @tailwind base/components/utilities + variables shadcn
    │
    ├── lib/
    │   ├── api.ts                # instance Axios + interceptors (JWT, 401/403/429/5xx)
    │   ├── graphql.ts            # GraphQLClient + createWsClient(lazy, retry)
    │   ├── pagination.ts         # helper asArray()
    │   └── utils.ts              # cn, formatCurrency, formatDate, formatDateTime
    │
    ├── stores/
    │   └── auth-store.ts         # Zustand persist: token, refreshToken, user, isAuthenticated()
    │
    ├── services/
    │   ├── auth.ts               # login / logout / validate (unwrap envelope data.data)
    │   └── index.ts              # clients REST par domaine (products, orders, invoices, ...)
    │
    ├── types/
    │   ├── auth.ts               # UserRole, JwtPayload (sub, email, role, exp), LoginResponse
    │   └── domain.ts             # Product, Order, Invoice, Notification, DashboardKpis, ...
    │
    ├── components/
    │   ├── ProtectedRoute.tsx    # garde route par rôle
    │   ├── DataTableEmpty.tsx
    │   ├── layout/
    │   │   ├── AppShell.tsx      # layout principal (Sidebar + Topbar + <Outlet/>)
    │   │   ├── Sidebar.tsx       # navigation filtrée par rôle
    │   │   └── Topbar.tsx        # utilisateur courant + logout
    │   └── ui/                   # shadcn copies: avatar, badge, button, card, dialog,
    │                             #   dropdown-menu, input, label, select, separator, table
    │
    └── pages/
        ├── Login.tsx
        ├── Dashboard.tsx         # KPIs + chart ordersByStatus + subscription kpiUpdated
        ├── Orders.tsx · OrderDetail.tsx
        ├── Products.tsx · Inventory.tsx · Production.tsx
        ├── Billing.tsx · Notifications.tsx
        ├── Reports.tsx · Users.tsx · Profile.tsx
        └── NotFound.tsx
```

---

## 4. Modules & pages

Chaque page consomme un ou plusieurs microservices. Toutes les routes sont protégées par `ProtectedRoute` (voir §5). Les rôles autorisés sont cumulatifs par ordre : `ADMIN > OPERATOR > CLIENT`.

| Route            | Composant           | Service(s) backend                     | Rôles autorisés           |
|------------------|---------------------|----------------------------------------|---------------------------|
| `/login`         | `Login`             | auth-service                           | public                    |
| `/`              | `Dashboard`         | reporting-service (REST + WS)          | tous connectés            |
| `/orders`        | `Orders`            | order-service                          | ADMIN, OPERATOR           |
| `/my-orders`     | `Orders` (mode client) | order-service — auto-filtré `customerId = user.id` | **CLIENT uniquement** |
| `/orders/:id`    | `OrderDetail`       | order-service (+ billing pour facture) | tous connectés (CLIENT : uniquement ses propres commandes) |
| `/products`      | `Products`          | product-service                        | tous connectés (CRUD: ADMIN) |
| `/inventory`     | `Inventory`         | inventory-service                      | ADMIN, OPERATOR           |
| `/production`    | `Production`        | production-service                     | ADMIN, OPERATOR           |
| `/billing`       | `Billing`           | billing-service                        | ADMIN, OPERATOR           |
| `/my-invoices`   | `Billing` (mode client) | billing-service — auto-filtré `customerId = user.id` | **CLIENT uniquement** |
| `/notifications` | `Notifications`     | notification-service                   | tous connectés            |
| `/reports`       | `Reports`           | reporting-service (GraphQL)            | ADMIN, OPERATOR           |
| `/users`         | `Users`             | user-service                           | **ADMIN uniquement**      |
| `/profile`       | `Profile`           | auth-service (validate)                | tous connectés            |

> **Espace CLIENT restreint** — la sidebar masque automatiquement `/orders`, `/inventory`, `/production`, `/billing`, `/reports`, `/users` pour les CLIENT et affiche à la place `/my-orders` et `/my-invoices`. Les pages `Orders` et `Billing` détectent le rôle via `useAuthStore` et :
> - ajustent le titre (`Mes commandes` / `Mes factures`),
> - auto-préremplissent `customerId` avec l'id du user lors de la création,
> - s'appuient sur le filtrage serveur (policy CLIENT des contrôleurs `orders_controller.ts` et `invoices_controller.ts`).

### 4.1 Dashboard temps réel

- Query REST `GET /api/v1/reports/dashboard` toutes les 30 s (`refetchInterval`) + unwrap de l'enveloppe Adonis `{ data: { … } }`.
- Subscription GraphQL `kpiUpdated` sur `ws://localhost:3009/graphql`. Quand un événement arrive, le badge passe en **Flux temps réel** (vert, pulsant) et déclenche un `refetch()`.
- KPI cards : **Commandes · Chiffre d'affaires · Production terminée · Taux d'échec qualité**.
- Chart `recharts` : **Commandes par statut** (bar chart alimenté par `ordersByStatus`).
- Panneau secondaire : factures **Payées / En attente**, **Stocks critiques**.

### 4.2 Orders & OrderDetail

- Création de commande : `react-hook-form` + Zod (lignes dynamiques, `z.coerce.number()` pour les quantités/prix).
- La création déclenche la Saga backend — la page d'Orders rafraîchit automatiquement les statuts via React Query.
- `OrderDetail` affiche :
  - une **timeline Saga enrichie** (PENDING → VALIDATED → IN_PRODUCTION → READY → SHIPPED → DELIVERED) avec étape courante mise en exergue (ring + pulse).
  - des **actions OPERATOR/ADMIN** contextuelles : `Marquer prête` (depuis VALIDATED/IN_PRODUCTION), `Expédier` (READY → SHIPPED), `Livrer` (SHIPPED → DELIVERED), `Annuler` (tant que < SHIPPED).
  - pour un CLIENT, un bouton `Annuler` visible uniquement sur ses propres commandes en statut pré-expédition.
  - pour une commande CANCELLED, un bandeau rouge rappelant que les compensations Saga (libération stock, invalidation facture) ont été émises.

### 4.3 Products & Inventory

- Catalogue filtrable par catégorie (`CIMENT`, `FER`, `BRIQUES`, `GRANULATS`).
- Inventaire avec badges **Critique** (rouge) quand `quantity ≤ threshold`.
- CRUD produit restreint aux `ADMIN`.

### 4.4 Production

- Liste des ordres de fabrication + avancement manuel (`PLANNED` → `IN_PROGRESS` → `QUALITY_CHECK`).
- Déclaration du contrôle qualité (`passed: true/false`).

### 4.5 Users

- Accès `ADMIN` uniquement. Création, changement de rôle, désactivation.
- Les rôles sont contraints côté UI ET backend à `ADMIN | OPERATOR | CLIENT`.

---

## 5. Flux d'authentification

### 5.1 Login

```
1. Utilisateur   → /login → POST /api/v1/auth/login { email, password }
2. auth-service  → { data: { accessToken, refreshToken, tokenType, expiresIn, user } }
3. Frontend      → authService.login() unwrap de data.data
4. Frontend      → jwtDecode(accessToken) → { sub, email, role, exp }
5. Zustand       → setAuth({ token, refreshToken, user }) — persiste dans localStorage
6. React Router  → navigate('/')
```

### 5.2 ProtectedRoute

- Lit `useAuthStore.isAuthenticated()` (vérifie `typeof token === 'string'` + `exp` valide si présent).
- Si non authentifié : redirect vers `/login`.
- Si la prop `roles` est fournie (ex. `['ADMIN']`), contrôle que `user.role` est dans la liste — sinon redirect `/`.

### 5.3 Interceptor Axios (`src/lib/api.ts`)

- **Request** : ajoute `Authorization: Bearer <token>` si présent.
- **Response** :
  - `401` → `clearAuth()` + toast "Session expirée" + redirect `/login`.
  - `403` → toast "Action non autorisée".
  - `429` → toast "Trop de requêtes, veuillez patienter".
  - `5xx` → toast "Erreur serveur (<code>) : <message>".

### 5.4 Comptes de démo (seedés côté backend)

| Rôle       | Email              | Mot de passe     |
|------------|--------------------|------------------|
| `ADMIN`    | admin@sfmc.bj      | `Admin@2026`     |
| `OPERATOR` | operator@sfmc.bj   | `Operator@2026`  |
| `CLIENT`   | client@sfmc.bj     | `Client@2026`    |

Voir [PRESENTATION_BACKEND.md §9.3](PRESENTATION_BACKEND.md#93-migrations-et-seeders) pour lancer les seeders.

---

## 6. Couche API & proxy

### 6.1 Axios — base URL relative

```ts
export const api = axios.create({
  baseURL: '/api/v1',
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
})
```

`baseURL: '/api/v1'` signifie que tous les appels frontend passent par le **proxy Vite** (dev) ou le **reverse-proxy** (prod). Aucun CORS à gérer, aucune URL absolue dans le code.

### 6.2 Proxy Vite — dispatch par préfixe vers les 9 services

Extrait de `vite.config.ts` :

```ts
const proxyMap: Record<string, string> = {
  '/api/v1/auth':                  'http://localhost:3001',
  '/api/v1/users':                 'http://localhost:3002',
  '/api/v1/products':              'http://localhost:3003',
  '/api/v1/warehouses':            'http://localhost:3004',
  '/api/v1/stocks':                'http://localhost:3004',
  '/api/v1/orders':                'http://localhost:3005',
  '/api/v1/production-orders':     'http://localhost:3006',
  '/api/v1/invoices':              'http://localhost:3007',
  '/api/v1/payments':              'http://localhost:3007',
  '/api/v1/notifications':         'http://localhost:3008',
  '/api/v1/reports':               'http://localhost:3009',
  '/graphql':                      'http://localhost:3009', // REST + WebSocket
}
```

Avec `ws: true` sur `/graphql` pour supporter l'upgrade WebSocket.

### 6.3 Services typés (`src/services/index.ts`)

Un objet par domaine expose des méthodes `list()`, `get()`, `create()`, `update()`, `remove()` typées :

```ts
export const productsService = {
  list: (params?) => api.get<ApiList<Product>>('/products', { params }).then((r) => r.data),
  get:  (id)      => api.get<{ data: Product }>(`/products/${id}`).then((r) => r.data.data),
  create: (body)  => api.post<{ data: Product }>('/products', body).then((r) => r.data.data),
  update: (id, b) => api.patch<{ data: Product }>(`/products/${id}`, b).then((r) => r.data.data),
  remove: (id)    => api.delete<void>(`/products/${id}`),
}
```

Toutes les réponses backend suivent l'enveloppe Adonis `{ data: … }` → le service déballe avant retour.

---

## 7. GraphQL & temps réel

### 7.1 Client HTTP (`src/lib/graphql.ts`)

```ts
export const gqlClient = new GraphQLClient('/graphql', {
  requestMiddleware: (req) => {
    const token = useAuthStore.getState().token
    return token
      ? { ...req, headers: { ...req.headers, Authorization: `Bearer ${token}` } }
      : req
  },
})
```

### 7.2 Client WebSocket (subscriptions)

```ts
const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
wsClient = createWsClient({
  url: `${proto}://${window.location.host}/graphql`,
  connectionParams: () => {
    const token = useAuthStore.getState().token
    return token ? { Authorization: `Bearer ${token}` } : {}
  },
  lazy: true,
  retryAttempts: 5,
})
```

### 7.3 Subscription utilisée

```graphql
subscription OnKpiUpdate {
  kpiUpdated {
    totalOrders
    totalRevenue
    qualityFailureRate
    criticalStockCount
  }
}
```

Chaque event reçu bascule le badge "Offline" → **"Flux temps réel"** et force un `refetch()` de la query REST pour rafraîchir les chiffres.

---

## 8. Gestion d'état & formulaires

### 8.1 État serveur — TanStack Query

- Cache global par `queryKey` (ex. `['reports', 'dashboard']`, `['products', { q }]`).
- Par défaut : `retry: 1`, `staleTime: 10 000 ms`, `refetchOnWindowFocus: false`.
- `refetchInterval: 30 000` sur le dashboard (polling quand le WS n'est pas encore "live").

### 8.2 État global UI — Zustand

- Store `auth-store` avec middleware `persist` → localStorage, clé `sfmc-auth`.
- Un seul slice `{ token, refreshToken, user, setAuth, clearAuth, isAuthenticated }`.
- L'ensemble des pages consomme `useAuthStore()` ; pas d'autre store global (les données métier vivent dans React Query).

### 8.3 Formulaires — React Hook Form + Zod

Pattern type (création de commande) :

```ts
const schema = z.object({
  customerId: z.string().uuid(),
  lines: z.array(z.object({
    productId: z.string().uuid(),
    quantity:  z.coerce.number().positive(),
    unitPrice: z.coerce.number().nonnegative(),
  })).min(1),
})

type FormInput  = z.input<typeof schema>   // côté UI (string inputs)
type FormOutput = z.output<typeof schema>  // côté submit (number coerced)

const form = useForm<FormInput, unknown, FormOutput>({
  resolver: zodResolver(schema),
})
```

Cette approche garantit que les `number` sont déjà bien coerced au moment du `onSubmit`, sans cast manuel.

---

## 9. Design system

### 9.1 Tokens shadcn/ui

Définis comme variables CSS dans `src/index.css` :

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --muted: 210 40% 96.1%;
  /* … */
}
```

### 9.2 Palette SFMC (Tailwind)

```js
colors: {
  sfmc: {
    50:  '#eff6ff',
    100: '#dbeafe',
    500: '#3b82f6',
    700: '#1d4ed8',
    900: '#1e3a8a',
  },
}
```

Utilisée pour les headers, KPI cards, boutons d'action principaux.

### 9.3 Composants UI bundlés (copies shadcn)

`avatar · badge · button · card · dialog · dropdown-menu · input · label · select · separator · table`

### 9.4 Variantes `Badge`

`default · secondary · destructive · outline · success (vert) · warning (ambre)` — utilisées pour les statuts de commandes, factures, stocks.

---

## 10. Démarrage & build

### 10.1 Prérequis

- Node 20+ / npm 9+.
- Backend démarré (voir [PRESENTATION_BACKEND §9](PRESENTATION_BACKEND.md#9-démarrage-local)).

### 10.2 Installation

```powershell
cd sfmc-frontend
npm install
```

### 10.3 Dev server

```powershell
npm run dev
# → http://localhost:5173
```

Le proxy Vite dispatche automatiquement les requêtes `/api/v1/*` et `/graphql` vers les 9 services locaux.

### 10.4 Build production

```powershell
npm run build      # tsc -b && vite build
npm run preview    # serveur statique local pour vérification
```

Le build émet un bundle optimisé dans `dist/`. En production, servir `dist/` derrière un reverse-proxy Nginx qui conserve les mêmes règles de proxy que `vite.config.ts`.

---

## 11. Tests & qualité

| Levier             | Outil                                   | Statut          |
|--------------------|-----------------------------------------|-----------------|
| Typecheck          | `tsc -b` (via `npm run build`)          | ✅ zéro erreur  |
| Lint               | ESLint 9 + TS-ESLint + react-hooks      | ✅ configuré    |
| Validation runtime | Zod dans tous les formulaires           | ✅              |
| Tests E2E browser  | Playwright (Chromium)                   | ✅ 6 / 6 passent |
| Tests unitaires    | Vitest + @testing-library/react         | 🕐 non livré    |

Le typecheck est bloquant dans le script `build` (`tsc -b && vite build`), donc toute régression de type fait échouer le build.

### 11.1 Suite Playwright

Configuration : `sfmc-frontend/playwright.config.ts` — `baseURL=http://localhost:5173`,
projet `chromium`, `locale=fr-FR`, traces / screenshots / vidéos conservées uniquement
en cas d'échec.

```bash
# dans sfmc-frontend/
npm run test:e2e          # headless, reporter "list"
npm run test:e2e:headed   # browser visible (debug)
npm run test:e2e:ui       # Playwright UI
```

Les spécs partagent un fichier `e2e/fixtures.ts` qui :

- détient les 3 comptes seedés (`admin@sfmc.bj / Admin@2026`, `operator@sfmc.bj /
  Operator@2026`, `client@sfmc.bj / Client@2026`) ;
- purge en best-effort le rate-limit Redis (`ratelimit:login:*`) via
  `docker exec sfmc-redis redis-cli EVAL ...` avant chaque `describe` (utile en
  local — ignoré en CI) ;
- expose `loginAs(page, request, role, path)` qui **ne passe pas par le formulaire
  UI** : il poste `/api/v1/auth/login`, sérialise la réponse dans
  `localStorage.sfmc-auth` (format attendu par le store Zustand persisté) puis
  navigue — ce qui garde la suite largement sous la limite 5 req / 15 min ;
- expose `findAvailableFinishedProduct(request, minQty)` qui interroge
  `/api/v1/stocks` pour trouver un produit fini dispo avant de créer une commande.

| Spec                                     | Scénario                                                                                                      | Assertions clés |
|------------------------------------------|---------------------------------------------------------------------------------------------------------------|-----------------|
| `e2e/login.spec.ts`                      | Login admin via le formulaire UI ; vérification du sidebar ADMIN / OPERATOR / CLIENT et du 403 `/orders` CLIENT | 4 tests          |
| `e2e/order-flow.spec.ts`                 | CLIENT crée une commande → saga passe en `VALIDATED` → OPERATOR transitionne `READY → SHIPPED → DELIVERED` via OrderDetail → CLIENT voit `Livrée` dans `Mes commandes` | 1 test (flux complet CU-01 côté UI) |
| `e2e/dashboard-realtime.spec.ts`         | Badge `Flux temps réel` passe en `live` (GraphQL subscription `kpiUpdated`) en moins de 5 s après la création d'une commande | 1 test          |

Exécution locale typique (backend + frontend déjà démarrés) : **6 passed en 32 s**.

---

## 12. Roadmap & dette

Les livrables historiquement listés comme dette **« espace CLIENT restreint »** et **« tests E2E Playwright »** sont **bouclés** : routes `/my-orders` et `/my-invoices` avec `ProtectedRoute` dédié (voir §4), suite Playwright documentée en **§11.1** (6 tests au vert sur stack live).

| Item                                                    | Priorité | Remarque                                                |
|---------------------------------------------------------|----------|---------------------------------------------------------|
| Tests unitaires Vitest (composants critiques)           | Haute    | Login, ProtectedRoute, services API                     |
| Refresh token automatique                               | Haute    | Intercepter 401 et essayer `/auth/refresh` avant logout |
| Internationalisation (fr/en)                            | Moyenne  | `i18next` ; textes déjà concentrés dans les pages       |
| Mode sombre                                             | Basse    | Tokens shadcn `.dark` déjà prêts                        |
| PWA / offline cache                                     | Basse    | Service worker pour les lectures dashboard              |
| Storybook des composants UI                             | Basse    | Documentation design                                    |

---

## Annexes

### A. Contrat avec le backend (points de vigilance historiques)

Ces trois alignements ont été durcis — toute régression côté backend les briserait :

| Point                           | Forme attendue                                                     |
|--------------------------------|--------------------------------------------------------------------|
| Enveloppe réponse REST          | `{ data: <payload> }` — unwrap systématique côté service front    |
| Payload JWT                     | `{ sub, email, role, exp }` — `sub` est l'user ID                  |
| Nom des rôles                   | `ADMIN \| OPERATOR \| CLIENT` (pas de `MANAGER`/`TECHNICIAN`)      |
| Structure login                 | `{ data: { accessToken, refreshToken, tokenType, expiresIn, user } }` |
| `JWT_SECRET` inter-services     | **Identique sur les 9 services** (uniformisé dans `.env`)          |

### B. Références

- Présentation backend : [PRESENTATION_BACKEND.md](PRESENTATION_BACKEND.md)
- Liste des endpoints : [ENDPOINTS.md](ENDPOINTS.md)
- Conception : [achitecture.md](achitecture.md)

---

*Présentation frontend SFMC Bénin · 2026-04-20 · Vite 5 · React 19 · TypeScript 5.6 · Tailwind v3 · shadcn/ui.*
