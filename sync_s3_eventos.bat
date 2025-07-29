@echo off
REM Sincroniza TODO el contenido de la carpeta actual al bucket S3 'eventos-buenohotel-com-do-website-bucket'
REM NO elimina archivos del bucket que no estén localmente

aws s3 sync . "s3://eventos-buenohotel-com-do-website-bucket/" --exclude ".git/*" --exclude "node_modules/*"