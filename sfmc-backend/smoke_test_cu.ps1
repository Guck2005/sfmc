# =============================================================================
# SFMC Bénin — Smoke test CU-01 / CU-02 / CU-03 + Sécurité (28 assertions)
# Mirror PowerShell du script bash smoke_test_cu.sh
# =============================================================================

param(
  [string]$ReportFile = "smoke_report.txt",
  [string]$AuthUrl          = "http://localhost:3001",
  [string]$UserUrl          = "http://localhost:3002",
  [string]$ProductUrl       = "http://localhost:3003",
  [string]$InventoryUrl     = "http://localhost:3004",
  [string]$OrderUrl         = "http://localhost:3005",
  [string]$ProductionUrl    = "http://localhost:3006",
  [string]$BillingUrl       = "http://localhost:3007",
  [string]$NotificationUrl  = "http://localhost:3008",
  [string]$ReportingUrl     = "http://localhost:3009",
  [string]$AdminEmail       = "admin@sfmc.bj",
  [string]$AdminPassword    = "Admin@2026"
)

$ErrorActionPreference = "Continue"
$script:Pass = 0
$script:Fail = 0
$script:Report = New-Object System.Collections.Generic.List[string]

function Assert-Case {
  param([bool]$Condition, [string]$Label)
  if ($Condition) {
    Write-Host ("  PASS  " + $Label) -ForegroundColor Green
    $script:Report.Add("PASS  $Label")
    $script:Pass++
  } else {
    Write-Host ("  FAIL  " + $Label) -ForegroundColor Red
    $script:Report.Add("FAIL  $Label")
    $script:Fail++
  }
}

function Try-Http {
  param(
    [string]$Method = "GET",
    [string]$Url,
    $Body = $null,
    [hashtable]$Headers = @{}
  )
  $status = 0
  $content = $null
  $rawResp = $null
  try {
    $params = @{
      Method          = $Method
      Uri             = $Url
      Headers         = $Headers
      TimeoutSec      = 10
      UseBasicParsing = $true
    }
    if ($null -ne $Body) {
      $params.Body        = ($Body | ConvertTo-Json -Depth 6 -Compress)
      $params.ContentType = "application/json"
    }
    $rawResp = Invoke-WebRequest @params
    $status  = [int]$rawResp.StatusCode
    $content = $rawResp.Content
  } catch [System.Net.WebException] {
    $we = $_.Exception
    if ($we.Response) {
      try { $status = [int]$we.Response.StatusCode } catch { $status = 0 }
      try {
        $sr = New-Object System.IO.StreamReader($we.Response.GetResponseStream())
        $content = $sr.ReadToEnd()
        $sr.Close()
      } catch { $content = $null }
      $rawResp = $we.Response
    }
  } catch {
    $status = 0
  }
  $parsed = $null
  if ($content) {
    try { $parsed = $content | ConvertFrom-Json -ErrorAction Stop } catch { $parsed = $content }
  }
  return [pscustomobject]@{
    Status = $status
    Body   = $parsed
    Raw    = $rawResp
  }
}

# =============================================================================
# Section 0 — Préparation : reset rate-limit + login admin + produit disponible
# =============================================================================
Write-Host "`n=== Préparation ===" -ForegroundColor Cyan

# Best-effort : purge des clés de rate-limit pour éviter 429 sur les runs répétés
try {
  $redisContainer = (docker ps --filter "name=sfmc-redis" --format "{{.Names}}" 2>$null | Select-Object -First 1)
  if ($redisContainer) {
    docker exec $redisContainer redis-cli EVAL "for _,k in ipairs(redis.call('keys','ratelimit:login:*')) do redis.call('del',k) end" 0 2>$null | Out-Null
    Write-Host "  (rate-limit Redis purgé via $redisContainer)" -ForegroundColor DarkGray
  }
} catch { }

$login = Try-Http -Method POST -Url "$AuthUrl/api/v1/auth/login" -Body @{
  email    = $AdminEmail
  password = $AdminPassword
}
$adminToken = $null
if ($login.Body -and $login.Body.data -and $login.Body.data.accessToken) {
  $adminToken = $login.Body.data.accessToken
}
if (-not $adminToken) {
  Write-Host "!! Impossible de se connecter en admin ($AdminEmail) — arrêt" -ForegroundColor Red
  exit 2
}
$authHeader = @{ Authorization = "Bearer $adminToken" }

$stocksResp = Try-Http -Url "$InventoryUrl/api/v1/stocks"
$stocks = @()
if ($stocksResp.Body) {
  if ($stocksResp.Body.data) { $stocks = $stocksResp.Body.data }
  else { $stocks = $stocksResp.Body }
}
$product = $stocks | Where-Object {
  ([decimal]$_.quantity - [decimal]$_.reserved) -ge 1
} | Select-Object -First 1
$productId = if ($product) { $product.productId } else { $null }

if (-not $productId) {
  Write-Host "!! Aucun produit avec stock disponible > 0 — certaines assertions vont FAIL" -ForegroundColor Yellow
}

# =============================================================================
# Section 1 — Health checks (9 assertions)
# =============================================================================
Write-Host "`n=== 1. Health checks (9) ===" -ForegroundColor Cyan

$services = @(
  @{ Name = "auth";         Url = $AuthUrl },
  @{ Name = "user";         Url = $UserUrl },
  @{ Name = "product";      Url = $ProductUrl },
  @{ Name = "inventory";    Url = $InventoryUrl },
  @{ Name = "order";        Url = $OrderUrl },
  @{ Name = "production";   Url = $ProductionUrl },
  @{ Name = "billing";      Url = $BillingUrl },
  @{ Name = "notification"; Url = $NotificationUrl },
  @{ Name = "reporting";    Url = $ReportingUrl }
)

foreach ($s in $services) {
  $h = Try-Http -Url ($s.Url + "/health")
  $ok = ($h.Status -eq 200) -and ($h.Body -ne $null) -and ($h.Body.status -eq "ok")
  Assert-Case -Condition $ok -Label ("Health " + $s.Name + "=ok")
}

# =============================================================================
# Section 2 — Sécurité OWASP + rate limiting (4 assertions)
# =============================================================================
Write-Host "`n=== 2. Sécurité (4) ===" -ForegroundColor Cyan

$healthResp = Try-Http -Url "$AuthUrl/health"
$headers = @{}
if ($healthResp.Raw) {
  foreach ($h in $healthResp.Raw.Headers.Keys) {
    $headers[$h.ToLower()] = ($healthResp.Raw.Headers[$h] -join ",")
  }
}

Assert-Case -Condition ($headers["x-frame-options"] -eq "DENY") -Label "Header X-Frame-Options=DENY"
Assert-Case -Condition ($headers["x-content-type-options"] -eq "nosniff") -Label "Header X-Content-Type-Options=nosniff"
Assert-Case -Condition ($headers.ContainsKey("content-security-policy")) -Label "Header CSP présent"

$throttled = $false
for ($i = 1; $i -le 10; $i++) {
  $bad = Try-Http -Method POST -Url "$AuthUrl/api/v1/auth/login" -Body @{
    email = "nobody@test.local"
    password = "bad"
  }
  if ($bad.Status -eq 429) { $throttled = $true; break }
}
Assert-Case -Condition $throttled -Label "Rate limit /auth/login → 429"

# =============================================================================
# Section 3 — CU-01 : création commande (7 assertions)
# =============================================================================
Write-Host "`n=== 3. CU-01 Création commande (7) ===" -ForegroundColor Cyan

$customerId = [guid]::NewGuid().ToString()
$orderResp = $null
$orderId = $null
$initialStatus = $null

if ($productId) {
  $orderResp = Try-Http -Method POST -Url "$OrderUrl/api/v1/orders" -Headers $authHeader -Body @{
    customerId = $customerId
    lines = @(@{ productId = $productId; quantity = 1; unitPrice = 2500 })
  }
  if ($orderResp.Body -and $orderResp.Body.data) {
    $orderId       = $orderResp.Body.data.id
    $initialStatus = $orderResp.Body.data.status
  }
}

Assert-Case -Condition ($orderResp -and $orderResp.Status -eq 201) `
            -Label ("CU-01 #1 POST /orders → 201 (obtenu " + ($(if($orderResp){$orderResp.Status}else{"0"})) + ")")
Assert-Case -Condition ($initialStatus -eq "PENDING") `
            -Label ("CU-01 #2 Order initial status=PENDING (obtenu $initialStatus)")

Start-Sleep -Milliseconds 3500

$finalStatus = $null
if ($orderId) {
  $getOrder = Try-Http -Url "$OrderUrl/api/v1/orders/$orderId" -Headers $authHeader
  if ($getOrder.Body -and $getOrder.Body.data) {
    $finalStatus = $getOrder.Body.data.status
  }
}
Assert-Case -Condition ($finalStatus -eq "VALIDATED") `
            -Label ("CU-01 #3 Order après saga → VALIDATED (obtenu $finalStatus)")

$invoiceCount = 0
$invoiceStatus = $null
$invoiceAmount = $null
if ($orderId) {
  $inv = Try-Http -Url "$BillingUrl/api/v1/invoices?orderId=$orderId&limit=5" -Headers $authHeader
  if ($inv.Body -and $inv.Body.data) {
    $invoiceCount = @($inv.Body.data).Count
    if ($invoiceCount -gt 0) {
      $invoiceStatus = $inv.Body.data[0].status
      $invoiceAmount = [decimal]$inv.Body.data[0].amount
    }
  }
}

Assert-Case -Condition ($invoiceCount -gt 0) -Label "CU-01 #4 Billing: facture créée pour l'order"
Assert-Case -Condition ($invoiceStatus -eq "PENDING") -Label ("CU-01 #5 Billing: facture.status=PENDING (obtenu $invoiceStatus)")
Assert-Case -Condition ($invoiceAmount -eq 2500) -Label ("CU-01 #6 Billing: montant=2500 (obtenu $invoiceAmount)")

$notifs = Try-Http -Url "$NotificationUrl/api/v1/notifications?type=ORDER_VALIDATED&limit=5" -Headers $authHeader
$notifChannel = $null
if ($notifs.Body -and $notifs.Body.data -and @($notifs.Body.data).Count -gt 0) {
  $notifChannel = $notifs.Body.data[0].channel
}
Assert-Case -Condition ($notifChannel -eq "EMAIL") `
            -Label ("CU-01 #7 Notification ORDER_VALIDATED channel=EMAIL (obtenu $notifChannel)")

# =============================================================================
# Section 4 — CU-02 : production completed (5 assertions)
# =============================================================================
Write-Host "`n=== 4. CU-02 Production (5) ===" -ForegroundColor Cyan

function Get-ProductStockTotal {
  param([string]$ProductId)
  $resp = Try-Http -Url "$InventoryUrl/api/v1/stocks?productId=$ProductId"
  if (-not $resp.Body -or -not $resp.Body.data) { return [decimal]0 }
  $total = [decimal]0
  foreach ($s in @($resp.Body.data)) {
    $total += [decimal]$s.quantity
  }
  return $total
}

$qtyBefore = 0
$poResp = $null
$poId = $null
if ($productId) {
  $qtyBefore = Get-ProductStockTotal -ProductId $productId
  $poBody = @{
    productId = $productId
    quantity  = 3
    orderId   = $(if ($orderId) { $orderId } else { [guid]::NewGuid().ToString() })
  }
  $poResp = Try-Http -Method POST -Url "$ProductionUrl/api/v1/production-orders" -Body $poBody -Headers $authHeader
  if ($poResp.Body -and $poResp.Body.data) { $poId = $poResp.Body.data.id }
}

Assert-Case -Condition ($poResp -and $poResp.Status -eq 201) `
            -Label ("CU-02 #1 POST /production-orders → 201 (obtenu " + ($(if($poResp){$poResp.Status}else{"0"})) + ")")

$qcStatus = 0
if ($poId) {
  Try-Http -Method PUT -Url "$ProductionUrl/api/v1/production-orders/$poId/status" -Body @{ status = "IN_PROGRESS" } -Headers $authHeader | Out-Null
  Try-Http -Method PUT -Url "$ProductionUrl/api/v1/production-orders/$poId/status" -Body @{ status = "QUALITY_CHECK" } -Headers $authHeader | Out-Null
  $qc = Try-Http -Method POST -Url "$ProductionUrl/api/v1/production-orders/$poId/quality" -Body @{ passed = $true } -Headers $authHeader
  $qcStatus = $qc.Status
}
Assert-Case -Condition ($qcStatus -eq 200) -Label ("CU-02 #2 Quality control pass → 200 (obtenu $qcStatus)")

Start-Sleep -Milliseconds 3500

$poStatus = $null
if ($poId) {
  $getPo = Try-Http -Url "$ProductionUrl/api/v1/production-orders/$poId" -Headers $authHeader
  if ($getPo.Body -and $getPo.Body.data) { $poStatus = $getPo.Body.data.status }
}
Assert-Case -Condition ($poStatus -eq "COMPLETED") -Label ("CU-02 #3 OF final status=COMPLETED (obtenu $poStatus)")

$qtyAfter = 0
if ($productId) {
  for ($i = 0; $i -lt 5; $i++) {
    $qtyAfter = Get-ProductStockTotal -ProductId $productId
    if ($qtyAfter -gt $qtyBefore) { break }
    Start-Sleep -Milliseconds 1500
  }
}
Assert-Case -Condition ($qtyAfter -gt $qtyBefore) `
            -Label ("CU-02 #4 Stock produit fini augmenté (avant=$qtyBefore, après=$qtyAfter)")

$prodNotifs = Try-Http -Url "$NotificationUrl/api/v1/notifications?type=PRODUCTION_COMPLETED&limit=5" -Headers $authHeader
$prodCount = 0
if ($prodNotifs.Body -and $prodNotifs.Body.data) { $prodCount = @($prodNotifs.Body.data).Count }
Assert-Case -Condition ($prodCount -gt 0) -Label "CU-02 #5 Notification PRODUCTION_COMPLETED émise"

# =============================================================================
# Section 5 — CU-03 : alerte stock critique (3 assertions)
# =============================================================================
Write-Host "`n=== 5. CU-03 Alerte stock critique (3) ===" -ForegroundColor Cyan

$baseline = Try-Http -Url "$NotificationUrl/api/v1/notifications?type=CRITICAL_STOCK&limit=50" -Headers $authHeader
$baselineCount = 0
if ($baseline.Body -and $baseline.Body.data) { $baselineCount = @($baseline.Body.data).Count }

$thCode = 0
$mvCode = 0
$stockId = $null
$origThreshold = 0
if ($productId) {
  $info = Try-Http -Url "$InventoryUrl/api/v1/stocks?productId=$productId"
  if ($info.Body -and $info.Body.data -and @($info.Body.data).Count -gt 0) {
    $s = $info.Body.data[0]
    $stockId       = $s.id
    $origThreshold = [int]$s.threshold
    $avail         = [int]$s.quantity - [int]$s.reserved
    $newThreshold  = $avail + 10

    $th = Try-Http -Method PUT -Url "$InventoryUrl/api/v1/stocks/$stockId/threshold" -Body @{ threshold = $newThreshold }
    $thCode = $th.Status

    $mv = Try-Http -Method POST -Url "$InventoryUrl/api/v1/stocks/movements" -Body @{
      stockId  = $stockId
      type     = "OUT"
      quantity = 1
      origin   = "smoke_cu03"
    }
    $mvCode = $mv.Status
  }
}

Assert-Case -Condition ($thCode -eq 200) -Label ("CU-03 #1 PUT threshold → 200 (obtenu $thCode)")
Assert-Case -Condition ($mvCode -eq 201) -Label ("CU-03 #2 POST mouvement OUT → 201 (obtenu $mvCode)")

Start-Sleep -Milliseconds 4000

$after = Try-Http -Url "$NotificationUrl/api/v1/notifications?type=CRITICAL_STOCK&limit=50" -Headers $authHeader
$afterCount = 0
if ($after.Body -and $after.Body.data) { $afterCount = @($after.Body.data).Count }
Assert-Case -Condition ($afterCount -gt $baselineCount) `
            -Label ("CU-03 #3 Notification CRITICAL_STOCK déclenchée (avant=$baselineCount, après=$afterCount)")

# Rollback best-effort
if ($stockId) {
  Try-Http -Method PUT -Url "$InventoryUrl/api/v1/stocks/$stockId/threshold" -Body @{ threshold = $origThreshold } | Out-Null
  Try-Http -Method POST -Url "$InventoryUrl/api/v1/stocks/movements" -Body @{
    stockId = $stockId; type = "IN"; quantity = 1; origin = "smoke_cu03_rollback"
  } | Out-Null
}

# =============================================================================
# Rapport final
# =============================================================================
Write-Host ""
Write-Host "=============================" -ForegroundColor Cyan
Write-Host "RAPPORT SMOKE CU-01/02/03 + Sécurité" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan

$out = New-Object System.Collections.Generic.List[string]
$out.Add("SFMC Bénin — Smoke test CU-01 / CU-02 / CU-03 + Sécurité")
$out.Add("Date : " + (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"))
$out.Add("=============================")
foreach ($l in $script:Report) { $out.Add($l) }
$out.Add("=============================")
$out.Add("TOTAL : PASS=$($script:Pass)  FAIL=$($script:Fail)  (attendu 28)")
$out | Set-Content -Path $ReportFile -Encoding UTF8

Get-Content $ReportFile | Write-Host

if ($script:Fail -eq 0 -and $script:Pass -eq 28) {
  exit 0
} else {
  exit 1
}
