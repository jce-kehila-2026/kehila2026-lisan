const { mockUser } = require('../mocks/mockUser');

exports.getMe = (req, res) => {
  res.status(200).json(mockUser);
};