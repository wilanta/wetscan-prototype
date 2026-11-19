/** Controlled IaC inputs for physical scanner tests. Data only: never applied, built or executed. */
export function iacFixtures(vulnerable: boolean): Record<string, string> {
  return vulnerable
    ? {
        "k8s/deployment.yaml": `apiVersion: apps/v1
kind: Deployment
metadata:
  name: fixture
spec:
  replicas: 1
  selector:
    matchLabels:
      app: fixture
  template:
    metadata:
      labels:
        app: fixture
    spec:
      containers:
        - name: app
          image: nginx:latest
          securityContext:
            privileged: true
`,
        Dockerfile: `FROM node:latest
USER root
ADD . /app
CMD ["node", "/app/index.js"]
`,
      }
    : {
        "k8s/deployment.yaml": `apiVersion: apps/v1
kind: Deployment
metadata:
  name: fixture
  namespace: guarded
spec:
  replicas: 1
  selector:
    matchLabels:
      app: fixture
  template:
    metadata:
      labels:
        app: fixture
    spec:
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
        runAsGroup: 10001
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: app
          image: gcr.io/guarded/app@sha256:${"0".repeat(64)}
          imagePullPolicy: Always
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            runAsUser: 10001
            capabilities:
              drop: ["ALL"]
          resources:
            requests:
              cpu: 100m
              memory: 64Mi
            limits:
              cpu: 200m
              memory: 128Mi
`,
        Dockerfile: `FROM node:22.11.0-alpine3.20
RUN adduser -D -u 10001 app
COPY --chown=app:app index.js /app/index.js
USER app
HEALTHCHECK CMD node -e "process.exit(0)"
CMD ["node", "/app/index.js"]
`,
      };
}
