var PORT = 8080;

var io = require('socket.io').listen(PORT);
var uuid = require('node-uuid');


io.configure(function () {
  io.set('log level', 0);
});


io.sockets.on('connection', function onConnection(client) {
  client.uuid = uuid();
  client.emit('connected', { uuid: client.uuid });
  console.log('player ' + client.uuid + ' connected.');

  client.on('disconnect', function onDisconnect() {
    console.log('player ' + client.uuid + ' disconnected.');
  });
});
