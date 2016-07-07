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

See TorProject.org for linux bundles and detailed installation guides for all platforms. Make sure not to install the browser, but the tor standalone command.


## Setup

Install Tor. Make sure "Tor" is in your $PATH, try running "tor" in the terminal to confirm it.

Then install Tlaloc
```
npm install -g tlaloc
```


## Usage

#### Cluster server

To start a cluster of Tor processes, and expose their proxy availability on a central redis pub/sub channel, run the following command:

```
tlaloc
```

Tlaloc will start a cluster of tor processes, write a dedicated torrc files in the `data` directory defined in `NODE_CLOAK_DATADIR`, create a connection to the central redis pub/sub interface, and start listening for proxy requests.

It will server tor proxy endpoints on request via the redis publish/subscribe flow. You can use the client in 'tlaloc/client' to easily request a proxy from the tor pool in the redis pub/sub.


#### Client library

To consume Tlaloc endpoints, you can use the module in "tlaloc/client". @todo put the client into separate 'tlaloc-client' module)

```js

import Client from 'tlaloc/client';

var client = new Client(opts);

client.connect(redisConfig)
  .then(() => client.getProxy())
  .then((proxy) => {

    console.log(proxy.host);   // the host of the tor cluster
    console.log(proxy.port);   // the port bound to the remote tor instance
    console.log(proxy.active); // The tor host is still alive

    return request.get({ site: 'somesite.com', proxy: proxy });
  })
  .then((res) => console.log('etc'))
  .catch(::console.error);
```

## Tests

```
mocha
```


Cheers.
