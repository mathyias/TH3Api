const formatNumber = (value) => Number(value || 0).toLocaleString('en-US');

const formatHashrate = (value) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '-';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GH/s';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + ' MH/s';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + ' KH/s';
  return n.toFixed(2) + ' H/s';
};

const setText = (id, value) => {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
};

const setStatus = (value, className) => {
  const element = document.getElementById('apiStatus');
  if (!element) return;
  element.textContent = value;
  element.classList.remove('status-online', 'status-warn');
  element.classList.add(className);
};

fetch('/api/network')
  .then((response) => {
    if (!response.ok) throw new Error('Network unavailable');
    return response.json();
  })
  .then((network) => {
    setStatus('Online', 'status-online');
    setText('height', formatNumber(network.height));
    setText('peers', formatNumber(network.peers));
    setText('difficulty', network.difficulty ?? '-');
    setText('hashrate', formatHashrate(network.hashrate));
    setText('bestblock', network.bestblock || '-');
    setText('version', network.version || '-');
  })
  .catch(() => {
    setStatus('Limited', 'status-warn');
    setText('height', '-');
    setText('peers', '-');
    setText('difficulty', '-');
    setText('hashrate', '-');
    setText('bestblock', '-');
    setText('version', '-');
  });
