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
        this.lnk.start();
        this.rpcServer.init();
        this.pub.init();
        this.sub.init();
        console.log('Peer components initialized');
    }
}

module.exports = OrderBookPeer;