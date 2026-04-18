<# ============================================
   SFMC BENIN - TEST EMAIL BREVO
   Declenche order.validated -> email via notification-service
============================================ #>
$ErrorActionPreference = "Stop"
$StartTime = Get-Date

Write-Host ""
Write-Host "=========================================" -ForegroundColor Magenta
Write-Host "  TEST EMAIL BREVO (order.validated)" -ForegroundColor Magenta
Write-Host "=========================================" -ForegroundColor Magenta

# --------------------------------------------------
# 1. Verifier que les services cles sont up
# --------------------------------------------------
Write-Host ""
Write-Host "[*] 1. Verification des services requis" -ForegroundColor Cyan
$required = @(
    @{ Name = "Product";       Port = 3003 },
    @{ Name = "Inventory";     Port = 3004 },
    @{ Name = "Order";         Port = 3005 },
    @{ Name = "Notification";  Port = 3008 }
)
foreach ($svc in $required) {
    try {
        $r = Invoke-RestMethod -Uri "http://localhost:$($svc.Port)/health" -Method GET -TimeoutSec 3
        if ($r.status -eq 'ok') {
            Write-Host "    -> $($svc.Name) (:$($svc.Port)) OK" -ForegroundColor Green
        } else {
            Write-Host "    -> $($svc.Name) (:$($svc.Port)) degraded" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "    -> $($svc.Name) (:$($svc.Port)) INJOIGNABLE" -ForegroundColor Red
        Write-Host "       Lance 'npm run dev' dans services/$($svc.Name.ToLower())-service" -ForegroundColor Red
        exit 1
    }
}

# --------------------------------------------------
# 2. Generation token JWT (fallback local)
# --------------------------------------------------
Write-Host ""
Write-Host "[*] 2. Generation du token JWT" -ForegroundColor Cyan
$Token = node -e "const jwt = require('jsonwebtoken'); console.log(jwt.sign({ id: '123e4567-e89b-12d3-a456-426614174000', role: 'ADMIN' }, 'dev-secret-change-me-32-characters-minimum', { expiresIn: '1h' }))"
if ($null -eq $Token) {
    Write-Host "    -> Echec generation JWT" -ForegroundColor Red
    exit 1
}
Write-Host "    -> Token genere (longueur: $($Token.Length))" -ForegroundColor Green
$Headers = @{ Authorization = "Bearer $Token" }

# --------------------------------------------------
# 3. Recuperer un produit
# --------------------------------------------------
Write-Host ""
Write-Host "[*] 3. Recuperation d'un produit" -ForegroundColor Cyan
$Products = Invoke-RestMethod -Uri "http://localhost:3003/api/v1/products" -Method GET -Headers $Headers
if ($Products.data.Count -eq 0) {
    Write-Host "    -> Aucun produit. Cree-en un via POST /api/v1/products avant." -ForegroundColor Red
    exit 1
}
$ProductId = $Products.data[0].id
$ProductName = $Products.data[0].name
Write-Host "    -> Produit: $ProductName ($ProductId)" -ForegroundColor Green

# --------------------------------------------------
# 4. Creer la commande (Saga)
# --------------------------------------------------
Write-Host ""
Write-Host "[*] 4. Creation d'une commande" -ForegroundColor Cyan
$OrderBody = @{
    customerId = "123e4567-e89b-12d3-a456-426614174000"
    lines = @(@{ productId = $ProductId; quantity = 1; unitPrice = 5500 })
} | ConvertTo-Json -Depth 5

$OrderRes = Invoke-RestMethod -Uri "http://localhost:3005/api/v1/orders" -Method POST -Body $OrderBody -ContentType "application/json" -Headers $Headers
$OrderId = $OrderRes.data.id
Write-Host "    -> Commande creee: $OrderId (statut: $($OrderRes.data.status))" -ForegroundColor Green

# --------------------------------------------------
# 5. Attente propagation Saga -> order.validated -> notification
# --------------------------------------------------
Write-Host ""
Write-Host "[*] 5. Attente Saga + dispatch Brevo (8 sec)" -ForegroundColor Cyan
Start-Sleep -Seconds 8

# --------------------------------------------------
# 6. Verifier que la commande est VALIDATED
# --------------------------------------------------
Write-Host ""
Write-Host "[*] 6. Verification statut commande" -ForegroundColor Cyan
$OrderCheck = Invoke-RestMethod -Uri "http://localhost:3005/api/v1/orders/$OrderId" -Method GET -Headers $Headers
if ($OrderCheck.data.status -eq "VALIDATED") {
    Write-Host "    -> Commande VALIDATED : l'event order.validated a ete emis" -ForegroundColor Green
} else {
    Write-Host "    -> Commande statut: $($OrderCheck.data.status) (attendu: VALIDATED)" -ForegroundColor Yellow
    Write-Host "       Si PENDING, le Saga n'a pas fini. Verifie inventory-service + logs." -ForegroundColor Yellow
}

# --------------------------------------------------
# Fin
# --------------------------------------------------
$Duration = ((Get-Date) - $StartTime).TotalSeconds
Write-Host ""
Write-Host "=========================================" -ForegroundColor Magenta
Write-Host "  TERMINE en $([math]::Round($Duration, 1)) secondes" -ForegroundColor Magenta
Write-Host "=========================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "Maintenant verifie :" -ForegroundColor Yellow
Write-Host "  1. Logs du notification-service -> [brevo] email sent" -ForegroundColor White
Write-Host "  2. Ta boite mail (davidyd07@gmail.com)" -ForegroundColor White
Write-Host "     Sujet: 'Commande $OrderId validee'" -ForegroundColor Gray
Write-Host "     (verifie aussi dossier spam / promotions)" -ForegroundColor Gray
Write-Host ""
