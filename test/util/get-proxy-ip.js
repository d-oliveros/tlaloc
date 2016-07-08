import shttp from 'socks5-https-client';

export default function getProxiedIp(proxyEndpoint) {
  return new Promise((resolve, reject) => {
    const [host, port] = proxyEndpoint.split(':');
    const params = {
      hostname: 'api.ipify.org',
      socksHost: host,
      socksPort: port,
      path: '/',
      rejectUnauthorized: false
    };

    const req = shttp.get(params, (res) => {
      res.setEncoding('utf8');
      res.on('readable', () => resolve(res.read()));
    });

    req.on('error', reject);
  });
}
