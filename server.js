/*jshint node: true */
/*jshint esversion: 6 */


//*****************************************
//Module Importieren
//*****************************************
const express = require('express');
const app = express();
const io = require('socket.io')(server);
const os = require('os');
const bodyParser = require('body-parser');
const fs = require("fs");
const exec = require('child_process').exec;
const db = require("./database/db.js");
const async = require("async");
const comPLC = require('./TCP/communicationPLC.js');
const PLCLogging = require('./logging/loggerPLC.js');
const logger = require('./logging/logger.js');
const logConfig = require('./logging/loggerConfig.js');
const isInstalledGlobally = require('is-installed-globally');
const USV = require("./usv/usvSystemShutdown");


//*****************************************
//Initialisierungen
//*****************************************

//Logging:
var nodeLogging = new logger("/media/usb/Logging", "nodeJS.txt", logConfig.general.format);
nodeLogging.logger.INFO("Logging in server.js ok");

//Unterbrechungsfreie Spannungsversorgung:
usv = new USV();

//Datenbank:
db.init(() => {
    db.automaticDBCleanup();
});


//Webserver:
const date = new Date();
nodeLogging.logger.INFO('Server Startet um ' + date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds() + ' Uhr');

app.use(express.static('website'));

if (!isInstalledGlobally && !fs.existsSync(__dirname + "/node_modules/bootstrap")) {
    nodeLogging.logger.DEBUG("Lokal installiert");
    app.use('/node_modules', express.static("../"));
} else {
    nodeLogging.logger.DEBUG("Global installiert oder Pakete alle in node_modules des pakets fstaup17-gruppenprojekt");
    app.use('/node_modules', express.static('node_modules'));
}

var IPlist = [];
try {
    //Versucht eine IPv4 Adresse am RJ45-Anschluss zu finden und fügt diese in eine Liste ein
    os.networkInterfaces().eth0.forEach(element => {
        if (element.family == 'IPv4') {
            IPlist.push(element.address);
        }
    });
} catch (error) {
    //Wenn keine IPv4 Adresse am RJ45-Anschluss verfügbar, mit WLAN versuchen
    os.networkInterfaces().wlan0.forEach(element => {
        if (element.family == 'IPv4') {
            IPlist.push(element.address);
        }
    });
}

var raspberryIP = IPlist[0];
const webserverPort = 3000;

var server = app.listen(webserverPort, raspberryIP, () => {
    nodeLogging.logger.INFO('Webserver ist bereit...');
    nodeLogging.logger.INFO("Die IP ist: " + server.address().address);
});

//Kommunikationsbaustein für PLC-Kommunikation:
var communicationPLC = new comPLC(raspberryIP, webserverPort);
//TCP-Logging der PLCs:
var PLCLog = new PLCLogging(raspberryIP, "/media/usb/Logging", "PLC-Logging.txt");


//*****************************************
//Web-Socket Events
//*****************************************

io.on('connection', function (socket) {
    nodeLogging.logger.INFO('Verbindung mit Client aufgebaut');
    db.queryProducts((productData) => {
        socket.emit('loadProducts', productData);
    });

    socket.on('disconnect', function () {
        nodeLogging.logger.INFO('Verbindung mit Client beendet');
    });

    socket.on("dateTime", function (data) {
        //Zeitinformation von Client erhalten

        var date = new Date(data);

        var dateTime = {
            dayOfMonth: date.getDate(),
            month: date.getMonth() + 1,
            year: date.getFullYear(),
            hours: date.getHours(),
            minutes: date.getMinutes(),
            seconds: date.getSeconds()
        };

        nodeLogging.logger.DEBUG(dateTime);

        //Systemzeit des Raspberry Pis aktualisieren
        exec("sudo date --set '" + dateTime.year + "-" + dateTime.month + "-" + dateTime.dayOfMonth + " " + dateTime.hours + ":" + dateTime.minutes + ":" + dateTime.seconds + "'", (error, stdout, stderr) => {
            if (error) {
                nodeLogging.logger.ERROR(`exec error: ${error}`);
                return;
            }
        });
    });

    socket.on('createProduct', function (msg) {
        nodeLogging.logger.DEBUG(msg);
        db.createProduct(msg.productName, msg.description, msg.size, msg.drillParameters, msg.weight, msg.price, 0, () => {
            emitloadProductsAdmin();
            communicationPLC.sendItemDataToPLC();
        });
    });
    socket.on('editProduct', function (msg) {
        nodeLogging.logger.DEBUG(msg);
        db.editProduct(msg.productID, msg.deprecated, msg.delete, () => {
            emitloadProductsAdmin();
            communicationPLC.sendItemDataToPLC();
        });

    });
    socket.on('getProductsAdmin', function (msg) {
        nodeLogging.logger.DEBUG("Produkte auf Adminseite laden...");
        emitloadProductsAdmin();
    });
    socket.on('getOrdersAdmin', function (msg) {
        nodeLogging.logger.DEBUG("Orders auf Adminseite laden...");
        emitloadOrdersAdmin();
    });

    socket.on('createGiveaway', function (msg) {
        async.series([
            function (callback) {
                handleGiveawayPicture(msg, msg.giveawayShelfID, 'store', (relativeFilePath) => {
                    msg.relativeFilePath = relativeFilePath;
                    callback();
                });
            },
            function (callback) {
                db.createGiveaway(msg.giveawayShelfID, msg.name, msg.weight, msg.relativeFilePath, (err) => {
                    if (err != undefined) {}
                    callback();
                });
            },
            function (callback) {
                emitloadGiveawaysAdmin();
                communicationPLC.sendGiveawaysToPLC();
                callback();
            }
        ]);
    });
    socket.on('editGiveaway', function (msg) {
        nodeLogging.logger.DEBUG(msg);
        db.editGiveaway(msg.giveawayShelfID, msg.delete, emitloadGiveawaysAdmin);
        handleGiveawayPicture(undefined, msg.giveawayShelfID, 'delete', function () {});
        communicationPLC.sendGiveawaysToPLC();
    });
    socket.on('getGiveawaysAdmin', function (msg) {
        nodeLogging.logger.DEBUG("Giveaways auf Adminseite laden...");
        emitloadGiveawaysAdmin();
    });
    socket.on('testmodus', function (msg) {
        socket.emit("testData", randomCustomer());
    });
    socket.on('dashboardData', function (msg) {
        emitloadDashboardData();
    });
    socket.on('raspberryConfig', function (msg) {
        if (msg == "shutdown") {
            exec("sudo shutdown now", (error, stdout, stderr) => {
                if (error) {
                    console.error(`exec error: ${error}`);
                    return;
                }
            });
        } else if (msg == "reboot") {
            exec("sudo reboot", (error, stdout, stderr) => {
                if (error) {
                    console.error(`exec error: ${error}`);
                    return;
                }
            });
        }
    });

    socket.on('sendOrder', function (data) {
        nodeLogging.logger.DEBUG(data);
        data.deliveryDate = new Date(data.deliveryDate);
        data.deliveryDate += 1000 * 60 * 60;
        data.deliveryDate = new Date(data.deliveryDate);

        const Order = {
            orderID: undefined
        };
        async.series([
            function (callback) {
                db.websiteOrderHandler(data, (orderID) => {
                    Order.orderID = orderID;
                    callback();
                });
            },
            function (callback) {
                emitloadOrdersAdmin();
                emitloadDashboardData();
                communicationPLC.sendOrderToPLC(Order.orderID);
                callback();
            }
        ]);
    });
    socket.on("deleteOrder", function (orderID) {
        db.deleteOrder(orderID, () => {
            emitloadOrdersAdmin();
        });
    });
    socket.on("deleteAllOrders", function () {
        db.deleteAllOrders(() => {
            emitloadOrdersAdmin();
        });
    });
});

communicationPLC.on("refreshWebsiteProducts", function () {
    refreshStock();
    emitloadProductsAdmin();
});

function emitloadProductsAdmin() {
    db.queryProducts((productData) => {
        io.emit('loadProductsAdmin', productData);
    });
}

function emitloadOrdersAdmin() {
    db.queryAllOrders((orders) => {

        io.emit('loadOrdersAdmin', orders);
    });
}

function emitloadGiveawaysAdmin() {
    db.queryGiveaways((data) => {
        data.forEach(element => {
            element.pictureURL = element.pictureURL.replace("IP", raspberryIP);
            element.pictureURL = element.pictureURL.replace("PORT", webserverPort);
        });
        io.emit('loadGiveawaysAdmin', data);
    });
}

function emitloadDashboardData() {
    db.queryStats((data) => {
        io.emit("loadDashboardData", data);
    });
}
db.eventEmitter.on('stockChanged', () => {
    refreshStock();
});

function refreshStock() {
    nodeLogging.logger.DEBUG("Refresh stock");
    db.queryProducts((productData) => {
        io.emit('refreshStock', productData);
    });
}


//*****************************************
//Giveaway Bild speichern
//*****************************************
function handleGiveawayPicture(msg, filename, option, callback) {
    var customDirName = "admin/giveawayPictures";
    var relativeFilePath = customDirName + "/" + filename + ".jpg";

    switch (option) {
        case 'delete':
            nodeLogging.logger.DEBUG("Lösche Bild " + filename);
            fs.unlink(__dirname + "/website/" + relativeFilePath, (err) => {
                if (err) {
                    nodeLogging.logger.DEBUG(`Warnung: Es war kein bild für Giveaway ${filename} vorhanden!`);
                }
            });
            break;
        case 'store':

            nodeLogging.logger.DEBUG("Giveaway Bild verarbeiten...");

            var base64Data = decodeBase64Image(msg.imageData);

            async.series([
                function (callback) {
                    if (!fs.existsSync(__dirname + "/website/" + customDirName)) {
                        //Erstelle Verzeichnis wenn es noch nicht vorhanden
                        fs.mkdir(__dirname + "/website/" + customDirName, function (e) {
                            if (!e) {
                                console.log("Created new directory without errors.");
                                callback();
                            } else {
                                console.log("Exception while creating new directory....");
                                throw e;
                            }
                        });
                    } else {
                        callback();
                    }
                },
                function (callback) {
                    //Datei speichern
                    fs.writeFile(__dirname + "/website/" + relativeFilePath, base64Data.data, function (err) {
                        if (err) {
                            console.log('ERROR:: ' + err);
                            throw err;
                        }
                        callback();
                    });
                }
            ]);

            break;
    }
    nodeLogging.logger.DEBUG(relativeFilePath);
    callback(relativeFilePath);
}


function decodeBase64Image(dataString) {
    var matches = dataString.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/),
        response = {};
    if (matches.length !== 3) {
        return new Error('Invalid input string');
    }
    response.type = matches[1];
    response.data = new Buffer(matches[2], 'base64');
    return response;
}

//*****************************************
//Login verarbeiten
//*****************************************
var jsonParser = bodyParser.json();

app.post("/login", jsonParser, (request, response) => {
    var data = request.body;

    if (typeof data.hash === "undefined") {
        db.getSaltOfUser(data.username, (salt) => {
            if (typeof salt !== "undefined") {
                response.status(200).send(salt);
            } else {
                response.status(200).send("0");
            }
        });
    } else {
        db.compareHashOfUser(data.username, data.hash, (ok) => {
            if (ok) {
                console.log("Hash ok!");
                response.sendFile(__dirname + "/website/admin/bodyMain.html");
            } else {
                console.log("Hash nok");
                response.status(200).send("0");
            }
        });
    }
});


//*****************************************
//Zufällige Kundendaten
//*****************************************
var customerData = JSON.parse(fs.readFileSync('data/kundendaten.json'));

function randomCustomer() {
    var randomCustomerNumber = getRndInteger(0, 999); //Zufallszahl von 0 bis 999
    var randomDeliveryDate = new Date();
    randomDeliveryDate.setDate(date.getDate() + getRndInteger(0, 5));

    var randomCustomer = {
        firstName: customerData[randomCustomerNumber].Vorname,
        lastName: customerData[randomCustomerNumber].Nachname,
        streetAndNumber: customerData[randomCustomerNumber].Straße,
        postalCode: customerData[randomCustomerNumber].PLZ,
        city: customerData[randomCustomerNumber].Stadt
    };
    return randomCustomer;
}

function getRndInteger(min, max) { //einschließlich min max
    return Math.floor(Math.random() * (max - min + 1)) + min;
}