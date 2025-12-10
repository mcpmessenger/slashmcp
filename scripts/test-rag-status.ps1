# RAG Status Test Script
# Checks if RAG is actually working by verifying database setup and recent activity

param(
    [string]$ProjectRef = "akxdroedpsvmckvqvggr"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "RAG Status Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$errors = @()
$warnings = @()
$success = @()

# Check if Supabase CLI is available
$useNpx = $false
try {
    $supabaseVersion = supabase --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Supabase CLI found (global)" -ForegroundColor Green
    } else {
        throw "Not found globally"
    }
} catch {
    try {
        $npxVersion = npx supabase --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            $useNpx = $true
            Write-Host "[OK] Supabase CLI found (via npx)" -ForegroundColor Green
        } else {
            throw "Not found"
        }
    } catch {
        Write-Host "[X] Supabase CLI not found" -ForegroundColor Red
        $errors += "Supabase CLI not installed"
        exit 1
    }
}

function Invoke-Supabase {
    param([string[]]$Arguments)
    if ($useNpx) {
        & npx supabase @Arguments
    } else {
        & supabase @Arguments
    }
}

Write-Host ""
Write-Host "Step 1: Checking Database Setup..." -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Yellow

# Check if we can query the database
Write-Host ""
Write-Host "Checking pg_vector extension..." -ForegroundColor Cyan
try {
    # Try to check if vector extension exists via SQL
    # Note: This requires database access, which may not be available via CLI
    Write-Host "  [INFO] Database checks require SQL Editor access" -ForegroundColor Gray
    Write-Host "  [INFO] Please run this SQL in Supabase SQL Editor:" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  -- Check pg_vector extension" -ForegroundColor DarkGray
    Write-Host "  SELECT * FROM pg_extension WHERE extname = 'vector';" -ForegroundColor White
    Write-Host ""
    Write-Host "  -- Check document_embeddings table" -ForegroundColor DarkGray
    Write-Host "  SELECT COUNT(*) as table_exists FROM information_schema.tables WHERE table_name = 'document_embeddings';" -ForegroundColor White
    Write-Host ""
    Write-Host "  -- Check if embeddings exist" -ForegroundColor DarkGray
    Write-Host "  SELECT COUNT(*) as embedding_count FROM document_embeddings;" -ForegroundColor White
    Write-Host ""
    Write-Host "  -- Check recent embeddings" -ForegroundColor DarkGray
    Write-Host "  SELECT job_id, COUNT(*) as chunks, MAX(created_at) as latest FROM document_embeddings GROUP BY job_id ORDER BY latest DESC LIMIT 5;" -ForegroundColor White
    Write-Host ""
} catch {
    Write-Host "  [WARN] Could not check database: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Step 2: Checking Edge Function Configuration..." -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Yellow

# Check secrets
try {
    $secretsOutput = Invoke-Supabase -Arguments @("secrets", "list", "--project-ref", $ProjectRef) 2>&1
    
    $requiredSecrets = @(
        @{ Name = "PROJECT_URL"; AltName = "SUPABASE_URL"; Required = $true },
        @{ Name = "SERVICE_ROLE_KEY"; AltName = "SUPABASE_SERVICE_ROLE_KEY"; Required = $true },
        @{ Name = "OPENAI_API_KEY"; AltName = $null; Required = $true }
    )
    
    foreach ($secret in $requiredSecrets) {
        $found = $false
        $secretName = $null
        
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
                Write-Host "  [X] $($secret.Name) is missing" -ForegroundColor Red
                $errors += "$($secret.Name) or $($secret.AltName) is not set"
            }
        }
    }
} catch {
    Write-Host "  [X] Failed to check secrets: $_" -ForegroundColor Red
    $errors += "Could not list secrets: $_"
}

Write-Host ""
Write-Host "Step 3: How to Test RAG..." -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Yellow
Write-Host ""
Write-Host "To verify RAG is working:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Upload a document through the UI" -ForegroundColor White
Write-Host "2. Wait for processing to complete (check job status)" -ForegroundColor White
Write-Host "3. Send a chat message that references the document content" -ForegroundColor White
Write-Host "4. Check if the response includes relevant document context" -ForegroundColor White
Write-Host ""
Write-Host "Check logs for RAG activity:" -ForegroundColor Cyan
Write-Host "  Chat function: https://supabase.com/dashboard/project/$ProjectRef/functions/chat/logs" -ForegroundColor Gray
Write-Host "  Doc-context: https://supabase.com/dashboard/project/$ProjectRef/functions/doc-context/logs" -ForegroundColor Gray
Write-Host ""
Write-Host "What to look for in logs:" -ForegroundColor Cyan
Write-Host "  - 'Vector search mode' or 'Using vector search'" -ForegroundColor Green
Write-Host "  - 'Found X embeddings' or 'Retrieved X chunks'" -ForegroundColor Green
Write-Host "  - 'DOC_CONTEXT_URL is not configured' (BAD)" -ForegroundColor Red
Write-Host "  - 'OpenAI API error' or '401' (BAD)" -ForegroundColor Red
Write-Host "  - 'No embeddings found, falling back to legacy' (may indicate no embeddings)" -ForegroundColor Yellow
Write-Host ""

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if ($success.Count -gt 0) {
    Write-Host ""
    Write-Host "[OK] Configuration:" -ForegroundColor Green
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
    Write-Host "Please fix the errors above for RAG to work." -ForegroundColor Red
    exit 1
} else {
    Write-Host ""
    Write-Host "[OK] Configuration looks good!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Verify database setup (run SQL queries above)" -ForegroundColor White
    Write-Host "  2. Upload a test document" -ForegroundColor White
    Write-Host "  3. Check if embeddings are created" -ForegroundColor White
    Write-Host "  4. Test chat with document context" -ForegroundColor White
    Write-Host "  5. Review Edge Function logs for RAG activity" -ForegroundColor White
    exit 0
}

