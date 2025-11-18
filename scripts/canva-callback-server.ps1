# Simple HTTP server to catch Canva OAuth callback
Write-Host "Starting callback server on http://127.0.0.1:3000/" -ForegroundColor Green
Write-Host "Waiting for Canva authorization callback..." -ForegroundColor Yellow
Write-Host ""

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:3000/")
$listener.Start()

try {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response
    
    # Get the authorization code from query string
    $code = $request.QueryString["code"]
    $state = $request.QueryString["state"]
    $error = $request.QueryString["error"]
    
    if ($code) {
        Write-Host "`n✅ Authorization Code Received!" -ForegroundColor Green
        Write-Host "Code: $code" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Copy this code and use it to exchange for an access token." -ForegroundColor Cyan
        
        # Send a simple HTML response
        $html = @"
<!DOCTYPE html>
<html>
<head><title>Authorization Successful</title></head>
<body style="font-family: Arial; padding: 20px;">
    <h1>✅ Authorization Successful!</h1>
    <p>Authorization code: <strong>$code</strong></p>
    <p>You can close this window.</p>
</body>
</html>
"@
        $buffer = [System.Text.Encoding]::UTF8.GetBytes($html)
        $response.ContentLength64 = $buffer.Length
        $response.StatusCode = 200
        $response.OutputStream.Write($buffer, 0, $buffer.Length)
        $response.Close()
        
        Write-Host "`nCode saved above. Press any key to exit..." -ForegroundColor Green
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    } elseif ($error) {
        Write-Host "`n❌ Authorization Error: $error" -ForegroundColor Red
        $html = @"
<!DOCTYPE html>
<html>
<head><title>Authorization Error</title></head>
<body style="font-family: Arial; padding: 20px;">
    <h1>❌ Authorization Error</h1>
    <p>Error: $error</p>
</body>
</html>
"@
        $buffer = [System.Text.Encoding]::UTF8.GetBytes($html)
        $response.ContentLength64 = $buffer.Length
        $response.StatusCode = 200
        $response.OutputStream.Write($buffer, 0, $buffer.Length)
        $response.Close()
    } else {
        Write-Host "No code or error in callback" -ForegroundColor Yellow
    }
} finally {
    $listener.Stop()
}

