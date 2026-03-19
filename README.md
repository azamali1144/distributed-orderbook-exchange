# Distributed P2P Order Book Exchange

A distributed exchange built using the Grenache P2P networking framework.

Each running instance of the application **is** the order book. Clients submit orders directly to their **own local node**. That node processes
the order, then gossips it to every other node on the network — keeping all order books in sync with no central server, no database, and no filesystem dependency.

---

## Features

| Feature | Detail |
|---|---|
| **Own Order Book per Instance** | Every `node index.js` process runs its own `MatchingEngine` |
| **Client Submits to Own Node** | `client.js` uses `OWN_NODE_PORT` to target its local node only |
| **P2P Order Distribution** | `link.lookup()` finds all peers and pushes orders directly via RPC |
| **Price-Time Priority Matching** | Best price matched first; ties broken by earliest timestamp |
| **Partial Fill + Remainder** | Unmatched quantity is automatically added back to the order book |
| **Idempotency / Deduplication** | In-memory `Set` of processed order IDs prevents double-processing |
| **In-Memory Only** | Zero database or filesystem dependency |
| **Graceful Shutdown** | `SIGINT` / `SIGTERM` cleanly close transports and clear intervals |

---

## Project Structure

```  
distributed-orderbook-exchange/  
│  
├── src/  
│   ├── peer.js           # Core: RPC server, matching, gossip, deduplication  
│   ├── engine.js         # Matching engine: order book + price-time priority  
│   └── constants.js      # Shared service keys and configuration  
│  
├── client.js             # Submits an order to the client's OWN local node  
├── index.js              # Entry point: boots an OrderBookNode instance  
│  
├── .env                  # Local environment config (gitignored)  
├── .env.example          # Environment variable reference  
├── .gitignore  
├── package.json  
└── README.md  
```

---

### Install Grape Globally

```bash  
npm install -g grenache-grape  
```

---

## Installation

```bash  
# 1. Clone the repository  
git clone https://github.com/YOUR_USERNAME/distributed-orderbook-exchange.git  

# 2. Navigate into the project  
cd distributed-orderbook-exchange  

# 3. Install dependencies  
npm install  

# 4. Copy the environment config  
cp .env.example .env  
```

---

## Environment Configuration

```env  
# .env.example  

# Grape DHT URL — point to your local Grape instance  
GRAPE_URL=http://127.0.0.1:30001  

# e.g. [Node abc1234] RPC Port: 1342  
OWN_NODE_PORT=  
```

---

## Running the Application

You need at minimum **4 terminal windows** (2 Grapes + 2 Nodes + 1 Client per node).

---

### Step 1 — Start the Grape DHT Network

Grape forms the underlying DHT that all nodes use to discover each other.

```bash  
# Terminal 1 — Grape Node 1  
grape --dp 20001 --aph 30001 --bn '127.0.0.1:20002'  

# Terminal 2 — Grape Node 2  
grape --dp 20002 --aph 40001 --bn '127.0.0.1:20001'  
```

---

### Step 2 — Start Exchange Node Instances

Each instance is an independent order book. The RPC port is printed on startup.

```bash  
# Terminal 3 — Node A  
node index.js  
```

```  
Node a1b2c3d4: Order book node started  
Node a1b2c3d4: RPC Port  : 1342  
Node a1b2c3d4: Grape DHT : http://127.0.0.1:30001  
Node a1b2c3d4: Ready to accept orders  
```

```bash  
# Terminal 4 — Node B  
node index.js  
```

```  
Node e5f6a7b8: Order book node started  
Node e5f6a7b8: RPC Port  : 1756  
Node e5f6a7b8: Grape DHT : http://127.0.0.1:30001  
Node e5f6a7b8: Ready to accept orders  
```

---

### Step 3 — Submit Orders via the Client

Each client targets its **own node** by setting `OWN_NODE_PORT`.

```bash  
# Usage  
node client.js [symbol] [price] [amount] [side]  

# Defaults if no args: BTC/USD, $50000, 1.0, buy  
node client.js  
```

#### Example — Full Matching Scenario

```bash  
# Terminal 5 — Client A submits a SELL to Node A (port 1342)  
OWN_NODE_PORT=1342 node client.js BTC/USD 50000 2.0 sell  

# Terminal 6 — Client B submits a BUY to Node B (port 1756)  
OWN_NODE_PORT=1756 node client.js BTC/USD 50000 1.0 buy  
```

---

## Expected Output

### Node A — after Client A submits SELL 2.0 @ $50,000

```  
Node a1b2c3d4: CLIENT - SELL 2.0 BTC/USD @ \$50000  
Node a1b2c3d4: No match. Remainder 2.0 added to book.  
Node a1b2c3d4: Gossip - Order 2661312b sent to peer 127.0.0.1:1756  
```

### Node B — after receiving the gossip from Node A

```  
Node e5f6a7b8: GOSSIP - SELL 2.0 BTC/USD @ \$50000  
Node e5f6a7b8: No match. Remainder 2.0 added to book.  
```

### Node B — after Client B submits BUY 1.0 @ $50,000

```  
Node e5f6a7b8: CLIENT - BUY  1.0 BTC/USD @ \$50000  
Node e5f6a7b8: Okay Trade | 1.0 BTC/USD @ \$50000 | ID: ff3a1c2b  
Node e5f6a7b8: Gossip - Order a9b1c2d3 sent to peer 127.0.0.1:1342  
```

### Client B — response

```  
Client - Order accepted by own node!  
Client - Status    : MATCHED  
Client - Trades    : 1  
Client - Trade 1 | 1.0 BTC/USD @ \$50000 | ID: ff3a1c2b  
```

### Node A — after receiving the gossip from Node B

```  
Node a1b2c3d4: GOSSIP - BUY  1.0 BTC/USD @ \$50000  
Node a1b2c3d4: Trade | 1.0 BTC/USD @ \$50000 | ID: ff3a1c2b  
```

> Both nodes arrive at the **same state** -> Sell book now has 1.0 BTC/USD @ $50,000 remaining.

---

## Matching Engine Behaviour

```  
State: Empty order book  

1. SELL 2.0 BTC/USD @ $50,000  
   → Ask book empty before this, no match  
   → Remainder 2.0 added to Ask book  
   → Ask book: [ SELL 2.0 @ $50,000 ]  

2. BUY 1.0 BTC/USD @ $50,000  
   → Matches SELL 2.0 @ $50,000 (price crosses)  
   → Filled: 1.0 BTC @ $50,000  
   → Maker remainder: 1.0 → stays in Ask book  
   → Taker fully filled: nothing added to Bid book  
   → Ask book: [ SELL 1.0 @ $50,000 ]  

3. BUY 3.0 BTC/USD @ $50,000  
   → Matches SELL 1.0 @ $50,000 (full fill of maker)  
   → Filled: 1.0 BTC @ $50,000  
   → Taker remainder: 2.0 → added to Bid book  
   → Ask book: []  
   → Bid book: [ BUY 2.0 @ $50,000 ]  
```

---

## Limitations & Improvements

Given the 6–8 hour constraint, the following are known limitations:

| Limitation | How to Solve with More Time |
|---|---|
| **Race conditions** on simultaneous orders | Implement a per-symbol async queue (e.g. `async` library) to serialize order processing |
| **State sync on new node join** | Add a bootstrap RPC call to request a full order book snapshot from an existing peer |
| **No order cancellation** | Add a `CANCEL` order type handled by the engine and gossiped to peers |
| **No persistence** | Acceptable per spec, but could add optional snapshotting to recover after crash |
| **Gossip is direct RPC** | Could switch to a true Pub/Sub pattern using `grenache-nodejs-ws` for lower coupling |
| **No authentication** | Orders are trusted as-is; a real system would require signing |

---


Install with:

```bash  
npm install  
```
