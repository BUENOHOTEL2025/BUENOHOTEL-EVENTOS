import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

let smClient = null;
let hydrated = false;

async function readSecret(arnOrId) {
  const id = String(arnOrId || '').trim();
  if (!id) return '';
  smClient =
    smClient ||
    new SecretsManagerClient({ region: process.env.AWSREGION || process.env.AWS_REGION || 'us-east-1' });
  const r = await smClient.send(new GetSecretValueCommand({ SecretId: id }));
  const raw = r.SecretString || (r.SecretBinary ? Buffer.from(r.SecretBinary).toString('utf8') : '');
  const text = String(raw || '').trim();
  if (!text) return '';
  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text);
      return String(obj.password || obj.DGII_FE_CERT_PASSWORD || obj.secret || obj.value || '').trim() || text;
    } catch {
      return text;
    }
  }
  return text;
}

/**
 * JWT ya se lee de JWT_SECRET_ARN en cada verify/sign.
 * Aquí solo hidratamos la clave del .p12 si está en Secrets Manager
 * y aún no está en el entorno (transición sin romper emisión).
 */
export async function hydrateAppSecrets() {
  if (hydrated) return;
  try {
    if (!String(process.env.DGII_FE_CERT_PASSWORD || '').trim()) {
      const arn = String(process.env.DGII_FE_CERT_PASSWORD_ARN || '').trim();
      if (arn) {
        const pass = await readSecret(arn);
        if (pass) process.env.DGII_FE_CERT_PASSWORD = pass;
      }
    }
  } catch (err) {
    console.error('hydrateAppSecrets:', err?.message || err);
  }
  hydrated = true;
}
