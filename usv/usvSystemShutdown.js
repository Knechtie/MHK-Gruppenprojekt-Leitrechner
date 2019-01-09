/*jshint node: true */
/*jshint esversion: 6 */

const Gpio = require('onoff').Gpio;
const execSync = require('child_process').execSync;
const nodeLog = require('../logging/logger.js');
const logConfig = require('../logging/loggerConfig.js');

var nodeLogging = new nodeLog("/media/usb/Logging", "nodeJS.txt", logConfig.general.format);

nodeLogging.logger.INFO("Logging in usvSystemShutdown.js ok");


module.exports = class USV {

  constructor(pin) {
    try {
      this.tPin = new Gpio(pin, 'in', 'both', {
        debounceTimeout: 10
      });
      this.shutdownHandler();
    } catch (error) {
      nodeLogging.logger.ERROR("Fehler beim Zugriff auf GPIO im USV-Modul");
    }
  }

  shutdownHandler() {
    nodeLogging.logger.DEBUG(this.tPin.readSync());
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