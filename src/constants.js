'use strict'

const VERSION = '1.0.0';

module.exports = {

    SERVICE_BASE_NAME: 'orderBook_service',

    // Service key for syncing full state to new joining nodes
    ORDER_BOOK_SYNC: `orderBook_sync:${VERSION}`,

    // Pub/Sub topic for real-time order and trade broadcasts
    ORDER_BOOK_GOSSIP: 'order_book_gossip_topic',

    // Default URL for the Grenache Grape discovery node
    DEFAULT_GRAPE: 'http://127.0.0.1:30001',

    // Enum for consistent order direction naming
    SIDES: {
        BUY: 'buy',
        SELL: 'sell'
    }
}