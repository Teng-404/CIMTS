@echo off
title CampusCare - Demo Data
setlocal

rem ====================================================================
rem  Add or reset the demo data.
rem  Useful before a demo or presentation.
rem  ASCII only - Thai text breaks the Windows batch parser.
rem ====================================================================

cd /d "%~dp0backend"
if not exist "venv\Scripts\activate.bat" goto not_installed
call "venv\Scripts\activate.bat"

:menu
echo.
echo ===============================================
echo   Demo data
echo ===============================================
echo.
echo   [1] Add demo data, keep existing incidents
echo   [2] Delete ALL incidents, then recreate demo data
echo   [3] Cancel
echo.
set "choice="
set /p choice="Choose 1, 2 or 3: "

if "%choice%"=="1" goto seed
if "%choice%"=="2" goto fresh
if "%choice%"=="3" goto end
echo Invalid choice.
goto menu

:seed
echo.
python manage.py seed_data
goto done

:fresh
echo.
echo *** WARNING: every incident will be deleted, including real ones ***
set "confirm="
set /p confirm="Type YES to confirm: "
if /i not "%confirm%"=="YES" goto end
echo.
python manage.py seed_data --fresh
goto done

:done
echo.
echo Finished.
echo.
echo   Test accounts
echo     admin    / admin1234
echo     o1 - o8  / Passw0rd!
echo     student  / Passw0rd!
echo.
goto end

:not_installed
echo.
echo ERROR: the project is not set up yet.
echo Run start-cimts.bat first.
echo.

:end
pause
