#!/usr/bin/env bash
set -euo pipefail

# Configuration
IMAGE_TAG="${IMAGE_TAG:-latest}"
BUILDER="${BUILDER:-podman}"

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
Usage: $(basename "$0") [SEVERITY]

Build and scan the kueue-visualizer container image for vulnerabilities using Trivy.

Arguments:
  SEVERITY  Trivy severity filter (default: HIGH,CRITICAL)

Environment variables:
  IMAGE_TAG   Tag for the built image (default: latest)
  BUILDER     Container build tool (default: podman)

Examples:
  $(basename "$0")                   # Scan with HIGH,CRITICAL severity
  $(basename "$0") MEDIUM            # Scan with MEDIUM+ severity
  BUILDER=docker $(basename "$0")    # Use Docker instead of Podman
EOF
}

# Image configuration
image_name="kueue-visualizer"
containerfile="Containerfile"
context="."

# Check prerequisites
check_prerequisites() {
    local missing=0

    if ! command -v "${BUILDER}" &> /dev/null; then
        log_error "${BUILDER} is not installed or not in PATH"
        missing=1
    fi

    if ! command -v trivy &> /dev/null; then
        log_error "trivy is not installed or not in PATH"
        log_info "Install with: brew install aquasecurity/trivy/trivy"
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
    local severity="${1:-HIGH,CRITICAL}"

    if [[ "${severity}" == "-h" || "${severity}" == "--help" ]]; then
        usage
        exit 0
    fi

    local full_image="${image_name}:${IMAGE_TAG}"

    echo "============================================"
    echo "  Container Image Build & Vulnerability Scan"
    echo "============================================"
    echo ""
    log_info "Image:    ${full_image}"
    log_info "Builder:  ${BUILDER}"
    log_info "Severity: ${severity}"

    check_prerequisites

    log_info "Building image: ${full_image}"
    ${BUILDER} build -t "${full_image}" -f "${containerfile}" "${context}"
    log_success "Image built successfully: ${full_image}"

    echo ""
    log_info "Scanning image: ${full_image}"
    trivy image --severity "${severity}" --format table "${full_image}"

    local exit_code=$?
    echo ""
    if [[ ${exit_code} -eq 0 ]]; then
        log_success "No ${severity} vulnerabilities found."
    else
        log_error "Vulnerabilities detected (exit code: ${exit_code})"
        exit ${exit_code}
    fi
}

main "$@"
