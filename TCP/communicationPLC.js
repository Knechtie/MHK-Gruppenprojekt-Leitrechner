/*jshint esversion: 6  */
/*jshint node: true */
"use strict";

//*****************************************
//Module Importieren
//*****************************************
const net = require('./TCP.js');
const db = require("../database/db.js");
const async = require("async");
const exec = require('child_process').exec;
const EventEmitter = require('events');
const nodeLog = require('../logging/logger.js');
const logConfig = require('../logging/loggerConfig.js');
var nodeLogging = new nodeLog("/media/usb/Logging", "nodeJS.txt", logConfig.general.format);

nodeLogging.logger.INFO("Logging in communicationPLC.js ok");

module.exports = class communicationPLC extends EventEmitter {

    constructor(host, webserverPort) {
        super();
        this.host = host;
        this.webserverPort = webserverPort;
        //Bind Sorgt dafür, dass der this Zeiger auf die Instanz dieser klassse zeigt, auch wenn die funktionen an andere Klassen übergeben werden.
        this.flexlinkReceive = this.flexlinkReceive.bind(this);
        this.productionReceive = this.productionReceive.bind(this);
        this.steinReceive = this.steinReceive.bind(this);
        this.warehouseReceive = this.warehouseReceive.bind(this);
        this.TIUhandler = this.TIUhandler.bind(this);

        this.FlexlinkBuffer = new net(2502, host, ">>>Flexlink Kommunikation<<<", this.flexlinkReceive);
        this.Production = new net(2501, host, ">>>Produktion Kommunikation<<<", this.productionReceive);
        this.SteinConveyor = new net(2503, host, ">>>Stein-Band Kommunikation<<<", this.steinReceive);
        this.Warehouse = new net(2504, host, ">>>Lager Kommunikation<<<", this.warehouseReceive);

        this.PDUwhenConnected();
        this.ADUwhenConnected();
    }

    //*****************************************
    //Empfangene Telegramme
    //*****************************************

    flexlinkReceive(msg) {
        this.msgType = communicationPLC.parseMsgType(msg);
        switch (this.msgType) {
            case "ADR":
                this.ADU(this.FlexlinkBuffer, "PUF");
                break;
            default:
                break;
        }
    }
    productionReceive(msg) {
        this.msgType = communicationPLC.parseMsgType(msg);
        switch (this.msgType) {
            case "ADR": //Article data request: Anfrage der Artikelproduktionsdaten
                this.ADU(this.Production, "PRD");
                break;
            default:
                break;
        }
    }
    steinReceive(msg) {
        this.msgType = communicationPLC.parseMsgType(msg);
        switch (this.msgType) {
            case "ADI": //Article data Inform: Statusmeldung über Artikel im Puffer
                this.ADI(msg);
                break;
            case "ADR": //Article data Request: Der Leitrechner sendet alle Artikeldaten wenn er diese Anfrage erhält.
                this.ADU(this.SteinConveyor, "KOM");
                break;
            case "PDR": //Anfrage Promotionsartikeldaten
                this.PDU(this.SteinConveyor, "KOM");
                break;
            case "ORI": //Auftragsstatusmeldung: Diese Meldung wird benutzt um den Leitrechner über den aktuellen Status eines Pakets zu informieren
                this.ORI(msg);
                break;
            default:
                break;
        }
    }
    warehouseReceive(msg) {
        this.msgType = communicationPLC.parseMsgType(msg);

        switch (this.msgType) {
            case "ORI": //Auftragsstatusmeldung: Diese Meldung wird benutzt um den Leitrechner über den aktuellen Status eines Pakets zu informieren
                this.ORI(msg);
                break;
            case "TIU":
                this.TIUreceive(msg);
                break;
            default:
                break;
        }
    }

    static parseMsgType(msg) {
        return msg.data.substr(0, 3);
    }


    //*****************************************
    //Hilfsfunktionen
    //*****************************************

    PDUwhenConnected() {
        this.SteinConveyor.on("connection", () => {
            this.PDU(this.SteinConveyor, "KOM");
        });
    }

    ADUwhenConnected() {
        this.FlexlinkBuffer.on("connection", () => {
            this.ADU(this.FlexlinkBuffer, "PUF");
        });
        this.Production.on("connection", () => {
            this.ADU(this.Production, "PRD");
        });
        this.SteinConveyor.on("connection", () => {
            this.ADU(this.SteinConveyor, "KOM");
        });
    }

    TIUhandler() {
        this.TIUsend(this.FlexlinkBuffer, "PUF");
        this.TIUsend(this.Production, "PRD");
        this.TIUsend(this.SteinConveyor, "KOM");
        this.TIUsend(this.Warehouse, "LAG");
    }

    formatDateTime(dateObj) {
        let date = dateObj;
        let year = date.getFullYear();
        let month = 1 + date.getMonth();
        let day = date.getDate();
        let hours = date.getHours();
        let minutes = date.getMinutes();
        let seconds = date.getSeconds();
        return `${year}${month.toString().padStart(2,"0")}${day.toString().padStart(2,"0")}${hours.toString().padStart(2,"0")}${minutes.toString().padStart(2,"0")}${seconds.toString().padStart(2,"0")}`;
    }

    //*****************************************
    //Funktionen für den Zugriff außerhalb dieser Datei
    //*****************************************

    sendOrderToPLC(orderID) {
        this.ORU(this.SteinConveyor, "KOM", orderID);
    }
    sendGiveawaysToPLC() {
        this.PDU(this.SteinConveyor, "KOM");
    }
    sendItemDataToPLC() {
        this.ADU(this.FlexlinkBuffer, "PUF");
        this.ADU(this.Production, "PRD");
        this.ADU(this.SteinConveyor, "KOM");
    }


    //*****************************************
    //Telegrammdefinitionen
    //*****************************************
    ADU(tcpInstance, clientID) {
        const text = 'SELECT "productID","deprecated","size", "drillParameters" FROM "Products" ORDER BY "productID" ASC';
        const values = [];
        db.query(text, values, (err, res) => {
            if (err) {
                nodeLogging.logger.ERROR(err.stack);
            }

            async.eachOfSeries(res.rows, function (element, key, callback) {

                const data = {
                    productID: element.productID.toString().padStart(6, "0"),
                    deprecated: Number(element.deprecated),
                    size: element.size,
                    drillParameters: `${Number(element.drillParameters[0])}${Number(element.drillParameters[1])}${Number(element.drillParameters[2])}${Number(element.drillParameters[3])}${Number(element.drillParameters[4])}`
                };

                let dataString = `ADU_${data.productID}${data.deprecated}${data.size}${data.drillParameters}`;

                tcpInstance.writeData(dataString, clientID, callback);

            }, function (err) {
                if (err) {
                    nodeLogging.logger.ERROR(err.message);
                }
            });
        });
    }
    
    TIUreceive(msg) {
        //TIU_20181206160350
        let year = msg.data.substr(4, 4);
        let month = msg.data.substr(8, 2);
        let day = msg.data.substr(10, 2);
        let hours = msg.data.substr(12, 2);
        let minutes = msg.data.substr(14, 2);
        let seconds = msg.data.substr(16, 2);
        var date = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

        exec(`sudo date --set '${date}'`, (error, stdout, stderr) => {
            if (error) {
                nodeLogging.logger.ERROR(`exec error: ${error}`);
                return;
            }
        });
        setInterval(this.TIUhandler, 60000);
    }

    TIUsend(tcpInstance, clientID) {
        let dataString = `TIU_${this.formatDateTime(new Date())}`;

        if (tcpInstance.clientConnected == true) {
            tcpInstance.writeData(dataString, clientID, () => {});
        }
    }

    PDU(tcpInstance, clientID) {
        const text = 'SELECT "giveawayShelfID","name","pictureURL" FROM "Giveaways" ORDER BY "giveawayShelfID" ASC';
        const values = [];
        db.query(text, values, (err, res) => {
            if (err) {
                nodeLogging.logger.ERROR(err.stack);
            }
            res.rows.forEach(element => {
                element.pictureURL = element.pictureURL.replace("IP", this.host);
                element.pictureURL = element.pictureURL.replace("PORT", this.webserverPort);
            });

            nodeLogging.logger.DEBUG(res.rows);
            async.eachOfSeries(res.rows, function (element, key, callback) {

                const data = {
                    giveawayShelfID: element.giveawayShelfID.toString().padStart(2, "0"),
                    name: element.name.padEnd(40, " "),
                    pictureURL: element.pictureURL.padEnd(100, " ")
                };

                let dataString = `PDU_${data.giveawayShelfID}${data.name}${data.pictureURL}`;

                tcpInstance.writeData(dataString, clientID, callback);

            }, function (err) {
                if (err) {
                    nodeLogging.logger.ERROR(err.message);
                }
            });
        });
    }


    ORU(tcpInstance, clientID, orderID) {
        const text = 'SELECT   "public"."Orders"."orderID","public"."Packages"."packageNr","public"."Packages"."totalNumberOfPackages", "public"."Orders"."orderDate", "public"."Orders"."deliveryDate", "public"."Customers"."firstName", "public"."Customers"."lastName", "public"."Customers"."streetAndNumber", "public"."Customers"."postalCode", "public"."Customers"."city", "public"."Packages"."giveawayShelfID", "public"."Packages"."totalWeight" FROM     "public"."Packages" INNER JOIN "public"."Orders"  ON "public"."Packages"."orderID" = "public"."Orders"."orderID" LEFT JOIN "public"."Customers"  ON "public"."Customers"."customerID" = "public"."Orders"."customerID" WHERE "public"."Orders"."orderID"=$1';
        const values = [orderID];
        db.query(text, values, (err, res) => {
            if (err) {
                nodeLogging.logger.ERROR(err.stack);
            }

            let formatDateTime = this.formatDateTime; //wird benötigt um die funktion unten in async.eachOfSeries aufrufen zu können

            nodeLogging.logger.DEBUG(res.rows);
            async.eachOfSeries(res.rows, function (element, key, callback) {
                nodeLogging.logger.DEBUG(this);

                let data = {
                    orderID: element.orderID.toString().padStart(6, "0"),
                    packageNr: element.packageNr.toString().padStart(2, "0"),
                    totalNumberOfPackages: element.totalNumberOfPackages.toString().padStart(2, "0"),
                    orderDate: formatDateTime(element.orderDate),
                    deliveryDate: formatDateTime(element.deliveryDate),
                    firstName: element.firstName.toString().padEnd(40, " "),
                    lastName: element.lastName.toString().padEnd(40, " "),
                    streetAndNumber: element.streetAndNumber.toString().padEnd(50, " "),
                    postalCode: element.postalCode.toString().padStart(5, " "),
                    city: element.city.toString().padEnd(50, " "),
                    itemData: "",
                    giveawayShelfID: "",
                    totalWeight: element.totalWeight.toString().padEnd(4, "0")
                };
                try {
                    data.giveawayShelfID = element.giveawayShelfID.toString().padStart(1, "0");
                } catch (error) {
                    data.giveawayShelfID = "0";
                }


                const text = 'SELECT "productID" FROM "OrderItems" WHERE ("orderID"=$1) AND ("packageNr"=$2) ORDER BY "productID" ASC';
                const values = [orderID, data.packageNr];
                db.query(text, values, (err, res) => {
                    if (err) {
                        nodeLogging.logger.ERROR(err.stack);
                    }
                    nodeLogging.logger.DEBUG(res.rows);

                    let productData = [{
                            productID: undefined,
                            count: undefined
                        },
                        {
                            productID: undefined,
                            count: undefined
                        },
                        {
                            productID: undefined,
                            count: undefined
                        },
                        {
                            productID: undefined,
                            count: undefined
                        },
                        {
                            productID: undefined,
                            count: undefined
                        }
                    ];

                    //Sucht die verwendeten productIDs und zählt die Anzahl der IDs im Paket
                    res.rows.forEach(function (queryRes, index) {
                        productData.some(function (dataEntry) {
                            if (queryRes.productID == dataEntry.productID) {
                                dataEntry.count += 1;
                                return true;
                            } else if (dataEntry.productID == undefined) {
                                dataEntry.productID = queryRes.productID;
                                dataEntry.count = 1;
                                return true;
                            }
                        });
                    });
                    productData.forEach(function (element) {
                        if (element.productID != undefined) {
                            data.itemData = data.itemData.concat("--", element.productID.toString().padStart(6, "0"), element.count.toString().padStart(1, "0"));
                        } else {
                            data.itemData = data.itemData.concat("--", "0".padStart(6, "0"), "0".padStart(1, "0"));
                        }
                    });
                    nodeLogging.logger.DEBUG(data);


                    let dataString = "ORU_";
                    var i;
                    //Alle Werte von data aneinanderhängen:
                    for (i in data) {
                        dataString += data[i];
                    }
                    nodeLogging.logger.DEBUG(dataString);
                    tcpInstance.writeData(dataString, clientID, callback);
                });
            });
        });
    }

    ORI(msg) {
        const data = {
            orderID: parseInt(msg.data.substr(4, 6)),
            packageNr: parseInt(msg.data.substr(10, 2)),
            statusText: undefined,
            statusCode: parseInt(msg.data.substr(12, 2)),
            lastUpdate: `${msg.data.substr(14, 4)}-${msg.data.substr(18, 2)}-${msg.data.substr(20, 2)} ${msg.data.substr(22, 2)}:${msg.data.substr(24, 2)}:${msg.data.substr(26, 2)}`
        };
        switch (data.statusCode) {
            case 10:
                data.statusText = "Paket in Warteschlange";
                break;
            case 20:
                data.statusText = "Paket in Bearbeitung am HAP";
                break;
            case 21:
                data.statusText = "Bearbeitung am HAP abgeschlossen => Qualitätskontrolle";
                break;
            case 22:
                data.statusText = "in Nachbearbeitung";
                break;
            case 30:
                data.statusText = "Unterwegs zu Lager/Versand";
                break;
            case 40:
                data.statusText = "Eingelagert";
                break;
            case 50:
                data.statusText = "wird versendet";
                break;
            case 60:
                data.statusText = "versendet";
                break;
            case 99:
                data.statusText = "Paket gelöscht";
                break;
            default:
                break;
        }
        const text = 'UPDATE "PackagesProductionStatus" SET "statusText"=$1, "statusCode"=$2, lastUpdate=$3" WHERE "orderID"=$4 AND "packageNr"=$5';
        const values = [data.statusText, data.statusCode, data.lastUpdate, data.orderID, data.packageNr];
        db.query(text, values, (err, res) => {
            if (err) {
                nodeLogging.logger.ERROR(err.stack);
            }
            this.emit("refreshWebsiteProducts");
        });
    }

    ADI(msg) {
        nodeLogging.logger.DEBUG(msg);
        const data = {
            productID: parseInt(msg.data.substr(4, 6)),
            countOnStock: parseInt(msg.data.substr(10, 2))
        };
        nodeLogging.logger.DEBUG(data);
        const text = 'UPDATE "Products" SET "countOnStock"=$1 WHERE "productID"=$2';
        const values = [data.countOnStock, data.productID];
        db.query(text, values, (err, res) => {
            if (err) {
                nodeLogging.logger.ERROR(err.stack);
            }
            this.emit("refreshWebsiteProducts");
        });
    }
};