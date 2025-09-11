import crypto from 'crypto';

/**
 * AZUL Hosted Payment helper utilities
 * NOTE: Confirm parameter names and signature method with your AZUL docs/contract.
 */
export function getAzulConfig() {
  const required = ['AZUL_MERCHANT_ID','AZUL_MERCHANT_NAME','AZUL_MERCHANT_TYPE','AZUL_AUTH_KEY','AZUL_API_BASE','AZUL_CURRENCY','PAY_RETURN_URL','PAY_NOTIFY_URL'];
  const cfg = {};
  for (const k of required){
    const v = process.env[k];
    if (!v) console.warn(`[AZUL] Missing env ${k}`);
    cfg[k] = v || '';
  }
  return cfg;
}

/**
 * Generate HMAC signature for AZUL. Adjust algorithm and fields order per AZUL spec.
 * This implementation signs a canonical string of sorted key=value pairs joined by &.
 */
export function signFields(fields, secret){
  const entries = Object.entries(fields)
    .filter(([,v]) => v !== undefined && v !== null && v !== '')
    .map(([k,v])=>[String(k), String(v)])
    .sort((a,b)=> a[0].localeCompare(b[0]));
  const canonical = entries.map(([k,v])=>`${k}=${v}`).join('&');
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}

/**
 * Verify signature provided by AZUL in webhook/return.
 */
export function verifySignature(fields, providedSignature, secret){
  const calc = signFields(fields, secret);
  return String(calc) === String(providedSignature);
}

/**
 * Build hosted payment payload for AZUL. Adjust field names per AZUL.
 */
export function buildHostedPaymentPayload({ orderNumber, amount, currency, customerEmail, approvedUrl, declinedUrl, cancelUrl }){
  // Amount must be string with 2 decimals
  const amtStr = Number(amount).toFixed(2);
  const payload = {
    MerchantId: process.env.AZUL_MERCHANT_ID,
    MerchantName: process.env.AZUL_MERCHANT_NAME,
    MerchantType: process.env.AZUL_MERCHANT_TYPE,
    OrderNumber: orderNumber,
    Amount: amtStr,
    CurrencyCode: currency || process.env.AZUL_CURRENCY || 'DOP',
    CustomerEmail: customerEmail || '',
    ApprovedUrl: approvedUrl || process.env.PAY_RETURN_URL,
    DeclinedUrl: declinedUrl || process.env.PAY_RETURN_URL,
    CancelUrl: cancelUrl || process.env.PAY_RETURN_URL,
    // Notification (server-to-server)
    NotificationUrl: process.env.PAY_NOTIFY_URL,
  };
  // Sign
  payload.Signature = signFields(payload, process.env.AZUL_AUTH_KEY || '');
  return payload;
}

export function getPaymentPageUrl(){
  // For AZUL hosted page, the API base provided by user appears to be a full page URL (Default.aspx)
  return process.env.AZUL_API_BASE;
}
