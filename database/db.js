/*jshint esversion: 6 */
/*jshint node: true */

var async = require("async");
var bcrypt = require('bcryptjs');

var events = require('events');
var eventEmitter = new events.EventEmitter();


var nodeLogging = require('../logging/logger.js');
var logConfig = require('../logging/loggerConfig.js');
var nodeLogging = new nodeLogging("/media/usb/Logging", "nodeJS.txt", logConfig.general.format);

nodeLogging.logger.INFO("Logging in db.js ok");





const {
    Pool
} = require('pg');
const pg = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'mhkDatabase',
    password: 'postgres',
    port: 5432,
});



const Customer = {
    customerID: undefined,
    title: "",
    firstName: "",
    lastName: "",
    streetAndNumber: "",
    postalCode: "",
    city: ""
};
const Order = {
    customerID: undefined,
    orderID: undefined,
    items: [{
        productID: undefined,
        count: undefined
    }],
    countSmall: 0,
    countLarge: 0,
    deliveryDate: "YYYY-MM-DD HH:MM:SS.SSS" //ISO8601
};
const Package = {
    orderID: undefined,
    packageNr: undefined,
    countSmall: 0,
    countLarge: 0,
    giveawayCountShelfID: undefined
};



var counter = 0;

function query(text, params, callback) {
    const start = Date.now();
    return pool.query(text, params, (err, res) => {
        const duration = Date.now() - start;
        counter += 1;
        console.log('executed query', {
            text,
            duration /*, rows: res.rowCount */ ,
            params,
            counter
        });
        if (typeof callback === 'function') {
            callback(err, res);
        }
    });
}

const queries = {
    alterDatabase: `alter DATABASE "mhkDatabase" SET lc_monetary = "de_DE@euro"`,
    tableCustomers: 'CREATE TABLE "Customers" ("customerID" SERIAL PRIMARY KEY, "firstName" TEXT, "lastName" TEXT, "streetAndNumber" TEXT, "postalCode" TEXT, city TEXT, "totalMoneySpent" money)',
    tableProducts: 'CREATE TABLE "Products" ("productID" SERIAL PRIMARY KEY, "productName" TEXT,description TEXT, deprecated bool, size integer, "drillParameters" boolean[], weight integer, "weightTolerance" integer,"countOnStock" integer, price money, "totalOrdered" integer)',
    tableOrders: 'CREATE TABLE "Orders" ("orderID" SERIAL PRIMARY KEY, "customerID" integer REFERENCES "Customers" ON DELETE CASCADE, "finalPrice" money, "orderDate" timestamp without time zone,"deliveryDate" timestamp without time zone)',
    tableGiveaways: 'CREATE TABLE "Giveaways" ("giveawayShelfID" SERIAL PRIMARY KEY , name TEXT, "pictureURL" text, weight integer, "weightTolerance" integer)',
    tablePackages: 'CREATE TABLE "Packages" ("orderID" integer REFERENCES "Orders" ON DELETE CASCADE, "packageNr" integer , "totalNumberOfPackages" integer, "totalWeight" integer,  "totalWeightTolerance" integer, "giveawayShelfID" integer REFERENCES "Giveaways", PRIMARY KEY ("orderID", "packageNr"))',
    tableOrderItems: 'CREATE TABLE "OrderItems" ("orderID" integer, "packageNr" integer, "productID" integer,    Foreign key ("orderID","packageNr") references "Packages"("orderID","packageNr") on delete cascade)',
    tablePackagesProductionStatus: 'CREATE TABLE "PackagesProductionStatus" ("orderID" integer, "packageNr" integer, status TEXT, "lastUpdate" timestamp without time zone, FOREIGN KEY ("orderID", "packageNr") References "Packages" ("orderID", "packageNr") on delete cascade, PRIMARY KEY ("orderID", "packageNr"))',
    tableLoginWebsite: 'CREATE TABLE "LoginWebsite" ("userID" SERIAL PRIMARY KEY, username TEXT, salt text, hash text)'
};

//Serieller Ablauf weil sich die Tabellen referenzieren und bei nicht seriellem ablauf die referenzierende Tabelle vor der referenztabelle erstellt werden würde
init = function (callback) {
    async.eachOfSeries(queries, function (value, key, callback) {
        console.log(key);
        query(value, (err, res) => {
            if (err) {
                if (value == queries.alterDatabase) {
                    console.log("--->!!!!!!!!sudo raspi-config und unter localisation options de_DE@euro mit Leertaste wählen und mit Enter bestätigen und dann Neustarten!!!!!!!!<---");
                    console.log("--->!!!!!!!!Oder Datenbank nicht vorhanden --> andere Error-Logs prüfen!!!!!!!!<---");

                }
                console.log(err.stack);
                callback(err);
            } else {
                callback();
            }
        });
    }, function (err) {
        if (err) {
            console.error(err.message);
            if (typeof callback === 'function') {
                callback();
            }
        } else {
            newStandardUserLogin();
            if (process.env.NODE_ENV === 'development') {
                newSampleProducts();
            }
            if (typeof callback === 'function') {
                callback();
            }
        }
    });
};

function newSampleProducts() {
    const products = {
        1: `INSERT INTO "Products" ("productName",description, size, "drillParameters", price, "weight", "countOnStock", "totalOrdered") VALUES('Spiel 1', 'Beschreibung 1', '1', ARRAY[true, false, false, false, false] , 10, '100', '100',0)`,
        2: `INSERT INTO "Products" ("productName",description, size, "drillParameters", price, "weight", "countOnStock", "totalOrdered") VALUES('Spiel 2', 'Beschreibung 2', '2', '{false, true, false, false, false}', 20, '200', '200',0)`,
        3: `INSERT INTO "Products" ("productName",description, size, "drillParameters", price, "weight", "countOnStock", "totalOrdered") VALUES('Spiel 3', 'Beschreibung 3', '1', '{false, false, true, false, false}', 30, '300', '300',0)`,
    };
    async.eachOfSeries(products, function (value, key, callback) {
        console.log(key);
        query(value, (err, res) => {
            if (err) {
                console.log(err.stack);
                callback(err);
            } else {
                callback();
            }
        });
    }, function (err) {
        if (err) {
            console.error(err.message);
        }

    });
}

function newStandardUserLogin() {
    const user = "mhk";
    const pw = "mhk";
    var salt = bcrypt.genSaltSync(10);
    var hash = bcrypt.hashSync(pw, salt);
    query('INSERT INTO "LoginWebsite" ("username", "salt", "hash") VALUES($1, $2, $3)', [user, salt, hash], (err, res) => {
        if (err) {
            console.log(err.stack);
            callback(err);
        }
    });
}


function getSaltOfUser(username, callback) {
    query('SELECT salt FROM "LoginWebsite" WHERE "username"=$1', [username], (err, res) => {
        if (err) {
            console.log(err.stack);
            callback(err);
        }
        callback(res.rows[0]);
    });
}

function compareHashOfUser(username, hash, callback) {
    query('SELECT hash FROM "LoginWebsite" WHERE "username"=$1', [username], (err, res) => {
        if (err) {
            console.log(err.stack);
            callback(err);
        }

        if (hash == res.rows[0].hash) {
            callback(true);
        } else {
            callback(false);
        }

    });
}

function CreateNewCustomer(Customer, callback) {
    const text = 'INSERT INTO "Customers" ("firstName", "lastName", "streetAndNumber", "postalCode", city) VALUES($1, $2, $3, $4, $5)'; //RETURNING *'
    const values = [Customer.firstName, Customer.lastName, Customer.streetAndNumber, Customer.postalCode, Customer.city];

    query(text, values, (err, res) => {
        if (err) {
            console.log(err.stack);
        }
        callback();
    });
}


function websiteOrderHandler(data, callback) {
    const Customer = {
        customerID: undefined,
        title: "",
        firstName: data.firstName,
        lastName: data.lastName,
        streetAndNumber: data.streetAndNumber,
        postalCode: data.postalCode,
        city: data.city
    };

    const Order = {
        customerID: undefined,
        orderID: undefined,
        items: [],
        deliveryDate: new Date(data.deliveryDate)
    };
    data.items.forEach((item, index) => {
        Order.items.push({
            productID: item.productID,
            count: item.count
        });

    });

    var packages = [];

    async.series([
        function (callback) {
            console.log("Funktion 1");
            getCreateCustomerID(Customer, (customerID) => {
                Order.customerID = customerID;
                callback();
            });
        },
        function (callback) {
            console.log("Funktion 2");
            createNewOrder(Order, callback);
        },
        function (callback) {
            console.log("Funktion 3");

            getLastOrderID((lastOrderID) => {
                Order.orderID = lastOrderID;
                callback();
            });
        },
        function (callback) {
            console.log("Funktion 4");
            createPackages(Order, callback);

        },
        function (callback) {
            console.log("Funktion 5");
            eventEmitter.emit('stockChanged');
            callback();

        }

    ], function (err) {
        if (err) {
            //Handle the error in some way. Here we simply throw it
            //Other options: pass it on to an outer callback, log it etc.
            console.log(err);

            throw err;
        }
        console.log('OrderHandler fertig');

        callback(Order.orderID);
    });
}

function getLastOrderID(callback) {
    query('SELECT "orderID" FROM "Orders" order by "orderID" desc LIMIT 1', (err, res) => {
        if (err) {
            console.log(err.stack);
            callback(err);
        }
        callback(res.rows[0].orderID);
    });
}

function getCreateCustomerID(Customer, callback) {
    //Abfrage, ob Kunde existiert (Vorname, Nachname und Straße+Nr stimmen überein).
    //Wenn dies der fall ist, wird die customerID ausgegeben. Ansonsten wird ein neuer Kunde angelegt.
    const text = 'SELECT "customerID" FROM "Customers" WHERE "firstName"=$1 AND "lastName"=$2 AND "streetAndNumber"=$3';
    const values = [Customer.firstName, Customer.lastName, Customer.streetAndNumber];
    query(text, values, (err, res) => {
        if (err) {
            console.log(err.stack);
            return 0;
        }

        if (res.rows[0] === undefined) {
            //wenn kein Kunde existiert wird ein nuer angelegt:
            CreateNewCustomer(Customer, () => {
                //nach dem Anlegen wird rekursiv die Funktion aufgerufen um die id des neuen Kunden auszugeben
                return getCreateCustomerID(Customer, (id) => {
                    callback(id); //Übergabe der ID an Callback der übergeordneten getCreateCustomerID-Funktion
                });
            });
        } else {
            //dieser Teil wird entweder durch die rekursion nach anlegen des neuen Kunden bearbeitet oder wenn der Kunde von anfang an schon exisitiert. 
            console.log(res.rows[0]);
            console.log("Customer ID: ");
            console.log(res.rows[0].customerID);
            if (typeof callback === 'function') {
                callback(res.rows[0].customerID); //Übergabe der ID entweder in den callback des rekursiven Aufrufs oder falls der Kunde schon von anfang an existiert direkt an den Callback vom 1. Aufruf der Funktion  
            }
            return res.rows[0].customerID;
        }
    });

}

function createNewOrder(Order, callback) {
    const orderDate = new Date();
    const text = 'INSERT INTO "Orders" ("customerID",  "deliveryDate", "orderDate") VALUES($1, $2, $3)'; //RETURNING *'
    const values = [Order.customerID, Order.deliveryDate, orderDate];
    query(text, values, (err, res) => {
        if (err) {
            console.log(err.stack);
        }
        callback();
    });
}


function createPackages(Order, callback) {
    const maxItemQuantity = 6;
    var packageNr = 1;
    var itemsInPackage = 0;
    var totalWeight = 0;
    var giveawayShelfID;

    async.forEachOfSeries(Order.items, function (product, key, callback) {

        console.log(product);
        console.log("----------------");

        const text = 'SELECT weight FROM "Products" WHERE "productID"=$1';
        const values = [product.productID];
        query(text, values, (err, res) => {
            if (err) {
                console.log(err.stack);
                return;
            }
            const itemWeight = res.rows[0].weight;
            console.log(`Weight of productID ${product.productID} is ${itemWeight} g`);

            async.timesSeries(product.count, function (n, next) {
                async.series([
                    function (callback) {
                        console.log("Paketnummer: " + packageNr);
                        if (packageNr == 1) {
                            chooseGiveaway((shelfID) => {
                                giveawayShelfID = shelfID;
                                callback();
                            });
                        } else {
                            giveawayShelfID = undefined;
                            callback();
                        }
                    },
                    function (callback) {
                        console.log("######");
                        console.log(itemsInPackage);

                        if (itemsInPackage >= maxItemQuantity) {
                            const packageQuery = 'UPDATE "Packages" SET "totalWeight"=$1 WHERE "orderID"=$2 AND "packageNr"=$3';
                            const packageValues = [totalWeight, Order.orderID, packageNr];
                            query(packageQuery, packageValues, (err, res) => {
                                if (err) {
                                    console.log(err.stack);
                                }
                                packageNr += 1;
                                itemsInPackage = 0;
                                totalWeight = 0;
                                callback();
                            });
                        } else {
                            callback();
                        }
                    },
                    function (callback) {
                        if (itemsInPackage == 0) {
                            const packageQuery = 'INSERT INTO "Packages" ("orderID", "packageNr", "giveawayShelfID") VALUES($1, $2, $3)';
                            const packageValues = [Order.orderID, packageNr, giveawayShelfID];
                            query(packageQuery, packageValues, (err, res) => {
                                if (err) {
                                    console.log(err.stack);
                                }
                                callback();
                            });
                        } else {
                            callback();
                        }
                    },

                    function (callback) {
                        const text = 'INSERT INTO "OrderItems" ("orderID", "packageNr", "productID") VALUES($1, $2, $3)';
                        const values = [Order.orderID, packageNr, product.productID];
                        query(text, values, (err, res) => {
                            if (err) {
                                console.log(err.stack);
                            }
                            itemsInPackage += 1;
                            totalWeight += itemWeight;
                            incStatTotalOrdered(product.productID);
                            decItemOnStock(product.productID, callback);
                        });
                    }
                ], function (err) {
                    if (err) {
                        //Handle the error in some way. Here we simply throw it
                        //Other options: pass it on to an outer callback, log it etc.
                        throw err;
                    }
                    next();
                });
            }, function (err) {
                callback();
            });
        });

    }, function (err) {
        // Anzahl der Artikel fertig durchlaufen
        async.series([
            function (callback) {
                console.log("Paketnummer: " + packageNr);
                if (packageNr == 1) {
                    chooseGiveaway((shelfID) => {
                        giveawayShelfID = shelfID;
                        callback();
                    });
                } else {
                    giveawayShelfID = undefined;
                    callback();
                }
            },
            function (callback) {
                const packageQuery = 'UPDATE "Packages" SET "totalWeight"=$1 WHERE "orderID"=$2 AND "packageNr"=$3';
                const packageValues = [totalWeight, Order.orderID, packageNr];
                query(packageQuery, packageValues, (err, res) => {
                    if (err) {
                        console.log(err.stack);
                    }
                    itemsInPackage = 0;
                    totalWeight = 0;
                    callback();
                });
            },
            function (callback) {
                query('UPDATE "Packages" SET "totalNumberOfPackages"=$1 WHERE "orderID"=$2', [packageNr, Order.orderID], (err, res) => {
                    if (err) {
                        console.log(err.stack);
                    }
                    callback();
                });
            }
        ], function (err) {
            callback();
        });
    });
}

function decItemOnStock(productID, callback) {
    query('UPDATE "Products" SET "countOnStock"="countOnStock"-1 WHERE "productID"=$1', [productID], (err, res) => {
        if (err) {
            console.log(err.stack);
        }
        callback();
    });
}

function incStatTotalOrdered(productID) {
    query('UPDATE "Products" SET "totalOrdered"="totalOrdered"+1 WHERE "productID"=$1', [productID], (err, res) => {
        if (err) {
            console.log(err.stack);
        }
    });
}


function chooseGiveaway(callback) {
    const queryParam = {
        text: 'SELECT "giveawayShelfID" FROM "Giveaways"',
        values: [],
        rowMode: 'array',
    };
    query(queryParam, (err, res) => {
        if (err) {
            console.log(err.stack);
        }
        var IDs = res.rows;
        console.log("------IDs: " + IDs);
        if (IDs.length > 0) {
            var randomShelfID = IDs[Math.floor(Math.random() * IDs.length)][0];
            console.log("random: " + randomShelfID);
            callback(randomShelfID);
        } else {
            //Keine Promotionsartikel definiert
            callback();
        }
    });
}



function queryProducts(callback) {
    query('SELECT "productID","productName","description", "size", "drillParameters", "countOnStock", deprecated, price, weight FROM "Products" ORDER BY "productID" ASC', (err, res) => {
        if (err) {
            console.log(err.stack);
            callback();
        }
        callback(res.rows);
    });
}

function queryAllOrders(callback) {
    query('SELECT   "public"."Orders"."orderID", "public"."Orders"."orderDate", "public"."Orders"."deliveryDate","public"."Packages"."packageNr","public"."Packages"."totalNumberOfPackages","public"."PackagesProductionStatus"."status","public"."PackagesProductionStatus"."lastUpdate" FROM     "public"."Packages" INNER JOIN "public"."Orders"  ON "public"."Packages"."orderID" = "public"."Orders"."orderID" LEFT JOIN "public"."PackagesProductionStatus"  ON "public"."PackagesProductionStatus"."orderID" = "public"."Packages"."orderID" order by "orderID" asc', (err, res) => {
        if (err) {
            console.log(err.stack);
            callback();
        }
        callback(res.rows);
    });
}

function queryOrder(orderID, callback) {
    query('SELECT   "public"."Orders"."orderID", "public"."Orders"."orderDate", "public"."Orders"."deliveryDate","public"."Packages"."packageNr","public"."Packages"."totalNumberOfPackages" FROM     "public"."Packages" INNER JOIN "public"."Orders"  ON "public"."Packages"."orderID" = "public"."Orders"."orderID" LEFT JOIN "public"."PackagesProductionStatus"  ON "public"."PackagesProductionStatus"."orderID" = "public"."Packages"."orderID" WHERE "public"."Orders"."orderID" = $1', [orderID], (err, res) => {
        if (err) {
            console.log(err.stack);
            callback();
        }
        callback(res.rows);
    });
}

function queryGiveaways(callback) {
    query('SELECT "giveawayShelfID","name","weight", "pictureURL" FROM "Giveaways" ORDER BY "giveawayShelfID" ASC', (err, res) => {
        if (err) {
            console.log(err.stack);
            callback();
        }
        callback(res.rows);
    });
}

function queryStats(callback) {
    query(`SELECT "productID", "productName", "totalOrdered" FROM "Products" ORDER BY "productID" ASC`, (err, res) => {
        if (err) {
            console.log(err.stack);
            callback(err);
        }
        callback(res.rows);
    });
}

function createProduct(name, description, size, drillParameters, weight, price, countOnStock, callback) {
    var text = `INSERT INTO "Products" ("productName", description, size, "drillParameters", weight, price, "countOnStock", "totalOrdered") VALUES($1, $2, $3, $4, $5, $6, $7, $8)`;
    var values = [name, description, size, drillParameters, weight, price, countOnStock, 0];

    query(text, values, (err, res) => {
        if (err) {
            console.log(err.stack);
            callback(err);
        }
        callback();
    });
}

function createGiveaway(giveawayShelfID, name, weight, relativeFilePath, callback) {
    var text = `INSERT INTO "Giveaways" ("giveawayShelfID", name, weight, "pictureURL") VALUES($1, $2, $3, $4)`;
    var values = [giveawayShelfID, name, weight, "http://IP:PORT/" + relativeFilePath];

    query(text, values, (err, res) => {
        if (err) {
            console.log("#####stack:");
            console.log(err.stack);
            console.log("#####stack Ende");
            if (err.error == 'duplicate key value violates unique constraint "Giveaways_pkey"') {
                console.log("jojojojojoj");
            }
            callback(err);
        } else {
            callback();
        }
    });
}

function editProduct(productID, deprecated, deleteProduct, callback) {
    var text;
    var values;
    if (deprecated) {
        text = 'UPDATE "Products" SET "deprecated"=$1 WHERE "productID"=$2';
        values = [deprecated, productID];
    } else if (deleteProduct) {
        text = `DELETE FROM "Products" WHERE "productID"=$1`;
        values = [productID];
    }

    if (deprecated || deleteProduct) {
        query(text, values, (err, res) => {
            if (err) {
                console.log(err.stack);
                callback(err);
            }
            callback();
        });
    }
}

function editGiveaway(giveawayShelfID, deleteGiveaway, callback) {
    var text;
    var values;
    if (deleteGiveaway) {
        text = `DELETE FROM "Giveaways" WHERE "giveawayShelfID"=$1`;
        values = [giveawayShelfID];
        query(text, values, (err, res) => {
            if (err) {
                console.log(err.stack);
                callback(err);
            }
            callback();
        });
    }
}

function deleteOrder(orderID, callback) {
    async.waterfall([
        function (callback) {
            query(`SELECT "customerID" FROM "Orders" WHERE "orderID"=$1`, [orderID], (err, res) => {
                if (err) {
                    console.log(err.stack);
                    callback(err);
                }
                callback(null, res.rows[0].customerID);
            });
        },
        function (customerID, callback) {
            console.log("2.0.");

            query(`SELECT * FROM "Orders" WHERE "customerID"=$1`, [customerID], (err, res) => {
                if (err) {
                    console.log(err.stack);
                    callback(err);
                }
                callback(null, customerID, res.rows.length);
            });
        },
        function (customerID, totalActiveOrdersOfCustomer, callback) {
            if (totalActiveOrdersOfCustomer == 1){
                query(`DELETE FROM "Customers" WHERE "customerID"=$1`, [customerID], (err, res) => {
                    if (err) {
                        console.log(err.stack);
                        callback(err);
                    }
                    callback();
                });
            }
            else{
                callback();
            }
        },
        function (callback) {
            query(`DELETE FROM "Orders" WHERE "orderID"=$1`, [orderID], (err, res) => {
                if (err) {
                    console.log(err.stack);
                    callback(err);
                }
                callback();
            });
        }
    ], function (err, result) {
        callback();
    });
}

module.exports = {
    init: init,
    query: query,
    CreateNewCustomer: CreateNewCustomer,
    websiteOrderHandler: websiteOrderHandler,
    getSaltOfUser: getSaltOfUser,
    compareHashOfUser: compareHashOfUser,
    queryProducts: queryProducts,
    eventEmitter: eventEmitter,
    createProduct: createProduct,
    editProduct: editProduct,
    queryAllOrders: queryAllOrders,
    queryOrder: queryOrder,
    queryGiveaways: queryGiveaways,
    createGiveaway: createGiveaway,
    editGiveaway: editGiveaway,
    queryStats: queryStats,
    deleteOrder: deleteOrder
};