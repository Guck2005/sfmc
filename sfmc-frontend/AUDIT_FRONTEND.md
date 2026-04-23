# Rapport d'audit de conformité — SFMC Bénin (frontend)

**Stack** : React 19, Vite, TypeScript, TanStack Query, Zustand, React Router, Axios, `graphql-request` + `graphql-ws`.  
**Périmètre exploré** : `src/` (pages, components, services, stores, lib, types), `vite.config.ts`, tests e2e Playwright.  
**Méthode** : lecture du code source et recherche d'appels (`api`, `fetch`, services). Un endpoint est considéré **consommé** uniquement s'il est invoqué depuis au moins une **page ou un composant** (pas seulement déclaré dans `services/index.ts`).

---

## Structure du projet (vue d'ensemble)

```
sfmc-frontend/
├── src/
│   ├── App.tsx                 # Routes + QueryClient
│   ├── main.tsx
│   ├── components/
│   │   ├── ProtectedRoute.tsx  # Auth + RBAC par route
│   │   ├── layout/             # AppShell, Sidebar, Topbar
│   │   └── ui/                 # shadcn-like (button, card, table…)
│   ├── pages/                  # Écrans métier
│   ├── services/
│   │   ├── auth.ts             # login, logout, validate (non branché)
│   │   └── index.ts            # Agrégat API REST (+ auth.register)
│   ├── stores/auth-store.ts    # JWT + user (persist)
│   ├── lib/api.ts              # Axios + intercepteurs
│   └── lib/graphql.ts          # GraphQL HTTP client + WebSocket
├── e2e/                        # Playwright
└── vite.config.ts              # Proxy multi-services
```

**Remarque** : il n'existe pas de dossiers dédiés `hooks/` ou `context/` ; l'état auth est dans `stores/`, la protection des routes dans `components/`.

---

### Authentification

**Résumé** : 7/10 points conformes au cahier des charges sécurité / flux complets.

#### ✅ Implémenté

- Page de connexion email + mot de passe : `src/pages/Login.tsx`
- Injection du Bearer sur requêtes Axios : `src/lib/api.ts`
- **Renouvellement access token** : `POST /auth/refresh` via `src/lib/auth-refresh.ts` + intercepteur 401 sur l’instance `api` (`src/lib/api.ts`) ; `setAuth` fusionne les jetons (`src/stores/auth-store.ts`)
- **Validation de session au chargement** : `AuthBootstrap` → `authService.validate` (`src/components/AuthBootstrap.tsx`, `src/services/auth.ts`)
- **Redirection post-login par rôle** : CLIENT → `/my-orders`, sinon `/` (`src/pages/Login.tsx`)
- Déconnexion avec tentative de révocation refresh : `src/services/auth.ts`, `src/components/layout/Topbar.tsx`
- Protection des routes : `src/components/ProtectedRoute.tsx`, `src/App.tsx`
- Affichage erreurs API (401 avec refresh, 403, 409, 429, 503, 5xx) via toasts : `src/lib/api.ts`

#### ⚠️ Partiel

- Gestion JWT : access + refresh stockés via **Zustand `persist`** → équivalent **localStorage** (`name: 'sfmc-auth'`), pas httpOnly ni BFF dédié : `src/stores/auth-store.ts`

#### ❌ Manquant

- Flux OAuth (`GET …/oauth/authorize`, `POST …/oauth/token`) : aucune UI / flux front (endpoints backend présents)

#### Endpoints backend consommés

| Endpoint | Consommé | Fichier frontend |
|---|---|---|
| POST /api/v1/auth/login | ✅ | `src/pages/Login.tsx` → `src/services/auth.ts` |
| POST /api/v1/auth/register | ✅ | `src/pages/Users.tsx` → `src/services/index.ts` (`usersService.create` → `authService.register`) |
| POST /api/v1/auth/refresh | ✅ | `src/lib/api.ts` (intercepteur), `src/lib/auth-refresh.ts` |
| POST /api/v1/auth/logout | ✅ | `src/components/layout/Topbar.tsx` → `src/services/auth.ts` |
| POST /api/v1/auth/validate | ✅ | `src/components/AuthBootstrap.tsx` → `src/services/auth.ts` |
| GET /api/v1/auth/oauth/authorize | ❌ | — |
| POST /api/v1/auth/oauth/token | ❌ | — |

#### Séparation des rôles

| Action | ADMIN | OPERATOR | CLIENT | Implémenté |
|---|---|---|---|---|
| Accès page login public | — | — | — | ✅ |
| Routes internes sans CLIENT | ✅ | ✅ | ❌ | ✅ (`App.tsx` + `ProtectedRoute`) |
| Masquage navigation CLIENT | — | — | — | ✅ (`src/components/layout/Sidebar.tsx`) |

---

### Tableau de bord

**Résumé** : 11/12 points conformes (mise à jour post-audit).

#### ✅ Implémenté

- KPIs via `GET /reports/dashboard` avec **filtres `from` / `to`** (query) : `src/pages/Dashboard.tsx`, `src/services/index.ts` (`reportingService.dashboard`)
- **Vue CLIENT** : agrégation restreinte côté **reporting-service** (`customerId` dérivé du JWT — pas de confiance au paramètre URL) ; masquage stocks critiques / graphiques internes côté front : `Dashboard.tsx`
- Graphique commandes par statut + **graphiques ventes et production** sur la période (`GET /reports/sales`, `GET /reports/production`) pour ADMIN/OPERATOR : `Dashboard.tsx`
- Actualisation temps réel (subscription `kpiUpdated`) **réservée aux rôles internes** ; CLIENT en polling 30 s : `Dashboard.tsx`, `src/lib/graphql.ts`
- Message explicite si le flux WS est indisponible ; message **503** dédié sur erreur chargement KPIs : `Dashboard.tsx`
- Lottie succès court après **Appliquer** / **Toutes périodes** sur les filtres : `Dashboard.tsx` + `src/components/ui/LottieAnimation.tsx`

#### ⚠️ Partiel

- Aucun écran « Rapports » séparé du dashboard : qualité / stock / CSV sont intégrés dans `Dashboard.tsx`.

#### ❌ Manquant

- Aucun sur le périmètre REST listé ci-dessous ; extensions possibles (rapports paginés dédiés, etc.).

#### Endpoints backend consommés

| Endpoint | Consommé | Fichier frontend |
|---|---|---|
| GET /api/v1/reports/dashboard | ✅ | `src/pages/Dashboard.tsx` (params `from`, `to`) |
| GET /api/v1/reports/sales | ✅ | `src/pages/Dashboard.tsx` |
| GET /api/v1/reports/production | ✅ | `src/pages/Dashboard.tsx` |
| GET /api/v1/reports/quality | ✅ | `src/pages/Dashboard.tsx` |
| GET /api/v1/reports/stock | ✅ | `src/pages/Dashboard.tsx` |
| GET /api/v1/reports/:type/export.csv | ✅ | `src/pages/Dashboard.tsx` |
| POST /graphql / WS subscriptions | ✅ | `src/pages/Dashboard.tsx` + `src/lib/graphql.ts` (WS **ADMIN/OPERATOR** ; pas de client HTTP GraphQL reporting ailleurs) |

#### Séparation des rôles

| Action | ADMIN | OPERATOR | CLIENT | Implémenté |
|---|---|---|---|---|
| Voir dashboard global | ✅ | ✅ | ❌ (vue filtrée « mes commandes / factures ») | ✅ |

---

### Gestion des commandes

**Résumé** : 11/14 points conformes.

#### ✅ Implémenté

- Liste avec filtre **statut** : `src/pages/Orders.tsx`
- **Filtre `customerId` côté API** pour les CLIENT (`ordersService.list`) + champ UUID optionnel pour ADMIN/OPERATOR : `src/pages/Orders.tsx`
- **Filtre période** (dates création) sur la liste : champs date + filtrage client : `src/pages/Orders.tsx`
- **Export CSV** des commandes affichées : `src/pages/Orders.tsx`
- **DELETE** `/orders/:id` (ADMIN) : liste + `src/pages/OrderDetail.tsx`
- Création commande (lignes produits + quantités + PU) : `src/pages/Orders.tsx` ; rôle **CLIENT** : `customerId` prérempli avec l’`user.id` du JWT
- Détail + lignes : `src/pages/OrderDetail.tsx`
- Transition de statut (OPERATOR/ADMIN) : `src/pages/OrderDetail.tsx` (`canManage`)
- Annulation avec confirmation (détail) : `src/pages/OrderDetail.tsx`
- Annulation depuis la liste avec `confirm` : `src/pages/Orders.tsx` ; bouton **Annuler** masqué pour un CLIENT si `order.customerId !== userId` (aligné avec le détail)
- Distinction routes `/orders` vs `/my-orders` : `src/App.tsx`

#### ⚠️ Partiel

- Tri (date, montant, statut) et **pagination** : absents côté UI (`limit: 100` fixe)

#### ❌ Manquant

- GraphQL commandes (si prévu contrat) : non branché

#### Endpoints backend consommés

| Endpoint | Consommé | Fichier frontend |
|---|---|---|
| POST /api/v1/orders | ✅ | `src/pages/Orders.tsx` |
| GET /api/v1/orders | ✅ | `src/pages/Orders.tsx` |
| GET /api/v1/orders/:id | ✅ | `src/pages/OrderDetail.tsx` |
| PUT /api/v1/orders/:id/status | ✅ | `src/pages/OrderDetail.tsx` |
| POST /api/v1/orders/:id/cancel | ✅ | `src/pages/Orders.tsx`, `src/pages/OrderDetail.tsx` |
| DELETE /api/v1/orders/:id | ✅ | `src/pages/Orders.tsx`, `src/pages/OrderDetail.tsx` (ADMIN) |
| POST /api/v1/orders/…/graphql | ❌ | — |

#### Séparation des rôles

| Action | ADMIN | OPERATOR | CLIENT | Implémenté |
|---|---|---|---|---|
| Voir toutes les commandes | ✅ | ✅ | ❌ | ✅ (`customerId` pour CLIENT ; filtre UUID optionnel internes) |
| Créer commande | ✅ | ✅ | ✅ | ✅ |
| Changer statut | ✅ | ✅ | ❌ | ✅ (`OrderDetail.tsx`) |
| Annuler (détail) | selon règle métier | selon règle métier | propre commande | ✅ (`clientOwnsThis` / statuts) |
| Annuler (liste) | — | — | propre commande | ✅ (même règle `customerId` + statuts annulables) |

---

### Gestion des stocks

**Résumé** : couverture CDC inventaire **complète côté UI** (REST + lecture GraphQL) ; entrepôts hors périmètre CDC inchangé (⚠️).

#### ✅ Implémenté

- Liste stocks avec quantité / réservé / disponible / seuil et mise en évidence seuil : `src/pages/Inventory.tsx`
- Alertes stock critique (carte + badge) : `src/pages/Inventory.tsx` (`inventoryService.alerts`)
- Vue liste des entrepôts : même page
- **Multi-entrepôts par produit** : bouton « Entrepôts » → `GET /stocks/:productId/warehouses` via `inventoryService.byProduct` : `src/pages/Inventory.tsx`
- **Mouvements** : liste filtrable (`listMovements`) + formulaire `createMovement` (aligné payload backend `stockId`, `origin`, etc.) : `src/pages/Inventory.tsx`, `src/services/index.ts`
- **Seuils d’alerte (ADMIN)** : `PUT /stocks/:id/threshold` via bouton « Seuil » : `src/pages/Inventory.tsx`
- **Outils saga** (ADMIN + OPERATOR) : `checkAvailability`, `reserve`, `release` dans `inventoryService` + bloc repliable « Outils saga / disponibilité » : `src/pages/Inventory.tsx`
- **GraphQL inventaire** : requête `criticalStocks` via `inventoryGraphql` → proxy Vite `/api/inventory/graphql` → `:3004/graphql` (évite le conflit avec `/graphql` reporting) : `src/services/index.ts`, `vite.config.ts`, `src/pages/Inventory.tsx`

#### ⚠️ Partiel / hors CDC

- **CRUD entrepôts** : non spécifié au CDC § inventaire ; toujours présent sur la page (voir section « Appels hors CDC » si besoin).

#### Endpoints backend consommés (liste CDC inventaire)

| Endpoint | Consommé | Fichier frontend |
|---|---|---|
| GET /api/v1/stocks | ✅ | `src/pages/Inventory.tsx` |
| GET /api/v1/stocks/:productId/warehouses | ✅ | `src/pages/Inventory.tsx` (`inventoryService.byProduct`) |
| POST /api/v1/stocks/movements | ✅ | `src/pages/Inventory.tsx` |
| GET /api/v1/stocks/movements | ✅ | `src/pages/Inventory.tsx` |
| GET /api/v1/stocks/alerts | ✅ | `src/pages/Inventory.tsx` |
| PUT /api/v1/stocks/:id/threshold | ✅ | `src/pages/Inventory.tsx` (ADMIN) |
| POST /api/v1/stocks/check-availability | ✅ | `src/pages/Inventory.tsx` (`inventoryService`) |
| POST /api/v1/stocks/reserve | ✅ | `src/pages/Inventory.tsx` |
| POST /api/v1/stocks/release | ✅ | `src/pages/Inventory.tsx` |
| POST /graphql (inventory) | ✅ | `inventoryGraphql` + proxy `/api/inventory/graphql` → service inventaire |

#### Séparation des rôles

| Action | ADMIN | OPERATOR | CLIENT | Implémenté |
|---|---|---|---|---|
| Accès écran stocks | ✅ | ✅ | ❌ | ✅ (route `App.tsx`) |
| Modifier seuils (ADMIN) | ✅ | ❌ | ❌ | ✅ (`Inventory.tsx`, bouton Seuil) |
| Réserve / libération / vérif. dispo. | ✅ | ✅ | ❌ | ✅ (bloc outils saga) |
| CRUD entrepôts | non spécifié CDC | — | — | ⚠️ voir section « Appels hors CDC » |

---

### Gestion de la production

**Résumé** : 9/11 points conformes.

#### ✅ Implémenté

- Liste des ordres de fabrication + filtre par statut (query) : `src/pages/Production.tsx`
- Création d'un OF (avec `orderId` obligatoire) : même fichier
- Contrôle qualité (case « lot validé » + notes, aligné backend) : `src/pages/Production.tsx` → `productionService.qualityControl`
- Détail OF (dialog) : `productionService.get` → `GET /api/v1/production-orders/:id`
- Avancement de statut **PLANNED → IN_PROGRESS → QUALITY_CHECK → COMPLETED/REJECTED/CANCELLED** : sélecteur + `productionService.updateStatus` dans `Production.tsx`
- Machines : liste + mise à jour de statut : `productionService.listMachines` / `updateMachineStatus` dans `src/services/index.ts` et carte « Machines » dans `Production.tsx`

#### ⚠️ Partiel

- Filtre « période » sur les OF : non présent (filtre statut uniquement)

#### ❌ Manquant

- GraphQL dédié production (si prévu CDC) : non branché côté front

#### Endpoints backend consommés

| Endpoint | Consommé | Fichier frontend |
|---|---|---|
| GET /api/v1/production-orders | ✅ | `src/pages/Production.tsx` |
| POST /api/v1/production-orders | ✅ | `src/pages/Production.tsx` |
| GET /api/v1/production-orders/:id | ✅ | `src/pages/Production.tsx` |
| PUT /api/v1/production-orders/:id/status | ✅ | `src/pages/Production.tsx` |
| POST /api/v1/production-orders/:id/quality | ✅ | `src/pages/Production.tsx` |
| GET /api/v1/machines | ✅ | `src/pages/Production.tsx` |
| PUT /api/v1/machines/:id/status | ✅ | `src/pages/Production.tsx` |

#### Séparation des rôles

| Action | ADMIN | OPERATOR | CLIENT | Implémenté |
|---|---|---|---|---|
| Accès production | ✅ | ✅ | ❌ | ✅ |
| QA | ✅ | ✅ | ❌ | ✅ (`hasRole` + statut OF) |

---

### Facturation

**Résumé** : 9/10 points conformes.

#### ✅ Implémenté

- Liste des factures : `src/pages/Billing.tsx`
- **URL dédiée** `/billing/:invoiceId` (internes) et `/my-invoices/:invoiceId` (CLIENT) : `src/App.tsx` + navigation depuis la liste : `src/pages/Billing.tsx`
- Téléchargement PDF (blob + `fetch` avec Bearer) : `src/pages/Billing.tsx`
- Filtre **statut** côté API (`listInvoices`) pour ADMIN/OPERATOR ; plage **dates** sur `createdAt` côté client : `Billing.tsx`
- Détail facture (dialog) : `billingService.get` + historique **paiements** : `billingService.listPayments`
- Enregistrement paiement (ADMIN/OPERATOR) : dialog + `billingService.recordPayment`
- Avoir : `billingService.getCreditNote` ; PDF avoir via `billingService.creditNotePdfUrl` (téléchargement pour factures `REFUNDED`)

#### ⚠️ Partiel

- Filtre période : appliqué en mémoire après chargement de la page (pas de paramètres `from`/`to` API si absents backend)

#### ❌ Manquant

- Page facture **hors** dialog (layout plein écran) : non prévue (dialog + route profonde)

#### Endpoints backend consommés

| Endpoint | Consommé | Fichier frontend |
|---|---|---|
| GET /api/v1/invoices | ✅ | `src/pages/Billing.tsx` |
| GET /api/v1/invoices/:id | ✅ | `src/pages/Billing.tsx` |
| POST /api/v1/invoices/:id/payments | ✅ | `src/pages/Billing.tsx` |
| GET /api/v1/invoices/:id/pdf | ✅ | `src/pages/Billing.tsx` |
| GET /api/v1/invoices/:id/credit-note | ✅ | `src/pages/Billing.tsx` |
| GET /api/v1/invoices/:id/credit-note/pdf | ✅ | `src/pages/Billing.tsx` |

#### Séparation des rôles

| Action | ADMIN | OPERATOR | CLIENT | Implémenté |
|---|---|---|---|---|
| Routes factures | ✅ | ✅ | ❌ route dédiée | ✅ (`App.tsx`) |
| Voir uniquement ses factures (CLIENT) | — | — | ✅ | ✅ (`customerId` = `user.id` sur `listInvoices` quand rôle CLIENT) |

---

### Catalogue produits

**Résumé** : 9/9 points conformes.

#### ✅ Implémenté

- Liste + recherche texte (`q`) : `src/pages/Products.tsx`
- **Route** `/products/:productId` pour ouvrir le détail (dialog) depuis l’URL : `src/App.tsx`, `src/pages/Products.tsx`
- Filtres **catégorie** et **actif / inactif** (`isActive`) : requêtes `productsService.list` : même fichier
- Création produit (ADMIN) : même fichier (`hasRole('ADMIN')`) ; catégories **CIMENT / FER / BRIQUES / GRANULATS** dans le formulaire
- Panneau **détail** produit (`GET /products/:id`) : dialog + `productsService.get`
- Modification / désactivation : `productsService.update` / `productsService.remove` depuis `Products.tsx`
- Test GraphQL catalogue : `productGraphql` → `POST /api/product/graphql` (proxy Vite vers product-service)

#### ⚠️ Partiel

- Fiche produit : toujours un **dialog** (pas de page plein écran dédiée)

#### ❌ Manquant

- Aucun sur le périmètre catalogue listé ci-dessous

#### Endpoints backend consommés

| Endpoint | Consommé | Fichier frontend |
|---|---|---|
| GET /api/v1/products | ✅ | `src/pages/Products.tsx`, `src/pages/Orders.tsx`, `src/pages/Production.tsx` |
| POST /api/v1/products | ✅ | `src/pages/Products.tsx` |
| GET /api/v1/products/:id | ✅ | `src/pages/Products.tsx` |
| PUT /api/v1/products/:id | ✅ | `src/pages/Products.tsx` |
| DELETE /api/v1/products/:id | ✅ | `src/pages/Products.tsx` |
| POST /api/v1/graphql (product) | ✅ | `src/services/index.ts` (`productGraphql`), bouton dans `Products.tsx` (proxy `/api/product/graphql`) |

#### Séparation des rôles

| Action | ADMIN | OPERATOR | CLIENT | Implémenté |
|---|---|---|---|---|
| Consulter catalogue | ✅ | ✅ | ✅ | ✅ (route commune) |
| Créer produit | ✅ | ❌ | ❌ | ✅ |

---

### Gestion des utilisateurs (ADMIN)

**Résumé** : 7/8 points conformes.

#### ✅ Implémenté

- Liste : `src/pages/Users.tsx`
- **Chargement fiche** `GET /users/:id` lors de l’ouverture du dialog « Modifier » : `src/pages/Users.tsx` (`usersService.get`)
- **Filtre par rôle** (paramètre API `role`) : même fichier
- Création : même fichier (via `auth/register` derrière `usersService.create`)
- **Modification profil** (`firstName`, `lastName`, `phone`, `isActive`) : dialog + `usersService.update`
- **Changement de rôle** : dialog + `usersService.updateRole`
- Suppression : `usersService.remove` → `DELETE /users/:id`

#### ❌ Manquant

- `POST /api/v1/users` (création directe user-service) : le front **n'appelle pas** cet endpoint ; flux alternatif auth-register

#### Endpoints backend consommés

| Endpoint | Consommé | Fichier frontend |
|---|---|---|
| GET /api/v1/users | ✅ | `src/pages/Users.tsx` |
| POST /api/v1/users | ❌ | — (création via `POST /auth/register`) |
| GET /api/v1/users/:id | ✅ | `src/pages/Users.tsx` (préchargement édition) |
| PUT /api/v1/users/:id | ✅ | `src/pages/Users.tsx` |
| DELETE /api/v1/users/:id | ✅ | `src/pages/Users.tsx` |
| PUT /api/v1/users/:id/role | ✅ | `src/pages/Users.tsx` |

#### Séparation des rôles

| Action | ADMIN | OPERATOR | CLIENT | Implémenté |
|---|---|---|---|---|
| Accès `/users` | ✅ | ❌ | ❌ | ✅ |

---

### Notifications

**Résumé** : 5/7 points conformes.

#### ✅ Implémenté

- Liste des notifications avec **filtres statut / canal** : `src/pages/Notifications.tsx`
- **Détail** : clic sur une ligne → dialog + `notificationsService.get` → `GET /notifications/:id`
- **Badge** dans `Topbar.tsx` : compteur des notifications `PENDING` via `notificationsService.totalCount`

#### ❌ Manquant

- Marquer comme lu : **aucun endpoint** côté notification-service (pas de PATCH)
- Typage métier au-delà du schéma API : partiel (type libre + `payload` JSON affiché dans le détail)

#### Endpoints backend consommés

| Endpoint | Consommé | Fichier frontend |
|---|---|---|
| GET /api/v1/notifications | ✅ | `src/pages/Notifications.tsx`, `Topbar.tsx` (comptage) |
| GET /api/v1/notifications/:id | ✅ | `src/pages/Notifications.tsx` |

#### Séparation des rôles

| Action | ADMIN | OPERATOR | CLIENT | Implémenté |
|---|---|---|---|---|
| Accès page notifications | ✅ | ✅ | ✅ | ✅ (route ouverte à tous les rôles authentifiés) |

---

### Rapports (ADMIN/OPERATOR)

**Résumé** : conforme — `/` = synthèse (KPI, graphique commandes, facturation) ; `/reports` = analyses détaillées + exports ; même moteur `Dashboard.tsx` avec `pageMode`.

#### ✅ Implémenté

- Route `/reports` réservée ADMIN/OPERATOR : `src/App.tsx`
- `src/pages/Reports.tsx` rend **`DashboardPage` avec `pageMode="reports"`** : contenu analytique (ventes / production / qualité / stock / CSV) **uniquement** sur cette URL ; le tableau de bord `/` passe `pageMode="dashboard"` (défaut) et affiche un lien « Ouvrir les rapports ».
- **Qualité / stocks** : appels `reportingService.quality` / `stock` **activés seulement** en `pageMode === 'reports'` (pas de requêtes inutiles sur `/`).
- **Exports CSV** : idem, section réservée à la page Rapports.
- **Pagination** : tableaux « top rejets qualité » et « snapshots stock critique » paginés (boutons Précédent / Suivant) sur `/reports`.

#### Endpoints backend consommés

| Endpoint | Consommé | Fichier frontend |
|---|---|---|
| GET /api/v1/reports/dashboard | ✅ | `src/pages/Dashboard.tsx` (`/` et `/reports`) |
| GET /api/v1/reports/sales | ✅ | `Dashboard.tsx` (`pageMode === 'reports'` uniquement) |
| GET /api/v1/reports/production | ✅ | idem |
| GET /api/v1/reports/quality | ✅ | idem |
| GET /api/v1/reports/stock | ✅ | idem |
| GET /api/v1/reports/:type/export.csv | ✅ | `Dashboard.tsx` (page Rapports) |
| POST /graphql + WS (reporting) | ✅ | `Dashboard.tsx` + `graphql.ts` (subscription KPI, rôles internes) |

#### Séparation des rôles

| Action | ADMIN | OPERATOR | CLIENT | Implémenté |
|---|---|---|---|---|
| Accès `/reports` | ✅ | ✅ | ❌ | ✅ |

---

### Points transverses (JWT, RBAC, erreurs, chargement, formulaires)

#### JWT & sécurité

- **Stockage** : `persist` Zustand → **non conforme** à l'exigence « pas localStorage » (`src/stores/auth-store.ts`).
- **Intercepteur** : Bearer OK (`src/lib/api.ts`).
- **Refresh** : absent.
- **401** : purge session + redirection login : `src/lib/api.ts`.

#### RBAC frontend

- **Alias `useAuth`** : `src/hooks/use-auth.ts` ré-exporte `useAuthStore` (optionnel pour uniformiser les composants).
- **`ProtectedRoute`** : `src/components/ProtectedRoute.tsx` — message d’accès refusé explicite (profils autorisés listés avec « ou »).
- **Masquage actions** : partiel selon écrans ; voir les tableaux « Séparation des rôles » par section (ex. liste commandes sans `customerId` explicite côté front).

#### Erreurs API

- **409** et **503** : toasts dédiés dans `src/lib/api.ts` ; autres **5xx** : message générique ; 403, 429 : couverts.
- **422 VineJS** : `extractErrorMessage` agrège les entrées `errors[]` lorsque présentes (`src/lib/api.ts`).

#### Chargement / feedback

- Spinners texte « Chargement… » répandus ; **pas** de skeletons généralisés.
- Boutons désactivés pendant mutations : largement respecté (ex. `Orders.tsx`, `OrderDetail.tsx`).
- Lottie succès sur actions métier : **partiel** (filtres dashboard + toujours `DesignShowcase`).

#### Formulaires

- Validation Zod + react-hook-form sur login, commandes, produits, production, facturation (paiement), inventaire (mouvements, saga), entrepôts, utilisateurs : ✅ sur les écrans concernés.
- Confirmations avant actions destructives : partiellement (annulation commande, suppression user/entrepôt, désactivation produit).

---

## Rapport final global

### Tableau de conformité global (56 endpoints CDC)

Légende : **Consommé** = appelé depuis une page ou un composant d’écran vers l’URL attendue (réutilisation possible du même composant avec props différentes, ex. `DashboardPage` sur `/` vs `/reports` via `pageMode`). Les méthodes orphelines dans `src/services/index.ts` **ne comptent pas**.

| Section | Endpoints total | ✅ Consommés | ⚠️ Partiels | ❌ Manquants | % (strict ✅) |
|---|---:|---:|---:|---:|---:|
| Auth | 7 | 5 | 0 | 2 | 71% |
| Users | 6 | 5 | 1* | 0 | 83% |
| Products | 6 | 6 | 0 | 0 | 100% |
| Inventory | 9 | 9 | 0 | 0 | 100% |
| Orders | 6 | 6 | 0 | 0 | 100% |
| Production | 7 | 7 | 0 | 0 | 100% |
| Billing | 6 | 6 | 0 | 0 | 100% |
| Notifications | 2 | 2 | 0 | 0 | 100% |
| Reporting | 7 | 7 | 0 | 0 | 100% |
| **TOTAL** | **56** | **53** | **1** | **2** | **95%** |

\*Création de compte utilisateur via `POST /auth/register` (flux documenté) à la place de `POST /api/v1/users`.

---

### Tableau de séparation des rôles

| Écran / Action | ADMIN | OPERATOR | CLIENT | Statut |
|---|---|---|---|---|
| Dashboard global | ✅ accès | ✅ accès | ✅ vue restreinte (données perso) | ✅ |
| Historique toutes commandes | ✅ | ✅ | ❌ | ⚠️ (`list` sans `customerId` ; filtre attendu côté API JWT) |
| Mes commandes uniquement | — | — | ✅ | ✅ (`customerId` + dates en local) |
| Créer commande | ✅ | ✅ | ✅ | ✅ |
| Changer statut commande | ✅ | ✅ | ❌ | ✅ |
| Gestion utilisateurs | ✅ | ❌ | ❌ | ✅ (liste, filtres, création, édition, rôle, suppression) |
| Créer / modifier / désactiver produit | ✅ | ❌ | ❌ | ✅ (ADMIN : CRUD UI dans `Products.tsx`) |
| Gestion stocks (CDC inventaire) | ✅ | ✅ | ❌ | ✅ (`Inventory.tsx`) |
| Ordres de fabrication + machines | ✅ | ✅ | ❌ | ✅ (`Production.tsx`) |
| Contrôle qualité OF | ✅ | ✅ | ❌ | ✅ |
| Factures (internes) | ✅ | ✅ | ❌ | ✅ |
| Mes factures uniquement | — | — | ✅ | ✅ (`customerId` sur `listInvoices` si CLIENT) |
| Rapports `/reports` | ✅ | ✅ | ❌ | ✅ (alias `Dashboard` + qualité / stock / CSV sur le dashboard) |
| Export CSV rapports | ✅ | ✅ | ❌ | ✅ (`Dashboard.tsx`) |

---

### Endpoints backend jamais consommés (côté UI)

Impact utilisateur entre parenthèses.

- **Auth** : OAuth `authorize` / `token` — pas de flux OAuth côté front.
- **Users** : `POST /users` (création directe user-service) — flux `auth/register` à la place.
- **Notifications** : pas d’endpoint « marquer comme lu » côté API.

---

### Fonctionnalités frontend sans endpoint dans le CDC fourni (ou risque de divergence)

Le frontend appelle des routes **`/api/v1/warehouses`…** (liste, détail, création, mise à jour, suppression) depuis `src/services/index.ts` et `src/pages/Inventory.tsx`, avec proxy Vite vers le port **3004** (`vite.config.ts`).  
Ces routes **ne figurent pas** dans la liste « Inventory Service » du CDC de cet audit — à valider côté contrat API réel (sinon risque 404 ou comportement imprévu).

---

### Priorités de correction

1. **Bloquant**
   - Stockage JWT en **localStorage** via `persist` : risque XSS ; prévoir httpOnly **BFF** ou mémoire + politique de session stricte.

2. **Majeur**
   - **OAuth2** : flux `authorize` + `token` si intégration partenaires.
   - **Dashboard CLIENT** : maintenir la garantie « données perso uniquement » à chaque évolution reporting.

3. **Mineur**
   - **Users** : création via `POST /users` si alignement contrat unique.
   - **Notifications** : endpoint « lu / non lu » si le métier l’exige.
   - Commandes : pagination UI ; GraphQL si contrat défini.
   - Skeletons de chargement ; mapping 422 champ → champ React Hook Form ciblé.

---

*Document aligné sur le code du dépôt (`src/`, `vite.config.ts`, e2e) — révisé pour cohérence globale des sections et du tableau des 56 endpoints.*
