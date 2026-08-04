$ErrorActionPreference = 'Stop'

$projectDir = (Get-Location).Path
if (-not (Test-Path (Join-Path $projectDir 'server.js'))) {
    throw 'Run this script from C:\Users\Manjula\question-bank-portal'
}

$downloads = Join-Path $env:USERPROFILE 'Downloads'
$zip = Get-ChildItem $downloads -Filter 'question-bank-portal-role-editor-v4*.zip' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $zip) {
    throw 'Download question-bank-portal-role-editor-v4.zip first.'
}

$extractDir = Join-Path $env:TEMP ('qbp-role-editor-v4-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $extractDir | Out-Null
Expand-Archive -Path $zip.FullName -DestinationPath $extractDir -Force

$sourceDir = Join-Path $extractDir 'question-bank-portal'
$sourceQuestions = Join-Path $sourceDir 'routes\questions.js'
if (-not (Test-Path $sourceQuestions)) {
    throw 'Invalid ZIP structure.'
}
if (-not (Select-String -Path $sourceQuestions -SimpleMatch '[QBP_DIFFICULTY:' -Quiet)) {
    throw 'The downloaded ZIP does not contain the legacy difficulty fix.'
}
if (-not (Select-String -Path $sourceQuestions -SimpleMatch 'delete out.difficulty' -Quiet)) {
    throw 'The downloaded ZIP may still send the missing difficulty column.'
}

Copy-Item (Join-Path $sourceDir '*') -Destination $projectDir -Recurse -Force

$installedQuestions = Join-Path $projectDir 'routes\questions.js'
$checksPassed =
    (Select-String -Path $installedQuestions -SimpleMatch '[QBP_DIFFICULTY:' -Quiet) -and
    (Select-String -Path $installedQuestions -SimpleMatch 'delete out.difficulty' -Quiet) -and
    (Test-Path (Join-Path $projectDir 'lib\user-role.js'))

if (-not $checksPassed) {
    throw 'Files could not be installed into the current project folder.'
}

Write-Host ''
Write-Host 'ROLE EDITOR V4 INSTALLED SUCCESSFULLY' -ForegroundColor Green
Write-Host 'Missing difficulty-column error fixed'
Write-Host 'Easy, Medium and Hard values remain saved'
Write-Host 'No Supabase account or schema change required'
Write-Host ''
Write-Host 'Run npm start now.' -ForegroundColor Yellow
