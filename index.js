'use strict'

require('dotenv').config()
const OrderBookPeer = require('./src/peer')
const { DEFAULT_GRAPE } = require('./src/constants')

const config = {
    grape: process.env.GRAPE_URL || DEFAULT_GRAPE,
    rpcPort: parseInt(process.env.BASE_RPC_PORT) + Math.floor(Math.random() * 1000)
}

const node = new OrderBookPeer(config)
node.init()