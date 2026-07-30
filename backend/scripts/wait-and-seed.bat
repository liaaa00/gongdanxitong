@echo off
REM 等待数据库启动并执行province seed

echo ===等待数据库启动===
:WAIT_LOOP
timeout /t 2 /nobreak >nul
netstat -an | findstr "15432.*LISTENING" >nul
if errorlevel 1 (
    echo 等待中...
    goto WAIT_LOOP
)

echo.
echo ===数据库已就绪，执行seed===
cd /d "%~dp0.."
set DB_PORT=15432
set DB_PASSWORD=Pg_HC8op7cfLnp8enSlWAaaMzH8ftXf
npx ts-node -r tsconfig-paths/register scripts/run-province-seed.ts

echo.
echo ===Seed完成===
pause
