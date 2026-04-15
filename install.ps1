Write-Host "=== ProcViz Installer ===" -ForegroundColor Cyan

# Install uv if not present
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Host "Installing uv..."
    irm https://astral.sh/uv/install.ps1 | iex
}

# Clone repo
$InstallDir = "$env:USERPROFILE\procviz"
if (Test-Path $InstallDir) {
    Write-Host "Updating existing installation..."
    Push-Location $InstallDir
    git pull
} else {
    Write-Host "Cloning ProcViz..."
    git clone https://github.com/your-org/procviz.git $InstallDir
    Push-Location $InstallDir
}

# Install dependencies
Write-Host "Installing dependencies..."
uv sync

# Prompt for credentials
if (-not (Test-Path .env)) {
    Write-Host "`n=== Teradata Configuration ===" -ForegroundColor Cyan
    $TdHost = Read-Host "Teradata host"
    $TdPort = Read-Host "Teradata port [1025]"
    if (-not $TdPort) { $TdPort = "1025" }
    $TdUser = Read-Host "Teradata username"
    $TdPass = Read-Host "Teradata password" -AsSecureString
    $TdPassPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($TdPass))

    @"
TD_HOST=$TdHost
TD_PORT=$TdPort
TD_USER=$TdUser
TD_PASSWORD=$TdPassPlain
"@ | Set-Content .env

    Write-Host ".env created."
}

Write-Host "`n=== Starting ProcViz ===" -ForegroundColor Cyan
Pop-Location
& $InstallDir\start.bat
