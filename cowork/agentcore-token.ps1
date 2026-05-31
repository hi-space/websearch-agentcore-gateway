# PowerShell headersHelper for Cowork 3P managedMcpServers (Windows).
# Reads JWT from storage, refreshes if needed (60s before expiry),
# returns JSON with Authorization header.
#
# Called by Cowork via headersHelper directive in managedMcpServers config.
# Outputs: {"Authorization":"Bearer <access_token>"}
#
# Usage:
#   .\agentcore-token.ps1             # Print JSON header (called by Cowork)
#   .\agentcore-token.ps1 -Raw        # Print raw token (debugging)

param(
    [switch]$Raw = $false
)

$ErrorActionPreference = "Stop"

# Configuration paths
$StoreDir = "$env:USERPROFILE\.websearch-gw"
$TokenStore = "$StoreDir\tokens.json"
$ConfigEnv = "$StoreDir\config.env"

# Validation: Check for required files
if (-not (Test-Path $ConfigEnv)) {
    $ErrorMsg = @{
        "error" = "Missing config: $ConfigEnv. Run setup-windows.ps1 first"
    } | ConvertTo-Json
    Write-Error $ErrorMsg
    exit 1
}

if (-not (Test-Path $TokenStore)) {
    $ErrorMsg = @{
        "error" = "No tokens found. Run setup-windows.ps1"
    } | ConvertTo-Json
    Write-Error $ErrorMsg
    exit 1
}

# Load configuration from env file
$ConfigContent = Get-Content $ConfigEnv | ConvertFrom-StringData
$ClientId = $ConfigContent.CLIENT_ID
$ClientSecret = $ConfigContent.CLIENT_SECRET
$CognitoDomain = $ConfigContent.COGNITO_DOMAIN
$Scope = if ($ConfigContent.SCOPE) { $ConfigContent.SCOPE } else { "agentcore/invoke" }

if (-not $ClientId -or -not $ClientSecret -or -not $CognitoDomain) {
    $ErrorMsg = @{
        "error" = "Invalid config file. Missing CLIENT_ID, CLIENT_SECRET or COGNITO_DOMAIN"
    } | ConvertTo-Json
    Write-Error $ErrorMsg
    exit 1
}

# Load token data
try {
    $TokenData = Get-Content $TokenStore | ConvertFrom-Json
} catch {
    $ErrorMsg = @{
        "error" = "Failed to read token file: $_"
    } | ConvertTo-Json
    Write-Error $ErrorMsg
    exit 1
}

# Check if token refresh is needed (within 60 seconds of expiry)
$CurrentTime = [int](Get-Date -UFormat %s)
$ExpiresAt = $TokenData.expires_at
$NeedRefresh = $CurrentTime -ge ($ExpiresAt - 60)

if ($NeedRefresh) {
    # Token is expired or about to expire; refresh using M2M client credentials
    Write-Host "Refreshing access token..." -ForegroundColor DarkGray

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

        $RefreshResponse = $Response.Content | ConvertFrom-Json

        if (-not $RefreshResponse.access_token) {
            $ErrorMsg = @{
                "error" = "Token refresh failed: $($RefreshResponse | ConvertTo-Json)"
            } | ConvertTo-Json
            Write-Error $ErrorMsg
            exit 1
        }

        # Update token data
        $TokenData.access_token = $RefreshResponse.access_token
        $TokenData.expires_at = $CurrentTime + $RefreshResponse.expires_in

        # Write back to storage
        $TokenData | ConvertTo-Json | Set-Content $TokenStore -Force
    } catch {
        $ErrorMsg = @{
            "error" = "Token refresh failed: $_"
        } | ConvertTo-Json
        Write-Error $ErrorMsg
        exit 1
    }
}

# Read current access token
$AccessToken = $TokenData.access_token

# Output result
if ($Raw) {
    Write-Host $AccessToken
} else {
    # Output JSON header for Cowork
    $Header = @{
        "Authorization" = "Bearer $AccessToken"
    } | ConvertTo-Json -Compress
    Write-Host $Header
}

exit 0
