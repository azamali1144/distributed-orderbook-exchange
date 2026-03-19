'use strict'

const crypto = require('crypto')

class MatchingEngine {
    constructor() {
        this.books = {} // Format: { 'BTC/USD': { bids: [], asks: [] } }
    }

    processOrder(order) {
        const { symbol, side, amount, price, id, timestamp } = order

        if (!this.books[symbol]) {
            this.books[symbol] = { bids: [], asks: [] }
        }

        const book = this.books[symbol]
        const trades = this.match(order, book)

        // If there is a remainder after matching, add it to the book
        if (order.amount > 0) {
            this.addOrderToBook(order, book)
        }

        return { trades, remainder: order.amount }
    }

    match(takerOrder, book) {
        const trades = []
        const makers = takerOrder.side === 'buy' ? book.asks : book.bids

        while (makers.length > 0 && takerOrder.amount > 0) {
            const maker = makers[0]
            const isMatch = takerOrder.side === 'buy'
                ? takerOrder.price >= maker.price
                : takerOrder.price <= maker.price

            if (!isMatch) break

            const fillAmount = Math.min(takerOrder.amount, maker.amount)

            trades.push({
                tradeId: crypto.randomBytes(4).toString('hex'),
                price: maker.price,
                amount: fillAmount,
                makerId: maker.id,
                takerId: takerOrder.id
            })

            takerOrder.amount -= fillAmount
            maker.amount -= fillAmount

            if (maker.amount <= 0) makers.shift() // Remove filled maker
        }
        return trades
    }

    addOrderToBook(order, book) {
        const list = order.side === 'buy' ? book.bids : book.asks
        list.push(order)
        // Sort: Bids (High to Low), Asks (Low to High). Secondary sort by Timestamp.
        list.sort((a, b) => {
            if (order.side === 'buy') return b.price - a.price || a.timestamp - b.timestamp
            return a.price - b.price || a.timestamp - b.timestamp
        })
    }
}

module.exports = MatchingEngine