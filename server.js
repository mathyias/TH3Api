const express = require('express');
const cors = require('cors');
const { execSync, exec } = require('child_process');
const net = require('net');

const app = express();

app.use(express.json());
app.use(cors());

const PORT = 3000;
const TH3_CLI = '/home/ubuntu/TH3Coin/src/th3-cli';

const NODES = [
  'seed.th3chain.cloud',
  'seed2.th3chain.cloud'
];

const HISTORY_CACHE_TTL_MS = 15000;
const TX_CACHE_TTL_MS = 5 * 60 * 1000;

const historyCache = new Map();
const txCache = new Map();

function rpc(cmd) {
  try {
    return execSync(`${TH3_CLI} ${cmd}`)
      .toString()
      .trim();
  } catch (err) {
    throw new Error(err.stderr?.toString() || err.message);
  }
}

function rpcJson(cmd) {
  return JSON.parse(rpc(cmd));
}

function getCachedTx(txid) {
  const cached = txCache.get(txid);
  const now = Date.now();

  if (cached && now - cached.time < TX_CACHE_TTL_MS) {
    return cached.tx;
  }

  const tx = rpcJson(`getrawtransaction ${txid} true`);

  txCache.set(txid, {
    time: now,
    tx
  });

  return tx;
}

function isTH3Address(address) {
  return typeof address === 'string' && /^TH3[1-9A-HJ-NP-Za-km-z]{25,60}$/.test(address);
}

function isHex(value) {
  return typeof value === 'string' && /^[0-9a-fA-F]+$/.test(value);
}


// Human-readable API homepage
app.get('/', (req, res) => {
  let network = null;

  try {
    const height = parseInt(rpc('getblockcount'));
    const peers = parseInt(rpc('getconnectioncount'));
    const difficulty = parseFloat(rpc('getdifficulty'));
    const bestblock = rpc('getbestblockhash');
    const hashrate = parseFloat(rpc('getnetworkhashps'));

    network = {
      height,
      peers,
      difficulty,
      hashrate,
      bestblock
    };
  } catch (e) {
    network = null;
  }

  const number = (value) => Number(value || 0).toLocaleString('en-US');

  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TH3 API</title>
<link rel="icon" type="image/png" href="https://th3chain.cloud/favicon.png">
<link rel="apple-touch-icon" href="https://th3chain.cloud/apple-touch-icon.png">
<meta property="og:title" content="TH3 API">
<meta property="og:image" content="https://th3chain.cloud/assets/th3-logo.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="TH3 API">
<meta name="twitter:image" content="https://th3chain.cloud/assets/th3-logo.png">
<meta name="theme-color" content="#020617">
<style>
*{box-sizing:border-box}
body{
  margin:0;
  min-height:100vh;
  font-family:Inter,system-ui,Segoe UI,Arial,sans-serif;
  color:#f8fafc;
  background:
    radial-gradient(circle at top left,rgba(78,234,255,.16),transparent 34rem),
    linear-gradient(135deg,#102437,#071022 55%,#050816);
}
a{color:inherit}
.wrap{
  width:min(980px,calc(100% - 36px));
  margin:0 auto;
  padding:54px 0;
}
.hero{
  text-align:center;
  margin-bottom:28px;
}
.logo{
  width:84px;
  height:84px;
  object-fit:contain;
  filter:drop-shadow(0 10px 24px rgba(39,232,255,.25));
}
.kicker{
  margin-top:18px;
  color:#4eeaff;
  letter-spacing:.38em;
  font-size:12px;
  font-weight:900;
}
h1{
  margin:14px 0 10px;
  font-size:clamp(42px,8vw,82px);
  line-height:.95;
}
.hero p{
  margin:0 auto;
  max-width:680px;
  color:#9ca3af;
  font-size:17px;
  line-height:1.7;
}
.grid{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:16px;
}
.card{
  padding:22px;
  border-radius:22px;
  border:1px solid rgba(148,163,184,.22);
  background:linear-gradient(145deg,rgba(31,49,82,.94),rgba(21,31,55,.94));
  box-shadow:0 24px 80px rgba(0,0,0,.22);
}
.card.full{grid-column:1/-1}
h2{
  margin:0 0 14px;
  font-size:22px;
}
.rows{display:grid;gap:10px}
.row{
  display:grid;
  grid-template-columns:150px 1fr;
  gap:14px;
  padding:12px 13px;
  border-radius:14px;
  border:1px solid rgba(255,255,255,.1);
  background:rgba(255,255,255,.045);
}
.row span:first-child{
  color:#9ca3af;
  font-weight:800;
}
.code{
  font-family:ui-monospace,SFMono-Regular,Consolas,monospace;
  color:#4eeaff;
  overflow-wrap:anywhere;
}
.status{color:#4ade80;font-weight:900}
.links{
  display:flex;
  gap:10px;
  flex-wrap:wrap;
}
.btn{
  display:inline-flex;
  min-height:42px;
  align-items:center;
  justify-content:center;
  padding:0 14px;
  border-radius:14px;
  border:1px solid rgba(255,255,255,.14);
  background:rgba(255,255,255,.07);
  text-decoration:none;
  font-weight:800;
}
.btn-main{
  border:0;
  color:#03131a;
  background:linear-gradient(180deg,#7df8ff,#27e8ff);
}
@media(max-width:720px){
  .wrap{padding:32px 0}
  .grid{grid-template-columns:1fr}
  .row{grid-template-columns:1fr}
}

.social-strip {
  width: min(720px, calc(100% - 36px));
  margin: 42px auto 0;
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
}

.social-strip a {
  min-height: 40px;
  padding: 9px 15px;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 999px;
  background: rgba(15, 23, 42, .68);
  color: #f8fafc;
  text-decoration: none;
  font-size: 14px;
  font-weight: 800;
}

.social-strip span {
  width: 24px;
  height: 24px;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  background: #4eeaff;
  color: #020617;
  font-size: 11px;
  font-weight: 950;
}

</style>
</head>
<body>
<div class="wrap">
  <section class="hero">
    <a href="https://th3chain.cloud" aria-label="TH3Chain home">
      <img class="logo" src="https://th3chain.cloud/assets/th3-logo.png" alt="TH3Chain">
    </a>
    <div class="kicker">PUBLIC API</div>
    <h1>TH3 API</h1>
    <p>Live JSON endpoints for TH3Chain network, blocks, transactions, addresses and broadcasting.</p>
  </section>

  <section class="grid">
    <div class="card">
      <h2>Status</h2>
      <div class="rows">
        <div class="row"><span>API</span><span class="status">Online</span></div>
        <div class="row"><span>Chain</span><span>TH3</span></div>
        <div class="row"><span>Height</span><span>${network ? number(network.height) : 'Unavailable'}</span></div>
        <div class="row"><span>Peers</span><span>${network ? number(network.peers) : 'Unavailable'}</span></div>
        <div class="row"><span>Difficulty</span><span>${network ? network.difficulty : 'Unavailable'}</span></div>
      </div>
    </div>

    <div class="card">
      <h2>Official Links</h2>
      <div class="links">
        <a class="btn btn-main" href="https://th3chain.cloud">Website</a>
        <a class="btn" href="https://wallet.th3chain.cloud">Wallet</a>
        <a class="btn" href="https://explorer.th3chain.cloud">Explorer</a>
        <a class="btn" href="https://pool.th3chain.cloud">Pool</a>
        <a class="btn" href="https://th3chain.cloud/listing.html">Listing Info</a>
      </div>
    </div>

    <div class="card full">
      <h2>Endpoints</h2>
      <div class="rows">
        <div class="row"><span>Network</span><span class="code">GET /api/network</span></div>
        <div class="row"><span>Latest blocks</span><span class="code">GET /api/latest-blocks</span></div>
        <div class="row"><span>Block height</span><span class="code">GET /api/block-height/:height</span></div>
        <div class="row"><span>Block hash</span><span class="code">GET /api/block/:hash</span></div>
        <div class="row"><span>Transaction</span><span class="code">GET /api/tx/:txid</span></div>
        <div class="row"><span>Address</span><span class="code">GET /api/address/:address</span></div>
        <div class="row"><span>History</span><span class="code">GET /api/address/:address/history</span></div>
        <div class="row"><span>UTXOs</span><span class="code">GET /api/address/:address/utxos</span></div>
        <div class="row"><span>Broadcast</span><span class="code">POST /api/broadcast</span></div>
      </div>
    </div>
  </section>
</div>

<section class="social-strip" aria-label="TH3Chain social links">
  <a href="https://x.com/TH3ChainCloud" target="_blank" rel="noreferrer"><span>X</span>X / Twitter</a>
  <a href="https://t.me/TH3ChainCloud" target="_blank" rel="noreferrer"><span>TG</span>Telegram</a>
  <a href="mailto:contact@th3chain.cloud"><span>@</span>Contact</a>
</section>

</body>
</html>`);
});


// Network info
app.get('/api/network', (req, res) => {
  try {
    const height = parseInt(rpc('getblockcount'));
    const peers = parseInt(rpc('getconnectioncount'));
    const difficulty = parseFloat(rpc('getdifficulty'));
    const bestblock = rpc('getbestblockhash');
    const hashrate = parseFloat(rpc('getnetworkhashps'));

    res.json({
      chain: 'TH3',
      version: '1.0.0',
      height,
      peers,
      difficulty,
      hashrate,
      bestblock
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Latest blocks
app.get('/api/latest-blocks', (req, res) => {
  try {
    const height = parseInt(rpc('getblockcount'));
    const blocks = [];

    for (let i = 0; i < 10 && height - i >= 0; i++) {
      const blockHeight = height - i;
      const hash = rpc(`getblockhash ${blockHeight}`);
      const block = rpcJson(`getblock ${hash}`);

      blocks.push({
        height: block.height,
        hash: block.hash,
        time: block.time,
        txs: block.tx.length
      });
    }

    res.json(blocks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Block by height
app.get('/api/block-height/:height', (req, res) => {
  try {
    const hash = rpc(`getblockhash ${req.params.height}`);
    const block = rpcJson(`getblock ${hash}`);

    res.json(block);
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// Block by hash
app.get('/api/block/:hash', (req, res) => {
  try {
    const block = rpcJson(`getblock ${req.params.hash}`);

    res.json(block);
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// Transaction details
app.get('/api/tx/:txid', (req, res) => {
  try {
    const tx = getCachedTx(req.params.txid);

    res.json(tx);
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// Address balance
app.get('/api/address/:address', (req, res) => {
  try {
    const { address } = req.params;

    if (!isTH3Address(address)) {
      return res.status(400).json({ error: 'Invalid TH3 address' });
    }

    const result = rpcJson(
      `getaddressbalance '{"addresses":["${address}"]}'`
    );

    res.json({
      address,
      balance: result.balance / 100000000,
      received: result.received / 100000000
    });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// Address transactions
app.get('/api/address/:address/txs', (req, res) => {
  try {
    const { address } = req.params;

    if (!isTH3Address(address)) {
      return res.status(400).json({ error: 'Invalid TH3 address' });
    }

    const txs = rpcJson(
      `getaddresstxids '{"addresses":["${address}"]}'`
    );

    res.json(txs);
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// Address UTXOs
app.get('/api/address/:address/utxos', (req, res) => {
  try {
    const { address } = req.params;

    if (!isTH3Address(address)) {
      return res.status(400).json({ error: 'Invalid TH3 address' });
    }

    const height = parseInt(rpc('getblockcount'));

    const utxos = rpcJson(
      `getaddressutxos '{"addresses":["${address}"]}'`
    );

    res.json(
      utxos.map((u) => ({
        txid: u.txid,
        vout: u.outputIndex,
        satoshis: u.satoshis,
        amount: u.satoshis / 100000000,
        scriptPubKey: u.script,
        confirmations: u.height > 0 ? height - u.height + 1 : 0
      }))
    );
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// Address rich history
app.get('/api/address/:address/history', (req, res) => {
  try {
    const { address } = req.params;

    if (!isTH3Address(address)) {
      return res.status(400).json({ error: 'Invalid TH3 address' });
    }

    const limit = Math.min(
      Math.max(parseInt(req.query.limit || '50'), 1),
      200
    );

    const height = parseInt(rpc('getblockcount'));
    const cacheKey = `${address}:${limit}:${height}`;
    const cached = historyCache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.time < HISTORY_CACHE_TTL_MS) {
      return res.json(cached.history);
    }

    const txids = rpcJson(
      `getaddresstxids '{"addresses":["${address}"]}'`
    );

    const recentTxids = txids.slice(-limit);

    const history = recentTxids.map((txid) => {
      const tx = getCachedTx(txid);

      let received = 0;
      let sentInput = 0;
      let sentToOthers = 0;
      let change = 0;

      const isCoinbase = Array.isArray(tx.vin) && tx.vin.some((vin) => vin.coinbase);

      if (Array.isArray(tx.vout)) {
        tx.vout.forEach((vout) => {
          const value = Number(vout.value || 0);
          const addresses = vout.scriptPubKey?.addresses || [];

          if (addresses.includes(address)) {
            received += value;
          } else {
            sentToOthers += value;
          }
        });
      }

      if (!isCoinbase && Array.isArray(tx.vin)) {
        tx.vin.forEach((vin) => {
          if (!vin.txid || vin.coinbase) return;

          try {
            const prevTx = getCachedTx(vin.txid);
            const prevOut = prevTx.vout?.[vin.vout];
            const prevAddresses = prevOut?.scriptPubKey?.addresses || [];

            if (prevAddresses.includes(address)) {
              sentInput += Number(prevOut.value || 0);
            }
          } catch (e) {
            // Skip missing prevout so one old tx does not break history.
          }
        });
      }

      let type = 'related';
      let amount = received;
      let fee = 0;

      if (isCoinbase && received > 0) {
        type = tx.confirmations >= 100 ? 'mining' : 'immature_mining';
        amount = received;
      } else if (sentInput > 0) {
        change = received;
        fee = Math.max(sentInput - sentToOthers - change, 0);

        if (sentToOthers > 0) {
          type = 'sent';
          amount = -sentToOthers;
        } else {
          type = 'self';
          amount = -fee;
        }
      } else if (received > 0) {
        type = 'received';
        amount = received;
      }

      return {
        txid: tx.txid,
        type,
        amount,
        fee,
        change,
        received,
        sentInput,
        sentToOthers,
        confirmations: tx.confirmations || 0,
        time: tx.time || null,
        size: tx.size || 0,
        blockhash: tx.blockhash || null
      };
    }).reverse();

    historyCache.set(cacheKey, {
      time: now,
      history
    });

    res.json(history);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Broadcast signed raw transaction
app.post('/api/broadcast', (req, res) => {
  try {
    const { rawTx } = req.body;

    if (!rawTx || !isHex(rawTx)) {
      return res.status(400).json({
        error: 'Invalid raw transaction hex'
      });
    }

    const txid = rpc(`sendrawtransaction ${rawTx}`);

    res.json({
      success: true,
      txid
    });
  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

// Legacy node-wallet send.
// Keep this only for admin/testing. TH3 Wallet should use /api/broadcast.
app.post('/api/send', async (req, res) => {
  try {
    const { address, amount } = req.body;
    const walletInfo = rpcJson('getwalletinfo');

    if (!isTH3Address(address)) {
      return res.status(400).json({
        error: 'Invalid TH3 address'
      });
    }

    if (Number(amount) <= 0) {
      return res.status(400).json({
        error: 'Invalid amount'
      });
    }

    if (Number(amount) > walletInfo.balance) {
      return res.status(400).json({
        error: 'Insufficient balance'
      });
    }

    exec(
      `${TH3_CLI} sendtoaddress "${address}" ${amount}`,
      (err, stdout) => {
        if (err) {
          return res.status(500).json({
            error: err.message
          });
        }

        res.json({
          success: true,
          txid: stdout.trim()
        });
      }
    );
  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

// Node seed status
app.get('/api/nodes', async (req, res) => {
  const checkNode = (host) =>
    new Promise((resolve) => {
      const socket = new net.Socket();

      socket.setTimeout(2000);

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => resolve(false));

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(8767, host);
    });

  const results = await Promise.all(
    NODES.map(checkNode)
  );

  res.json({
    nodes: results.filter(Boolean).length
  });
});

app.listen(PORT, () => {
  console.log(`TH3 Explorer API running on port ${PORT}`);
});