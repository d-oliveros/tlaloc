# Tlaloc

Tlaloc is a decentralized Tor cluster server. It helps you create multiple tor processes across servers, and manage them at scale using a central Redis pub/sub interface.

It exposes a redis pub/sub communication channel for exposing available tor hidden service running in the cluster. It also lets you lock into a particular proxy, ensuring you are the only owner of that IP.


## Requirements

A Tor client. Tor is available for a multitude of systems.

On OSX you can install with homebrew

```
brew install tor
tor # This should start the tor process
```

On Windows download the tor expert bundle (not the browser), unzip it and run tor.exe.

```
./Tor/tor.exe # This should start the tor process
```

See [TorProject.org](https://www.torproject.org/download/download.html.en) for linux bundles and detailed installation guides for all platforms. Make sure not to install the browser, but the tor standalone command.


## Setup

Install Tor. Make sure "Tor" is in your `$PATH`, try running "tor" in the terminal to confirm it.

Then install Tlaloc
```
npm install -g tlaloc
```


## Usage

#### Cluster server

```
$ tlaloc --help

  Usage: tlaloc [options]

  Options:

    -h, --help                     output usage information
    -V, --version                  output the version number
    -i, --instances <instances>    number of tor processes to run. Default: 4
    -d, --data-dir <dataDir>       data dir to use for the tor processes. Default: "currentDir + /tordata"
    -hn, --host <host>             IP address or hostname of this server. Default: "127.0.0.1"
    -p, --port <portRangeStart>    starting port to start binding tor on. Default: 10770
    -rp, --redis-port <redisPort>  redis port. Default: 6379
    -rh, --redis-host <redisHost>  redis host. Default: "127.0.0.1"

  Examples:

    Start Tlaloc using a specified data dir:
    $ tlaloc --data-dir ~/tordata

    Use a redis pub/sub located in a remote host:
    $ tlaloc -rp 6779 -rh myredis.somedomain.com

    Starts with 30 Tor processes, providing 30 different random IPs:
    $ tlaloc -i 30

    Starts with 30 Tor processes, exposes this server hostname to clients
    $ tlaloc -i 30 --host cluster1.mydomain.com
```

The default options are:

```
{
  dataDir: '/var/tmp' or '/tmp' or `${process.cwd()}/data`,
  torInstances: 4,
  host: '127.0.0.1',
  port: 10700
  redis: {
    port: 6379,
    host: '127.0.0.1'
  }
}
```

You can also configure tlaloc with environmental variables:

```
TLALOC_TOR_INSTANCES="20"           # Sets the number of tor processes
TLALOC_DATADIR="/var/tmp"           # Sets the data directory
TLALOC_HOST="cluster1.mydomain.com" # Sets the cluster hostname
TLALOC_PORT="10900"                 # Sets the starting port range
TLALOC_REDIS_HOST="127.0.0.1"       # Sets the redis host
TLALOC_REDIS_PORT="6379"            # Sets the redis host

# Then, you can just run "tlaloc" and these options will be used
# Scaling horizontally is better done through environmental variables
```

Tlaloc will start a cluster of tor processes, write a dedicated torrc files in the data directory, create a connection to the central redis pub/sub interface, and start listening for proxy requests.

It will serve tor proxy endpoints on request via the redis publish/subscribe flow. You can use the client in 'tlaloc/client' to easily request a proxy from the tor pool in the redis pub/sub, as described below.


#### Client library

Install tlaloc locally in your project

```bash
npm install --save tlaloc
```

Use it in your code

```js
import Client from 'tlaloc/client';

const client = new Client();

// these are the defaults
const redisConfig = {
  host: '127.0.0.1',
  port: 6379
}

client.connect(redisConfig)
  .then(() => client.getProxy())
  .then((proxy) => {

    console.log(proxy.host);   // the host of the tor cluster
    console.log(proxy.port);   // the port bound to the remote tor instance
    console.log(proxy.active); // The tor host is still alive

    // Now use this host and port to make requests through a socks5 proxy

    // eg. using the 'socks5-https-client' module
    const shttp = require('socks5-https-client');
    shttp.get({
      hostname: 'api.ipify.org',
      socksHost: proxy.host,
      socksPort: proxy.port,
      path: '/',
      rejectUnauthorized: false
    }, (res) => {
      res.setEncoding('utf8');
      res.on('readable', () => {
        console.log(`My tor IP is ${res.read()}`);
      }
    });
  });
```


## Scaling

Tlaloc is designed to allow for easy horizontal scaling. There's no central server managing the clusters, so in order to increase the available tor proxies in the pool, you just need to start more Tlaloc clusters in different servers, and configure them to use the same redis pub/sub interface.

You have to make sure to expose each server's IP addresses correctly through TLALOC_HOST (or the command-line option). Failing to do so will make the clusters expose themselves without their IP address, and clients won't be able to reach the proxies.


## Tests

```
mocha
```


Cheers.
