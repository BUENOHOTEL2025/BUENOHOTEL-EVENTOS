import express from 'express';
import { body } from 'express-validator';
import { registerValidations, loginValidations, profileUpdateValidations, changePasswordValidations } from '../middleware/validation.js';
import AuthController from '../controllers/authController.js';
import { authenticateJWT } from '../utils/jwt.js';

const router = express.Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Registra un nuevo usuario
 *     tags: [Autenticación]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - nombre
 *               - apellido
 *               - iglesia
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *               nombre:
 *                 type: string
 *               apellido:
 *                 type: string
 *               iglesia:
 *                 type: string
 *                 description: Iglesia de procedencia; si es "Otra", enviar el nombre en este mismo campo
 *     responses:
 *       201:
 *         description: Usuario registrado exitosamente
 *       400:
 *         description: Datos de entrada inválidos o correo ya registrado
 */
router.post('/register', registerValidations, AuthController.register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Inicia sesión de un usuario
 *     tags: [Autenticación]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Inicio de sesión exitoso
 *       401:
 *         description: Credenciales inválidas
 */
router.post('/login', loginValidations, AuthController.login);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Inicia el proceso de restablecimiento de contraseña y envía un correo con enlace
 *     tags: [Autenticación]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Si el email existe, se envía un enlace
 */
router.post('/forgot-password', AuthController.forgotPassword);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Completa el restablecimiento de contraseña usando token enviado por email
 *     tags: [Autenticación]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, token, newPassword]
 *             properties:
 *               email: { type: string, format: email }
 *               token: { type: string }
 *               newPassword: { type: string, format: password }
 *     responses:
 *       200:
 *         description: Contraseña restablecida
 */
router.post('/reset-password', AuthController.resetPassword);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Obtiene el perfil del usuario autenticado
 *     tags: [Autenticación]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil del usuario
 *       401:
 *         description: No autorizado
 */
router.get('/me', authenticateJWT, AuthController.getProfile);

/**
 * @swagger
 * /api/auth/me:
 *   put:
 *     summary: Actualiza el perfil del usuario autenticado
 *     tags: [Autenticación]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre: { type: string }
 *               apellido: { type: string }
 *               telefono: { type: string }
 *               iglesia: { type: string }
 *     responses:
 *       200:
 *         description: Perfil actualizado
 */
router.put('/me', authenticateJWT, profileUpdateValidations, AuthController.updateProfile);

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Cambia la contraseña del usuario autenticado
 *     tags: [Autenticación]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [oldPassword, newPassword, confirmNewPassword]
 *             properties:
 *               oldPassword: { type: string }
 *               newPassword: { type: string }
 *               confirmNewPassword: { type: string }
 *     responses:
 *       200:
 *         description: Contraseña actualizada
 */
router.post('/change-password', authenticateJWT, changePasswordValidations, AuthController.changePassword);

export default router;
