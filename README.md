# PDF Tools

A small two-container app: a FastAPI + PyMuPDF backend and a Next.js frontend
that proxies `/api/pdf/*` to it. Images are built and published to Docker Hub
by `.github/workflows/publish-api.yml` and `publish-web.yml` on every push to
`master`/`main` that touches `backend/` or `frontend/`.

## Building the images

There are two builds: one for local dev (built from `./backend` and
`./frontend` source), and one for prod (pulled from Docker Hub). After
building either, start/stop/manage the containers in Docker Desktop.

### Dev build (local source)

Uses `docker-compose.dev.yml` as an override to build `api` and `web` from
source:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml build
```

This produces `pdf-tools-api:local` and `pdf-tools-web:local`.

### Prod build (Docker Hub image)

Uses `docker-compose.yml` alone, which pulls the published images instead of
building. Set `DOCKERHUB_USERNAME` to the account the images are published
under (either export it, or put it in a `.env` file next to
`docker-compose.yml`):

```bash
export DOCKERHUB_USERNAME=your-dockerhub-username
docker compose build
```

This pulls `DOCKERHUB_USERNAME/pdf-tools-api:latest` and
`DOCKERHUB_USERNAME/pdf-tools-web:latest`.

On Windows, `run-local.cmd` / `stop-local.cmd` wrap the dev build + run
commands and also open http://localhost:8080 once the API health check
passes.

## CI-published images

Each push to `master`/`main` touching `backend/**` or `frontend/**` triggers
`publish-api.yml` / `publish-web.yml`, which call the reusable
`docker-publish.yml` workflow to build and push:

- `DOCKERHUB_USERNAME/pdf-tools-api`
- `DOCKERHUB_USERNAME/pdf-tools-web`

tagged with `latest` (on the default branch), the commit SHA, and any git
tag. These are exactly what `docker-compose.yml` pulls.
