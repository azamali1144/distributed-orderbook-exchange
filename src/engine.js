'use strict'

const crypto = require('crypto');
const { SIDES } = require('./constants');

class MatchingEngine {
    constructor() {
        this.books = {} // Format: { 'BTC/USD': { bids: [], asks: [] } }
    }

    initPair(symbol) {
        if (!this.books[symbol]) {
            this.books[symbol] = { asks: [], bids: [] };
        }
    }

    // Add order and trigger matching
    processOrder(order) {
        const { symbol, side } = order;
        this.initPair(symbol);

        const book = this.books[symbol];
        console.log('book', JSON.stringify(book));

        if (side === SIDES.SELL) {
            this.books[symbol].asks.push({ ...order });
            this.books[symbol].asks.sort((a, b) => a.price - b.price || a.timestamp - b.timestamp);
        } else {
            this.books[symbol].bids.push({ ...order });
            this.books[symbol].bids.sort((a, b) => b.price - a.price || a.timestamp - b.timestamp);
        }
        console.log('book after', JSON.stringify(this.books[symbol]));

        // FIX: Call match and return the result
        const trades = this.match(symbol);
        // If there is a remainder after matching, add it to the book
        if (order.amount > 0) {
            this.addOrderToBook(order, book)
        }

        return { trades, remainder: order.amount }
    }

    match(takerOrder, book) {
        const trades = []
        const makers = takerOrder.side === SIDES.BUY ? book.asks : book.bids

        while (makers.length > 0 && takerOrder.amount > 0) {
            const maker = makers[0]
            const isMatch = takerOrder.side === SIDES.BUY
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
            });

            takerOrder.amount -= fillAmount
            maker.amount -= fillAmount

            if (maker.amount <= 0) makers.shift() // Remove filled maker
        }
        return trades
    }

    addOrderToBook(order, book) {
        const list = order.side === SIDES.BUY ? book.bids : book.asks
        list.push(order)
        // Sort: Bids (High to Low), Asks (Low to High). Secondary sort by Timestamp.
        list.sort((a, b) => {
            if (order.side === SIDES.BUY) return b.price - a.price || a.timestamp - b.timestamp
            return a.price - b.price || a.timestamp - b.timestamp
        })
    }

    getState() {
        return {
            books: this.books,
            lastUpdatedAt: this.lastUpdatedAt
        };
    }

    setState(state) {
        console.log('setState - state: ', state);
        if (!state) return;
        this.books = state.books || {};
        this.lastUpdatedAt = state.lastUpdatedAt || Date.now();
    }
}

module.exports = MatchingEngine