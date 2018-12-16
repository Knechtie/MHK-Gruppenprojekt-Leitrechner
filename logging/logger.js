/*jshint esversion: 6  */
/*jshint node: true */
"use strict";

var fs = require("fs");

const {
    createLogger,
    format,
    transports
} = require('winston');
const {
    combine,
    timestamp,
    label,
    printf
} = format;


module.exports = class Logger {

    constructor(storagePath, filename, format) {
        this.storagePath = storagePath;
        this.filename = filename;
        this.format = format;
        this.initStoragePath(this.storagePath);

        try {
            this.initStoragePath(this.storagePath);

        } catch (error) {
            this.storagePath = "/tmp";
            this.initStoragePath(this.storagePath);
            console.log("Speicherort in Tmp benutzt!");

        }
        this.initWinston(this.storagePath, format);
    }

    initStoragePath(storagePath) {
        if (!fs.existsSync(storagePath)) {
            fs.mkdir(storagePath, function (e) {
                if (!e) {
                    console.log("Created new directory without errors.");
                } else {
                    console.log("Exception while creating new directory....");
                    // throw e;
                }
            });
        }
    }

    initWinston(storagePath) {
        const options = {
            levels: {
                ERROR: 0,
                WARNING: 1,
                DEBUG: 2,
                INFO: 3
            },
            colors: {
                ERROR: 'red',
                WARNING: 'orange',
                DEBUG: 'yellow',
                INFO: 'white',
            }
        };

        this.logger = createLogger({
            levels: options.levels,
            format: this.format,
            transports: [
                new transports.Console({
                    level: 'INFO' //Level mit größerer oder gleicher priorität werden für den Transport benutzt.
                }),
                new transports.File({
                    filename: storagePath + '/' + this.filename,
                    level: 'INFO' //Level mit größerer oder gleicher priorität werden für den Transport benutzt.
                })
            ]
        });
    }
};