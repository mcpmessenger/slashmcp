# Deploy Supabase Edge Functions using Access Token
# This avoids the OAuth login timeout issue

param(
    [Parameter(Mandatory=$false)]
    [string]$AccessToken = $env:SUPABASE_ACCESS_TOKEN,
    
    [Parameter(Mandatory=$false)]
    [string]$ProjectRef = "akxdroedpsvmckvqvggr"
)

if (-not $AccessToken) {
    Write-Host "❌ SUPABASE_ACCESS_TOKEN not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "To get an access token:" -ForegroundColor Yellow
    Write-Host "1. Go to: https://supabase.com/dashboard/account/tokens" -ForegroundColor Cyan
    Write-Host "2. Create a new access token"
    Write-Host "3. Run this script with:" -ForegroundColor Yellow
    Write-Host "   `$env:SUPABASE_ACCESS_TOKEN='your-token-here'; .\deploy-functions.ps1" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "OR set it temporarily in PowerShell:" -ForegroundColor Yellow
    Write-Host "   `$env:SUPABASE_ACCESS_TOKEN='your-token-here'" -ForegroundColor Cyan
    exit 1
}

Write-Host "🚀 Deploying Edge Functions to Supabase..." -ForegroundColor Green
Write-Host "Project Ref: $ProjectRef" -ForegroundColor Cyan
Write-Host ""

$functions = @(
    "chat",
    "doc-context", 
    "textract-worker",
    "uploads",
    "agent-orchestrator-v1"
)

foreach ($function in $functions) {
    Write-Host "📦 Deploying $function..." -ForegroundColor Yellow
    
    $result = npx supabase functions deploy $function --project-ref $ProjectRef 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ $function deployed successfully!" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to deploy $function" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
    }
    Write-Host ""
}

Write-Host "✨ Deployment complete!" -ForegroundColor Green

