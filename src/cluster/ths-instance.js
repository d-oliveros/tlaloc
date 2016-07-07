import THS from 'ths';
import mkdirp from 'mkdirp';
import { find } from 'lodash';
import ProxySupply from './proxy-supply';

const debug = require('debug')('tlaloc:thsInstance');

export default class THSInstance extends THS {
  constructor({ dataDir, host, port, redis, ctrlPort, onTorError, onTorMessage }) {
    debug('Creating instance', ...arguments);

    mkdirp.sync(dataDir);
    super(dataDir, port, ctrlPort, onTorError, onTorMessage);

    // Remove erroneous services
    this.serviceName = `port_${port}`;
    this.endpoint = `${host}:${port}`;
    this.redis = redis;

    this.getServices()
      .filter((service) => service.name !== this.serviceName)
      .forEach((service) => {
        debug(`Removing service ${service.name}`);
        this.removeHiddenService(service.name, true);
      });

    // Register this port's hidden service
    if (!find(this.getServices(), { name: this.serviceName })) {
      this.createHiddenService(this.serviceName, port, true);
    }

    this.proxy = new ProxySupply({ endpoint: this.endpoint });
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.start(true, (err) => {
        if (err) return reject(err);
        resolve();
      });
    }).then(() => this.proxy.connect(this.redis));
  }

  disconnect() {
    this.proxy.disconnect();

    return new Promise((resolve, reject) => {
      this.stop((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
}
