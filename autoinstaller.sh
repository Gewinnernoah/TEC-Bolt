#!/usr/bin/env bash
#
# Autoinstaller - Node.js + Projekt-Abhaengigkeiten + Datenbank-Setup
# Prueft ob Node.js installiert ist, installiert es falls noetig,
# richtet alle Projekt-Abhaengigkeiten ein, laesst den Benutzer die
# Datenbank auswaehlen (Supabase Cloud oder MongoDB Atlas) und
# verifiziert den Build.
#
# Verwendung:  ./autoinstaller.sh
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Konfiguration
# ---------------------------------------------------------------------------
NODE_MIN_MAJOR=18
NODE_MIN_MINOR=0
NPM_MIN_MAJOR=9
NPM_MIN_MINOR=0
NODE_VERSION="v20.18.0"
INSTALL_DIR="$HOME/.local"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Farben fuer die Ausgabe
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
CYAN='\033[0;36m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------
log_info()    { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_ok()      { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error()   { echo -e "${RED}[FEHLER]${NC} $1"; }
log_step()    { echo -e "\n${BOLD}=== $1 ===${NC}"; }

detect_os() {
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) echo "x64" ;;
    aarch64|arm64) echo "arm64" ;;
    armv7l) echo "armv7l" ;;
    *) log_error "Nicht unterstuetzte Architektur: $arch"; exit 1 ;;
  esac
}

detect_platform() {
  case "$(uname -s)" in
    Linux*)  echo "linux" ;;
    Darwin*) echo "darwin" ;;
    *) log_error "Nicht unterstuetztes Betriebssystem: $(uname -s)"; exit 1 ;;
  esac
}

version_ge() {
  local major1 minor1 major2 minor2
  major1="${1%%.*}"; minor1="${1#*.}"
  major2="${2%%.*}"; minor2="${2#*.}"
  [[ "$major1" -gt "$major2" ]] && return 0
  [[ "$major1" -eq "$major2" && "$minor1" -ge "$minor2" ]] && return 0
  return 1
}

check_node() {
  if ! command -v node &>/dev/null; then return 1; fi
  local version major minor
  version="$(node --version | sed 's/v//')"
  major="${version%%.*}"
  minor="${version#*.}"; minor="${minor%%.*}"
  if version_ge "${major}.${minor}" "${NODE_MIN_MAJOR}.${NODE_MIN_MINOR}"; then return 0; fi
  log_warn "Node.js Version ${version} gefunden, benoetigt >= ${NODE_MIN_MAJOR}.${NODE_MIN_MINOR}"
  return 1
}

check_npm() {
  if ! command -v npm &>/dev/null; then return 1; fi
  local version major minor
  version="$(npm --version)"
  major="${version%%.*}"
  minor="${version#*.}"; minor="${minor%%.*}"
  if version_ge "${major}.${minor}" "${NPM_MIN_MAJOR}.${NPM_MIN_MINOR}"; then return 0; fi
  log_warn "npm Version ${version} gefunden, benoetigt >= ${NPM_MIN_MAJOR}.${NPM_MIN_MINOR}"
  return 1
}

# ---------------------------------------------------------------------------
# Datenbank-Auswahl
# ---------------------------------------------------------------------------
select_database() {
  echo ""
  echo -e "${BOLD}Welche Datenbank moechtest du verwenden?${NC}"
  echo ""
  echo -e "  ${CYAN}1) Supabase (Cloud - PostgreSQL)${NC}"
  echo -e "     -> Hosted PostgreSQL mit Auth, Realtime, RLS"
  echo -e "     -> Benoetigt Supabase-Credentials in .env"
  echo -e "     -> Internetverbindung noetig"
  echo ""
  echo -e "  ${CYAN}2) MongoDB Atlas (Cloud - NoSQL)${NC}"
  echo -e "     -> Moderne NoSQL-Datenbank in der Cloud"
  echo -e "     -> Flexible Dokumenten-Struktur, horizontal skalierbar"
  echo -e "     -> Benoetigt MongoDB Atlas Data API URL + Key in .env"
  echo -e "     -> Internetverbindung noetig"
  echo ""
  read -rp "Auswahl [1-2] (Standard: 1): " choice
  choice="${choice:-1}"

  case "$choice" in
    1) DB_MODE="supabase" ;;
    2) DB_MODE="mongodb" ;;
    *) log_warn "Ungueltige Auswahl, verwende Supabase"; DB_MODE="supabase" ;;
  esac

  echo ""
  log_ok "Datenbank-Modus: ${DB_MODE}"
}

# ---------------------------------------------------------------------------
# Test-Accounts Auswahl
# ---------------------------------------------------------------------------
select_test_accounts() {
  echo ""
  echo -e "${BOLD}Test-Accounts erstellen?${NC}"
  echo -e "  Erstellt 3 Test-Benutzer (Admin, Staff, Teacher) mit bekannten Passwoertern."
  echo -e "  Die Zugangsdaten werden am Ende angezeigt."
  echo ""
  read -rp "Test-Accounts erstellen? [j/N]: " create_tests
  if [[ "${create_tests,,}" == "j" || "${create_tests,,}" == "ja" || "${create_tests,,}" == "y" || "${create_tests,,}" == "yes" ]]; then
    CREATE_TEST_ACCOUNTS=true
  else
    CREATE_TEST_ACCOUNTS=false
  fi
  echo ""
  if $CREATE_TEST_ACCOUNTS; then
    log_ok "Test-Accounts werden nach der Installation erstellt"
  else
    log_info "Keine Test-Accounts"
  fi
}

# ---------------------------------------------------------------------------
# .env-Datei erstellen
# ---------------------------------------------------------------------------
setup_env() {
  cd "$PROJECT_DIR"

  if [[ "$DB_MODE" == "mongodb" ]]; then
    if [[ -f ".env" ]] && grep -q "VITE_DB_MODE=mongodb" .env 2>/dev/null; then
      log_ok ".env bereits mit MongoDB konfiguriert"
    else
      log_info "Erstelle .env fuer MongoDB Atlas..."
      if [[ -f "src/lib/.env.example.mongodb" ]]; then
        cp src/lib/.env.example.mongodb .env
      else
        echo "# MongoDB Atlas Data API" > .env
        echo "VITE_DB_MODE=mongodb" >> .env
        echo "VITE_MONGODB_DATA_API_URL=https://data.mongodb-api.com/app/YOUR_APP_ID/endpoint/data/v1" >> .env
        echo "VITE_MONGODB_DATA_API_KEY=YOUR_DATA_API_KEY" >> .env
        echo "VITE_MONGODB_DATA_SOURCE=Cluster0" >> .env
        echo "VITE_MONGODB_DATABASE=techub" >> .env
      fi
      log_ok ".env erstellt (MongoDB-Modus)"
      log_warn "Bitte MongoDB Atlas Data API URL und Key eintragen!"
    fi
  else
    if [[ -f ".env" ]] && grep -q "VITE_SUPABASE_URL" .env 2>/dev/null && ! grep -q "DEINE\|dein-\|YOUR" .env 2>/dev/null; then
      if ! grep -q "VITE_DB_MODE" .env 2>/dev/null; then
        echo "" >> .env
        echo "VITE_DB_MODE=supabase" >> .env
      fi
      log_ok ".env gefunden (Supabase-Credentials vorhanden)"
    else
      log_info "Erstelle .env fuer Supabase..."
      if [[ -f "src/lib/.env.example" ]]; then
        cp src/lib/.env.example .env
      else
        echo "VITE_SUPABASE_URL=https://dein-projekt.supabase.co" > .env
        echo "VITE_SUPABASE_ANON_KEY=dein-anon-key" >> .env
      fi
      echo "" >> .env
      echo "VITE_DB_MODE=supabase" >> .env
      log_warn ".env erstellt. Bitte Supabase-Credentials eintragen!"
    fi
  fi
}

# ---------------------------------------------------------------------------
# Test-Accounts erstellen
# ---------------------------------------------------------------------------
run_test_accounts() {
  cd "$PROJECT_DIR"

  if ! $CREATE_TEST_ACCOUNTS; then return; fi

  log_step "Test-Accounts erstellen"

  # Pruefen ob .env Credentials enthaelt (nicht nur Platzhalter)
  local can_run=false
  if [[ "$DB_MODE" == "supabase" ]]; then
    if grep -q "VITE_SUPABASE_URL" .env 2>/dev/null && ! grep -q "DEINE\|dein-\|YOUR" .env 2>/dev/null; then
      can_run=true
    fi
  else
    if grep -q "VITE_MONGODB_DATA_API_URL" .env 2>/dev/null && ! grep -q "YOUR_APP_ID\|YOUR_DATA_API_KEY" .env 2>/dev/null; then
      can_run=true
    fi
  fi

  if ! $can_run; then
    log_warn "Test-Accounts koennen nicht erstellt werden: .env enthaelt noch Platzhalter."
    log_info "Bitte zuerst Credentials eintragen, dann ausfuehren:"
    echo -e "  ${BOLD}node scripts/create-test-accounts.mjs --${DB_MODE}${NC}"
    return
  fi

  if node scripts/create-test-accounts.mjs --"$DB_MODE" 2>&1; then
    log_ok "Test-Accounts erstellt"
  else
    log_warn "Test-Accounts konnten nicht erstellt werden (non-fatal)"
  fi
}

# ---------------------------------------------------------------------------
# Installation: Node.js (lokal, ohne sudo)
# ---------------------------------------------------------------------------
install_node() {
  local platform arch filename url
  platform="$(detect_platform)"
  arch="$(detect_os)"
  filename="node-${NODE_VERSION}-${platform}-${arch}.tar.xz"
  url="https://nodejs.org/dist/${NODE_VERSION}/${filename}"
  local tmpdir
  tmpdir="$(mktemp -d)"

  log_info "Lade Node.js ${NODE_VERSION} herunter (${platform}-${arch})..."
  if command -v curl &>/dev/null; then
    curl -fsSL -o "${tmpdir}/${filename}" "$url"
  elif command -v wget &>/dev/null; then
    wget -q -O "${tmpdir}/${filename}" "$url"
  else
    log_error "Weder curl noch wget gefunden. Bitte manuell installieren."
    rm -rf "$tmpdir"; exit 1
  fi

  log_info "Entpacke nach ${INSTALL_DIR}..."
  mkdir -p "$INSTALL_DIR"
  tar -xJf "${tmpdir}/${filename}" -C "$INSTALL_DIR" --strip-components=1
  rm -rf "$tmpdir"

  export PATH="${INSTALL_DIR}/bin:${PATH}"

  local rc_file
  for rc_file in "$HOME/.bashrc" "$HOME/.zshrc"; do
    if [[ -f "$rc_file" ]]; then
      if ! grep -q "${INSTALL_DIR}/bin" "$rc_file" 2>/dev/null; then
        echo "export PATH=\"${INSTALL_DIR}/bin:\$PATH\"" >> "$rc_file"
        log_info "PATH zu ${rc_file} hinzugefuegt"
      fi
    fi
  done

  log_ok "Node.js $(node --version) installiert"
  log_ok "npm $(npm --version) installiert"
}

# ---------------------------------------------------------------------------
# Projekt-Setup
# ---------------------------------------------------------------------------
setup_project() {
  cd "$PROJECT_DIR"
  if [[ -d "node_modules" ]]; then
    log_info "node_modules existiert bereits. Aktualisiere Abhaengigkeiten..."
  else
    log_info "Installiere alle npm-Abhaengigkeiten..."
  fi
  npm install --no-fund --no-audit
  log_ok "Abhaengigkeiten installiert ($(ls node_modules | wc -l) Packages)"
  export PATH="${PROJECT_DIR}/node_modules/.bin:${PATH}"
}

# ---------------------------------------------------------------------------
# Verifikation
# ---------------------------------------------------------------------------
verify_project() {
  cd "$PROJECT_DIR"

  log_step "Build"
  if npm run build 2>&1 | grep -q "built in"; then
    log_ok "Build erfolgreich"
  else
    log_warn "Build fehlgeschlagen (non-fatal)"
    npm run build 2>&1 | tail -5 || true
  fi
}

# ---------------------------------------------------------------------------
# Hauptablauf
# ---------------------------------------------------------------------------
main() {
  echo -e "${BOLD}"
  echo "============================================"
  echo "  Autoinstaller - Node.js + Projekt-Setup"
  echo "============================================"
  echo -e "${NC}"

  log_step "1/7  System-Information"
  log_info "OS:      $(uname -s) $(uname -m)"
  log_info "Projekt: $PROJECT_DIR"

  log_step "2/7  Node.js pruefen"
  if check_node; then
    log_ok "Node.js $(node --version) bereits installiert (erfuellt Minimum ${NODE_MIN_MAJOR}.${NODE_MIN_MINOR})"
  else
    log_info "Node.js nicht gefunden oder veraltet. Installiere lokal..."
    install_node
  fi

  log_step "3/7  npm pruefen"
  if check_npm; then
    log_ok "npm $(npm --version) bereit"
  else
    log_error "npm nicht verfuegbar. Installation konnte nicht abgeschlossen werden."
    exit 1
  fi

  log_step "4/7  Datenbank-Auswahl"
  select_database

  log_step "5/7  Test-Accounts"
  select_test_accounts

  log_step "6/7  Projekt-Abhaengigkeiten & .env"
  setup_project
  setup_env

  log_step "7/7  Verifikation & Test-Accounts"
  verify_project
  run_test_accounts

  echo ""
  echo -e "${GREEN}${BOLD}============================================${NC}"
  echo -e "${GREEN}${BOLD}  Installation abgeschlossen!${NC}"
  echo -e "${GREEN}${BOLD}============================================${NC}"
  echo ""
  echo -e "  Node.js:   $(node --version)"
  echo -e "  npm:       $(npm --version)"
  echo -e "  Projekt:   ${PROJECT_DIR}"
  echo -e "  Datenbank: ${BOLD}${DB_MODE}${NC}"
  echo ""

  if [[ "$DB_MODE" == "supabase" ]]; then
    if [[ ! -f ".env" ]] || grep -q "DEINE\|dein-\|YOUR" .env 2>/dev/null; then
      echo -e "${YELLOW}  Aktion noetig: .env mit Supabase-Credentials ausfuellen${NC}"
    fi
  else
    if [[ ! -f ".env" ]] || grep -q "YOUR_APP_ID\|YOUR_DATA_API_KEY" .env 2>/dev/null; then
      echo -e "${YELLOW}  Aktion noetig: .env mit MongoDB Atlas Credentials ausfuellen${NC}"
      echo -e "  1. MongoDB Atlas Cluster erstellen (kostenloser Tier verfuegbar)"
      echo -e "  2. Data API aktivieren: App Services > Data API"
      echo -e "  3. API URL und Key in .env eintragen"
    fi
  fi

  if $CREATE_TEST_ACCOUNTS && ! grep -q "YOUR\|DEINE\|dein-" .env 2>/dev/null; then
    echo -e "\n  ${BOLD}Test-Accounts erneut erstellen:${NC}"
    echo -e "  node scripts/create-test-accounts.mjs --${DB_MODE}"
  fi

  echo ""
  echo -e "  Starten mit:  ${BOLD}npm run dev${NC}"
  echo ""
}

main "$@"
