# SFMC Bénin

Backend microservices de la SFMC Bénin, basé sur AdonisJS 6, TypeScript, PostgreSQL, RabbitMQ, REST et GraphQL.

## Point d'entrée

- Présentation complète du projet: [PRESENTATION.md](PRESENTATION.md)
- Conception détaillée de l'architecture: [achitecture.md](achitecture.md)
- Rapports de sprint:
  - [SPRINT_0_REPORT.md](sfmc-backend/SPRINT_0_REPORT.md)
  - [SPRINT_1_REPORT.md](sfmc-backend/SPRINT_1_REPORT.md)
  - [SPRINT_2_REPORT.md](sfmc-backend/SPRINT_2_REPORT.md)
  - [SPRINT_3_REPORT.md](sfmc-backend/SPRINT_3_REPORT.md)
  - [SPRINT_4_REPORT.md](sfmc-backend/SPRINT_4_REPORT.md)

## Ce que couvre le projet

- Authentification et gestion des utilisateurs
- Catalogue produits
- Stocks et mouvements logistiques
- Commandes avec saga event-driven
- Production et contrôle qualité
- Facturation et paiements
- Notifications email et SMS
- Reporting CQRS et tableaux de bord
- Sécurité OWASP, health checks profonds et déploiement Kubernetes

## Architecture en bref

- 9 microservices
- 1 base PostgreSQL par service
- Communication synchrone via REST
- Communication asynchrone via RabbitMQ
- Reporting basé sur des projections CQRS
- Déploiement local via Docker Compose
- Déploiement cible via Docker multi-stage et Kubernetes

## Lancer le projet

Depuis `sfmc-backend/`:

```powershell
docker compose up -d
npm install
```

Puis, pour un service donné:

```powershell
cd services/<service-name>
node ace migration:run
node ace serve
```

## Tests

- Tests unitaires par service: `node ace test unit`
- Tests d'intégration: `node ace test integration`
- Smoke test saga / stock: `.\smoke_test_sprint2.ps1`
- Smoke test production / billing / notifications: `.\smoke_test_sprint3.ps1`
- Smoke test reporting / sécurité / déploiement: `.\smoke_test_sprint4.ps1`
- Vérification Brevo email: `.\test_email_brevo.ps1`

## Services

- `auth-service`
- `user-service`
- `product-service`
- `inventory-service`
- `order-service`
- `production-service`
- `billing-service`
- `notification-service`
- `reporting-service`

## État du projet

- Les sprints 0 à 4 sont documentés.
- Le document de présentation consolide les cas d'utilisation, acteurs, tables, scénarios, architecture et tests.
- Les scripts de smoke test permettent de valider le flux bout en bout sans relire toute l'implémentation.

