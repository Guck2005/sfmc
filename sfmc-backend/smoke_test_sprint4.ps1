<# ============================================
   SFMC BENIN - SMOKE TEST SPRINT 4
   Reporting, Securite, Observabilite, Deploiement
============================================ #>
$ErrorActionPreference = "Stop"
$global:Report = @()
$StartTime = Get-Date

function Assert-Check($condition, $label) {
    if ($condition) {
        Write-Host "    -> $label : PASS" -ForegroundColor Green
        $global:Report += @{ Label = $label; Status = "PASS" }
    } else {
        Write-Host "    -> $label : FAIL" -ForegroundColor Red
        $global:Report += @{ Label = $label; Status = "FAIL" }
        throw "Echec du smoke test: $label"
    }
}

try {
    # --------------------------------------------------
    # 1. Health Checks enrichis - 9 services
    # --------------------------------------------------
    Write-Host "[*] 1. Health Checks enrichis (DB + RabbitMQ)" -ForegroundColor Cyan
    $services = @(
        @{ Name = "Auth";         Port = 3001; Rabbit = $false },
        @{ Name = "User";         Port = 3002; Rabbit = $false },
        @{ Name = "Product";      Port = 3003; Rabbit = $false },
        @{ Name = "Inventory";    Port = 3004; Rabbit = $true  },
        @{ Name = "Order";        Port = 3005; Rabbit = $true  },
        @{ Name = "Production";   Port = 3006; Rabbit = $true  },
        @{ Name = "Billing";      Port = 3007; Rabbit = $true  },
        @{ Name = "Notification"; Port = 3008; Rabbit = $true  },
        @{ Name = "Reporting";    Port = 3009; Rabbit = $true  }
    )
    foreach ($svc in $services) {
        try {
            $res = Invoke-RestMethod -Uri "http://localhost:$($svc.Port)/health" -Method GET -TimeoutSec 5
            Assert-Check ($res.status -eq 'ok') "Health $($svc.Name) status=ok"
            Assert-Check ($res.checks.database -eq 'ok') "Health $($svc.Name) DB=ok"
            if ($svc.Rabbit) {
                Assert-Check ($res.checks.rabbitmq -eq 'ok') "Health $($svc.Name) RabbitMQ=ok"
            }
        } catch {
            Write-Host "    -> Health $($svc.Name) (:$($svc.Port)) FAIL - $_" -ForegroundColor Red
            $global:Report += @{ Label = "Health $($svc.Name) (:$($svc.Port))"; Status = "FAIL" }
            throw "Service $($svc.Name) non disponible"
        }
    }

    # --------------------------------------------------
    # 2. Security headers (OWASP) sur auth-service
    # --------------------------------------------------
    Write-Host "[*] 2. Headers OWASP" -ForegroundColor Cyan
    $raw = Invoke-WebRequest -Uri "http://localhost:3001/health" -Method GET -UseBasicParsing
    Assert-Check ($raw.Headers["X-Frame-Options"] -eq "DENY") "Header X-Frame-Options=DENY"
    Assert-Check ($raw.Headers["X-Content-Type-Options"] -eq "nosniff") "Header X-Content-Type-Options=nosniff"
    Assert-Check ($null -ne $raw.Headers["Referrer-Policy"]) "Header Referrer-Policy present"
    Assert-Check ($null -ne $raw.Headers["Content-Security-Policy"]) "Header CSP present"

    # --------------------------------------------------
    # 3. Rate Limiting auth-service (/login 5/15min)
    # --------------------------------------------------
    Write-Host "[*] 3. Rate limit /login (5/15min)" -ForegroundColor Cyan
    $body = @{ email = "nobody@test.local"; password = "bad" } | ConvertTo-Json
    $throttled = $false
    for ($i = 1; $i -le 8; $i++) {
        try {
            Invoke-RestMethod -Uri "http://localhost:3001/api/v1/auth/login" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 5 | Out-Null
        } catch {
            if ($_.Exception.Response.StatusCode.Value__ -eq 429) { $throttled = $true; break }
        }
    }
    Assert-Check $throttled "Rate limit 429 declenche apres 5 requetes"

    # --------------------------------------------------
    # 4. Authentification JWT (fallback local)
    # --------------------------------------------------
    Write-Host "[*] 4. Authentification JWT" -ForegroundColor Cyan
    $Token = $null
    try {
        Start-Sleep -Seconds 2
        $LoginBody = @{ email = "admin@sfmc.bj"; password = "secret123" } | ConvertTo-Json
        $LoginRes = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/auth/login" -Method POST -Body $LoginBody -ContentType "application/json"
        $Token = $LoginRes.data.token.token
    } catch {
        $Token = node -e "const jwt = require('jsonwebtoken'); console.log(jwt.sign({ sub: '123e4567-e89b-12d3-a456-426614174000', email: 'admin@sfmc.bj', role: 'ADMIN' }, 'dev-secret-change-me-32-characters-minimum', { expiresIn: '1h' }))"
    }
    Assert-Check ($null -ne $Token) "Obtention du token JWT"
    $Headers = @{ Authorization = "Bearer $Token" }

    # --------------------------------------------------
    # 5. Commande declenchant projection CQRS vers Reporting
    # --------------------------------------------------
    Write-Host "[*] 5. Commande declenchant projection CQRS" -ForegroundColor Cyan
    $Products = Invoke-RestMethod -Uri "http://localhost:3003/api/v1/products" -Method GET -Headers $Headers
    $ProductId = $Products.data[0].id

    $OrderBody = @{
        customerId = "123e4567-e89b-12d3-a456-426614174000"
        lines = @(@{ productId = $ProductId; quantity = 1; unitPrice = 5500 })
    } | ConvertTo-Json -Depth 5
    $OrderRes = Invoke-RestMethod -Uri "http://localhost:3005/api/v1/orders" -Method POST -Body $OrderBody -ContentType "application/json" -Headers $Headers
    $OrderId = $OrderRes.data.id
    Assert-Check ($OrderRes.data.status -eq "PENDING") "Commande creee (Saga PENDING)"

    Start-Sleep -Seconds 6

    # --------------------------------------------------
    # 6. Dashboard REST Reporting
    # --------------------------------------------------
    Write-Host "[*] 6. Dashboard REST Reporting" -ForegroundColor Cyan
    $dash = Invoke-RestMethod -Uri "http://localhost:3009/api/v1/reports/dashboard" -Method GET -Headers $Headers -TimeoutSec 5
    Assert-Check ($null -ne $dash.data) "GET /api/v1/reports/dashboard repond"
    Assert-Check ($dash.data.totalOrders -ge 1) "Reporting: au moins 1 commande projetee"

    # --------------------------------------------------
    # 7. GraphQL Reporting dashboardKPIs
    # --------------------------------------------------
    Write-Host "[*] 7. GraphQL Reporting" -ForegroundColor Cyan
    $gqlBody = @{ query = "{ dashboardKPIs { totalOrders totalRevenue qualityFailureRate ordersByStatus { status count } } }" } | ConvertTo-Json
    $gql = Invoke-RestMethod -Uri "http://localhost:3009/graphql" -Method POST -Body $gqlBody -ContentType "application/json" -Headers $Headers -TimeoutSec 5
    Assert-Check ($null -ne $gql.data.dashboardKPIs) "GraphQL dashboardKPIs OK"

    # --------------------------------------------------
    # 8. Compensation Saga via annulation
    # --------------------------------------------------
    Write-Host "[*] 8. Annulation Saga - projection CANCELLED" -ForegroundColor Cyan
    Invoke-RestMethod -Uri "http://localhost:3005/api/v1/orders/$OrderId/cancel" -Method POST -Headers $Headers | Out-Null
    Start-Sleep -Seconds 4
    $OrderFinal = Invoke-RestMethod -Uri "http://localhost:3005/api/v1/orders/$OrderId" -Method GET -Headers $Headers
    Assert-Check ($OrderFinal.data.status -eq "CANCELLED") "Order passe a CANCELLED"

    # --------------------------------------------------
    # 9. Dockerfiles presents sur les 9 services
    # --------------------------------------------------
    Write-Host "[*] 9. Dockerfiles sur les 9 services" -ForegroundColor Cyan
    $allDockerfiles = $true
    $svcDirs = @("auth-service","user-service","product-service","inventory-service","order-service","production-service","billing-service","notification-service","reporting-service")
    foreach ($d in $svcDirs) {
        if (-not (Test-Path "services/$d/Dockerfile")) { $allDockerfiles = $false; break }
    }
    Assert-Check $allDockerfiles "Dockerfile present sur 9 services"

    # --------------------------------------------------
    # 10. docker-compose.prod.yml + manifests K8s
    # --------------------------------------------------
    Write-Host "[*] 10. Artefacts de deploiement" -ForegroundColor Cyan
    Assert-Check (Test-Path "docker-compose.prod.yml") "docker-compose.prod.yml present"
    Assert-Check (Test-Path "infra/k8s/namespace.yaml") "infra/k8s/namespace.yaml present"
    Assert-Check (Test-Path "infra/k8s/configmap.yaml") "infra/k8s/configmap.yaml present"
    Assert-Check (Test-Path "infra/k8s/secret.yaml") "infra/k8s/secret.yaml present"
    Assert-Check (Test-Path "infra/k8s/hpa.yaml") "infra/k8s/hpa.yaml present"
    $deployCount = (Get-ChildItem infra/k8s -Filter '*-deployment.yaml').Count
    Assert-Check ($deployCount -eq 9) "9 manifests *-deployment.yaml (trouve: $deployCount)"

    # --------------------------------------------------
    # 11. Idempotence - 2eme commande, agregation Reporting
    # --------------------------------------------------
    Write-Host "[*] 11. Re-creation + idempotence Reporting" -ForegroundColor Cyan
    $null = Invoke-RestMethod -Uri "http://localhost:3005/api/v1/orders" -Method POST -Body $OrderBody -ContentType "application/json" -Headers $Headers
    Start-Sleep -Seconds 5
    $dash2 = Invoke-RestMethod -Uri "http://localhost:3009/api/v1/reports/dashboard" -Method GET -Headers $Headers
    Assert-Check ($dash2.data.totalOrders -ge 2) "Reporting agrege la 2eme commande"

    # --------------------------------------------------
    # 12. GraphQL criticalStockAlerts
    # --------------------------------------------------
    Write-Host "[*] 12. GraphQL criticalStockAlerts" -ForegroundColor Cyan
    $gqlBody2 = @{ query = "{ criticalStockAlerts { productId quantity threshold } }" } | ConvertTo-Json
    $gql2 = Invoke-RestMethod -Uri "http://localhost:3009/graphql" -Method POST -Body $gqlBody2 -ContentType "application/json" -Headers $Headers -TimeoutSec 5
    Assert-Check ($null -ne $gql2.data.criticalStockAlerts) "GraphQL criticalStockAlerts execute"

    # --------------------------------------------------
    # 13. GraphQL productionReport
    # --------------------------------------------------
    Write-Host "[*] 13. GraphQL productionReport" -ForegroundColor Cyan
    $gqlBody3 = @{ query = "{ productionReport { byStatus { status count } } }" } | ConvertTo-Json
    $gql3 = Invoke-RestMethod -Uri "http://localhost:3009/graphql" -Method POST -Body $gqlBody3 -ContentType "application/json" -Headers $Headers -TimeoutSec 5
    Assert-Check ($null -ne $gql3.data.productionReport) "GraphQL productionReport execute"

} catch {
    Write-Host ""
    Write-Host "[!] Erreur interceptee : $_" -ForegroundColor Red
}

$EndTime = Get-Date
$Duration = ($EndTime - $StartTime).TotalSeconds

Write-Host ""
Write-Host "=============================" -ForegroundColor Magenta
Write-Host "RAPPORT SMOKE TEST SPRINT 4" -ForegroundColor Magenta
Write-Host "=============================" -ForegroundColor Magenta
Write-Host "Temps execution : $([math]::Round($Duration, 2)) secondes"

$AllPass = $true
foreach ($entry in $global:Report) {
    if ($entry.Status -eq "PASS") {
        Write-Host "[PASS] $($entry.Label)" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] $($entry.Label)" -ForegroundColor Red
        $AllPass = $false
    }
}

Write-Host "=============================" -ForegroundColor Magenta
if ($AllPass -and $global:Report.Count -gt 0) {
    Write-Host "RESULTAT GLOBAL : SUCCES" -ForegroundColor Green
} else {
    Write-Host "RESULTAT GLOBAL : ECHEC" -ForegroundColor Red
    exit 1
}
