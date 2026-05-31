# PowerShell uninstall script for Cowork 3P client (Windows).
# Removes configuration, tokens, helper scripts, and clears caches.
#
# Usage:
#   .\uninstall-windows.ps1

$ErrorActionPreference = "Stop"

# Configuration paths
$StoreDir = "$env:USERPROFILE\.websearch-gw"
$ConfigLibrary = "$env:APPDATA\Claude-3p\configLibrary"
$RegPath = "HKCU:\SOFTWARE\Policies\Claude"

# Registry keys to remove
$KeysToRemove = @(
    "inferenceProvider",
    "inferenceBedrockRegion",
    "inferenceBedrockProfile",
    "inferenceModels",
    "managedMcpServers"
)

function Write-ColorOutput {
    param(
        [ValidateSet('Success', 'Error', 'Warning', 'Info')]
        [string]$Color,
        [string]$Message
    )

    $ColorMap = @{
        'Success' = 'Green'
        'Error' = 'Red'
        'Warning' = 'Yellow'
        'Info' = 'Cyan'
    }

    Write-Host "[$Color] $Message" -ForegroundColor $ColorMap[$Color]
}

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "=== $Title ===" -ForegroundColor Green
    Write-Host ""
}

function Read-Confirm {
    param([string]$Prompt)

    $Response = Read-Host "$Prompt (yes/no)"
    return $Response -eq "yes"
}

Write-Section "Cowork 3P Client Uninstall (Windows)"

# Confirm uninstall
if (-not (Read-Confirm "This will remove all Cowork 3P configuration. Continue?")) {
    Write-ColorOutput -Color Info "Uninstall cancelled"
    exit 0
}

# Remove configuration store
if (Test-Path $StoreDir) {
    Write-ColorOutput -Color Info "Removing configuration store: $StoreDir"
    Remove-Item -Path $StoreDir -Recurse -Force -ErrorAction SilentlyContinue
}

# Remove registry keys
if (Test-Path $RegPath) {
    Write-ColorOutput -Color Info "Removing registry settings..."
    try {
        foreach ($Key in $KeysToRemove) {
            Remove-ItemProperty -Path $RegPath -Name $Key -Force -ErrorAction SilentlyContinue
            Write-ColorOutput -Color Info "  Removed: $Key"
        }
    } catch {
        Write-ColorOutput -Color Warning "Some registry keys could not be removed: $_"
    }
}

# Remove managedMcpServers from configLibrary
if (Test-Path $ConfigLibrary) {
    Write-ColorOutput -Color Info "Removing Cowork config library entries..."
    try {
        $MetaPath = "$ConfigLibrary\_meta.json"
        foreach ($ProfileFile in Get-ChildItem -Path $ConfigLibrary -Filter "*.json" | Where-Object { $_.Name -ne "_meta.json" }) {
            try {
                $Profile = Get-Content $ProfileFile | ConvertFrom-Json
                if ($Profile.PSObject.Properties.Name -contains "managedMcpServers") {
                    $Profile.PSObject.Properties.Remove("managedMcpServers")
                    $Profile | ConvertTo-Json | Set-Content $ProfileFile -Force
                    Write-ColorOutput -Color Info "  Removed managedMcpServers from $($ProfileFile.Name)"
                }
            } catch {
                Write-ColorOutput -Color Warning "  Could not update $($ProfileFile.Name): $_"
            }
        }
    } catch {
        Write-ColorOutput -Color Warning "Could not process config library: $_"
    }
}

# Clear caches
Write-ColorOutput -Color Info "Clearing Cowork caches..."

$CachePaths = @(
    "$env:APPDATA\Claude-3p\plugin-settings.json",
    "$env:USERPROFILE\.claude\mcp-needs-auth-cache.json",
    "$env:APPDATA\Claude-3p\.credentials.json"
)

foreach ($Path in $CachePaths) {
    if (Test-Path $Path) {
        Remove-Item $Path -Force -ErrorAction SilentlyContinue
    }
}

Write-Section "Uninstall Complete"
Write-Host ""
Write-ColorOutput -Color Success "Cowork 3P configuration removed successfully!"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Restart Cowork (close completely and reopen)"
Write-Host "  2. The AgentCore Gateway connector will no longer appear"
Write-Host ""

exit 0
