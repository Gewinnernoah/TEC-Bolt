#!/usr/bin/env bash
#
# Autoinstaller - Node.js + Projekt-Abhaengigkeiten
# Prueft ob Node.js installiert ist, installiert es falls noetig,
# richtet alle Projekt-Abhaengigkeiten ein und verifiziert den Build.
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
  # Gibt 0 (true) zurueck wenn $1 >= $2 (Format: major minor)
  local major1 minor1 major2 minor2
  major1="${1%%.*}"; minor1="${1#*.}"
  major2="${2%%.*}"; minor2="${2#*.}"
  [[ "$major1" -gt "$major2" ]] && return 0
  [[ "$major1" -eq "$major2" && "$minor1" -ge "$minor2" ]] && return 0
  return 1
}

check_node() {
  if ! command -v node &>/dev/null; then
    return 1
  fi
  local version
  version="$(node --version | sed 's/v//')"
  local major minor
  major="${version%%.*}"
  minor="${version#*.}"
  minor="${minor%%.*}"
  if version_ge "${major}.${minor}" "${NODE_MIN_MAJOR}.${NODE_MIN_MINOR}"; then
    return 0
  fi
  log_warn "Node.js Version ${version} gefunden, bentigt >= ${NODE_MIN_MAJOR}.${NODE_MIN_MINOR}"
  return 1
}

check_npm() {
  if ! command -v npm &>/dev/null; then
    return 1
  fi
  local version
  version="$(npm --version)"
  local major minor
  major="${version%%.*}"
  minor="${version#*.}"
  minor="${minor%%.*}"
  if version_ge "${major}.${minor}" "${NPM_MIN_MAJOR}.${NPM_MIN_MINOR}"; then
    return 0
  fi
  log_warn "npm Version ${version} gefunden, bentigt >= ${NPM_MIN_MAJOR}.${NPM_MIN_MINOR}"
  return 1
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
    rm -rf "$tmpdir"
    exit 1
  fi

  log_info "Entpacke nach ${INSTALL_DIR}..."
  mkdir -p "$INSTALL_DIR"
  tar -xJf "${tmpdir}/${filename}" -C "$INSTALL_DIR" --strip-components=1
  rm -rf "$tmpdir"

  # PATH aktualisieren
  export PATH="${INSTALL_DIR}/bin:${PATH}"

  # In .bashrc / .zshrc eintragen, falls noch nicht vorhanden
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

  # .env pruefen
  if [[ ! -f ".env" ]]; then
    if [[ -f "src/lib/.env.example" ]]; then
      log_warn ".env nicht gefunden. Kopiere von src/lib/.env.example"
      cp src/lib/.env.example .env
      log_warn "Bitte .env mit deinen Supabase-Credentials ausfuellen!"
    else
      log_warn ".env nicht gefunden und keine Vorlage vorhanden."
    fi
  else
    log_ok ".env gefunden"
  fi

  # node_modules pruefen
  if [[ -d "node_modules" ]]; then
    log_info "node_modules existiert bereits. Aktualisiere Abhaengigkeiten..."
  else
    log_info "Installiere alle npm-Abhaengigkeiten..."
  fi

  npm install --no-fund --no-audit

  log_ok "Abhaengigkeiten installiert ($(ls node_modules | wc -l) Packages)"

  # node_modules/.bin zum PATH hinzufuegen
  export PATH="${PROJECT_DIR}/node_modules/.bin:${PATH}"
}

# ---------------------------------------------------------------------------
# Verifikation
# ---------------------------------------------------------------------------
verify_project() {
  cd "$PROJECT_DIR"

  log_step "Typecheck"
  if npx tsc --noEmit -p tsconfig.app.json 2>/dev/null; then
    log_ok "Typecheck bestanden"
  else
    log_warn "Typecheck fehlgeschlagen (non-fatal)"
  fi

  log_step "Build"
  if npm run build 2>/dev/null; then
    log_ok "Build erfolgreich"
  else
    log_warn "Build fehlgeschlagen (non-fatal)"
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

  log_step "1/5  System-Information"
  log_info "OS:      $(uname -s) $(uname -m)"
  log_info "Projekt: $PROJECT_DIR"

  log_step "2/5  Node.js pruefen"
  if check_node; then
    log_ok "Node.js $(node --version) bereits installiert (erfuellt Minimum ${NODE_MIN_MAJOR}.${NODE_MIN_MINOR})"
  else
    log_info "Node.js nicht gefunden oder veraltet. Installiere lokal..."
    install_node
  fi

  log_step "3/5  npm pruefen"
  if check_npm; then
    log_ok "npm $(npm --version) bereit"
  else
    log_error "npm nicht verfuegbar. Installation konnte nicht abgeschlossen werden."
    exit 1
  fi

  log_step "4/5  Projekt-Abhaengigkeiten"
  setup_project

  log_step "5/5  Verifikation"
  verify_project

  echo ""
  echo -e "${GREEN}${BOLD}============================================${NC}"
  echo -e "${GREEN}${BOLD}  Installation abgeschlossen!${NC}"
  echo -e "${GREEN}${BOLD}============================================${NC}"
  echo ""
  echo -e "  Node.js:  $(node --version)"
  echo -e "  npm:      $(npm --version)"
  echo -e "  Projekt:  ${PROJECT_DIR}"
  echo ""
  if [[ ! -f ".env" ]] || grep -q "DEINE" .env 2>/dev/null; then
    echo -e "${YELLOW}  Aktion noetig: .env mit Supabase-Credentials ausfuellen${NC}"
  fi
  echo -e "  Starten mit:  ${BOLD}npm run dev${NC}"
  echo ""
}

main "$@"
