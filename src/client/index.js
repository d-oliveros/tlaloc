import ms from 'ms';
import createError from 'http-errors';
import shortid from 'shortid';
import assert from 'assert';
import createDebugger from 'debug';
import { isObject } from 'lodash';
import { createRedisPubSub } from '../pubsub';
import constants from '../constants';
import ProxyLink from './proxy-link';

const {
  PROXY_REQUEST,
  PROXY_OFFER,
  PROXY_LINK,
  PROXY_LINK_DROP,
  PROXY_DELIVER
} = constants;

const PROXY_REQUEST_INTERVAL = ms('1s');
const PROXY_REQUEST_TIMEOUT = ms('20s');
const PROXY_HEARTBEAT_INTERVAL = ms('1s');
const PROXY_HEARTBEAT_TTL = ms('5s');

const defaultRedisConfig = {
  host: '127.0.0.1',
  port: 6379
};

export default class Client {
  constructor(config = {}) {
    assert(isObject(config), 'Invalid config');

    this.proxy = null;
    this.pubsub = null;
    this.started = false;
    this.id = shortid.generate();

    this.debug = createDebugger(`tlaloc:client:${this.id}`);

    this.requestInterval = config.requestInterval || PROXY_REQUEST_INTERVAL;
    this.requestTimeout = config.requestTimeout || PROXY_REQUEST_TIMEOUT;
    this.heartbeatInterval = config.heartbeatInterval || PROXY_HEARTBEAT_INTERVAL;
    this.heartbeatTTL = config.heartbeatTTL || PROXY_HEARTBEAT_TTL;

    // bind methods to self
    this.emitProxyRequest = ::this.emitProxyRequest;
    this.onProxyOffer = ::this.onProxyOffer;
    this.onProxyLink = ::this.onProxyLink;
    this.onProxyLinkDrop = ::this.onProxyLinkDrop;

    this.debug('Creating new client');
  }

  async connect(redisConfig = defaultRedisConfig) {
    assert(isObject(redisConfig), 'Invalid redis config');
    assert(!this.started, 'Client already started');

    const { host, port } = redisConfig;
    this.debug(`Connecting to ${host}:${port}`);
    this.started = true;

    this.pubsub = await createRedisPubSub({ port, host, id: this.id });

    this.debug('PubSub connected');
  }

  getProxy() {
    return new Promise((resolve, reject) => {
      assert(this.pubsub, 'Redis PubSub has not been started');
      this.proxyResolver = resolve;
      this.proxyReject = reject;

      this.requestProxy();
    });
  }

  requestProxy() {
    this.debug('Requesting proxy');

    this.pubsub.onceMessage(PROXY_OFFER, this.onProxyOffer);

    this.proxyRequesterInterval = setInterval(this.emitProxyRequest, this.requestInterval);

    this.proxyRequesterTimeout = setTimeout(() => {
      this.debug('Proxy request timeout');
      this.removeHandlers();
      this.proxyReject(createError(408));
    }, this.requestTimeout);

    this.emitProxyRequest();
  }

  emitProxyRequest() {
    this.pubsub.send(PROXY_REQUEST);
  }

  onProxyOffer({ clientId }) {
    this.debug(`Proxy offered by ${clientId}`);
    this.removeHandlers();
    this.debug('Requesting proxy link');
    this.pubsub.onceMessage(PROXY_LINK_DROP, this.onProxyLinkDrop);
    this.pubsub.onceMessage(PROXY_DELIVER, this.onProxyLink);
    this.pubsub.sendMessage(PROXY_LINK, clientId);
  }

  onProxyLink(data) {
    this.debug('Proxy link from', data);
    this.removeHandlers();

    this.proxy = new ProxyLink({
      pubsub: this.pubsub,
      clientId: data.clientId,
      endpoint: data.payload,
      heartbeatInterval: this.heartbeatInterval,
      heartbeatTTL: this.heartbeatTTL
    });

    const proxyResolver = this.proxyResolver;
    this.proxyResolver = null;
    proxyResolver(this.proxy);
  }

  onProxyLinkDrop() {
    this.debug('Proxy link request dropped');
    this.removeHandlers();
    this.requestProxy();
  }

  removeHandlers() {
    this.debug('Removing handlers');
    this.pubsub.offMessage(PROXY_OFFER, this.onProxyOffer);
    this.pubsub.offMessage(PROXY_LINK, this.onProxyLink);
    this.pubsub.offMessage(PROXY_LINK_DROP, this.onProxyLinkDrop);
    clearInterval(this.proxyRequesterInterval);
    clearTimeout(this.proxyRequesterTimeout);
  }

  destroy() {
    this.debug('Destroying client');
    this.removeHandlers();
    this.proxyResolver = null;
    this.proxyReject = null;
    this.pubsub.removeAllListeners();
    this.pubsub.removeAllMessageListeners();
    this.pubsub = null;

    if (this.proxy) {
      this.proxy.stop();
      this.proxy = null;
    }
  }
}
