@echo off
REM Sube el sitio estatico de Eventos (HTML, main.js, assets) al bucket y purga CloudFront.
REM La API (factura-borrador, registrations) no va aqui: despliega el ZIP de admin-eventos-core-api.zip
REM al Lambda/API Gateway que sirve core-api.buenohotel.com.do (ej. consola AWS o pipeline).
REM Opcional antes: ejecutar compress_admin-eventos.bat para generar el ZIP del backend.

aws s3 sync . s3://eventos-buenohotel-com-do-website-bucket --exclude "node_modules/*" --exclude "*/node_modules/*" --exclude "**/node_modules/**" --exclude "*.zip" --exclude "**/*.zip" --exclude "admin-eventos-core-api/*" --exclude "eventos-core-api-sbx/*" --exclude "auth-service-lambda/*"
aws cloudfront create-invalidation --distribution-id E14DJ0M04GFB9K --paths "/*"