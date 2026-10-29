<#
.SYNOPSIS
    Regenerate the model dropdown's CATALOG and VISION tables from the profile's
    provider config.

.DESCRIPTION
    The Models settings page writes to the profile's cordis.patch.yml. This script
    reads that same file, extracts every provider's models (and whether each one
    declares an `image` input modality), and rewrites the block between
    `// <catalog:start>` and `// <catalog:end>` in lib/client.js.

    Run it after adding or removing models, then restart DSH (the browser bundle is
    only read at startup).

.EXAMPLE
    .\sync-catalog.ps1
    .\sync-catalog.ps1 -ProfileName desktop
    .\sync-catalog.ps1 -WhatIf
#>
param(
    [string]$ClientJs = (Join-Path $PSScriptRoot '..\lib\client.js'),
    [string]$ProfileName = 'desktop',
    [string]$ProfileYml,
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'

if (-not $ProfileYml) {
    $dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
    $ProfileYml = Join-Path $dshHome "profiles\$ProfileName\cordis.patch.yml"
}

if (-not (Test-Path $ProfileYml)) { throw "provider config not found: $ProfileYml" }
if (-not (Test-Path $ClientJs)) { throw "client bundle not found: $ClientJs" }

# Providers sit at six spaces, model rows at ten, modality rows at fourteen.
# Indentation is the only signal needed and a full YAML parser would be overkill.
$catalog = [ordered]@{}
$current = $null
$inProviders = $false

foreach ($line in [System.IO.File]::ReadAllLines($ProfileYml)) {
    if ($line -match '^\s+providers:\s*$') { $inProviders = $true; continue }
    if ($line -match '^\s{0,4}\S' -and $line -notmatch '^\s*#') { $inProviders = $false }
    if (-not $inProviders) { continue }

    if ($line -match '^      ([A-Za-z0-9_.\-]+):\s*$') {
        $current = $Matches[1]
        if (-not $catalog.Contains($current)) { $catalog[$current] = @() }
        continue
    }
    if ($line -match '^          - id:\s*(.+?)\s*$' -and $current) {
        $catalog[$current] += [pscustomobject]@{ id = $Matches[1]; image = $false }
        continue
    }
    if ($line -match '^              -\s*image\s*$' -and $current -and $catalog[$current].Count -gt 0) {
        $catalog[$current][-1].image = $true
    }
}

$names = @($catalog.Keys)
if ($names.Count -eq 0) { throw "no providers found in $ProfileYml" }

$tab = "`t"
$sb = [System.Text.StringBuilder]::new()
[void]$sb.AppendLine("${tab}${tab}const CATALOG = {")
foreach ($name in $names) {
    $ids = @($catalog[$name] | ForEach-Object { $_.id })
    [void]$sb.AppendLine("${tab}${tab}${tab}`"$name`": [")
    for ($i = 0; $i -lt $ids.Count; $i += 5) {
        $chunk = $ids[$i..([Math]::Min($i + 4, $ids.Count - 1))]
        $joined = ($chunk | ForEach-Object { "`"$_`"" }) -join ', '
        [void]$sb.AppendLine("${tab}${tab}${tab}${tab}$joined,")
    }
    [void]$sb.AppendLine("${tab}${tab}${tab}],")
}
[void]$sb.AppendLine("${tab}${tab}};")
[void]$sb.AppendLine()

$vision = @()
foreach ($name in $names) {
    foreach ($model in $catalog[$name]) {
        if ($model.image) { $vision += $model.id }
    }
}
[void]$sb.AppendLine("${tab}${tab}/** Model ids whose provider config declares an `image` input modality. */")
[void]$sb.AppendLine("${tab}${tab}const VISION = new Set([")
for ($i = 0; $i -lt $vision.Count; $i += 5) {
    $chunk = $vision[$i..([Math]::Min($i + 4, $vision.Count - 1))]
    $joined = ($chunk | ForEach-Object { "`"$_`"" }) -join ', '
    [void]$sb.AppendLine("${tab}${tab}${tab}$joined,")
}
[void]$sb.AppendLine("${tab}${tab}]);")
$block = $sb.ToString().TrimEnd()

$text = [System.IO.File]::ReadAllText($ClientJs)
$startMark = '// <catalog:start>'
$endMark = '// <catalog:end>'
$startAt = $text.IndexOf($startMark)
$endAt = $text.IndexOf($endMark)
if ($startAt -lt 0 -or $endAt -lt 0) { throw "catalog markers not found in $ClientJs" }

$updated = $text.Substring(0, $startAt + $startMark.Length) +
    [Environment]::NewLine + $block + [Environment]::NewLine + "${tab}${tab}" +
    $text.Substring($endAt)

$summary = ($names | ForEach-Object { "$_=$($catalog[$_].Count)" }) -join ', '
Write-Host "providers: $summary"
Write-Host "vision-capable: $($vision.Count)"

if ($WhatIf) {
    Write-Host "(whatif) no file written"
    return
}

[System.IO.File]::WriteAllText($ClientJs, $updated, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "wrote $ClientJs"
