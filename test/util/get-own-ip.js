import http from 'http';

export default function getProxiedIp() {
  return new Promise((resolve, reject) => {
    const params = {
      hostname: 'api.ipify.org',
      port: 80,
      path: '/',
      agent: false
    };

    const req = http.get(params, (res) => {
      res.setEncoding('utf8');
      res.on('readable', () => resolve(res.read()));
    });

    req.on('error', reject);
  });
}
