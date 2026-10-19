@echo off
rem ============================================================
rem  Deskside launcher
rem  Opens Deskside as its own borderless window on your mini monitor.
rem
rem  1. Put your Deskside address on the DESKSIDE_URL line.
rem  2. Set X and Y to the position of your mini monitor.
rem     Open Deskside on that monitor, then go to Settings, Display.
rem     It shows "This screen: ... at position X, Y". Copy those numbers here.
rem     (A monitor to the left of your main screen has a negative X, like -1024.)
rem  3. Double-click this file.
rem
rem  To start Deskside every time you log in: press Windows+R, type shell:startup,
rem  press Enter, and put a shortcut to this file in the folder that opens.
rem ============================================================

set "DESKSIDE_URL=https://YOUR-SITE.azurestaticapps.net"
set "X=1920"
set "Y=0"

start "" msedge --app="%DESKSIDE_URL%" --user-data-dir="%LOCALAPPDATA%\Deskside" --window-position=%X%,%Y% --start-fullscreen --no-first-run --disable-features=Translate
