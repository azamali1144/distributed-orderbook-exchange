'use strict'

// Only suppress known safe errors, let real ones crash
process.on('uncaughtException', (err) => {
    const safeErrors = [
        'ERR_GRAPE_LOOKUP_EMPTY',
        'ECONNREFUSED'
    ]
    if (safeErrors.some(e => err.message?.includes(e) || err.code?.includes(e))) return
    console.error('[Fatal] Unhandled exception:', err)
    process.exit(1)
})

require('dotenv').config()

const OrderBookPeer = require('./src/peer')
const { DEFAULT_GRAPE } = require('./src/constants')

const grapeUrl = `${process.env.GRPES_BASE_URL}:${process.env.GRPES_PORT}` || DEFAULT_GRAPE

const peer = new OrderBookPeer({
    grape:   grapeUrl,
    timeout: parseInt(process.env.GRPES_TIMEOUT) || 5000
})

peer.init()

process.on('SIGINT', () => {
    console.log('\n[Main] SIGINT received...')
    peer.stop()
})

process.on('SIGTERM', () => {
    console.log('[Main] SIGTERM received...')
    peer.stop()
})