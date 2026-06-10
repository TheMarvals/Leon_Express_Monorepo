// middlewares/roleValidator.js
'use strict';

const roleValidator = (requiredRoles = []) => {
  return (req, res, next) => {
    // 1. Verifica que el usuario y el rol existan después de la autenticación
    // Esto previene el error 500 si el token fuera inválido o no tuviera rol.
    if (!req.user || !req.user.role) {
      return res.status(403).json({ error: 'Faltan credenciales de rol para realizar esta acción.' });
    }

    // 2. Si la ruta no requiere ningún rol específico, permite el acceso
    // (Ej. para tu ruta GET /users/roles)
    if (requiredRoles.length === 0) {
      return next();
    }
    
    // 3. Verifica si el rol del usuario está en la lista de roles requeridos
    const userRole = req.user.role;
    if (requiredRoles.includes(userRole)) {
      return next(); // ¡Éxito! El usuario tiene el permiso.
    }
    
    // 4. Si no tiene el permiso, deniega el acceso con un error 403 Forbidden
    return res.status(403).json({ error: 'No tienes los permisos necesarios para realizar esta acción.' });
  };
};

module.exports = roleValidator;