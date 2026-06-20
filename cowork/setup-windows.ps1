# PowerShell setup automation for Cowork 3P client integration with AgentCore Gateway (Windows).
# Idempotent: reads terraform output → authenticates via Cognito → stores JWT →
# renders .reg file → merges registry → configures managedMcpServers.
#
# Usage:
#   .\setup-windows.ps1                     # Interactive setup
#   .\setup-windows.ps1 -ForceLogin         # Force re-authentication
#   .\setup-windows.ps1 -GatewayUrl https://...  # Override gateway URL
#
# Requires: PowerShell 5.1+, admin privileges for registry operations
param(
    [switch]$ForceLogin = $false,
    [string]$GatewayUrl = "",
    [string]$TfDir = ""
)

$ErrorActionPreference = "Stop"

# Script location
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommandPath
$RepoRoot = Split-Path -Parent $ScriptDir

# Configuration paths (Windows user AppData)
$StoreDir = "$env:USERPROFILE\.websearch-gw"
$TokenStore = "$StoreDir\tokens.json"
$ConfigEnv = "$StoreDir\config.env"
$ProfileDir = "$StoreDir\profiles"
$HeadersHelper = "$StoreDir\agentcore-token.ps1"

# Cowork config library (Windows AppData)
$ConfigLibrary = "$env:APPDATA\Claude-3p\configLibrary"

# OAuth callback
$CallbackPort = 8976
$CallbackUrl = "http://127.0.0.1:$CallbackPort/callback"
$Scopes = "openid email profile"

# Registry path for Cowork policies
$RegPath = "HKCU:\SOFTWARE\Policies\Claude"

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

function Read-SecureInput {
    param(
        [string]$Prompt,
        [string]$Default = ""
    )

    if ($Default) {
        $Input = Read-Host "$Prompt (default: $Default)"
        return $Input -or $Default
    } else {
        return Read-Host $Prompt
    }
}

# --- Step 1: Gather values from Terraform or user input ---

Write-Section "Cowork 3P Client Setup (Windows)"

Write-ColorOutput -Color Info "Reading Terraform outputs..."
$CognitoDomain = ""
$ClientId = ""
$Region = ""

# Try to read from terraform output
if (-not $TfDir) {
    foreach ($tf_path in @(
        "$RepoRoot\infra\environments\dev",
        "$RepoRoot\infra",
        $RepoRoot
    )) {
        if (Test-Path "$tf_path\.terraform") {
            $TfDir = $tf_path
            break
        }
    }
}

if ($TfDir -and (Test-Path "$TfDir\.terraform")) {
    try {
        Push-Location $TfDir
        # Full OAuth domain URL + M2M client (the web client has no secret).
        $CognitoDomain = & terraform output -raw cognito_domain_url 2>$null
        $ClientId = & terraform output -raw auth_m2m_client_id 2>$null
        $ClientSecret = & terraform output -raw auth_m2m_client_secret 2>$null
        $Scope = & terraform output -raw auth_m2m_scope 2>$null
        $GatewayUrl = & terraform output -raw gateway_url 2>$null
        $Region = & terraform output -raw region 2>$null
        Pop-Location
    } catch {
        Write-ColorOutput -Color Warning "Could not read Terraform outputs: $_"
    }
}

# Prompt for missing values
if (-not $CognitoDomain) {
    $CognitoDomain = Read-SecureInput "Cognito domain URL (https://xxx.auth.region.amazoncognito.com)"
}
if (-not $ClientId) {
    $ClientId = Read-SecureInput "Cognito M2M client ID"
}
if (-not $ClientSecret) {
    $ClientSecret = Read-SecureInput "Cognito M2M client secret"
}
if (-not $Scope) {
    $Scope = "agentcore/invoke"
}
if (-not $GatewayUrl) {
    $GatewayUrl = Read-SecureInput "Gateway URL (https://gateway.example.com)"
}
if (-not $Region) {
    $Region = Read-SecureInput "AWS region (us-east-1)" -Default "us-east-1"
}

# Validate gateway URL
if ($GatewayUrl -notmatch "^https?://") {
    Write-ColorOutput -Color Error "Invalid gateway URL: $GatewayUrl (must start with http:// or https://)"
    exit 1
}

Write-ColorOutput -Color Info "Configuration:"
Write-ColorOutput -Color Info "  Cognito domain: $CognitoDomain"
Write-ColorOutput -Color Info "  Client ID:      $ClientId (M2M)"
Write-ColorOutput -Color Info "  Gateway URL:    $GatewayUrl"
Write-ColorOutput -Color Info "  Region:         $Region"

# --- Step 2: Create directories and store config ---

Write-ColorOutput -Color Info "Creating configuration directories..."
New-Item -ItemType Directory -Path $StoreDir -Force | Out-Null
New-Item -ItemType Directory -Path $ProfileDir -Force | Out-Null

$ConfigContent = @"
COGNITO_DOMAIN="$CognitoDomain"
CLIENT_ID="$ClientId"
CLIENT_SECRET="$ClientSecret"
SCOPE="$Scope"
GATEWAY_URL="$GatewayUrl"
REGION="$Region"
"@

$ConfigContent | Set-Content -Path $ConfigEnv -Force
Write-ColorOutput -Color Info "Wrote $ConfigEnv"

# --- Step 3: Install headersHelper script ---

Write-ColorOutput -Color Info "Installing headersHelper to $HeadersHelper..."
Copy-Item "$ScriptDir\agentcore-token.ps1" -Destination $HeadersHelper -Force
Write-ColorOutput -Color Info "Installed $HeadersHelper"

# --- Step 4: Obtain or refresh JWT tokens ---

$TokenExpired = $true
if ((Test-Path $TokenStore) -and -not $ForceLogin) {
    try {
        $TokenData = Get-Content $TokenStore | ConvertFrom-Json
        $ExpiresAt = $TokenData.expires_at
        $CurrentTime = [int](Get-Date -UFormat %s)

        if ($CurrentTime -lt ($ExpiresAt - 60)) {
            Write-ColorOutput -Color Info "Valid tokens found. Skipping authentication."
            $TokenExpired = $false
        }
    } catch {
        Write-ColorOutput -Color Warning "Could not validate token file: $_"
    }
}

if ($TokenExpired) {
    Write-Section "Authenticating with Cognito (M2M Client Credentials)"

    Write-ColorOutput -Color Info "Exchanging client credentials for access token..."

    # Encode client_id:client_secret in base64 for Basic Auth
    $BasicAuthBytes = [System.Text.Encoding]::ASCII.GetBytes("${ClientId}:${ClientSecret}")
    $BasicAuth = [Convert]::ToBase64String($BasicAuthBytes)

    try {
        $Response = Invoke-WebRequest `
            -Uri "${CognitoDomain}/oauth2/token" `
            -Method Post `
            -Headers @{
                "Authorization" = "Basic $BasicAuth"
                "Content-Type"  = "application/x-www-form-urlencoded"
            } `
            -Body "grant_type=client_credentials&scope=${Scope}" `
            -ErrorAction Stop

        $TokenData = $Response.Content | ConvertFrom-Json

        if (-not $TokenData.access_token) {
            Write-ColorOutput -Color Error "Token exchange failed: $($TokenData | ConvertTo-Json)"
            exit 1
        }

        $CurrentTime = [int](Get-Date -UFormat %s)
        $ExpiresIn = $TokenData.expires_in -or 3600

        $TokenObject = @{
            "access_token" = $TokenData.access_token
            "expires_at"   = $CurrentTime + $ExpiresIn
            "token_type"   = $TokenData.token_type -or "Bearer"
        }

        $TokenObject | ConvertTo-Json | Set-Content -Path $TokenStore -Force
        Write-ColorOutput -Color Info "Tokens saved to $TokenStore (expires in $ExpiresIn seconds)"
    } catch {
        Write-ColorOutput -Color Error "Failed to obtain access token: $_"
        exit 1
    }
}

# --- Step 5: Render and install .reg file ---

Write-Section "Installing Cowork Configuration Profile"

try {
    $TokenData = Get-Content $TokenStore | ConvertFrom-Json
    $AccessToken = $TokenData.access_token
} catch {
    Write-ColorOutput -Color Error "Failed to read access token: $_"
    exit 1
}

Write-ColorOutput -Color Info "Rendering registry file (.reg)..."

# Read template
$TemplatePath = "$ScriptDir\templates\cowork-3p.reg.tmpl"
if (-not (Test-Path $TemplatePath)) {
    Write-ColorOutput -Color Error "Template not found: $TemplatePath"
    exit 1
}

$Template = Get-Content $TemplatePath -Raw

# Substitute placeholders
$Config = $Template -replace '@GATEWAY_URL@', $GatewayUrl `
                   -replace '@HEADERS_HELPER@', ($HeadersHelper -replace '\\', '\\\\') `
                   -replace '@REGION@', $Region

# Write to temporary profile
$ProfilePath = "$ProfileDir\cowork-3p.reg"
$Config | Set-Content -Path $ProfilePath -Force
Write-ColorOutput -Color Info "Rendered registry file: $ProfilePath"

# --- Step 6: Apply registry settings ---

Write-ColorOutput -Color Info "Applying registry settings..."

# Create registry path if it doesn't exist
if (-not (Test-Path $RegPath)) {
    New-Item -Path $RegPath -Force | Out-Null
}

try {
    # Import the .reg file
    & reg import $ProfilePath | Out-Null
    Write-ColorOutput -Color Success "Registry settings applied successfully"
} catch {
    Write-ColorOutput -Color Error "Failed to apply registry settings: $_"
    Write-ColorOutput -Color Info "You can manually import: reg import '$ProfilePath'"
    exit 1
}

# --- Step 7: Configure managedMcpServers in configLibrary ---

Write-Section "Configuring Managed MCP Servers"

# Create configLibrary directory
New-Item -ItemType Directory -Path $ConfigLibrary -Force | Out-Null

# Write configuration
$MetaPath = "$ConfigLibrary\_meta.json"
$MetaData = @{
    "appliedId" = [guid]::NewGuid().ToString()
    "entries"   = @()
}

# Check if meta file exists and preserve appliedId
if (Test-Path $MetaPath) {
    try {
        $ExistingMeta = Get-Content $MetaPath | ConvertFrom-Json
        $MetaData.appliedId = $ExistingMeta.appliedId
        $MetaData.entries = $ExistingMeta.entries
    } catch {
        Write-ColorOutput -Color Warning "Could not read existing meta file: $_"
    }
}

# Ensure entry exists
if ($MetaData.entries.Count -eq 0) {
    $MetaData.entries = @(@{ "id" = $MetaData.appliedId; "name" = "Default" })
}

$ProfileId = $MetaData.appliedId
$ProfilePath = "$ConfigLibrary\$ProfileId.json"

# Load or create profile config
$Profile = @{}
if (Test-Path $ProfilePath) {
    try {
        $Profile = Get-Content $ProfilePath | ConvertFrom-Json | ConvertTo-Hashtable
    } catch {
        Write-ColorOutput -Color Warning "Could not read profile file: $_"
    }
}

# Add/update managedMcpServers
$Profile["managedMcpServers"] = @(
    @{
        "url"                  = $GatewayUrl
        "transport"            = "http"
        "name"                 = "AgentCore Gateway"
        "headersHelper"        = $HeadersHelper
        "headersHelperTtlSec"  = 900
    }
)

# Write configs
$MetaData | ConvertTo-Json -Depth 10 | Set-Content -Path $MetaPath -Force
$Profile | ConvertTo-Json -Depth 10 | Set-Content -Path $ProfilePath -Force

Write-ColorOutput -Color Info "Configured managedMcpServers in $ProfilePath"

# --- Step 8: Clear caches ---

Write-Section "Finalizing Setup"

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

Write-ColorOutput -Color Info "Caches cleared"

# --- Success ---

Write-Section "Setup Complete!"
Write-Host ""
Write-ColorOutput -Color Success "Cowork 3P client configured successfully!"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. If using MDM, deploy the registry file:"
Write-Host "     → Located at: $ProfilePath"
Write-Host ""
Write-Host "  2. Restart Cowork:"
Write-Host "     → Close Cowork completely"
Write-Host "     → Reopen Cowork"
Write-Host ""
Write-Host "  3. Verify setup:"
Write-Host "     → Look for 'AgentCore Gateway' in Customize > Connectors"
Write-Host "     → Try a test search query"
Write-Host ""
Write-Host "Configuration stored at:"
Write-Host "  → $ConfigEnv"
Write-Host "  → $TokenStore"
Write-Host "  → $HeadersHelper"
Write-Host ""

exit 0

# Helper function to convert PSObject to Hashtable
function ConvertTo-Hashtable {
    param([Parameter(ValueFromPipeline)]$InputObject)

    if ($null -eq $InputObject) {
        return $null
    }

    if ($InputObject -is [System.Collections.IEnumerable] -and $InputObject -isnot [string]) {
        $Collection = @()
        foreach ($Object in $InputObject) {
            $Collection += ConvertTo-Hashtable -InputObject $Object
        }
        return $Collection
    } elseif ($InputObject -is [PSObject]) {
        $Hashtable = @{}
        foreach ($Property in $InputObject.PSObject.Properties) {
            $Hashtable[$Property.Name] = ConvertTo-Hashtable -InputObject $Property.Value
        }
        return $Hashtable
    }

    return $InputObject
}
