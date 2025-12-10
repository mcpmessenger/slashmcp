# RAG Configuration Diagnostic Script
# Checks if all required secrets and database setup are configured for RAG to work

param(
    [string]$ProjectRef = "akxdroedpsvmckvqvggr"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "RAG Configuration Diagnostic" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$errors = @()
$warnings = @()
$success = @()

# Check if Supabase CLI is available
$supabaseCmd = $null
$useNpx = $false

try {
    # Try global installation first
    $supabaseVersion = supabase --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        $supabaseCmd = "supabase"
        Write-Host "[OK] Supabase CLI found (global)" -ForegroundColor Green
    } else {
        throw "Not found globally"
    }
} catch {
    # Try npx as fallback
    try {
        $npxVersion = npx supabase --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            $useNpx = $true
            Write-Host "[OK] Supabase CLI found (via npx)" -ForegroundColor Green
        } else {
            throw "Not found via npx"
        }
    } catch {
        Write-Host "[X] Supabase CLI not found. Install with: npm install -g supabase" -ForegroundColor Red
        Write-Host "     Or use: npx supabase (if available in project)" -ForegroundColor Yellow
        $errors += "Supabase CLI not installed"
        exit 1
    }
}

# Helper function to run supabase commands
function Invoke-Supabase {
    param([string[]]$Arguments)
    if ($useNpx) {
        & npx supabase @Arguments
    } else {
        & supabase @Arguments
    }
}

Write-Host ""
Write-Host "Step 1: Checking Supabase Function Secrets..." -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Yellow

# Check secrets
try {
    $secretsOutput = Invoke-Supabase -Arguments @("secrets", "list", "--project-ref", $ProjectRef) 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to list secrets"
    }
    
    $requiredSecrets = @(
        @{ Name = "PROJECT_URL"; AltName = "SUPABASE_URL"; Required = $true },
        @{ Name = "SERVICE_ROLE_KEY"; AltName = "SUPABASE_SERVICE_ROLE_KEY"; Required = $true },
        @{ Name = "OPENAI_API_KEY"; AltName = $null; Required = $true }
    )
    
    foreach ($secret in $requiredSecrets) {
        $found = $false
        $secretName = $null
        
        # Check for secret name (format: NAME | DIGEST or NAME = VALUE)
        if ($secretsOutput -match "$($secret.Name)\s*[|=]") {
            $found = $true
            $secretName = $secret.Name
        } elseif ($secret.AltName -and $secretsOutput -match "$($secret.AltName)\s*[|=]") {
            $found = $true
            $secretName = $secret.AltName
        }
        
        if ($found) {
            Write-Host "  [OK] $secretName is set" -ForegroundColor Green
            $success += "$secretName is configured"
        } else {
            if ($secret.Required) {
                Write-Host "  [X] $($secret.Name) is missing (or $($secret.AltName))" -ForegroundColor Red
                $errors += "$($secret.Name) or $($secret.AltName) is not set"
            } else {
                Write-Host "  [WARN] $($secret.Name) is missing (optional)" -ForegroundColor Yellow
                $warnings += "$($secret.Name) is not set (optional)"
            }
        }
    }
    
    Write-Host ""
    Write-Host "Full secrets list:" -ForegroundColor Cyan
    Write-Host $secretsOutput
    
} catch {
    Write-Host "  [X] Failed to check secrets: $_" -ForegroundColor Red
    $errors += "Could not list secrets: $_"
}

Write-Host ""
Write-Host "Step 2: Edge Function Logs..." -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Yellow
Write-Host ""
Write-Host "Note: Supabase CLI does not support viewing function logs." -ForegroundColor Cyan
Write-Host "Please check logs manually via the Supabase Dashboard:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Chat function logs:" -ForegroundColor White
Write-Host "    https://supabase.com/dashboard/project/$ProjectRef/functions/chat/logs" -ForegroundColor Gray
Write-Host ""
Write-Host "  Doc-context function logs:" -ForegroundColor White
Write-Host "    https://supabase.com/dashboard/project/$ProjectRef/functions/doc-context/logs" -ForegroundColor Gray
Write-Host ""
Write-Host "  All Edge Function logs:" -ForegroundColor White
Write-Host "    https://supabase.com/dashboard/project/$ProjectRef/logs/edge-logs" -ForegroundColor Gray
Write-Host ""
Write-Host "What to look for in logs:" -ForegroundColor Cyan
Write-Host "  - 'DOC_CONTEXT_URL is not configured' warning" -ForegroundColor Yellow
Write-Host "  - 'OpenAI API error' or '401' errors" -ForegroundColor Yellow
Write-Host "  - 'relation does not exist' or 'function does not exist' errors" -ForegroundColor Yellow
Write-Host "  - 'Server not configured' errors" -ForegroundColor Yellow

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if ($success.Count -gt 0) {
    Write-Host ""
    Write-Host "[OK] Successes:" -ForegroundColor Green
    foreach ($item in $success) {
        Write-Host "  - $item" -ForegroundColor Green
    }
}

if ($warnings.Count -gt 0) {
    Write-Host ""
    Write-Host "[WARN] Warnings:" -ForegroundColor Yellow
    foreach ($item in $warnings) {
        Write-Host "  - $item" -ForegroundColor Yellow
    }
}

if ($errors.Count -gt 0) {
    Write-Host ""
    Write-Host "[X] Errors:" -ForegroundColor Red
    foreach ($item in $errors) {
        Write-Host "  - $item" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "Please fix the errors above for RAG to work properly." -ForegroundColor Red
    Write-Host "See docs/RAG_TROUBLESHOOTING_CHECKLIST.md for detailed instructions." -ForegroundColor Yellow
    exit 1
} else {
    Write-Host ""
    Write-Host "[OK] No critical errors found!" -ForegroundColor Green
    if ($warnings.Count -gt 0) {
        Write-Host "[WARN] Please review warnings above." -ForegroundColor Yellow
    } else {
        Write-Host "[OK] Configuration looks good!" -ForegroundColor Green
    }
    exit 0
}

