$ErrorActionPreference = "SilentlyContinue"
$ProjectDir = $PSScriptRoot
$Port = 3000
$Url = "http://localhost:$Port"

$env:Path = "C:\Program Files\nodejs;" + $env:Path

function Test-PortOpen($port) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $client.Connect("127.0.0.1", $port)
        $client.Close()
        return $true
    } catch {
        return $false
    }
}

if (-not (Test-PortOpen $Port)) {
    Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c npm run dev > dev-out.log 2>dev-err.log" `
        -WorkingDirectory $ProjectDir `
        -WindowStyle Hidden

    $elapsed = 0
    while (-not (Test-PortOpen $Port) -and $elapsed -lt 30) {
        Start-Sleep -Seconds 1
        $elapsed++
    }
}

Start-Process $Url
