#!/bin/bash

# Tino 2 - Production Rollback Script
# This script handles automated rollback to previous deployments

set -e  # Exit on any error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_TIMESTAMP="${1}"
FORCE_ROLLBACK="${2:-false}"

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

# Function to show usage
show_usage() {
    echo "Usage: $0 <backup_timestamp> [force]"
    echo ""
    echo "Examples:"
    echo "  $0 20250914_143022"
    echo "  $0 20250914_143022 force"
    echo ""
    echo "Available backups:"
    if [[ -d "${SCRIPT_DIR}/backups" ]]; then
        ls -la "${SCRIPT_DIR}/backups" | grep "^d" | awk '{print $9}' | grep -v "^\.$\|^\.\.$" || echo "  No backups found"
    else
        echo "  No backup directory found"
    fi
}

# Function to validate backup
validate_backup() {
    local backup_dir="${SCRIPT_DIR}/backups/${BACKUP_TIMESTAMP}"

    if [[ -z "$BACKUP_TIMESTAMP" ]]; then
        log_error "Backup timestamp is required"
        show_usage
        exit 1
    fi

    if [[ ! -d "$backup_dir" ]]; then
        log_error "Backup directory not found: $backup_dir"
        show_usage
        exit 1
    fi

    if [[ ! -f "${backup_dir}/database_backup.sql" ]]; then
        log_error "Database backup not found in: $backup_dir"
        exit 1
    fi

    log_success "Backup validation completed"
}

# Function to confirm rollback
confirm_rollback() {
    if [[ "$FORCE_ROLLBACK" == "force" ]]; then
        log_warning "Force rollback enabled - skipping confirmation"
        return 0
    fi

    log_warning "ROLLBACK OPERATION"
    log_warning "This will rollback the system to backup: $BACKUP_TIMESTAMP"
    log_warning "Current data may be lost!"
    echo ""

    read -p "Are you sure you want to proceed? (type 'yes' to confirm): " confirmation

    if [[ "$confirmation" != "yes" ]]; then
        log_info "Rollback cancelled by user"
        exit 0
    fi

    log_info "Rollback confirmed"
}

# Function to stop current services
stop_current_services() {
    log_info "Stopping current services..."

    docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" down

    if [[ $? -ne 0 ]]; then
        log_warning "Failed to stop some services (may not be running)"
    else
        log_success "Services stopped successfully"
    fi
}

# Function to backup current state before rollback
backup_current_state() {
    local current_backup_dir="${SCRIPT_DIR}/backups/pre_rollback_$(date +"%Y%m%d_%H%M%S")"

    log_info "Creating backup of current state before rollback..."
    mkdir -p "$current_backup_dir"

    # Start database for backup
    docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" up -d postgres redis

    # Wait for database
    sleep 10

    # Backup current database
    if docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" ps postgres | grep -q "Up"; then
        log_info "Backing up current database state..."
        docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" exec -T postgres pg_dump \
            -U "${POSTGRES_USER}" \
            -d "${POSTGRES_DB}" \
            --no-owner --no-privileges \
            > "${current_backup_dir}/database_backup.sql"

        if [[ $? -eq 0 ]]; then
            log_success "Current state backup completed"
        else
            log_warning "Current state backup failed (continuing with rollback)"
        fi
    fi

    # Stop services again
    docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" down
}

# Function to restore database
restore_database() {
    local backup_dir="${SCRIPT_DIR}/backups/${BACKUP_TIMESTAMP}"

    log_info "Restoring database from backup..."

    # Start database service
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

    # Drop and recreate database
    log_info "Recreating database..."
    docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" exec -T postgres psql -U "${POSTGRES_USER}" -d postgres -c "DROP DATABASE IF EXISTS ${POSTGRES_DB};"
    docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" exec -T postgres psql -U "${POSTGRES_USER}" -d postgres -c "CREATE DATABASE ${POSTGRES_DB};"

    # Restore database backup
    log_info "Restoring database backup..."
    docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" < "${backup_dir}/database_backup.sql"

    if [[ $? -ne 0 ]]; then
        log_error "Database restore failed"
        exit 1
    fi

    log_success "Database restored successfully"
}

# Function to restore uploaded files
restore_uploaded_files() {
    local backup_dir="${SCRIPT_DIR}/backups/${BACKUP_TIMESTAMP}"
    local uploads_backup="${backup_dir}/uploads_backup.tar.gz"

    if [[ -f "$uploads_backup" ]]; then
        log_info "Restoring uploaded files..."

        # Remove current uploads volume
        docker volume rm deployment_backend_uploads 2>/dev/null || true

        # Create new volume and restore files
        docker run --rm \
            -v deployment_backend_uploads:/target \
            -v "${backup_dir}:/backup" \
            alpine:latest \
            tar xzf /backup/uploads_backup.tar.gz -C /target

        if [[ $? -eq 0 ]]; then
            log_success "Uploaded files restored successfully"
        else
            log_warning "Failed to restore uploaded files (non-critical)"
        fi
    else
        log_warning "No uploads backup found - skipping file restoration"
    fi
}

# Function to restore Docker images
restore_docker_images() {
    local backup_dir="${SCRIPT_DIR}/backups/${BACKUP_TIMESTAMP}"
    local images_info="${backup_dir}/docker_images.txt"

    if [[ -f "$images_info" ]]; then
        log_info "Docker images from backup:"
        cat "$images_info"
        log_warning "Manual intervention may be required to restore exact Docker images"
    fi
}

# Function to start services after rollback
start_services() {
    log_info "Starting services after rollback..."

    # Start all services
    docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" up -d

    if [[ $? -ne 0 ]]; then
        log_error "Failed to start services after rollback"
        exit 1
    fi

    log_success "Services started successfully"
}

# Function to perform health checks after rollback
perform_health_checks() {
    log_info "Performing health checks after rollback..."

    # Health check configuration
    MAX_ATTEMPTS=20
    WAIT_INTERVAL=10

    # Check backend health
    log_info "Checking backend health..."
    for i in $(seq 1 $MAX_ATTEMPTS); do
        if curl -f -s "http://localhost:3000/health" > /dev/null; then
            log_success "Backend health check passed"
            break
        fi

        if [[ $i -eq $MAX_ATTEMPTS ]]; then
            log_error "Backend health check failed after rollback"
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
            log_error "Frontend health check failed after rollback"
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
        log_error "Database connectivity check failed after rollback"
        return 1
    fi

    log_success "All health checks passed after rollback"
    return 0
}

# Function to show service logs
show_service_logs() {
    local service_name="$1"
    log_info "Showing recent logs for service: $service_name"
    docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" logs --tail=20 "$service_name"
}

# Function to show rollback summary
show_rollback_summary() {
    log_success "=== ROLLBACK COMPLETED SUCCESSFULLY ==="
    log_info "Rollback Timestamp: $(date)"
    log_info "Restored from Backup: $BACKUP_TIMESTAMP"
    log_info "Backend URL: http://localhost:3000"
    log_info "Frontend URL: http://localhost:3001"
    log_info "Health Check: http://localhost:3000/health"

    log_info "To view logs: docker-compose -f ${SCRIPT_DIR}/docker-compose.yml logs -f"
    log_info "Current state backed up to: pre_rollback_$(date +"%Y%m%d_%H%M%S")"
}

# Function to handle rollback failure
handle_rollback_failure() {
    log_error "Rollback failed!"

    # Show logs for debugging
    log_info "Recent service logs:"
    docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" logs --tail=20

    log_error "Manual intervention required"
    log_info "1. Check service logs: docker-compose logs"
    log_info "2. Check database connectivity"
    log_info "3. Verify backup integrity"
    log_info "4. Contact system administrator"

    exit 1
}

# Main rollback flow
main() {
    trap handle_rollback_failure ERR

    log_info "Starting rollback process..."

    # Load environment variables
    if [[ -f "${SCRIPT_DIR}/.env" ]]; then
        source "${SCRIPT_DIR}/.env"
    else
        log_error "Environment file not found: ${SCRIPT_DIR}/.env"
        exit 1
    fi

    validate_backup
    confirm_rollback
    stop_current_services
    backup_current_state
    restore_database
    restore_uploaded_files
    restore_docker_images
    start_services

    if perform_health_checks; then
        show_rollback_summary
    else
        handle_rollback_failure
    fi
}

# Run main function
main "$@"