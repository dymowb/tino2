module.exports = {
  apps: [
    {
      name: 'tino-backend',
      script: 'dist/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',

      // Load production env from .env.production in the same directory
      env_production: {
        NODE_ENV: 'production',
      },

      // Restart behaviour
      max_restarts: 10,
      min_uptime: '5s',
      exp_backoff_restart_delay: 100,
      restart_delay: 1000,

      // Logs
      out_file: 'logs/pm2-out.log',
      error_file: 'logs/pm2-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
