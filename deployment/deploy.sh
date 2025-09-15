#!/bin/bash

# Tino 2 - Production Deployment Script
# This script handles automated deployment with health checks and rollback capabilities

set -e  # Exit on any error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOYMENT_ENV="${1:-production}"
FORCE_DEPLOY="${2:-false}"
BACKUP_BEFORE_DEPLOY="${3:-true}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Deployment timestamp
DEPLOYMENT_TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DEPLOYMENT_TAG="deploy_${DEPLOYMENT_TIMESTAMP}"

log_info "Starting Tino 2 deployment (${DEPLOYMENT_ENV}) at $(date)"
log_info "Deployment tag: ${DEPLOYMENT_TAG}"

# Function to check prerequisites
check_prerequisites() {
    log_info "Checking deployment prerequisites..."

    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi

    # Check if Docker Compose is available
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed or not in PATH"
        exit 1
    fi

    # Check if environment file exists
    if [[ ! -f "${SCRIPT_DIR}/.env" ]]; then
        log_error "Environment file not found: ${SCRIPT_DIR}/.env"
        log_info "Please copy .env.example to .env and configure your settings"
        exit 1
    fi

    # Check if Git is available (for versioning)
    if command -v git &> /dev/null; then
        GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
        GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
        log_info "Git commit: ${GIT_COMMIT} (${GIT_BRANCH})"
    fi

    log_success "Prerequisites check completed"
}

# Function to validate environment configuration
validate_environment() {
    log_info "Validating environment configuration..."

    source "${SCRIPT_DIR}/.env"

    # Check required environment variables
    REQUIRED_VARS=(
        "DATABASE_URL"
        "JWT_SECRET"
        "POSTGRES_PASSWORD"
        "REDIS_PASSWORD"
    )

    for var in "${REQUIRED_VARS[@]}"; do
        if [[ -z "${!var}" ]]; then
            log_error "Required environment variable ${var} is not set"
            exit 1
        fi
    done

    # Validate JWT secret strength
    if [[ ${#JWT_SECRET} -lt 32 ]]; then
        log_error "JWT_SECRET must be at least 32 characters long"
        exit 1
    fi

    # Check if production secrets are not using default values
    if [[ "$DEPLOYMENT_ENV" == "production" ]]; then
        if [[ "$POSTGRES_PASSWORD" == "secure_database_password_here" ]] || \
           [[ "$REDIS_PASSWORD" == "secure_redis_password_here" ]] || \
           [[ "$JWT_SECRET" == "your_super_secure_jwt_secret_key_minimum_256_bits" ]]; then
            log_error "Production deployment detected with default passwords/secrets"
            log_error "Please update all default values in .env file"
            exit 1
        fi
    fi

    log_success "Environment configuration validation completed"
}

# Function to backup current deployment
backup_current_deployment() {
    if [[ "$BACKUP_BEFORE_DEPLOY" != "true" ]]; then
        log_info "Skipping backup (disabled)"
        return 0
    fi

    log_info "Creating backup before deployment..."

    # Create backup directory
    BACKUP_DIR="${SCRIPT_DIR}/backups/${DEPLOYMENT_TIMESTAMP}"
    mkdir -p "$BACKUP_DIR"

    # Backup database
    if docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" ps postgres | grep -q "Up"; then
        log_info "Backing up PostgreSQL database..."
        docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" exec -T postgres pg_dump \
            -U "${POSTGRES_USER}" \
            -d "${POSTGRES_DB}" \
            --no-owner --no-privileges \
            > "${BACKUP_DIR}/database_backup.sql"

        if [[ $? -eq 0 ]]; then
            log_success "Database backup completed"
        else
            log_error "Database backup failed"
            exit 1
        fi
    fi

    # Backup uploaded files
    if docker volume ls | grep -q "deployment_backend_uploads"; then
        log_info "Backing up uploaded files..."
        docker run --rm \
            -v deployment_backend_uploads:/source \
            -v "${BACKUP_DIR}:/backup" \
            alpine:latest \
            tar czf /backup/uploads_backup.tar.gz -C /source .

        if [[ $? -eq 0 ]]; then
            log_success "Files backup completed"
        else
            log_warning "Files backup failed (non-critical)"
        fi
    fi

    # Save current Docker images info
    docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" images > "${BACKUP_DIR}/docker_images.txt"

    log_success "Backup completed in ${BACKUP_DIR}"
}

# Function to build Docker images
build_images() {
    log_info "Building Docker images..."

    # Set build arguments
    BUILD_ARGS=""
    if [[ -n "$GIT_COMMIT" ]]; then
        BUILD_ARGS="--build-arg GIT_COMMIT=${GIT_COMMIT}"
    fi

    # Build backend image
    log_info "Building backend image..."
    docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" build $BUILD_ARGS backend

    if [[ $? -ne 0 ]]; then
        log_error "Backend image build failed"
        exit 1
    fi

    # Build frontend image
    log_info "Building frontend image..."
    docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" build $BUILD_ARGS frontend

    if [[ $? -ne 0 ]]; then
        log_error "Frontend image build failed"
        exit 1
    fi

    log_success "Docker images built successfully"
}

# Function to run database migrations
run_migrations() {
    log_info "Running database migrations..."

    # Start database first
    docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" up -d postgres redis

    # Wait for database to be ready
    log_info "Waiting for database to be ready..."
    for i in {1..30}; do
        if docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" exec -T postgres pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" &> /dev/null; then
            log_success "Database is ready"
            break
        fi
        sleep 2
    done

    # Run migrations
    log_info "Executing database migrations..."
    docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" run --rm backend npm run db:migrate

    if [[ $? -ne 0 ]]; then
        log_error "Database migrations failed"
        exit 1
    fi

    log_success "Database migrations completed"
}

# Function to deploy services
deploy_services() {
    log_info "Deploying services..."

    # Deploy with rolling updates
    docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" up -d --remove-orphans

    if [[ $? -ne 0 ]]; then
        log_error "Service deployment failed"
        exit 1
    fi

    log_success "Services deployed successfully"
}

# Function to perform health checks
perform_health_checks() {
    log_info "Performing deployment health checks..."

    # Health check configuration
    MAX_ATTEMPTS=30
    WAIT_INTERVAL=10

    # Check backend health
    log_info "Checking backend health..."
    for i in $(seq 1 $MAX_ATTEMPTS); do
        if curl -f -s "http://localhost:3000/health" > /dev/null; then
            log_success "Backend health check passed"
            break
        fi

        if [[ $i -eq $MAX_ATTEMPTS ]]; then
            log_error "Backend health check failed after ${MAX_ATTEMPTS} attempts"
            show_service_logs "backend"
            return 1
        fi

        log_info "Attempt $i/$MAX_ATTEMPTS failed, waiting ${WAIT_INTERVAL}s..."
        sleep $WAIT_INTERVAL
    done

    # Check frontend health
    log_info "Checking frontend health..."
    for i in $(seq 1 $MAX_ATTEMPTS); do
        if curl -f -s "http://localhost:3001" > /dev/null; then
            log_success "Frontend health check passed"
            break
        fi

        if [[ $i -eq $MAX_ATTEMPTS ]]; then
            log_error "Frontend health check failed after ${MAX_ATTEMPTS} attempts"
            show_service_logs "frontend"
            return 1
        fi

        log_info "Attempt $i/$MAX_ATTEMPTS failed, waiting ${WAIT_INTERVAL}s..."
        sleep $WAIT_INTERVAL
    done

    # Check database connectivity
    log_info "Checking database connectivity..."
    if docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" exec -T postgres pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" > /dev/null; then
        log_success "Database connectivity check passed"
    else
        log_error "Database connectivity check failed"
        return 1
    fi

    # Check Redis connectivity
    log_info "Checking Redis connectivity..."
    if docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" exec -T redis redis-cli ping | grep -q "PONG"; then
        log_success "Redis connectivity check passed"
    else
        log_error "Redis connectivity check failed"
        return 1
    fi

    # Comprehensive API health check
    log_info "Performing comprehensive API health check..."
    HEALTH_RESPONSE=$(curl -s "http://localhost:3000/health")
    if echo "$HEALTH_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
        log_success "Comprehensive API health check passed"
    else
        log_error "Comprehensive API health check failed"
        log_error "Health response: $HEALTH_RESPONSE"
        return 1
    fi

    log_success "All health checks passed"
    return 0
}

# Function to show service logs for debugging
show_service_logs() {
    local service_name="$1"
    log_info "Showing recent logs for service: $service_name"
    docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" logs --tail=50 "$service_name"
}

# Function to cleanup old resources
cleanup_old_resources() {
    log_info "Cleaning up old Docker resources..."

    # Remove dangling images
    docker image prune -f

    # Remove unused volumes (be careful with this in production)
    if [[ "$FORCE_DEPLOY" == "true" ]]; then
        docker volume prune -f
    fi

    log_success "Cleanup completed"
}

# Function to tag successful deployment
tag_deployment() {
    if command -v git &> /dev/null && [[ -d "${PROJECT_ROOT}/.git" ]]; then
        log_info "Tagging successful deployment..."
        cd "$PROJECT_ROOT"
        git tag -a "$DEPLOYMENT_TAG" -m "Production deployment at $(date)"
        log_success "Deployment tagged as: $DEPLOYMENT_TAG"
    fi
}

# Function to show deployment summary
show_deployment_summary() {
    log_success "=== DEPLOYMENT COMPLETED SUCCESSFULLY ==="
    log_info "Deployment Environment: $DEPLOYMENT_ENV"
    log_info "Deployment Timestamp: $DEPLOYMENT_TIMESTAMP"
    log_info "Deployment Tag: $DEPLOYMENT_TAG"

    if [[ -n "$GIT_COMMIT" ]]; then
        log_info "Git Commit: $GIT_COMMIT ($GIT_BRANCH)"
    fi

    log_info "Backend URL: http://localhost:3000"
    log_info "Frontend URL: http://localhost:3001"
    log_info "Health Check: http://localhost:3000/health"

    if [[ "$BACKUP_BEFORE_DEPLOY" == "true" ]]; then
        log_info "Backup Location: ${SCRIPT_DIR}/backups/${DEPLOYMENT_TIMESTAMP}"
    fi

    log_info "To view logs: docker-compose -f ${SCRIPT_DIR}/docker-compose.yml logs -f"
    log_info "To rollback: ./rollback.sh $DEPLOYMENT_TIMESTAMP"
}

# Function to handle deployment failure
handle_deployment_failure() {
    log_error "Deployment failed. Initiating automated rollback..."

    # Show logs for debugging
    log_info "Recent service logs:"
    docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" logs --tail=20

    # Offer rollback option
    if [[ "$BACKUP_BEFORE_DEPLOY" == "true" ]] && [[ -d "${SCRIPT_DIR}/backups/${DEPLOYMENT_TIMESTAMP}" ]]; then
        read -p "Would you like to rollback to the previous deployment? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            log_info "Initiating rollback..."
            "${SCRIPT_DIR}/rollback.sh" "$DEPLOYMENT_TIMESTAMP"
        fi
    fi

    exit 1
}

# Main deployment flow
main() {
    trap handle_deployment_failure ERR

    check_prerequisites
    validate_environment
    backup_current_deployment
    build_images
    run_migrations
    deploy_services

    if perform_health_checks; then
        cleanup_old_resources
        tag_deployment
        show_deployment_summary
    else
        handle_deployment_failure
    fi
}

# Run main function
main "$@"