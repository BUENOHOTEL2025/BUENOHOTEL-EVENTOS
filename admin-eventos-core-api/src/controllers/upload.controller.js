import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const BUCKET_NAME = process.env.S3_BUCKET || 'eventos-buenohotel-com-do-website-bucket';

/**
 * Genera una URL pre-firmada para subir una imagen a S3
 * POST /admin/eventos/upload-imagen
 * Body: { fileName, folder, contentType }
 */
export const getUploadUrl = async (req, res) => {
  try {
    const { fileName, folder = 'assets/img/eventos', contentType = 'image/jpeg' } = req.body;

    if (!fileName) {
      return res.status(400).json({
        ok: false,
        message: 'Se requiere fileName'
      });
    }

    // Generar nombre único para evitar colisiones
    const ext = fileName.split('.').pop() || 'jpg';
    const uniqueName = `${uuidv4()}.${ext}`;
    const key = `${folder.replace(/^\/+|\/+$/g, '')}/${uniqueName}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    // URL pre-firmada válida por 5 minutos
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    // Path final donde quedará la imagen (relativo al bucket/sitio)
    const finalPath = key;

    res.json({
      ok: true,
      uploadUrl,
      finalPath,
      fullUrl: `https://eventos.buenohotel.com.do/${finalPath}`
    });

  } catch (error) {
    console.error('Error generando URL de subida:', error);
    res.status(500).json({
      ok: false,
      message: 'Error al generar URL de subida',
      error: error.message
    });
  }
};
