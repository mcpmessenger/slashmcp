# Test LangChain MCP Server Directly

$uri = "https://langchain-agent-mcp-server-554655392699.us-central1.run.app/mcp/invoke"

Write-Host "=== Test 1: Without system_instruction ===" -ForegroundColor Cyan
$body1 = @{
    tool = "agent_executor"
    arguments = @{
        query = "What is 2+2?"
    }
} | ConvertTo-Json -Depth 10

Write-Host "Body: $body1" -ForegroundColor Gray
Write-Host ""

try {
    $response1 = Invoke-RestMethod -Uri $uri -Method Post -Body $body1 -ContentType "application/json"
    Write-Host "✅ Success!" -ForegroundColor Green
    $response1 | ConvertTo-Json -Depth 10
} catch {
    Write-Host "❌ Error!" -ForegroundColor Red
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Yellow
    Write-Host "Error Message: $($_.Exception.Message)" -ForegroundColor Yellow
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $errorBody = $reader.ReadToEnd()
        Write-Host "Error Body: $errorBody" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=== Test 2: With system_instruction ===" -ForegroundColor Cyan
$body2 = @{
    tool = "agent_executor"
    arguments = @{
        query = "What is 2+2?"
        system_instruction = "You are a pirate. Say Arr!"
    }
} | ConvertTo-Json -Depth 10

Write-Host "Body: $body2" -ForegroundColor Gray
Write-Host ""

try {
    $response2 = Invoke-RestMethod -Uri $uri -Method Post -Body $body2 -ContentType "application/json"
    Write-Host "✅ Success!" -ForegroundColor Green
    $response2 | ConvertTo-Json -Depth 10
} catch {
    Write-Host "❌ Error!" -ForegroundColor Red
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Yellow
    Write-Host "Error Message: $($_.Exception.Message)" -ForegroundColor Yellow
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $errorBody = $reader.ReadToEnd()
        Write-Host "Error Body: $errorBody" -ForegroundColor Yellow
    }
}

