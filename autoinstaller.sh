#!/usr/bin/env bash
#
# Autoinstaller - Node.js + Projekt-Abhaengigkeiten + Datenbank-Setup
# Prueft ob Node.js installiert ist, installiert es falls noetig,
# richtet alle Projekt-Abhaengigkeiten ein, laesst den Benutzer die
# Datenbank auswaehlen (Supabase Cloud oder lokale SQLite) und
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

# Farben
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; CYAN='\033[0;36m'; NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[FEHLER]${NC} $1"; }
log_step()  { echo -e "\n${BOLD}=== $1 ===${NC}"; }

detect_os() {
  case "$(uname -m)" in x86_64|amd64) echo "x64";; aarch64|arm64) echo "arm64";; armv7l) echo "armv7l";; *) log_error "Architektur nicht unterstuetzt: $(uname -m)"; exit 1;; esac
}
detect_platform() {
  case "$(uname -s)" in Linux*) echo "linux";; Darwin*) echo "darwin";; *) log_error "OS nicht unterstuetzt: $(uname -s)"; exit 1;; esac
}
version_ge() {
  local m1 n1 m2 n2; m1="${1%%.*}"; n1="${1#*.}"; n1="${n1%%.*}"; m2="${2%%.*}"; n2="${2#*.}"; n2="${n2%%.*}"
  [[ "$m1" -gt "$m2" ]] && return 0; [[ "$m1" -eq "$m2" && "$n1" -ge "$n2" ]] && return 0; return 1
}
check_node() {
  command -v node &>/dev/null || return 1
  local v m n; v="$(node --version | sed 's/v//')"; m="${v%%.*}"; n="${v#*.}"; n="${n%%.*}"
  version_ge "${m}.${n}" "${NODE_MIN_MAJOR}.${NODE_MIN_MINOR}" && return 0
  log_warn "Node.js ${v} gefunden, benoetigt >= ${NODE_MIN_MAJOR}.${NODE_MIN_MINOR}"; return 1
}
check_npm() {
  command -v npm &>/dev/null || return 1
  local v m n; v="$(npm --version)"; m="${v%%.*}"; n="${v#*.}"; n="${n%%.*}"
  version_ge "${m}.${n}" "${NPM_MIN_MAJOR}.${NPM_MIN_MINOR}" && return 0
  log_warn "npm ${v} gefunden, benoetigt >= ${NPM_MIN_MAJOR}.${NPM_MIN_MINOR}"; return 1
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
  echo -e "  ${CYAN}2) SQLite (Lokal - Offline)${NC}"
  echo -e "     -> Datenbank laeuft direkt im Browser (WASM)"
  echo -e "     -> Keine Internetverbindung noetig"
  echo -e "     -> Daten bleiben im Browser gespeichert (IndexedDB)"
  echo -e "     -> Keine Konfiguration noetig"
  echo ""
  read -rp "Auswahl [1-2] (Standard: 2): " choice
  choice="${choice:-2}"

  case "$choice" in
    1) DB_MODE="supabase" ;;
    2) DB_MODE="sqlite" ;;
    *) log_warn "Ungueltige Auswahl, verwende SQLite"; DB_MODE="sqlite" ;;
  esac
  echo ""; log_ok "Datenbank-Modus: ${DB_MODE}"
}

# ---------------------------------------------------------------------------
# Test-Accounts Auswahl
# ---------------------------------------------------------------------------
select_test_accounts() {
  echo ""
  echo -e "${BOLD}Test-Accounts erstellen?${NC}"
  echo -e "  Zeigt 3 Test-Zugaenge (Admin, Staff, Teacher) mit Passwoertern an."
  if [[ "$DB_MODE" == "sqlite" ]]; then
    echo -e "  ${YELLOW}(SQLite: Zugangsdaten werden angezeigt, Registrierung in der App)${NC}"
  else
    echo -e "  ${YELLOW}(Supabase: Accounts werden automatisch erstellt)${NC}"
  fi
  echo ""
  read -rp "Test-Accounts anzeigen/erstellen? [j/N]: " create_tests
  if [[ "${create_tests,,}" =~ ^[jy] ]]; then
    CREATE_TEST_ACCOUNTS=true
  else
    CREATE_TEST_ACCOUNTS=false
  fi
  echo ""
  $CREATE_TEST_ACCOUNTS && log_ok "Test-Accounts werden erstellt/angezeigt" || log_info "Keine Test-Accounts"
}

# ---------------------------------------------------------------------------
# .env erstellen
# ---------------------------------------------------------------------------
setup_env() {
  cd "$PROJECT_DIR"
  if [[ "$DB_MODE" == "sqlite" ]]; then
    if [[ -f ".env" ]] && grep -q "VITE_DB_MODE=sqlite" .env 2>/dev/null; then
      log_ok ".env bereits mit SQLite konfiguriert"
    else
      log_info "Erstelle .env fuer SQLite..."
      echo "# SQLite (lokale Browser-Datenbank, kein Internet noetig)" > .env
      echo "VITE_DB_MODE=sqlite" >> .env
      log_ok ".env erstellt (SQLite-Modus)"
    fi
  else
    if [[ -f ".env" ]] && grep -q "VITE_SUPABASE_URL" .env 2>/dev/null && ! grep -q "DEINE\|dein-\|YOUR" .env 2>/dev/null; then
      grep -q "VITE_DB_MODE" .env 2>/dev/null || { echo ""; echo "VITE_DB_MODE=supabase"; } >> .env
      log_ok ".env gefunden (Supabase-Credentials vorhanden)"
    else
      log_info "Erstelle .env fuer Supabase..."
      if [[ -f "src/lib/.env.example" ]]; then cp src/lib/.env.example .env; else
        echo "VITE_SUPABASE_URL=https://dein-projekt.supabase.co" > .env; echo "VITE_SUPABASE_ANON_KEY=dein-anon-key" >> .env; fi
      echo "" >> .env; echo "VITE_DB_MODE=supabase" >> .env
      log_warn ".env erstellt. Bitte Supabase-Credentials eintragen!"
    fi
  fi
}

# ---------------------------------------------------------------------------
# Test-Accounts
# ---------------------------------------------------------------------------
run_test_accounts() {
  cd "$PROJECT_DIR"; ! $CREATE_TEST_ACCOUNTS && return
  log_step "Test-Accounts"
  node scripts/create-test-accounts.mjs --"$DB_MODE" 2>&1 || log_warn "Test-Accounts fehlgeschlagen (non-fatal)"
}

# ---------------------------------------------------------------------------
# Node.js Installation
# ---------------------------------------------------------------------------
install_node() {
  local platform arch filename url tmpdir
  platform="$(detect_platform)"; arch="$(detect_os)"
  filename="node-${NODE_VERSION}-${platform}-${arch}.tar.xz"
  url="https://nodejs.org/dist/${NODE_VERSION}/${filename}"
  tmpdir="$(mktemp -d)"
  log_info "Lade Node.js ${NODE_VERSION} herunter (${platform}-${arch})..."
  if command -v curl &>/dev/null; then curl -fsSL -o "${tmpdir}/${filename}" "$url"
  elif command -v wget &>/dev/null; then wget -q -O "${tmpdir}/${filename}" "$url"
  else log_error "curl/wget nicht gefunden"; rm -rf "$tmpdir"; exit 1; fi
  log_info "Entpacke nach ${INSTALL_DIR}..."
  mkdir -p "$INSTALL_DIR"; tar -xJf "${tmpdir}/${filename}" -C "$INSTALL_DIR" --strip-components=1; rm -rf "$tmpdir"
  export PATH="${INSTALL_DIR}/bin:${PATH}"
  for rc_file in "$HOME/.bashrc" "$HOME/.zshrc"; do
    [[ -f "$rc_file" ]] && ! grep -q "${INSTALL_DIR}/bin" "$rc_file" 2>/dev/null && {
      echo "export PATH=\"${INSTALL_DIR}/bin:\$PATH\"" >> "$rc_file"; log_info "PATH zu ${rc_file} hinzugefuegt"; }
  done
  log_ok "Node.js $(node --version) installiert"; log_ok "npm $(npm --version) installiert"
}

# ---------------------------------------------------------------------------
# Projekt-Setup & Verifikation
# ---------------------------------------------------------------------------
setup_project() {
  cd "$PROJECT_DIR"
  [[ -d "node_modules" ]] && log_info "Aktualisiere Abhaengigkeiten..." || log_info "Installiere npm-Abhaengigkeiten..."
  npm install --no-fund --no-audit
  log_ok "Abhaengigkeiten installiert"
  export PATH="${PROJECT_DIR}/node_modules/.bin:${PATH}"
}
verify_project() {
  cd "$PROJECT_DIR"; log_step "Build"
  if npm run build 2>&1 | grep -q "built in"; then log_ok "Build erfolgreich"
  else log_warn "Build fehlgeschlagen (non-fatal)"; npm run build 2>&1 | tail -5 || true; fi
}

# ---------------------------------------------------------------------------
# Hauptablauf
# ---------------------------------------------------------------------------
main() {
  echo -e "${BOLD}============================================${NC}"
  echo -e "${BOLD}  Autoinstaller - Node.js + Projekt-Setup${NC}"
  echo -e "${BOLD}============================================${NC}"

  log_step "1/7  System-Information"
  log_info "OS: $(uname -s) $(uname -m)"; log_info "Projekt: $PROJECT_DIR"

  log_step "2/7  Node.js pruefen"
  check_node && log_ok "Node.js $(node --version) bereit" || { log_info "Installiere lokal..."; install_node; }

  log_step "3/7  npm pruefen"
  check_npm && log_ok "npm $(npm --version) bereit" || { log_error "npm nicht verfuegbar"; exit 1; }

  log_step "4/7  Datenbank-Auswahl"; select_database
  log_step "5/7  Test-Accounts"; select_test_accounts
  log_step "6/7  Projekt-Abhaengigkeiten & .env"; setup_project; setup_env
  log_step "7/7  Verifikation & Test-Accounts"; verify_project; run_test_accounts

  echo ""; echo -e "${GREEN}${BOLD}============================================${NC}"
  echo -e "${GREEN}${BOLD}  Installation abgeschlossen!${NC}"
  echo -e "${GREEN}${BOLD}============================================${NC}"
  echo ""; echo -e "  Node.js:   $(node --version)"; echo -e "  npm:       $(npm --version)"
  echo -e "  Projekt:   ${PROJECT_DIR}"; echo -e "  Datenbank: ${BOLD}${DB_MODE}${NC}"; echo ""

  if [[ "$DB_MODE" == "supabase" ]] && grep -q "DEINE\|dein-\|YOUR" .env 2>/dev/null; then
    echo -e "${YELLOW}  Aktion noetig: .env mit Supabase-Credentials ausfuellen${NC}"
  elif [[ "$DB_MODE" == "sqlite" ]]; then
    echo -e "${GREEN}  SQLite: Keine weitere Konfiguration noetig.${NC}"
    echo -e "  Die Datenbank wird beim ersten Start im Browser erstellt."
  fi
  echo ""; echo -e "  Starten mit:  ${BOLD}npm run dev${NC}"; echo ""
}

main "$@"
