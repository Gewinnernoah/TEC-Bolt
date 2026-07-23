<#
.SYNOPSIS
Autoinstaller - Node.js + Projekt-Abhängigkeiten (Windows)
Prüft ob Node.js installiert ist, installiert es falls nötig,
richtet alle Projekt-Abhängigkeiten ein und verifiziert den Build.

.EXAMPLE
.\autoinstaller.ps1
#>

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Konfiguration
# ---------------------------------------------------------------------------
$NODE_MIN_MAJOR = 18
$NODE_MIN_MINOR = 0
$NPM_MIN_MAJOR = 9
$NPM_MIN_MINOR = 0
$NODE_VERSION = "v20.18.0"
$INSTALL_DIR = Join-Path $env:LOCALAPPDATA "Nodejs-Local"
$PROJECT_DIR = $PSScriptRoot

# ---------------------------------------------------------------------------
# Hilfsfunktionen (Farben & Logging)
# ---------------------------------------------------------------------------
function Log-Info  { param($msg) Write-Host "[INFO]   $msg" -ForegroundColor Blue }
function Log-Ok    { param($msg) Write-Host "[OK]     $msg" -ForegroundColor Green }
function Log-Warn  { param($msg) Write-Host "[WARN]   $msg" -ForegroundColor Yellow }
function Log-Error { param($msg) Write-Host "[FEHLER] $msg" -ForegroundColor Red }
function Log-Step  { param($msg) Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

function Check-Node {
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) { return $false }
    
    $versionStr = (node --version).Trim('v')
    $version = [version]$versionStr
    
    if ($version.Major -ge $NODE_MIN_MAJOR -and $version.Minor -ge $NODE_MIN_MINOR) { 
        return $true 
    }
    
    Log-Warn "Node.js Version $versionStr gefunden, benötigt >= $NODE_MIN_MAJOR.$NODE_MIN_MINOR"
    return $false
}

function Check-Npm {
    $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npmCmd) { return $false }
    
    $versionStr = (npm --version)
    $cleanVersion = $versionStr -replace '-.*', '' # Entfernt evtl. angehängte Beta-Tags
    $version = [version]$cleanVersion
    
    if ($version.Major -ge $NPM_MIN_MAJOR -and $version.Minor -ge $NPM_MIN_MINOR) { 
        return $true 
    }
    
    Log-Warn "npm Version $versionStr gefunden, benötigt >= $NPM_MIN_MAJOR.$NPM_MIN_MINOR"
    return $false
}

# ---------------------------------------------------------------------------
# Installation: Node.js (lokal, ohne Admin-Rechte)
# ---------------------------------------------------------------------------
function Install-Node {
    # Unter Windows fast immer x64, ARM64 wird geprüft falls nötig
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
    $filename = "node-${NODE_VERSION}-win-${arch}.zip"
    $url = "https://nodejs.org/dist/${NODE_VERSION}/${filename}"
    $tmpdir = Join-Path $env:TEMP "node_install_$([guid]::NewGuid())"
    $tmpfile = Join-Path $tmpdir $filename

    New-Item -ItemType Directory -Path $tmpdir -Force | Out-Null
    Log-Info "Lade Node.js ${NODE_VERSION} herunter (win-${arch})..."
    
    Invoke-WebRequest -Uri $url -OutFile $tmpfile

    Log-Info "Entpacke nach $INSTALL_DIR..."
    if (Test-Path $INSTALL_DIR) { Remove-Item -Recurse -Force $INSTALL_DIR }
    New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null
    
    # Entpacken
    Expand-Archive -Path $tmpfile -DestinationPath $tmpdir -Force
    
    # Den inneren Ordner ins Ziel verschieben
    $extractedFolder = Join-Path $tmpdir "node-${NODE_VERSION}-win-${arch}"
    Move-Item -Path "$extractedFolder\*" -Destination $INSTALL_DIR -Force

    Remove-Item -Recurse -Force $tmpdir

    # PATH für die aktuelle Sitzung aktualisieren
    $env:PATH = "$INSTALL_DIR;" + $env:PATH

    # PATH dauerhaft im Benutzerprofil eintragen
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($userPath -notmatch [regex]::Escape($INSTALL_DIR)) {
        $newPath = "$INSTALL_DIR;" + $userPath
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        Log-Info "PATH wurde dauerhaft für den Benutzer aktualisiert"
    }

    Log-Ok "Node.js $(node --version) installiert"
    Log-Ok "npm $(npm --version) installiert"
}

# ---------------------------------------------------------------------------
# Projekt-Setup
# ---------------------------------------------------------------------------
function Setup-Project {
    Set-Location $PROJECT_DIR

    # .env prüfen
    if (-not (Test-Path ".env")) {
        if (Test-Path "src\lib\.env.example") {
            Log-Warn ".env nicht gefunden. Kopiere von src\lib\.env.example"
            Copy-Item "src\lib\.env.example" ".env"
            Log-Warn "Bitte .env mit deinen Supabase-Credentials ausfüllen!"
        } else {
            Log-Warn ".env nicht gefunden und keine Vorlage vorhanden."
        }
    } else {
        Log-Ok ".env gefunden"
    }

    # node_modules prüfen
    if (Test-Path "node_modules") {
        Log-Info "node_modules existiert bereits. Aktualisiere Abhängigkeiten..."
    } else {
        Log-Info "Installiere alle npm-Abhängigkeiten..."
    }

    # Führt npm install aus
    cmd /c npm install --no-fund --no-audit

    Log-Ok "Abhängigkeiten installiert"

    # node_modules\.bin zum aktuellen PATH hinzufügen
    $localBin = Join-Path $PROJECT_DIR "node_modules\.bin"
    $env:PATH = "$localBin;" + $env:PATH
}

# ---------------------------------------------------------------------------
# Verifikation
# ---------------------------------------------------------------------------
function Verify-Project {
    Set-Location $PROJECT_DIR

    Log-Step "Typecheck"
    cmd /c npx tsc --noEmit -p tsconfig.app.json 2>$null
    if ($LASTEXITCODE -eq 0) {
        Log-Ok "Typecheck bestanden"
    } else {
        Log-Warn "Typecheck fehlgeschlagen (non-fatal)"
    }
    $global:LASTEXITCODE = 0

    Log-Step "Build"
    cmd /c npm run build 2>$null
    if ($LASTEXITCODE -eq 0) {
        Log-Ok "Build erfolgreich"
    } else {
        Log-Warn "Build fehlgeschlagen (non-fatal)"
    }
    $global:LASTEXITCODE = 0
}

# ---------------------------------------------------------------------------
# Hauptablauf
# ---------------------------------------------------------------------------
function Main {
    Clear-Host
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "  Autoinstaller - Node.js + Projekt-Setup"    -ForegroundColor White -NoNewline
    Write-Host "`n============================================" -ForegroundColor Cyan

    Log-Step "1/5  System-Information"
    Log-Info "OS:      Windows $([Environment]::OSVersion.Version)"
    Log-Info "Projekt: $PROJECT_DIR"

    Log-Step "2/5  Node.js prüfen"
    if (Check-Node) {
        Log-Ok "Node.js $(node --version) bereits installiert (erfüllt Minimum $NODE_MIN_MAJOR.$NODE_MIN_MINOR)"
    } else {
        Log-Info "Node.js nicht gefunden oder veraltet. Installiere lokal..."
        Install-Node
    }

    Log-Step "3/5  npm prüfen"
    if (Check-Npm) {
        Log-Ok "npm $(npm --version) bereit"
    } else {
        Log-Error "npm nicht verfügbar. Installation konnte nicht abgeschlossen werden."
        Exit 1
    }

    Log-Step "4/5  Projekt-Abhängigkeiten"
    Setup-Project

    Log-Step "5/5  Verifikation"
    Verify-Project

    Write-Host "`n============================================" -ForegroundColor Green
    Write-Host "  Installation abgeschlossen!"                  -ForegroundColor Green -NoNewline
    Write-Host "`n============================================`n" -ForegroundColor Green

    Write-Host "  Node.js:  $(node --version)"
    Write-Host "  npm:      $(npm --version)"
    Write-Host "  Projekt:  $PROJECT_DIR`n"

    $envNeedsAction = $false
    if (-not (Test-Path ".env")) { 
        $envNeedsAction = $true 
    } elseif (Select-String -Path ".env" -Pattern "DEINE" -Quiet) {
        $envNeedsAction = $true
    }

    if ($envNeedsAction) {
        Write-Host "  Aktion nötig: .env mit Supabase-Credentials ausfüllen" -ForegroundColor Yellow
    }
    Write-Host "  Starten mit:  npm run dev`n"
}

Main