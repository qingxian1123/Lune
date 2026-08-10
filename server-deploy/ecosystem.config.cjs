const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'lune-server',
      cwd: __dirname,
      script: path.join(__dirname, 'dist', 'main.js'),
      exec_mode: 'fork',
      instances: 1,
      watch: false,
      autorestart: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,
      max_memory_restart: '512M',
      kill_timeout: 15000,
      listen_timeout: 15000,
      time: true,
      merge_logs: true,
      out_file: path.join(__dirname, 'logs', 'lune-server.out.log'),
      error_file: path.join(__dirname, 'logs', 'lune-server.error.log'),
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
