'use strict'

const { PeerRPCClient } = require('grenache-nodejs-ws')
const Link = require('grenache-nodejs-link')
const crypto = require('crypto')
const { ORDER_BOOK_RPC } = require('./src/constants')

const link = new Link({ grape: 'http://127.0.0.1:30001' })
link.start()

const peer = new PeerRPCClient(link, {})
peer.init()

// Mocking a CLI input for an order
const order = {
    id: crypto.randomBytes(16).toString('hex'),
    symbol: 'BTC/USD',
    price: 50000 + (Math.random() * 100),
    amount: 1.5,
    side: Math.random() > 0.5 ? 'buy' : 'sell',
    timestamp: Date.now()
}

console.log('Sending Order:', order)

peer.request(ORDER_BOOK_RPC, order, { timeout: 10000 }, (err, data) => {
    if (err) {
        console.error(err)
        process.exit(1)
    }
    console.log('Response:', data)
    process.exit(0)
})