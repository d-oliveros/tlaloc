/* eslint-disable no-multi-spaces */

export default {
  PROXY_REQUEST  : 'proxy:request',   // Request for a proxy
  PROXY_OFFER    : 'proxy:offer',     // Offers a proxy
  PROXY_LINK     : 'proxy:link',      // Accept the offer and wait for the proxy
  PROXY_LINK_DROP: 'proxy:link:drop', // Drops a proxy link offer
  PROXY_DELIVER  : 'proxy:deliver',   // Delivers the proxy
  PROXY_HEARTBEAT: 'proxy:heartbeat', // Tells the provider/client you are alive
  PROXY_DOWN     : 'proxy:down',      // The proxy died for some reason
  PROXY_DROP     : 'proxy:drop',      // Tells provider to drop the proxy
  PROXY_TIMEOUT  : 'proxy:timeout'    // The proxy linked to a proxy link has timed out
};
