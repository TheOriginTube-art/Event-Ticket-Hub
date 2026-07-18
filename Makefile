# ДПС Радар — deployment helpers
#
# All targets that touch Docker must be run on the production server
# (or any host with Docker and the repo checked out).
#
# Quick-start:
#   make deploy          # pull → migrate → build → start → healthcheck

COMPOSE_FILE := deploy/docker-compose.yml
COMPOSE      := docker compose -f $(COMPOSE_FILE)

.PHONY: help deploy up down restart healthcheck migrate logs ps

help:
	@echo ""
	@echo "  ДПС Радар — Makefile targets"
	@echo ""
	@echo "  make deploy       Pull code, apply migrations, rebuild containers, run health check"
	@echo "  make up           Start containers (no rebuild)"
	@echo "  make down         Stop containers"
	@echo "  make restart      Restart containers without rebuild"
	@echo "  make healthcheck  Run post-deploy health check only"
	@echo "  make migrate      Apply pending database migrations only"
	@echo "  make logs         Follow API server logs"
	@echo "  make ps           Show container status"
	@echo ""

## Full deploy: pull → migrate → build → start → health check
deploy:
	bash deploy/update.sh

## Start containers (attach to existing images, no rebuild)
up:
	$(COMPOSE) up -d

## Stop and remove containers (data is preserved in Docker volumes)
down:
	$(COMPOSE) down

## Restart without rebuilding images
restart:
	$(COMPOSE) restart

## Run health check without redeploying
healthcheck:
	bash deploy/healthcheck.sh

## Apply pending database migrations
migrate:
	$(COMPOSE) --profile migrate run --rm migrate

## Follow API-server logs
logs:
	$(COMPOSE) logs -f api

## Show current container status
ps:
	$(COMPOSE) ps
