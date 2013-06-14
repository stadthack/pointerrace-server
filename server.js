'use strict';

var PORT = 8080;
var GAMELOOP_FREQUENCY = 1 / 1;

var _ = require('underscore');
var io = require('socket.io').listen(PORT);
var StateMachine = require('sfsm');

// Global player stats
var players = {};
// Global game state
var game = {
  playerCount: 0
};

var gameLoop = {
  _interval: 0,
  _previous: {},

  _loop: function () {
    var state = {
      players: _.invoke(players, 'serialize'),
      game: game
    };

    if (!_.isEqual(state, this._previous)) {
      io.sockets.emit('serverstate', state);
      console.log('actually sending');
      this._previous = state;
    }
  },

  check: function check() {
    if (game.playerCount > 0 && this._interval === 0) {
      this.start();
    } else if (game.playerCount === 0 && this._interval !== 0) {
      this.stop();
    }
  },

  start: function start() {
    this._interval = setInterval(this._loop, GAMELOOP_FREQUENCY);
  },

  stop: function stop() {
    clearInterval(this._interval);
    this._interval = 0;
  }
};

var PlayerState = function (player) {
  this.player = player;
  this.startup();
};

PlayerState.prototype.onconnected = function onconnected() {
  console.log('onconnected: ', this.player.id);

  game.playerCount += 1;
  gameLoop.check();
};

PlayerState.prototype.ondisconnected = function ondisconnected() {
  delete players[this.player.id];
  console.log('player ' + this.player.id + ' disconnected and killed.');

  game.playerCount -= 1;
  gameLoop.check();
};

StateMachine.create({
  target: PlayerState.prototype,
  final: 'disconnected',

  events: [
    { name: 'startup', from: 'none', to: 'connecting' },
    { name: 'connect', from: 'connecting', to: 'connected' },
    { name: 'disconnect', from: 'connected', to: 'disconnected' }
  ]
});

function Player(id) {
  this.id = id;
  this.x = 0;
  this.y = 0;
  this.state = new PlayerState(this);
}

Player.prototype.serialize = function serialize() {
  return {
    id: this.id,
    x: this.x,
    y: this.y
  };
};

io.configure(function () {
  io.set('log level', 0);
});


io.sockets.on('connection', function onConnection(client) {
  var player = players[client.id] = new Player(client.id);

  client.emit('connected', { uuid: client.id });
  player.state.connect();

  client.on('disconnect', function onDisconnect() {
    player.state.disconnect();
  });

  client.on('move', function (data) {
    player.x = data.x;
    player.y = data.y;
  });
});
