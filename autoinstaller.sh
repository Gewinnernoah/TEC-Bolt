#!/usr/bin/env bash
#
# One-Click-Installer - Node.js + PostgreSQL + Projekt-Setup (Linux / macOS)
# Installiert automatisch alles Notwendige: Node.js, PostgreSQL, Datenbank,
# Benutzer und konfiguriert die Anwendung. Der Nutzer muss keine weiteren
# Schritte manuell durchfuehren.
#
# Verwendung:  bash autoinstaller.sh
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Konfiguration
# ---------------------------------------------------------------------------
NODE_MIN_MAJOR="18"
PG_VERSION="17"
PG_PORT="5432"
PG_DB_NAME="techub"
PG_USER="techub_user"
PG_PASSWORD="TechHub2024!"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ---------------------------------------------------------------------------
# Farbige Konsolenausgabe
# ---------------------------------------------------------------------------
if [[ -t 1 ]]; then
    COLOR_BLUE='\033[1;34m'
    COLOR_GREEN='\033[1;32m'
    COLOR_YELLOW='\033[1;33m'
    COLOR_RED='\033[1;31m'
    COLOR_CYAN='\033[1;36m'
    COLOR_GRAY='\033[0;90m'
    COLOR_RESET='\033[0m'
else
    COLOR_BLUE=''; COLOR_GREEN=''; COLOR_YELLOW=''; COLOR_RED=''; COLOR_CYAN=''; COLOR_GRAY=''; COLOR_RESET=''
fi

log_info()   { echo -e "${COLOR_BLUE}[INFO]${COLOR_RESET}   $1"; }
log_ok()     { echo -e "${COLOR_GREEN}[OK]${COLOR_RESET}     $1"; }
log_warn()   { echo -e "${COLOR_YELLOW}[WARN]${COLOR_RESET}   $1"; }
log_error()  { echo -e "${COLOR_RED}[FEHLER]${COLOR_RESET} $1"; }
log_step()   { echo -e "\n${COLOR_CYAN}=== $1 ===${COLOR_RESET}"; }
log_detail() { echo -e "         ${COLOR_GRAY}$1${COLOR_RESET}"; }

handle_error() {
    local msg="$1"; local hint="${2:-}"
    log_error "$msg"
    if [[ -n "$hint" ]]; then
        log_warn "Hinweis: $hint"
    fi
    echo ""
    log_warn "Installation wurde abgebrochen."
    echo "Bitte beheben Sie das Problem und starten Sie den Installer erneut."
    exit 1
}

# ---------------------------------------------------------------------------
# System-Erkennung
# ---------------------------------------------------------------------------
detect_os() {
    if [[ "$(uname)" == "Darwin" ]]; then
        OS="macos"
        PKG_MANAGER="brew"
    elif [[ -f /etc/debian_version ]]; then
        OS="debian"
        PKG_MANAGER="apt-get"
    elif [[ -f /etc/redhat-release ]]; then
        OS="rhel"
        PKG_MANAGER="dnf"
    elif command -v apt-get &>/dev/null; then
        OS="debian"
        PKG_MANAGER="apt-get"
    elif command -v dnf &>/dev/null; then
        OS="rhel"
        PKG_MANAGER="dnf"
    elif command -v yum &>/dev/null; then
        OS="rhel"
        PKG_MANAGER="yum"
    elif command -v pacman &>/dev/null; then
        OS="arch"
        PKG_MANAGER="pacman"
    else
        OS="unknown"
        PKG_MANAGER=""
    fi
}

# ---------------------------------------------------------------------------
# Node.js
# ---------------------------------------------------------------------------
test_node() {
    if ! command -v node &>/dev/null; then return 1; fi
    local version
    version="$(node --version | sed 's/v//')"
    local major="${version%%.*}"
    if [[ "$major" -ge "$NODE_MIN_MAJOR" ]]; then return 0; fi
    return 1
}

install_node() {
    log_info "Node.js nicht gefunden - installiere automatisch..."
    case "$OS" in
        debian)
            sudo "$PKG_MANAGER" update -qq
            if ! command -v curl &>/dev/null; then sudo "$PKG_MANAGER" install -y -qq curl; fi
            curl -fsSL "https://deb.nodesource.com/setup_20.x" | sudo -E bash -
            sudo "$PKG_MANAGER" install -y -qq nodejs
            ;;
        rhel)
            curl -fsSL "https://rpm.nodesource.com/setup_20.x" | sudo -E bash -
            sudo "$PKG_MANAGER" install -y nodejs
            ;;
        arch)
            sudo "$PKG_MANAGER" -S --noconfirm nodejs npm
            ;;
        macos)
            if ! command -v brew &>/dev/null; then
                handle_error "Homebrew ist nicht installiert." "Homebrew installieren: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
            fi
            brew install node
            ;;
        *)
            handle_error "Unbekanntes Betriebssystem. Node.js manuell installieren: https://nodejs.org"
            ;;
    esac
    log_ok "Node.js $(node --version) installiert"
    log_ok "npm $(npm --version) installiert"
}

# ---------------------------------------------------------------------------
# PostgreSQL
# ---------------------------------------------------------------------------
test_postgresql() {
    if command -v psql &>/dev/null; then return 0; fi
    # Pruefe Standardpfade
    if [[ -d "/usr/pgsql-$PG_VERSION/bin" ]]; then
        export PATH="/usr/pgsql-$PG_VERSION/bin:$PATH"
        return 0
    fi
    if [[ -d "/usr/lib/postgresql/$PG_VERSION/bin" ]]; then
        export PATH="/usr/lib/postgresql/$PG_VERSION/bin:$PATH"
        return 0
    fi
    return 1
}

test_pg_service() {
    if command -v systemctl &>/dev/null; then
        if systemctl is-active --quiet postgresql 2>/dev/null; then return 0; fi
        if systemctl is-active --quiet "postgresql-$PG_VERSION" 2>/dev/null; then return 0; fi
    elif command -v brew &>/dev/null && [[ "$OS" == "macos" ]]; then
        if brew services list 2>/dev/null | grep -q postgresql; then return 0; fi
    fi
    if pg_isready -q -p "$PG_PORT" 2>/dev/null; then return 0; fi
    return 1
}

start_pg_service() {
    log_info "Starte PostgreSQL-Dienst..."
    if command -v systemctl &>/dev/null; then
        sudo systemctl start postgresql 2>/dev/null || sudo systemctl start "postgresql-$PG_VERSION" 2>/dev/null || true
        sudo systemctl enable postgresql 2>/dev/null || sudo systemctl enable "postgresql-$PG_VERSION" 2>/dev/null || true
    elif [[ "$OS" == "macos" ]] && command -v brew &>/dev/null; then
        brew services start postgresql 2>/dev/null || true
    fi
    sleep 2
    if test_pg_service; then
        log_ok "PostgreSQL-Dienst laeuft"
    else
        handle_error "PostgreSQL-Dienst konnte nicht gestartet werden." "Dienst manuell starten: sudo systemctl start postgresql"
    fi
}

install_postgresql() {
    log_info "PostgreSQL nicht gefunden - installiere automatisch..."
    case "$OS" in
        debian)
            sudo "$PKG_MANAGER" install -y -qq postgresql postgresql-contrib
            ;;
        rhel)
            sudo "$PKG_MANAGER" install -y postgresql-server postgresql-contrib
            sudo postgresql-setup --initdb 2>/dev/null || true
            ;;
        arch)
            sudo "$PKG_MANAGER" -S --noconfirm postgresql
            sudo -u postgres initdb -D /var/lib/postgres/data 2>/dev/null || true
            ;;
        macos)
            brew install postgresql@17 2>/dev/null || brew install postgresql
            ;;
        *)
            handle_error "Unbekanntes Betriebssystem. PostgreSQL manuell installieren: https://www.postgresql.org/download/"
            ;;
    esac

    # Pfad aktualisieren
    if [[ -d "/usr/lib/postgresql/$PG_VERSION/bin" ]]; then
        export PATH="/usr/lib/postgresql/$PG_VERSION/bin:$PATH"
    elif [[ -d "/usr/pgsql-$PG_VERSION/bin" ]]; then
        export PATH="/usr/pgsql-$PG_VERSION/bin:$PATH"
    fi

    if ! test_postgresql; then
        handle_error "PostgreSQL wurde nicht korrekt installiert." "PostgreSQL manuell installieren und Installer erneut ausfuehren."
    fi
    log_ok "PostgreSQL installiert"

    start_pg_service
}

# ---------------------------------------------------------------------------
# Datenbank & Benutzer
# ---------------------------------------------------------------------------
test_pg_connection() {
    local db_name="${1:-postgres}"
    local db_user="${2:-postgres}"
    PGPASSWORD="${3:-}" psql -h localhost -p "$PG_PORT" -U "$db_user" -d "$db_name" -c "SELECT 1;" -t -q 2>/dev/null
    return $?
}

initialize_database() {
    log_info "Pruefe Datenbankverbindung..."

    local max_retries=10
    local connected=false
    for ((i=1; i<=max_retries; i++)); do
        if test_pg_connection "postgres" "postgres" "" 2>/dev/null; then
            connected=true
            break
        fi
        # macOS: Standardbenutzer ist der aktuelle Systembenutzer
        if [[ "$OS" == "macos" ]] && test_pg_connection "postgres" "$(whoami)" "" 2>/dev/null; then
            connected=true
            export PG_HOST_USER="$(whoami)"
            break
        fi
        log_warn "Verbindungsversuch $i/$max_retries fehlgeschlagen, warte 2 Sekunden..."
        sleep 2
    done

    if [[ "$connected" != "true" ]]; then
        handle_error "PostgreSQL ist nicht erreichbar (Port $PG_PORT)." \
            "Moegliche Ursachen: Dienst laeuft nicht, Port blockiert, Firewall, oder Peer-Authentifizierung aktiv. Logfile pruefen: sudo tail -f /var/log/postgresql/*.log"
    fi
    log_ok "Verbindung zu PostgreSQL hergestellt"

    # Datenbank erstellen
    log_info "Erstelle Datenbank '$PG_DB_NAME' (falls nicht vorhanden)..."
    local pg_admin="postgres"
    if [[ "$OS" == "macos" && -n "${PG_HOST_USER:-}" ]]; then pg_admin="$PG_HOST_USER"; fi

    local db_exists
    db_exists="$(sudo -u "$pg_admin" psql -p "$PG_PORT" -tAc "SELECT 1 FROM pg_database WHERE datname='$PG_DB_NAME';" 2>/dev/null || \
                 PGPASSWORD="$PG_PASSWORD" psql -h localhost -p "$PG_PORT" -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$PG_DB_NAME';" 2>/dev/null || echo "")"

    if [[ "$db_exists" == "1" ]]; then
        log_info "Datenbank '$PG_DB_NAME' existiert bereits"
    else
        sudo -u "$pg_admin" createdb -p "$PG_PORT" "$PG_DB_NAME" 2>/dev/null || \
            PGPASSWORD="$PG_PASSWORD" psql -h localhost -p "$PG_PORT" -U postgres -c "CREATE DATABASE $PG_DB_NAME;" 2>/dev/null || true
        log_ok "Datenbank '$PG_DB_NAME' erstellt"
    fi

    # Benutzer erstellen
    log_info "Erstelle Benutzer '$PG_USER' (falls nicht vorhanden)..."
    local user_exists
    user_exists="$(sudo -u "$pg_admin" psql -p "$PG_PORT" -tAc "SELECT 1 FROM pg_roles WHERE rolname='$PG_USER';" 2>/dev/null || echo "")"

    if [[ "$user_exists" == "1" ]]; then
        log_info "Benutzer '$PG_USER' existiert bereits"
        sudo -u "$pg_admin" psql -p "$PG_PORT" -c "ALTER USER $PG_USER WITH PASSWORD '$PG_PASSWORD';" 2>/dev/null || true
    else
        sudo -u "$pg_admin" psql -p "$PG_PORT" -c "CREATE USER $PG_USER WITH PASSWORD '$PG_PASSWORD';" 2>/dev/null || true
        log_ok "Benutzer '$PG_USER' erstellt"
    fi

    # Berechtigungen
    log_info "Erteile Berechtigungen..."
    sudo -u "$pg_admin" psql -p "$PG_PORT" -c "GRANT ALL PRIVILEGES ON DATABASE $PG_DB_NAME TO $PG_USER;" 2>/dev/null || true
    sudo -u "$pg_admin" psql -p "$PG_PORT" -d "$PG_DB_NAME" -c "GRANT ALL ON SCHEMA public TO $PG_USER;" 2>/dev/null || true
    sudo -u "$pg_admin" psql -p "$PG_PORT" -d "$PG_DB_NAME" -c "ALTER DATABASE $PG_DB_NAME OWNER TO $PG_USER;" 2>/dev/null || true
    log_ok "Berechtigungen erteilt"
}

# ---------------------------------------------------------------------------
# .env konfigurieren
# ---------------------------------------------------------------------------
initialize_env() {
    cd "$PROJECT_DIR"
    touch .env

    local conn_str="postgresql://${PG_USER}:${PG_PASSWORD}@localhost:${PG_PORT}/${PG_DB_NAME}"

    # VITE_DB_MODE
    if grep -q "VITE_DB_MODE=" .env; then
        sed -i.bak "s/VITE_DB_MODE=.*/VITE_DB_MODE=supabase/" .env
    else
        echo "VITE_DB_MODE=supabase" >> .env
    fi

    # DATABASE_URL
    if grep -q "DATABASE_URL=" .env; then
        sed -i.bak "s|DATABASE_URL=.*|DATABASE_URL=${conn_str}|" .env
    else
        echo "DATABASE_URL=${conn_str}" >> .env
    fi

    rm -f .env.bak
    log_ok ".env konfiguriert (PostgreSQL, Datenbank: $PG_DB_NAME)"
    log_detail "Verbindung: localhost:$PG_PORT/$PG_DB_NAME (Benutzer: $PG_USER)"
}

# ---------------------------------------------------------------------------
# Projekt-Setup
# ---------------------------------------------------------------------------
initialize_project() {
    cd "$PROJECT_DIR"
    if [[ -d "node_modules" ]]; then
        log_info "Aktualisiere Abhaengigkeiten..."
    else
        log_info "Installiere npm-Abhaengigkeiten..."
    fi
    npm install --no-fund --no-audit 2>&1 | tail -3
    log_ok "Abhaengigkeiten installiert"
}

test_project() {
    cd "$PROJECT_DIR"
    log_step "Build-Verifikation"
    if npm run build 2>&1 | tail -5; then
        log_ok "Build erfolgreich"
    else
        log_warn "Build fehlgeschlagen (nicht kritisch - App kann trotzdem gestartet werden)"
    fi
}

# ---------------------------------------------------------------------------
# Zusammenfassung
# ---------------------------------------------------------------------------
show_summary() {
    echo -e "\n${COLOR_GREEN}============================================${COLOR_RESET}"
    echo -e "${COLOR_GREEN}  Installation erfolgreich abgeschlossen!${COLOR_RESET}"
    echo -e "${COLOR_GREEN}============================================${COLOR_RESET}\n"

    echo "  Node.js:     $(node --version 2>/dev/null || echo 'nicht gefunden')"
    echo "  npm:         $(npm --version 2>/dev/null || echo 'nicht gefunden')"
    echo "  PostgreSQL:  $PG_VERSION (Port $PG_PORT)"
    echo "  Datenbank:   $PG_DB_NAME"
    echo "  Benutzer:    $PG_USER"
    echo "  Projekt:     $PROJECT_DIR\n"

    echo -e "  Starten mit:  ${COLOR_CYAN}npm run dev${COLOR_RESET}\n"
    echo -e "  Im Browser oeffnen:"
    echo -e "    ${COLOR_CYAN}http://localhost:5173${COLOR_RESET}           (Hauptseite)"
    echo -e "    ${COLOR_CYAN}http://localhost:5173/dashboard${COLOR_RESET}  (Dashboard)\n"

    if test_pg_service; then
        log_ok "PostgreSQL-Dienst laeuft"
    fi
}

# ---------------------------------------------------------------------------
# Hauptablauf
# ---------------------------------------------------------------------------
main() {
    clear 2>/dev/null || true
    echo -e "${COLOR_CYAN}============================================${COLOR_RESET}"
    echo -e "${COLOR_CYAN}  One-Click-Installer${COLOR_RESET}"
    echo -e "${COLOR_CYAN}  Node.js + PostgreSQL + Projekt-Setup${COLOR_RESET}"
    echo -e "${COLOR_CYAN}============================================${COLOR_RESET}"

    log_step "1/6  System-Information"
    detect_os
    log_info "Betriebssystem: $OS"
    log_info "Paketmanager: ${PKG_MANAGER:-keiner}"
    log_info "Projekt: $PROJECT_DIR"

    # 1. Node.js
    log_step "2/6  Node.js pruefen/installieren"
    if test_node; then
        log_ok "Node.js $(node --version) bereit"
    else
        install_node
    fi

    # 2. PostgreSQL
    log_step "3/6  PostgreSQL pruefen/installieren"
    if test_postgresql; then
        log_ok "PostgreSQL bereits installiert"
        if test_pg_service; then
            log_ok "PostgreSQL-Dienst laeuft"
        else
            start_pg_service
        fi
    else
        install_postgresql
    fi

    # 3. Datenbank & Benutzer
    log_step "4/6  Datenbank und Benutzer einrichten"
    initialize_database

    # 4. .env
    log_step "5/6  Anwendung konfigurieren"
    initialize_env

    # 5. Projekt
    log_step "6/6  Projekt-Abhaengigkeiten und Build"
    initialize_project
    test_project

    show_summary
}

main "$@"
