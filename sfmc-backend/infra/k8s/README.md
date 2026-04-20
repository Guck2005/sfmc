# SFMC Kubernetes manifests

Tous les objets sont déployés dans le namespace `sfmc` (voir `namespace.yaml`).

## Contenu

| Fichier                                   | Objet                                             |
|-------------------------------------------|---------------------------------------------------|
| `namespace.yaml`                          | `Namespace sfmc`                                  |
| `configmap.yaml`                          | Variables non sensibles (communes aux services)   |
| `secret.yaml`                             | Template de Secret (placeholders `${VAR}`)        |
| `redis-deployment.yaml`                   | Deployment + Service + PVC Redis (rate limiter)   |
| `rabbitmq-statefulset.yaml`               | StatefulSet + PVC + headless Service RabbitMQ     |
| `<service>-deployment.yaml` (×9)          | Deployment + Service par microservice             |
| `hpa.yaml`                                | Horizontal Pod Autoscalers                        |
| `apply-secrets.sh`                        | Rendu + `kubectl apply` de `secret.yaml`          |

## Secrets — flux CI/CD (sans Vault)

Le fichier `secret.yaml` contient des **placeholders** :

```yaml
stringData:
  JWT_SECRET: "${JWT_SECRET}"
  DB_PASSWORD: "${DB_PASSWORD}"
  APP_KEY: "${APP_KEY}"
```

Le script `apply-secrets.sh` substitue les variables d'environnement avec `envsubst`
puis applique la ressource.

### Secrets GitHub Actions à configurer

Dans *Settings → Secrets and variables → Actions* du repo :

- `JWT_SECRET_CI`  → mappé vers `JWT_SECRET`
- `DB_PASSWORD_CI` → mappé vers `DB_PASSWORD`
- `APP_KEY_CI`     → mappé vers `APP_KEY`
- `KUBECONFIG`     → kubeconfig encodé en base64, injecté par le job `deploy`

Le job `deploy` du workflow `.github/workflows/ci.yml` effectue :

```yaml
env:
  JWT_SECRET: ${{ secrets.JWT_SECRET_CI }}
  DB_PASSWORD: ${{ secrets.DB_PASSWORD_CI }}
  APP_KEY:    ${{ secrets.APP_KEY_CI }}
run: ./infra/k8s/apply-secrets.sh
```

### Exécution manuelle (poste admin)

```bash
export JWT_SECRET="…"
export DB_PASSWORD="…"
export APP_KEY="…"
./infra/k8s/apply-secrets.sh
```

Le script vérifie la présence des trois variables, applique le namespace, rend le
template puis exécute `kubectl apply`. Aucune valeur en clair n'est écrite sur disque
en dehors d'un fichier temporaire supprimé en `trap EXIT`.

## Ordre de déploiement recommandé

```bash
kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml
./apply-secrets.sh
kubectl apply -f redis-deployment.yaml
kubectl apply -f rabbitmq-statefulset.yaml
for f in *-deployment.yaml; do kubectl apply -f "$f"; done
kubectl apply -f hpa.yaml
```

## Rotation des secrets

1. Mettre à jour la valeur dans GitHub Actions.
2. Relancer le workflow `deploy` (`workflow_dispatch`).
3. Redémarrer les pods concernés :
   ```bash
   kubectl rollout restart deploy -n sfmc
   ```
