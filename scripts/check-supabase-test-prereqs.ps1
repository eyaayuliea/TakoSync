[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Show-Tool([string]$Name, [string]$VersionArgument = '--version') {
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) {
        Write-Host "MISSING  $Name"
        return $false
    }
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $rawVersion = @(& $command.Source $VersionArgument 2>&1)
    $version = $rawVersion | Where-Object {
        $_ -and $_.ToString() -notmatch '^(perl: warning:|\s*(LC_|LANG\s*=|are supported|Falling back|$))'
    } | Select-Object -First 1
    $ErrorActionPreference = $previousErrorAction
    Write-Host "FOUND    $Name  $($command.Source)  $version"
    return $true
}

Write-Output 'TakoSync Docker-free Supabase test prerequisites'
Write-Output 'This checker performs no network access and does not contact Supabase.'
Write-Output ''

$allFound = $true
$allFound = (Show-Tool 'node') -and $allFound
$allFound = (Show-Tool 'psql') -and $allFound
$allFound = (Show-Tool 'pg_prove') -and $allFound
$allFound = (Show-Tool 'perl') -and $allFound
$allFound = (Show-Tool 'cpan') -and $allFound

$localCli = Join-Path (Split-Path -Parent $PSScriptRoot) 'node_modules\.bin\supabase.cmd'
if (Test-Path -LiteralPath $localCli -PathType Leaf) {
    $cliPackage = Join-Path (Split-Path -Parent $PSScriptRoot) 'node_modules\supabase\package.json'
    if (Test-Path -LiteralPath $cliPackage -PathType Leaf) {
        $cliVersion = (Get-Content -Raw -LiteralPath $cliPackage | ConvertFrom-Json).version
        Write-Output "FOUND    local Supabase CLI  $cliVersion (package metadata; executable invocation may require writable CLI telemetry storage)"
    } else {
        Write-Output 'FOUND    local Supabase CLI executable (package version metadata unavailable)'
    }
} else {
    Write-Output 'MISSING  local Supabase CLI (run npm.cmd install first)'
    $allFound = $false
}

Write-Output ''
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    Write-Output 'Install psql without a server: download the official PostgreSQL Windows binary ZIP, extract its client binaries, and add its bin directory to the user PATH.'
    Write-Output 'Official source: https://www.postgresql.org/download/windows/'
}
if (-not (Get-Command pg_prove -ErrorAction SilentlyContinue)) {
    Write-Output 'Install pg_prove with Strawberry Perl plus TAP::Parser::SourceHandler::pgTAP from CPAN, or use a maintained pgTAP package that supplies pg_prove.'
    Write-Output 'pgTAP source/install guidance: https://github.com/theory/pgtap/'
    Write-Output 'pg_prove TAP handler: https://github.com/theory/tap-parser-sourcehandler-pgtap'
}

if ($allFound) {
    Write-Output 'RESULT   READY for local runner prerequisite checks.'
    exit 0
}

Write-Output 'RESULT   BLOCKED: install the missing client/test tools before database execution.'
exit 1
