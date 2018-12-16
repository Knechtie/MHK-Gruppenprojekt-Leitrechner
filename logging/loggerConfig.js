/*jshint esversion: 6  */
/*jshint node: true */
"use strict";
const {
    format
} = require('winston');

const {
    printf
} = format;


const PLC = {
    format: format.combine(
        format.align(),
        printf(info => {
            return `${info.timestamp} [${info.plcName}] [${info.level}]:\t${info.message}`;
        })
    )
};

const general = {
    format: printf(info => {
        return `${new Date().toLocaleString()} [${info.level}]:\t${info.message}`;
    })
};

module.exports = {
    PLC: PLC,
    general: general
};