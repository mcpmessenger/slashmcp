# Quick Local Setup Script for Windows
# This sets up local development without affecting Vercel deployment

Write-Host "Setting up local development environment..." -ForegroundColor Cyan

# Check if .env.local exists
if (Test-Path .env.local) {
    Write-Host "WARNING: .env.local already exists. Skipping creation." -ForegroundColor Yellow
    Write-Host "Edit it manually if needed, or delete it to recreate from example." -ForegroundColor Yellow
} else {
    if (Test-Path .env.local.example) {
        Copy-Item .env.local.example .env.local
        Write-Host "SUCCESS: Created .env.local from .env.local.example" -ForegroundColor Green
        Write-Host "IMPORTANT: Edit .env.local and fill in your Supabase credentials!" -ForegroundColor Yellow
    } else {
        Write-Host "ERROR: .env.local.example not found. Creating basic template..." -ForegroundColor Red
        $template = @"
# Local Development Environment Variables
# Fill in your values below

VITE_SUPABASE_URL=https://akxdroedpsvmckvqvggr.supabase.co
VITE_SUPABASE_FUNCTIONS_URL=https://akxdroedpsvmckvqvggr.supabase.co/functions/v1
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key-here
VITE_SUPABASE_REDIRECT_URL=http://localhost:8080
"@
        $template | Out-File -FilePath .env.local -Encoding utf8
        Write-Host "SUCCESS: Created basic .env.local template" -ForegroundColor Green
        Write-Host "IMPORTANT: Edit .env.local and fill in your credentials!" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. Edit .env.local and add your Supabase credentials" -ForegroundColor White
Write-Host "2. Apply S3 CORS configuration (see below)" -ForegroundColor White
Write-Host "3. Run: npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "To fix S3 CORS for file uploads:" -ForegroundColor Cyan
Write-Host "Run: aws s3api put-bucket-cors --bucket tubbyai-products-catalog --cors-configuration file://fix-s3-cors.json" -ForegroundColor White
Write-Host ""
Write-Host "For detailed instructions, see LOCAL_SETUP.md" -ForegroundColor Cyan
