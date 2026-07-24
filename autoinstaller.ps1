<#
.SYNOPSIS
Autoinstaller - Node.js + Projekt-Abhaengigkeiten + Datenbank-Setup (Windows)
Prueft ob Node.js installiert ist, installiert es falls noetig,
richtet alle Projekt-Abhaengigkeiten ein, laesst den Benutzer die
Datenbank auswaehlen (Supabase Cloud oder MongoDB Atlas), kann
Test-Accounts erstellen und verifiziert den Build.

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
$CREATE_TEST_ACCOUNTS = $false

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
    $version = [version]((node --version).Trim('v'))
    if ($version.Major -ge $NODE_MIN_MAJOR -and $version.Minor -ge $NODE_MIN_MINOR) { return $true }
    Log-Warn "Node.js Version gefunden, benoetigt >= $NODE_MIN_MAJOR.$NODE_MIN_MINOR"
    return $false
}

function Check-Npm {
    $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npmCmd) { return $false }
    $version = [version]((npm --version) -replace '-.*','')
    if ($version.Major -ge $NPM_MIN_MAJOR -and $version.Minor -ge $NPM_MIN_MINOR) { return $true }
    Log-Warn "npm Version gefunden, benoetigt >= $NPM_MIN_MAJOR.$NPM_MIN_MINOR"
    return $false
}

# ---------------------------------------------------------------------------
# Datenbank-Auswahl
# ---------------------------------------------------------------------------
function Select-Database {
    Write-Host ""
    Write-Host "Welche Datenbank moechtest du verwenden?" -ForegroundColor White
    Write-Host ""
    Write-Host "  1) Supabase (Cloud - PostgreSQL)" -ForegroundColor Cyan
    Write-Host "     -> Hosted PostgreSQL mit Auth, Realtime, RLS"
    Write-Host "     -> Benoetigt Supabase-Credentials in .env"
    Write-Host "     -> Internetverbindung noetig"
    Write-Host ""
    Write-Host "  2) MongoDB Atlas (Cloud - NoSQL)" -ForegroundColor Cyan
    Write-Host "     -> Moderne NoSQL-Datenbank in der Cloud"
    Write-Host "     -> Flexible Dokumenten-Struktur, horizontal skalierbar"
    Write-Host "     -> Benoetigt MongoDB Atlas Data API URL + Key in .env"
    Write-Host "     -> Internetverbindung noetig"
    Write-Host ""
    $choice = Read-Host "Auswahl [1-2] (Standard: 1)"
    if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "1" }

    switch ($choice) {
        "1" { $script:DB_MODE = "supabase" }
        "2" { $script:DB_MODE = "mongodb" }
        default { Log-Warn "Ungueltige Auswahl, verwende Supabase"; $script:DB_MODE = "supabase" }
    }
    Write-Host ""
    Log-Ok "Datenbank-Modus: $($script:DB_MODE)"
}

# ---------------------------------------------------------------------------
# Test-Accounts Auswahl
# ---------------------------------------------------------------------------
function Select-TestAccounts {
    Write-Host ""
    Write-Host "Test-Accounts erstellen?" -ForegroundColor White
    Write-Host "  Erstellt 3 Test-Benutzer (Admin, Staff, Teacher) mit bekannten Passwoertern."
    Write-Host "  Die Zugangsdaten werden am Ende angezeigt."
    Write-Host ""
    $answer = Read-Host "Test-Accounts erstellen? [j/N]"
    if ($answer -match '^[jJyY]') {
        $script:CREATE_TEST_ACCOUNTS = $true
        Write-Host ""
        Log-Ok "Test-Accounts werden nach der Installation erstellt"
    } else {
        $script:CREATE_TEST_ACCOUNTS = $false
        Write-Host ""
        Log-Info "Keine Test-Accounts"
    }
}

# ---------------------------------------------------------------------------
# .env-Datei erstellen
# ---------------------------------------------------------------------------
function Setup-Env {
    Set-Location $PROJECT_DIR

    if ($script:DB_MODE -eq "mongodb") {
        $envContent = @"
# MongoDB Atlas Data API
VITE_DB_MODE=mongodb
VITE_MONGODB_DATA_API_URL=https://data.mongodb-api.com/app/YOUR_APP_ID/endpoint/data/v1
VITE_MONGODB_DATA_API_KEY=YOUR_DATA_API_KEY
VITE_MONGODB_DATA_SOURCE=Cluster0
VITE_MONGODB_DATABASE=techub
"@
        $needsSetup = $true
        if (Test-Path ".env") {
            $existing = Get-Content ".env" -Raw
            if ($existing -match "VITE_DB_MODE=mongodb") {
                $needsSetup = $false
                Log-Ok ".env bereits mit MongoDB konfiguriert"
            }
        }
        if ($needsSetup) {
            Log-Info "Erstelle .env fuer MongoDB Atlas..."
            if (Test-Path "src\lib\.env.example.mongodb") {
                Copy-Item "src\lib\.env.example.mongodb" ".env"
            } else {
                Set-Content -Path ".env" -Value $envContent -Encoding UTF8
            }
            Log-Ok ".env erstellt (MongoDB-Modus)"
            Log-Warn "Bitte MongoDB Atlas Data API URL und Key eintragen!"
        }
    }
    else {
        $needsCredentials = $false
        if (-not (Test-Path ".env")) {
            $needsCredentials = $true
        } elseif ((Select-String -Path ".env" -Pattern "DEINE|dein-|YOUR" -Quiet)) {
            $needsCredentials = $true
        } else {
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
            Add-Content -Path ".env" -Value "`nVITE_DB_MODE=supabase"
            Log-Warn ".env erstellt. Bitte Supabase-Credentials eintragen!"
        }
    }
}

# ---------------------------------------------------------------------------
# Test-Accounts erstellen
# ---------------------------------------------------------------------------
function Run-TestAccounts {
    if (-not $script:CREATE_TEST_ACCOUNTS) { return }
    Set-Location $PROJECT_DIR

    Log-Step "Test-Accounts erstellen"

    $canRun = $false
    if ($script:DB_MODE -eq "supabase") {
        if ((Test-Path ".env") -and -not (Select-String -Path ".env" -Pattern "DEINE|dein-|YOUR" -Quiet)) {
            $canRun = $true
        }
    } else {
        if ((Test-Path ".env") -and -not (Select-String -Path ".env" -Pattern "YOUR_APP_ID|YOUR_DATA_API_KEY" -Quiet)) {
            $canRun = $true
        }
    }

    if (-not $canRun) {
        Log-Warn "Test-Accounts koennen nicht erstellt werden: .env enthaelt noch Platzhalter."
        Log-Info "Bitte zuerst Credentials eintragen, dann ausfuehren:"
        Write-Host "  node scripts\create-test-accounts.mjs --$($script:DB_MODE)" -ForegroundColor White
        return
    }

    $scriptPath = Join-Path $PROJECT_DIR "scripts\create-test-accounts.mjs"
    $result = node $scriptPath "--$($script:DB_MODE)" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host $result
        Log-Ok "Test-Accounts erstellt"
    } else {
        Write-Host $result
        Log-Warn "Test-Accounts konnten nicht erstellt werden (non-fatal)"
    }
    $global:LASTEXITCODE = 0
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
        [Environment]::SetEnvironmentVariable("Path", "$INSTALL_DIR;$userPath", "User")
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
    Log-Step "Build"
    $buildOutput = cmd /c npm run build 2>&1
    if ($LASTEXITCODE -eq 0 -and $buildOutput -match "built in") {
        Log-Ok "Build erfolgreich"
    } else {
        Write-Host $buildOutput
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

    Log-Step "1/7  System-Information"
    Log-Info "OS:      Windows $([Environment]::OSVersion.Version)"
    Log-Info "Projekt: $PROJECT_DIR"

    Log-Step "2/7  Node.js pruefen"
    if (Check-Node) {
        Log-Ok "Node.js $(node --version) bereits installiert"
    } else {
        Log-Info "Node.js nicht gefunden oder veraltet. Installiere lokal..."
        Install-Node
    }

    Log-Step "3/7  npm pruefen"
    if (Check-Npm) {
        Log-Ok "npm $(npm --version) bereit"
    } else {
        Log-Error "npm nicht verfuegbar."
        Exit 1
    }

    Log-Step "4/7  Datenbank-Auswahl"
    Select-Database

    Log-Step "5/7  Test-Accounts"
    Select-TestAccounts

    Log-Step "6/7  Projekt-Abhaengigkeiten & .env"
    Setup-Project
    Setup-Env

    Log-Step "7/7  Verifikation & Test-Accounts"
    Verify-Project
    Run-TestAccounts

    Write-Host "`n============================================" -ForegroundColor Green
    Write-Host "  Installation abgeschlossen!"                  -ForegroundColor Green -NoNewline
    Write-Host "`n============================================`n" -ForegroundColor Green

    Write-Host "  Node.js:   $(node --version)"
    Write-Host "  npm:       $(npm --version)"
    Write-Host "  Projekt:   $PROJECT_DIR"
    Write-Host "  Datenbank: $DB_MODE`n"

    if ($DB_MODE -eq "supabase") {
        if (-not (Test-Path ".env") -or (Select-String -Path ".env" -Pattern "DEINE|dein-|YOUR" -Quiet)) {
            Write-Host "  Aktion noetig: .env mit Supabase-Credentials ausfuellen" -ForegroundColor Yellow
        }
    } else {
        if (-not (Test-Path ".env") -or (Select-String -Path ".env" -Pattern "YOUR_APP_ID|YOUR_DATA_API_KEY" -Quiet)) {
            Write-Host "  Aktion noetig: .env mit MongoDB Atlas Credentials ausfuellen" -ForegroundColor Yellow
            Write-Host "  1. MongoDB Atlas Cluster erstellen (kostenloser Tier verfuegbar)"
            Write-Host "  2. Data API aktivieren: App Services > Data API"
            Write-Host "  3. API URL und Key in .env eintragen"
        }
    }

    if ($CREATE_TEST_ACCOUNTS -and -not (Select-String -Path ".env" -Pattern "YOUR|DEINE|dein-" -Quiet)) {
        Write-Host "`n  Test-Accounts erneut erstellen:" -ForegroundColor White
        Write-Host "  node scripts\create-test-accounts.mjs --$DB_MODE"
    }

    Write-Host "`n  Starten mit:  npm run dev`n"
}

Main
