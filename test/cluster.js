import path from 'path';
import { times, uniq, every } from 'lodash';
import { expect } from 'chai';
import Cluster from '../src/cluster';
import getProxyIp from './util/get-proxy-ip';
import getOwnIp from './util/get-own-ip';
import ipRegex from './util/ip-regex';

const clusterConfig = {
  dataDir: path.resolve(__dirname, 'data'),
  torInstances: 2,
  portRangeStart: 10770,
  redis: {
    port: 6379,
    host: '127.0.0.1'
  }
};

describe('Cluster', function () {
  this.timeout(120000);

  describe('Single Cluster', () => {
    let cluster;

    before(async () => {
      cluster = new Cluster(clusterConfig);
      await cluster.connect();
    });

    after(async () => {
      await cluster.disconnect();
    });

    it('should connect successfully', () => {
      expect(cluster.status.ready).to.equal(true);
    });

    it('should disconnect and reconnect successfully', async () => {
      expect(cluster.status.ready).to.equal(true);
      const promise = cluster.disconnect();
      expect(cluster.status.disconnecting).to.equal(true);
      expect(cluster.status.ready).to.equal(false);
      await promise;
      expect(cluster.status.disconnecting).to.equal(false);
      expect(cluster.status.ready).to.equal(false);
      await cluster.connect();
      expect(cluster.status.ready).to.equal(true);
    });

    it('should get a service instance', () => {
      expect(cluster.getService).to.be.a('function');
      expect(cluster.getService()).to.be.an('object');
      expect(cluster.getService().name).to.not.be.empty; // eslint-disable-line
      expect(cluster.getService().ports.length).to.not.be.empty; // eslint-disable-line
    });

    it('should get a port', () => {
      expect(cluster.getPort()).to.be.a('number');
    });

    it('should rotate and return different ports', function () {
      if (clusterConfig.torInstances < 2) {
        console.warn('The rotation test requires at least two instances.');
        return this.skip();
      }

      const ports = times(clusterConfig.torInstances, () => cluster.getPort());

      expect(ports).to.not.be.empty; // eslint-disable-line
      expect(ports.length).to.equal(uniq(ports).length);
    });

    it('should use two proxies with two different IP addresses', async () => {
      const promises = times(clusterConfig.torInstances, () => {
        const port = cluster.getPort();
        return getProxyIp(`127.0.0.1:${port}`);
      });

      const ips = await Promise.all(promises);
      const ownIp = await getOwnIp();

      expect(uniq(ips).length).to.equal(parseInt(clusterConfig.torInstances, 10));
      expect(every(ips, (ip) => ipRegex.test(ip))).to.equal(true);
      expect(ipRegex.test(ownIp)).to.equal(true);
      expect(every(ips, (ip) => ip !== ownIp)).to.equal(true);
    });
  });

  describe('Multi Cluster', () => {
    const clusters = [];

    before(async () => {
      times(3, (i) => {
        const portRangeStart = clusterConfig.portRangeStart + ((i + 1) * 20);
        clusters.push(new Cluster({ ...clusterConfig, portRangeStart }));
      });
      await Promise.all(clusters.map((cluster) => cluster.connect()));
    });

    it('should connect multiple clusters successfully', () => {
      expect(clusters.every((c) => c.status.ready)).to.equal(true);
    });
  });
});
