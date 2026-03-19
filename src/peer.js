'use strict'

const { PeerRPCServer, PeerPub, PeerSub } = require('grenache-nodejs-ws')
const Link = require('grenache-nodejs-link')
const MatchingEngine = require('./engine')
const { ORDER_BOOK_RPC, ORDER_BOOK_GOSSIP } = require('./constants')

class OrderBookPeer {
    constructor(config) {
        this.config = config
        this.lnk = new Link({ grape: config.grape })
        this.rpcServer = new PeerRPCServer(this.lnk, {})
        this.pub = new PeerPub(this.lnk, {})
        this.sub = new PeerSub(this.lnk, {})

        this.engine = new MatchingEngine()
        this.processedOrders = new Set()
    }

    init() {
        this.lnk.start()
        this.rpcServer.init()
        this.pub.init()
        this.sub.init()

        const transport = this.rpcServer.transport('server')
        transport.listen(this.config.rpcPort)

        // Listen for Gossip from other peers
        this.sub.sub(ORDER_BOOK_GOSSIP)
        this.sub.on('message', (msg) => {
            try {
                this.handleOrder(JSON.parse(msg), false)
            } catch (e) { console.error('Gossip parse error', e) }
        })

        // Handle Direct Client RPC
        transport.on('request', (rid, key, payload, handler) => {
            if (key === ORDER_BOOK_RPC) {
                this.handleOrder(payload, true)
                handler.reply(null, { status: 'ACCEPTED', id: payload.id })
            }
        })

        // Announce service
        setInterval(() => {
            this.lnk.announce(ORDER_BOOK_RPC, transport.port, (err) => {
                if (err) console.error('Announce failed', err)
            })
        }, 1000)

        console.log(`Node running on port ${this.config.rpcPort}`)
    }

    handleOrder(order, isLocal) {
        if (this.processedOrders.has(order.id)) return
        this.processedOrders.add(order.id)

        console.log(`[${isLocal ? 'LOCAL' : 'GOSSIP'}] Processing ${order.side} ${order.amount} @ ${order.price}`)

        const result = this.engine.processOrder(order)

        if (result.trades.length > 0) {
            console.log(`   ✅ Matched ${result.trades.length} trades!`)
        }

        if (isLocal) {
            this.pub.pub(JSON.stringify(order))
        }
    }
}

module.exports = OrderBookPeer