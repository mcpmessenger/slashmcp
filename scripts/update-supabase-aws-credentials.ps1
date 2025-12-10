# Update Supabase Edge Function AWS Credentials to Match AWS CLI
# This script reads AWS CLI credentials and updates Supabase secrets

Write-Host "🔍 Reading AWS CLI credentials..." -ForegroundColor Cyan

# Read AWS credentials from ~/.aws/credentials
$credentialsPath = "$env:USERPROFILE\.aws\credentials"
if (-not (Test-Path $credentialsPath)) {
    Write-Host "❌ AWS credentials file not found at: $credentialsPath" -ForegroundColor Red
    exit 1
}

# Parse credentials file
$credentialsContent = Get-Content $credentialsPath -Raw
$accessKeyId = ""
$secretAccessKey = ""
$region = ""

# Extract access key ID
if ($credentialsContent -match 'aws_access_key_id\s*=\s*([^\s]+)') {
    $accessKeyId = $matches[1].Trim()
    Write-Host "✅ Found AWS_ACCESS_KEY_ID: $($accessKeyId.Substring(0,8))..." -ForegroundColor Green
} else {
    Write-Host "❌ Could not find aws_access_key_id in credentials file" -ForegroundColor Red
    exit 1
}

# Extract secret access key
if ($credentialsContent -match 'aws_secret_access_key\s*=\s*([^\s]+)') {
    $secretAccessKey = $matches[1].Trim()
    Write-Host "✅ Found AWS_SECRET_ACCESS_KEY: $($secretAccessKey.Substring(0,8))..." -ForegroundColor Green
} else {
    Write-Host "❌ Could not find aws_secret_access_key in credentials file" -ForegroundColor Red
    exit 1
}

# Read region from ~/.aws/config
$configPath = "$env:USERPROFILE\.aws\config"
if (Test-Path $configPath) {
    $configContent = Get-Content $configPath -Raw
    if ($configContent -match 'region\s*=\s*([^\s]+)') {
        $region = $matches[1].Trim()
        Write-Host "✅ Found AWS_REGION: $region" -ForegroundColor Green
    }
}

# Default to us-east-1 if not found
if ([string]::IsNullOrEmpty($region)) {
    $region = "us-east-1"
    Write-Host "⚠️  Region not found in config, defaulting to: $region" -ForegroundColor Yellow
}

Write-Host "`n🔄 Updating Supabase Edge Function secrets..." -ForegroundColor Cyan

# Update Supabase secrets
Write-Host "Setting AWS_ACCESS_KEY_ID..." -ForegroundColor Yellow
supabase secrets set AWS_ACCESS_KEY_ID=$accessKeyId

Write-Host "Setting AWS_SECRET_ACCESS_KEY..." -ForegroundColor Yellow
supabase secrets set AWS_SECRET_ACCESS_KEY=$secretAccessKey

Write-Host "Setting AWS_REGION..." -ForegroundColor Yellow
supabase secrets set AWS_REGION=$region

Write-Host "`n✅ Supabase AWS credentials updated!" -ForegroundColor Green
Write-Host "`n📝 Next steps:" -ForegroundColor Cyan
Write-Host "1. Wait 10-30 seconds for changes to propagate"
Write-Host "2. Hard refresh your browser (Ctrl+Shift+R)"
Write-Host "3. Try uploading a file again"
Write-Host "4. Check console - should see status 200 instead of 403!"
