const { mockUser, mockToken } = require('../mocks/mockUser');

exports.login = (req, res) => {
  const { username, password } = req.body;

  if (!username || !password || username.trim() === '' || password.trim() === '') {
    return res.status(400).json({
      success: false,
      error: 'Username and password are required'
    });
  }

  return res.status(200).json({
    success: true,
    token: mockToken,
    user: {
      id: mockUser.id,
      name: mockUser.name,
      role: mockUser.role,
      level: mockUser.level
    }
  });
};