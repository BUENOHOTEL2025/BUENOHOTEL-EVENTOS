import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import User from '../models/User.js';
import { generateToken } from '../utils/jwt.js';
import { validationResult } from 'express-validator';
import config from '../config/config.js';
import { sendEmailViaLambda } from '../utils/emailClient.js';

class AuthController {
  /**
   * Registra un nuevo usuario
   */
  static async register(req, res) {
    try {
      const { email: rawEmail, password, nombre, apellido, telefono, iglesia, documento, fechaNacimiento, tipoDocumento } = req.body;
      const email = (rawEmail || '').trim().toLowerCase();

      // Verificar si el usuario ya existe
      const existingUser = await User.getByEmail(email);
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'El correo electrónico ya está registrado'
        });
      }

      // Hashear la contraseña
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Crear el usuario
      const userData = {
        email,
        password: hashedPassword,
        nombre,
        apellido,
        telefono: telefono || '',
        iglesia: iglesia || '',
        documento: documento || '',
        fechaNacimiento: fechaNacimiento || '',
        tipoDocumento: (tipoDocumento||'').toLowerCase() || 'cedula',
        rol: 'usuario' // Rol por defecto
      };

      const user = await User.create(userData);

      // Generar token JWT
      const token = generateToken({
        id: user.id,
        email: user.email,
        rol: user.rol
      });

      // No devolver la contraseña en la respuesta
      const { password: _, ...userWithoutPassword } = user;

      res.status(201).json({
        success: true,
        message: 'Usuario registrado exitosamente',
        data: {
          user: userWithoutPassword,
          token
        }
      });

    } catch (error) {
      console.error('Error en el registro:', error);
      res.status(500).json({
        success: false,
        message: 'Error al registrar el usuario',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Inicia sesión de un usuario
   */
  static async login(req, res) {
    try {
      const { email: rawEmail, password } = req.body;
      const email = (rawEmail || '').trim().toLowerCase();

      // Buscar usuario por email
      const user = await User.getByEmail(email);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Credenciales inválidas'
        });
      }

      // Verificar contraseña
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Credenciales inválidas'
        });
      }

      // Generar token JWT
      const token = generateToken({
        id: user.id,
        email: user.email,
        rol: user.rol
      });

      // No devolver la contraseña en la respuesta
      const { password: _, ...userWithoutPassword } = user;

      res.json({
        success: true,
        message: 'Inicio de sesión exitoso',
        data: {
          user: userWithoutPassword,
          token
        }
      });

    } catch (error) {
      console.error('Error en el inicio de sesión:', error);
      res.status(500).json({
        success: false,
        message: 'Error al iniciar sesión',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Obtiene el perfil del usuario actual
   */
  static async getProfile(req, res) {
    try {
      const user = await User.getById(req.user.sub);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Usuario no encontrado'
        });
      }

      // No devolver la contraseña en la respuesta
      const { password, ...userWithoutPassword } = user;

      res.json({
        success: true,
        data: userWithoutPassword
      });

    } catch (error) {
      console.error('Error al obtener el perfil:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener el perfil del usuario'
      });
    }
  }

  /**
   * Actualiza el perfil del usuario autenticado (nombre, apellido, telefono, iglesia)
   */
  static async updateProfile(req, res) {
    try {
      const userId = req.user.sub;
      const { nombre, apellido, telefono, iglesia } = req.body;

      const updates = {};
      if (typeof nombre !== 'undefined') updates.nombre = nombre;
      if (typeof apellido !== 'undefined') updates.apellido = apellido;
      if (typeof telefono !== 'undefined') updates.telefono = telefono;
      if (typeof iglesia !== 'undefined') updates.iglesia = iglesia;

      const updated = await User.update(userId, updates);
      const { password, ...userWithoutPassword } = updated;
      return res.json({ success: true, message: 'Perfil actualizado', data: userWithoutPassword });
    } catch (error) {
      console.error('Error al actualizar perfil:', error);
      return res.status(500).json({ success: false, message: 'Error al actualizar el perfil' });
    }
  }

  /**
   * Cambia la contraseña del usuario autenticado
   */
  static async changePassword(req, res) {
    try {
      const userId = req.user.sub;
      const { oldPassword, newPassword } = req.body;

      const user = await User.getById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      }

      const isPasswordValid = await bcrypt.compare(oldPassword, user.password || '');
      if (!isPasswordValid) {
        return res.status(400).json({ success: false, message: 'La contraseña actual no es correcta' });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      await User.update(userId, { password: hashedPassword });

      return res.json({ success: true, message: 'Contraseña actualizada correctamente' });
    } catch (error) {
      console.error('Error al cambiar contraseña:', error);
      return res.status(500).json({ success: false, message: 'Error al cambiar la contraseña' });
    }
  }

  /**
   * Inicia flujo de restablecimiento de contraseña: genera token y envía email
   */
  static async forgotPassword(req, res) {
    try {
      const { email: rawEmail } = req.body || {};
      const email = (rawEmail || '').trim().toLowerCase();
      if (!email) {
        return res.status(400).json({ success: false, message: 'Email es requerido' });
      }

      const user = await User.getByEmail(email);
      // Para no filtrar si existe o no, respondemos igual pero solo generamos token si existe
      if (user) {
        const tokenPlain = crypto.randomBytes(24).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(tokenPlain).digest('hex');
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

        await User.update(user.id, {
          passwordResetTokenHash: tokenHash,
          passwordResetExpires: expiresAt,
        });

        const frontendBase = process.env.FRONTEND_URL || config.cors.origin || 'http://localhost:3001';
        const resetLink = `${frontendBase.replace(/\/$/, '')}/reset.html?token=${encodeURIComponent(tokenPlain)}&email=${encodeURIComponent(email)}`;

        const html = `
          <p>Has solicitado restablecer tu contraseña.</p>
          <p>Haz clic en el siguiente enlace para continuar. Este enlace expira en 15 minutos.</p>
          <p><a href="${resetLink}">Restablecer contraseña</a></p>
          <p>Si no solicitaste este cambio, ignora este mensaje.</p>
        `;

        try {
          await sendEmailViaLambda({
            to: email,
            subject: 'Restablecer contraseña - BuenoHotel',
            text: `Usa este enlace para restablecer tu contraseña (expira en 15 minutos): ${resetLink}`,
            html,
          });
        } catch (mailErr) {
          console.error('Error enviando email de reset:', mailErr);
          // No hacemos fail del endpoint, para no revelar si existe o no el usuario
        }
      }

      return res.json({ success: true, message: 'Si el email existe, se ha enviado un enlace de restablecimiento' });
    } catch (error) {
      console.error('Error en forgotPassword:', error);
      return res.status(500).json({ success: false, message: 'Error al iniciar el restablecimiento' });
    }
  }

  /**
   * Completa el restablecimiento de contraseña con email + token + nueva contraseña
   */
  static async resetPassword(req, res) {
    try {
      const { email: rawEmail, token, newPassword } = req.body || {};
      const email = (rawEmail || '').trim().toLowerCase();
      if (!email || !token || !newPassword) {
        return res.status(400).json({ success: false, message: 'Email, token y nueva contraseña son requeridos' });
      }

      const user = await User.getByEmail(email);
      if (!user || !user.password || !user.passwordResetTokenHash || !user.passwordResetExpires) {
        return res.status(400).json({ success: false, message: 'Token inválido o expirado' });
      }

      const now = Date.now();
      const expires = Date.parse(user.passwordResetExpires);
      if (Number.isFinite(expires) && now > expires) {
        return res.status(400).json({ success: false, message: 'El token ha expirado' });
      }

      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      if (tokenHash !== user.passwordResetTokenHash) {
        return res.status(400).json({ success: false, message: 'Token inválido' });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      await User.update(user.id, {
        password: hashedPassword,
        passwordResetTokenHash: null,
        passwordResetExpires: null,
      });

      return res.json({ success: true, message: 'Contraseña restablecida correctamente' });
    } catch (error) {
      console.error('Error en resetPassword:', error);
      return res.status(500).json({ success: false, message: 'Error al restablecer la contraseña' });
    }
  }
}

export default AuthController;
