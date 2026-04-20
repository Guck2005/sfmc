# End-to-end live test of the user.role_changed flow:
#   1. Log in as ADMIN and as CLIENT (CLIENT gets a refresh token)
#   2. Admin calls PUT /users/:clientId/role { role: 'OPERATOR' }
#   3. After RabbitMQ propagation, CLIENT's refresh token should be revoked
#      (POST /auth/refresh → 401 INVALID_REFRESH_TOKEN)
#   4. CLIENT re-logs in and the new JWT must now carry role=OPERATOR
#
# Requires the seeded accounts: admin@sfmc.bj / client@sfmc.bj

$ErrorActionPreference = 'Stop'

function Login($email, $password) {
    $body = @{ email = $email; password = $password } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri 'http://localhost:3001/api/v1/auth/login' -Method Post -Body $body -ContentType 'application/json'
    return $r.data
}

Write-Host '[1] Admin login'
$admin = Login 'admin@sfmc.bj' 'Admin@2026'
if (-not $admin.accessToken) { throw 'Admin login failed' }

Write-Host '[2] Client login (captures refresh token)'
$client = Login 'client@sfmc.bj' 'Client@2026'
if (-not $client.refreshToken) { throw 'Client login failed' }
$initialClientRole = $client.user.role
$clientId = $client.user.id
Write-Host "    client id=$clientId initialRole=$initialClientRole"

Write-Host '[3] Admin promotes client to OPERATOR'
$headers = @{ Authorization = "Bearer $($admin.accessToken)" }
$promote = Invoke-RestMethod -Uri "http://localhost:3002/api/v1/users/$clientId/role" -Method Put -Headers $headers -Body '{"role":"OPERATOR"}' -ContentType 'application/json'
if ($promote.data.role -ne 'OPERATOR') { throw "User-service didn't update role (got $($promote.data.role))" }

Write-Host '[4] Wait 2s for RabbitMQ propagation to auth-service'
Start-Sleep -Seconds 2

Write-Host '[5] Client tries to refresh with old refresh token (should FAIL, token revoked)'
$revoked = $false
try {
    $body = @{ refreshToken = $client.refreshToken } | ConvertTo-Json
    Invoke-RestMethod -Uri 'http://localhost:3001/api/v1/auth/refresh' -Method Post -Body $body -ContentType 'application/json' | Out-Null
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 401) { $revoked = $true }
    else { throw "Expected 401 on refresh, got $code" }
}
if (-not $revoked) { throw 'Refresh succeeded but should have been rejected (token not revoked)' }

Write-Host '[6] Client re-logs in: new JWT should carry role=OPERATOR'
$client2 = Login 'client@sfmc.bj' 'Client@2026'
if ($client2.user.role -ne 'OPERATOR') { throw "Expected role=OPERATOR, got $($client2.user.role)" }

Write-Host '[7] Cleanup: demote back to CLIENT'
Invoke-RestMethod -Uri "http://localhost:3002/api/v1/users/$clientId/role" -Method Put -Headers $headers -Body '{"role":"CLIENT"}' -ContentType 'application/json' | Out-Null

Write-Host ''
Write-Host 'OK — role sync flow passed (update + revoke + re-login)'
