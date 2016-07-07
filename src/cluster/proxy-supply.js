import assert from 'assert';
import ms from 'ms';
import createDebugger from 'debug';
import constants from '../constants';
import { createRedisPubSub } from '../pubsub';

const {
  PROXY_REQUEST,
  PROXY_OFFER,
  PROXY_LINK,
  PROXY_LINK_DROP,
  PROXY_DROP,
  PROXY_DELIVER,
  PROXY_TIMEOUT,
  PROXY_HEARTBEAT
} = constants;

const PROXY_HEARTBEAT_TTL = ms('5s');
const assertNotEmpty = () => new Error('Value not provided');

export default class ProxySupply {
  constructor({ heartbeatTTL, endpoint = assertNotEmpty() }) {
    this.endpoint = endpoint;
    this.pubsub = null;
    this.available = false;
    this.linkedTo = null;
    this.heartbeatTTL = heartbeatTTL || PROXY_HEARTBEAT_TTL;
    this.onProxyRequest = ::this.onProxyRequest;
    this.onProxyLink = ::this.onProxyLink;
    this.onProxyUnlink = ::this.onProxyUnlink;
    this.onHeartbeat = ::this.onHeartbeat;
    this.onTimeout = ::this.onTimeout;
    this.unlink = ::this.unlink;
    this.debug = createDebugger(`tlaloc:proxySupply:${this.endpoint}`);
  }

  async connect({ host, port }) {
    assert(!this.pubsub, 'Can not reconnect proxy supply');
    this.debug('Connecting redis pubsub');
    this.pubsub = await createRedisPubSub({ port, host, id: this.endpoint });
    this.available = true;
    this.attachListeners();
  }

  disconnect() {
    clearTimeout(this.TTLTimeoutId);
    this.pubsub.removeAllListeners();
    this.pubsub.removeAllMessageListeners();
    this.pubsub = null;
    this.linkedTo = null;
    this.available = false;
  }

  attachListeners() {
    this.debug('Attaching listeners');
    this.pubsub.on(PROXY_REQUEST, this.onProxyRequest);
    this.pubsub.on(PROXY_DROP, this.onProxyUnlink);
    this.pubsub.onMessage(PROXY_LINK, this.onProxyLink);
  }

  onProxyRequest({ clientId }) {
    if (this.available) {
      this.debug(`Sending proxy offer to ${clientId}`);
      this.pubsub.sendMessage(PROXY_OFFER, clientId);
    }
  }

  onProxyLink({ clientId }) {
    if (this.available) {
      this.debug(`Linking proxy with ${clientId}`);
      this.available = false;
      this.linkedTo = clientId;
      this.pubsub.sendMessage(PROXY_DELIVER, clientId, this.endpoint);

      this.pubsub.onMessage(PROXY_HEARTBEAT, this.onHeartbeat);
      this.TTLTimeoutId = setTimeout(this.onTimeout, this.heartbeatTTL);

      // wait for heartbeats
      // if no heartbeat, drop

    } else {
      this.debug(`Dropping proxy link with ${clientId}`);
      this.pubsub.sendMessage(PROXY_LINK_DROP, clientId);
    }
  }

  onProxyUnlink({ clientId }) {
    if (this.linkedTo === clientId) {
      this.debug('Removing proxy link');
      this.unlink();
    }
  }

  onHeartbeat({ clientId }) {
    if (this.linkedTo === clientId) {
      this.debug('Received heartbeat');
      this.pubsub.sendMessage(PROXY_HEARTBEAT, clientId);
      clearTimeout(this.TTLTimeoutId);
      this.TTLTimeoutId = setTimeout(this.onTimeout, this.heartbeatTTL);
    }
  }

  onTimeout() {
    this.pubsub.emit(PROXY_TIMEOUT);
    this.unlink();
  }

  unlink() {
    clearTimeout(this.TTLTimeoutId);
    this.linkedTo = null;
    this.available = true;
  }
}
