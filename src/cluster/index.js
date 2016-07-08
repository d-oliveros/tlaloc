import { times, find, reduce, defaults, isString, isObject } from 'lodash';
import assert from 'assert';
import THSInstance from './ths-instance';

const debug = require('debug')('tlaloc:cluster');

/**
 * Creates a pool of tor hidden service instances.
 *
 * @param  {String}  dataDir  The root directory to be used for instance data
 */
export default class THSCluster {
  constructor(params) {
    assert(isObject(params), 'Invalid params');
    assert(isString(params.dataDir), 'Data dir is not a string');
    assert(isObject(params.redis), 'Invalid redis config');

    defaults(params, {
      torInstances: 2,
      portRangeStart: 10770,
      host: '127.0.0.1'
    });

    this.config = params;

    this.status = {
      starting: false,
      disconnecting: false,
      ready: false
    };

    this.serviceRotationIndex = 0;

    debug('Creating cluster', this.config);

    this.instances = times(params.torInstances, (i) => {
      const port = parseInt(params.portRangeStart, 10) + i;

      return new THSInstance({
        dataDir: `${params.dataDir}/${port}`,
        port: port,
        host: params.host,
        ctrlPort: port + parseInt(params.torInstances, 10),
        redis: params.redis,
        onTorError: ::console.error,
        onTorMessage: ::console.log
      });
    });
  }

  /**
   * Starts tor, connects all the hidden services in the pool
   * @return {Promise}
   */
  async connect() {
    const status = this.status;
    assert(!status.disconnecting, 'Cluster is disconnecting');
    assert(!status.starting && !status.ready, 'Cluster was already connected');

    status.starting = true;

    debug('Connecting Tor processes...');

    await Promise.all(this.instances.map((ths) => ths.connect()));

    status.starting = false;
    status.ready = true;

    debug(`Tor connected with ${this.instances.length} instances`);
  }

  async disconnect() {
    const status = this.status;
    assert(!status.starting, 'Can not disconnect while connection is in progress');
    assert(!status.disconnecting, 'Cluster already disconnecting');
    assert(status.ready, 'Cluster was not started');

    status.disconnecting = true;
    status.ready = false;

    await Promise.all(this.instances.map((ths) => ths.disconnect()));

    status.disconnecting = false;

    debug('Tor disconnected');
  }

  /**
   * Returns the running tor services in the cluster.
   * @return {Array}  Tor services running in the cluster.
   */
  get services() {
    const list = reduce(this.instances, (list, ths) => {
      if (ths.isTorRunning()) {
        const services = ths.getServices();
        if (services.length) {
          list.push(services[0]);
        }
      }
      return list;
    }, []);

    debug('Getting services', list);

    return list;
  }

  /**
   * Gets a difference service every time this method is invoked.
   * @return {Object}  A tor hidden service definition.
   */
  getService() {
    this.serviceRotationIndex++;

    const services = this.services;
    const port = this.config.portRangeStart + this.serviceRotationIndex;
    let service = find(services, { name: `port_${port}` });

    if (!service) {
      this.serviceRotationIndex = 0;
      service = services[0];
    }

    return service;
  }

  getPort() {
    const service = this.getService();

    if (!service || !service.ports.length) {
      return null;
    }

    return parseInt(service.ports[0], 10);
  }
}
