# FakerJson

A free fake REST API for prototypes, demos, tests and tutorials: a friendlier
[JSONPlaceholder](https://jsonplaceholder.typicode.com/) with realistic data from
[Faker](https://fakerjs.dev/). No database. Every row is generated on demand from a seed.

- **Live:** [fakerjson.com](https://fakerjson.com) · **Docs:** [/docs](https://fakerjson.com/docs) (Swagger UI) ·
  **OpenAPI:** `/openapi.json`, `/openapi.yaml` · **API index:** `/v1`
- **Stack:** NestJS 12 on the Node adapter (`@nestjs/platform-node`), `@nestjs/swagger`,
  `@nestjs/cache-manager` (memory + Redis), `@nestjs/throttler` (Redis-backed), `@nestjs/terminus`, Pino.

## Resources

18 resources in four families. Each family is a Swagger tag prefix (`Classic · Users`, `E-commerce · Products`, …),
and `x-tagGroups` groups them in Redoc, Scalar and Stoplight.

| Family | Resource | Rows | Nested under |
| --- | --- | ---: | --- |
| Classic | `users` | 100 | |
| | `posts` | 1,000 | `/users/{id}/posts` |
| | `comments` | 5,000 | `/posts/{id}/comments` |
| | `albums` | 500 | `/users/{id}/albums` |
| | `photos` | 5,000 | `/albums/{id}/photos` |
| | `todos` | 2,000 | `/users/{id}/todos` |
| E-commerce | `categories` | 20 | |
| | `products` | 500 | `/categories/{id}/products` |
| | `reviews` | 2,500 | `/products/{id}/reviews` |
| | `carts` | 100 | `/users/{id}/carts` |
| | `orders` | 1,000 | `/users/{id}/orders` |
| Business | `companies` | 50 | |
| | `employees` | 1,000 | `/companies/{id}/employees` |
| | `invoices` | 1,000 | `/companies/{id}/invoices` |
| | `transactions` | 5,000 | `/companies/{id}/transactions` |
| Social | `articles` | 500 | `/users/{id}/articles` |
| | `notifications` | 2,000 | `/users/{id}/notifications` |
| | `messages` | 5,000 | `/users/{id}/messages` |

Relations are real: `posts.userId` points at an existing user, an order's lines are priced from the
actual products, a product's `rating` is the average of its reviews, and employees have a working
`managerId` reporting line.

## Using the API

Every resource has the same shape:

| Method | Path | Result |
| --- | --- | --- |
| `GET` | `/v1/{resource}` | 200, paginated list |
| `GET` | `/v1/{resource}/{id}` | 200, or 404 |
| `POST` | `/v1/{resource}` | 201 + `Location`, or 422 |
| `PUT` | `/v1/{resource}/{id}` | 200 (full replace), 404 or 422 |
| `PATCH` | `/v1/{resource}/{id}` | 200 (partial update), 404 or 422 |
| `DELETE` | `/v1/{resource}/{id}` | 204 or 404 |

Writes are **validated and answered realistically but never stored**, like JSONPlaceholder.
Server-owned fields (`id`, timestamps, slugs, totals) are computed by the server; if you send them
back (GET → edit → PUT) they are ignored. Unknown fields are rejected.

### Query parameters

```http
GET /v1/posts?page=2&limit=10                   # pagination (limit ≤ 100)
GET /v1/posts?status=published&views_gte=1000   # filters, ranges (_gte/_lte), negation (_ne)
GET /v1/posts?status=draft,archived             # any of several values
GET /v1/posts?q=lorem                           # case-insensitive search
GET /v1/posts?sort=-views,title                 # sort, - for descending
GET /v1/posts?fields=id,title                   # sparse fieldsets
GET /v1/posts/1?expand=user                     # embed related rows
GET /v1/users/3/posts                           # nested route (= ?userId=3, plus a 404 for unknown users)
GET /v1/users/1?seed=7                          # a different, equally stable dataset
GET /v1/users/1?locale=de                       # en, en_GB, en_IN, de, fr, es, it, nl, pl, sv, tr, pt_BR, ar, ja, ko, zh_CN
GET /v1/users/1?delay=1500                      # wait 1.5 s before answering
GET /v1/status/503                              # any status code, for error states
POST /v1/echo                                   # see what the server received
```

Lists return `{ data, meta, links }`, plus `X-Total-Count` and an RFC 8288 `Link` header.
Invalid parameters return 400, listing every problem at once. Unknown parameters are rejected,
except `_`-prefixed cache busters.

### Responses

- Errors are RFC 9457 `application/problem+json`, with a field-by-field `errors` array for 400/422.
- Reads carry `ETag` and `Cache-Control`, and `If-None-Match` returns 304.
- `X-Request-Id` is echoed or generated for every request.
- `X-Cache: HIT|MISS` shows whether the server-side cache answered.

### Rate limits (per client IP)

| Limit | Default | Headers |
| --- | --- | --- |
| Sustained | 300 requests / 60 s | `X-RateLimit-Limit`, `-Remaining`, `-Reset` |
| Burst | 25 requests / 1 s | `X-RateLimit-*-burst` |
| Writes | 60 / 60 s (POST/PUT/PATCH/DELETE) | `X-RateLimit-*-writes` |

A 429 carries `Retry-After`. Health probes are never limited.

## Architecture

```
request → helmet (CSP) → compression → conditional GET (ETag/304) → CORS
        → static landing page (public/, only for files that exist)
        → ThrottlerGuard (Redis counters, Lua, fail-open to memory)
        → RouteSpanInterceptor → DelayInterceptor → PaginationHeadersInterceptor → HttpCacheInterceptor
        → controller (generated per resource) → DatasetService
```

- **Deterministic data.** A row is `generate(faker.seed(hash(seed, resource, id)))` with a fixed reference
  date, so it is identical on every pod and after every restart. Children are laid out in contiguous id
  ranges (`posts` 1–10 belong to user 1), so nested routes and parent filters cost O(page).
- **Response cache.** cache-manager with two Keyv stores: per-pod memory (LRU) in front of shared Redis.
  Concurrent misses for one key run the handler once, and a Redis hit refills memory. Keys carry
  `DATA_VERSION` (in `src/data/locales.ts`); bump it when generators change.
- **Search, filter and sort** materialise the table once per (seed, locale, resource) in an in-process
  LRU (`DATASET_CACHE_SIZE`). The largest table takes about 0.2 s cold and a few ms after that.
- **Redis is optional and never a single point of failure.** Without `REDIS_URL` everything runs in
  memory. If Redis goes down, the cache misses through to the handler, rate limits fall back to
  per-pod memory, and `/health/ready` reports `degraded` but stays 200, so pods remain in rotation.

### Landing page

`web/` is a React 19 app built with [nuvui](https://nuvui.nuvraxis.com) components (`@nuvui/react`,
`@nuvui/chat` code blocks, `@nuvui/backgrounds`, `@nuvui/table`, `@nuvui/icons`). Vite builds it into
`public/`, and Nest serves it at `/`; there is no separate frontend deployment. It's a single page with a
live playground that calls the API on the same origin, so the default CSP (`'self'`) holds: fonts are
self-hosted and only the six Shiki grammars it shows are bundled. Hashed assets are cached for a year;
`index.html` revalidates on every load. The React packages are dev dependencies: they're bundled at
build time and pruned from the production image.

### Observability (OpenTelemetry)

`dist/instrumentation.js` is loaded with `node --import` before the app (the Docker `CMD` and
`pnpm start:prod` do this). It's inert unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set, and then exports over
OTLP using the standard `OTEL_*` variables (see `k8s/base/configmap.yaml`):

- **Traces:** incoming HTTP and Redis spans. The server span is renamed to its route template
  (`GET /v1/posts/:id`) with `http.route`, since the HTTP instrumentation can't see Nest's routes on the
  Node adapter. Spans carry `fakerjson.cache` (hit/miss/bypass), `fakerjson.seed` and `fakerjson.locale`.
  Building a full table shows up as a `dataset.materialize` child span. Probes, static assets and Swagger
  assets are not traced.
- **Metrics:** the HTTP server metrics plus `fakerjson.cache.lookups{result}`,
  `fakerjson.ratelimit.rejections` and `fakerjson.dataset.materialize.duration{resource}`.
- **Logs:** Pino JSON on stdout with `trace_id` and `span_id`, so logs and traces join up. Set
  `OTEL_LOGS_EXPORTER=otlp` to ship them over OTLP too.
- **Resource:** `service.name=fakerjson`, `service.version` from package.json, and the pod, namespace,
  node and deployment from the Kubernetes downward API.

Buffered telemetry is flushed on shutdown. An unreachable collector never affects requests.

### Adding a resource

Create `src/resources/<family>/<name>.resource.ts` with an entity class (field decorators from
`fields.ts` declare both the OpenAPI schema and the validation), `Create`/`Update` DTOs and a
`defineResource({...})` with `generate()`. Register it in `src/resources/index.ts`. The controller,
nested route, docs and tests come from that definition.

## Development

```bash
pnpm install
cp .env.example .env          # optional; without REDIS_URL everything runs in memory
pnpm start:dev                # API on http://localhost:3000 (docs at /docs)
pnpm dev:web                  # landing page with hot reload on http://localhost:5173 (proxies the API)
pnpm test                     # unit tests
pnpm test:e2e                 # end-to-end tests (every resource round-trips through its own validation)
pnpm lint && pnpm typecheck
pnpm build                    # API to dist/ and landing page to public/
pnpm start:prod               # what the container runs (with the OpenTelemetry loader)
pnpm openapi:export openapi.json   # e.g. to import into Postman
docker compose up --build     # API + Redis, like production
```

## Deploying to AKS

Manifests are in `k8s/base` (Kustomize): namespace (Pod Security `restricted`), ConfigMap,
Deployment (3 replicas, non-root, read-only root filesystem, startup/liveness/readiness probes,
zone and node spread), Service, HPA (3–12 pods on CPU), PDB, Ingress and NetworkPolicy.

### Image: GitHub Container Registry

[.github/workflows/ci.yaml](.github/workflows/ci.yaml) runs lint, typecheck, unit and e2e tests on every
push and PR. It then builds a multi-arch image (amd64 + arm64) with SBOM and provenance and pushes it to
`ghcr.io/sajanv88/fakerjson` with the built-in `GITHUB_TOKEN`, so there are no secrets to configure:

| Trigger | Tags |
| --- | --- |
| push to `main` | `main`, `sha-<short>` |
| tag `v1.2.3` | `1.2.3`, `1.2`, `latest` |
| pull request | built, not pushed |

```bash
git tag v1.0.0 && git push origin v1.0.0     # publishes ghcr.io/sajanv88/fakerjson:1.0.0
```

**Pull access from AKS.** The simplest option is to make the package public after the first push
(GitHub → profile or org → Packages → fakerjson → Package settings → Change visibility). The image
holds no secrets. To keep it private, create a pull secret with a token that has only `read:packages`,
then uncomment the `imagePullSecrets` patch in `k8s/base/kustomization.yaml`:

```bash
kubectl -n fakerjson create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io --docker-username=sajanv88 --docker-password=<token-with-read:packages>
```

### Deploy

```bash
# 1. Redis: Azure Cache for Redis recommended (TLS on 6380)
kubectl create namespace fakerjson
kubectl -n fakerjson create secret generic fakerjson-redis \
  --from-literal=REDIS_URL='rediss://:<access-key>@<name>.redis.cache.windows.net:6380'

# 2. Set the release tag (image ghcr.io/sajanv88/fakerjson and host fakerjson.com are already set), then apply
(cd k8s/base && kustomize edit set image fakerjson=ghcr.io/sajanv88/fakerjson:1.0.0)
kubectl apply -k k8s/base
```

Point DNS for `fakerjson.com` and `www.fakerjson.com` at the ingress controller's public IP. `www` redirects to the apex.

Checklist:

- **Client IP.** Rate limits are per client IP. Set `externalTrafficPolicy: Local` on the ingress
  controller's LoadBalancer Service so `X-Forwarded-For` carries the real client address.
  `TRUST_PROXY` (default: private ranges) decides whose `X-Forwarded-For` the app believes.
- **Ingress class.** `webapprouting.kubernetes.azure.com` is the AKS application routing add-on; use
  `nginx` for a self-managed ingress-nginx. The NetworkPolicy allows traffic from either namespace.
- **Shutdown.** On SIGTERM, readiness returns 503 for `SHUTDOWN_DELAY_MS` (5 s) so the ingress stops
  routing new requests, then the server drains, well within `terminationGracePeriodSeconds`.
- **Keep-alive.** `KEEP_ALIVE_TIMEOUT_MS` (65 s) is above ingress-nginx's 60 s upstream keep-alive, which
  avoids 502s from reused sockets.
- **Logs** are JSON on stdout (Pino) with the request id and trace id, so Container Insights or Loki
  picks them up as-is.
- **Telemetry.** Set `OTEL_EXPORTER_OTLP_ENDPOINT` in `k8s/base/configmap.yaml` to your collector's
  service. Traces are sampled at 10% (`OTEL_TRACES_SAMPLER_ARG`), and the NetworkPolicy allows 4317/4318 egress.

## Configuration

All settings are environment variables, validated at startup. See [.env.example](.env.example).

## License

[MIT](LICENSE) © 2026 sajanv88
