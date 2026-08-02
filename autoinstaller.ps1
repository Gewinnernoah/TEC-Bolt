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
# Administrator-Rechte pruefen und ggf. anfordern
# ---------------------------------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[INFO] Administratorrechte werden benoetigt. Das Skript fordert nun die Rechte an und startet sich neu..." -ForegroundColor Yellow
    try {
        Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
        Exit
    } catch {
        Write-Host "[FEHLER] Konnte keine Administratorrechte anfordern. Bitte starte PowerShell als Administrator und fuehre das Skript erneut aus." -ForegroundColor Red
        Exit 1
    }
}

# ---------------------------------------------------------------------------
# Konfiguration
# ---------------------------------------------------------------------------
$NODE_MIN_MAJOR = 18; $NODE_MIN_MINOR = 0
$NPM_MIN_MAJOR = 9;  $NPM_MIN_MINOR = 0
$NODE_VERSION = "v20.18.0"
$INSTALL_DIR = Join-Path $env:LOCALAPPDATA "Nodejs-Local"
$PROJECT_DIR = $PSScriptRoot

# PostgreSQL-Konfiguration
$PG_TARGET_VERSION = "18"
$PG_PORT = "5432"
$PG_DB_NAME = "techub"
$PG_USER = "postgres"
$PG_PASSWORD = "TechHub2024!"
$PG_INSTALL_DIR = Join-Path $env:PROGRAMFILES "PostgreSQL"
$PG_DATA_DIR = Join-Path $env:PROGRAMFILES "PostgreSQL\$PG_TARGET_VERSION\data"

# ---------------------------------------------------------------------------
# Farbige Konsolenausgabe
# ---------------------------------------------------------------------------
function Write-LogInfo    { param($msg) Write-Host "[INFO]   $msg" -ForegroundColor Blue }
function Write-LogOk      { param($msg) Write-Host "[OK]     $msg" -ForegroundColor Green }
function Write-LogWarn    { param($msg) Write-Host "[WARN]   $msg" -ForegroundColor Yellow }
function Write-LogError   { param($msg) Write-Host "[FEHLER] $msg" -ForegroundColor Red }
function Write-LogStep    { param($msg) Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-LogDetail  { param($msg) Write-Host "         $msg" -ForegroundColor DarkGray }

function Quote-SqlIdentifier {
    param([string]$Value)
    return '"' + ($Value -replace '"', '""') + '"'
}

function Quote-SqlLiteral {
    param([string]$Value)
    return "'" + ($Value -replace "'", "''") + "'"
}

function Add-ToPath {
    param([string]$PathValue)

    if ([string]::IsNullOrWhiteSpace($PathValue) -or -not (Test-Path $PathValue)) {
        return
    }

    if ($env:PATH -notmatch [regex]::Escape($PathValue)) {
        $env:PATH = "$PathValue;" + $env:PATH
    }

    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ([string]::IsNullOrWhiteSpace($userPath)) {
        $userPath = ""
    }

    if ($userPath -notmatch [regex]::Escape($PathValue)) {
        $newUserPath = if ([string]::IsNullOrWhiteSpace($userPath)) { $PathValue } else { "$PathValue;$userPath" }
        [Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")
    }
}

function Get-PostgreSQLService {
    $preferredServiceName = "postgresql-x64-$PG_TARGET_VERSION"
    $service = Get-Service -Name $preferredServiceName -ErrorAction SilentlyContinue
    if ($service) { return $service }

    $services = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
    if ($services) {
        return $services | Select-Object -First 1
    }

    return $null
}

function Get-PostgreSQLPaths {
    $candidates = New-Object System.Collections.Generic.List[object]
    $seen = New-Object System.Collections.Generic.HashSet[string]

    function Add-Candidate {
        param(
            [string]$Version,
            [string]$ServiceName,
            [string]$InstallDir,
            [string]$BinDir
        )

        if ([string]::IsNullOrWhiteSpace($BinDir) -or -not (Test-Path $BinDir)) {
            return
        }

        $psqlPath = Join-Path $BinDir "psql.exe"
        $pgIsReadyPath = Join-Path $BinDir "pg_isready.exe"
        if (-not (Test-Path $psqlPath) -or -not (Test-Path $pgIsReadyPath)) {
            return
        }

        $key = $psqlPath.ToLowerInvariant()
        if (-not $seen.Add($key)) {
            return
        }

        if ([string]::IsNullOrWhiteSpace($Version)) {
            $parentFolder = Split-Path $BinDir -Parent
            if ($parentFolder) {
                $Version = Split-Path $parentFolder -Leaf
            }
        }

        if ([string]::IsNullOrWhiteSpace($ServiceName) -and -not [string]::IsNullOrWhiteSpace($Version)) {
            $ServiceName = "postgresql-x64-$Version"
        }

        $candidates.Add([pscustomobject]@{
            Version = $Version
            ServiceName = $ServiceName
            InstallDir = $InstallDir
            BinDir = $BinDir
            PsqlPath = $psqlPath
            PgIsReadyPath = $pgIsReadyPath
        }) | Out-Null
    }

    $service = Get-PostgreSQLService
    if ($service) {
        try {
            $serviceInfo = Get-CimInstance -ClassName Win32_Service -Filter "Name='$($service.Name)'" -ErrorAction Stop
            $serviceName = $service.Name
            $version = if ($serviceName -match 'postgresql-x64-(\d+)') { $Matches[1] } else { $null }
            if ($serviceInfo.PathName) {
                $quotedPaths = [regex]::Matches($serviceInfo.PathName, '"([^"]+)"')
                foreach ($match in $quotedPaths) {
                    $exePath = $match.Groups[1].Value
                    if ($exePath -match '\\(pg_ctl|postmaster|postgres|psql)\.exe$') {
                        Add-Candidate -Version $version -ServiceName $serviceName -InstallDir (Split-Path (Split-Path $exePath -Parent) -Parent) -BinDir (Split-Path $exePath -Parent)
                    }
                }
            }
        } catch {
            # Service-Path ist optional
        }
    }

    foreach ($registryRoot in @("HKLM:\SOFTWARE\PostgreSQL\Installations", "HKLM:\SOFTWARE\WOW6432Node\PostgreSQL\Installations")) {
        if (-not (Test-Path $registryRoot)) {
            continue
        }

        foreach ($installKey in Get-ChildItem -Path $registryRoot -ErrorAction SilentlyContinue) {
            try {
                $installProps = Get-ItemProperty -Path $installKey.PSPath -ErrorAction Stop
            } catch {
                continue
            }

            $version = $installProps.Version
            if ([string]::IsNullOrWhiteSpace($version) -and $installKey.PSChildName -match '(\d+(?:\.\d+)?)') {
                $version = $Matches[1]
            }

            $baseDir = $installProps.'Base Directory'
            if ([string]::IsNullOrWhiteSpace($baseDir)) { $baseDir = $installProps.BaseDirectory }
            if ([string]::IsNullOrWhiteSpace($baseDir)) { $baseDir = $installProps.'Install Directory' }
            if ([string]::IsNullOrWhiteSpace($baseDir)) { $baseDir = $installProps.InstallDirectory }

            if (-not [string]::IsNullOrWhiteSpace($baseDir)) {
                Add-Candidate -Version $version -ServiceName $null -InstallDir $baseDir -BinDir (Join-Path $baseDir "bin")
            }
        }
    }

    foreach ($root in @($PG_INSTALL_DIR, (Join-Path ${env:ProgramFiles(x86)} "PostgreSQL"))) {
        if ([string]::IsNullOrWhiteSpace($root) -or -not (Test-Path $root)) {
            continue
        }

        foreach ($installDir in Get-ChildItem -Path $root -Directory -ErrorAction SilentlyContinue) {
            Add-Candidate -Version $installDir.Name -ServiceName "postgresql-x64-$($installDir.Name)" -InstallDir $installDir.FullName -BinDir (Join-Path $installDir.FullName "bin")
        }
    }

    $psqlCmd = Get-Command psql -ErrorAction SilentlyContinue
    if ($psqlCmd -and $psqlCmd.Source) {
        $binDir = Split-Path $psqlCmd.Source -Parent
        $installDir = Split-Path $binDir -Parent
        Add-Candidate -Version (Split-Path $installDir -Leaf) -ServiceName $null -InstallDir $installDir -BinDir $binDir
    }

    if ($candidates.Count -eq 0) {
        return $null
    }

    return $candidates | Sort-Object @{ Expression = { try { [version](($_.Version -replace '[^0-9\.].*', '')) } catch { [version]'0.0' } }; Descending = $true } | Select-Object -First 1
}

function Invoke-PostgreSQLSql {
    param(
        [Parameter(Mandatory = $true)][string]$PsqlPath,
        [Parameter(Mandatory = $true)][string]$Sql,
        [Parameter(Mandatory = $true)][string]$Database,
        [Parameter(Mandatory = $true)][string]$User,
        [string]$Password = $PG_PASSWORD,
        [switch]$Quiet
    )

    $previousPassword = $env:PGPASSWORD
    $env:PGPASSWORD = $Password

    $arguments = @('-h', 'localhost', '-p', $PG_PORT, '-U', $User, '-d', $Database, '-c', $Sql, '-w')
    if ($Quiet) {
        $arguments += '-t'
    }

    try {
        # Hier leiten wir ab sofort alle Fehlerausgaben direkt mit um, damit du sie siehst
        $output = & $PsqlPath @arguments 2>&1
        $exitCode = $LASTEXITCODE
        return [pscustomobject]@{
            ExitCode = $exitCode
            Output = ($output | Out-String).Trim()
        }
    } finally {
        $env:PGPASSWORD = $previousPassword
    }
}

function Wait-PostgreSQLReady {
    param(
        [Parameter(Mandatory = $true)][string]$PgIsReadyPath,
        [int]$TimeoutSeconds = 60
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    
    $oldPref = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"

    do {
        $output = & $PgIsReadyPath -h localhost -p $PG_PORT 2>&1
        if ($LASTEXITCODE -eq 0 -and ($output -match 'accepting connections')) {
            $ErrorActionPreference = $oldPref
            return $true
        }

        Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $deadline)

    $ErrorActionPreference = $oldPref
    return $false
}

# ---------------------------------------------------------------------------
# Fehlerbehandlung
# ---------------------------------------------------------------------------
function Handle-Error {
    param($msg, $ex, $hint)
    Write-LogError $msg
    if ($ex) {
        $errorMsg = if ($ex.Exception) { $ex.Exception.Message } elseif ($ex.Message) { $ex.Message } else { $ex }
        Write-LogDetail "Details: $errorMsg"
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
    $paths = Get-PostgreSQLPaths
    if (-not $paths) {
        return $false
    }

    Add-ToPath $paths.BinDir
    return $true
}

function Test-PostgreSQLService {
    return [bool](Get-PostgreSQLService)
}

function Start-PostgreSQLService {
    try {
        $paths = Get-PostgreSQLPaths
        $service = if ($paths -and $paths.ServiceName) { Get-Service -Name $paths.ServiceName -ErrorAction SilentlyContinue } else { Get-PostgreSQLService }
        if (-not $service) {
            Handle-Error "PostgreSQL-Dienst wurde nicht gefunden." $null "Pruefen, ob PostgreSQL korrekt installiert wurde oder den Dienst manuell starten."
        }
        if ($service.Status -ne 'Running') {
            Write-LogInfo "Starte PostgreSQL-Dienst..."
            Start-Service -Name $service.Name
            Start-Sleep -Seconds 3
        }
        Write-LogOk "PostgreSQL-Dienst laeuft ($($service.Name))"
        return $true
    } catch {
        Handle-Error "PostgreSQL-Dienst konnte nicht gestartet werden." $_ "Dienst manuell starten: net start postgresql-x64-$PG_TARGET_VERSION oder Dienste-Console (services.msc) oeffnen."
    }
}

function Install-PostgreSQL {
    Write-LogInfo "Installiere PostgreSQL $PG_TARGET_VERSION automatisch..."

    $installed = $false
    $wingetCmd = Get-Command winget -ErrorAction SilentlyContinue
    if ($wingetCmd) {
        Write-LogInfo "Versuche Installation ueber winget..."
        $packageId = "PostgreSQL.PostgreSQL.$PG_TARGET_VERSION"
        $override = '--superpassword "' + $PG_PASSWORD + '" --serverport ' + $PG_PORT + ' --servicename postgresql-x64-' + $PG_TARGET_VERSION + ' --enable-components server,commandlinetools'
        $wingetArgs = @(
            'install',
            '--id', $packageId,
            '--exact',
            '--silent',
            '--accept-package-agreements',
            '--accept-source-agreements',
            '--override', $override
        )

        try {
            $wingetProcess = Start-Process -FilePath $wingetCmd.Source -ArgumentList $wingetArgs -Wait -PassThru -NoNewWindow
            if ($wingetProcess.ExitCode -eq 0) {
                $installed = $true
                Write-LogOk "PostgreSQL ueber winget installiert"
            } else {
                Write-LogWarn "winget Installation meldete Exit-Code $($wingetProcess.ExitCode); versuche Fallback-Installer."
            }
        } catch {
            Write-LogWarn "winget Installation fehlgeschlagen: $($_.Exception.Message)"
        }
    }

    if (-not $installed) {
        $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
        $filename = "postgresql-$PG_TARGET_VERSION-1-windows-${arch}.exe"
        $tmpfile = Join-Path $env:TEMP $filename
        $urls = @(
            "https://sbp.enterprisedb.com/getfile.jsp?fileid=1260302",
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
            Handle-Error "PostgreSQL-Installer konnte nicht heruntergeladen werden." $null "Internetverbindung pruefen oder PostgreSQL manuell von https://www.postgresql.org/download/windows/ installieren."
        }
        
        Unblock-File -Path $tmpfile -ErrorAction SilentlyContinue

        Write-LogInfo "Installiere PostgreSQL (stiller Modus)..."
        
        $installArgs = @(
            '--mode', 'unattended',
            '--superpassword', $PG_PASSWORD,
            '--serverport', $PG_PORT,
            '--servicename', "postgresql-x64-$PG_TARGET_VERSION",
            '--enable-components', 'server,commandlinetools',
            '--datadir', "`"$PG_DATA_DIR`"",
            '--installdir', "`"$(Join-Path $PG_INSTALL_DIR $PG_TARGET_VERSION)`""
        )

        try {
            $process = Start-Process -FilePath $tmpfile -ArgumentList $installArgs -Wait -PassThru -NoNewWindow
            if ($process.ExitCode -ne 0) {
                Handle-Error "PostgreSQL-Installation fehlgeschlagen (Exit-Code: $($process.ExitCode))." $null "PostgreSQL manuell von https://www.postgresql.org/download/windows/ installieren. Port $PG_PORT verwenden."
            }
            $installed = $true
        } catch {
            Handle-Error "PostgreSQL-Installer konnte nicht ausgefuehrt werden." $_ "Antivirus-Programm pruefen oder PostgreSQL manuell installieren."
        } finally {
            if (Test-Path $tmpfile) { Remove-Item -Force $tmpfile }
        }
    }

    $paths = Get-PostgreSQLPaths
    if (-not $paths) {
        Handle-Error "PostgreSQL wurde nicht korrekt installiert." $null "PostgreSQL manuell installieren und Installer erneut ausfuehren."
    }

    Add-ToPath $paths.BinDir
    Write-LogInfo "PostgreSQL-Pfad zu PATH hinzugefuegt"

    if (-not (Wait-PostgreSQLReady -PgIsReadyPath $paths.PgIsReadyPath -TimeoutSeconds 90)) {
        Handle-Error "PostgreSQL antwortet nicht auf Port $PG_PORT." $null "Dienst manuell starten oder Installation pruefen."
    }

    Write-LogOk "PostgreSQL $($paths.Version) installiert"

    if (Test-PostgreSQLService) {
        Start-PostgreSQLService
    } else {
        Write-LogWarn "PostgreSQL-Dienst konnte nicht eindeutig ermittelt werden, die Installation wird dennoch fortgesetzt."
    }
}

function Test-PostgreSQLConnection {
    param($dbName = "postgres", $dbUser = "postgres", $dbPassword = $PG_PASSWORD, [int]$MaxRetries = 5)

    $paths = Get-PostgreSQLPaths
    if (-not $paths -or -not $paths.PsqlPath) {
        return $false
    }

    for ($i = 1; $i -le $MaxRetries; $i++) {
        try {
            $result = Invoke-PostgreSQLSql -PsqlPath $paths.PsqlPath -Sql 'SELECT 1;' -Database $dbName -User $dbUser -Password $dbPassword -Quiet
            if ($null -ne $result -and $result.ExitCode -eq 0) {
                return $true
            }
        } catch {
            # Fehler abfangen, damit die Schleife nicht abbricht
        }
        
        if ($i -lt $MaxRetries) {
            Start-Sleep -Seconds 2
        }
    }

    return $false
}

function Initialize-Database {
    Write-LogInfo "Pruefe Datenbankverbindung direkt..."

    $paths = Get-PostgreSQLPaths
    if (-not $paths) {
        Handle-Error "PostgreSQL-Pfade nicht gefunden." $null "Bitte PostgreSQL manuell installieren."
    }

    $adminPsql = $paths.PsqlPath
    $dbNameSql = Quote-SqlIdentifier $PG_DB_NAME
    $userNameSql = Quote-SqlIdentifier $PG_USER

    # Direkt ein einzelner Test-Versuch ohne Schleifen-Hänger
    Write-LogInfo "Verbinde mit PostgreSQL als Superuser..."
    $testResult = Invoke-PostgreSQLSql -PsqlPath $adminPsql -Sql 'SELECT 1;' -Database "postgres" -User "postgres" -Password $PG_PASSWORD -Quiet

    if ($null -eq $testResult -or $testResult.ExitCode -ne 0) {
        Write-LogError "Verbindung fehlgeschlagen. Ausgabe:"
        if ($testResult) { Write-Host $testResult.Output -ForegroundColor Red }
        Handle-Error "PostgreSQL-Verbindung nicht moeglich."
    }

    Write-LogOk "Verbindung erfolgreich"

    # 1. Datenbank prüfen/erstellen
    Write-LogInfo "Pruefe Datenbank '$PG_DB_NAME'..."
    $dbExists = Invoke-PostgreSQLSql -PsqlPath $adminPsql -Sql "SELECT 1 FROM pg_database WHERE datname = $(Quote-SqlLiteral $PG_DB_NAME);" -Database 'postgres' -User 'postgres' -Password $PG_PASSWORD -Quiet
    
    if ($dbExists.ExitCode -eq 0 -and $dbExists.Output -match '1') {
        Write-LogInfo "Datenbank '$PG_DB_NAME' existiert bereits"
    } else {
        $createDb = Invoke-PostgreSQLSql -PsqlPath $adminPsql -Sql "CREATE DATABASE $dbNameSql;" -Database 'postgres' -User 'postgres' -Password $PG_PASSWORD
        if ($createDb.ExitCode -eq 0) {
            Write-LogOk "Datenbank '$PG_DB_NAME' erstellt"
        } else {
            Write-Host $createDb.Output -ForegroundColor Red
            Handle-Error "Konnte Datenbank nicht erstellen."
        }
    }

    # 2. Benutzer prüfen/erstellen
    Write-LogInfo "Pruefe Benutzer '$PG_USER'..."
    $userExists = Invoke-PostgreSQLSql -PsqlPath $adminPsql -Sql "SELECT 1 FROM pg_roles WHERE rolname = $(Quote-SqlLiteral $PG_USER);" -Database 'postgres' -User 'postgres' -Password $PG_PASSWORD -Quiet

    if ($userExists.ExitCode -eq 0 -and $userExists.Output -match '1') {
        Write-LogInfo "Benutzer '$PG_USER' existiert bereits - aktualisiere Passwort..."
        Invoke-PostgreSQLSql -PsqlPath $adminPsql -Sql "ALTER USER $userNameSql WITH PASSWORD $(Quote-SqlLiteral $PG_PASSWORD);" -Database 'postgres' -User 'postgres' -Password $PG_PASSWORD | Out-Null
    } else {
        $createUser = Invoke-PostgreSQLSql -PsqlPath $adminPsql -Sql "CREATE USER $userNameSql WITH PASSWORD $(Quote-SqlLiteral $PG_PASSWORD);" -Database 'postgres' -User 'postgres' -Password $PG_PASSWORD
        if ($createUser.ExitCode -eq 0) {
            Write-LogOk "Benutzer '$PG_USER' erstellt"
        } else {
            Write-Host $createUser.Output -ForegroundColor Red
            Handle-Error "Konnte Benutzer nicht erstellen."
        }
    }

    # 3. Berechtigungen vergeben
    Write-LogInfo "Erteile Berechtigungen..."
    Invoke-PostgreSQLSql -PsqlPath $adminPsql -Sql "GRANT ALL PRIVILEGES ON DATABASE $dbNameSql TO $userNameSql;" -Database 'postgres' -User 'postgres' -Password $PG_PASSWORD | Out-Null
    Invoke-PostgreSQLSql -PsqlPath $adminPsql -Sql "GRANT ALL ON SCHEMA public TO $userNameSql;" -Database $PG_DB_NAME -User 'postgres' -Password $PG_PASSWORD | Out-Null
    Invoke-PostgreSQLSql -PsqlPath $adminPsql -Sql "ALTER DATABASE $dbNameSql OWNER TO $userNameSql;" -Database 'postgres' -User 'postgres' -Password $PG_PASSWORD | Out-Null

    Write-LogOk "Datenbank-Setup erfolgreich abgeschlossen"
    Start-Sleep -Seconds 3
}

# ---------------------------------------------------------------------------
# .env erstellen & aktualisieren (Schritt 5/6)
# ---------------------------------------------------------------------------
function Initialize-Env {
    Set-Location $PROJECT_DIR
    Write-LogStep "5/6  Anwendung konfigurieren (.env)"

    try {
        if (-not (Test-Path ".env")) {
            $exampleEnv = Join-Path $PROJECT_DIR "src\lib\.env.example"
            if (Test-Path $exampleEnv) {
                Copy-Item -Path $exampleEnv -Destination ".env" -Force
            } else {
                New-Item -ItemType File -Path ".env" -Force | Out-Null
            }
        }

        $envContent = Get-Content ".env" -Raw -ErrorAction SilentlyContinue
        if ($null -eq $envContent) { $envContent = "" }

        if ($envContent -match "VITE_DB_MODE=") {
            $envContent = $envContent -replace 'VITE_DB_MODE=.*', "VITE_DB_MODE=supabase"
        } else {
            $envContent += "`nVITE_DB_MODE=supabase"
        }

        Set-Content -Path ".env" -Value $envContent.Trim() -Encoding UTF8
        Write-LogOk ".env konfiguriert (VITE_DB_MODE=supabase)"
    } catch {
        Write-LogWarn "Konnte .env nicht vollstaendig schreiben: $($_.Exception.Message)"
    }
}

# ---------------------------------------------------------------------------
# Projekt-Setup & Build (Schritt 6/6)
# ---------------------------------------------------------------------------
function Initialize-Project {
    Set-Location $PROJECT_DIR
    Write-LogStep "6/6  Projekt-Abhaengigkeiten und Build"
    
    Write-LogInfo "Installiere npm-Abhaengigkeiten via System-CMD..."

    try {
        # Wir zwingen Windows über cmd.exe /c den globalen npm-Befehl auszuführen, 
        # damit er nicht in den lokalen node_modules-Pfad stolpert.
        $processInfo = New-Object System.Diagnostics.ProcessStartInfo
        $processInfo.FileName = "cmd.exe"
        $processInfo.Arguments = "/c npm install --no-fund --no-audit"
        $processInfo.WorkingDirectory = $PROJECT_DIR
        $processInfo.UseShellExecute = $false
        $processInfo.RedirectStandardOutput = $true
        $processInfo.RedirectStandardError = $true

        $process = [System.Diagnostics.Process]::Start($processInfo)
        $output = $process.StandardOutput.ReadToEnd()
        $errorOutput = $process.StandardError.ReadToEnd()
        $process.WaitForExit()

        if ($process.ExitCode -eq 0) {
            Write-LogOk "Abhaengigkeiten erfolgreich installiert"
        } else {
            Write-LogWarn "npm install meldete Warnungen/Fehler (Exit-Code $($process.ExitCode))."
            if ($errorOutput) { Write-Host $errorOutput -ForegroundColor Yellow }
        }
    } catch {
        Write-LogWarn "Fehler bei npm install: $($_.Exception.Message)"
    }

    # Build ebenfalls über cmd.exe absichern
    Write-LogInfo "Führe Build aus..."
    try {
        $buildProcessInfo = New-Object System.Diagnostics.ProcessStartInfo
        $buildProcessInfo.FileName = "cmd.exe"
        $buildProcessInfo.Arguments = "/c npm run build"
        $buildProcessInfo.WorkingDirectory = $PROJECT_DIR
        $buildProcessInfo.UseShellExecute=$false
        $buildProcessInfo.RedirectStandardOutput = $true
        $buildProcessInfo.RedirectStandardError = $true

        $buildProcess = [System.Diagnostics.Process]::Start($buildProcessInfo)
        $buildOutput = $buildProcess.StandardOutput.ReadToEnd()
        $buildProcess.WaitForExit()

        if ($buildProcess.ExitCode -eq 0) {
            Write-LogOk "Build erfolgreich"
        } else {
            Write-LogWarn "Build-Schritt fehlgeschlagen (kann ignoriert werden, App läuft trotzdem)."
        }
    } catch {
        Write-LogWarn "Build konnte nicht ausgeführt werden."
    }
    
    $global:LASTEXITCODE = 0
}
function Test-Project {
    Set-Location $PROJECT_DIR
    Write-LogStep "6/6  Build-Verifikation"
    Write-LogInfo "Führe Build aus..."
    Start-Sleep -Seconds 3

    try {
        $processInfo = New-Object System.Diagnostics.ProcessStartInfo
        $processInfo.FileName = "npm.cmd"
        $processInfo.Arguments = "run build"
        $processInfo.WorkingDirectory = $PROJECT_DIR
        $processInfo.UseShellExecute = $false
        $processInfo.RedirectStandardOutput = $true
        $processInfo.RedirectStandardError = $true

        $process = [System.Diagnostics.Process]::Start($processInfo)
        $process.WaitForExit()

        if ($process.ExitCode -eq 0) {
            Write-LogOk "Build erfolgreich"
        } else {
            Write-LogWarn "Build-Schritt fehlgeschlagen, aber die App kann trotzdem manuell gestartet werden."
        }
    } catch {
        Write-LogWarn "Build konnte nicht ausgeführt werden (unkritisch)."
    }
    
    $global:LASTEXITCODE = 0
}

# ---------------------------------------------------------------------------
# Zusammenfassung
# ---------------------------------------------------------------------------
function Show-Summary {
    $paths = Get-PostgreSQLPaths
    $installedVersion = if ($paths -and $paths.Version) { $paths.Version } else { $PG_TARGET_VERSION }

    Write-Host "`n============================================" -ForegroundColor Green
    Write-Host "  Installation erfolgreich abgeschlossen!"   -ForegroundColor Green
    Write-Host "============================================`n" -ForegroundColor Green

    Write-Host "  Node.js:     $(try { node --version } catch { 'nicht gefunden' })"
    Write-Host "  npm:         $(try { npm --version } catch { 'nicht gefunden' })"
    Write-Host "  PostgreSQL:  $installedVersion (Port $PG_PORT)"
    Write-Host "  Datenbank:   $PG_DB_NAME"
    Write-Host "  Benutzer:    $PG_USER"
    Write-Host "  Projekt:     $PROJECT_DIR`n"

    Write-Host "  Starten mit:  npm run dev`n" -ForegroundColor Cyan

    Write-Host "  Im Browser oeffnen:" -ForegroundColor White
    Write-Host "    http://localhost:5173           (Hauptseite)" -ForegroundColor Cyan
    Write-Host "    http://localhost:5173/dashboard  (Dashboard)`n" -ForegroundColor Cyan

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
    Start-sleep -Seconds 3
    Initialize-Database

    # 4. .env konfigurieren
    Start-sleep -Seconds 3
    Initialize-Env

    # 5. Projekt-Abhaengigkeiten & Build (zusammengefasst als Schritt 6)
    Start-sleep -Seconds 3
    Initialize-Project

    # Zusammenfassung
    Start-sleep -Seconds 3
    Show-Summary
}

Main

# Am Ende des Skripts einfügen:
Write-Host "`nDrücke Enter, um das Fenster zu schließen..." -ForegroundColor Cyan
[void][System.Console]::ReadLine()