$port = 8080
$root = $PSScriptRoot
if (-not $root) { $root = "c:\Users\rodri\OneDrive\Documentos\zavala 3" }

# Sobe o listener PRIMEIRO: a porta fica disponivel na hora.
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port)
$listener.Start()

# Detecta o IP do celular na mesma rede Wi-Fi/Ethernet (sincrono, sem travar).
$ip = "localhost"
try {
    $found = Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object {
            ($_.InterfaceAlias -like "*Wi-Fi*" -or $_.InterfaceAlias -like "*Ethernet*") -and
            $_.IPAddress -notlike "169.254.*" -and $_.IPAddress -ne "127.0.0.1"
        } |
        Select-Object -First 1
    if ($found) { $ip = $found.IPAddress }
} catch { }

# Garante regra de firewall para o celular (se rodar como admin); senao, apenas avisa.
try {
    $rule = Get-NetFirewallRule -DisplayName "ZAVALA Site $port" -ErrorAction SilentlyContinue
    if (-not $rule) {
        New-NetFirewallRule -DisplayName "ZAVALA Site $port" -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Any | Out-Null
        Write-Host "  Regra de firewall criada para a porta $port." -ForegroundColor Green
    }
} catch {
    Write-Host "  AVISO: sem permissao de admin. Se o celular nao abrir, rode o server.ps1 como Administrador." -ForegroundColor Yellow
}

Write-Host "=========================================" -ForegroundColor Green
Write-Host "  SERVIDOR ATIVO E PRONTO!" -ForegroundColor Green
Write-Host "  No PC:      http://localhost:$port" -ForegroundColor Cyan
Write-Host "  No Celular: http://$($ip):$port" -ForegroundColor Yellow
Write-Host "=========================================" -ForegroundColor Green

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $client.ReceiveTimeout = 10000
            $client.SendTimeout = 10000
            $stream = $client.GetStream()
            $stream.ReadTimeout = 10000
            $stream.WriteTimeout = 10000
            $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8)
            $requestLine = $reader.ReadLine()
            
            if ($requestLine) {
                $parts = $requestLine.Split(" ")
                if ($parts.Length -ge 2) {
                    $rawPath = $parts[1].Split("?")[0]
                    $decodedPath = [System.Uri]::UnescapeDataString($rawPath)
                    if ($decodedPath -eq "/" -or $decodedPath -eq "") {
                        $decodedPath = "/index.html"
                    }

                    $relPath = $decodedPath.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
                    $fullPath = [System.IO.Path]::Combine($root, $relPath)

                    if ([System.IO.File]::Exists($fullPath)) {
                        $bytes = [System.IO.File]::ReadAllBytes($fullPath)
                        $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
                        $contentType = switch ($ext) {
                            ".html" { "text/html; charset=utf-8" }
                            ".css"  { "text/css; charset=utf-8" }
                            ".js"   { "application/javascript; charset=utf-8" }
                            ".svg"  { "image/svg+xml" }
                            ".png"  { "image/png" }
                            ".jpg"  { "image/jpeg" }
                            ".jpeg" { "image/jpeg" }
                            ".webp" { "image/webp" }
                            ".ico"  { "image/x-icon" }
                            ".json" { "application/json; charset=utf-8" }
                            default { "application/octet-stream" }
                        }

                        $header = "HTTP/1.1 200 OK`r`n" +
                                  "Content-Type: $contentType`r`n" +
                                  "Content-Length: $($bytes.Length)`r`n" +
                                  "Access-Control-Allow-Origin: *`r`n" +
                                  "Connection: close`r`n`r`n"
                        $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
                        $stream.Write($headerBytes, 0, $headerBytes.Length)
                        $stream.Write($bytes, 0, $bytes.Length)
                    } else {
                        $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
                        $header = "HTTP/1.1 404 Not Found`r`n" +
                                  "Content-Type: text/plain`r`n" +
                                  "Content-Length: $($msg.Length)`r`n" +
                                  "Connection: close`r`n`r`n"
                        $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
                        $stream.Write($headerBytes, 0, $headerBytes.Length)
                        $stream.Write($msg, 0, $msg.Length)
                    }
                    $stream.Flush()
                }
            }
        } catch {
        } finally {
            $client.Close()
        }
    }
} finally {
    $listener.Stop()
}
