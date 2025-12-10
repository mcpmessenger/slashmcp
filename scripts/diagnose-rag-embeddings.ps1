# Diagnose Why RAG Embeddings Are Not Being Created
# Checks processing jobs and textract-worker logs

param(
    [string]$ProjectRef = "akxdroedpsvmckvqvggr"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "RAG Embeddings Diagnostic" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$useNpx = $false
try {
    $supabaseVersion = supabase --version 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Not found" }
} catch {
    try {
        $npxVersion = npx supabase --version 2>&1
        if ($LASTEXITCODE -eq 0) { $useNpx = $true }
        else { throw "Not found" }
    } catch {
        Write-Host "[X] Supabase CLI not found" -ForegroundColor Red
        exit 1
    }
}

function Invoke-Supabase {
    param([string[]]$Arguments)
    if ($useNpx) { & npx supabase @Arguments }
    else { & supabase @Arguments }
}

Write-Host "Step 1: Check if textract-worker has OPENAI_API_KEY..." -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Yellow

try {
    $secretsOutput = Invoke-Supabase -Arguments @("secrets", "list", "--project-ref", $ProjectRef) 2>&1
    
    if ($secretsOutput -match "OPENAI_API_KEY\s*[|=]") {
        Write-Host "  [OK] OPENAI_API_KEY is configured" -ForegroundColor Green
    } else {
        Write-Host "  [X] OPENAI_API_KEY is MISSING!" -ForegroundColor Red
        Write-Host "     This is required for embedding generation" -ForegroundColor Yellow
        Write-Host "     Set it with: supabase secrets set OPENAI_API_KEY=sk-... --project-ref $ProjectRef" -ForegroundColor Gray
    }
} catch {
    Write-Host "  [WARN] Could not check secrets: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Step 2: Check Processing Jobs..." -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Yellow
Write-Host ""
Write-Host "Run these SQL queries in Supabase SQL Editor to check:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  -- Check if any documents have been processed" -ForegroundColor DarkGray
Write-Host "  SELECT id, file_name, status, metadata->>'job_stage' as stage, created_at" -ForegroundColor White
Write-Host "  FROM processing_jobs" -ForegroundColor White
Write-Host "  ORDER BY created_at DESC" -ForegroundColor White
Write-Host "  LIMIT 10;" -ForegroundColor White
Write-Host ""
Write-Host "  -- Check jobs that should have embeddings (status = 'completed' and stage = 'indexed')" -ForegroundColor DarkGray
Write-Host "  SELECT id, file_name, status, metadata->>'job_stage' as stage" -ForegroundColor White
Write-Host "  FROM processing_jobs" -ForegroundColor White
Write-Host "  WHERE status = 'completed' AND metadata->>'job_stage' = 'indexed'" -ForegroundColor White
Write-Host "  ORDER BY created_at DESC;" -ForegroundColor White
Write-Host ""
Write-Host "  -- Check jobs that completed but weren't indexed" -ForegroundColor DarkGray
Write-Host "  SELECT id, file_name, status, metadata->>'job_stage' as stage" -ForegroundColor White
Write-Host "  FROM processing_jobs" -ForegroundColor White
Write-Host "  WHERE status = 'completed' AND metadata->>'job_stage' != 'indexed'" -ForegroundColor White
Write-Host "  ORDER BY created_at DESC;" -ForegroundColor White
Write-Host ""

Write-Host ""
Write-Host "Step 3: Check Textract-Worker Logs..." -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Yellow
Write-Host ""
Write-Host "Check logs for embedding generation activity:" -ForegroundColor Cyan
Write-Host "  https://supabase.com/dashboard/project/$ProjectRef/functions/textract-worker/logs" -ForegroundColor Gray
Write-Host ""
Write-Host "Look for these log messages:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  [GOOD] 'Starting indexing for job...'" -ForegroundColor Green
Write-Host "  [GOOD] 'Created X chunks for indexing'" -ForegroundColor Green
Write-Host "  [GOOD] 'Embedding progress: X/Y chunks'" -ForegroundColor Green
Write-Host "  [GOOD] 'Successfully indexed job...'" -ForegroundColor Green
Write-Host ""
Write-Host "  [BAD] 'Skipping indexing for job...: API key not configured'" -ForegroundColor Red
Write-Host "  [BAD] 'Skipping indexing for job...: no text extracted'" -ForegroundColor Red
Write-Host "  [BAD] 'Failed to insert embeddings:'" -ForegroundColor Red
Write-Host "  [BAD] 'OpenAI API error:'" -ForegroundColor Red
Write-Host "  [BAD] 'Embedding generation timeout'" -ForegroundColor Red
Write-Host ""

Write-Host ""
Write-Host "Step 4: Common Issues and Fixes..." -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Yellow
Write-Host ""
Write-Host "Issue 1: No documents uploaded yet" -ForegroundColor Cyan
Write-Host "  Fix: Upload a document through the UI and wait for processing" -ForegroundColor White
Write-Host ""
Write-Host "Issue 2: Documents processed before migration applied" -ForegroundColor Cyan
Write-Host "  Fix: Re-process documents OR manually trigger re-indexing" -ForegroundColor White
Write-Host ""
Write-Host "Issue 3: OPENAI_API_KEY not set in textract-worker" -ForegroundColor Cyan
Write-Host "  Fix: Set secret: supabase secrets set OPENAI_API_KEY=sk-... --project-ref $ProjectRef" -ForegroundColor White
Write-Host ""
Write-Host "Issue 4: Embedding generation failed silently" -ForegroundColor Cyan
Write-Host "  Fix: Check textract-worker logs for errors (see Step 3)" -ForegroundColor White
Write-Host ""
Write-Host "Issue 5: Database migration not applied" -ForegroundColor Cyan
Write-Host "  Fix: Run migration: supabase db push --project-ref $ProjectRef" -ForegroundColor White
Write-Host "       Or manually run: supabase/migrations/20250201000000_add_vector_rag.sql" -ForegroundColor Gray
Write-Host ""

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Next Steps" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Verify OPENAI_API_KEY is set (Step 1)" -ForegroundColor White
Write-Host "2. Check if documents have been processed (Step 2 - SQL queries)" -ForegroundColor White
Write-Host "3. Review textract-worker logs for errors (Step 3)" -ForegroundColor White
Write-Host "4. If no documents processed: Upload a test document" -ForegroundColor White
Write-Host "5. If documents processed but no embeddings: Check logs for errors" -ForegroundColor White
Write-Host ""

