'use strict'

const OrderBookPeer = require('./src/peer');

const GRAPE_URL = 'http://127.0.0.1:30001';

// In a real scenario, we'd use different ports for different local instances
const rpcPort = 10000 + Math.floor(Math.random() * 1000);
const node = new OrderBookPeer({
    grape: GRAPE_URL,
    rpcPort: rpcPort
});

try {
    node.init()
    console.log(`Orderbook Node started on RPC port: ${rpcPort}`);
} catch (err) {
    console.error('Failed to start node:', err);
}
