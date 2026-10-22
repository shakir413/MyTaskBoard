// PM2 keeps Node running forever: restarts it on crash and on server reboot.
module.exports = {
  apps: [
    {
      name: "taskboard-api",
      script: "src/server.js",
      cwd: "/home/ec2-user/app/backend",
      env: { NODE_ENV: "production" },
    },
  ],
};
