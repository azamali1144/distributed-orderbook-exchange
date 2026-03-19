'use strict'

const crypto = require('crypto')
const { SIDES } = require('./constants')

class MatchingEngine {
    constructor() {
        this.books = {}          // { 'BTC/USD': { bids: [], asks: [] } }
        this.lastUpdatedAt = null
    }

    initPair(symbol) {
        if (!this.books[symbol]) {
            this.books[symbol] = { bids: [], asks: [] }
        }
    }

    processOrder(order) {
        const { symbol } = order
        this.initPair(symbol)

        const book = this.books[symbol]

        // Step 1: Match taker against the existing book
        const trades = this.match(order, book)

        // Step 2: If remainder exists after matching, add to book
        if (order.amount > 0) {
            this.addOrderToBook(order, book)
        }

        // Step 3: Update the timestamp for state sync
        this.lastUpdatedAt = Date.now()

        return { trades, remainder: order.amount }
    }

    match(takerOrder, book) {
        const trades = []

        // Taker is BUY → match against lowest ASKs
        // Taker is SELL → match against highest BIDs
        const makers = takerOrder.side === SIDES.BUY
            ? book.asks
            : book.bids

        while (makers.length > 0 && takerOrder.amount > 0) {
            const maker = makers[0]

            // Check price crossings
            const isMatch = takerOrder.side === SIDES.BUY
                ? takerOrder.price >= maker.price
                : takerOrder.price <= maker.price

            if (!isMatch) break

            const fillAmount = Math.min(takerOrder.amount, maker.amount)

            trades.push({
                tradeId:  crypto.randomBytes(4).toString('hex'),
                price:    maker.price,
                amount:   fillAmount,
                makerId:  maker.id,
                takerId:  takerOrder.id,
                symbol:   takerOrder.symbol,
                matchedAt: Date.now()
            })

            takerOrder.amount -= fillAmount
            maker.amount     -= fillAmount

            // Remove fully filled maker
            if (maker.amount <= 0) makers.shift()
        }

        return trades
    }

    addOrderToBook(order, book) {
        const list = order.side === SIDES.BUY ? book.bids : book.asks

        // Avoid duplicates
        const exists = list.find(o => o.id === order.id)
        if (exists) return

        list.push({ ...order })

        // Sort: Bids (High to Low), Asks (Low to High). Secondary sort by Timestamp.
        list.sort((a, b) => {
            if (order.side === SIDES.BUY) {
                return b.price - a.price || a.timestamp - b.timestamp
            }
            return a.price - b.price || a.timestamp - b.timestamp
        })
    }

    getState() {
        return {
            books: this.books,
            lastUpdatedAt: this.lastUpdatedAt
        }
    }

    setState(state) {
        if (!state) return
        this.books = state.books || {}
        this.lastUpdatedAt = state.lastUpdatedAt || Date.now()
        console.log('[Engine] State applied from network snapshot')
    }
}

module.exports = MatchingEngine