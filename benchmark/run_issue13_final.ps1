[CmdletBinding()]
param(
    [switch]$SkipIndexer,
    [switch]$SkipBrowser,
    [string]$AnalysisPath,
    [ValidatePattern("^[A-Za-z0-9][A-Za-z0-9_-]*$")]
    [string]$RunLabel
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repo ".venv\Scripts\python.exe"
$results = Join-Path $repo "benchmark\results"
$suffix = if ($RunLabel) { "-$RunLabel" } else { "" }
$work = Join-Path $repo "benchmark-work\issue13-final$suffix"

Set-Location $repo

if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw "Missing virtual environment Python: $python"
}

$nodeVersion = (& node --version).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -ne "v26.4.0") {
    throw "Issue 13 browser comparison requires Node v26.4.0; found '$nodeVersion'."
}

& $python "benchmark\prepare_datasets.py" "--no-uncompressed-check"
if ($LASTEXITCODE -ne 0) {
    throw "Dataset validation failed."
}

$finalIndexer = Join-Path $results "indexer-final$suffix.json"
if (-not $SkipIndexer) {
    & $python "benchmark\profile_indexer.py" `
        "--datasets" "small" "medium" "large" `
        "--benchmark-phase" "final" `
        "--work-dir" $work `
        "--output" $finalIndexer
    if ($LASTEXITCODE -ne 0) {
        throw "Final indexer benchmark failed. Completed datasets remain in $finalIndexer."
    }
}
elseif (-not (Test-Path -LiteralPath $finalIndexer -PathType Leaf)) {
    throw "-SkipIndexer requires $finalIndexer"
}

$databases = @{
    small = Join-Path $work "small\MGYG000490722.db.zip"
    medium = Join-Path $work "medium\GCF_000001215.4.db.zip"
    large = Join-Path $work "large\GENCODE-v49-GRCh38.db.zip"
}

$finalBrowsers = @{}
foreach ($role in @("small", "medium", "large")) {
    $finalBrowsers[$role] = Join-Path $results "browser-$role-final$suffix.json"
}

if (-not $SkipBrowser) {
    Set-Location (Join-Path $repo "ui-component")
    $env:BENCHMARK_PHASE = "final"
    $env:BENCHMARK_COLD_RUNS = "3"
    $env:BENCHMARK_WARM_RUNS = "10"
    foreach ($role in @("small", "medium", "large")) {
        if (-not (Test-Path -LiteralPath $databases[$role] -PathType Leaf)) {
            throw "Missing final database for $role`: $($databases[$role])"
        }
        $env:BENCHMARK_BROWSER_DATASET = $role
        $env:BENCHMARK_DATABASE_PATH = $databases[$role]
        $env:BENCHMARK_BROWSER_OUTPUT = $finalBrowsers[$role]
        & npm.cmd run benchmark:browser
        if ($LASTEXITCODE -ne 0) {
            throw "Final browser benchmark failed for $role."
        }
    }
}
else {
    foreach ($role in @("small", "medium", "large")) {
        if (-not (Test-Path -LiteralPath $finalBrowsers[$role] -PathType Leaf)) {
            throw "-SkipBrowser requires $($finalBrowsers[$role])"
        }
    }
}

Set-Location $repo
$compareArguments = @(
    "benchmark\compare_results.py",
    "--baseline-indexer", "benchmark\results\indexer-baseline.json",
    "--final-indexer", "benchmark\results\indexer-final$suffix.json",
    "--baseline-browser", "benchmark\results\browser-small.json",
    "--baseline-browser", "benchmark\results\browser-medium.json",
    "--baseline-browser", "benchmark\results\browser-large.json",
    "--final-browser", "benchmark\results\browser-small-final$suffix.json",
    "--final-browser", "benchmark\results\browser-medium-final$suffix.json",
    "--final-browser", "benchmark\results\browser-large-final$suffix.json",
    "--output", "benchmark\final-report$suffix.md"
)
if ($AnalysisPath) {
    $compareArguments += @("--analysis", $AnalysisPath)
}
& $python @compareArguments
$comparisonExit = $LASTEXITCODE
if ($comparisonExit -eq 1) {
    Write-Warning "The report was written, but regressions above 20% need explanations."
}
elseif ($comparisonExit -ne 0) {
    throw "Benchmark comparison failed with exit code $comparisonExit."
}

Write-Host "Issue 13 benchmark run finished. Report: benchmark\final-report$suffix.md"
exit $comparisonExit
