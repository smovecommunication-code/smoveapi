const { createApp } = require('../server/app');
const { validateCriticalEnv } = require('../server/config/env');

validateCriticalEnv();

const app = createApp();
module.exports = app;
