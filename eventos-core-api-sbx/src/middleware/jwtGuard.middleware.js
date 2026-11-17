import { tokenFromRequest, verifyBuenoHotelJwt } from '../services/jwtBuenoHotel.service.js';
import { requirePanelAdmin } from '../controllers/adminsEcf.controller.js';

function deny(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  throw err;
}

/** JWT HS256 de BuenoHotel (header o cookie). No vale Cognito. */
export async function requireVerifiedJwt(req, _res, next) {
  if (req.method === 'OPTIONS') return next();
  try {
    const token = tokenFromRequest(req);
    if (!token) {
      deny(401, 'Sesión requerida (JWT de BuenoHotel).', 'AUTH_REQUIRED');
    }
    req.jwtPayload = await verifyBuenoHotelJwt(token);
    next();
  } catch (err) {
    next(err);
  }
}

/** JWT válido + cuenta de administración del panel. */
export async function requirePanelJwt(req, _res, next) {
  if (req.method === 'OPTIONS') return next();
  try {
    const token = tokenFromRequest(req);
    if (!token) {
      deny(401, 'Sesión requerida (JWT de BuenoHotel).', 'AUTH_REQUIRED');
    }
    req.jwtPayload = await verifyBuenoHotelJwt(token);
    req.panelUser = await requirePanelAdmin(req);
    next();
  } catch (err) {
    next(err);
  }
}
