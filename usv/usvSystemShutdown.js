/*jshint node: true */
/*jshint esversion: 6 */

const Gpio = require('onoff').Gpio;


var nodeLogging = require('../logging/logger.js');
var logConfig = require('../logging/loggerConfig.js');
var nodeLogging = new nodeLogging("/media/usb/Logging", "nodeJS.txt", logConfig.general.format);

nodeLogging.logger.INFO("Logging in usvSystemShutdown.js ok");

const execSync = require('child_process').execSync;


module.exports = class USV {

  constructor() {
    try {
      this.tPin = new Gpio(24, 'in', 'both', {
        debounceTimeout: 10
      });
      this.shutdownHandler();
    } catch (error) {
      console.log("Fehler beim Zugriff auf GPIO im USV-Modul");
    }
  }

  shutdownHandler() {
    console.log(this.tPin.readSync());
    this.tPin.watch((err, value) => {
      nodeLogging.logger.INFO(`USV-Pin Status: ${value}`);
      if (value == 1) {
        nodeLogging.logger.INFO(`USV-Pin Status: ${value}`);
        nodeLogging.logger.INFO(`Herunterfahren eingeleitet`);
        setTimeout(this.shutdownCmd, 1000);
      }
      if (err) {
        throw err;
      }
    });
  }

  shutdownCmd() {
    execSync("sudo shutdown -h now");
  }
};