module.exports = {
  apps: [
    {
      name: 'techbes-backend',
      script: './server.js',
      cwd: __dirname,
      instances: 1, // Using single instance or max depending on socket.io redis adapter
      exec_mode: 'fork', // Socket.IO requires sticky sessions or redis adapter in cluster mode
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
