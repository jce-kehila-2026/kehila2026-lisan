const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { createApp } = require("./src/server");

setGlobalOptions({
  region: "us-central1",
  memory: "512MiB",
  timeoutSeconds: 120,
});

const app = createApp();

exports.api = onRequest(app);