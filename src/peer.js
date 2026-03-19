'use strict'

const { PeerRPCServer, PeerRPCClient } = require('grenache-nodejs-http');
const Link   = require('grenache-nodejs-link');
const crypto = require('crypto');

const MatchingEngine  = require('./engine');
const { ORDER_BOOK_SERVICE, ORDER_BOOK_GOSSIP } = require('./constants');

// Each instance
    // - Maintains its own in-memory order book (MatchingEngine)
    // - Exposes a local RPC server so its own client can submit orders
    // Gossips received orders to all other nodes via Grenache Pub/Sub
    //- Listens for gossip from other nodes and applies them locally
class OrderBookNode {
    constructor(config) {
        this.grape = config.grape;
        this.rpcPort = config.rpcPort;
        this.nodeId = crypto.randomBytes(4).toString('hex');

        this.link = new Link({ grape: this.grape });
        this.rpcServer = new PeerRPCServer(this.link, { timeout: 300000 });
        this.rpcClient = new PeerRPCClient(this.link, {});

        this.engine = new MatchingEngine();
        this.processedOrders = new Set();
        this.announceTimer = null;
    }

    start() {
        this.link.start();
        this.rpcServer.init();
        this.rpcClient.init();

        // Start local RPC server
        const service = this.rpcServer.transport('server');
        service.listen(this.rpcPort);

        service.on('request', (rid, key, payload, handler) => {
            if (key === ORDER_BOOK_SERVICE) {
                return this.onOrderReceived(payload, handler, true);
            }
            handler.reply(new Error(`Unknown service: ${key}`), null);
        })

        // Announce to DHT every second
        this.announceTimer = setInterval(() => {
            this.link.announce(ORDER_BOOK_SERVICE, this.rpcPort, {})
        }, 1000);

        console.log(`\nNode: ${this.nodeId} - Order book node started`);
        console.log(`Node: ${this.nodeId} - RPC Port: ${this.rpcPort}`);
        console.log(`Node: ${this.nodeId} - Grape DHT: ${this.grape}`);
        console.log(`Node: ${this.nodeId} - Ready to accept orders\n`);
    }

    stop() {
        console.log(`\nNode: ${this.nodeId} - Shutting down...`);
        clearInterval(this.announceTimer);
        try {
            this.link.stop();
        } catch (err) {
            console.log(err);
        }
        console.log(`Node: ${this.nodeId} - Offline.\n`);
    }

    // Called when an order arrives — either from the local client
    // (isLocal = true) or from a gossip broadcast (isLocal = false).
    onOrderReceived(order, handler, isLocal) {
        if (this.processedOrders.has(order.id)) {
            console.log(`Node: ${this.nodeId}] - Duplicate order ignored: ${order.id.slice(0, 8)}`);
            if (handler) handler.reply(null, { status: 'DUPLICATE', id: order.id });
            return;
        }
        this.processedOrders.add(order.id);

        const source = isLocal ? 'LOCAL CLIENT' : 'GOSSIP';
        console.log(`Node: ${this.nodeId} - source: ${source} | ${order.side.toUpperCase().padEnd(4)} | ${order.amount} ${order.symbol} -> $${order.price}`);

        // Run matching engine
        const { trades, remainder } = this.engine.processOrder(order);

        if (trades.length > 0) {
            trades.forEach(t => {
                console.log(`Node: ${this.nodeId} - OK Trade | ${t.amount} ${t.symbol} -> $${t.price} | ID: ${t.tradeId}`);
            });
        } else {
            console.log(`Node: ${this.nodeId} - No match.`);
            console.log(` Remainder ${remainder} added to book.`);
        }

        // Reply to local client
        if (handler) {
            handler.reply(null, {
                status:    trades.length > 0 ? 'MATCHED' : 'ADDED_TO_BOOK',
                id:        order.id,
                trades:    trades,
                remainder: remainder,
                nodeId:    this.nodeId
            });
        }

        // Gossip to other nodes (only if received from local client)
        if (isLocal) {
            this.gossip(order);
        }
    }

    // Gossip: broadcast this order to every other node on the network
    gossip(order) {
        // Look up all peers registered under ORDER_BOOK_SERVICE
        this.link.lookup(ORDER_BOOK_SERVICE, (err, peers) => {
            if (err || !peers || peers.length === 0) {
                console.log(`Node: ${this.nodeId} - Gossip: No remote peers found`);
                return;
            }

            peers.forEach(peer => {
                // Skip myself
                const [host, port] = peer.split(':')
                if (parseInt(port) === this.rpcPort) return

                // Send the order directly to that peer's RPC server
                this.rpcClient.request(
                    ORDER_BOOK_SERVICE,
                    order,
                    { timeout: 5000 },
                    (err) => {
                        if (err) {
                            console.warn(`Node: ${this.nodeId} - Gossip: `);
                            console.warn(` Failed to reach peer ${peer}: ${err.message}`);
                            return;
                        }
                        console.log(`Node: ${this.nodeId} - Gossip: `);
                        console.log(` Order ${order.id.slice(0, 8)} sent to peer ${peer}`);
                    }
                );
            });
        });
    }
}

module.exports = OrderBookNode