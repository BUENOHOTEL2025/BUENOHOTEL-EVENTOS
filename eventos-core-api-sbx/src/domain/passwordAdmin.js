export function passwordSinEspacios(raw) {
  return String(raw || '').replace(/\s+/g, '');
}

export function validarPasswordAdmin(raw) {
  const p = passwordSinEspacios(raw);
  if (p.length < 8) {
    return 'La contraseña debe tener al menos 8 caracteres (los espacios no cuentan).';
  }
  if (!/[A-ZÁÉÍÓÚÜÑ]/.test(p)) return 'La contraseña debe incluir una mayúscula.';
  if (!/[a-záéíóúüñ]/.test(p)) return 'La contraseña debe incluir una minúscula.';
  return '';
}
