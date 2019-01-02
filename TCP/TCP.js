/*jshint esversion: 6  */
/*jshint node: true */
"use strict";

//*****************************************
//Module Importieren
//*****************************************
const net = require('net');
const nodeLog = require('../logging/logger.js');
const logConfig = require('../logging/loggerConfig.js');

const nodeLogging = new nodeLog("/media/usb/Logging", "nodeJS.txt", logConfig.general.format);
nodeLogging.logger.INFO("Logging in TCP.js ok");

module.exports = class TCPserver extends net.Server {
    constructor(port, host, symbolicName = "", dataEventListener = function () {}) {
        //Vertauschen der optionalen Parameter abfangen:
        if (typeof symbolicName === "function") {
            var tmpData1 = dataEventListener;
            dataEventListener = symbolicName;
            if (typeof tmpData1 === "string") {
                symbolicName = tmpData1;
            } else {
                symbolicName = "";
            }
        }

        super(TCPserver.connectionListener);
        this.on('newData', dataEventListener);
        this.port = port;
        this.host = host;
        this.symbolicName = symbolicName;
        this.messageCounter = 1;
        this.msgBuffer = "";
        this.listen();
        this.headByteLength = 18;
    }

    listen() {
        this.server = super.listen(this.port, this.host, () => {
            nodeLogging.logger.INFO(`TCP-Server ${this.symbolicName} gestartet (${super.address().family}: ${super.address().address} Port: ${super.address().port})`);
            super.maxConnections = 1;
            super.on("connection", (socket) => {
                nodeLogging.logger.INFO(`\n############--Client Verbunden mit TCP-Server ${this.symbolicName} ${this.host}:${this.port}--############\nAdresse Client: ${socket.remoteAddress}:${socket.remotePort}\n#########################################################################################################`);
                this.lastSocket = socket;
                this.clientConnected = true;
            });
        });
    }

    prepareHeadSend(data, clientID) {
        return `##${Buffer.byteLength(data,"latin1").toString().padStart(4,"0")}LEI->${clientID}${this.messageCounter.toString().padStart(4,"0")}`;
    }

    parseHeadReceive(messageBuffer) {
        return {
            head: {
                dataLength: parseInt(this.msgBuffer.substr(2, 4)),
                clientID: this.msgBuffer.substr(6, 3),
                serverID: this.msgBuffer.substr(11, 3),
                msgCounter: parseInt(this.msgBuffer.substr(14, 4))
            },
            data: undefined
        };
    }

    writeData(data, clientID, callback, encoding = "latin1") {

        var resultData = this.prepareHeadSend(data, clientID) + data;

        this.server.getConnections((err, count) => {
            if (count == 1) {
                nodeLogging.logger.DEBUG(resultData);
                this.lastSocket.write(resultData,encoding, callback);
                this.messageCounter += 1;
            } else {
                try {
                    throw err; //weiß noch nicht was da überhaupt auftreten kann
                } catch (error) {
                    var errMsg = `Kann keine Daten senden, da keine Clients mit TCP-Server ${this.symbolicName} ${this.host}:${this.port} verbunden!!`; //weiß noch nicht was dann passieren soll zum Abfangen
                    nodeLogging.logger.ERROR(errMsg);
                }
            }
        });
    }

    static connectionListener(socket) {
        socket.setEncoding('latin1');

        socket.on('end', (data) => {
            nodeLogging.logger.INFO(`\n############--Client getrennt von TCP-Server ${this.symbolicName} ${this.host}:${this.port}--############\nAdresse Client: ${socket.remoteAddress}:${socket.remotePort}\n########################################################################################################`);
            this.clientConnected = false;
        });
        socket.on('data', (data) => {
            this.parseData(data);
        });
        socket.on('error', (error) => {
            try {
                throw error;
            } catch (error) {
                this.clientConnected = false;
                nodeLogging.logger.ERROR(`Server: ${this.symbolicName} ${this.host}:${this.port} | Cient: ${socket.remoteAddress}:${socket.remotePort} | Fehler: ${error.errno}`);
            }
        });
    }

    parseData(data) {
        nodeLogging.logger.DEBUG(`Empfangene Rohdaten: ${data}`);
        this.msgBuffer = this.msgBuffer.concat(data);

        //Sucht nach Trennzeichen ##
        if (this.msgBuffer.search("##") != -1) {
            var msgAt = this.msgBuffer.search('##');

            if (msgAt != 0) {
                //Entfernt alles vor dem Trennzeichen ## wenn es nicht am Anfang des Puffers steht
                this.msgBuffer = this.msgBuffer.slice(this.msgBuffer.length * -1 + msgAt);
                nodeLogging.logger.DEBUG(this.msgBuffer + "\n------");
            }

            //Prüfen ob der Kopf komplett empfangen wurde.
            if (this.msgBuffer.length >= this.headByteLength) {
                //DEBUGrmationen aus dem Kopf extrahieren
                var Message = this.parseHeadReceive();

                nodeLogging.logger.DEBUG("Länge Kopf + Nutzdaten: " + (this.headByteLength + Message.head.dataLength));

                //Prüfen ob genug potenzielle Nutzdaten verfügbar sind
                if (this.msgBuffer.length >= this.headByteLength + Message.head.dataLength) {
                    var nextMsgAt = this.msgBuffer.indexOf("#", 2); //Noch ein weiteres Telegramm da? (Nein -> Wert -1) (Es wird erst ab index 2 gesucht)

                    nodeLogging.logger.DEBUG("Nächste Nachricht an Stelle: " + (nextMsgAt + 1));

                    if (nextMsgAt == -1) {
                        nodeLogging.logger.DEBUG("+++++Telegramm OK KEINES folgt++++++");
                        Message.data = this.msgBuffer.substr(this.headByteLength, Message.head.dataLength);
                        this.emit('newData', Message);
                        this.msgBuffer = "";
                    } else if (nextMsgAt + 1 > this.headByteLength + Message.head.dataLength) {
                        nodeLogging.logger.DEBUG("+++++Telegramm OK aber eins folgt++++++");
                        Message.data = this.msgBuffer.substr(this.headByteLength, Message.head.dataLength);
                        this.emit('newData', Message);
                        nodeLogging.logger.DEBUG(this.msgBuffer);
                        this.msgBuffer = this.msgBuffer.slice(this.headByteLength + Message.head.dataLength);
                        nodeLogging.logger.DEBUG(this.msgBuffer);
                        nodeLogging.logger.DEBUG("------!!Rekursiver aufruf von parseData()!!-----");
                        this.parseData("");
                    } else if (nextMsgAt + 1 <= this.headByteLength + Message.head.dataLength) {
                        //zwischendrin taucht ein Telegram auf-> Telegramm verwerfen durch löschen von ## und rekusivem Aufruf dieser Funktion (löscht dann Datenmüll)
                        this.msgBuffer = this.msgBuffer.slice(2);
                        nodeLogging.logger.DEBUG("------!!Rekursiver aufruf von parseData()!!-----");
                        nodeLogging.logger.DEBUG("------TELEGRAMM WIRD VERWORFEN-----");
                        this.parseData("");
                    }
                }
            }
        }
    }
};