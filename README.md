# Distributed P2P Order Book Exchange

A decentralized, peer-to-peer order matching engine built on top of the
[Grenache](https://github.com/bitfinexcom/grenache) networking framework
by Bitfinex. Each node in the network maintains its own synchronized
order book and communicates with other nodes via a Distributed Hash
Table (DHT) and Gossip (Pub/Sub) protocol.

---

## Project Structure

src/peer.js: Manages P2P connectivity, RPC server, and Pub/Sub gossip.

src/engine.js: Core matching engine logic (Deterministic).

src/constants.js: Shared configuration and service names.

client.js: Test script to simulate a user submitting an order.

index.js: Entry point for starting an exchange node.


---

## Prerequisites

Ensure you have the following installed:

| Requirement | Version  | Link                                        |
|-------------|----------|---------------------------------------------|
| Node.js     | v14+     | https://nodejs.org                          |
| npm         | v6+      | Comes with Node.js                          |
| Grape       | latest   | https://github.com/bitfinexcom/grenache-grape |

### Install Grape globally:
 
npm install -g grenache-grape

---

## Installation

### 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/distributed-p2p-orderbook.git

### 2. Navigate into the project
cd distributed-p2p-orderbook

### 3. Install dependencies
npm install

### 4. Copy environment config
cp .env.example .env

---

## Configuration
Edit your .env file:
### Grape DHT URL
GRAPE_URL=http://127.0.0.1:30001

### Base RPC Port for peer nodes
### Each instance will pick a random offset from this base
BASE_RPC_PORT=10001

---

## Running the Application
You will need 4 terminal windows in total.

### Step 1 — Start the Grape DHT Network
#### Terminal 1: Grape Node 1
grape --dp 20001 --aph 30001 --bn '127.0.0.1:20002'

#### Terminal 2: Grape Node 2
grape --dp 20002 --aph 40001 --bn '127.0.0.1:20001'

### Step 2 — Start Peer Nodes
#### Terminal 3: Start Exchange Node 1
node index.js

#### Terminal 4: Start Exchange Node 2
node index.js

#### Output should be like this
Node running on port 10342

Node running on port 10567


### Step 3 — Submit Orders via Client
#### Terminal 5: Submit a random Buy/Sell order
node client.js

#### Output should be like this
Sending Order: {
id: 'a1b2c3d4...',
symbol: 'BTC/USD',
side: 'buy',
price: 50023.45,
amount: 1.5,
timestamp: 1710234567890
}
Response: { status: 'ACCEPTED', id: 'a1b2c3d4...' }


#### In both peer terminals, the order will be processed
[LOCAL]  Processing buy 1.5 BTC/USD @ 50023.45

[GOSSIP] Processing buy 1.5 BTC/USD @ 50023.45