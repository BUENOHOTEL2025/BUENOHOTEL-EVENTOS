@echo off
cd /d "C:\Users\elmer\Desktop\Proyecto Desarrollo Web\BuenoHotel\Eventos-Bucket\Eventos"

echo Este ZIP es para core-api.buenohotel.com.do (Lambda handler tipico: index.handler desde index.js o index.mjs).
echo NO uses admin-eventos-core-api.zip para ese dominio si desplegais eventos-core-api-sbx.

echo Eliminando ZIP anterior si existe...
if exist eventos-core-api-sbx.zip del eventos-core-api-sbx.zip

echo Comprimiendo eventos-core-api-sbx...
tar -a -cf eventos-core-api-sbx.zip -C eventos-core-api-sbx .

if exist eventos-core-api-sbx.zip (
    echo OK: eventos-core-api-sbx.zip
) else (
    echo ERROR al crear el ZIP
)
pause
