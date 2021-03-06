'use strict';

var PORT = 8080;
var GAMELOOP_FREQUENCY = 45;

var _ = require('underscore');
var io = require('socket.io').listen(PORT, '0.0.0.0');
var StateMachine = require('sfsm');

// Global player stats
var players = {};
// Global game state
var game = {
  playerCount: 0,
  playersInGoal: {},
  playersInStart: {},
  numLevel: 0,

  resetLevel: function resetLevel() {
    this.playersInGoal = {};
    this.playersInStart = {};
    this.numLevel += 1;
  }
};

var gameLoop = {
  _handle: 0,
  _previous: {},
  _lastTime: 0,

  _loop: function _loop() {
    var state = {
      players: _.invoke(players, 'serialize'),
      game: game
    };

    if (!_.isEqual(state, this._previous)) {
      io.sockets.emit('serverstate', state);
      this._previous = state;
    }

    if (this._handle) {
      this.start();
    }
  },

  check: function check() {
    if (game.playerCount > 0 && this._handle === 0) {
      this.start();
    } else if (game.playerCount === 0 && this._handle !== 0) {
      this.stop();
    }
  },

  start: function start() {
    var currTime = Date.now();
    var timeToCall = Math.max(0, GAMELOOP_FREQUENCY -
                              (currTime - this._lastTime));
    this._lastTime = currTime + timeToCall;
    this._handle = setTimeout(this._loop.bind(this), timeToCall);
  },

  stop: function stop() {
    clearInterval(this._handle);
    this._handle = 0;
  }
};

var PlayerState = function PlayerState(player) {
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
  io.sockets.emit('player disconnected', this.player.serialize());

  game.playerCount -= 1;
  delete game.playersInStart[this.player.id];
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
  this.state = new PlayerState(this);
  this.x = 0;
  this.y = 0;
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
  var otherPlayers = _.clone(players);
  var player = players[client.id] = new Player(client.id);

  client.emit('connected', {
    id: client.id,
    players: _.invoke(otherPlayers, 'serialize'),
    numLevel: game.numLevel
  });
  player.state.connect();

  client.on('disconnect', function onDisconnect() {
    player.state.disconnect();
  });

  client.broadcast.emit('player connected', player.serialize());

  function sendLevelState() {
    _.each(players, function (player) {
      io.sockets.emit('game event', {
        eventName: 'enterState',
        args: ['level'],
        playerId: player.id
      });
    });
  }

  function loadNextLevel() {
    game.resetLevel();
    _.each(players, function (player) {
      io.sockets.emit('game event', {
        eventName: 'loadNextLevel',
        args: { numLevel: game.numLevel },
        playerId: player.id
      });
    });
  }

  client.on('game event', function onGameEvent(data) {
    if (data.eventName === 'enterState') {
      if (data.args[0] === 'warmup') {
        game.playersInStart[data.playerId] = true;

        if (Object.keys(game.playersInStart).length === game.playerCount) {
          sendLevelState();
        }
      } else if (data.args[0] === 'level') {
        // player could want to come back to level to retry, send level only to him
        if (Object.keys(game.playersInStart).length === game.playerCount) {
          io.sockets.emit('game event', data);
        }
      } else if (data.args[0] === 'retry') {
        io.sockets.emit('game event', data);
      } else if (data.args[0] === 'finish') {
        game.playersInGoal[data.playerId] = true;

        // At least all but one.
        if (Object.keys(game.playersInStart).length >= (game.playerCount - 1)) {
          loadNextLevel();
        }
      }
    } else if (data.eventName === 'mouseMove') {
      player.x = data.args[0];
      player.y = data.args[1];
    } else {
      io.sockets.emit('game event', data);
    }
  });
});
