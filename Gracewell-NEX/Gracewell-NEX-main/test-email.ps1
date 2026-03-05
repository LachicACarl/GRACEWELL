# Test Password Reset Email Sending
# Run this after configuring SMTP in Supabase

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  PASSWORD RESET EMAIL TEST" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Testing password reset for: superadmin@gracewell.com" -ForegroundColor Yellow
Write-Host "Make sure you've configured SMTP in Supabase Dashboard!`n" -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest `
        -Uri "http://localhost:4000/auth/request-password-reset-link" `
        -Method POST `
        -Body '{"email":"superadmin@gracewell.com"}' `
        -ContentType "application/json" `
        -UseBasicParsing

    $result = $response.Content | ConvertFrom-Json
    
    Write-Host "✅ Request sent successfully!" -ForegroundColor Green
    Write-Host "Response: $($result.message)`n" -ForegroundColor White
    
    Write-Host "Now check your email inbox for the reset link!" -ForegroundColor Cyan
    Write-Host "Email: superadmin@gracewell.com`n" -ForegroundColor Yellow
    
    Write-Host "If no email arrives:" -ForegroundColor Red
    Write-Host "  1. Check spam/junk folder" -ForegroundColor White
    Write-Host "  2. Verify SMTP settings in Supabase Dashboard" -ForegroundColor White
    Write-Host "  3. Check Supabase Logs (Dashboard → Logs → Auth Logs)`n" -ForegroundColor White
    
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "========================================`n" -ForegroundColor Cyan
