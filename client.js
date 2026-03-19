'use strict'

require('dotenv').config();

const { PeerRPCClient } = require('grenache-nodejs-http');
const Link   = require('grenache-nodejs-link');
const crypto = require('crypto');

const { ORDER_BOOK_SERVICE, DEFAULT_GRAPE } = require('./src/constants');

// Example: node client.js BTC/USD 50000 1.5 buy
const [symbol, price, amount, side] = process.argv.slice(2);

const order = {
    id: crypto.randomBytes(8).toString('hex'),
    symbol: symbol || 'BTC/USD',
    price: parseFloat(price) || 50000,
    amount: parseFloat(amount) || 1.0,
    side: (side || 'buy').toLowerCase(),
    timestamp: Date.now()
}

// The client does NOT look up a random peer in the DHT.
// It connects directly to the RPC port of its own local node.
// Connect to OWN local node
const ownNodePort = parseInt(process.env.OWN_NODE_PORT);

if (!ownNodePort) {
    console.error('Error: OWN_NODE_PORT is not set in .env');
    console.error('Set it to the RPC port printed when you started your node.');
    process.exit(1);
}

const link = new Link({ grape: process.env.GRAPE_URL || DEFAULT_GRAPE });
link.start();

const peer = new PeerRPCClient(link, {});
peer.init();

console.log('\n Client');
console.log(`Client - Submitting order to OWN node at port ${ownNodePort}`);
console.log(`Client - Symbol: ${order.symbol}`);
console.log(`Client - Side: ${order.side.toUpperCase()}`);
console.log(`Client - Amoun: ${order.amount}`);
console.log(`Client - Price: $${order.price}`);
console.log(`Client - Order IDD: ${order.id}`);
console.log('\n Client');

// Direct request to own node's RPC port
peer.request(ORDER_BOOK_SERVICE, order, { timeout: 10000 }, (err, result) => {
    if (err) {
        console.error('Client - Order submission failed:', err.message);
        process.exit(1);
    }

    console.log('Client - Order accepted by own node!');
    console.log(`Client - Status: ${result.status}`);
    console.log(`Client - Order ID: ${result.id}`);
    console.log(`Client - Node ID: ${result.nodeId}`);
    console.log(`Client - Trades: ${result.trades.length}`);

    if (result.trades.length > 0) {
        result.trades.forEach((t, i) => {
            console.log(`Client - Trade ${i + 1} | ${t.amount} ${t.symbol} @ $${t.price} | ID: ${t.tradeId}`);
        });
    } else {
        console.log(`Client - Remainder : ${result.remainder} added to book`);
    }

    process.exit(0);
});