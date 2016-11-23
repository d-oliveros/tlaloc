import redisPubSub from 'redis-pubsub-emitter';
import createError from 'http-errors';
import assert from 'assert';
import uuid from 'uuid';
import { isString } from 'lodash';
import ms from 'ms';

const debug = require('debug')('tlaloc:pubsub');

const prototype = {

  onMessageHandlers: [],

  // Broadcast message to the network
  send(event, data) {
    assert(event);
    debug(`broadcasting "${event}"`);
    const message = this.createMessage(data);
    this.publish(event, message);
  },

  // Send message to an specific addressee
  sendMessage(event, to, data) {
    assert(event);
    debug(`sendMessage "${event}" to ${to}`);
    const message = this.createMessage(data, to);
    this.publish(event, message);
  },

  // Append your identity to the message and the addressee if included
  createMessage(data, to) {
    const message = {
      clientId: this.id,
      payload: data || {}
    };

    if (to) {
      message.to = to;
    }

    return message;
  },

  onMessage(event, fn) {
    assert(event && fn);
    debug(`register onMessage "${event}"`);

    let wrappedFn = function (data) {
      debug('data', data);
      if (data.to !== this.id) return;
      fn.apply(this, arguments);
    };

    wrappedFn = wrappedFn.bind(this);

    this.onMessageHandlers.push([event, fn, wrappedFn]);
    this.on(event, wrappedFn);
  },

  // Register a function that is executed only once if its addressed to you
  onceMessage(event, fn) {
    assert(event && fn);
    debug(`register onceMessage "${event}"`);
    let wrappedFn = function (data) {
      if (data.to !== this.id) return;
      this.offMessage(event, fn);
      this.removeListener(event, wrappedFn);
      fn.apply(this, arguments);
    };

    wrappedFn = wrappedFn.bind(this);

    this.onMessageHandlers.push([event, fn, wrappedFn]);
    this.on(event, wrappedFn);
  },

  // Remove function of the
  offMessage(event, fn) {
    assert(event && fn);
    const toRemove = [];
    for (const arr of this.onMessageHandlers) {
      const [event, func, wrappedFn] = arr;
      if (fn === func) {
        toRemove.push(arr);
        this.removeListener(event, wrappedFn);
      }
    }
  },

  removeAllMessageListeners() {
    for (const [event, , wrappedFn] of this.onMessageHandlers) {
      this.removeListener(event, wrappedFn);
    }

    this.onMessageHandlers.length = 0;
  }
};

/**
* Extends the redisPubSub and adds 5s timeout
*/
export const createRedisPubSub = ({ port, host, id = uuid.v4() }) => {
  assert(port && host && id, 'Invalid params');
  assert(isString(id), 'Client ID must be a string');

  return new Promise((resolve, reject) => {
    const pubsub = Object.assign(
      redisPubSub.createClient(port, host),
      prototype,
      { id }
    );

    pubsub.setMaxListeners(100);

    const timeout = setTimeout(() => {
      pubsub.removeListener('ready', onReady); // eslint-disable-line
      reject(createError(504, 'Redis connection timeout'));
    }, ms('5s'));

    const onReady = () => {
      clearTimeout(timeout);
      debug('connected to redis');
      resolve(pubsub);
    };

    pubsub.once('ready', onReady);
  });
};

export default { createRedisPubSub };
