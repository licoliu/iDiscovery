'use strict';

var Democracy = require('democracy');
var ip = require('ip');
var redis = require('redis');

function Discovery(options) {
  options.source = ip.address() + ':' + Math.floor(10000 + Math.random() * (65536 - 10000));
  Democracy.call(this, options);
  this.options.name = options.name || "idiscovery-" + Math.random() * Date.now();
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

    self.registry();

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

Discovery.prototype.processEvent = function(msg) {
  var self = this;
  var data = self.decodeMsg(msg);

  if (!data || data.id === self._id) {
    return;
  }

  // Process the different available events.
  if (data.event === 'hello') {
    // Create a new node if we don't already know about this one.
    if (!self._nodes[data.id]) {
      self._nodes[data.id] = {
        id: data.id,
        weight: data.weight,
        state: data.state,
        last: Date.now(),
        voters: [],
        address: data.address
      };

      self.emit('added', self._nodes[data.id]);
    } else {
      self._nodes[data.id].last = Date.now();
      self._nodes[data.id].state = data.state;
      self._nodes[data.id].weight = data.weight;
    }

    // Reset the voters since we've now seen this node again.
    self._nodes[data.id].voters = [];

    // If we are both leaders, hold a runoff to determine the winner...hanging chads and all.
    if (self._state === 'leader' && data.state === 'leader') {
      self.holdElections();
    }

    // If we now have no leader, hold a new election.
    if (self._hadElection && !self.leader()) {
      self.holdElections();
    }

    // We have had an election somewhere if we have a leader.
    if (self.leader()) {
      self._hadElection = true;
    }
  } else if (data.event === 'vote') {
    if (self._nodes[data.candidate] && self._nodes[data.candidate].voters.indexOf(data.id) < 0) {
      // Tally this vote.
      self._nodes[data.candidate].voters.push(data.id);

      // Process the ballots to see if this node should be removed and a new leader selected.
      self.checkBallots(data.candidate);
    }
  } else if (data.event === 'leader') {
    if (!self._nodes[data.id]) {
      self._nodes[data.id] = {
        id: data.id,
        weight: data.weight,
        state: data.state,
        last: Date.now(),
        voters: []
      };

      self.emit('added', self._nodes[data.id]);
    } else {
      self._nodes[data.id].state = 'leader';
    }

    self.emit('leader', self._nodes[data.id]);
  } else {
    // Handle custom messaging between nodes.
    self.emit(data.event, data);
  }

  return self;
};

Democracy.prototype.send = function(event, extra) {
  var self = this;
  var data = {
    event: event,
    id: self._id
  };

  if (event === 'vote') {
    data.candidate = extra.candidate;
  } else {
    data.weight = self._weight;
    data.state = self._state;

    // Handle custom messaging between nodes.
    if (extra) {
      data.extra = extra;
    }
  }

  data.source = self.options.source[0] + ':' + self.options.source[1];
  data.address = self.socket.address();

  // Data must be sent as a Buffer over the UDP socket.
  var msg = new Buffer(JSON.stringify(data));

  // Loop through each connect node and send the packet over.
  for (var i = 0; i < self.options.peers.length; i++) {
    self.socket.send(msg, 0, msg.length, self.options.peers[i][1], self.options.peers[i][0]);
  }

  return self;
};

Discovery.prototype.registry = function() {
  var self = this,
    address = self.socket.address();

  this.sub.subscribe("vote:descovery:registry:" + self.options.name);
  this.sub.subscribe("vote:descovery:unregistry:" + self.options.name);

  this.sub.on("message", function(channel, message) {
    if (channel === 'vote:descovery:registry:' + self.options.name) {
      var _message = JSON.parse(message),
        peer = null,
        flag = _message.address == address.address && _message.port == address.port;

      for (var i = 0; !flag && i < self.options.peers.length; i++) {
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
    } else if (channel === 'vote:descovery:unregistry:' + self.options.name) {
      var _message = JSON.parse(message),
        peer = null,
        flag = _message.address == address.address && _message.port == address.port;

      for (var i = 0; !flag && i < self.options.peers.length; i++) {
        peer = self.options.peers[i];
        if (peer[0] == _message.address && peer[1] == _message.port) {
          self.options.peers.splice(i, 1);
          break;
        }
      }
    }
  });

  this.on('removed', function(data) {
    var _message = data.address || {},
      peer = null,
      flag = _message.address == address.address && _message.port == address.port;

    for (var i = 0; !flag && i < self.options.peers.length; i++) {
      peer = self.options.peers[i];
      if (peer[0] == _message.address && peer[1] == _message.port) {
        self.options.peers.splice(i, 1);
        break;
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

  // var address = self.socket.address();
  // this.pub.publish("vote:descovery:unregistry:" + self.options.name, JSON.stringify(address))
  this.pub.quit();

  this.sub = null;
  this.pub = null;

  this.socket.close();
  this.socket = null;
};

module.exports = Discovery;