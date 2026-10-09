// @ts-check
const dgram = require('node:dgram');
const http = require('node:http');
const https = require('node:https');
const os = require('node:os');
const { URL } = require('node:url');

/**
 * Calculates broadcast address and subnet prefix for IPv4 interfaces
 */
function getLocalSubnets() {
  const interfaces = os.networkInterfaces();
  const subnets = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const ipParts = iface.address.split('.').map(Number);
        const maskParts = iface.netmask.split('.').map(Number);

        if (ipParts.length === 4 && maskParts.length === 4) {
          // Calculate broadcast address
          const broadcastParts = ipParts.map((part, i) => part | (~maskParts[i] & 255));
          const broadcast = broadcastParts.join('.');
          const subnetBase = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;

          subnets.push({
            iface: name,
            ip: iface.address,
            netmask: iface.netmask,
            broadcast,
            subnetBase
          });
        }
      }
    }
  }

  return subnets;
}

/**
 * Quick HTTP GET request with abort controller
 * @param {string} targetUrl
 * @param {number} timeoutMs
 */
function pingHttp(targetUrl, timeoutMs = 800) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    try {
      const parsed = new URL(targetUrl);
      const isHttps = parsed.protocol === 'https:';
      const transport = isHttps ? https : http;

      const req = transport.get(
        targetUrl,
        {
          timeout: timeoutMs,
          rejectUnauthorized: false
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            const latency = Date.now() - startTime;
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const parsedData = JSON.parse(data);
                if (parsedData.app === 'nexusflow-pos' || parsedData.status === 'ok') {
                  resolve({
                    ok: true,
                    latency,
                    url: targetUrl,
                    data: parsedData
                  });
                  return;
                }
              } catch {
                // Non-JSON response
              }
            }
            resolve({ ok: false, latency, error: `HTTP ${res.statusCode}` });
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: 'Timeout' });
      });

      req.on('error', (err) => {
        resolve({ ok: false, error: err.message });
      });
    } catch (err) {
      resolve({ ok: false, error: err.message });
    }
  });
}

/**
 * Tests connection to a candidate server URL
 * @param {string} candidate
 * @param {number} timeoutMs
 */
async function testServer(candidate, timeoutMs = 1500) {
  let normalized = candidate.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `http://${normalized}`;
  }
  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, '');

  const pingUrl = `${normalized}/api/ping`;
  const result = await pingHttp(pingUrl, timeoutMs);

  if (result.ok) {
    return {
      ok: true,
      url: normalized,
      latency: result.latency,
      serverName: result.data.name || 'NexusFlow Retail POS',
      version: result.data.version || '0.0.1',
      addresses: result.data.addresses || []
    };
  }

  return {
    ok: false,
    url: normalized,
    error: result.error || 'Server not reachable'
  };
}

/**
 * Comprehensive LAN scanner combining UDP Broadcast, Localhost probe, and Subnet ping
 * @param {{ ports?: number[], onFoundServer?: (server: any) => void }} options
 */
async function scanLAN(options = {}) {
  const ports = options.ports || [3000, 5173];
  const discoveredMap = new Map();

  function reportServer(server) {
    if (!discoveredMap.has(server.url)) {
      discoveredMap.set(server.url, server);
      if (typeof options.onFoundServer === 'function') {
        options.onFoundServer(server);
      }
    }
  }

  // 1. Localhost probe (in case server is on this machine)
  const localhostCandidates = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173'
  ];

  const localhostPromises = localhostCandidates.map(async (url) => {
    const res = await testServer(url, 600);
    if (res.ok) {
      reportServer({
        ...res,
        type: 'localhost',
        isLocal: true
      });
    }
  });

  // 2. UDP Broadcast Beacon Discovery
  const udpPromise = new Promise((resolve) => {
    let clientSocket = null;
    let timer = null;

    try {
      clientSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      clientSocket.on('error', () => {
        // Suppress UDP socket errors gracefully
      });

      clientSocket.on('message', async (msg, rinfo) => {
        try {
          const payload = JSON.parse(msg.toString());
          if (payload.app === 'nexusflow-pos') {
            const port = payload.port || 3000;
            const targetUrl = `http://${rinfo.address}:${port}`;
            const res = await testServer(targetUrl, 1000);
            if (res.ok) {
              reportServer({
                ...res,
                type: 'udp-broadcast',
                ip: rinfo.address,
                port
              });
            }
          }
        } catch {
          // ignore non-JSON messages
        }
      });

      clientSocket.bind(0, () => {
        try {
          clientSocket.setBroadcast(true);

          const probeBuffer = Buffer.from('NEXUSFLOW_DISCOVER');
          // Broadcast to global 255.255.255.255
          clientSocket.send(probeBuffer, 41234, '255.255.255.255');

          // Broadcast to all interface specific broadcast addresses
          const subnets = getLocalSubnets();
          for (const s of subnets) {
            clientSocket.send(probeBuffer, 41234, s.broadcast);
          }
        } catch {
          // ignore
        }
      });

      // Close UDP discovery after 2.5 seconds
      timer = setTimeout(() => {
        try {
          if (clientSocket) {
            clientSocket.close();
          }
        } catch {}
        resolve(null);
      }, 2500);
    } catch {
      resolve(null);
    }
  });

  // 3. Fast Parallel Subnet Sweep (HTTP /api/ping)
  const subnetSweepPromise = (async () => {
    const subnets = getLocalSubnets();
    if (subnets.length === 0) return;

    // Scan the primary subnet
    const primary = subnets[0];
    const candidateIps = [];

    // Prioritize own IP and neighboring range
    const ownLastOctet = Number(primary.ip.split('.')[3]);
    const octets = [];

    // Add own IP first
    octets.push(ownLastOctet);
    // Add 1..254
    for (let i = 1; i <= 254; i++) {
      if (i !== ownLastOctet) octets.push(i);
    }

    for (const octet of octets) {
      candidateIps.push(`${primary.subnetBase}.${octet}`);
    }

    // Worker pool for concurrency to prevent socket exhaustion
    const CONCURRENCY = 45;
    let idx = 0;

    async function worker() {
      while (idx < candidateIps.length) {
        const ip = candidateIps[idx++];
        for (const port of ports) {
          const url = `http://${ip}:${port}`;
          if (discoveredMap.has(url)) continue;

          try {
            const res = await pingHttp(`${url}/api/ping`, 450);
            if (res.ok) {
              reportServer({
                ok: true,
                url,
                latency: res.latency,
                serverName: res.data?.name || 'NexusFlow Retail POS',
                version: res.data?.version || '0.0.1',
                addresses: res.data?.addresses || [ip],
                type: 'subnet-scan',
                ip,
                port
              });
            }
          } catch {
            // ignore
          }
        }
      }
    }

    const workers = Array.from({ length: CONCURRENCY }, () => worker());
    await Promise.all(workers);
  })();

  // Run all discovery methods in parallel
  await Promise.all([localhostPromises, udpPromise, subnetSweepPromise]);

  return Array.from(discoveredMap.values());
}

module.exports = {
  getLocalSubnets,
  pingHttp,
  testServer,
  scanLAN
};
