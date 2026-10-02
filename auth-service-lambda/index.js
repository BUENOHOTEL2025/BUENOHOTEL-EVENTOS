// auth-service-lambda/index.js
// Lambda para autenticación (login, registro, recuperación, perfil)

const {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
  UpdateItemCommand,
  ScanCommand
} = require("@aws-sdk/client-dynamodb");
const {
  GetSecretValueCommand,
  SecretsManagerClient
} = require("@aws-sdk/client-secrets-manager");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto");

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
const CORS_ORIGIN = process.env.CORS_ORIGIN || "https://eventos.buenohotel.com.do";

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
  let claims;
  try { claims = await verifyAuth(evt); } catch { return json(401, { message: "No autorizado" }); }
  let body = {};
  try { body = JSON.parse(evt.body || "{}"); } catch {}
  const oldPassword = String(body.oldPassword || "");
  const newPassword = String(body.newPassword || "");
  if (!oldPassword || !newPassword) return json(400, { message: "Datos incompletos" });
  if (newPassword.length < 6) return json(400, { message: "La nueva contraseña debe tener al menos 6 caracteres" });

  const email = String(claims.email || "").toLowerCase();
  const user = await findUserByEmail(email);
  if (!user || !user.passwordHash) return json(404, { message: "Usuario no encontrado" });

  const ok = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!ok) return json(400, { message: "La contraseña actual no es correcta" });

  const hash = await bcrypt.hash(newPassword, 10);
  const nowISO = new Date().toISOString();
  await ddb.send(new UpdateItemCommand({
    TableName: USERS_TABLE,
    Key: { id: { S: user.id } },
    UpdateExpression: "SET password = :p, fechaActualizacion = :u",
    ExpressionAttributeValues: { ":p": { S: hash }, ":u": { S: nowISO } },
  }));

  return json(200, { message: "Contraseña actualizada" });
}

function json(status, body, extraHeaders = {}) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": CORS_ORIGIN,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

async function findUserByEmail(email) {
  let item = null;
  try {
    const cmd = new QueryCommand({
      TableName: USERS_TABLE,
      IndexName: EMAIL_GSI,
      KeyConditionExpression: "#e = :e",
      ExpressionAttributeNames: { "#e": "email" },
      ExpressionAttributeValues: { ":e": { S: email } },
      Limit: 1,
    });
    const r = await ddb.send(cmd);
    item = r.Items?.[0] || null;
  } catch (_) {}

  if (!item) {
    let lastKey = undefined;
    do {
      const scan = new ScanCommand({
        TableName: USERS_TABLE,
        ProjectionExpression: "#id, #email",
        ExpressionAttributeNames: { "#id": "id", "#email": "email" },
        Limit: 100,
        ExclusiveStartKey: lastKey,
      });
      const rs = await ddb.send(scan);
      const found = (rs.Items || []).find(it => (it.email?.S || '').toLowerCase() === email);
      if (found) { item = found; break; }
      lastKey = rs.LastEvaluatedKey;
    } while (lastKey);
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
    activo: getB("activo"),
  };
}

async function verifyAuth(evt) {
  const auth = evt.headers?.authorization || evt.headers?.Authorization || "";
  const m = auth.match(/^Bearer\s+(.*)$/i);
  if (!m) throw new Error("NO_TOKEN");
  const token = m[1];
  const secret = await getJwtSecret();
  return jwt.verify(token, secret);
}

// ========= Handlers =========
async function handleLogin(evt) {
  let body = {};
  try { body = JSON.parse(evt.body || "{}"); } catch {}

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) return json(400, { message: "Email y contraseña requeridos" });

  const user = await findUserByEmail(email);
  if (!user || !user.passwordHash) return json(401, { message: "Credenciales inválidas" });
  if (user.activo === false) return json(403, { message: "Su cuenta ha sido desactivada. Contacte al administrador: +1 (809) 303-4991" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return json(401, { message: "Credenciales inválidas" });

  const secret = await getJwtSecret();
  const token = jwt.sign({ sub: user.id, email: user.email, rol: user.rol }, secret, {
    algorithm: "HS256",
    expiresIn: JWT_EXPIRES_IN,
  });

  const safeUser = {
    id: user.id, email: user.email, nombre: user.nombre,
    apellido: user.apellido, rol: user.rol, telefono: user.telefono,
    tipoDocumento: user.tipoDocumento, documento: user.documento,
    fechaNacimiento: user.fechaNacimiento, iglesia: user.iglesia,
  };

  return json(200, { token, user: safeUser });
}

async function handleRegister(evt) {
  let body = {};
  try { body = JSON.parse(evt.body || "{}"); } catch {}

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) return json(400, { message: "Email y contraseña requeridos" });

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
      nombre: { S: String(body.nombre || "") },
      apellido: { S: String(body.apellido || "") },
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
  const email = String(body.email || "").trim().toLowerCase();
  if (!email) return json(400, { message: "Email requerido" });

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

  const token = String(body.token || "");
  const newPassword = String(body.newPassword || "");
  if (!token || !newPassword) return json(400, { message: "Datos incompletos" });

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
  const email = claims.email?.toLowerCase();
  const user = await findUserByEmail(email);
  if (!user) return json(404, { message: "Usuario no encontrado" });
  return json(200, { user });
}

// Actualizar perfil (usuario autenticado)
async function handleUpdateProfile(evt) {
  let claims;
  try { claims = await verifyAuth(evt); } catch { return json(401, { message: "No autorizado" }); }
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

  // --- 🔥 BLOQUE CORS UNIVERSAL ---
  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": CORS_ORIGIN,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,PATCH,OPTIONS",
      },
    };
  }

  // --- Routing ---
  // soportar rutas con y sin "/api" para compatibilidad
  const p = path.replace(/\/api\//, "/");
  if (method === "POST" && (path.endsWith("/api/auth/login") || p.endsWith("/auth/login"))) return handleLogin(evt);
  if (method === "POST" && (path.endsWith("/api/auth/register") || p.endsWith("/auth/register"))) return handleRegister(evt);
  if (method === "GET" && (path.endsWith("/api/auth/me") || p.endsWith("/auth/me"))) return handleMe(evt);
  if (method === "PUT" && (path.endsWith("/api/auth/me") || p.endsWith("/auth/me"))) return handleUpdateProfile(evt);
  if (method === "POST" && (path.endsWith("/api/auth/change-password") || p.endsWith("/auth/change-password"))) return handleChangePassword(evt);
  if (method === "POST" && (path.endsWith("/api/auth/forgot-password") || p.endsWith("/auth/forgot-password"))) return handleForgotPassword(evt);
  if (method === "POST" && (path.endsWith("/api/auth/reset-password") || p.endsWith("/auth/reset-password"))) return handleResetPassword(evt);

  return json(404, { message: "Not found" });
};
