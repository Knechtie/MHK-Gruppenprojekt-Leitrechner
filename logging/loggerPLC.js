/*jshint esversion: 6  */
/*jshint node: true */
"use strict";

var TCPlogMsg = require('../TCP/TCPlogMsg.js');
var Logger = require("./logger.js");
var logConfig = require('./loggerConfig.js');

var nodeLogging = require('../logging/logger.js');
var logConfig = require('../logging/loggerConfig.js');
var nodeLogging = new nodeLogging("/media/usb/Logging", "nodeJS.txt", logConfig.general.format);

nodeLogging.logger.INFO("Logging in loggerPLC.js ok");

module.exports = class TCPlogging extends Logger {

    constructor(host, storagePath, filename) {
        super(storagePath, filename, logConfig.PLC.format);
        //Bind Sorgt dafür, dass der this Zeiger auf die Instanz dieser klassse zeigt, auch wenn die funktionen an andere Klassen übergeben werden.
        this.flexlinkReceive = this.flexlinkReceive.bind(this);
        this.productionReceive = this.productionReceive.bind(this);
        this.steinReceive = this.steinReceive.bind(this);
        this.warehouseReceive = this.warehouseReceive.bind(this);

        this.FlexlinkBuffer = new TCPlogMsg(2002, host, ">>>Flexlink Logging<<<", this.flexlinkReceive);
        this.Production = new TCPlogMsg(2001, host, ">>>Produktion Logging<<<", this.productionReceive);
        this.SteinConveyor = new TCPlogMsg(2003, host, ">>>Stein-Band Logging<<<", this.steinReceive);
        this.Warehouse = new TCPlogMsg(2004, host, ">>>Lager Logging<<<", this.warehouseReceive);
    }


    plcLog(msg, level) {
        this.logger.log({
            level: level,
            message: msg.data,
            plcName: msg.head.clientID,
            timestamp: `${msg.head.year}-${msg.head.month.toString().padStart(2,"0")}-${msg.head.day.toString().padStart(2,"0")} ${msg.head.hours.toString().padStart(2,"0")}:${msg.head.minutes.toString().padStart(2,"0")}:${msg.head.seconds.toString().padStart(2,"0")}:${msg.head.milliseconds.toString().padStart(4,"0")}`
        });
    }

    chooseLogLevel(msg) {
        switch (msg.head.logLevel) {
            case "ERR":
                this.plcLog(msg, "ERROR");
                break;
            case "WAR":
                this.plcLog(msg, "WARNING");
                break;
            case "INF":
                this.plcLog(msg, "INFO");
                break;
            case "DEB":
                this.plcLog(msg, "DEBUG");
                break;
            default:
                this.plcLog(" *** Kein Loglevel angegeben *** " + msg, "ERROR");
                break;
        }
    }


    flexlinkReceive(msg) {
        this.chooseLogLevel(msg);
    }
    productionReceive(msg) {
        this.chooseLogLevel(msg);
    }
    steinReceive(msg) {
        this.chooseLogLevel(msg);
    }
    warehouseReceive(msg) {
        this.chooseLogLevel(msg);
    }
};