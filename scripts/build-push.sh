#!/usr/bin/env bash
set -euo pipefail

# Configuration
REGISTRY="quay.io/rh-ai-community-plugins"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

usage() {
    cat <<EOF
Usage: $(basename "$0") [VERSION]

Build and push the kueue-visualizer container image to Quay.io.

Arguments:
  VERSION   Version tag for the image (e.g. 0.5.0, 0.5.0-rc1). If omitted,
            the next minor version is computed from existing git tags and you
            are prompted to confirm before proceeding.

Examples:
  $(basename "$0")           # Build+push, auto-version with confirmation
  $(basename "$0") 0.5.0     # Build+push with explicit version
EOF
}

# Image configuration
image_name="kueue-visualizer"
containerfile="Containerfile"
context="."

# Get the next semantic version tag
get_next_version() {
    local max_version="0.0.0"

    local remote_tags
    remote_tags=$(git ls-remote --tags origin 2>/dev/null | sed -nE 's|.*/(v?[0-9]+\.[0-9]+\.[0-9]+)$|\1|p' || true)

    if [[ -n "$remote_tags" ]]; then
        while IFS= read -r tag; do
            tag="${tag#v}"
            local major minor patch
            IFS='.' read -r major minor patch <<< "$tag"
            local max_major max_minor max_patch
            IFS='.' read -r max_major max_minor max_patch <<< "$max_version"

            if [[ "$major" -gt "$max_major" ]] || \
               [[ "$major" -eq "$max_major" && "$minor" -gt "$max_minor" ]] || \
               [[ "$major" -eq "$max_major" && "$minor" -eq "$max_minor" && "$patch" -gt "$max_patch" ]]; then
                max_version="$tag"
            fi
        done <<< "$remote_tags"
    fi

    local local_tags
    local_tags=$(git tag -l 'v?[0-9]*.[0-9]*.[0-9]*' 2>/dev/null || true)
    if [[ -n "$local_tags" ]]; then
        while IFS= read -r tag; do
            tag="${tag#v}"
            local major minor patch
            IFS='.' read -r major minor patch <<< "$tag"
            local max_major max_minor max_patch
            IFS='.' read -r max_major max_minor max_patch <<< "$max_version"

            if [[ "$major" -gt "$max_major" ]] || \
               [[ "$major" -eq "$max_major" && "$minor" -gt "$max_minor" ]] || \
               [[ "$major" -eq "$max_major" && "$minor" -eq "$max_minor" && "$patch" -gt "$max_patch" ]]; then
                max_version="$tag"
            fi
        done <<< "$local_tags"
    fi

    local major minor patch
    IFS='.' read -r major minor patch <<< "$max_version"
    echo "$major.$((minor + 1)).0"
}

# Check prerequisites
check_prerequisites() {
    local missing=0

    if ! command -v podman &> /dev/null; then
        log_error "podman is not installed or not in PATH"
        missing=1
    fi

    if [[ ! -f "${containerfile}" ]]; then
        log_error "Containerfile not found: ${containerfile}"
        missing=1
    fi

    if [[ ${missing} -eq 1 ]]; then
        exit 1
    fi
}

# Main
main() {
    local version="${1:-}"

    if [[ "${version}" == "-h" || "${version}" == "--help" ]]; then
        usage
        exit 0
    fi

    if [[ -z "${version}" ]]; then
        version=$(get_next_version)
        echo ""
        log_info "Proposed version: ${version}"
        read -rp "Proceed with version ${version}? [y/N] " confirm
        if [[ "${confirm}" != [yY] ]]; then
            log_warn "Aborted."
            exit 0
        fi
    fi

    local full_image="${REGISTRY}/${image_name}:${version}"

    echo ""
    echo "========================================"
    echo "  Container Image Build & Push"
    echo "========================================"
    echo ""
    log_info "Version: ${version}"
    log_info "Image:   ${full_image}"

    check_prerequisites

    log_info "Logging in to quay.io..."
    podman login quay.io

    log_info "Building image: ${full_image}"
    podman build -t "${full_image}" -f "${containerfile}" "${context}"
    log_success "Image built: ${full_image}"

    log_info "Pushing image: ${full_image}"
    podman push "${full_image}"
    log_success "Image pushed: ${full_image}"

    echo ""
    log_success "Done! Image pushed: ${full_image}"
}

main "$@"
