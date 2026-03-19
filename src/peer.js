'use strict'

const {
    SERVICE_BASE_NAME,
    ORDER_BOOK_GOSSIP,
    ORDER_BOOK_SYNC
} = require('./constants');

const {
    PeerPub,
    PeerSub,
    PeerRPCServer,
    PeerRPCClient,
} = require('grenache-nodejs-ws');

const crypto = require('crypto');
const Link = require('grenache-nodejs-link');
const MatchingEngine = require('./engine');

class OrderBookPeer {
    constructor(config) {
        this.lnk = new Link({ grape: config.grape });

        this.peerSub = new PeerSub(this.lnk, {});
        this.peerPub = new PeerPub(this.lnk, {});
        this.peerRpcServer = new PeerRPCServer(this.lnk, {});
        this.peerRpcClient = new PeerRPCClient(this.lnk, {});

        this.peerRpcServerService = undefined;
        this.peerPubService = undefined;

        this.engine = new MatchingEngine();
        this.processedOrders = new Set();
        this.peerId = crypto.randomBytes(4).toString('hex');
        this.announceInterval = null;

        // Random ports for multiple instances
        this.ports = {
            pub: Math.floor(Math.random() * 1000) + 10001,
            sub: Math.floor(Math.random() * 1000) + 10002,
            rpc: Math.floor(Math.random() * 1000) + 11001
        };
    }

    init() {
        this.lnk.start();
        [this.peerRpcServer, this.peerPub, this.peerSub, this.peerRpcClient].forEach(p => p.init());

        this.setupTransports();
        this.setupSubscriptions();
        this.setupDiscoveryLogic();
        this.startAnnouncing();

        // Bootstrap after DHT registration
        setTimeout(() => this.bootstrap(), 2000);
        console.log(`[Peer ${this.peerId}] Running on RPC: ${this.ports.rpc}\n`);
    }

    // Bootstrap with state sync
    bootstrap() {
        console.log(`[Bootstrap] Looking up peers for state sync...`);

        this.peerRpcClient.request(ORDER_BOOK_SYNC, { requester: this.peerId }, {
            timeout: parseInt(process.env.ORDER_BOOK_SYNC_TIMEOUT) || 10000
        }, (err, networkState) => {
            if (err) {
                if (err.message === 'ERR_GRAPE_LOOKUP_EMPTY') {
                    console.log('[Bootstrap] No peers found - starting as Genesis node');
                } else {
                    console.error('[Bootstrap] Sync failed:', err.message);
                }
                return;
            }

            if (networkState && this.isNetworkStateNewer(networkState)) {
                console.log('[Bootstrap] Applying network state snapshot', networkState);
                this.engine.setState(networkState);
                console.log('[Bootstrap] State synchronized\n');
            }
        });
    }

    isNetworkStateNewer(networkState) {
        if (!networkState || !networkState.lastUpdatedAt) return false;

        const isMoreRecent = networkState.lastUpdatedAt > this.engine.lastUpdatedAt;

        const localSize = JSON.stringify(this.engine.books).length;
        const networkSize = JSON.stringify(networkState.books || {}).length;
        const isLarger = networkState.lastUpdatedAt === this.engine.lastUpdatedAt &&
            networkSize > localSize;

        return isMoreRecent || isLarger;
    }

    setupTransports() {
        // Start Pub server
        this.peerPubService = this.peerPub.transport('server');
        this.peerPubService.listen(this.ports.pub);

        // Start RPC server
        this.peerRpcServerService = this.peerRpcServer.transport('server');
        this.peerRpcServerService.listen(this.ports.rpc);

        this.peerRpcServerService.on('request', (rid, key, payload, handler) => {
            // ORDER SUBMISSION
            console.log(`[Client] Req ${rid} for event: ${key}`);

            if (key === SERVICE_BASE_NAME) {
                const trades = this.handleOrder(payload, true); // true = from local client
                return handler.reply(null, {status: 'PROCESSED', matches: trades.length, peer: this.peerId});
            }

            // STATE SNAPSHOT / BOOTSTRAP
            if (key === ORDER_BOOK_SYNC) {
                console.log(`[RPC] Providing state snapshot to new peer`);
                return handler.reply(null, this.engine.getState());
            }

            console.warn(`[RPC] Unknown key: ${key}`);
        });
    }

    setupSubscriptions() {
        const subscribe = () => {
            console.log('setupSubscriptions - subscribe: ', ORDER_BOOK_GOSSIP, ': ', process.env.ORDER_BOOK_GOSSIP_TIMEOUT);
            this.peerSub.sub(ORDER_BOOK_GOSSIP, {
                timeout: parseInt(process.env.ORDER_BOOK_GOSSIP_TIMEOUT) || 10000
            });
        };

        subscribe();
        setInterval(subscribe, 5000); // Health check

        this.peerSub.on('message', (msg) => {
            try {
                const data = JSON.parse(msg);

                // Handle new order broadcasts
                if (data.type === 'LIMIT_ORDER') {
                    if (!this.processedOrders.has(data.id)) {
                        console.log(`[Gossip] Received order ${data.id.slice(0, 8)}`);

                        this.handleOrder(data, false); // false = from network
                    }
                }
            } catch (e) {
                console.error('[Gossip] Parse error:', e.message);
            }
        });

        this.peerSub.on('error', (err) => {
            if (err.message === 'ERR_GRAPE_LOOKUP_EMPTY') return;
            console.error('[Gossip] Error:', err.message);
        });
    }

    // Dynamic Peer Discovery
    startAnnouncing() {
        this.announceInterval = setInterval(() => {
            this.lnk.announce(SERVICE_BASE_NAME, this.ports.rpc, (err) => {
                if (err) console.error(`[DHT] ${SERVICE_BASE_NAME} announce failed`);
            });

            this.lnk.announce(ORDER_BOOK_GOSSIP, this.ports.sub, (err) => {
                if (err) console.error(`[DHT] BOOK GOSSIP "${ORDER_BOOK_GOSSIP}" announce failed`);
            });
        }, 1000);
    }

    setupDiscoveryLogic() {
        this.peerSub.on('error', (err) => {
            if (err.message === 'ERR_GRAPE_LOOKUP_EMPTY') return;
            console.error('[Discovery] Error:', err.message);
        });
    }

    // Graceful Shutdown
    stop() {
        console.log(`\n[Peer ${this.peerId}] Graceful shutdown...`);

        // Stop announcements
        if (this.announceInterval) {
            clearInterval(this.announceInterval);
        }

        // Close transports safely
        try {
            if (this.peerRpcServerService && typeof this.peerRpcServerService.stop === 'function') {
                this.peerRpcServerService.stop();
            }
            if (this.peerPubService && typeof this.peerPubService.stop === 'function') {
                this.peerPubService.stop();
            }
            if (this.lnk && typeof this.lnk.stop === 'function') {
                this.lnk.stop();
            }
        } catch (e) {
            console.warn('[Shutdown] Error closing transports');
        }

        console.log('[Shutdown] Peer offline. Goodbye.\n');
        process.exit(0);
    }

    handleOrder(order, isLocal) {
        order.id = order.id || crypto.randomBytes(8).toString('hex');

        console.log('order: ', order);
        // Only set originPeer if not already set
        if (!order.originPeer) order.originPeer = this.peerId;

        // Idempotency check
        if (this.processedOrders.has(order.id)) {
            console.log(`[Worker] Skipping duplicate order: ${order.id}`);
            return [];
        }
        this.processedOrders.add(order.id);

        // Run matching engine
        const result = this.engine.processOrder(order);
        console.log('result: ', result);

        const trades = result.trades || [];

        console.log(`[Worker] Order ${order.id.slice(0, 8)}: ${trades.length} trades matched`);

        if (order.originPeer === this.peerId && isLocal) {
            this.peerPubService.pub(JSON.stringify({ type: 'LIMIT_ORDER', ...order }));
        }

        return trades;
    }
}

module.exports = OrderBookPeer