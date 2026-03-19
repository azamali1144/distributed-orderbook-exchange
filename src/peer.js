'use strict'

const { PeerRPCServer, PeerPub, PeerSub } = require('grenache-nodejs-ws')
const Link = require('grenache-nodejs-link')
const MatchingEngine = require('./engine')
const { ORDER_BOOK_SERVICE, ORDER_BOOK_GOSSIP } = require('./constants')

class OrderBookPeer {
    constructor(config) {
        this.lnk = new Link({ grape: config.grape })
        this.rpcServer = new PeerRPCServer(this.lnk, {})
        this.pub = new PeerPub(this.lnk, {})
        this.sub = new PeerSub(this.lnk, {})

        this.engine = new MatchingEngine()
        this.processedIds = new Set() // Prevent duplicate processing
    }

    init() {
        this.lnk.start()
        this.rpcServer.init()
        this.pub.init()
        this.sub.init()

        const service = this.rpcServer.transport('server')
        service.listen(Math.floor(Math.random() * 1000) + 10001)

        // 1. Listen for local orders (Client -> Peer)
        service.on('request', (rid, key, payload, handler) => {
            if (key === ORDER_BOOK_SERVICE) {
                this.handleNewOrder(payload, true) // isLocal = true
                handler.reply(null, { status: 'ACCEPTED', id: payload.id })
            }
        })

        // 2. Listen for gossip from other peers (Peer -> Peer)
        this.sub.sub(ORDER_BOOK_GOSSIP)
        this.sub.on('message', (msg) => {
            try {
                const order = JSON.parse(msg)
                this.handleNewOrder(order, false) // isLocal = false
            } catch (e) {
                console.error('Error parsing gossip message', e)
            }
        })

        // Announce the service to the DHT
        setInterval(() => {
            this.lnk.announce(ORDER_BOOK_SERVICE, service.port, (err) => {
                if (err) console.error('DHT Announce Error:', err)
            })
        }, 1000)

        console.log(`Peer started on port ${service.port}`)
    }

    handleNewOrder(order, isLocal) {
        // Deduplication logic
        if (this.processedIds.has(order.id)) return
        this.processedIds.add(order.id)

        console.log(`[${isLocal ? 'LOCAL' : 'GOSSIP'}] Processing ${order.side} ${order.amount} ${order.symbol} @ ${order.price}`)

        // Execute matching and update internal book
        const result = this.engine.processOrder(order)

        if (result.trades.length > 0) {
            console.log(`   -> Executed ${result.trades.length} trades. Remaining: ${result.remainder}`)
        }

        // If I am the origin peer for this order, broadcast it to everyone else
        if (isLocal) {
            this.pub.pub(JSON.stringify(order))
        }
    }
}

module.exports = OrderBookPeer