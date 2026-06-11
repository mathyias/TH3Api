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