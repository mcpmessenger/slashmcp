# Quick deployment script for critical functions
# Run this after setting SUPABASE_ACCESS_TOKEN

Write-Host "🚀 Deploying Critical Supabase Functions..." -ForegroundColor Green
Write-Host ""

# Critical: uploads function (fixes timeout)
Write-Host "📦 Deploying uploads..." -ForegroundColor Yellow
npx supabase functions deploy uploads --project-ref akxdroedpsvmckvqvggr
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ uploads deployed!" -ForegroundColor Green
} else {
    Write-Host "❌ uploads deployment failed" -ForegroundColor Red
}
Write-Host ""

# Critical: playwright-wrapper (new features)
Write-Host "📦 Deploying playwright-wrapper..." -ForegroundColor Yellow
npx supabase functions deploy playwright-wrapper --project-ref akxdroedpsvmckvqvggr
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ playwright-wrapper deployed!" -ForegroundColor Green
} else {
    Write-Host "❌ playwright-wrapper deployment failed" -ForegroundColor Red
}
Write-Host ""

Write-Host "✨ Critical functions deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Verify at: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions" -ForegroundColor Cyan
