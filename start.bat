@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "FRONTEND_DIR=%ROOT%frontend"
set "BACKEND_PORT=8000"
set "FRONTEND_PORT=3000"
set "PYTHON_EXE=%BACKEND_DIR%\venv\Scripts\python.exe"

for %%I in ("%ROOT%..") do set "WORKSPACE_ROOT=%%~fI"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=%WORKSPACE_ROOT%\.venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=python"

title PlantGuard AI Launcher
cd /d "%ROOT%"

if /i "%~1"=="stop" goto :shutdown_only

echo.
echo ============================
echo   PlantGuard AI Launcher
echo ============================
echo Root: %ROOT%
echo.

if /i "%PYTHON_EXE%"=="python" (
  where python >nul 2>&1
  if errorlevel 1 (
    echo Python was not found. Install Python or create backend\venv or .venv.
    pause
    exit /b 1
  )
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo npm.cmd was not found. Install Node.js and try again.
  pause
  exit /b 1
)

echo [1/5] Stopping anything already using ports %BACKEND_PORT% and %FRONTEND_PORT%...
call :kill_port %BACKEND_PORT%
call :kill_port %FRONTEND_PORT%

echo [2/5] Starting backend in this terminal...
pushd "%BACKEND_DIR%"
start "PlantGuard Backend" /b "%PYTHON_EXE%" -m uvicorn main:app --host 0.0.0.0 --port %BACKEND_PORT%
popd

echo [3/5] Waiting for backend on http://localhost:%BACKEND_PORT% ...
call :wait_for_port %BACKEND_PORT% 120
if errorlevel 1 (
  echo Backend did not become ready in time.
  goto :shutdown
)

echo [4/5] Starting frontend in this terminal...
pushd "%FRONTEND_DIR%"
start "PlantGuard Frontend" /b npm.cmd run dev
popd

echo [5/5] Waiting for frontend on http://localhost:%FRONTEND_PORT% ...
call :wait_for_port %FRONTEND_PORT% 180
if errorlevel 1 (
  echo Frontend did not become ready in time.
  goto :shutdown
)

echo.
echo ============================
echo   PlantGuard AI Is Ready
echo ============================
echo Frontend: http://localhost:%FRONTEND_PORT%
echo Backend : http://localhost:%BACKEND_PORT%
echo.
start "" "http://localhost:%FRONTEND_PORT%"
echo Press Q to stop both servers and exit.
echo Closing this terminal also stops backend and frontend.
echo.

:monitor_loop
call :is_port_listening %BACKEND_PORT%
if errorlevel 1 (
  echo Backend stopped.
  goto :shutdown
)

call :is_port_listening %FRONTEND_PORT%
if errorlevel 1 (
  echo Frontend stopped.
  goto :shutdown
)

choice /c QS /n /t 2 /d S >nul
if errorlevel 2 goto :monitor_loop

:shutdown
echo.
echo Stopping backend and frontend...
call :kill_port %FRONTEND_PORT%
call :kill_port %BACKEND_PORT%
echo Done.
exit /b 0

:shutdown_only
echo Stopping backend and frontend...
call :kill_port %FRONTEND_PORT%
call :kill_port %BACKEND_PORT%
echo Done.
exit /b 0

:wait_for_port
set "WAIT_PORT=%~1"
set "WAIT_MAX=%~2"
for /l %%i in (1,1,%WAIT_MAX%) do (
  call :is_port_listening %WAIT_PORT%
  if not errorlevel 1 exit /b 0
  timeout /t 1 /nobreak >nul
)
exit /b 1

:is_port_listening
netstat -ano -p tcp | findstr /c:":%~1 " | findstr /c:"LISTENING" >nul
if errorlevel 1 exit /b 1
exit /b 0

:kill_port
for /f "tokens=5" %%a in ('netstat -ano -p tcp ^| findstr /c:":%~1 " ^| findstr /c:"LISTENING"') do (
  if not "%%a"=="0" if not "%%a"=="4" taskkill /f /t /pid %%a >nul 2>&1
)
exit /b 0
