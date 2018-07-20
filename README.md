# idiscovery
node中间件，支持服务自动发现，自动注册，服务间通信，自动推选master服务，master服务crash后自动重新推选可用的服务作为master服务，支持added，removed，elected等事件监听。

#### Requirements
1. requirements
    ```
    democracy >= 1.3.0 
    ip >= 1.1.5
    redis >= 2.8.0  
    ```
 
#### Usage
  
1. install
    ```
    $ npm install idiscovery --save
    ```

2. initialize
    
    ```
    var Discovery = require("idiscovery");
    new Discovery({
        name: 'idiscovery' // Your current service name
        interval: 1000, // The interval (ms) at which `hello` heartbeats are sent to the other peers.
        timeout: 3000, // How long a peer must go without sending a `hello` to be considered down.
        weight: Math.random() * Date.now() // The highest weight is used to determine the new leader. Must be unique for each node.
        id: 'uuid' // (optional) This is generated automatically with uuid, but can optionally be set. Must be unique for each node.
        redis: {} // Your redis config for connecting to a redis server.
    });

    ```
  
3. Methods

    1. Returns the object containing all active nodes and their properties (including the one the method is called from).
    ```
    nodes()
    ```
    
    2. Returns the current leader node from the cluster.
    ```
    leader()
    ```

    3. Returns whether or not the current server is the leader.
    ```
    isLeader()
    ```

    4. If called on the current leader node, will force it to resign as the leader. A new election will be held, which means the same node could be re-elected.
    ```
    resign()
    ```
    
    5. Sends a custom event to all other nodes.
    ```
    send(customEvent, extraData)
    ```

4. Events
    All events return the data/configuration of the affected node as their first parameter.

    1. Fired when a new peer has been found.
    ```
    added
    ```

    2. Fired when a peer has gone down and subsequently been removed from the list.
    ```
    removed
    ```
    
    3. Fired when a new leader is selected.
    ```
    leader
    ```
    
    4. Fired on the server that has become the new leader.
    ```
    elected
    ```
    
    5. Fired on the server that has resigned as the leader.
    ```
    resigned
    ```
    
    6. Fired on all the server except the one that "sent" the event.
    ```
    custom/all other events
    ```
    

### Installation with npm
    
 * To install via Npm, simply do the following:

    执行install命令 
    ```
    $ npm install idiscovery --save
    
    ``` 

    or

    
    ```
    $ vi package.json
    ```
    编辑package.json文件，添加如下配置:
    ```
    dependencies: {
        "idiscovery": "^0.1.0"
    }
    ```
    执行install命令 
    ```
    $ npm install
    
    ``` 


### Examples
The below example is easy to run on your local machine (also found in the test directory).

```javascript
var Discovery = require('idiscovery');

var vote = new Discovery({
    name: "xxx",
    redis: {
        url: "redis://@127.0.0.1:6379/0",
        password: ""
    }
});

vote.on('added', function(data) {
  console.log('Added: ', data);
});

vote.on('removed', function(data) {
  console.log('Removed: ', data);
});

vote.on('elected', function(data) {
  console.log('You have been elected leader!');
});

vote.on('yyy', function(data) {
    console.log('yyy from %s', data.id, data.extra);
});

vote.send('yyy', {hello: 'world'});

```
