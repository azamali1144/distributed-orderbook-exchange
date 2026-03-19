'use strict'

const crypto = require('crypto');
const { SIDES } = require('./constants');

// Maintains an in-memory order book per trading symbol.
    // - BUY  orders match against the lowest ASK first
    // - SELL orders match against the highest BID first
class MatchingEngine {
    constructor() {
        // { 'BTC/USD': { bids: [], asks: [] } }
        this.books = {}
        this.lastUpdatedAt = null
    };

     //Process an incoming order:
     // 1. Match against the opposite side of the book
     // 2. Add any remainder back to the book
    processOrder(order) {
        const { symbol } = order;
        this.initPair(symbol);

        const book   = this.books[symbol];
        const trades = this.match(order, book);

        // Add remainder back to the book
        if (order.amount > 0) {
            this.addToBook(order, book);
        }

        this.lastUpdatedAt = Date.now();
        return { trades, remainder: order.amount };
    }

    getState() {
        return {
            books:         this.books,
            lastUpdatedAt: this.lastUpdatedAt
        };
    }

    setState(state) {
        if (!state) return
        this.books         = state.books         || {};
        this.lastUpdatedAt = state.lastUpdatedAt || null;
    }

    initPair(symbol) {
        if (!this.books[symbol]) {
            this.books[symbol] = { bids: [], asks: [] };
        }
    }

    // Core matching loop — Price-Time Priority
    match(takerOrder, book) {
        const trades = [];

        // A BUY taker hits the ASK side (lowest ask first)
        // A SELL taker hits the BID side (highest bid first)
        const makers = takerOrder.side === SIDES.BUY
            ? book.asks
            : book.bids;

        while (makers.length > 0 && takerOrder.amount > 0) {
            const maker = makers[0];

            // Price crossing check
            const crossed = takerOrder.side === SIDES.BUY
                ? takerOrder.price >= maker.price
                : takerOrder.price <= maker.price;

            if (!crossed) break;

            const filled = Math.min(takerOrder.amount, maker.amount);

            trades.push({
                tradeId:   crypto.randomBytes(4).toString('hex'),
                symbol:    takerOrder.symbol,
                price:     maker.price,
                amount:    filled,
                takerId:   takerOrder.id,
                makerId:   maker.id,
                timestamp: Date.now()
            });

            takerOrder.amount -= filled;
            maker.amount      -= filled;

            if (maker.amount <= 0) makers.shift();
        }

        return trades;
    }

    //Add a (possibly partial) order to the correct side of the book. Maintains Price-Time Priority sort order.
    addToBook(order, book) {
        const list = order.side === SIDES.BUY ? book.bids : book.asks;

        if (list.find(o => o.id === order.id)) return;

        list.push({ ...order });

        if (order.side === SIDES.BUY) {
            list.sort((a, b) => b.price - a.price || a.timestamp - b.timestamp);
        } else {
            list.sort((a, b) => a.price - b.price || a.timestamp - b.timestamp);
        }
    }
}

module.exports = MatchingEngine