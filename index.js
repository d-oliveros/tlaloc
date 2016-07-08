const fs = require('fs');
const path = require('path');
const prefix = fs.existsSync(path.resolve(__dirname, 'src')) ? 'src' : 'lib';

module.exports = {
  client: require(`./${prefix}/client`),  // eslint-disable-line global-require
  cluster: require(`./${prefix}/cluster`) // eslint-disable-line global-require
};
