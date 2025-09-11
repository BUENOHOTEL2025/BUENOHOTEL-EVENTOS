import jwt from 'jsonwebtoken';
import config from '../config/config.js';

// Obtener configuración de JWT
const JWT_SECRET = config.jwt.secret;
const JWT_EXPIRES_IN = config.jwt.expiresIn;
const JWT_ALGORITHM = 'HS256';

/**
 * Genera un token JWT para un usuario
 * @param {Object} user - Objeto de usuario
 * @param {string} user.id - ID del usuario
 * @param {string} user.email - Email del usuario
 * @param {string} user.rol - Rol del usuario
 * @returns {string} Token JWT firmado
 */
const generateToken = (user) => {
  const payload = {
    sub: user.id,
    email: user.email,
    rol: user.rol || 'usuario',
    iat: Math.floor(Date.now() / 1000),
  };

  return jwt.sign(payload, JWT_SECRET, { 
    expiresIn: JWT_EXPIRES_IN,
    algorithm: JWT_ALGORITHM
  });
};

/**
 * Verifica y decodifica un token JWT
 * @param {string} token - Token JWT a verificar
 * @returns {Object} Payload decodificado
 * @throws {Error} Si el token es inválido o ha expirado
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token expirado');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Token inválido');
    }
    throw error;
  }
};

/**
 * Middleware para verificar el token en las rutas protegidas
 */
const authenticateJWT = (req, res, next) => {
  // Obtener el token del header Authorization
  const authHeader = req.headers.authorization;
  
  if (authHeader) {
    const token = authHeader.split(' ')[1]; // Formato: Bearer <token>
    
    try {
      const decoded = verifyToken(token);
      req.user = decoded; // Añadir el usuario decodificado al request
      next();
    } catch (error) {
      return res.status(401).json({ 
        success: false, 
        message: error.message || 'No autorizado' 
      });
    }
  } else {
    res.status(401).json({ 
      success: false, 
      message: 'Token de autenticación no proporcionado' 
    });
  }
};

/**
 * Middleware para verificar roles de usuario
 * @param {...string} roles - Roles permitidos
 * @returns {Function} Middleware de Express
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'No autenticado' 
      });
    }

    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ 
        success: false, 
        message: 'No tienes permiso para realizar esta acción' 
      });
    }

    next();
  };
};

export {
  generateToken,
  verifyToken,
  authenticateJWT,
  authorize
};
