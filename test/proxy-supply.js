import { expect } from 'chai';
import ProxySupply from '../src/cluster/proxy-supply';
import { createRedisPubSub } from '../src/pubsub';
import constants from '../src/constants';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const redisConfig = {
  host: '127.0.0.1',
  port: 6379
};

describe('Proxy Supply', () => {
  it('should create a redis pubsub', async () => {
    const endpoint = '127.0.0.1:1337';
    const supply = new ProxySupply({ endpoint });

    expect(supply.available).to.equal(false);
    expect(supply.pubsub).to.equal(null);

    await supply.connect(redisConfig);

    expect(supply.available).to.equal(true);
    expect(supply.pubsub).to.be.an('object');
  });

  it('should provide a proxy endpoint & drop more proxy requests', async () => {
    const endpoint = '127.0.0.1:1337';
    const supply = new ProxySupply({ endpoint });
    await supply.connect(redisConfig);

    const pubsub = await createRedisPubSub(redisConfig);

    await new Promise((resolve) => {
      pubsub.onceMessage(constants.PROXY_OFFER, resolve);
      pubsub.send(constants.PROXY_REQUEST);
    });

    const data1 = await new Promise((resolve) => {
      pubsub.onceMessage(constants.PROXY_DELIVER, resolve);
      pubsub.sendMessage(constants.PROXY_LINK, endpoint);
    });

    expect(data1.payload).to.equal(endpoint);
    expect(supply.available).to.equal(false);

    await new Promise((resolve) => {
      pubsub.onceMessage(constants.PROXY_LINK_DROP, resolve);
      pubsub.sendMessage(constants.PROXY_LINK, endpoint);
    });
  });

  it('should fail due to timed out heartbeats', async () => {
    const endpoint = '127.0.0.1:1337';
    const supply = new ProxySupply({ endpoint, heartbeatTTL: 300 });
    await supply.connect(redisConfig);

    const pubsub = await createRedisPubSub(redisConfig);

    await new Promise((resolve) => {
      pubsub.onceMessage(constants.PROXY_DELIVER, resolve);
      pubsub.sendMessage(constants.PROXY_LINK, endpoint);
    });

    expect(supply.available).to.equal(false);

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('not timed out')), 1000);
      supply.pubsub.once(constants.PROXY_TIMEOUT, () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    expect(supply.available).to.equal(true);

    const data1 = await new Promise((resolve) => {
      pubsub.onceMessage(constants.PROXY_DELIVER, resolve);
      pubsub.sendMessage(constants.PROXY_LINK, endpoint);
    });

    expect(data1.payload).to.equal(endpoint);
    expect(supply.available).to.equal(false);
  });

  it('should unlink a running proxy link', async () => {
    const endpoint = '127.0.0.1:1337';
    const supply = new ProxySupply({ endpoint, heartbeatTTL: 300 });
    await supply.connect(redisConfig);

    const pubsub = await createRedisPubSub(redisConfig);

    await new Promise((resolve) => {
      pubsub.onceMessage(constants.PROXY_DELIVER, resolve);
      pubsub.sendMessage(constants.PROXY_LINK, endpoint);
    });

    expect(supply.available).to.equal(false);

    pubsub.sendMessage(constants.PROXY_DROP, endpoint);
    await sleep(50);

    expect(supply.available).to.equal(true);

    const data1 = await new Promise((resolve) => {
      pubsub.onceMessage(constants.PROXY_DELIVER, resolve);
      pubsub.sendMessage(constants.PROXY_LINK, endpoint);
    });

    expect(data1.payload).to.equal(endpoint);
    expect(supply.available).to.equal(false);
  });
});
