'use strict'

require('dotenv').config();

const OrderBookNode  = require('./src/peer');
const { DEFAULT_GRAPE } = require('./src/constants');

// Each instance picks a unique random port
const rpcPort = 1024 + Math.floor(Math.random() * 1000);

const node = new OrderBookNode({
    grape:   process.env.GRAPE_URL || DEFAULT_GRAPE,
    rpcPort: rpcPort
});

node.start();

process.on('SIGINT',  () => node.stop());
process.on('SIGTERM', () => node.stop());

// Export the port so client.js can connect to its OWN node
module.exports = { rpcPort }