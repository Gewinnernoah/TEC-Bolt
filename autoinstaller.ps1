<#
.SYNOPSIS
Autoinstaller - Node.js + Projekt-Abhaengigkeiten + Datenbank-Setup (Windows)
Prueft ob Node.js installiert ist, installiert es falls noetig,
richtet alle Projekt-Abhaengigkeiten ein, laesst den Benutzer die
Datenbank auswaehlen (Supabase Cloud oder lokale PGlite) und
verifiziert den Build.

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
$DB_MODE = "supabase"

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

    Log-Warn "Node.js Version $versionStr gefunden, benoetigt >= $NODE_MIN_MAJOR.$NODE_MIN_MINOR"
    return $false
}

function Check-Npm {
    $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npmCmd) { return $false }

    $versionStr = (npm --version)
    $cleanVersion = $versionStr -replace '-.*', ''
    $version = [version]$cleanVersion

    if ($version.Major -ge $NPM_MIN_MAJOR -and $version.Minor -ge $NPM_MIN_MINOR) {
        return $true
    }

    Log-Warn "npm Version $versionStr gefunden, benoetigt >= $NPM_MIN_MAJOR.$NPM_MIN_MINOR"
    return $false
}

# ---------------------------------------------------------------------------
# Datenbank-Auswahl
# ---------------------------------------------------------------------------
function Select-Database {
    Write-Host ""
    Write-Host "Welche Datenbank moechtest du verwenden?" -ForegroundColor White
    Write-Host ""
    Write-Host "  1) Supabase (Cloud)" -ForegroundColor Cyan
    Write-Host "     -> Hosted PostgreSQL mit Auth, Realtime, RLS"
    Write-Host "     -> Benoetigt Supabase-Credentials in .env"
    Write-Host "     -> Internetverbindung noetig"
    Write-Host ""
    Write-Host "  2) PGlite (Lokal)" -ForegroundColor Cyan
    Write-Host "     -> PostgreSQL direkt im Browser (WASM, IndexedDB)"
    Write-Host "     -> Keine Internetverbindung noetig"
    Write-Host "     -> Daten bleiben im Browser gespeichert"
    Write-Host "     -> Keine Supabase-Credentials noetig"
    Write-Host ""
    Write-Host "  3) Beide einrichten (Supabase als Standard)" -ForegroundColor Cyan
    Write-Host "     -> .env mit Supabase + PGlite als Fallback"
    Write-Host ""
    $choice = Read-Host "Auswahl [1-3] (Standard: 1)"
    if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "1" }

    switch ($choice) {
        "1" { $script:DB_MODE = "supabase" }
        "2" { $script:DB_MODE = "pglite" }
        "3" { $script:DB_MODE = "supabase" }
        default { Log-Warn "Ungueltige Auswahl, verwende Supabase"; $script:DB_MODE = "supabase" }
    }

    Write-Host ""
    Log-Ok "Datenbank-Modus: $($script:DB_MODE)"
}

# ---------------------------------------------------------------------------
# .env-Datei erstellen
# ---------------------------------------------------------------------------
function Setup-Env {
    Set-Location $PROJECT_DIR

    if ($script:DB_MODE -eq "pglite") {
        $envContent = @"
# Database mode: pglite for local browser-based PostgreSQL
VITE_DB_MODE=pglite
"@
        $needsSetup = $true
        if (Test-Path ".env") {
            $existing = Get-Content ".env" -Raw
            if ($existing -match "VITE_DB_MODE=pglite") {
                $needsSetup = $false
                Log-Ok ".env bereits mit PGlite konfiguriert"
            }
        }
        if ($needsSetup) {
            Log-Info "Erstelle .env fuer PGlite (lokale Datenbank)..."
            Set-Content -Path ".env" -Value $envContent -Encoding UTF8
            Log-Ok ".env erstellt (PGlite-Modus)"
        }
    }
    else {
        # Supabase mode
        $needsCredentials = $false
        if (-not (Test-Path ".env")) {
            $needsCredentials = $true
        } elseif (Select-String -Path ".env" -Pattern "DEINE|dein-" -Quiet) {
            $needsCredentials = $true
        } else {
            # Check if VITE_DB_MODE is already set
            $existing = Get-Content ".env" -Raw
            if ($existing -notmatch "VITE_DB_MODE") {
                Add-Content -Path ".env" -Value "`nVITE_DB_MODE=supabase" -Encoding UTF8
                Log-Ok ".env gefunden, VITE_DB_MODE=supabase hinzugefuegt"
            } else {
                Log-Ok ".env gefunden (Supabase-Credentials vorhanden)"
            }
        }

        if ($needsCredentials) {
            Log-Info "Erstelle .env fuer Supabase..."
            if (Test-Path "src\lib\.env.example") {
                Copy-Item "src\lib\.env.example" ".env"
            } else {
                Set-Content -Path ".env" -Value @"
VITE_SUPABASE_URL=https://dein-projekt.supabase.co
VITE_SUPABASE_ANON_KEY=dein-anon-key
"@
            }
            Add-Content -Path ".env" -Value @"

# Database mode: supabase for cloud, pglite for local
VITE_DB_MODE=supabase
"@
            Log-Warn ".env erstellt. Bitte Supabase-Credentials eintragen!"
        }
    }
}

# ---------------------------------------------------------------------------
# Installation: Node.js (lokal, ohne Admin-Rechte)
# ---------------------------------------------------------------------------
function Install-Node {
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

    Expand-Archive -Path $tmpfile -DestinationPath $tmpdir -Force

    $extractedFolder = Join-Path $tmpdir "node-${NODE_VERSION}-win-${arch}"
    Move-Item -Path "$extractedFolder\*" -Destination $INSTALL_DIR -Force

    Remove-Item -Recurse -Force $tmpdir

    $env:PATH = "$INSTALL_DIR;" + $env:PATH

    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($userPath -notmatch [regex]::Escape($INSTALL_DIR)) {
        $newPath = "$INSTALL_DIR;" + $userPath
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        Log-Info "PATH wurde dauerhaft fuer den Benutzer aktualisiert"
    }

    Log-Ok "Node.js $(node --version) installiert"
    Log-Ok "npm $(npm --version) installiert"
}

# ---------------------------------------------------------------------------
# Projekt-Setup
# ---------------------------------------------------------------------------
function Setup-Project {
    Set-Location $PROJECT_DIR

    if (Test-Path "node_modules") {
        Log-Info "node_modules existiert bereits. Aktualisiere Abhaengigkeiten..."
    } else {
        Log-Info "Installiere alle npm-Abhaengigkeiten..."
    }

    cmd /c npm install --no-fund --no-audit

    Log-Ok "Abhaengigkeiten installiert"

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

    Log-Step "1/6  System-Information"
    Log-Info "OS:      Windows $([Environment]::OSVersion.Version)"
    Log-Info "Projekt: $PROJECT_DIR"

    Log-Step "2/6  Node.js pruefen"
    if (Check-Node) {
        Log-Ok "Node.js $(node --version) bereits installiert (erfuellt Minimum $NODE_MIN_MAJOR.$NODE_MIN_MINOR)"
    } else {
        Log-Info "Node.js nicht gefunden oder veraltet. Installiere lokal..."
        Install-Node
    }

    Log-Step "3/6  npm pruefen"
    if (Check-Npm) {
        Log-Ok "npm $(npm --version) bereit"
    } else {
        Log-Error "npm nicht verfuegbar. Installation konnte nicht abgeschlossen werden."
        Exit 1
    }

    Log-Step "4/6  Datenbank-Auswahl"
    Select-Database

    Log-Step "5/6  Projekt-Abhaengigkeiten & .env"
    Setup-Project
    Setup-Env

    Log-Step "6/6  Verifikation"
    Verify-Project

    Write-Host "`n============================================" -ForegroundColor Green
    Write-Host "  Installation abgeschlossen!"                  -ForegroundColor Green -NoNewline
    Write-Host "`n============================================`n" -ForegroundColor Green

    Write-Host "  Node.js:  $(node --version)"
    Write-Host "  npm:      $(npm --version)"
    Write-Host "  Projekt:  $PROJECT_DIR"
    Write-Host "  Datenbank: $DB_MODE`n"

    if ($DB_MODE -eq "supabase") {
        if (-not (Test-Path ".env")) {
            Write-Host "  Aktion noetig: .env mit Supabase-Credentials ausfuellen" -ForegroundColor Yellow
        } elseif (Select-String -Path ".env" -Pattern "DEINE|dein-" -Quiet) {
            Write-Host "  Aktion noetig: .env mit Supabase-Credentials ausfuellen" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  PGlite: Keine weitere Konfiguration noetig." -ForegroundColor Green
        Write-Host "  Die Datenbank wird beim ersten Start im Browser erstellt."
    }

    Write-Host "  Starten mit:  npm run dev`n"
}

Main
