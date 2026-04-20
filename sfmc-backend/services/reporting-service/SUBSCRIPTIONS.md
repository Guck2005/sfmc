# GraphQL Subscriptions — reporting-service

Le reporting-service expose plusieurs abonnements GraphQL temps réel sur
le même port `3009` via le protocole `graphql-ws` (WebSocket).

## Schéma

```graphql
type Subscription {
  orderStatusUpdated: OrderStatusEvent!
  kpiUpdated: DashboardKPIs!
  productionOrderUpdated(id: ID!): ProductionOrderProgress!
  productionOrdersUpdated: ProductionOrderProgress!
}

type OrderStatusEvent {
  orderId: ID!
  status: String!
  updatedAt: String!
}

type ProductionOrderProgress {
  productionOrderId: ID!
  orderId: ID
  productId: ID!
  machineId: ID
  fromStatus: String
  toStatus: String!
  changedAt: String!
}
```

Les events sont publiés automatiquement par les listeners RabbitMQ après
chaque projection dans les tables `report_*` :
- `order.created`, `order.validated`, `order.cancelled`, `order.shipped`, `order.delivered`
- `invoice.created`
- `production.completed`, `production.quality_failed`
- **`production.status_changed`** (toutes les transitions, inclus `PLANNED → IN_PROGRESS → QUALITY_CHECK → COMPLETED|REJECTED`)

## URL

```
ws://<host>:3009/graphql
```

Le endpoint WebSocket partage le port HTTP `/graphql` : pas de port additionnel
à ouvrir en Ingress (il suffit que le path `/graphql` autorise l'upgrade
WebSocket — activé par défaut sur nginx, Traefik et la plupart des gateways).

## Exemple client (JavaScript / TypeScript)

```ts
import { createClient } from 'graphql-ws'

const client = createClient({
  url: 'ws://localhost:3009/graphql',
})

const unsubscribe = client.subscribe(
  {
    query: `subscription {
      orderStatusUpdated { orderId status updatedAt }
    }`,
  },
  {
    next: (msg) => console.log('update:', msg.data?.orderStatusUpdated),
    error: (err) => console.error(err),
    complete: () => console.log('stream closed'),
  }
)

// later
unsubscribe()
```

Pour le dashboard KPIs :

```ts
client.subscribe(
  { query: `subscription { kpiUpdated { totalOrders totalRevenue qualityFailureRate } }` },
  { next: (m) => setKpis(m.data?.kpiUpdated), error: console.error, complete: () => {} }
)
```

Pour suivre l'avancement d'un **ordre de fabrication spécifique** :

```ts
client.subscribe(
  {
    query: `subscription Watch($id: ID!) {
      productionOrderUpdated(id: $id) {
        productionOrderId fromStatus toStatus machineId changedAt
      }
    }`,
    variables: { id: 'po-uuid-here' },
  },
  { next: (m) => console.log(m.data?.productionOrderUpdated), error: console.error, complete: () => {} }
)
```

Ou pour un **flux global** des transitions (board opérateur) :

```ts
client.subscribe(
  {
    query: `subscription {
      productionOrdersUpdated {
        productionOrderId orderId toStatus machineId changedAt
      }
    }`,
  },
  { next: (m) => appendToBoard(m.data?.productionOrdersUpdated), error: console.error, complete: () => {} }
)
```

## Notes opérationnelles

- Le pub/sub est **in-process** : un seul pod reporting-service sert les
  souscriptions. Pour scaler horizontalement il faut soit
  (a) activer la sticky session sur l'Ingress pour le path `/graphql`, soit
  (b) remplacer le pubsub in-memory par un pubsub Redis (`graphql-redis-subscriptions`).
- La fréquence des events `kpiUpdated` est limitée par le débit des événements
  RabbitMQ projetés — typiquement 1 event / seconde en pointe.
- En cas de coupure WebSocket, `graphql-ws` côté client gère la reconnexion
  automatique ; les souscriptions sont re-souscrites.
