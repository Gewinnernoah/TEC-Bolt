<#
.SYNOPSIS
Autoinstaller - Node.js + Projekt-Abhängigkeiten + Datenbank-Setup (Windows)
Prüft ob Node.js installiert ist, installiert es falls nötig,
richtet alle Projekt-Abhängigkeiten ein, lässt den Benutzer die
Datenbank auswählen (Supabase Cloud oder lokale SQLite), kann
Test-Accounts anzeigen/erstellen und verifiziert den Build.

.EXAMPLE
.\autoinstaller.ps1
#>

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Konfiguration
# ---------------------------------------------------------------------------
$NODE_MIN_MAJOR = 18; $NODE_MIN_MINOR = 0
$NPM_MIN_MAJOR = 9;  $NPM_MIN_MINOR = 0
$NODE_VERSION = "v20.18.0"
$INSTALL_DIR = Join-Path $env:LOCALAPPDATA "Nodejs-Local"
$PROJECT_DIR = $PSScriptRoot
$DB_MODE = "sqlite"
$CREATE_TEST_ACCOUNTS = $false

function Write-LogInfo  { param($msg) Write-Host "[INFO]   $msg" -ForegroundColor Blue }
function Write-LogOk    { param($msg) Write-Host "[OK]     $msg" -ForegroundColor Green }
function Write-Log-Warn  { param($msg) Write-Host "[WARN]   $msg" -ForegroundColor Yellow }
function Write-Log-Error { param($msg) Write-Host "[FEHLER] $msg" -ForegroundColor Red }
function Write-Log-Step  { param($msg) Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

function Test-Node {
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) { return $false }
    $version = [version]((node --version).Trim('v'))
    if ($version.Major -ge $NODE_MIN_MAJOR -and $version.Minor -ge $NODE_MIN_MINOR) { return $true }
    Write-Log-Warn "Node.js Version gefunden, benötigt >= $NODE_MIN_MAJOR.$NODE_MIN_MINOR"
    return $false
}

function Test-Npm {
    $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npmCmd) { return $false }
    $version = [version]((npm --version) -replace '-.*','')
    if ($version.Major -ge $NPM_MIN_MAJOR -and $version.Minor -ge $NPM_MIN_MINOR) { return $true }
    Write-Log-Warn "npm Version gefunden, benötigt >= $NPM_MIN_MAJOR.$NPM_MIN_MINOR"
    return $false
}

# ---------------------------------------------------------------------------
# Datenbank-Auswahl
# ---------------------------------------------------------------------------
function Select-Database {
    Write-Host ""
    Write-Host "Welche Datenbank möchtest du verwenden?" -ForegroundColor White
    Write-Host ""
    Write-Host "  1) Supabase (Cloud - PostgreSQL)" -ForegroundColor Cyan
    Write-Host "     -> Hosted PostgreSQL mit Auth, Realtime, RLS"
    Write-Host "     -> Benötigt Supabase-Credentials in .env"
    Write-Host "     -> Internetverbindung nötig"
    Write-Host ""
    Write-Host "  2) SQLite (Lokal - Offline)" -ForegroundColor Cyan
    Write-Host "     -> Datenbank läuft direkt im Browser (WASM)"
    Write-Host "     -> Keine Internetverbindung nötig"
    Write-Host "     -> Daten bleiben im Browser gespeichert (IndexedDB)"
    Write-Host "     -> Keine Konfiguration nötig"
    Write-Host ""
    
    $choice = Read-Host "Auswahl [1-2] (Standard: 2)"
    if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "2" }

    switch ($choice) {
        "1" { $script:DB_MODE = "supabase" }
        "2" { $script:DB_MODE = "sqlite" }
        default { Write-Log-Warn "Ungültige Auswahl, verwende SQLite"; $script:DB_MODE = "sqlite" }
    }
    Write-Host ""
    Write-LogOk "Datenbank-Modus: $($script:DB_MODE)"
}

# ---------------------------------------------------------------------------
# Test-Accounts Auswahl
# ---------------------------------------------------------------------------
function Select-TestAccounts {
    Write-Host ""
    Write-Host "Test-Accounts anzeigen/erstellen?" -ForegroundColor White
    Write-Host "  Zeigt 3 Test-Zugänge (Admin, Staff, Teacher) mit Passwörtern an."
    if ($script:DB_MODE -eq "sqlite") {
        Write-Host "  (SQLite: Zugangsdaten werden angezeigt, Registrierung in der App)" -ForegroundColor Yellow
    } else {
        Write-Host "  (Supabase: Accounts werden automatisch erstellt)" -ForegroundColor Yellow
    }
    Write-Host ""
    
    $answer = Read-Host "Test-Accounts anzeigen/erstellen? [j/N]"
    if ($answer -match '^[jJyY]') {
        $script:CREATE_TEST_ACCOUNTS = $true
        Write-Host ""; Write-LogOk "Test-Accounts werden erstellt/angezeigt"
    } else {
        $script:CREATE_TEST_ACCOUNTS = $false
        Write-Host ""; Write-LogInfo "Keine Test-Accounts"
    }
}

# ---------------------------------------------------------------------------
# .env erstellen & aktualisieren
# ---------------------------------------------------------------------------
function Initialize-Env {
    Set-Location $PROJECT_DIR

    # Wenn .env fehlt, aber eine Example existiert, kopiere sie zuerst
    if (-not (Test-Path ".env") -and (Test-Path "src\lib\.env.example")) {
        Copy-Item "src\lib\.env.example" ".env"
        Write-LogInfo ".env aus Vorlage erstellt."
    }

    # Falls immer noch keine existiert, erstelle eine leere Datei
    if (-not (Test-Path ".env")) {
        New-Item -ItemType File -Path ".env" -Force | Out-Null
    }

    $envContent = Get-Content ".env" -Raw
    if ($null -eq $envContent) { $envContent = "" }

    # VITE_DB_MODE eintragen oder aktualisieren
    if ($envContent -match "VITE_DB_MODE=") {
        $envContent = $envContent -replace 'VITE_DB_MODE=.*', "VITE_DB_MODE=$($script:DB_MODE)"
        Write-LogOk ".env Modus auf '$($script:DB_MODE)' aktualisiert"
    } else {
        $envContent += "`nVITE_DB_MODE=$($script:DB_MODE)"
        Write-LogOk ".env VITE_DB_MODE hinzugefügt"
    }

    Set-Content -Path ".env" -Value $envContent.Trim() -Encoding UTF8

    # Warnung für Supabase Credentials
    if ($script:DB_MODE -eq "supabase" -and ($envContent -match "DEINE|dein-|YOUR" -or $envContent -notmatch "VITE_SUPABASE_URL")) {
        Write-Log-Warn "Bitte Supabase-Credentials in der .env eintragen!"
    }
}

# ---------------------------------------------------------------------------
# Test-Accounts
# ---------------------------------------------------------------------------
function Invoke-TestAccounts {
    if (-not $script:CREATE_TEST_ACCOUNTS) { return }
    Set-Location $PROJECT_DIR
    Write-Log-Step "Test-Accounts"
    
    $scriptPath = Join-Path $PROJECT_DIR "scripts\create-test-accounts.mjs"
    # Wichtig: Pfad in Anführungszeichen setzen und mit Call-Operator (&) aufrufen
    $result = & node "$scriptPath" "--$($script:DB_MODE)" 2>&1
    Write-Host $result
    
    if ($LASTEXITCODE -eq 0) { Write-LogOk "Test-Accounts fertig" } 
    else { Write-Log-Warn "Test-Accounts fehlgeschlagen (non-fatal)" }
    
    $global:LASTEXITCODE = 0
}

# ---------------------------------------------------------------------------
# Node.js Installation
# ---------------------------------------------------------------------------
function Install-Node {
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
    $filename = "node-${NODE_VERSION}-win-${arch}.zip"
    $url = "https://nodejs.org/dist/${NODE_VERSION}/${filename}"
    $tmpdir = Join-Path $env:TEMP "node_install_$([guid]::NewGuid())"
    $tmpfile = Join-Path $tmpdir $filename
    
    New-Item -ItemType Directory -Path $tmpdir -Force | Out-Null
    Write-LogInfo "Lade Node.js ${NODE_VERSION} herunter (win-${arch})..."
    
    # Progress-Balken deaktivieren -> Macht den Download in PowerShell 10x schneller!
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $url -OutFile $tmpfile
    $ProgressPreference = 'Continue'
    
    Write-LogInfo "Entpacke nach $INSTALL_DIR..."
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
        Write-LogInfo "PATH dauerhaft aktualisiert"
    }
    Write-LogOk "Node.js $(node --version) installiert"; Write-LogOk "npm $(npm --version) installiert"
}

# ---------------------------------------------------------------------------
# Projekt-Setup & Verifikation
# ---------------------------------------------------------------------------
function Initialize-Project {
    Set-Location $PROJECT_DIR
    if (Test-Path "node_modules") { Write-LogInfo "Aktualisiere Abhängigkeiten..." } 
    else { Write-LogInfo "Installiere npm-Abhängigkeiten..." }
    
    # Call-Operator (&) mit npm.cmd ist in PowerShell sicherer als cmd /c
    & "npm.cmd" install --no-fund --no-audit
    Write-LogOk "Abhängigkeiten installiert"
    
    $env:PATH = "$(Join-Path $PROJECT_DIR 'node_modules\.bin');" + $env:PATH
}

function Test-Project {
    Set-Location $PROJECT_DIR
    Write-Log-Step "Build"
    
    $buildOutput = & "npm.cmd" run build 2>&1
    if ($LASTEXITCODE -eq 0 -and $buildOutput -match "built in|vite") { 
        Write-LogOk "Build erfolgreich" 
    } else { 
        Write-Host $buildOutput
        Write-Log-Warn "Build fehlgeschlagen (non-fatal)" 
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

    Write-Log-Step "1/7  System-Information"
    Write-LogInfo "OS: Windows $([Environment]::OSVersion.Version)"
    Write-LogInfo "Projekt: $PROJECT_DIR"

    Write-Log-Step "2/7  Node.js prüfen"
    if (Test-Node) { Write-LogOk "Node.js $(node --version) bereit" } 
    else { Write-LogInfo "Installiere lokal..."; Install-Node }

    Write-Log-Step "3/7  npm prüfen"
    if (Test-Npm) { Write-LogOk "npm $(npm --version) bereit" } 
    else { Write-Log-Error "npm nicht verfügbar"; Exit 1 }

    Write-Log-Step "4/7  Datenbank-Auswahl"; Select-Database
    Write-Log-Step "5/7  Test-Accounts"; Select-TestAccounts
    Write-Log-Step "6/7  Projekt-Abhängigkeiten & .env"; Initialize-Project; Initialize-Env
    Write-Log-Step "7/7  Verifikation & Test-Accounts"; Test-Project; Invoke-TestAccounts

    Write-Host "`n============================================" -ForegroundColor Green
    Write-Host "  Installation abgeschlossen!"                  -ForegroundColor Green -NoNewline
    Write-Host "`n============================================`n" -ForegroundColor Green

    Write-Host "  Node.js:   $(node --version)"
    Write-Host "  npm:       $(npm --version)"
    Write-Host "  Projekt:   $PROJECT_DIR"
    Write-Host "  Datenbank: $DB_MODE`n"

    $envContent = if (Test-Path ".env") { Get-Content ".env" -Raw } else { "" }
    if ($DB_MODE -eq "supabase" -and ($envContent -match "DEINE|dein-|YOUR" -or $envContent -notmatch "VITE_SUPABASE_URL")) {
        Write-Host "  Aktion nötig: .env mit Supabase-Credentials ausfüllen" -ForegroundColor Yellow
    } elseif ($DB_MODE -eq "sqlite") {
        Write-Host "  SQLite: Keine weitere Konfiguration nötig." -ForegroundColor Green
        Write-Host "  Die Datenbank wird beim ersten Start im Browser erstellt."
    }
    Write-Host "`n  Starten mit:  npm run dev`n"
}

Main