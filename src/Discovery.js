'use strict';

var Democracy = require('democracy');
var ip = require('ip');
var redis = require('redis');

function Discovery(options) {
  options.source = ip.address() + ':';
  Democracy.call(this, options);
  this.options.name = options.name || "iDiscovery-" + Math.random() * Date.now();
}

var init = Democracy.prototype.init;

Democracy.prototype.init = function() {};

Discovery.prototype = new Democracy();
Discovery.prototype.constructor = Discovery;

Democracy.prototype.init = init;

Discovery.prototype.init = function(options) {
  Democracy.prototype.init.call(this, options);

  this.pub = redis.createClient(options.redis);
  this.sub = redis.createClient(options.redis);
};

Discovery.prototype.start = function() {
  var self = this;

  // Bind to the UDP port and begin listeneing for hello, etc messages.
  self.socket.bind(self.options.source[1], self.options.source[0], function() {
    // Listen for messages on this port.
    self.socket.on('message', function(msg) {
      self.processEvent(msg);
    });

    self.registry(self.socket.address());

    // Start sending 'hello' messages to the other nodes.
    self.hello();
  });

  // Run an election after two intervals if we still don't have a leader.
  setTimeout(function() {
    // Check if we have a leader.
    var haveLeader = false;
    for (var id in self._nodes) {
      if (self._nodes[id].state === 'leader') {
        haveLeader = true;
        break;
      }
    }

    if (!haveLeader && self._state !== 'leader') {
      self.holdElections();
    }
  }, self.options.interval * 2);

  return self;
};

Discovery.prototype.hello = function() {
  var self = this;

  // Send a hello message and then check the other nodes.
  var sendHello = function() {
    self.send('hello');
    self.check();
  };

  if (self.helloInterval) {
    clearInterval(self.helloInterval);
    self.helloInterval = null;
  }
  // Schedule hello messages on the specified interval.
  self.helloInterval = setInterval(sendHello, self.options.interval);

  // Immediately send the first hello message.
  sendHello();

  return self;
};

Discovery.prototype.registry = function(address) {
  var self = this;

  this.sub.subscribe("vote:descovery:registry:" + self.options.name);

  this.sub.on("message", function(channel, message) {
    if (channel === 'vote:descovery:registry:' + self.options.name) {
      var _message = JSON.parse(message),
        peer = null,
        flag = false;
      for (var i = 0; i < self.options.peers.length; i++) {
        peer = self.options.peers[i];
        if (peer[0] == _message.address && peer[1] == _message.port) {
          flag = true;
          break;
        }
      }
      if (!flag) {
        self.options.peers.push([_message.address, _message.port]);
        self.hello();
      }
    }
  });

  if (self.registryInterval) {
    clearInterval(self.registryInterval);
    self.registryInterval = null;
  }
  self.registryInterval = setInterval(function() {
    self.pub.publish("vote:descovery:registry:" + self.options.name, JSON.stringify(address));
  }, self.options.interval);
};

Discovery.prototype.destroy = function() {
  clearInterval(this.registryInterval);
  clearInterval(this.helloInterval);

  this.registryInterval = null;
  this.helloInterval = null;

  this.sub.unsubscribe();
  this.sub.quit();
  this.pub.quit();

  this.sub = null;
  this.pub = null;

  this.socket.close();
  this.socket = null;
};

module.exports = Discovery;