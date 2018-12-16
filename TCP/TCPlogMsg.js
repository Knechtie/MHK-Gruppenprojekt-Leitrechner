/*jshint esversion: 6  */
/*jshint node: true */
"use strict";

var TCPserver = require('./TCP.js');
const EventEmitter = require('events');


module.exports = class TCPlogging extends TCPserver {

    constructor(port, host, symbolicName = "", dataEventListener = function () {}) {
        super(port, host,symbolicName,dataEventListener);
        
        //##0005PUFINF201811072152551111
        //##Nutzdatenbytes:ClientID:Loglevel:Jahr:Monat:Tag:Stunden:Minuten:Sekunden:Millisekunden
 
        this.headByteLength = 29;

        //Kopfdefinition der geerbten TCP Klasse überschrieben um an Log-Funktionen anzupassen
        this.parseHeadReceive = function(messageBuffer){
            return { 
                head: { 
                    dataLength: parseInt(this.msgBuffer.substr(2, 4)),
                    clientID: this.msgBuffer.substr(6, 3),
                    logLevel: this.msgBuffer.substr(9, 3),
                    year: parseInt(this.msgBuffer.substr(12, 4)),
                    month: parseInt(this.msgBuffer.substr(16, 2)),
                    day: parseInt(this.msgBuffer.substr(18, 2)),
                    hours: parseInt(this.msgBuffer.substr(20, 2)),
                    minutes: parseInt(this.msgBuffer.substr(22, 2)),
                    seconds: parseInt(this.msgBuffer.substr(24, 2)),
                    milliseconds: parseInt(this.msgBuffer.substr(26, 3)) //0-999
                },
                data: undefined
            };
        };
    }
};