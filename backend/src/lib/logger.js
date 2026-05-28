const pino = require('pino');

const logger = pino({
  name: 'lisan-backend',
  level: process.env.LOG_LEVEL || 'info',
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

function toErrorPayload(error) {
  if (!error) {
    return undefined;
  }

  return {
    message: error.message || 'Unknown error',
    code: error.code || null,
    status: error.status || null,
    stack: error.stack || null,
  };
}

module.exports = {
  logger,
  toErrorPayload,
};
