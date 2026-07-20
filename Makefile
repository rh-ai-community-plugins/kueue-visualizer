.DEFAULT_GOAL := help

# Container image settings
REGISTRY       ?= quay.io/rh-ai-community-plugins
IMAGE          ?= kueue-visualizer
VERSION        ?=
BUILDER        ?= podman
IMAGE_TAG      ?= latest
SEVERITY       ?= HIGH,CRITICAL

# ──────────────────────────────────────────────
# Install
# ──────────────────────────────────────────────

.PHONY: install

install: ## Install dependencies
	npm ci

# ──────────────────────────────────────────────
# Lint
# ──────────────────────────────────────────────

.PHONY: lint

lint: ## Lint source code (ESLint + markdownlint)
	npm run lint

# ──────────────────────────────────────────────
# Typecheck
# ──────────────────────────────────────────────

.PHONY: typecheck

typecheck: ## TypeScript type checking
	npm run typecheck

# ──────────────────────────────────────────────
# Test
# ──────────────────────────────────────────────

.PHONY: test test-coverage

test: ## Run tests
	npm test

test-coverage: ## Run tests with coverage report
	npm run test:coverage

# ──────────────────────────────────────────────
# Validate (typecheck + lint + test)
# ──────────────────────────────────────────────

.PHONY: validate

validate: ## Full validation: typecheck + lint + test
	npm run validate

# ──────────────────────────────────────────────
# Build
# ──────────────────────────────────────────────

.PHONY: build

build: ## Production build to dist/
	npm run build

# ──────────────────────────────────────────────
# Dev server
# ──────────────────────────────────────────────

.PHONY: dev

dev: ## Start frontend dev server (port 9500)
	npm run start:dev

# ──────────────────────────────────────────────
# Container image
# ──────────────────────────────────────────────

.PHONY: image-build image-push image-scan

image-build: ## Build container image
	$(BUILDER) build -t $(REGISTRY)/$(IMAGE):$(IMAGE_TAG) -f Containerfile .

image-push: ## Build and push container image (auto-versions from git tags if VERSION not set)
	./scripts/build-push.sh $(VERSION)

image-scan: ## Build and scan image for vulnerabilities
	BUILDER=$(BUILDER) IMAGE_TAG=$(IMAGE_TAG) ./scripts/scan-image.sh $(SEVERITY)

# ──────────────────────────────────────────────
# Helm chart
# ──────────────────────────────────────────────

.PHONY: chart-package chart-push

chart-package: ## Package Helm chart into a .tgz archive
	helm package chart/

chart-push: ## Package and push Helm chart to OCI registry (requires Helm 3.8+)
	$(eval CHART_TGZ := $(shell helm package chart/ | awk '{print $$NF}'))
	helm push $(CHART_TGZ) oci://$(REGISTRY)
	@rm -f $(CHART_TGZ)

# ──────────────────────────────────────────────
# Clean
# ──────────────────────────────────────────────

.PHONY: clean

clean: ## Remove build artifacts
	rm -rf dist/

# ──────────────────────────────────────────────
# Help
# ──────────────────────────────────────────────

.PHONY: help

help: ## Show this help
	@printf "\n\033[1mTargets:\033[0m\n"
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@printf "\n\033[1mVariables:\033[0m\n"
	@printf "  \033[33m%-20s\033[0m %s (default: %s)\n" "REGISTRY"  "Container image registry"             "$(REGISTRY)"
	@printf "  \033[33m%-20s\033[0m %s (default: %s)\n" "IMAGE"     "Image name"                           "$(IMAGE)"
	@printf "  \033[33m%-20s\033[0m %s (default: %s)\n" "VERSION"   "Release version for image-push"       "auto-computed from git tags"
	@printf "  \033[33m%-20s\033[0m %s (default: %s)\n" "BUILDER"   "Container build tool"                 "$(BUILDER)"
	@printf "  \033[33m%-20s\033[0m %s (default: %s)\n" "IMAGE_TAG" "Tag for image-build / image-scan"     "$(IMAGE_TAG)"
	@printf "  \033[33m%-20s\033[0m %s (default: %s)\n" "SEVERITY"  "Trivy severity filter for image-scan" "$(SEVERITY)"
	@printf "\n\033[1mExamples:\033[0m\n"
	@printf "  make validate                    # typecheck + lint + test\n"
	@printf "  make image-build                 # build container image locally\n"
	@printf "  make image-push VERSION=0.2.0    # build and push with explicit version\n"
	@printf "  make image-scan SEVERITY=MEDIUM  # scan with lower severity threshold\n"
	@printf "  make chart-push                  # package and push Helm chart to OCI registry\n"
	@printf "\n"
