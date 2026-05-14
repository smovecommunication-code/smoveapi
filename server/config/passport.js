const {
  ENABLE_GOOGLE_LOGIN,
  ENABLE_FACEBOOK_LOGIN,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL,
  FACEBOOK_APP_ID,
  FACEBOOK_APP_SECRET,
  FACEBOOK_CALLBACK_URL,
} = require('./env');

function createOAuthConfig() {
  const googleEnabled = Boolean(ENABLE_GOOGLE_LOGIN && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
  const facebookEnabled = Boolean(ENABLE_FACEBOOK_LOGIN && FACEBOOK_APP_ID && FACEBOOK_APP_SECRET);

  return {
    providerMode: 'backend_oauth',
    googleEnabled,
    facebookEnabled,
    google: {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: GOOGLE_CALLBACK_URL,
    },
    facebook: {
      clientID: FACEBOOK_APP_ID,
      clientSecret: FACEBOOK_APP_SECRET,
      callbackURL: FACEBOOK_CALLBACK_URL,
      profileFields: ['id', 'emails', 'displayName', 'name'],
    },
  };
}

module.exports = { createOAuthConfig };
