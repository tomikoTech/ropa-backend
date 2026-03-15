/**
 * Jest setupFile: runs before every test file.
 * Ensures DB env vars are set for CI or local development.
 */
if (!process.env.E2E_USE_CLOUD_DB) {
  if (!process.env.DB_HOST) process.env.DB_HOST = 'localhost';
  if (!process.env.DB_PORT) process.env.DB_PORT = '5432';
  if (!process.env.DB_USERNAME) process.env.DB_USERNAME = 'dylanbc1';
  if (!process.env.DB_PASSWORD) process.env.DB_PASSWORD = '';
  if (!process.env.DB_DATABASE) process.env.DB_DATABASE = 'ropa_pos';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-secret';
  if (!process.env.JWT_REFRESH_SECRET)
    process.env.JWT_REFRESH_SECRET = 'test-refresh';
}
