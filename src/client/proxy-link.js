import { EventEmitter } from 'events';
import assert from 'assert';
import createDebugger from 'debug';
import constants from '../constants';

const { PROXY_HEARTBEAT, PROXY_TIMEOUT, PROXY_DROP } = constants;

/**
 * Holds the proxy information
 * emits heatbeats to the provider using the client to send events
 * listen to providers heartbeats and kill proxy on timeout
 */
export default class ProxyLink extends EventEmitter {
  constructor({ pubsub, clientId, endpoint, heartbeatInterval, heartbeatTTL }) {
    assert(pubsub && clientId && endpoint);

    const parts = endpoint.split(':');

    super();

    this.endpoint = endpoint;
    this.host = parts[0];
    this.port = parts[1];

    this.active = true;
    this.targetClientId = clientId;
    this.pubsub = pubsub;

    this.debug = createDebugger(`tlaloc:proxyLink:${pubsub.id}`);
    this.emitHeartbeat = ::this.emitHeartbeat;
    this.onHeartbeat = ::this.onHeartbeat;
    this.onTimeout = ::this.onTimeout;

    this.heartbeatIntervalMs = heartbeatInterval;
    this.heartbeatTTLMs = heartbeatTTL;

    this.heartbeatInterval = setInterval(this.emitHeartbeat, this.heartbeatIntervalMs);
    this.TTLTimeoutId = setTimeout(this.onTimeout, this.heartbeatTTLMs);

    this.pubsub.onMessage(PROXY_HEARTBEAT, this.onHeartbeat);
    this.pubsub.onMessage(PROXY_DROP, this.onProxyDrop);

    this.debug(`created proxy link ${endpoint} from ${clientId}`);
  }

  emitHeartbeat() {
    this.debug('Heartbeat');
    this.pubsub.sendMessage(PROXY_HEARTBEAT, this.targetClientId);
  }

  onHeartbeat({ clientId }) {
    if (this.targetClientId === clientId) {
      this.debug('Received heartbeat');
      clearTimeout(this.TTLTimeoutId);
      this.TTLTimeoutId = setTimeout(this.onTimeout, this.heartbeatTTLMs);
    }
  }

  onTimeout() {
    this.debug('Connection with the provider lost');
    this.emit(PROXY_TIMEOUT);
    this.stop();
  }

  onProxyDrop() {
    this.debug('Provider closed proxy link');
    this.emit(PROXY_TIMEOUT);
    this.stop();
  }

  unlink() {
    this.debug('Unlinking proxy');
    this.pubsub.sendMessage(PROXY_DROP, this.targetClientId);
    this.stop();
  }

  stop() {
    this.debug('killing proxy link');
    clearInterval(this.heartbeatInterval);
    clearTimeout(this.TTLTimeoutId);
    this.removeAllListeners();
    this.active = false;
    this.host = null;
    this.port = null;
    this.endpoint = null;
    this.pubsub.offMessage(PROXY_HEARTBEAT, this.onHeartbeat);
    this.pubsub = null;
  }
}
