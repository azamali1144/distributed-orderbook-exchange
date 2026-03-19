# Distributed P2P Order Book Exchange

A decentralized, peer-to-peer limit order matching engine.

Each node in the network acts as an independent exchange participant. Nodes discover
each other via a **Distributed Hash Table (DHT)**, synchronize state on startup, and
propagate orders in real-time using a **Gossip (Pub/Sub)** protocol — with no central
server, no database, and no filesystem dependency.

---

## Features

- **Fully Decentralized** — No central server. Peers discover each other via
  Grenache DHT (Grape).
- **Price-Time Priority Matching** — Industry-standard matching logic. Best
  price executes first, ties broken by earliest timestamp.
- **Partial Fill Support** — Large orders are partially matched. Unfilled
  remainder is automatically added back to the order book.
- **Gossip Protocol** — Orders are propagated to all peers via Pub/Sub,
  ensuring a consistent distributed state across the network.
- **State Bootstrap / Sync** — New nodes joining the network automatically
  request a full state snapshot from existing peers.
- **Deduplication** — Each node tracks processed order IDs via an in-memory
  `Set` to prevent infinite gossip loops.
- **Graceful Shutdown** — Nodes handle `SIGINT` and `SIGTERM` cleanly,
  closing all transports and clearing intervals.
- **In-Memory Only** — No database or filesystem writes, as per challenge
  requirements.

---

## Project Structure

```  
distributed-orderbook-exchange/  
│  
├── src/  
│   ├── peer.js           # P2P node: RPC server, Pub/Sub gossip, bootstrap  
│   ├── engine.js         # Matching engine: order book logic, price-time priority  
│   └── constants.js      # Shared service names, keys, and enums  
│  
├── client.js             # CLI client to submit orders to the network  
├── index.js              # Entry point: initializes and starts a Peer node  
│  
├── .env                  # Local environment config (not committed)  
├── .env.example          # Environment variable reference template  
├── .gitignore  
├── package.json  
└── README.md  
```

---

## Prerequisites

| Requirement | Version | Notes                                  |
|-------------|---------|----------------------------------------|
| Node.js     | v14+    | nodejs.org                             |
| npm         | v6+     | Bundled with Node.js                   |
| Grape       | latest  | Grenache DHT node — install instructions below |

### Install Grape Globally

```bash  
npm install -g grenache-grape  
```

---

## Installation

```bash  
# 1. Clone the repository  
git clone https://github.com/YOUR_USERNAME/distributed-orderbook-exchange.git  

# 2. Navigate into the project directory  
cd distributed-orderbook-exchange  

# 3. Install dependencies  
npm install  

# 4. Set up your environment config  
cp .env.example .env  
```

---

## Environment Configuration

Copy `.env.example` to `.env` and adjust values as needed:

```env  
# Grape DHT Configuration  
GRPES_BASE_URL=http://127.0.0.1  
GRPES_PORT=30001  
GRPES_TIMEOUT=5000  

# Service Timeouts (ms)  
ORDER_BOOK_SERVICE_TIMEOUT=10000  
ORDER_BOOK_GOSSIP_TIMEOUT=10000  
ORDER_BOOK_SYNC_TIMEOUT=10000  
```
---

## Running the Application

You will need at least **4 terminal windows**.

### Step 1 — Start the Grape DHT Network

Grape nodes form the underlying DHT that peers use for service discovery.

```bash  
# Terminal 1 — Grape Node 1  
grape --dp 20001 --aph 30001 --bn '127.0.0.1:20002'  

# Terminal 2 — Grape Node 2  
grape --dp 20002 --aph 40001 --bn '127.0.0.1:20001'  
```

Wait for both nodes to print `ready` before proceeding.

---

### Step 2 — Start Exchange Peer Nodes

Each instance runs an independent order book node. Run as many as you like.

```bash  
# Terminal 3 — Peer Node 1  
node index.js  

# Terminal 4 — Peer Node 2  
node index.js  
```

**Expected output per node:**

```  
[Peer a1b2c3d4] Started  
[Peer a1b2c3d4] RPC  Port : 11342  
[Peer a1b2c3d4] Pub  Port : 10567  

[Bootstrap] Looking up peers for state sync...  
[Bootstrap] No peers found — starting as Genesis node  
```

When a **second** node starts and finds the first:

```  
[Bootstrap] Looking up peers for state sync...  
[Bootstrap] Applying network state snapshot...  
[Bootstrap] State synchronized  
```

---

### Step 3 — Submit Orders via Client

The client accepts optional CLI arguments. If omitted, defaults are used.

```bash  
# Usage  
node client.js [symbol] [price] [amount] [side]  

# Examples  
node client.js BTC/USD 50000 1.5 buy  
node client.js BTC/USD 49500 0.5 sell  
node client.js ETH/USD 3000 2.0 buy  

# Use defaults (BTC/USD, $50000, 0.1, buy)  
node client.js  
```

**Expected client output:**

```  
[Client] Submitting Order:  
   Symbol : BTC/USD  
   Side   : BUY  
   Amount : 1.5  
   Price  : \$50000  
   ID     : a1b2c3d4e5f6g7h8  

[Client] Looking for available peers... (attempt 1)  

[Success]    Order Accepted!  
   Status  : PROCESSED  
   Peer    : a1b2c3d4  
   Matches : 0  
```

**Expected peer node output:**

```  
[RPC] Order received from client → BUY 1.5 BTC/USD @ \$50000  
[Worker] Order a1b2c3d4: 0 trade(s) matched  
[Gossip] Order a1b2c3d4 broadcasted to peers  

# On the second peer node (via Gossip):  
[Gossip] Order received from peer → BUY 1.5 BTC/USD @ \$50000  
[Worker] Order a1b2c3d4: 0 trade(s) matched  
```

---

## Order Matching Scenario

The following demonstrates the matching engine behavior across two nodes:

```  
1.  Submit: SELL 1.0 BTC/USD @ $50,000  
    → No matching bids in book.  
    → Order added to Ask book.  
    → Gossiped to all peers. Both nodes now have identical Ask book.  

2.  Submit: BUY 0.5 BTC/USD @ $50,000  
    → Matches 0.5 BTC from the existing SELL order.  
    → Trade executed: 0.5 BTC @ $50,000  
    → Remainder: 0.5 BTC SELL left in Ask book.  
    → Gossiped to all peers. Both nodes update identically.  

3.  Submit: BUY 1.0 BTC/USD @ $50,000  
    → Matches remaining 0.5 BTC from the SELL order. (partial fill)  
    → Trade executed: 0.5 BTC @ $50,000  
    → Remainder: 0.5 BTC BUY added to Bid book.  
    → Both nodes remain in sync.  
```
