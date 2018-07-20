var Discovery = require("../src/Discovery");

var dem = new Discovery({
  name: "idiscovery",
  redis: {
    "url": "redis://@127.0.0.1:6379/0",
    password: ""
  }
});

dem.on('added', function(data) {
  console.log('Added: ', data);
});

dem.on('removed', function(data) {
  console.log('Removed: ', data);
});

dem.on('elected', function(data) {
  console.log('You have been elected leader!');
});

dem.on('leader', function(data) {
  console.log('New Leader: ', data);
});


process.on('exit', function() {
  dem.destroy();
});

// setTimeout(function() {
//   process.exit()
// }, 10000)