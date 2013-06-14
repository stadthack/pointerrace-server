var io = require('socket.io').listen(8080);

var players = {};

io.sockets.on('connection', function (socket) {
  socket.on('connect', function (data) {
    players[data.uuid] = data;
  });

  socket.on('move', function (data) {
    var player = players[data.uuid];
    if (player === undefined) {
      console.error('Player not found.');
      return;
    }

    console.log('data: ', data);
    players[data.uuid] = data;
    socket.broadcast.emit('players-move', players);
  });
});
