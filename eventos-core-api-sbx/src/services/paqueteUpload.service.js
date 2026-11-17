import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const BUCKET = process.env.PAQUETES_IMAGE_BUCKET || 'buenohotel-com-website-bucket';
const PUBLIC = process.env.PAQUETES_IMAGE_PUBLIC || 'https://buenohotel.com';

export async function savePaqueteImage(dataUrl) {
  const m = String(dataUrl || '').match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!m) {
    const err = new Error('Sube una imagen JPG, PNG o WebP.');
    err.status = 400;
    throw err;
  }
  const kind = m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase();
  const buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
  if (buf.length < 40) {
    const err = new Error('La imagen está vacía.');
    err.status = 400;
    throw err;
  }
  if (buf.length > 4.5 * 1024 * 1024) {
    const err = new Error('La imagen pesa demasiado. Prueba otra más liviana.');
    err.status = 400;
    throw err;
  }
  const ext = kind === 'jpeg' ? 'jpg' : kind;
  const key = `assets/paquetes/${randomUUID()}.${ext}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buf,
      ContentType: `image/${kind}`,
      CacheControl: 'public, max-age=31536000, immutable'
    })
  );
  return `${PUBLIC}/${key}`;
}
