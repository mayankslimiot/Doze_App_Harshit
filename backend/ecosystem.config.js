module.exports = {
  apps: [
    {
      name: "backend",
      script: "./server.js",
      cwd: "/home/dashboard/backend/dozemate-backend-main",
      watch: false,
      autorestart: true,
      env: {
        NODE_ENV: "production",
        PORT: 5000
      }
    }
  ]
}
