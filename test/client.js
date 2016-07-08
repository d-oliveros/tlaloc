import { expect } from 'chai';
import path from 'path';
import { times } from 'lodash';
import createError from 'http-errors';
import constants from '../src/constants';
import Client from '../src/client';
import Cluster from '../src/cluster';
import getProxyIp from './util/get-proxy-ip';
import getOwnIp from './util/get-own-ip';
import ipRegex from './util/ip-regex';

const redisConfig = {
  host: '127.0.0.1',
  port: 6379
};

const clusterConfig = {
  dataDir: path.resolve(__dirname, 'data'),
  torInstances: 3,
  portRangeStart: 10770,
  redis: redisConfig
};

// import sinon from 'sinon';
// const spy = sinon.spy();

describe('Client', () => {
  describe('Lib', () => {
    it('should connect to redis and wait for ready state', async () => {
      const client = new Client();

      expect(client.proxy).to.equal(null);
      expect(client.pubsub).to.equal(null);
      expect(client.started).to.equal(false);

      const promise = client.connect();

      expect(client.started).to.equal(true);
      expect(client.pubsub).to.equal(null);

      await promise;

      expect(client.pubsub).to.be.an('object');
      client.destroy();
    });

    it('should try to get a proxy and timeout', async () => {
      const client = new Client({
        requestTimeout: 90,
        requestInterval: 20
      });

      await client.connect(redisConfig);

      try {
        await client.getProxy();
        throw createError(409, 'Proxy did not timed out');
      } catch (err) {
        if (err.status !== 408) throw err;
        client.destroy();
      }
    });
  });

  describe('Cluster Communication', function () {
    this.timeout(120000);

    let cluster;

    afterEach(async () => {
      if (cluster) {
        await cluster.disconnect();
        cluster = null;
      }
    });

    it('should get proxies from the cluster', async () => {
      cluster = new Cluster(clusterConfig);
      await cluster.connect();

      const clients = [];

      // the cluster has three tor instances, so we should get
      // three proxies out of four clients, and one client should timeout
      await Promise.all(times(3, async () => {
        const client = new Client();

        await client.connect(redisConfig);

        const proxy = await client.getProxy();
        expect(proxy.host).to.equal('127.0.0.1');
        expect(proxy.port).to.be.gte(10770).and.lte(10780);
        expect(proxy.active).to.equal(true);

        clients.push(client);
      }));

      try {
        const client = new Client({
          requestInterval: 500,
          requestTimeout: 2000
        });
        clients.push(client);
        await client.connect(redisConfig);
        await client.getProxy();
        throw createError(409, 'Proxy did not timed out');
      } catch (err) {
        if (err.status !== 408) throw err;
      }

      for (const client of clients) {
        client.destroy();
      }
    });

    it('should fail due to heartbeat timeout', async () => {
      cluster = new Cluster({ ...clusterConfig, torInstances: 1 });
      await cluster.connect();

      // should fail because its sending heartbeats slower than the TTL
      const client = new Client({
        heartbeatInterval: 1000,
        heartbeatTTL: 300
      });

      await client.connect(redisConfig);

      const proxy = await client.getProxy();

      await new Promise((resolve, reject) => {
        proxy.once(constants.PROXY_TIMEOUT, resolve);
        setTimeout(() => {
          proxy.removeListener(constants.PROXY_TIMEOUT, resolve);
          reject(new Error('Proxy did not time out'));
        }, 1000);
      });
    });

    it('should stay alive by sending heartbeats', async () => {
      cluster = new Cluster({ ...clusterConfig, torInstances: 1 });
      await cluster.connect();

      const client = new Client({
        heartbeatInterval: 100,
        heartbeatTTL: 300
      });

      await client.connect();

      const proxy = await client.getProxy();

      await new Promise((resolve, reject) => {
        const fail = () => reject(new Error('Proxy timed out'));
        proxy.once(constants.PROXY_TIMEOUT, fail);
        setTimeout(() => {
          proxy.removeListener(constants.PROXY_TIMEOUT, fail);
          resolve();
        }, 1000);
      });
    });

    it('should unlink a running proxy link', async () => {
      cluster = new Cluster({ ...clusterConfig, torInstances: 1 });
      await cluster.connect();

      const client1 = new Client();
      await client1.connect(redisConfig);
      const proxy1 = await client1.getProxy();

      const client2 = new Client();
      await client2.connect(redisConfig);

      proxy1.unlink();

      // first proxy has been dropped, second client should get proxy
      await client2.getProxy();
    });

    it('should have a unique IP and make requests through tor proxies', async () => {
      cluster = new Cluster({ ...clusterConfig, torInstances: 1 });
      await cluster.connect();

      const client1 = new Client();
      await client1.connect(redisConfig);
      const proxy1 = await client1.getProxy();

      const ownIp = await getOwnIp();
      const proxyIp = await getProxyIp(proxy1.endpoint);

      expect(ipRegex.test(proxyIp));
      expect(ipRegex.test(ownIp));
      expect(proxyIp !== ownIp);
    });
  });
});
