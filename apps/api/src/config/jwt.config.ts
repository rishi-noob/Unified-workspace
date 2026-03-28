export const jwtConfig = () => ({
  secret: process.env.JWT_SECRET || 'default_jwt_secret_change_in_production',
  signOptions: {
    expiresIn: process.env.JWT_EXPIRY || '15m',
  },
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'default_refresh_secret_change',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRY || '7d',
});
