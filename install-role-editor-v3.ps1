$ErrorActionPreference = 'Stop'

$projectDir = (Get-Location).Path
if (-not (Test-Path (Join-Path $projectDir 'server.js'))) {
    throw 'Run this script from C:\Users\Manjula\question-bank-portal'
}

$downloads = Join-Path $env:USERPROFILE 'Downloads'
$zip = Get-ChildItem $downloads -Filter 'question-bank-portal-role-editor-v3*.zip' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $zip) {
    throw 'Download question-bank-portal-role-editor-v3.zip first.'
}

$extractDir = Join-Path $env:TEMP ('qbp-role-editor-v3-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $extractDir | Out-Null
Expand-Archive -Path $zip.FullName -DestinationPath $extractDir -Force

$sourceDir = Join-Path $extractDir 'question-bank-portal'
$sourceIndex = Join-Path $sourceDir 'public\index.html'
$sourceBulkImport = Join-Path $sourceDir 'public\bulk-import.js'
if (-not (Test-Path $sourceIndex) -or -not (Test-Path $sourceBulkImport)) {
    throw 'Invalid ZIP structure.'
}
if (-not (Select-String -Path $sourceIndex -SimpleMatch '<option value="editor">Question Editor</option>' -Quiet)) {
    throw 'Editor role is missing from the downloaded ZIP.'
}
if (Select-String -Path $sourceBulkImport -SimpleMatch 'author: q' -Quiet) {
    throw 'This ZIP still contains the old author import field.'
}
if (-not (Select-String -Path $sourceBulkImport -SimpleMatch 'difficulty: q.difficulty' -Quiet)) {
    throw 'Difficulty import support is missing from the downloaded ZIP.'
}

Copy-Item (Join-Path $sourceDir '*') -Destination $projectDir -Recurse -Force

$installedIndex = Join-Path $projectDir 'public\index.html'
$installedBulkImport = Join-Path $projectDir 'public\bulk-import.js'
$checksPassed =
    (Select-String -Path $installedIndex -SimpleMatch '<option value="editor">Question Editor</option>' -Quiet) -and
    (Select-String -Path $installedIndex -SimpleMatch 'id="difficulty"' -Quiet) -and
    (-not (Select-String -Path $installedBulkImport -SimpleMatch 'author: q' -Quiet)) -and
    (Select-String -Path $installedBulkImport -SimpleMatch 'difficulty: q.difficulty' -Quiet) -and
    (Test-Path (Join-Path $projectDir 'lib\user-role.js'))

if (-not $checksPassed) {
    throw 'Files could not be installed into the current project folder.'
}

Write-Host ''
Write-Host 'ROLE EDITOR V3 INSTALLED SUCCESSFULLY' -ForegroundColor Green
Write-Host 'Bulk import author-column error fixed'
Write-Host 'Difficulty import retained'
Write-Host 'Question Adder: add and bulk import'
Write-Host 'Question Editor: edit and change difficulty'
Write-Host 'Admin: full access'
Write-Host 'No Supabase account required'
Write-Host ''
Write-Host 'Run npm start now.' -ForegroundColor Yellow
