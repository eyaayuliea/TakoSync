[CmdletBinding()]
param(
    [string[]]$TestFile = @('202611130006_three_branch_rls_and_session_integration.test.sql'),
    [switch]$AllTests,
    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$testsRoot = Join-Path $repoRoot 'backend\supabase\tests'

if ($AllTests -and $PSBoundParameters.ContainsKey('TestFile')) {
    Write-Error 'SAFE STOP: Use either -AllTests or -TestFile, not both.'
    exit 2
}

function Stop-Safely([string]$Message) {
    Write-Error "SAFE STOP: $Message"
    exit 2
}

function Require-EnvironmentVariable([string]$Name) {
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        Stop-Safely "Required environment variable '$Name' is missing."
    }
    return $value
}

function Resolve-TestFiles {
    if ($AllTests) {
        return @(Get-ChildItem -LiteralPath $testsRoot -Filter '*.test.sql' -File | Sort-Object Name)
    }

    $resolved = @()
    foreach ($requested in $TestFile) {
        if ([IO.Path]::IsPathRooted($requested) -or $requested -ne [IO.Path]::GetFileName($requested)) {
            Stop-Safely "Test file must be a filename inside backend/supabase/tests: $requested"
        }
        if ([IO.Path]::GetExtension($requested) -ne '.sql' -or $requested -notlike '*.test.sql') {
            Stop-Safely "Only .test.sql files are allowed: $requested"
        }
        $path = Join-Path $testsRoot $requested
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            Stop-Safely "Approved test file does not exist: $requested"
        }
        $resolved += Get-Item -LiteralPath $path
    }
    return $resolved
}

$selectedFiles = @(Resolve-TestFiles)
Write-Host "Selected SQL tests: $($selectedFiles.Count)"
$selectedFiles | ForEach-Object { Write-Host "  - $($_.Name)" }

if ($ValidateOnly) {
    Write-Host 'Validation-only mode: no environment, PostgreSQL client, or remote database was accessed.'
    exit 0
}

$projectName = Require-EnvironmentVariable 'SUPABASE_DEV_PROJECT_NAME'
$projectRef = Require-EnvironmentVariable 'SUPABASE_DEV_PROJECT_REF'
$projectUrl = Require-EnvironmentVariable 'SUPABASE_DEV_PROJECT_URL'
$pgHost = Require-EnvironmentVariable 'PGHOST'
$null = Require-EnvironmentVariable 'PGPORT'
$null = Require-EnvironmentVariable 'PGDATABASE'
$null = Require-EnvironmentVariable 'PGUSER'
$password = [Environment]::GetEnvironmentVariable('PGPASSWORD')
$passFile = [Environment]::GetEnvironmentVariable('PGPASSFILE')
if ([string]::IsNullOrWhiteSpace($password) -and [string]::IsNullOrWhiteSpace($passFile)) {
    Stop-Safely "Set PGPASSWORD for the current process or configure a private PGPASSFILE; neither value is printed."
}
if (-not [string]::IsNullOrWhiteSpace($passFile) -and -not (Test-Path -LiteralPath $passFile -PathType Leaf)) {
    Stop-Safely 'PGPASSFILE does not point to an existing private file.'
}

if ($projectName -ne 'TakoSync-Development') {
    Stop-Safely "SUPABASE_DEV_PROJECT_NAME must be exactly 'TakoSync-Development'."
}

try {
    $uri = [Uri]$projectUrl
} catch {
    Stop-Safely 'SUPABASE_DEV_PROJECT_URL is not a valid URL.'
}

if ($uri.Scheme -ne 'https' -or $uri.Host -notlike "$projectRef.*.supabase.co") {
    Stop-Safely 'SUPABASE_DEV_PROJECT_URL does not match SUPABASE_DEV_PROJECT_REF.'
}

$hostParts = $uri.Host.Split('.')
if ($hostParts[0] -ne $projectRef) {
    Stop-Safely 'The project reference does not match the first hostname component of the project URL.'
}

if ($projectRef -notmatch '^[a-z0-9]{10,30}$') {
    Stop-Safely 'SUPABASE_DEV_PROJECT_REF has an unexpected format.'
}

$psql = Get-Command psql -ErrorAction SilentlyContinue
$pgProve = Get-Command pg_prove -ErrorAction SilentlyContinue
if (-not $psql) {
    Stop-Safely 'psql is not installed or not on PATH.'
}
if (-not $pgProve) {
    Stop-Safely 'pg_prove is not installed or not on PATH.'
}

$env:PGSSLMODE = 'require'
Write-Host "Approved target: $projectName ($projectRef)"
Write-Host "Database host: $pgHost"
Write-Host 'SSL mode: require'

$probeSql = @'
select json_build_object(
  'database', current_database(),
  'user', current_user,
  'pgtap', exists (select 1 from pg_extension where extname = 'pgtap'),
  'auth_users', to_regclass('auth.users') is not null,
  'auth_sessions', to_regclass('auth.sessions') is not null,
  'authenticated_role', exists (select 1 from pg_roles where rolname = 'authenticated')
);
'@

$previousErrorAction = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$probeOutput = & $psql.Source --no-password --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --command $probeSql 2>&1
$ErrorActionPreference = $previousErrorAction
if ($LASTEXITCODE -ne 0) {
    Stop-Safely "PostgreSQL connectivity or schema probe failed: $probeOutput"
}

$probeText = ($probeOutput -join "`n").Trim()
try {
    $probe = $probeText | ConvertFrom-Json
} catch {
    Stop-Safely 'The PostgreSQL probe returned an unexpected response.'
}

if (-not $probe.pgtap) {
    Stop-Safely 'The target database does not have the pgtap extension installed.'
}
if (-not $probe.auth_users -or -not $probe.auth_sessions -or -not $probe.authenticated_role) {
    Stop-Safely 'Required Supabase Auth schemas or authenticated role are missing.'
}

Write-Host "Connectivity: OK (database=$($probe.database), user=$($probe.user))"
Write-Host 'pgTAP/Auth prerequisites: OK'
Write-Host 'No migrations, resets, seed loads, truncations, or destructive commands are performed by this script.'

$pgProveArgs = @('--failures', '--verbose') + @($selectedFiles | ForEach-Object { $_.FullName })
$previousErrorAction = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$output = & $pgProve.Source @pgProveArgs 2>&1
$ErrorActionPreference = $previousErrorAction
$exitCode = $LASTEXITCODE
$output | ForEach-Object { Write-Host $_ }

$passed = @($output | Where-Object { $_ -match '^ok\s+\d+' }).Count
$failed = @($output | Where-Object { $_ -match '^not ok\s+\d+' }).Count
Write-Host "Assertion lines reported: passed=$passed failed=$failed"

if ($exitCode -ne 0 -or $failed -gt 0) {
    exit 1
}
exit 0
