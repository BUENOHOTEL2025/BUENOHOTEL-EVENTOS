import { validationResult, body } from 'express-validator';

/**
 * Middleware para validar los resultados de express-validator
 */
const validateFields = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(err => ({
        field: err.param,
        message: err.msg
      }))
    });
  }
  next();
};

// Validaciones para el registro de usuarios (registro básico)
const registerValidations = [
  body('email').isEmail().withMessage('El correo electrónico no es válido'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres'),
  body('nombre')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  body('apellido')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('El apellido debe tener entre 2 y 100 caracteres'),
  body('iglesia')
    .trim()
    .notEmpty()
    .withMessage('La iglesia es requerida'),
  body('telefono')
    .trim()
    .notEmpty().withMessage('El teléfono es requerido')
    .bail()
    .matches(/^[0-9+\-()\s]{7,20}$/)
    .withMessage('El teléfono no es válido'),
  // Tipo y Documento (cédula o pasaporte)
  body('tipoDocumento')
    .trim()
    .isIn(['cedula','pasaporte']).withMessage('tipoDocumento inválido (use "cedula" o "pasaporte")'),
  body('documento')
    .trim()
    .notEmpty().withMessage('El documento (cédula o pasaporte) es requerido')
    .bail()
    .custom((val, { req }) => {
      const tipo = String(req.body.tipoDocumento||'').toLowerCase();
      if (tipo === 'cedula'){
        // Formato RD: 000-0000000-0
        const ok = /^\d{3}-\d{7}-\d{1}$/.test(val);
        if (!ok) throw new Error('La cédula debe tener el formato 000-0000000-0');
      } else if (tipo === 'pasaporte'){
        const ok = /^[A-Za-z0-9]{5,20}$/.test(String(val).replace(/\s/g,''));
        if (!ok) throw new Error('El pasaporte debe ser alfanumérico (5-20 caracteres)');
      } else {
        throw new Error('tipoDocumento inválido');
      }
      return true;
    }),
  // Fecha de nacimiento (YYYY-MM-DD)
  body('fechaNacimiento')
    .trim()
    .notEmpty().withMessage('La fecha de nacimiento es requerida')
    .bail()
    .isISO8601().withMessage('La fecha de nacimiento debe tener formato válido (YYYY-MM-DD)'),
  validateFields
];

// Validaciones para el inicio de sesión
const loginValidations = [
  body('email').isEmail().withMessage('El correo electrónico no es válido'),
  body('password').notEmpty().withMessage('La contraseña es requerida'),
  validateFields
];

export {
  validateFields,
  registerValidations,
  loginValidations
};

// Validaciones para crear registro de evento (sin password)
const eventRegistrationValidations = [
  body('eventoId').trim().notEmpty().withMessage('eventoId es requerido'),
  body('nombre')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  body('apellido')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('El apellido debe tener entre 2 y 100 caracteres'),
  body('email').isEmail().withMessage('El correo electrónico no es válido'),
  body('telefono')
    .trim()
    .notEmpty().withMessage('El teléfono es requerido')
    .bail()
    .matches(/^[0-9+\-()\s]{7,20}$/)
    .withMessage('El teléfono no es válido'),
  body('iglesia').trim().notEmpty().withMessage('La iglesia es requerida'),
  // Método de pago: tarjeta o transferencia
  body('metodoPago')
    .trim()
    .isIn(['tarjeta','transferencia']).withMessage('metodoPago inválido (use "tarjeta" o "transferencia")'),
  // Si la iglesia es 'Otra', exigir campos adicionales
  body('otraIglesia').if((value, { req }) => req.body.iglesia === 'Otra')
    .trim().notEmpty().withMessage('Debe especificar la otra iglesia'),
  body('liderIglesia').if((value, { req }) => req.body.iglesia === 'Otra')
    .trim().notEmpty().withMessage('Debe indicar el líder de iglesia o ministerio'),
  body('contactoLider').if((value, { req }) => req.body.iglesia === 'Otra')
    .trim().notEmpty().withMessage('Debe indicar el contacto del líder'),
  // Pago y aceptación de términos: montoPago requerido solo si metodoPago = transferencia
  body('montoPago').custom(async (val, { req }) => {
    const metodo = (req.body.metodoPago || '').toLowerCase();
    const hasVal = val !== undefined && val !== null && String(val).trim() !== '';
    if (metodo === 'transferencia') {
      if (!hasVal) throw new Error('montoPago es requerido para transferencia');
      if (isNaN(Number(val))) throw new Error('montoPago debe ser numérico');
      if (Number(val) <= 0) throw new Error('montoPago debe ser mayor a 0');
      // Regla dinámica 5%-100% para evento específico si hay precio disponible
      try {
        const eventoId = String(req.body.eventoId || '');
        if (eventoId === 'galeria-6-hotel-gran-ventana'){
          const resp = await fetch('https://zp27hv7zkk.execute-api.us-east-1.amazonaws.com/prod/eventos');
          const data = await resp.json();
          const arr = JSON.parse(data.body || '[]');
          const ev = arr.find(e => {
            const id = (e && typeof e.id==='object' && e.id.S) ? e.id.S : e?.id;
            return id === eventoId;
          });
          if (ev){
            const priceRaw = (ev && typeof ev.precio_por_persona==='object' && 'N' in ev.precio_por_persona) ? Number(ev.precio_por_persona.N) : Number(ev.precio_por_persona || 0);
            if (priceRaw > 0){
              const minVal = Math.ceil(priceRaw * 0.05);
              const maxVal = priceRaw;
              const nval = Number(val);
              if (nval < minVal || nval > maxVal){
                throw new Error(`El monto debe estar entre ${minVal} y ${maxVal} DOP para este evento (5% - 100%).`);
              }
            }
          }
        }
      } catch (_) { /* si falla la consulta, no bloqueamos por rango dinámico */ }
    } else if (metodo === 'tarjeta') {
      if (hasVal) {
        if (isNaN(Number(val))) throw new Error('montoPago debe ser numérico');
        if (Number(val) < 0) throw new Error('montoPago no puede ser negativo');
      }
    }
    return true;
  }),
  body('aceptaTerminos')
    .isBoolean().withMessage('aceptaTerminos debe ser booleano')
    .custom((v) => v === true).withMessage('Debe aceptar los términos'),
  // Observaciones opcional (enviado dentro de detalles)
  body('detalles.observaciones').optional().isString().withMessage('observaciones debe ser texto')
    .bail()
    .isLength({ max: 500 }).withMessage('observaciones no debe exceder 500 caracteres')
    .bail()
    .customSanitizer((v)=> String(v).trim()),
  validateFields
];

export { eventRegistrationValidations };

// Validaciones para actualizar perfil (campos opcionales, al menos 1)
const profileUpdateValidations = [
  body('nombre').optional().trim().isLength({ min: 2, max: 100 }).withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  body('apellido').optional().trim().isLength({ min: 2, max: 100 }).withMessage('El apellido debe tener entre 2 y 100 caracteres'),
  body('telefono').optional().trim().matches(/^[0-9+\-()\s]{7,20}$/).withMessage('El teléfono no es válido'),
  body('iglesia').optional().trim().isLength({ min: 2, max: 120 }).withMessage('La iglesia no es válida'),
  body('tipoDocumento').optional().trim().isIn(['cedula','pasaporte']).withMessage('tipoDocumento inválido'),
  body('documento').optional().trim().custom((val, { req }) => {
    const tipo = String(req.body.tipoDocumento||'').toLowerCase();
    if (!val) return true;
    if (tipo === 'cedula'){
      if (!/^\d{3}-\d{7}-\d{1}$/.test(val)) throw new Error('La cédula debe tener el formato 000-0000000-0');
    } else if (tipo === 'pasaporte'){
      if (!/^[A-Za-z0-9]{5,20}$/.test(String(val).replace(/\s/g,''))) throw new Error('El pasaporte debe ser alfanumérico (5-20 caracteres)');
    }
    return true;
  }),
  body('fechaNacimiento').optional().isISO8601().withMessage('La fecha de nacimiento debe tener formato válido (YYYY-MM-DD)'),
  // Asegurar que haya al menos un campo
  body().custom((bodyObj) => {
    const allowed = ['nombre','apellido','telefono','iglesia','documento','fechaNacimiento'];
    const hasAny = Object.keys(bodyObj).some(k => allowed.includes(k));
    if (!hasAny) throw new Error('Debe proporcionar al menos un campo a actualizar');
    return true;
  }),
  validateFields
];

// Validaciones para cambiar contraseña
const changePasswordValidations = [
  body('oldPassword').notEmpty().withMessage('La contraseña actual es requerida'),
  body('newPassword').isLength({ min: 6 }).withMessage('La nueva contraseña debe tener al menos 6 caracteres'),
  body('confirmNewPassword').custom((val, { req }) => val === req.body.newPassword).withMessage('La confirmación no coincide con la nueva contraseña'),
  validateFields
];

export { profileUpdateValidations, changePasswordValidations };
