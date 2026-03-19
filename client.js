const { PeerRPCClient } = require('grenache-nodejs-ws');
const Link = require('grenache-nodejs-link');
const crypto = require('crypto')

const GRAPE_URL = 'http://127.0.0.1:30001'

const link = new Link({ grape: GRAPE_URL })
link.start()

const peer = new PeerRPCClient(link, {})
peer.init()


// Mocking a CLI input for an order
const order = {
    id: crypto.randomBytes(16).toString('hex'),
    symbol: 'BTC/USD',
    price: 50000,
    amount: 0.5,
    side: 'buy', // or 'sell'
    timestamp: Date.now()
}
console.log('Submitting order to the P2P network:', order)

// The service name we will announce in the Peer
const SERVICE_NAME = 'order_book_api'

peer.request(SERVICE_NAME, order, { timeout: 10000 }, (err, data) => {
    if (err) {
        console.error('Order submission failed:', err.message)
        process.exit(1)
    }

    console.log('Response from Peer:', data)
    process.exit(0)
})