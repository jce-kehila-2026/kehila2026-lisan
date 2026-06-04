// const jwt = require('jsonwebtoken');

// function requireAuth(req, res, next) {
//   const token = req.headers.authorization?.replace('Bearer ', '');

//   if (!token) {
//     return res.status(401).json({ error: 'No token provided' });
//   }

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);

//     req.user = decoded; 

//     next();
//   } catch (err) {
//     return res.status(401).json({ error: 'Invalid or expired token' });
//   }
// }

// module.exports = { requireAuth };


function requireAuth(req, res, next) {
  req.user = {
    uid: 'dev-user',
    role: 'admin'
  };

  next();
}

module.exports = { requireAuth };