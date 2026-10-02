@echo off
cd /d "C:\Users\elmer\Desktop\Proyecto Desarrollo Web\BuenoHotel\Eventos-Bucket\Eventos"

echo Eliminando ZIP anterior si existe...
if exist admin-eventos-core-api.zip del admin-eventos-core-api.zip

echo Comprimiendo admin-eventos-core-api con tar...
tar -a -cf admin-eventos-core-api.zip -C admin-eventos-core-api .

echo.
echo Este ZIP es admin-eventos-core-api — puede NO ser el que usa core-api.buenohotel.com.do.
echo Para el dominio publico de eventos suele desplegarse eventos-core-api-sbx (ver compress_eventos_core_api_sbx.bat^).
echo.
if exist admin-eventos-core-api.zip (
    echo ZIP creado exitosamente: admin-eventos-core-api.zip
    echo Ubicacion: C:\Users\elmer\Desktop\Proyecto Desarrollo Web\BuenoHotel\Eventos-Bucket\Eventos\admin-eventos-core-api.zip
) else (
    echo ERROR: No se pudo crear el ZIP
)
pause