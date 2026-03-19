'use strict'

const { PeerRPCServer, PeerPub, PeerSub } = require('grenache-nodejs-ws');
const Link = require('grenache-nodejs-link');

class OrderBookPeer {
    constructor(config) {
        this.lnk = new Link({ grape: config.grape });
        this.rpcServer = new PeerRPCServer(this.lnk, {});
        this.pub = new PeerPub(this.lnk, {});
        this.sub = new PeerSub(this.lnk, {});
    }

    init() {
        this.lnk.start()
        this.rpcServer.init()

        const transport = this.rpcServer.transport('server')
        transport.listen(this.config.rpcPort)

        // Announce the service to Grape every second
        setInterval(() => {
            this.lnk.announce('order_book_api', transport.port, (err) => {
                if (err) console.error('Announcement failed:', err)
            })
        }, 1000)

        // Handle incoming orders from clients
        transport.on('request', (rid, key, payload, handler) => {
            if (key === 'order_book_api') {
                console.log('Received order from client:', payload)

                // For now, we just acknowledge receipt
                // Later, this will call engine.addOrder()
                handler.reply(null, { msg: 'Order received by peer', orderId: payload.id })
            }
        })
    }
}

module.exports = OrderBookPeer;