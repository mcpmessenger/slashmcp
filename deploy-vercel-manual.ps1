# Manual Vercel Deployment Script
# Usage: .\deploy-vercel-manual.ps1

$VERCEL_TOKEN = "1Voghn9i6XFXANNXXnovuuFq"

Write-Host "Deploying to Vercel..." -ForegroundColor Green

# Set token as environment variable and deploy
$env:VERCEL_TOKEN = $VERCEL_TOKEN
vercel --prod --token=$VERCEL_TOKEN

Write-Host "Deployment complete!" -ForegroundColor Green
