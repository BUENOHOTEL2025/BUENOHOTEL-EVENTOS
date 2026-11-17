// auth-service-lambda/index.js
// Lambda para autenticación (login, registro, recuperación, perfil)

const {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
  UpdateItemCommand,
  GetItemCommand,
  DeleteItemCommand
} = require("@aws-sdk/client-dynamodb");
const {
  GetSecretValueCommand,
  SecretsManagerClient
} = require("@aws-sdk/client-secrets-manager");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { randomUUID, timingSafeEqual } = require("crypto");

// ========= Config =========
const REGION = process.env.AWS_REGION || "us-east-1";
const ddb = new DynamoDBClient({ region: REGION });
const sm = new SecretsManagerClient({ region: REGION });

const USERS_TABLE = process.env.DDB_USERS_TABLE || "usuarios";
const EMAIL_GSI = process.env.EMAIL_GSI || "EmailIndex";
const JWT_SECRET_ARN = process.env.JWT_SECRET_ARN;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "12h";
const EMAIL_API_URL = process.env.EMAIL_API_URL || "";
const RESET_URL_BASE = process.env.RESET_URL_BASE || "https://eventos.buenohotel.com.do/reset.html";
const RESET_TOKEN_TTL_MIN = parseInt(process.env.RESET_TOKEN_TTL_MIN || "60", 10);
const LOCK_TABLE = process.env.DGII_LOGIN_LOCK_TABLE || "ecf_login_lock";
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL = 160;
const MAX_PASSWORD = 72;
const MIN_PASSWORD = 8;
const LOCK_FAILS = 3;
const LOCK_FIVE_MS = 5 * 60 * 1000;
const LOCK_THIRTY_MS = 30 * 60 * 1000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "https://eventos.buenohotel.com.do";
const CORS_ALLOWED = Array.from(
  new Set(
    `${CORS_ORIGIN},https://eventos.buenohotel.com.do,https://ecommerce.buenohotel.com.do,https://tours.buenohotel.com.do,https://www.buenohotel.com,https://buenohotel.com`
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  )
);

let requestOrigin = "";

function pickCorsOrigin() {
  if (requestOrigin && CORS_ALLOWED.includes(requestOrigin)) return requestOrigin;
  return "https://eventos.buenohotel.com.do";
}

function normEmail(raw) {
  return String(raw || "").trim().toLowerCase().slice(0, MAX_EMAIL);
}

function emailOk(email) {
  return Boolean(email) && email.length <= MAX_EMAIL && EMAIL_RX.test(email);
}

function passwordIssue(password, { login } = {}) {
  const p = String(password || "");
  if (p.length > MAX_PASSWORD) return "La contraseña es demasiado larga.";
  if (login) {
    if (!p) return "Email y contraseña requeridos";
    return "";
  }
  if (p.length < MIN_PASSWORD) return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`;
  if (!/[A-ZÁÉÍÓÚÜÑ]/.test(p)) return "La contraseña debe incluir una letra mayúscula.";
  if (!/[a-záéíóúüñ]/.test(p)) return "La contraseña debe incluir una letra minúscula.";
  return "";
}

async function issueSession(user) {
  const secret = await getJwtSecret();
  const token = jwt.sign(
    { sub: user.id, email: user.email, rol: user.rol },
    secret,
    { algorithm: "HS256", expiresIn: JWT_EXPIRES_IN }
  );
  return token;
}

function denyPwdChangeToken(claims) {
  return String(claims?.purpose || "") === "pwd-change";
}

function sameSecret(a, b) {
  const A = Buffer.from(String(a || ""), "utf8");
  const B = Buffer.from(String(b || ""), "utf8");
  if (!A.length || A.length !== B.length) return false;
  return timingSafeEqual(A, B);
}

function safeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    nombre: user.nombre,
    apellido: user.apellido,
    rol: user.rol,
    telefono: user.telefono,
    tipoDocumento: user.tipoDocumento,
    documento: user.documento,
    fechaNacimiento: user.fechaNacimiento,
    iglesia: user.iglesia,
    activo: user.activo
  };
}

function attrS(item, key) {
  const v = item?.[key];
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return String(v.S || v.N || "");
}

function attrN(item, key, fallback = 0) {
  const v = item?.[key];
  if (v == null) return fallback;
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (v.N != null) {
    const n = Number(v.N);
    return Number.isFinite(n) ? n : fallback;
  }
  const n = Number(v.S != null ? v.S : v);
  return Number.isFinite(n) ? n : fallback;
}

function lockRemaining(item) {
  const until = Date.parse(attrS(item, "lockUntil"));
  if (!Number.isFinite(until)) return 0;
  return Math.max(0, until - Date.now());
}

function lockPayload(ms) {
  const remainingSeg = Math.ceil(ms / 1000);
  const lockMinutos = remainingSeg > 300 ? 30 : 5;
  return {
    locked: true,
    remainingSeg,
    remainingMs: ms,
    lockMinutos,
    message: `Login inhabilitado ${lockMinutos} minutos por 3 intentos fallidos.`
  };
}

async function lockGet(email) {
  const id = normEmail(email);
  if (!id) return null;
  try {
    const r = await ddb.send(new GetItemCommand({
      TableName: LOCK_TABLE,
      Key: { id: { S: id } }
    }));
    return r.Item || null;
  } catch (err) {
    console.error("login lock get", err?.message || err);
    return null;
  }
}

async function lockedResponse(email) {
  const item = await lockGet(email);
  const ms = lockRemaining(item);
  if (ms <= 0) return null;
  return json(429, lockPayload(ms));
}

async function handleLoginLock(evt) {
  const q = evt.queryStringParameters || {};
  const email = normEmail(q.email || q.correo || "");
  if (!email) return json(200, { success: true, locked: false, remainingSeg: 0 });
  const item = await lockGet(email);
  const ms = lockRemaining(item);
  if (ms <= 0) return json(200, { success: true, locked: false, remainingSeg: 0 });
  return json(200, { success: true, ...lockPayload(ms) });
}

async function registerLoginFail(email) {
  const id = normEmail(email);
  if (!id) return { locked: false };
  try {
    const item = (await lockGet(id)) || {};
    const already = lockRemaining(item);
    if (already > 0) return { locked: true, ...lockPayload(already) };
    const fails = attrN(item, "fails", 0) + 1;
    const nextLockMs = attrN(item, "nextLockMs", LOCK_FIVE_MS);
    const totalLocks = attrN(item, "totalLocks", 0);
    const lastLockMinutos = attrN(item, "lastLockMinutos", 0);
    if (fails < LOCK_FAILS) {
      const put = {
        id: { S: id },
        fails: { N: String(fails) },
        lockUntil: { S: "" },
        nextLockMs: { N: String(nextLockMs || LOCK_FIVE_MS) },
        totalLocks: { N: String(totalLocks) },
        updatedAt: { S: new Date().toISOString() }
      };
      if (lastLockMinutos) put.lastLockMinutos = { N: String(lastLockMinutos) };
      await ddb.send(new PutItemCommand({ TableName: LOCK_TABLE, Item: put }));
      return { locked: false, fails };
    }
    const lockMs = nextLockMs === LOCK_THIRTY_MS ? LOCK_THIRTY_MS : LOCK_FIVE_MS;
    const lockMinutos = Math.round(lockMs / 60000);
    await ddb.send(new PutItemCommand({
      TableName: LOCK_TABLE,
      Item: {
        id: { S: id },
        fails: { N: "0" },
        lockUntil: { S: new Date(Date.now() + lockMs).toISOString() },
        nextLockMs: { N: String(lockMs === LOCK_FIVE_MS ? LOCK_THIRTY_MS : LOCK_FIVE_MS) },
        totalLocks: { N: String(totalLocks + 1) },
        lastLockMinutos: { N: String(lockMinutos) },
        updatedAt: { S: new Date().toISOString() }
      }
    }));
    return { locked: true, ...lockPayload(lockMs) };
  } catch (err) {
    console.error("login lock put", err?.message || err);
    return { locked: false };
  }
}

async function registerLoginOk(email) {
  const id = normEmail(email);
  if (!id) return;
  try {
    await ddb.send(new DeleteItemCommand({
      TableName: LOCK_TABLE,
      Key: { id: { S: id } }
    }));
  } catch (_) {}
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": pickCorsOrigin(),
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Cookie, Accept, Origin, X-User-Email, X-User-Name, X-User-Id, Cache-Control, Pragma",
    Vary: "Origin"
  };
}

// ========= Utils =========
let cachedSecret = null;
async function getJwtSecret() {
  if (cachedSecret) return cachedSecret;
  const r = await sm.send(new GetSecretValueCommand({ SecretId: JWT_SECRET_ARN }));
  cachedSecret = r.SecretString || Buffer.from(r.SecretBinary).toString("utf8");
  return cachedSecret;
}

// Cambiar contraseña (usuario autenticado)
async function handleChangePassword(evt) {
  let body = {};
  try { body = JSON.parse(evt.body || "{}"); } catch {}
  const oldPassword = String(body.oldPassword || "");
  const newPassword = String(body.newPassword || "");
  if (!oldPassword || !newPassword) return json(400, { message: "Datos incompletos" });
  const confirm = body.confirmNewPassword != null ? String(body.confirmNewPassword) : newPassword;
  if (confirm !== newPassword) return json(400, { message: "Las contraseñas no coinciden." });
  if (newPassword === oldPassword) {
    return json(400, { message: "La nueva contraseña debe ser distinta a la actual." });
  }
  const pwdErr = passwordIssue(newPassword);
  if (pwdErr) return json(400, { message: pwdErr });

  const ticket = String(body.changeToken || "").trim();
  let user = null;
  if (ticket) {
    user = await findUserByEmail(body.email);
    if (!user || !user.pwdChangeTicket || !user.pwdChangeTicketExp) {
      return json(401, { message: "No autorizado" });
    }
    if (new Date(user.pwdChangeTicketExp) < new Date()) {
      return json(401, { message: "El tiempo para actualizar la contraseña expiró. Inicia sesión de nuevo." });
    }
    if (!sameSecret(user.pwdChangeTicket, ticket)) return json(401, { message: "No autorizado" });
  } else {
    let claims;
    try { claims = await verifyAuth(evt); } catch { return json(401, { message: "No autorizado" }); }
    if (denyPwdChangeToken(claims)) {
      return json(403, { message: "Debes actualizar tu contraseña para continuar.", mustChangePassword: true });
    }
    user = await findUserByEmail(claims.email);
  }
  if (!user || !user.passwordHash) return json(404, { message: "Usuario no encontrado" });

  const ok = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!ok) return json(400, { message: "La contraseña actual no es correcta" });

  const hash = await bcrypt.hash(newPassword, 10);
  const nowISO = new Date().toISOString();
  await ddb.send(new UpdateItemCommand({
    TableName: USERS_TABLE,
    Key: { id: { S: user.id } },
    UpdateExpression: "SET password = :p, fechaActualizacion = :u REMOVE pwdChangeTicket, pwdChangeTicketExp",
    ExpressionAttributeValues: { ":p": { S: hash }, ":u": { S: nowISO } },
  }));

  const token = await issueSession(user);
  return json(200, { message: "Contraseña actualizada", token, user: safeUser(user) });
}

function json(status, body, extraHeaders = {}) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
      ...extraHeaders
    },
    body: JSON.stringify(body),
  };
}

async function findUserByEmail(email) {
  const key = normEmail(email);
  if (!emailOk(key)) return null;
  let item = null;
  try {
    const cmd = new QueryCommand({
      TableName: USERS_TABLE,
      IndexName: EMAIL_GSI,
      KeyConditionExpression: "#e = :e",
      ExpressionAttributeNames: { "#e": "email" },
      ExpressionAttributeValues: { ":e": { S: key } },
      Limit: 1,
    });
    const r = await ddb.send(cmd);
    item = r.Items?.[0] || null;
  } catch (err) {
    console.error("findUserByEmail", err?.message || err);
    return null;
  }

  if (!item) return null;

  const getS = (k) => item[k]?.S || null;
  const getB = (k) => item[k]?.BOOL !== undefined ? item[k].BOOL : null;
  return {
    id: getS("id"),
    email: getS("email"),
    nombre: getS("nombre"),
    apellido: getS("apellido"),
    rol: getS("rol") || "usuario",
    telefono: getS("telefono"),
    tipoDocumento: getS("tipoDocumento"),
    documento: getS("documento"),
    fechaNacimiento: getS("fechaNacimiento"),
    iglesia: getS("iglesia"),
    passwordHash: getS("password"),
    resetToken: getS("resetToken"),
    resetTokenExp: getS("resetTokenExp"),
    pwdChangeTicket: getS("pwdChangeTicket"),
    pwdChangeTicketExp: getS("pwdChangeTicketExp"),
    activo: getB("activo"),
  };
}

async function verifyAuth(evt) {
  const auth = evt.headers?.authorization || evt.headers?.Authorization || "";
  const m = auth.match(/^Bearer\s+(.*)$/i);
  if (!m) throw new Error("NO_TOKEN");
  const token = String(m[1] || "").trim();
  if (!token || token.length > 4096) throw new Error("NO_TOKEN");
  const secret = await getJwtSecret();
  return jwt.verify(token, secret, { algorithms: ["HS256"] });
}

// ========= Handlers =========
async function handleLogin(evt) {
  let body = {};
  try { body = JSON.parse(evt.body || "{}"); } catch {}

  const email = normEmail(body.email);
  const password = String(body.password || "");
  if (!emailOk(email)) return json(400, { message: "Escribe un correo válido." });
  const loginPwdErr = passwordIssue(password, { login: true });
  if (loginPwdErr) return json(400, { message: loginPwdErr });

  const locked = await lockedResponse(email);
  if (locked) return locked;

  const user = await findUserByEmail(email);
  if (!user || !user.passwordHash) {
    const fail = await registerLoginFail(email);
    if (fail?.locked) return json(429, fail);
    return json(401, { message: "Credenciales inválidas" });
  }
  if (user.activo === false) {
    return json(403, {
      message: "Tu cuenta está inactiva. Ponte en contacto con un administrador.",
      code: "CUENTA_INACTIVA"
    });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const fail = await registerLoginFail(email);
    if (fail?.locked) return json(429, fail);
    return json(401, { message: "Credenciales inválidas" });
  }
  await registerLoginOk(email);

  if (passwordIssue(password)) {
    const changeToken = randomUUID();
    const exp = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    await ddb.send(new UpdateItemCommand({
      TableName: USERS_TABLE,
      Key: { id: { S: user.id } },
      UpdateExpression: "SET pwdChangeTicket = :t, pwdChangeTicketExp = :e",
      ExpressionAttributeValues: { ":t": { S: changeToken }, ":e": { S: exp } }
    }));
    return json(200, {
      mustChangePassword: true,
      changeToken,
      message: "El cambio de contraseña es obligatorio para cumplir con los requerimientos de seguridad.",
      user: { email: user.email, nombre: user.nombre }
    });
  }

  const token = await issueSession(user);
  return json(200, { token, user: safeUser(user) });
}

async function handleRegister(evt) {
  let body = {};
  try { body = JSON.parse(evt.body || "{}"); } catch {}

  const email = normEmail(body.email);
  const password = String(body.password || "");
  if (!emailOk(email)) return json(400, { message: "Escribe un correo válido." });
  const regPwdErr = passwordIssue(password);
  if (regPwdErr) return json(400, { message: regPwdErr });

  const existing = await findUserByEmail(email).catch(()=>null);
  if (existing) {
    return json(409, {
      message: "Este correo ya está registrado. Inicia sesión o restablece tu contraseña.",
      actions: {
        login: "https://eventos.buenohotel.com.do/login.html",
        forgot: "https://eventos.buenohotel.com.do/forgot.html"
      }
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const id = randomUUID();
  const nowISO = new Date().toISOString();

  await ddb.send(new PutItemCommand({
    TableName: USERS_TABLE,
    Item: {
      id: { S: id },
      email: { S: email },
      nombre: { S: String(body.nombre || "").slice(0, 80) },
      apellido: { S: String(body.apellido || "").slice(0, 80) },
      ...(body.telefono ? { telefono: { S: String(body.telefono).trim() } } : {}),
      ...(body.tipoDocumento ? { tipoDocumento: { S: String(body.tipoDocumento).trim().toLowerCase() } } : {}),
      ...(body.documento ? { documento: { S: String(body.documento).trim() } } : {}),
      ...(body.fechaNacimiento ? { fechaNacimiento: { S: String(body.fechaNacimiento).trim() } } : {}),
      ...(body.iglesia ? { iglesia: { S: String(body.iglesia).trim() } } : {}),
      rol: { S: "usuario" },
      password: { S: passwordHash },
      activo: { BOOL: true },
      fechaCreacion: { S: nowISO },
      fechaActualizacion: { S: nowISO },
    },
  }));

  return json(201, { message: "Usuario registrado", userId: id });
}

async function handleForgotPassword(evt) {
  let body = {};
  try { body = JSON.parse(evt.body || "{}"); } catch {}
  const email = normEmail(body.email);
  if (!emailOk(email)) return json(200, { success: true });

  const user = await findUserByEmail(email);
  if (!user) return json(200, { success: true });

  const resetToken = randomUUID();
  const exp = new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60000).toISOString();
  await ddb.send(
    new UpdateItemCommand({
      TableName: USERS_TABLE,
      Key: { id: { S: user.id } },
      UpdateExpression: "SET resetToken = :t, resetTokenExp = :e",
      ExpressionAttributeValues: { ":t": { S: resetToken }, ":e": { S: exp } },
    })
  );

  const resetUrl = `${RESET_URL_BASE}?email=${encodeURIComponent(email)}&token=${encodeURIComponent(resetToken)}`;
  console.log("Reset URL:", resetUrl);

  if (EMAIL_API_URL) {
    try {
      // Preferir plantilla bonita de Booking (GET /email?template=reset)
      const base = String(EMAIL_API_URL).replace(/\/+$/, "");
      const name = String(user.nombre || "").trim();
      const url = `${base}/email?template=reset`
        + `&recipientEmail=${encodeURIComponent(email)}`
        + `&email=${encodeURIComponent(email)}`
        + `&token=${encodeURIComponent(resetToken)}`
        + `&exp=${encodeURIComponent(exp)}`
        + (name ? `&name=${encodeURIComponent(name)}` : "");

      const r = await fetch(url, { method: "GET" });
      if (!r.ok) {
        // Fallback al endpoint legado si existe
        await fetch(`${base}/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipientEmail: email,
            subject: "Recuperar contraseña - BuenoHotel",
            message: `Haz clic en el enlace para restablecer tu contraseña: ${resetUrl}`,
          }),
        });
      }
    } catch (err) {
      console.error("Error enviando email:", err);
    }
  }

  return json(200, { success: true });
}

async function handleResetPassword(evt) {
  let body = {};
  try { body = JSON.parse(evt.body || "{}"); } catch {}

  const token = String(body.token || "").trim().slice(0, 128);
  const newPassword = String(body.newPassword || "");
  if (!token || !newPassword) return json(400, { message: "Datos incompletos" });
  const resetPwdErr = passwordIssue(newPassword);
  if (resetPwdErr) return json(400, { message: resetPwdErr });

  const cmd = new QueryCommand({
    TableName: USERS_TABLE,
    IndexName: "ResetTokenIndex",
    KeyConditionExpression: "#t = :t",
    ExpressionAttributeNames: { "#t": "resetToken" },
    ExpressionAttributeValues: { ":t": { S: token } },
    Limit: 1,
  });
  const r = await ddb.send(cmd);
  const item = r.Items?.[0];
  if (!item) return json(400, { message: "Token inválido" });

  const exp = item.resetTokenExp?.S;
  if (!exp || new Date(exp) < new Date()) return json(400, { message: "Token expirado" });

  const id = item.id.S;
  const hash = await bcrypt.hash(newPassword, 10);

  await ddb.send(
    new UpdateItemCommand({
      TableName: USERS_TABLE,
      Key: { id: { S: id } },
      UpdateExpression: "SET password = :p REMOVE resetToken, resetTokenExp",
      ExpressionAttributeValues: { ":p": { S: hash } },
    })
  );

  return json(200, { message: "Contraseña actualizada" });
}

async function handleMe(evt) {
  let claims;
  try { claims = await verifyAuth(evt); } catch { return json(401, { message: "No autorizado" }); }
  if (denyPwdChangeToken(claims)) {
    return json(403, { message: "Debes actualizar tu contraseña para continuar.", mustChangePassword: true });
  }
  const email = claims.email?.toLowerCase();
  const user = await findUserByEmail(email);
  if (!user) return json(404, { message: "Usuario no encontrado" });
  return json(200, { user: safeUser(user) });
}

// Actualizar perfil (usuario autenticado)
async function handleUpdateProfile(evt) {
  let claims;
  try { claims = await verifyAuth(evt); } catch { return json(401, { message: "No autorizado" }); }
  if (denyPwdChangeToken(claims)) {
    return json(403, { message: "Debes actualizar tu contraseña para continuar.", mustChangePassword: true });
  }
  let body = {};
  try { body = JSON.parse(evt.body || "{}"); } catch {}

  const email = String(claims.email || "").toLowerCase();
  const user = await findUserByEmail(email);
  if (!user) return json(404, { message: "Usuario no encontrado" });

  const allowed = ["nombre","apellido","telefono","tipoDocumento","documento","fechaNacimiento","iglesia"];
  const updates = Object.create(null);
  for (const k of allowed){
    if (Object.prototype.hasOwnProperty.call(body, k)){
      const v = body[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") updates[k] = String(v).trim();
    }
  }
  if (Object.keys(updates).length === 0) return json(400, { message: "Sin cambios" });

  // Normalizaciones básicas
  if (updates.tipoDocumento) updates.tipoDocumento = updates.tipoDocumento.toLowerCase();

  const nowISO = new Date().toISOString();
  // Build UpdateExpression
  const names = {}; const values = {};
  let expr = "SET fechaActualizacion = :u";
  values[":u"] = { S: nowISO };
  for (const [k,v] of Object.entries(updates)){
    names[`#${k}`] = k;
    // Tipo S para todos estos campos
    values[`:${k}`] = { S: v };
    expr += `, #${k} = :${k}`;
  }

  await ddb.send(new UpdateItemCommand({
    TableName: USERS_TABLE,
    Key: { id: { S: user.id } },
    UpdateExpression: expr,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));

  return json(200, { data: updates });
}

// ========= Router =========
exports.handler = async (evt) => {
  const method = evt.requestContext?.http?.method || "";
  const path = (evt.requestContext?.http?.path || "").toLowerCase();
  const hdrs = evt.headers || {};
  requestOrigin = hdrs.origin || hdrs.Origin || "";

  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders()
    };
  }

  // --- Routing ---
  // soportar rutas con y sin "/api" para compatibilidad
  const p = path.replace(/\/api\//, "/");
  if (method === "GET" && (path.endsWith("/api/auth/lock") || p.endsWith("/auth/lock"))) return handleLoginLock(evt);
  if (method === "POST" && (path.endsWith("/api/auth/login") || p.endsWith("/auth/login"))) return handleLogin(evt);
  if (method === "POST" && (path.endsWith("/api/auth/register") || p.endsWith("/auth/register"))) return handleRegister(evt);
  if (method === "GET" && (path.endsWith("/api/auth/me") || p.endsWith("/auth/me"))) return handleMe(evt);
  if (method === "PUT" && (path.endsWith("/api/auth/me") || p.endsWith("/auth/me"))) return handleUpdateProfile(evt);
  if (method === "POST" && (path.endsWith("/api/auth/change-password") || p.endsWith("/auth/change-password"))) return handleChangePassword(evt);
  if (method === "POST" && (path.endsWith("/api/auth/forgot-password") || p.endsWith("/auth/forgot-password"))) return handleForgotPassword(evt);
  if (method === "POST" && (path.endsWith("/api/auth/reset-password") || p.endsWith("/auth/reset-password"))) return handleResetPassword(evt);

  return json(404, { message: "Not found" });
};
