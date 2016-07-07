process.env.NODE_ENV = 'test';
require('events').EventEmitter.prototype._maxListeners = 100;
require('babel-register');
require('../loadenv');
