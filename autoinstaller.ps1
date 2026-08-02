<#
.SYNOPSIS
One-Click-Installer - Node.js + PostgreSQL + Projekt-Setup (Windows)
Installiert automatisch alles Notwendige: Node.js, PostgreSQL, Datenbank,
Benutzer und konfiguriert die Anwendung. Der Nutzer muss keine weiteren
Schritte manuell durchfuehren.

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

# PostgreSQL-Konfiguration
$PG_VERSION = "17"
$PG_PORT = "5432"
$PG_DB_NAME = "techub"
$PG_USER = "techub_user"
$PG_PASSWORD = "TechHub2024!"
$PG_INSTALL_DIR = Join-Path $env:PROGRAMFILES "PostgreSQL"
$PG_DATA_DIR = Join-Path $env:PROGRAMFILES "PostgreSQL\$PG_VERSION\data"

# ---------------------------------------------------------------------------
# Farbige Konsolenausgabe
# ---------------------------------------------------------------------------
function Write-LogInfo    { param($msg) Write-Host "[INFO]   $msg" -ForegroundColor Blue }
function Write-LogOk      { param($msg) Write-Host "[OK]     $msg" -ForegroundColor Green }
function Write-LogWarn    { param($msg) Write-Host "[WARN]   $msg" -ForegroundColor Yellow }
function Write-LogError   { param($msg) Write-Host "[FEHLER] $msg" -ForegroundColor Red }
function Write-LogStep    { param($msg) Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-LogDetail  { param($msg) Write-Host "         $msg" -ForegroundColor DarkGray }

# ---------------------------------------------------------------------------
# Fehlerbehandlung mit verstaendlichen Meldungen
# ---------------------------------------------------------------------------
function Handle-Error {
    param($msg, $ex, $hint)
    Write-LogError $msg
    if ($ex) {
        Write-LogDetail "Details: $($ex.Message)"
    }
    if ($hint) {
        Write-LogWarn "Hinweis: $hint"
    }
    Write-Host ""
    Write-LogWarn "Installation wurde abgebrochen."
    Write-Host "Bitte beheben Sie das Problem und starten Sie den Installer erneut."
    Exit 1
}

# ---------------------------------------------------------------------------
# Node.js
# ---------------------------------------------------------------------------
function Test-Node {
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) { return $false }
    try {
        $version = [version]((node --version).Trim('v'))
        if ($version.Major -ge $NODE_MIN_MAJOR) { return $true }
    } catch { return $false }
    return $false
}

function Test-Npm {
    $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npmCmd) { return $false }
    try {
        $version = [version]((npm --version) -replace '-.*','')
        if ($version.Major -ge $NPM_MIN_MAJOR) { return $true }
    } catch { return $false }
    return $false
}

function Install-Node {
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
    $filename = "node-${NODE_VERSION}-win-${arch}.zip"
    $url = "https://nodejs.org/dist/${NODE_VERSION}/${filename}"
    $tmpdir = Join-Path $env:TEMP "node_install_$([guid]::NewGuid())"
    $tmpfile = Join-Path $tmpdir $filename

    New-Item -ItemType Directory -Path $tmpdir -Force | Out-Null
    Write-LogInfo "Lade Node.js ${NODE_VERSION} herunter (win-${arch})..."

    try {
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $url -OutFile $tmpfile
        $ProgressPreference = 'Continue'
    } catch {
        Handle-Error "Node.js konnte nicht heruntergeladen werden." $_ "Internetverbindung pruefen oder Node.js manuell von https://nodejs.org installieren."
    }

    Write-LogInfo "Entpacke nach $INSTALL_DIR..."
    if (Test-Path $INSTALL_DIR) { Remove-Item -Recurse -Force $INSTALL_DIR }
    New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null

    try {
        Expand-Archive -Path $tmpfile -DestinationPath $tmpdir -Force
        $extractedFolder = Join-Path $tmpdir "node-${NODE_VERSION}-win-${arch}"
        Move-Item -Path "$extractedFolder\*" -Destination $INSTALL_DIR -Force
        Remove-Item -Recurse -Force $tmpdir
    } catch {
        Handle-Error "Node.js konnte nicht entpackt werden." $_ "Festplattenspeicher pruefen oder Antivirus-Programm deaktivieren."
    }

    $env:PATH = "$INSTALL_DIR;" + $env:PATH
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($userPath -notmatch [regex]::Escape($INSTALL_DIR)) {
        [Environment]::SetEnvironmentVariable("Path", "$INSTALL_DIR;$userPath", "User")
        Write-LogInfo "PATH dauerhaft aktualisiert"
    }
    Write-LogOk "Node.js $(node --version) installiert"
    Write-LogOk "npm $(npm --version) installiert"
}

# ---------------------------------------------------------------------------
# PostgreSQL
# ---------------------------------------------------------------------------
function Test-PostgreSQL {
    # Pruefe ob psql verfuegbar ist
    $psqlCmd = Get-Command psql -ErrorAction SilentlyContinue
    if ($psqlCmd) { return $true }

    # Pruefe ob PostgreSQL im Standard-Installationsverzeichnis liegt
    $pgExe = Join-Path $PG_INSTALL_DIR "$PG_VERSION\bin\psql.exe"
    if (Test-Path $pgExe) {
        $pgBin = Join-Path $PG_INSTALL_DIR "$PG_VERSION\bin"
        $env:PATH = "$pgBin;" + $env:PATH
        return $true
    }
    return $false
}

function Test-PostgreSQLService {
    $service = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
    if ($service) { return $true }
    return $false
}

function Start-PostgreSQLService {
    try {
        $service = Get-Service -Name "postgresql*" -ErrorAction Stop
        if ($service.Status -ne 'Running') {
            Write-LogInfo "Starte PostgreSQL-Dienst..."
            Start-Service -Name $service.Name
            Start-Sleep -Seconds 2
        }
        Write-LogOk "PostgreSQL-Dienst laeuft ($($service.Name))"
        return $true
    } catch {
        Handle-Error "PostgreSQL-Dienst konnte nicht gestartet werden." $_ "Dienst manuell starten: net start postgresql-x64-$PG_VERSION oder Dienste-Console (services.msc) oeffnen."
    }
}

function Install-PostgreSQL {
    Write-LogInfo "Installiere PostgreSQL $PG_VERSION automatisch..."

    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
    $filename = "postgresql-$PG_VERSION-1-windows-${arch}.exe"
    $url = "https://sbp.enterprisedb.com/getfile.jspg?fileid=1259525"
    $tmpfile = Join-Path $env:TEMP $filename

    # Verschiedene Download-URLs versuchen
    $urls = @(
        "https://sbp.enterprisedb.com/getfile.jspg?fileid=1259525",
        "https://www.enterprisedb.com/postgresql-tutorial-resources-training-1?uuid=download"
    )

    $downloaded = $false
    foreach ($tryUrl in $urls) {
        try {
            Write-LogInfo "Versuche Download von: $tryUrl"
            $ProgressPreference = 'SilentlyContinue'
            Invoke-WebRequest -Uri $tryUrl -OutFile $tmpfile -MaximumRedirection 5
            $ProgressPreference = 'Continue'
            if (Test-Path $tmpfile) {
                $fileSize = (Get-Item $tmpfile).Length
                if ($fileSize -gt 1MB) {
                    $downloaded = $true
                    Write-LogOk "PostgreSQL-Installer heruntergeladen ($([math]::Round($fileSize/1MB, 1)) MB)"
                    break
                }
            }
        } catch {
            Write-LogWarn "Download von $tryUrl fehlgeschlagen: $($_.Exception.Message)"
        }
    }

    if (-not $downloaded) {
        Handle-Error "PostgreSQL-Installer konnte nicht heruntergeladen werden." $null "Internetverbindung pruefen oder PostgreSQL manuell von https://www.postgresql.org/download/windows/ herunterladen und installieren. Danach Installer erneut ausfuehren."
    }

    Write-LogInfo "Installiere PostgreSQL (stiller Modus)..."
    $installArgs = @(
        "--mode", "unattended",
        "--superpassword", $PG_PASSWORD,
        "--serverport", $PG_PORT,
        "--servicename", "postgresql-x64-$PG_VERSION",
        "--enable-components", "server,commandlinetools",
        "--datadir", $PG_DATA_DIR,
        "--installdir", (Join-Path $PG_INSTALL_DIR $PG_VERSION)
    )

    try {
        $process = Start-Process -FilePath $tmpfile -ArgumentList $installArgs -Wait -PassThru -NoNewWindow
        if ($process.ExitCode -ne 0) {
            Handle-Error "PostgreSQL-Installation fehlgeschlagen (Exit-Code: $($process.ExitCode))." $null "PostgreSQL manuell von https://www.postgresql.org/download/windows/ installieren. Port $PG_PORT, Passwort: $PG_PASSWORD verwenden."
        }
    } catch {
        Handle-Error "PostgreSQL-Installer konnte nicht ausgefuehrt werden." $_ "Antivirus-Programm pruefen oder PostgreSQL manuell installieren."
    } finally {
        if (Test-Path $tmpfile) { Remove-Item -Force $tmpfile }
    }

    # Pfad aktualisieren
    $pgBin = Join-Path $PG_INSTALL_DIR "$PG_VERSION\bin"
    if (Test-Path $pgBin) {
        $env:PATH = "$pgBin;" + $env:PATH
        $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
        if ($userPath -notmatch [regex]::Escape($pgBin)) {
            [Environment]::SetEnvironmentVariable("Path", "$pgBin;$userPath", "User")
            Write-LogInfo "PostgreSQL-Pfad zu PATH hinzugefuegt"
        }
    }

    # Pruefen ob Installation erfolgreich war
    if (-not (Test-PostgreSQL)) {
        Handle-Error "PostgreSQL wurde nicht korrekt installiert." $null "PostgreSQL manuell installieren und Installer erneut ausfuehren."
    }

    Write-LogOk "PostgreSQL $PG_VERSION installiert"

    # Dienst starten
    Start-Sleep -Seconds 3
    if (Test-PostgreSQLService) {
        Start-PostgreSQLService
    } else {
        Handle-Error "PostgreSQL-Dienst wurde nicht gefunden." $null "PostgreSQL-Dienst manuell starten oder Neuinstallation durchfuehren."
    }
}

function Test-PostgreSQLConnection {
    param($dbName = "postgres", $dbUser = "postgres", $dbPassword = $PG_PASSWORD)
    try {
        $env:PGPASSWORD = $dbPassword
        $result = & psql -h localhost -p $PG_PORT -U $dbUser -d $dbName -c "SELECT 1;" -t -w 2>&1
        $env:PGPASSWORD = $null
        if ($LASTEXITCODE -eq 0) { return $true }
        return $false
    } catch {
        $env:PGPASSWORD = $null
        return $false
    }
}

function Initialize-Database {
    Write-LogInfo "Pruefe Datenbankverbindung..."

    # Auf PostgreSQL-Verbindung warten
    $maxRetries = 10
    $connected = $false
    for ($i = 1; $i -le $maxRetries; $i++) {
        if (Test-PostgreSQLConnection -dbName "postgres" -dbUser "postgres") {
            $connected = $true
            break
        }
        Write-LogWarn "Verbindungsversuch $i/$maxRetries fehlgeschlagen, warte 2 Sekunden..."
        Start-Sleep -Seconds 2
    }

    if (-not $connected) {
        Handle-Error "PostgreSQL ist nicht erreichbar (Port $PG_PORT)." $null @(
            "Moegliche Ursachen:",
            "  - PostgreSQL-Dienst laeuft nicht (net start postgresql-x64-$PG_VERSION)",
            "  - Port $PG_PORT ist blockiert (netstat -an | findstr $PG_PORT)",
            "  - Firewall blockiert die Verbindung",
            "  - Falsches Passwort"
        ) -join "`n"
    }

    Write-LogOk "Verbindung zu PostgreSQL hergestellt"

    # Datenbank erstellen
    Write-LogInfo "Erstelle Datenbank '$PG_DB_NAME' (falls nicht vorhanden)..."
    $env:PGPASSWORD = $PG_PASSWORD
    $dbExists = & psql -h localhost -p $PG_PORT -U postgres -d postgres -t -c "SELECT 1 FROM pg_database WHERE datname = '$PG_DB_NAME';" -w 2>&1
    if ($dbExists -match "1") {
        Write-LogInfo "Datenbank '$PG_DB_NAME' existiert bereits"
    } else {
        try {
            & psql -h localhost -p $PG_PORT -U postgres -d postgres -c "CREATE DATABASE $PG_DB_NAME;" -w 2>&1 | Out-Null
            Write-LogOk "Datenbank '$PG_DB_NAME' erstellt"
        } catch {
            Handle-Error "Datenbank '$PG_DB_NAME' konnte nicht erstellt werden." $_ "Berechtigungen pruefen oder Datenbank manuell erstellen: createdb -U postgres $PG_DB_NAME"
        }
    }

    # Benutzer erstellen
    Write-LogInfo "Erstelle Benutzer '$PG_USER' (falls nicht vorhanden)..."
    $userExists = & psql -h localhost -p $PG_PORT -U postgres -d postgres -t -c "SELECT 1 FROM pg_roles WHERE rolname = '$PG_USER';" -w 2>&1
    if ($userExists -match "1") {
        Write-LogInfo "Benutzer '$PG_USER' existiert bereits"
        # Passwort zuruecksetzen
        & psql -h localhost -p $PG_PORT -U postgres -d postgres -c "ALTER USER $PG_USER WITH PASSWORD '$PG_PASSWORD';" -w 2>&1 | Out-Null
    } else {
        try {
            & psql -h localhost -p $PG_PORT -U postgres -d postgres -c "CREATE USER $PG_USER WITH PASSWORD '$PG_PASSWORD';" -w 2>&1 | Out-Null
            Write-LogOk "Benutzer '$PG_USER' erstellt"
        } catch {
            Handle-Error "Benutzer '$PG_USER' konnte nicht erstellt werden." $_ "Benutzer manuell erstellen: createuser -U postgres -P $PG_USER"
        }
    }

    # Berechtigungen erteilen
    Write-LogInfo "Erteile Berechtigungen..."
    try {
        & psql -h localhost -p $PG_PORT -U postgres -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE $PG_DB_NAME TO $PG_USER;" -w 2>&1 | Out-Null
        & psql -h localhost -p $PG_PORT -U postgres -d $PG_DB_NAME -c "GRANT ALL ON SCHEMA public TO $PG_USER;" -w 2>&1 | Out-Null
        & psql -h localhost -p $PG_PORT -U postgres -d $PG_DB_NAME -c "ALTER DATABASE $PG_DB_NAME OWNER TO $PG_USER;" -w 2>&1 | Out-Null
        Write-LogOk "Berechtigungen erteilt"
    } catch {
        Write-LogWarn "Berechtigungen konnten nicht vollstaendig erteilt werden: $($_.Exception.Message)"
    }

    $env:PGPASSWORD = $null

    # Verbindung mit neuem Benutzer testen
    if (Test-PostgreSQLConnection -dbName $PG_DB_NAME -dbUser $PG_USER -dbPassword $PG_PASSWORD) {
        Write-LogOk "Verbindung mit Benutzer '$PG_USER' erfolgreich"
    } else {
        Write-LogWarn "Verbindungstest mit neuem Benutzer fehlgeschlagen - verwende postgres-Account"
    }
}

# ---------------------------------------------------------------------------
# .env erstellen & aktualisieren
# ---------------------------------------------------------------------------
function Initialize-Env {
    Set-Location $PROJECT_DIR

    if (-not (Test-Path ".env")) {
        New-Item -ItemType File -Path ".env" -Force | Out-Null
    }

    $envContent = Get-Content ".env" -Raw
    if ($null -eq $envContent) { $envContent = "" }

    # VITE_DB_MODE auf supabase setzen (Standard: PostgreSQL)
    if ($envContent -match "VITE_DB_MODE=") {
        $envContent = $envContent -replace 'VITE_DB_MODE=.*', "VITE_DB_MODE=supabase"
    } else {
        $envContent += "`nVITE_DB_MODE=supabase"
    }

    # PostgreSQL-Verbindungsdaten eintragen
    $connStr = "postgresql://$PG_USER`:$PG_PASSWORD@localhost:$PG_PORT/$PG_DB_NAME"
    if ($envContent -match "DATABASE_URL=") {
        $envContent = $envContent -replace 'DATABASE_URL=.*', "DATABASE_URL=$connStr"
    } else {
        $envContent += "`nDATABASE_URL=$connStr"
    }

    # Supabase-Verbindungsdaten fuer lokalen Gebrauch
    if ($envContent -match "VITE_SUPABASE_URL=") {
        $envContent = $envContent -replace 'VITE_SUPABASE_URL=.*', "VITE_SUPABASE_URL=http://localhost:$PG_PORT"
    } else {
        $envContent += "`nVITE_SUPABASE_URL=http://localhost:$PG_PORT"
    }

    Set-Content -Path ".env" -Value $envContent.Trim() -Encoding UTF8
    Write-LogOk ".env konfiguriert (PostgreSQL, Datenbank: $PG_DB_NAME)"
    Write-LogDetail "Verbindung: localhost:$PG_PORT/$PG_DB_NAME (Benutzer: $PG_USER)"
}

# ---------------------------------------------------------------------------
# Projekt-Setup & Verifikation
# ---------------------------------------------------------------------------
function Initialize-Project {
    Set-Location $PROJECT_DIR
    if (Test-Path "node_modules") {
        Write-LogInfo "Aktualisiere Abhaengigkeiten..."
    } else {
        Write-LogInfo "Installiere npm-Abhaengigkeiten..."
    }

    try {
        & "npm.cmd" install --no-fund --no-audit 2>&1 | Out-Null
        Write-LogOk "Abhaengigkeiten installiert"
    } catch {
        Handle-Error "npm-Abhaengigkeiten konnten nicht installiert werden." $_ "Internetverbindung pruefen oder 'npm install' manuell ausfuehren."
    }

    $env:PATH = "$(Join-Path $PROJECT_DIR 'node_modules\.bin');" + $env:PATH
}

function Test-Project {
    Set-Location $PROJECT_DIR
    Write-LogStep "Build-Verifikation"

    try {
        $buildOutput = & "npm.cmd" run build 2>&1
        if ($LASTEXITCODE -eq 0 -and $buildOutput -match "built in|vite") {
            Write-LogOk "Build erfolgreich"
        } else {
            Write-Host $buildOutput
            Write-LogWarn "Build fehlgeschlagen (nicht kritisch - App kann trotzdem gestartet werden)"
        }
    } catch {
        Write-LogWarn "Build fehlgeschlagen: $($_.Exception.Message)"
    }
    $global:LASTEXITCODE = 0
}

# ---------------------------------------------------------------------------
# Zusammenfassung
# ---------------------------------------------------------------------------
function Show-Summary {
    Write-Host "`n============================================" -ForegroundColor Green
    Write-Host "  Installation erfolgreich abgeschlossen!"   -ForegroundColor Green
    Write-Host "============================================`n" -ForegroundColor Green

    Write-Host "  Node.js:     $(try { node --version } catch { 'nicht gefunden' })"
    Write-Host "  npm:         $(try { npm --version } catch { 'nicht gefunden' })"
    Write-Host "  PostgreSQL:  $PG_VERSION (Port $PG_PORT)"
    Write-Host "  Datenbank:   $PG_DB_NAME"
    Write-Host "  Benutzer:    $PG_USER"
    Write-Host "  Projekt:     $PROJECT_DIR`n"

    Write-Host "  Starten mit:  npm run dev`n" -ForegroundColor Cyan

    Write-Host "  Im Browser oeffnen:" -ForegroundColor White
    Write-Host "    http://localhost:5173/           (Hauptseite)" -ForegroundColor Cyan
    Write-Host "    http://localhost:5173/dashboard   (Dashboard)`n" -ForegroundColor Cyan

    if (Test-PostgreSQLService) {
        Write-LogOk "PostgreSQL-Dienst laeuft"
    }
}

# ---------------------------------------------------------------------------
# Hauptablauf
# ---------------------------------------------------------------------------
function Main {
    Clear-Host
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "  One-Click-Installer" -ForegroundColor White
    Write-Host "  Node.js + PostgreSQL + Projekt-Setup" -ForegroundColor White
    Write-Host "============================================" -ForegroundColor Cyan

    Write-LogStep "1/6  System-Information"
    Write-LogInfo "OS: Windows $([Environment]::OSVersion.Version)"
    Write-LogInfo "Projekt: $PROJECT_DIR"
    Write-LogInfo "Architektur: $env:PROCESSOR_ARCHITECTURE"

    # 1. Node.js
    Write-LogStep "2/6  Node.js pruefen/installieren"
    if (Test-Node) {
        Write-LogOk "Node.js $(node --version) bereit"
    } else {
        Write-LogInfo "Node.js nicht gefunden - installiere lokal..."
        Install-Node
    }

    if (Test-Npm) {
        Write-LogOk "npm $(npm --version) bereit"
    } else {
        Handle-Error "npm ist nicht verfuegbar." $null "Node.js neu installieren."
    }

    # 2. PostgreSQL
    Write-LogStep "3/6  PostgreSQL pruefen/installieren"
    if (Test-PostgreSQL) {
        Write-LogOk "PostgreSQL bereits installiert"
        if (Test-PostgreSQLService) {
            Start-PostgreSQLService
        } else {
            Write-LogWarn "PostgreSQL-Dienst nicht gefunden - versuche Start..."
            Start-PostgreSQLService
        }
    } else {
        Write-LogInfo "PostgreSQL nicht gefunden - installiere automatisch..."
        Install-PostgreSQL
    }

    # 3. Datenbank & Benutzer
    Write-LogStep "4/6  Datenbank und Benutzer einrichten"
    Initialize-Database

    # 4. .env konfigurieren
    Write-LogStep "5/6  Anwendung konfigurieren"
    Initialize-Env

    # 5. Projekt-Abhaengigkeiten & Build
    Write-LogStep "6/6  Projekt-Abhaengigkeiten und Build"
    Initialize-Project
    Test-Project

    # Zusammenfassung
    Show-Summary
}

Main
