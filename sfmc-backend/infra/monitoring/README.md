# Observabilité — Prometheus & Grafana

Ce dossier regroupe les artefacts nécessaires pour superviser la plateforme :

- `../k8s/prometheus-configmap.yaml` — scrape configs + règles d'alerting
- `grafana-dashboard.json` — dashboard "SFMC Bénin — Plateforme microservices"

## Prometheus

### Déploiement rapide avec le chart officiel

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

kubectl apply -f infra/k8s/prometheus-configmap.yaml

helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
  --namespace sfmc \
  --set prometheus.prometheusSpec.ruleSelectorNilUsesHelmValues=false \
  --set prometheus.prometheusSpec.additionalScrapeConfigsSecret.enabled=false \
  --set-file prometheus.prometheusSpec.additionalScrapeConfigs=./infra/k8s/prometheus-configmap.yaml
```

> Le `ConfigMap` défini dans `prometheus-configmap.yaml` est autonome : on peut
> aussi le monter directement via `--set prometheus.prometheusSpec.configMaps={prometheus-config}`.

### Règles d'alerte embarquées

| Alerte            | Déclencheur                                                    |
|-------------------|----------------------------------------------------------------|
| `ServiceDown`     | `up{job="sfmc-services"} == 0` pendant 2 minutes               |
| `HighLatencyP95`  | `http_request_duration_seconds` p95 > 2 s pendant 5 minutes    |
| `DLQNotEmpty`     | `rabbitmq_queue_messages_ready{queue="sfmc.dlq"} > 0` pendant 5 min |
| `QueueSaturation` | > 1000 messages prêts sur une queue pendant 10 minutes         |

Les labels `severity` (`critical|warning`) servent au routage Alertmanager.

### Exporters requis

- **RabbitMQ** — activer le plugin Prometheus (`rabbitmq-plugins enable rabbitmq_prometheus`)
  expose automatiquement `:15692/metrics`. Le StatefulSet peut être patché pour
  inclure le plugin (rabbitmq:3-management-alpine l'embarque mais désactivé).
- **Redis** — déployer `oliver006/redis_exporter` en sidecar ou en Deployment
  séparé, écoute sur `:9121`.
- **Services AdonisJS** — exposer `/metrics` via un middleware `prom-client`
  (à câbler en Sprint futur si besoin de métriques applicatives).

## Grafana

### Importer le dashboard

1. Dans Grafana, menu **Dashboards → New → Import**.
2. Uploader `infra/monitoring/grafana-dashboard.json`.
3. Sélectionner la data source Prometheus (celle qui scrape les règles ci-dessus).
4. Valider : le dashboard "SFMC Bénin — Plateforme microservices" apparaît avec
   deux sections :
   - **Golden Signals** — request rate, error rate, latency p95, CPU/mémoire.
   - **RabbitMQ** — panneau stat DLQ (rouge si > 0), backlog par queue, publish /
     deliver rate, unacked messages.

### Provisionning automatique

Pour déployer avec le chart `grafana`, ajouter le JSON dans un ConfigMap :

```bash
kubectl create configmap sfmc-grafana-dashboard \
  --from-file=grafana-dashboard.json=infra/monitoring/grafana-dashboard.json \
  -n sfmc \
  --dry-run=client -o yaml | kubectl apply -f -
```

Puis lier `grafana.dashboards.default` à ce ConfigMap dans les values Helm.

## Tests manuels DLQ

Pour générer un message routé en DLQ, publier un payload invalide sur
n'importe quelle queue `sfmc.<service>` :

```bash
docker exec -it sfmc-rabbitmq rabbitmqadmin publish \
  exchange=sfmc.events \
  routing_key=order.created \
  payload='{invalid json'
```

Après les retries (1 s / 5 s / 30 s) le message atterrit dans `sfmc.dlq` et
l'alerte `DLQNotEmpty` passe `firing` au bout de 5 minutes.
