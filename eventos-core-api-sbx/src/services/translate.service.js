import { TranslateClient, TranslateTextCommand } from '@aws-sdk/client-translate';

const client = new TranslateClient({ region: process.env.AWS_REGION || 'us-east-1' });

export async function translateEsToEn(text) {
  const src = String(text || '').trim();
  if (!src) return '';
  const out = await client.send(
    new TranslateTextCommand({
      SourceLanguageCode: 'es',
      TargetLanguageCode: 'en',
      Text: src.slice(0, 9000)
    })
  );
  return String(out.TranslatedText || '').trim();
}

export async function translateFields(fields) {
  const keys = Object.keys(fields || {});
  const result = {};
  for (const key of keys) {
    const val = fields[key];
    if (Array.isArray(val)) {
      result[key] = [];
      for (const line of val) {
        result[key].push(await translateEsToEn(line));
      }
    } else {
      result[key] = await translateEsToEn(val);
    }
  }
  return result;
}
