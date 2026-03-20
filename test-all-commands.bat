@echo off
setlocal enabledelayedexpansion

REM Move to the CredCLI root (wherever this script lives)
cd /d "%~dp0"

REM Prevent VS Code from auto-attaching its debugger to every node invocation
set NODE_OPTIONS=

set CLI=node dist\cli.mjs

REM Parse flags
set DELETE_JOB=0
for %%a in (%*) do (
    if /i "%%a"=="-d" set DELETE_JOB=1
)

echo.
echo =============================================================
echo   CredCLI - Full Command Test Suite
echo   Tests all commands, generates 5 credentials, sends to
echo   a new Chainletter collection, blockchain-stamps it, and
echo   generates .eml email files for each recipient.
echo =============================================================
echo.

REM Pre-flight: make sure we can find the built CLI
if not exist dist\cli.mjs (
    echo  ERROR: dist\cli.mjs not found.
    echo         Run "npm run build" from the CredCLI root, then try again.
    echo.
    exit /b 1
)

echo -------------------------------------------------------------
echo  Building CLI from source
echo -------------------------------------------------------------
call npm run build
if errorlevel 1 (
    echo  ERROR: Build failed. Fix the errors above and try again.
    exit /b 1
)
echo.

echo -------------------------------------------------------------
echo  [1/20] Checking registration  (register -i)
echo -------------------------------------------------------------
if not exist token.json (
    echo.
    echo  No token.json found in this directory.
    echo  You must register before running the test:
    echo.
    echo     credcli register ^<your-chainletter-url^>
    echo.
    echo  Get your token URL from: https://chainletter.io
    echo.
    exit /b 1
)

%CLI% register -i
echo.

REM ── Derive tenant early so we can back up workspace.json before touching it ──
for /f "tokens=*" %%i in ('powershell -NoProfile -Command ^
  "(Get-Content token.json | ConvertFrom-Json).tenant"') do set TENANT=%%i

if "%TENANT%"=="" (
    echo  ERROR: Could not read tenant from token.json.
    exit /b 1
)

set WORKSPACE_JSON=.data\%TENANT%\workspace.json
set WORKSPACE_BAK=.data\%TENANT%\workspace.json.testbak

REM Back up workspace.json so we can restore it unconditionally at the end
if exist "%WORKSPACE_JSON%" (
    copy /y "%WORKSPACE_JSON%" "%WORKSPACE_BAK%" >nul
    echo   Workspace settings backed up.
) else (
    echo   No existing workspace.json — will remove test settings on exit.
)
echo.

echo -------------------------------------------------------------
echo  [2/20] Showing current workspace settings  (workspace)
echo -------------------------------------------------------------
%CLI% workspace
echo.

echo -------------------------------------------------------------
echo  [3/20] Setting workspace issuer name  (workspace --issuer)
echo -------------------------------------------------------------
%CLI% workspace --issuer "CredCLI Test Issuer"
echo.

echo -------------------------------------------------------------
echo  [4/20] Creating a test SVG logo and registering it  (workspace --logo)
echo -------------------------------------------------------------
set LOGO_FILE=test_logo.svg
(
echo ^<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"^>
echo   ^<rect width="200" height="80" rx="8" fill="#4F46E5"/^>
echo   ^<text x="100" y="50" text-anchor="middle" fill="white" font-size="32" font-family="sans-serif" font-weight="bold"^>CredCLI^</text^>
echo ^</svg^>
) > %LOGO_FILE%
echo   Created: %CD%\%LOGO_FILE%
echo.
%CLI% workspace --logo %LOGO_FILE%
echo.

echo -------------------------------------------------------------
echo  [5/20] Confirming workspace settings  (workspace)
echo -------------------------------------------------------------
%CLI% workspace
echo.

echo -------------------------------------------------------------
echo  [6/20] Listing available templates  (templates)
echo -------------------------------------------------------------
%CLI% templates
echo.

echo -------------------------------------------------------------
echo  [7/20] Current job list before test  (list)
echo -------------------------------------------------------------
%CLI% list
echo.

echo -------------------------------------------------------------
echo  [8/20] Creating sample CSV with 5 recipients
echo -------------------------------------------------------------
set CSV_FILE=test_sample_data.csv

(
echo FullName,CourseName,Institution,Issuer,IssueDate,CredentialID,BadgeLevel,Achievement,Notes,QRUrl,VerificationURL
echo Alice Johnson,Python Fundamentals,Tech Academy,CredCLI Test Batch,2026-03-18,CRED-TEST-001,Gold,Successfully completed all Python modules with distinction,Test run recipient 1,,https://chainletter.io/verify/CRED-TEST-001
echo Bob Martinez,Data Science Basics,Tech Academy,CredCLI Test Batch,2026-03-18,CRED-TEST-002,Silver,Completed the full data science curriculum,Test run recipient 2,,https://chainletter.io/verify/CRED-TEST-002
echo Clara Chen,Machine Learning,Tech Academy,CredCLI Test Batch,2026-03-18,CRED-TEST-003,Gold,Excelled in all machine learning coursework,Test run recipient 3,,https://chainletter.io/verify/CRED-TEST-003
echo David Kim,Web Development,Tech Academy,CredCLI Test Batch,2026-03-18,CRED-TEST-004,Bronze,Completed the full web development track,Test run recipient 4,,https://chainletter.io/verify/CRED-TEST-004
echo Eva Rossi,Cloud Computing,Tech Academy,CredCLI Test Batch,2026-03-18,CRED-TEST-005,Silver,Successfully completed cloud fundamentals,Test run recipient 5,,https://chainletter.io/verify/CRED-TEST-005
) > %CSV_FILE%

echo   File:  %CD%\%CSV_FILE%
echo   Rows:  5 recipients
echo.

echo -------------------------------------------------------------
echo  [9/20] Creating new job using template 1  (new --template 1)
echo -------------------------------------------------------------
%CLI% new --template 1

for /f "tokens=*" %%i in ('powershell -NoProfile -Command ^
  "$d = '.data\%TENANT%\jobs'; if (Test-Path $d) { $j = Get-ChildItem -Path $d -Directory | Where-Object { $_.Name -match '^job\d+$' } | Sort-Object Name -Descending; if ($j) { $j[0].Name } }"') do set JOBID=%%i

if "%JOBID%"=="" (
    echo.
    echo  ERROR: Could not find the new job folder under .data\%TENANT%\jobs\
    echo         Check the output above for errors from "credcli new".
    goto :restore
)
echo.
echo   Tenant:     %TENANT%
echo   Job folder: %CD%\.data\%TENANT%\jobs\%JOBID%
echo.

echo -------------------------------------------------------------
echo  [10/20] Loading recipient CSV into %JOBID%  (csv)
echo -------------------------------------------------------------
%CLI% csv %JOBID% %CSV_FILE%
echo.

echo -------------------------------------------------------------
echo  [11/20] Job list after CSV upload  (list)
echo -------------------------------------------------------------
%CLI% list
echo.

echo -------------------------------------------------------------
echo  [12/20] Rendering 5 credentials as PNG  (run --format png)
echo -------------------------------------------------------------
echo   This launches a headless Chromium browser - may take ~30 seconds.
echo.
%CLI% run %JOBID% --format png
echo.

echo -------------------------------------------------------------
echo  [13/20] Previewing row 1 of the job  (preview --format png)
echo -------------------------------------------------------------
%CLI% preview %JOBID% --row 1 --format png
echo.

echo -------------------------------------------------------------
echo  [14/20] Listing output files with full paths  (output)
echo -------------------------------------------------------------
%CLI% output %JOBID%
echo.

echo -------------------------------------------------------------
echo  [15/20] Assigning a new Chainletter collection  (assign)
echo -------------------------------------------------------------
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-Date -Format 'test-yyyyMMdd-HHmmss'"') do set COLLECTION_ID=%%i
echo   Collection ID: %COLLECTION_ID%
echo.
%CLI% assign %JOBID% %COLLECTION_ID% --network public
echo.

echo -------------------------------------------------------------
echo  [16/20] Uploading output files to Chainletter  (send)
echo -------------------------------------------------------------
%CLI% send %JOBID% -y
echo.

echo -------------------------------------------------------------
echo  [17/20] Blockchain-stamping the collection  (stamp)
echo -------------------------------------------------------------
%CLI% stamp %JOBID%
echo.

echo -------------------------------------------------------------
echo  [18/20] Generating .eml emails for stamped credentials  (email)
echo -------------------------------------------------------------
%CLI% email %JOBID% -y
echo.

REM Check that email artifacts were actually created
set EMAIL_DIR=.data\%TENANT%\jobs\%JOBID%\output\mail_merge
if exist "%EMAIL_DIR%\*.eml" (
    echo   Email artifacts created:
    for %%f in ("%EMAIL_DIR%\*.eml") do echo     %%f
    if exist "%EMAIL_DIR%\all_recipients.mbox" echo     %EMAIL_DIR%\all_recipients.mbox
    if exist "%EMAIL_DIR%\mail_merge_manifest.csv" echo     %EMAIL_DIR%\mail_merge_manifest.csv
) else (
    echo   WARNING: No .eml files found in %EMAIL_DIR%
    echo   The email command may have failed -- check output above.
    echo   Make sure an email template exists in your workspace templates folder.
)
echo.

echo -------------------------------------------------------------
echo  [19/20] Final job list
echo -------------------------------------------------------------
%CLI% list
echo.

echo -------------------------------------------------------------
echo  [20/20] Deleting test job  (delete --yes)
echo -------------------------------------------------------------
if "%DELETE_JOB%"=="1" (
    %CLI% delete %JOBID% --yes
) else (
    echo   Skipped. Run with -d to delete the test job.
    echo   Job ID: %JOBID%
)
echo.

echo =============================================================
echo   All tests complete.
echo =============================================================
echo.
echo   Collection:  %COLLECTION_ID%
echo   CSV file:    %CD%\%CSV_FILE%
echo   Email files: %CD%\.data\%TENANT%\jobs\%JOBID%\output\mail_merge\
echo.
echo   The test CSV (%CSV_FILE%) has been left in place for reference.
echo   Delete it when done: del %CSV_FILE%
echo.

:restore
echo -------------------------------------------------------------
echo  Restoring original workspace settings
echo -------------------------------------------------------------
if exist "%WORKSPACE_BAK%" (
    copy /y "%WORKSPACE_BAK%" "%WORKSPACE_JSON%" >nul
    del "%WORKSPACE_BAK%"
    echo   Restored workspace.json from backup.
) else if exist "%WORKSPACE_JSON%" (
    del "%WORKSPACE_JSON%"
    echo   No original workspace.json existed — removed test settings.
)
if exist "%LOGO_FILE%" del "%LOGO_FILE%"
echo.

endlocal
