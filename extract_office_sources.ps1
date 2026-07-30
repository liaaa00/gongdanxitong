$ErrorActionPreference = 'Continue'
$office = Join-Path $env:LOCALAPPDATA 'officecli\officecli.exe'
$sourceDir = 'C:\Users\Asus\AppData\Local\Temp\aionui\general'
$outDir = Join-Path $PSScriptRoot 'analysis\source-extracts'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$files = Get-ChildItem -LiteralPath $sourceDir -File | Where-Object {
    ($_.Extension -in '.docx', '.xlsx') -and $_.BaseName.EndsWith('(2)')
} | Sort-Object Name

$manifest = @()
foreach ($file in $files) {
    $safeName = ($file.BaseName -replace '[<>:"/\\|?*]', '_') + '.txt'
    $outPath = Join-Path $outDir $safeName
    $lines = & $office view $file.FullName text --max-lines 10000 2>&1
    $header = @(
        "SOURCE: $($file.FullName)",
        "TYPE: $($file.Extension)",
        "EXTRACTED_AT: $(Get-Date -Format o)",
        ('=' * 100)
    )
    Set-Content -LiteralPath $outPath -Value ($header + $lines) -Encoding UTF8
    $manifest += [PSCustomObject]@{
        Name = $file.Name
        Source = $file.FullName
        Extract = $outPath
        Bytes = $file.Length
        ExtractLines = @($lines).Count
    }
}
$manifest | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $outDir 'manifest.json') -Encoding UTF8
Write-Output "Extracted $($manifest.Count) Office files to $outDir"
