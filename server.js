/*jshint node: true */
/*jshint esversion: 6 */
var express = require('express');
var app = express();
var os = require('os');
var bodyParser = require('body-parser');
var fs = require("fs");
const exec = require('child_process').exec;
var db = require("./database/db.js");
var async = require("async");


var contents = fs.readFileSync('data/kundendaten.json');
var customerData = JSON.parse(contents);


var communicationPLC = require('./TCP/communicationPLC.js');
var PLCLogging = require('./logging/loggerPLC.js');


var nodeLogging = require('./logging/logger.js');
var logConfig = require('./logging/loggerConfig.js');
var nodeLogging = new nodeLogging("/media/usb/Logging", "nodeJS.txt", logConfig.general.format);

nodeLogging.logger.INFO("Logging in server.js ok");

const isInstalledGlobally = require('is-installed-globally');


var usv = require("./usv/usvSystemShutdown");

usv = new usv();

db.init(() => {
   db.automaticDBCleanup();
});

const date = new Date();
console.log('Server Startet um ' + date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds() + ' Uhr');

app.use(express.static('website'));

if (!isInstalledGlobally && !fs.existsSync(__dirname + "/node_modules/bootstrap")) {
    console.log("Lokal installiert");
    app.use('/node_modules', express.static("../"));
} else {
    console.log("Global installiert oder Pakete alle in node_modules des pakets fstaup17-gruppenprojekt");
    app.use('/node_modules', express.static('node_modules'));
}

var IPlist = [];
//console.log(os.networkInterfaces())
try {
    os.networkInterfaces().eth0.forEach(element => {
        if (element.family == 'IPv4') {
            IPlist.push(element.address);
        }
    });
} catch (error) {
    os.networkInterfaces().wlan0.forEach(element => {
        if (element.family == 'IPv4') {
            IPlist.push(element.address);
        }
    });
}


//var raspberryIP = os.networkInterfaces().eth0[1].address; //evtl anpassen wenn sich IPs des interface ändern
var raspberryIP = IPlist[0];
//console.log(os.networkInterfaces())
//console.log(IPlist)

const webserverPort = 3000;


var server = app.listen(webserverPort, raspberryIP, () => {
    console.log('listening...');
    var datum = new Date();
    console.log(datum);

    datum.setDate(32);
    datum.setHours(date.getHours() + 4);
    console.log(datum);
    console.log("Die IP ist: " + server.address().address);

    console.log(os.hostname());
});


var communicationPLC = new communicationPLC(raspberryIP, webserverPort);
PLCLogging = new PLCLogging(raspberryIP, "/media/usb/Logging", "PLC-Logging.txt");

var io = require('socket.io')(server);


io.on('connection', function (socket) {
    console.log('a user connected');
    db.queryProducts((productData) => {
        socket.emit('loadProducts', productData);
    });

    socket.on('disconnect', function () {
        console.log('user disconnected');
    });

    socket.on("dateTime", function (data) {
        console.log(data);
        var date = new Date(data);

        var dateTime = {
            dayOfMonth: date.getDate(),
            month: date.getMonth() + 1,
            year: date.getFullYear(),
            hours: date.getHours(),
            minutes: date.getMinutes(),
            seconds: date.getSeconds()
        };

        console.log(dateTime);

        exec("sudo date --set '" + dateTime.year + "-" + dateTime.month + "-" + dateTime.dayOfMonth + " " + dateTime.hours + ":" + dateTime.minutes + ":" + dateTime.seconds + "'", (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                return;
            }
            console.log(`stdout: ${stdout}`);
            console.log(`stderr: ${stderr}`);
        });
    });

    socket.on('createProduct', function (msg) {
        console.log(msg);
        db.createProduct(msg.productName, msg.description, msg.size, msg.drillParameters, msg.weight, msg.price, 0, () => {
            emitloadProductsAdmin();
            communicationPLC.sendItemDataToPLC();
        });
    });
    socket.on('editProduct', function (msg) {
        console.log(msg);
        db.editProduct(msg.productID, msg.deprecated, msg.delete, () => {
            emitloadProductsAdmin();
            communicationPLC.sendItemDataToPLC();
        });

    });
    socket.on('getProductsAdmin', function (msg) {
        console.log("Produkte laden");
        emitloadProductsAdmin();
    });
    socket.on('getOrdersAdmin', function (msg) {
        console.log("Orders laden");
        emitloadOrdersAdmin();
    });


    socket.on('createGiveaway', function (msg) {
        async.series([
            function (callback) {
                console.log("Funktion 1");
                handleGiveawayPicture(msg, msg.giveawayShelfID, 'store', (relativeFilePath) => {
                    msg.relativeFilePath = relativeFilePath;
                    callback();
                });
            },
            function (callback) {
                console.log("Funktion 2");
                db.createGiveaway(msg.giveawayShelfID, msg.name, msg.weight, msg.relativeFilePath, (err) => {
                    if (err != undefined) {
                        console.log("feeeeehler!!!!########");
                    }
                    callback();
                });
            },
            function (callback) {
                console.log("Funktion 3");
                emitloadGiveawaysAdmin();
                communicationPLC.sendGiveawaysToPLC();
                callback();
            }
        ]);
    });
    socket.on('editGiveaway', function (msg) {
        console.log(msg);
        db.editGiveaway(msg.giveawayShelfID, msg.delete, emitloadGiveawaysAdmin);
        handleGiveawayPicture(undefined, msg.giveawayShelfID, 'delete', function () {});
        communicationPLC.sendGiveawaysToPLC();
    });
    socket.on('getGiveawaysAdmin', function (msg) {
        console.log("Giveaways laden");
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
            console.log("runterrr");
            exec("sudo shutdown now", (error, stdout, stderr) => {
                if (error) {
                    console.error(`exec error: ${error}`);
                    return;
                }
            });
        } else if (msg == "reboot") {
            console.log("neusatart");
            exec("sudo reboot", (error, stdout, stderr) => {
                if (error) {
                    console.error(`exec error: ${error}`);
                    return;
                }
            });
        }
    });

    socket.on('sendOrder', function (data) {
        console.log("____");

        console.log(data);
        data.deliveryDate = new Date(data.deliveryDate);
        data.deliveryDate += 1000 * 60 * 60;
        data.deliveryDate = new Date(data.deliveryDate);

        const Order = {
            orderID: undefined
        };
        async.series([
            function (callback) {
                console.log("Funktion 1");
                db.websiteOrderHandler(data, (orderID) => {
                    Order.orderID = orderID;
                    console.log(Order.orderID + " #######");
                    callback();
                });
            },
            function (callback) {
                console.log("Funktion 2" + Order.orderID);
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
    console.log("refresh stock");
    db.queryProducts((productData) => {
        io.emit('refreshStock', productData);
    });
}

function handleGiveawayPicture(msg, filename, option, callback) {

    var customDirName = "admin/giveawayPictures";
    var relativeFilePath = customDirName + "/" + filename + ".jpg";

    switch (option) {
        case 'delete':
            console.log("Lösche Bild " + filename);
            fs.unlink(__dirname + "/website/" + relativeFilePath, (err) => {
                if (err) {
                    console.log(`Warnung: Es war kein bild für Giveaway ${filename} vorhanden!`);
                }
            });
            break;
        case 'store':

            console.log("Giveaway Bild verarbeiten...");

            var base64Data = decodeBase64Image(msg.imageData);
            // if directory is not already created, then create it, otherwise overwrite existing image

            // write/save the image
            // TODO: extract file's extension instead of hard coding it

            async.series([
                function (callback) {
                    console.log("Funktion 1");
                    if (!fs.existsSync(__dirname + "/website/" + customDirName)) {
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
                    console.log("Funktion 2");
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
    console.log(relativeFilePath);
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





var jsonParser = bodyParser.json();

app.post("/login", jsonParser, (request, response) => {
    var data = request.body;

    console.log(data);
    console.log("____");
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
                console.log("hash nok");
                response.status(200).send("0");
            }
        });
    }
});




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

exports.dataFromPLC = function (data) {
    console.log(data);

};