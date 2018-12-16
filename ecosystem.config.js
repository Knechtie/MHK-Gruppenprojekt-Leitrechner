//!!!! zum Updaten: 
// pm2 restart ecosystem.config.js --update-env
// pm2 save

module.exports = {
  apps : [
    {
      name      : 'Server',
      script    : 'server.js',
      watch     :  true,
      env: {
        NODE_ENV: 'development'
      }, 
      env_production : {
        NODE_ENV: 'production'
      }
    },
    {
      name      : 'cloudCmd',
      script    : 'node_modules/cloudcmd/bin/cloudcmd.js',
      watch     :  true,
      env: {
        NODE_ENV: 'development'
      },
      env_production : {
        NODE_ENV: 'production'
      }
    },
    {
      name      : 'frontailPLC',
      script    : 'node_modules/frontail/bin/frontail',
      args      : '/media/usb/Logging/PLC-logging.txt -p 9002 -n 500',
      watch     :  true,
      env: {
        NODE_ENV: 'development'
      },
      env_production : {
        NODE_ENV: 'production'
      }
    },
    {
      name      : 'frontailNodeJS',
      script    : 'node_modules/frontail/bin/frontail',
      args      : '/media/usb/Logging/nodeJS.txt -p 9003 -n 500',
      watch     :  true,
      env: {
        NODE_ENV: 'development'
      },
      env_production : {
        NODE_ENV: 'production'
      }
    }
  ],

  deploy : {
    production : {
      user : 'node',
      host : '212.83.163.1',
      ref  : 'origin/master',
      repo : 'git@github.com:repo.git',
      path : '/var/www/production',
      'post-deploy' : 'npm install && pm2 reload ecosystem.config.js --env production'
    }
  }
};
