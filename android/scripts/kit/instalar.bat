@echo off
setlocal enabledelayedexpansion
title BalancaGFIG - instalar no box
pushd "%~dp0"

rem ---------------------------------------------------------------------------
rem  Instala o aplicativo no box, da rede do proprio box.
rem  Tudo o que precisa (adb e o APK) esta nesta pasta: nao instala nada no PC.
rem  O IP padrao e 192.168.43.1, o do WiFi do box. Outro IP pode ser passado:
rem      instalar.bat 192.168.1.17
rem  ASCII de proposito: acento em .bat quebra no cmd.
rem
rem  Tres cuidados com o cmd que explicam o jeito do script:
rem   - pushd no inicio: assim "adb.exe" e o APK sao achados na propria pasta,
rem     mesmo se ela tiver espaco no nome ou estiver em rede;
rem   - dentro de "for /f" o caminho do adb vai SEM aspas (e %ADB% em vez de
rem     "%ADB%"): com o APK tambem entre aspas, o cmd se perde ao montar a
rem     linha. O cd do pushd garante que ele ache o adb.exe assim;
rem   - o nome do APK sai de um "dir /b", e nao de "for %%f in (curinga)",
rem     que nao devolve nada em todo cmd.
rem ---------------------------------------------------------------------------

set "BOX=%~1"
if "%BOX%"=="" set "BOX=192.168.43.1"
set "PACOTE=br.edu.ifsc.balancagfig"
set "ADB=adb.exe"
set "APK="
rem O "dir /b" (em vez de "for %%f in (curinga)") e o que devolve o nome
rem do APK de forma confiavel em qualquer cmd.
for /f "delims=" %%f in ('dir /b /a-d "balancagfig-*.apk" 2^>nul') do set "APK=%~dp0%%f"

echo ============================================================
echo   BalancaGFIG - instalacao no box
echo   box: %BOX%:5555
echo ============================================================
echo.

if not exist "%ADB%" (
  echo ERRO: adb.exe nao esta nesta pasta.
  echo Copie a pasta inteira do kit, sem tirar arquivos de dentro dela.
  goto :fim
)
if not exist "balancagfig-*.apk" (
  echo ERRO: nao achei nenhum balancagfig-*.apk nesta pasta.
  goto :fim
)
echo APK: %APK%
echo.

echo [1/6] Subindo o servidor de depuracao
"%ADB%" start-server >nul 2>&1

echo [2/6] Conectando em %BOX%:5555
set "CONECTOU="
for /l %%i in (1,1,5) do (
  if not defined CONECTOU (
    "%ADB%" connect %BOX%:5555 2>&1 | findstr /i "connected" >nul && set "CONECTOU=1"
    if not defined CONECTOU timeout /t 3 /nobreak >nul
  )
)
if not defined CONECTOU (
  echo.
  echo ERRO: nao consegui falar com o box em %BOX%.
  echo   - O notebook esta no WiFi do box ^(rede balancaGFIG-...^)?
  echo   - O box esta ligado, com a tela mostrando o aplicativo?
  echo   - Se o box estiver na rede local em vez do WiFi proprio, rode assim:
  echo         instalar.bat 192.168.1.17
  echo     ^(o IP aparece na tela do box^)
  goto :fim
)

echo [3/6] Esperando o box autorizar este notebook
echo       Se a TV mostrar "Permitir depuracao?", marque "sempre" e aceite.
set "AUTORIZADO="
for /l %%i in (1,1,20) do (
  if not defined AUTORIZADO (
    for /f "delims=" %%s in ('%ADB% -s %BOX%:5555 get-state 2^>nul') do (
      if "%%s"=="device" set "AUTORIZADO=1"
    )
    if not defined AUTORIZADO (
      timeout /t 4 /nobreak >nul
      echo       ... aguardando (%%i de 20^)
    )
  )
)
if not defined AUTORIZADO (
  echo.
  echo ERRO: o box nao autorizou este notebook.
  echo   Olhe a TV: deve haver um aviso pedindo para permitir a depuracao.
  echo   Marque "sempre permitir" e aceite com o controle. Depois rode de novo.
  goto :fim
)

echo [4/6] Versao que esta no box hoje:
"%ADB%" -s %BOX%:5555 shell dumpsys package %PACOTE% | findstr /i "versionName versionCode"
echo.

echo [5/6] Instalando o APK ^(leva 1 a 2 minutos^)
set "SAIDA="
for /f "delims=" %%l in ('%ADB% -s %BOX%:5555 install -r -d "%APK%" 2^>^&1') do set "SAIDA=%%l"
echo       !SAIDA!
echo !SAIDA! | findstr /i "Success" >nul
if errorlevel 1 (
  echo !SAIDA! | findstr /i "INSTALL_FAILED_UPDATE_INCOMPATIBLE" >nul
  if not errorlevel 1 (
    echo.
    echo O box tem uma versao de teste, assinada com outra chave, e o Android
    echo recusa instalar por cima dela.
    echo Para instalar esta versao e preciso REMOVER o aplicativo antes - e isso
    echo APAGA as sessoes de medicao gravadas no box.
    set /p "R=Digite REMOVER para apagar e instalar, ou ENTER para parar: "
    if /i not "!R!"=="REMOVER" (
      echo Nada foi feito.
      goto :fim
    )
    echo       Removendo e instalando de novo...
    "%ADB%" -s %BOX%:5555 uninstall %PACOTE%
    for /f "delims=" %%l in ('%ADB% -s %BOX%:5555 install "%APK%" 2^>^&1') do set "SAIDA=%%l"
    echo       !SAIDA!
  )
  echo !SAIDA! | findstr /i "Success" >nul
  if errorlevel 1 (
    echo.
    echo ERRO: a instalacao nao terminou em "Success".
    echo Tire uma foto desta tela e mande para quem te passou o kit.
    goto :fim
  )
)

echo [6/6] Abrindo o aplicativo e conferindo que ele nao ficou "parado"
rem Um pacote recem-instalado fica no estado "stopped", e nesse estado o
rem aplicativo nao sobe sozinho quando o box e ligado.
set "LIBERADO="
for /l %%i in (1,1,4) do (
  if not defined LIBERADO (
    "%ADB%" -s %BOX%:5555 shell am start -n %PACOTE%/.MainActivity >nul 2>&1
    timeout /t 6 /nobreak >nul
    "%ADB%" -s %BOX%:5555 shell dumpsys package %PACOTE% 2>nul | findstr /i /c:"stopped=false" >nul && set "LIBERADO=1"
  )
)
if defined LIBERADO (
  echo       pacote liberado ^(stopped=false^)
) else (
  echo       ATENCAO: o pacote continua parado; o aplicativo pode nao subir
  echo       sozinho quando o box for ligado. Rode o script de novo.
)

echo.
echo Esperando o aplicativo responder ^(ate 2 minutos^)...
rem Enquanto o aplicativo reinicia, o WiFi do box cai por alguns segundos e o
rem notebook se reconecta sozinho - por isso a insistencia. O [Console]::Write
rem evita que o PowerShell quebre o JSON em varias linhas.
set "SAUDE="
for /l %%i in (1,1,12) do (
  if not defined SAUDE (
    for /f "delims=" %%l in ('powershell -NoProfile -Command "try { [Console]::Write((Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 http://%BOX%:3000/saude).Content) } catch { }" 2^>nul') do set "SAUDE=%%l"
    if not defined SAUDE timeout /t 10 /nobreak >nul
  )
)

echo.
echo ============================================================
if defined SAUDE (
  echo  RESULTADO: OK - o aplicativo esta no ar.
  echo  !SAUDE!
) else (
  echo  RESULTADO: FALHOU - instalou, mas o aplicativo nao respondeu.
  echo   - Espere um minuto e rode o script de novo ^(ele so confere^).
  echo   - Se continuar, reinicie o box na tomada e rode de novo.
  echo   - Tire uma foto desta tela e mande para quem te passou o kit.
)
echo ============================================================
echo.

:fim
pause
