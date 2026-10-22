const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: 'Error de configuración del servidor' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expirado' });
      }
      return res.status(403).json({ error: 'Token inválido' });
    }
    
    if (user.role === 'CLIENT' && !user.client_id) {
      return res.status(403).json({ error: 'El usuario no tiene un cliente asociado.' });
    }
    req.user = user;
    next();
  });
};

module.exports = authenticateToken;
