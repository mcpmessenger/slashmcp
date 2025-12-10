# Safe deployment script that handles .env.local encoding issues
# Usage: .\deploy-functions-safe.ps1 [function-name]

param(
    [string]$FunctionName = "all"
)

$PROJECT_REF = "akxdroedpsvmckvqvggr"

# List of functions to deploy
$functions = @(
    "agent-orchestrator-v1",
    "chat",
    "mcp",
    "reselling-analysis",
    "doc-context",
    "textract-worker",
    "vision-worker",
    "uploads",
    "job-status"
)

Write-Host "🚀 Starting safe deployment..." -ForegroundColor Cyan

# Step 1: Backup and temporarily rename .env.local if it exists
$envLocalExists = Test-Path .env.local
if ($envLocalExists) {
    Write-Host "📦 Backing up .env.local..." -ForegroundColor Yellow
    Copy-Item .env.local .env.local.backup -Force
    Rename-Item -Path .env.local -NewName .env.local.temp -ErrorAction SilentlyContinue
}

try {
    # Step 2: Deploy functions
    if ($FunctionName -eq "all") {
        Write-Host "📤 Deploying all functions..." -ForegroundColor Cyan
        foreach ($func in $functions) {
            Write-Host "  → Deploying $func..." -ForegroundColor Gray
            npx supabase functions deploy $func --project-ref $PROJECT_REF 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  ✅ $func deployed successfully" -ForegroundColor Green
            } else {
                Write-Host "  ❌ $func deployment failed" -ForegroundColor Red
            }
        }
    } else {
        Write-Host "📤 Deploying $FunctionName..." -ForegroundColor Cyan
        npx supabase functions deploy $FunctionName --project-ref $PROJECT_REF
    }
    
    Write-Host "`n✅ Deployment complete!" -ForegroundColor Green
} finally {
    # Step 3: Restore .env.local
    if ($envLocalExists) {
        Write-Host "`n📦 Restoring .env.local..." -ForegroundColor Yellow
        if (Test-Path .env.local.temp) {
            Rename-Item -Path .env.local.temp -NewName .env.local -ErrorAction SilentlyContinue
        } elseif (Test-Path .env.local.backup) {
            Copy-Item .env.local.backup .env.local -Force
        }
    }
}

Write-Host "`n✨ Done!" -ForegroundColor Cyan

