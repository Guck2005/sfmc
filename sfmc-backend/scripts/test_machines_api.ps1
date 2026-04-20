# Quick live-API smoke test for machines endpoints (production-service :3006).
# Exits non-zero if any assertion fails.

$ErrorActionPreference = 'Stop'

Write-Host '[1] GET /machines'
$list = Invoke-RestMethod -Uri 'http://localhost:3006/api/v1/machines' -Method Get
if ($list.data.Count -lt 3) { throw "Expected >= 3 machines, got $($list.data.Count)" }
$m = $list.data | Where-Object { $_.status -eq 'AVAILABLE' } | Select-Object -First 1
if (-not $m) { throw 'No AVAILABLE machine found' }
Write-Host "    using machine $($m.name) ($($m.id))"

Write-Host '[2] PUT status AVAILABLE -> IN_USE (expected 200)'
$r = Invoke-RestMethod -Uri "http://localhost:3006/api/v1/machines/$($m.id)/status" -Method Put -Body '{"status":"IN_USE"}' -ContentType 'application/json'
if ($r.data.status -ne 'IN_USE') { throw "Expected IN_USE, got $($r.data.status)" }

Write-Host '[3] PUT status IN_USE -> MAINTENANCE (expected 200)'
$r = Invoke-RestMethod -Uri "http://localhost:3006/api/v1/machines/$($m.id)/status" -Method Put -Body '{"status":"MAINTENANCE"}' -ContentType 'application/json'
if ($r.data.status -ne 'MAINTENANCE') { throw "Expected MAINTENANCE, got $($r.data.status)" }

Write-Host '[4] PUT status MAINTENANCE -> IN_USE (expected 422)'
$gotExpectedFailure = $false
try {
    Invoke-RestMethod -Uri "http://localhost:3006/api/v1/machines/$($m.id)/status" -Method Put -Body '{"status":"IN_USE"}' -ContentType 'application/json' | Out-Null
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 422) { $gotExpectedFailure = $true }
    else { throw "Expected 422, got $code" }
}
if (-not $gotExpectedFailure) { throw 'Expected failure on MAINTENANCE -> IN_USE, none raised' }

Write-Host '[5] PUT status MAINTENANCE -> AVAILABLE (cleanup, expected 200)'
$r = Invoke-RestMethod -Uri "http://localhost:3006/api/v1/machines/$($m.id)/status" -Method Put -Body '{"status":"AVAILABLE"}' -ContentType 'application/json'
if ($r.data.status -ne 'AVAILABLE') { throw "Expected AVAILABLE, got $($r.data.status)" }

Write-Host ''
Write-Host 'OK — all machines API assertions passed.'
