@echo off
title CampusCare - CIMTS Server
setlocal

rem ====================================================================
rem  CampusCare / CIMTS - one click launcher
rem  Put this file in CIMTS-Project, next to the backend folder.
rem  Double click to start. Press Ctrl+C in this window to stop.
rem
rem  NOTE: this file is ASCII only on purpose.
rem  Thai text breaks the Windows batch parser.
rem ====================================================================

cd /d "%~dp0backend"
if errorlevel 1 goto no_backend
if not exist "manage.py" goto no_backend

echo.
echo ===============================================
echo   CampusCare Incident Center
echo ===============================================
echo.

rem ---------- 1. check python ----------
python --version >nul 2>&1
if errorlevel 1 goto no_python

rem ---------- 2. create venv on first run ----------
if exist "venv\Scripts\activate.bat" goto venv_ready

echo [1/5] Creating virtual environment, please wait...
python -m venv venv
if errorlevel 1 goto venv_failed
call "venv\Scripts\activate.bat"
echo [1/5] Installing packages...
python -m pip install --upgrade pip >nul
pip install -r requirements.txt
if errorlevel 1 goto pip_failed
goto env_check

:venv_ready
echo [1/5] Activating virtual environment
call "venv\Scripts\activate.bat"

rem ---------- 3. check .env ----------
:env_check
if exist ".env" goto env_ok
if not exist ".env.example" goto no_env

copy ".env.example" ".env" >nul
echo [2/5] Created .env from .env.example
echo.
echo   *** Open backend\.env and set POSTGRES_PASSWORD
echo   *** to match your database password, then run this file again.
echo.
pause
exit /b 1

:env_ok
echo [2/5] Config file .env found

rem ---------- 4. start PostgreSQL service if stopped ----------
echo [3/5] Checking PostgreSQL...
set "PGSVC="
for /f "tokens=2" %%S in ('sc query type^= service state^= all ^| findstr /i "SERVICE_NAME.*postgresql"') do set "PGSVC=%%S"

if not defined PGSVC goto no_service
sc query "%PGSVC%" | findstr /i "RUNNING" >nul
if not errorlevel 1 goto pg_running

echo       Service %PGSVC% is stopped. Trying to start it...
net start "%PGSVC%" >nul 2>&1
if errorlevel 1 goto pg_start_failed
echo       PostgreSQL started
goto migrate

:pg_start_failed
echo.
echo       WARNING: could not start the service - needs admin rights.
echo       Right click this file and choose "Run as administrator",
echo       or start PostgreSQL manually, then continue.
echo.
pause
goto migrate

:pg_running
echo       PostgreSQL is already running
goto migrate

:no_service
echo       No PostgreSQL service found - skipping this check

rem ---------- 5. apply migrations ----------
:migrate
echo [4/5] Checking database...
python manage.py migrate --noinput
if errorlevel 1 goto db_failed

rem ---------- 6. run server and open browser ----------
echo [5/5] Starting server...
echo.
echo ===============================================
echo   Open:  http://127.0.0.1:8000/login/login.html
echo.
echo   Test accounts
echo     admin    / admin1234    - coordinator
echo     o1       / Passw0rd!    - field officer
echo     student  / Passw0rd!    - reporter
echo.
echo   Stop the server: press Ctrl+C in this window
echo ===============================================
echo.

start "" cmd /c "timeout /t 4 /nobreak >nul && start http://127.0.0.1:8000/login/login.html"

python manage.py runserver

echo.
echo Server stopped.
pause
exit /b 0

rem ==================== error messages ====================

:no_backend
echo.
echo ERROR: backend folder not found.
echo This file must sit in CIMTS-Project, next to the backend folder.
echo Current location: %~dp0
echo.
pause
exit /b 1

:no_python
echo.
echo ERROR: Python not found.
echo Install from https://www.python.org/downloads/
echo During setup, tick "Add Python to PATH".
echo.
pause
exit /b 1

:venv_failed
echo.
echo ERROR: could not create the virtual environment.
echo.
pause
exit /b 1

:pip_failed
echo.
echo ERROR: could not install packages from requirements.txt
echo.
pause
exit /b 1

:no_env
echo.
echo ERROR: neither .env nor .env.example was found in backend.
echo.
pause
exit /b 1

:db_failed
echo.
echo ERROR: cannot connect to the database.
echo.
echo   Check that
echo     - PostgreSQL is running
echo     - POSTGRES_PASSWORD in backend\.env is correct
echo     - the database exists. In SQL Shell run:
echo         CREATE USER cimts WITH PASSWORD 'cimts123';
echo         CREATE DATABASE cimts OWNER cimts;
echo.
pause
exit /b 1
