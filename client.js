'use strict'

require('dotenv').config();
const crypto = require('crypto');
const Link = require('grenache-nodejs-link');
const { PeerRPCClient } = require('grenache-nodejs-ws');
const {SERVICE_BASE_NAME} = require("./src/constants");

class OrderBookClient {
    constructor(config) {
        this.lnk = new Link({ grape: config.grape, timeout: config.timeout });
        this.peerRpcClient = new PeerRPCClient(this.lnk, {});

        // Parse command line args
        const [symbol, price, amount, side] = process.argv.slice(2);

        this.order = {
            id: crypto.randomBytes(8).toString('hex'),
            symbol: symbol || 'BTC/USD',
            price: parseFloat(price) || 50000,
            amount: parseFloat(amount) || 0.1,
            side: side || 'buy',
            timestamp: Date.now()
        };
    }

    init() {
        this.lnk.start();
        this.peerRpcClient.init();

        // Submit order
        setTimeout(() => {
            console.log(`\n[Client] Submitting: ${this.order.side.toUpperCase()} ${this.order.amount} ${this.order.symbol} @ $${this.order.price}\n`);
            this.submitOrder(this.order);
        }, 1500);
    }

    submitOrder(order) {
        console.log(`[Client] Looking for available peers...`);

        this.peerRpcClient.request(SERVICE_BASE_NAME, order, { timeout: parseInt(process.env.ORDER_BOOK_SERVICE_TIMEOUT) || 10000 }, (err, result) => {
                if (err) {
                    if (err.message === 'ERR_GRAPE_LOOKUP_EMPTY') {
                        console.error('[Error] No peers online. Retrying in 2 seconds...');
                        setTimeout(() => this.submitOrder(order), 2000);
                        return;
                    }

                    if (err.code === 'ECONNREFUSED' || err.message === 'ERR_TIMEOUT') {
                        console.warn('[Retry] Peer unreachable. Trying another...');
                        this.submitOrder(order);
                        return;
                    }

                    console.error('[Error] Order submission failed:', err.message);
                    return;
                }

                console.log(`[Success] Order accepted!`);
                console.log(`result: ${JSON.stringify(result, null, 2)}`);
                console.log(`Peer: ${result.peer}`);
                console.log(`Matches: ${result.matches}\n`);
            }
        );
    }

}

const client = new OrderBookClient({
    grape: `${process.env.GRPES_BASE_URL}:${process.env.GRPES_PORT}`,
    timeout: parseInt(process.env.GRPES_TIMEOUT)
});

client.init();