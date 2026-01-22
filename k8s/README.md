## Kubernetes Deployment

### Prerequisites
- Create secret `jackson-app-env` with required environment variables.
- Update image in `deployment.yaml` to your registry.

### Apply
```
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml
```
