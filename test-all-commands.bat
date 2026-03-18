@echo off
setlocal enabledelayedexpansion

REM Move to the CredCLI root (wherever this script lives)
cd /d "%~dp0"

REM Prevent VS Code from auto-attaching its debugger to every node invocation
set NODE_OPTIONS=

set CLI=node dist\cli.mjs

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
echo  [1/12] Checking registration  (register -i)
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

echo -------------------------------------------------------------
echo  [2/12] Current job list before test  (list)
echo -------------------------------------------------------------
%CLI% list
echo.

echo -------------------------------------------------------------
echo  [3/12] Creating sample CSV with 5 recipients
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
echo  [4/12] Creating new job using template 1  (new --template 1)
echo -------------------------------------------------------------
%CLI% new --template 1

REM Derive tenant from token.json, then find the highest-numbered job folder
for /f "tokens=*" %%i in ('powershell -NoProfile -Command ^
  "(Get-Content token.json | ConvertFrom-Json).tenant"') do set TENANT=%%i

for /f "tokens=*" %%i in ('powershell -NoProfile -Command ^
  "$d = '.data\%TENANT%\jobs'; if (Test-Path $d) { $j = Get-ChildItem -Path $d -Directory | Where-Object { $_.Name -match '^job\d+$' } | Sort-Object Name -Descending; if ($j) { $j[0].Name } }"') do set JOBID=%%i

if "%JOBID%"=="" (
    echo.
    echo  ERROR: Could not find the new job folder under .data\%TENANT%\jobs\
    echo         Check the output above for errors from "credcli new".
    exit /b 1
)
echo.
echo   Tenant:     %TENANT%
echo   Job folder: %CD%\.data\%TENANT%\jobs\%JOBID%
echo.

echo -------------------------------------------------------------
echo  [5/12] Loading recipient CSV into %JOBID%  (csv)
echo -------------------------------------------------------------
%CLI% csv %JOBID% %CSV_FILE%
echo.

echo -------------------------------------------------------------
echo  [6/12] Job list after CSV upload  (list)
echo -------------------------------------------------------------
%CLI% list
echo.

echo -------------------------------------------------------------
echo  [7/12] Rendering 5 credentials as PNG  (run --format png)
echo -------------------------------------------------------------
echo   This launches a headless Chromium browser - may take ~30 seconds.
echo.
%CLI% run %JOBID% --format png
echo.

echo -------------------------------------------------------------
echo  [8/12] Listing output files with full paths  (output)
echo -------------------------------------------------------------
%CLI% output %JOBID%
echo.

echo -------------------------------------------------------------
echo  [9/12] Assigning a new Chainletter collection  (assign)
echo -------------------------------------------------------------
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-Date -Format 'test-yyyyMMdd-HHmmss'"') do set COLLECTION_ID=%%i
echo   Collection ID: %COLLECTION_ID%
echo.
%CLI% assign %JOBID% %COLLECTION_ID%
echo.

echo -------------------------------------------------------------
echo  [10/12] Uploading output files to Chainletter  (send)
echo -------------------------------------------------------------
%CLI% send %JOBID%
echo.

echo -------------------------------------------------------------
echo  [11/12] Blockchain-stamping the collection  (stamp)
echo -------------------------------------------------------------
%CLI% stamp %JOBID%
echo.

echo -------------------------------------------------------------
echo  [12/12] Generating .eml emails for stamped credentials  (email)
echo -------------------------------------------------------------
%CLI% email %JOBID%
echo.

echo -------------------------------------------------------------
echo  Final job list
echo -------------------------------------------------------------
%CLI% list
echo.

echo =============================================================
echo   All tests complete.
echo =============================================================
echo.
echo   Job:         %JOBID%
echo   Collection:  %COLLECTION_ID%
echo   CSV file:    %CD%\%CSV_FILE%
echo   Output:      %CD%\.data\%TENANT%\jobs\%JOBID%\output\
echo.
echo   The test CSV (%CSV_FILE%) has been left in place for reference.
echo   Delete it when done: del %CSV_FILE%
echo.

endlocal
