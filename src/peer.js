'use strict'

const { PeerRPCServer, PeerPub, PeerSub } = require('grenache-nodejs-ws')
const Link = require('grenache-nodejs-link')
const { ORDER_BOOK_RPC, ORDER_BOOK_TOPIC } = require('./constants')

class OrderBookPeer {
    constructor(config) {
        this.config = config
        this.lnk = new Link({ grape: config.grape })
        this.rpcServer = new PeerRPCServer(this.lnk, {})
        this.pub = new PeerPub(this.lnk, {})
        this.sub = new PeerSub(this.lnk, {})

        // Track processed orders to avoid infinite gossip loops
        this.processedOrders = new Set()
    }

    init() {
        this.lnk.start()
        this.rpcServer.init()
        this.pub.init()
        this.sub.init()

        // 1. Setup RPC Server to listen for Client orders
        const transport = this.rpcServer.transport('server')
        transport.listen(this.config.rpcPort)

        // 2. Setup Pub/Sub (Gossip)
        // We listen for orders being broadcast by other peers
        this.sub.sub(ORDER_BOOK_TOPIC)
        this.sub.on('message', (msg) => {
            try {
                const order = JSON.parse(msg)
                this.handleIncomingOrder(order, false) // false = from network
            } catch (e) {
                console.error('Error parsing gossip message', e)
            }
        })

        // 3. Announce RPC service to Grape
        setInterval(() => {
            this.lnk.announce(ORDER_BOOK_RPC, transport.port, (err) => {
                if (err) console.error('Announcement failed:', err)
            })
        }, 1000)

        // 4. Handle Client Requests
        transport.on('request', (rid, key, payload, handler) => {
            if (key === ORDER_BOOK_RPC) {
                this.handleIncomingOrder(payload, true) // true = from local client
                handler.reply(null, { status: 'ACCEPTED', id: payload.id })
            }
        })

        console.log(`Node initialized on port ${this.config.rpcPort}`)
    }

    handleIncomingOrder(order, isLocal) {
        // Prevent processing the same order twice
        if (this.processedOrders.has(order.id)) return
        this.processedOrders.add(order.id)

        console.log(`[${isLocal ? 'CLIENT' : 'NETWORK'}] Processing order:`, order.id)

        // If it came from our client, we must broadcast it to the rest of the P2P network
        if (isLocal) {
            console.log(`Broadcasting order ${order.id} to peers...`)
            this.pub.pub(JSON.stringify(order))
        }

        // NEXT STEP: This is where we will call this.engine.processOrder(order)
    }
}

module.exports = OrderBookPeer