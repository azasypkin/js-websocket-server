(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.FxOSWebSocket = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _EventDispatcher = require('EventDispatcher');

var _EventDispatcher2 = _interopRequireDefault(_EventDispatcher);

var _frameBufferEs6 = require('./frame-buffer.es6');

var _frameBufferEs62 = _interopRequireDefault(_frameBufferEs6);

var _utilsEs6 = require('./utils.es6');

var _utilsEs62 = _interopRequireDefault(_utilsEs6);

/**
 * Sequence used to separate HTTP request headers and body.
 * @const {string}
 */
var CRLF = '\r\n';

/**
 * Magic GUID defined by RFC to concatenate with web socket key during
 * websocket handshake.
 * @const {string}
 */
var WEBSOCKET_KEY_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/**
 * Websocket handshake response template string, {web-socket-key} should be
 * replaced with the appropriate key.
 * @const {string}
 */
var WEBSOCKET_HANDSHAKE_RESPONSE = 'HTTP/1.1 101 Switching Protocols' + CRLF + 'Connection: Upgrade' + CRLF + 'Upgrade: websocket' + CRLF + 'Sec-WebSocket-Accept: {web-socket-key}' + CRLF + CRLF;

/**
 * Enumeration of all possible operation codes.
 * @enum {number}
 */
var OperationCode = {
  CONTINUATION_FRAME: 0,
  TEXT_FRAME: 1,
  BINARY_FRAME: 2,
  CONNECTION_CLOSE: 8,
  PING: 9,
  PONG: 10
};

/**
 * Extracts HTTP header map from HTTP header string.
 * @param {string} httpHeaderString HTTP header string.
 * @returns {Map.<string, string>} HTTP header key-value map.
 */
function getHttpHeaders(httpHeaderString) {
  var httpHeaders = httpHeaderString.trim().split(CRLF);
  return new Map(httpHeaders.map(function (httpHeader) {
    return httpHeader.split(':').map(function (entity) {
      return entity.trim();
    });
  }));
}

/**
 * Performs WebSocket HTTP Handshake.
 * @param {Uint8Array} httpRequestData HTTP Handshake data array.
 * @returns {Promise.<{ response: Uint8Array, headers: Map<string, string>}>}
 * Contains handshake headers received from client and response to send.
 */
function performHandshake(httpRequestData) {
  var httpHeaders = getHttpHeaders(_utilsEs62['default'].arrayToString(httpRequestData).split(CRLF + CRLF)[0]);

  var key = _utilsEs62['default'].stringToArray(httpHeaders.get('Sec-WebSocket-Key') + WEBSOCKET_KEY_GUID);

  var subtle = window.crypto.subtle;
  return subtle.digest({ name: 'SHA-1' }, key).then(function (hashArrayBuffer) {
    var webSocketKey = btoa(_utilsEs62['default'].arrayToString(new Uint8Array(hashArrayBuffer)));

    var arrayResponse = _utilsEs62['default'].stringToArray(WEBSOCKET_HANDSHAKE_RESPONSE.replace('{web-socket-key}', webSocketKey));

    return {
      response: arrayResponse,
      headers: httpHeaders
    };
  });
}

/**
 * Creates outgoing websocket message frame.
 * @param {Number} opCode Frame operation code.
 * @param {Uint8Array} data Data array.
 * @param {Boolean} isComplete Indicates if frame is completed.
 * @param {Boolean?} isMasked Indicates if frame data should be masked.
 * @returns {Uint8Array} Constructed frame data.
 */
function createMessageFrame(opCode, data, isComplete, isMasked) {
  var dataLength = data && data.length || 0;
  var dataOffset = isMasked ? 6 : 2;

  var secondByte = 0;
  if (dataLength >= 65536) {
    dataOffset += 8;
    secondByte = 127;
  } else if (dataLength > 125) {
    dataOffset += 2;
    secondByte = 126;
  } else {
    secondByte = dataLength;
  }

  var outputBuffer = new Uint8Array(dataOffset + dataLength);

  // Writing OPCODE, FIN and LENGTH
  outputBuffer[0] = isComplete ? opCode | 128 : opCode;
  outputBuffer[1] = isMasked ? secondByte | 128 : secondByte;

  // Writing DATA LENGTH
  switch (secondByte) {
    case 126:
      _utilsEs62['default'].writeUInt16(outputBuffer, dataLength, 2);
      break;
    case 127:
      _utilsEs62['default'].writeUInt32(outputBuffer, 0, 2);
      _utilsEs62['default'].writeUInt32(outputBuffer, dataLength, 6);
      break;
  }

  if (isMasked && dataLength) {
    var mask = _utilsEs62['default'].generateRandomMask();

    // Writing MASK
    outputBuffer.set(mask, dataOffset - 4);

    _utilsEs62['default'].mask(mask, data);
  }

  for (var i = 0; i < dataLength; i++) {
    outputBuffer[dataOffset + i] = data[i];
  }

  return outputBuffer;
}

var privates = {
  tcpServerSocket: Symbol('tcp-socket'),
  onTCPServerSocketConnect: Symbol('onTCPServerSocketConnect'),
  onTCPServerSocketClose: Symbol('onTCPServerSocketClose'),

  onTCPSocketData: Symbol('onTCPSocketData'),
  onTCPSocketClose: Symbol('onTCPSocketClose'),

  clients: Symbol('clients'),

  onMessageFrame: Symbol('onMessageFrame')
};

/**
 * WebSocketServer constructor that accepts port to listen on.
 * @param {Number} port Number to listen for websocket connections.
 */

var WebSocketServer = (function () {
  function WebSocketServer(port) {
    _classCallCheck(this, WebSocketServer);

    _EventDispatcher2['default'].mixin(this, ['message', 'stop']);

    var tcpServerSocket = this[privates.tcpServerSocket] = navigator.mozTCPSocket.listen(port, { binaryType: 'arraybuffer' });

    tcpServerSocket.onconnect = this[privates.onTCPServerSocketConnect].bind(this);

    tcpServerSocket.onerror = this[privates.onTCPServerSocketClose].bind(this);

    this[privates.clients] = new Map();
  }

  _createClass(WebSocketServer, [{
    key: 'send',

    /**
     * Send data to the connected client
     * @param {ArrayBuffer|Array|string} data Data to send.
     */
    value: function send(data) {
      if (!ArrayBuffer.isView(data) && !(data instanceof ArrayBuffer)) {
        if (typeof data === 'string') {
          data = new Uint8Array(_utilsEs62['default'].stringToArray(data));
        } else if (Array.isArray(data)) {
          data = new Uint8Array(data);
        } else {
          throw new Error('Unsupported data type: ' + typeof data);
        }
      }

      var dataFrame = createMessageFrame(OperationCode.BINARY_FRAME, data, true, /* isCompleted */false /* isMasked */
      );

      this[privates.clients].forEach(function (client) {
        client.socket.send(dataFrame.buffer, 0, dataFrame.length);
      });
    }
  }, {
    key: 'stop',

    /**
     * Destroys socket connection.
     */
    value: function stop() {
      var _this = this;

      this[privates.clients].forEach(function (client) {
        _this[privates.onTCPSocketClose](client.socket);
      });

      var tcpServerSocket = this[privates.tcpServerSocket];
      if (tcpServerSocket) {
        tcpServerSocket.close();
        this[privates.onTCPServerSocketClose]();
      }
    }
  }, {
    key: privates.onTCPServerSocketConnect,
    value: function (tcpSocket) {
      tcpSocket.ondata = this[privates.onTCPSocketData].bind(this);
      tcpSocket.onclose = tcpSocket.onerror = this[privates.onTCPSocketClose].bind(this, tcpSocket);
    }
  }, {
    key: privates.onTCPSocketData,

    /**
     * MozTcpSocket data handler.
     * @param {TCPSocketEvent} socketEvent TCPSocket data event.
     */
    value: function (socketEvent) {
      var _this2 = this;

      var socket = socketEvent.target;
      var clientId = socket.host + ':' + socket.port;
      var client = this[privates.clients].get(clientId);

      var frameData = new Uint8Array(socketEvent.data);

      // If we don't have connection info from this host let's perform handshake.
      if (!client) {
        performHandshake(frameData).then(function (handshake) {
          if (!handshake) {
            throw new Error('Handshake with host %s:%s failed', socket.host, socket.port);
          }

          socket.send(handshake.response.buffer, 0, handshake.response.byteLength);

          var client = {
            socket: socket,
            headers: handshake.headers,
            buffer: new _frameBufferEs62['default']()
          };

          client.buffer.on('frame', _this2[privates.onMessageFrame].bind(_this2, client));

          _this2[privates.clients].set(clientId, client);
        })['catch'](function () {
          _this2[privates.onTCPSocketClose](socket);
        });
        return;
      }

      client.buffer.put(frameData);
    }
  }, {
    key: privates.onMessageFrame,

    /**
     * Process WebSocket incoming frame.
     * @param {{socket: TCPSocket, buffer: WebSocketFrameBuffer}} client Client
     * descriptor object.
     */
    value: function (client) {
      var _this3 = this;

      client.buffer.get(2).then(function (controlData) {
        var state = {
          isCompleted: (controlData[0] & 128) === 128,
          isMasked: (controlData[1] & 128) === 128,
          isCompressed: (controlData[0] & 64) === 64,
          opCode: controlData[0] & 15,
          dataLength: controlData[1] & 127,
          mask: null,
          data: []
        };

        if (state.opCode === OperationCode.CONTINUATION_FRAME) {
          throw new Error('Continuation frame is not yet supported!');
        }

        if (state.opCode === OperationCode.PONG) {
          throw new Error('Pong frame is not yet supported!');
        }

        if (state.opCode >= 3 && state.opCode <= 7) {
          throw new Error('Reserved for future non-control frames are not supported!');
        }

        if (state.opCode > 10) {
          throw new Error('Reserved for future control frames are not supported!');
        }

        return state;
      }).then(function (state) {
        var dataLengthPromise;
        if (state.dataLength === 126) {
          dataLengthPromise = client.buffer.get(2).then(function (data) {
            return _utilsEs62['default'].readUInt16(data);
          });
        } else if (state.dataLength == 127) {
          dataLengthPromise = client.buffer.get(4).then(function (data) {
            return _utilsEs62['default'].readUInt32(data);
          });
        } else {
          dataLengthPromise = Promise.resolve(state.dataLength);
        }

        return dataLengthPromise.then(function (dataLength) {
          state.dataLength = dataLength;
          return state;
        });
      }).then(function (state) {
        if (state.isMasked) {
          return client.buffer.get(4).then(function (mask) {
            state.mask = mask;
            return state;
          });
        }
        return state;
      }).then(function (state) {
        if (state.dataLength) {
          return client.buffer.get(state.dataLength).then(function (data) {
            state.data = _utilsEs62['default'].mask(state.mask, data);
            return state;
          });
        }
        return state;
      }).then(function (state) {
        var dataFrame;
        if (state.opCode === OperationCode.CONNECTION_CLOSE) {
          var code = 0;
          var reason = 'Unknown';

          if (state.dataLength > 0) {
            code = _utilsEs62['default'].readUInt16(state.data);
            if (state.dataLength > 2) {
              reason = _utilsEs62['default'].arrayToString(state.data.subarray(2));
            }
          }

          console.log('Socket is closed: %s (code is %s)', reason, code);

          dataFrame = createMessageFrame(OperationCode.CONNECTION_CLOSE, state.data, true /* isCompleted */
          );
          client.socket.send(dataFrame.buffer, 0, dataFrame.length);
          _this3[privates.onTCPSocketClose](client.socket);
        } else if (state.opCode === OperationCode.TEXT_FRAME || state.opCode === OperationCode.BINARY_FRAME) {
          _this3.emit('message', state.data);
        } else if (state.opCode === OperationCode.PING) {
          console.log('PING frame is received (masked: %s, hasData: %s)', state.isMasked, !!state.data);

          if (!state.isCompleted) {
            throw new Error('Fragmented Ping frame is not supported!');
          }

          if (state.dataLength > 125) {
            throw new Error('Ping frame can not have more than 125 bytes of data!');
          }

          dataFrame = createMessageFrame(OperationCode.PONG, state.data, true, /* isCompleted */state.isMasked);
          client.socket.send(dataFrame.buffer, 0, dataFrame.length);
        }

        if (!client.buffer.isEmpty()) {
          _this3[privates.onMessageFrame](client);
        }
      })['catch'](function (e) {
        var code = 1002;
        var reason = e.message || e.name || 'Unknown failure on server';

        console.log('Socket is closed: %s (code is %s)', reason, code);

        // 2 bytes for the code and the rest for the reason.
        var data = new Uint8Array(2 + reason.length);
        _utilsEs62['default'].writeUInt16(data, code, 0);
        data.set(_utilsEs62['default'].stringToArray(reason), 2);

        var dataFrame = createMessageFrame(OperationCode.CONNECTION_CLOSE, data, true /* isCompleted */
        );
        client.socket.send(dataFrame.buffer, 0, dataFrame.length);
        _this3[privates.onTCPSocketClose](client.socket);
      });
    }
  }, {
    key: privates.onTCPSocketClose,
    value: function (socket) {
      if (!socket) {
        return;
      }

      try {
        socket.close();
        socket.ondata = socket.onerror = socket.onclose = null;
      } catch (e) {
        console.log('Error occurred while closing socket %s', e.message || e.name);
      }

      this[privates.clients]['delete'](socket.host + ':' + socket.port);
    }
  }, {
    key: privates.onTCPServerSocketClose,
    value: function () {
      var tcpServerSocket = this[privates.tcpServerSocket];

      if (!tcpServerSocket) {
        return;
      }

      tcpServerSocket.onconnect = tcpServerSocket.onerror = null;

      this[privates.tcpServerSocket] = null;

      this.emit('stop');
    }
  }]);

  return WebSocketServer;
})();

exports['default'] = {
  Server: WebSocketServer,
  Utils: _utilsEs62['default'],
  FrameBuffer: _frameBufferEs62['default']
};
module.exports = exports['default'];

},{"./frame-buffer.es6":3,"./utils.es6":4,"EventDispatcher":2}],2:[function(require,module,exports){

},{}],3:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _EventDispatcher = require('EventDispatcher');

var _EventDispatcher2 = _interopRequireDefault(_EventDispatcher);

var privates = {
  data: Symbol('data'),
  pendingDataRequest: Symbol('pendingDataRequest'),
  splice: Symbol('splice')
};

var WebSocketFrameBuffer = (function () {
  function WebSocketFrameBuffer() {
    _classCallCheck(this, WebSocketFrameBuffer);

    _EventDispatcher2['default'].mixin(this, ['frame', 'data']);

    this[privates.data] = new Uint8Array(0);
    this[privates.pendingDataRequest] = null;
    this[privates.splice] = function (length) {
      var data = this[privates.data];

      var splicedData = data.subarray(0, length);
      this[privates.data] = data.subarray(length, data.length);

      return splicedData;
    };
  }

  _createClass(WebSocketFrameBuffer, [{
    key: 'put',
    value: function put(dataToPut) {
      var data = this[privates.data];

      var newData = new Uint8Array(data.length + dataToPut.length);
      newData.set(data);
      newData.set(dataToPut, data.length);
      this[privates.data] = newData;

      this.emit('data');

      // If no one waiting for data, let's signal that we have new frame!
      if (!this[privates.pendingDataRequest]) {
        this.emit('frame');
      }
    }
  }, {
    key: 'get',
    value: function get(dataLength) {
      var _this = this;

      if (this[privates.pendingDataRequest]) {
        throw new Error('Concurrent read is not allowed.');
      }

      this[privates.pendingDataRequest] = new Promise(function (resolve) {
        var data = _this[privates.data];
        if (data.length >= dataLength) {
          return resolve(_this[privates.splice](dataLength));
        }

        var self = _this;
        _this.on('data', function onData() {
          if (data.length < dataLength) {
            return;
          }

          self.off('data', onData);
          resolve(this[privates.splice](dataLength));
        });
      });

      return this[privates.pendingDataRequest].then(function (data) {
        _this[privates.pendingDataRequest] = null;
        return data;
      });
    }
  }, {
    key: 'isEmpty',
    value: function isEmpty() {
      return this[privates.data].length === 0;
    }
  }]);

  return WebSocketFrameBuffer;
})();

exports['default'] = WebSocketFrameBuffer;
module.exports = exports['default'];

},{"EventDispatcher":2}],4:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});
var WebSocketUtils = {
  /**
   * Mask every data element with the mask (WebSocket specific algorithm).
   * @param {Uint8Array} mask Mask array.
   * @param {Uint8Array} array Data array to mask.
   * @returns {Uint8Array} Masked data array.
   */
  mask: function mask(_mask, array) {
    if (_mask) {
      for (var i = 0; i < array.length; i++) {
        array[i] = array[i] ^ _mask[i % 4];
      }
    }
    return array;
  },

  /**
   * Generates 4-item array, every item of which is element of byte mask.
   * @returns {Uint8Array}
   */
  generateRandomMask: function generateRandomMask() {
    var random = new Uint8Array(4);

    window.crypto.getRandomValues(random);

    return random;
  },

  /**
   * Converts string to Uint8Array.
   * @param {string} stringValue String value to convert.
   * @returns {Uint8Array}
   */
  stringToArray: function stringToArray(stringValue) {
    if (typeof stringValue !== 'string') {
      throw new Error('stringValue should be valid string!');
    }

    var array = new Uint8Array(stringValue.length);
    for (var i = 0; i < stringValue.length; i++) {
      array[i] = stringValue.charCodeAt(i);
    }

    return array;
  },

  /**
   * Converts array to string. Every array element is considered as char code.
   * @param {Uint8Array} array Array with the char codes.
   * @returns {string}
   */
  arrayToString: function arrayToString(array) {
    return String.fromCharCode.apply(null, array);
  },

  /**
   * Reads unsigned 16 bit value from two consequent 8-bit array elements.
   * @param {Uint8Array} array Array to read from.
   * @param {Number?} offset Index to start read value.
   * @returns {Number}
   */
  readUInt16: function readUInt16(array, offset) {
    offset = offset || 0;
    return (array[offset] << 8) + array[offset + 1];
  },

  /**
   * Reads unsigned 32 bit value from four consequent 8-bit array elements.
   * @param {Uint8Array} array Array to read from.
   * @param {Number?} offset Index to start read value.
   * @returns {Number}
   */
  readUInt32: function readUInt32(array, offset) {
    offset = offset || 0;
    return (array[offset] << 24) + (array[offset + 1] << 16) + (array[offset + 2] << 8) + array[offset + 3];
  },

  /**
   * Writes unsigned 16 bit value to two consequent 8-bit array elements.
   * @param {Uint8Array} array Array to write to.
   * @param {Number} value 16 bit unsigned value to write into array.
   * @param {Number?} offset Index to start write value.
   * @returns {Number}
   */
  writeUInt16: function writeUInt16(array, value, offset) {
    offset = offset || 0;
    array[offset] = (value & 65280) >> 8;
    array[offset + 1] = value & 255;
  },

  /**
   * Writes unsigned 16 bit value to two consequent 8-bit array elements.
   * @param {Uint8Array} array Array to write to.
   * @param {Number} value 16 bit unsigned value to write into array.
   * @param {Number?} offset Index to start write value.
   * @returns {Number}
   */
  writeUInt32: function writeUInt32(array, value, offset) {
    offset = offset || 0;
    array[offset] = (value & 4278190080) >> 24;
    array[offset + 1] = (value & 16711680) >> 16;
    array[offset + 2] = (value & 65280) >> 8;
    array[offset + 3] = value & 255;
  }
};

exports['default'] = WebSocketUtils;
module.exports = exports['default'];

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvbWVkaWEvYXphc3lwa2luL3Byb2plY3RzL2dpdGh1Yi9meG9zLXdlYnNvY2tldC1zZXJ2ZXIvc3JjL3NlcnZlci5lczYuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9saWIvX2VtcHR5LmpzIiwiL21lZGlhL2F6YXN5cGtpbi9wcm9qZWN0cy9naXRodWIvZnhvcy13ZWJzb2NrZXQtc2VydmVyL3NyYy9mcmFtZS1idWZmZXIuZXM2LmpzIiwiL21lZGlhL2F6YXN5cGtpbi9wcm9qZWN0cy9naXRodWIvZnhvcy13ZWJzb2NrZXQtc2VydmVyL3NyYy91dGlscy5lczYuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7Ozs7Ozs7Ozs7K0JDQTRCLGlCQUFpQjs7Ozs4QkFDWixvQkFBb0I7Ozs7d0JBQzFCLGFBQWE7Ozs7Ozs7O0FBTXhDLElBQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQzs7Ozs7OztBQU9wQixJQUFNLGtCQUFrQixHQUFHLHNDQUFzQyxDQUFDOzs7Ozs7O0FBT2xFLElBQU0sNEJBQTRCLEdBQ2hDLGtDQUFrQyxHQUFHLElBQUksR0FDekMscUJBQXFCLEdBQUcsSUFBSSxHQUM1QixvQkFBb0IsR0FBRyxJQUFJLEdBQzNCLHdDQUF3QyxHQUFHLElBQUksR0FBRyxJQUFJLENBQUM7Ozs7OztBQU16RCxJQUFNLGFBQWEsR0FBRztBQUNwQixvQkFBa0IsRUFBRSxDQUFDO0FBQ3JCLFlBQVUsRUFBRSxDQUFDO0FBQ2IsY0FBWSxFQUFFLENBQUM7QUFDZixrQkFBZ0IsRUFBRSxDQUFDO0FBQ25CLE1BQUksRUFBRSxDQUFDO0FBQ1AsTUFBSSxFQUFFLEVBQUU7Q0FDVCxDQUFDOzs7Ozs7O0FBT0YsU0FBUyxjQUFjLENBQUMsZ0JBQWdCLEVBQUU7QUFDeEMsTUFBSSxXQUFXLEdBQUcsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3RELFNBQU8sSUFBSSxHQUFHLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFDLFVBQVUsRUFBSztBQUM3QyxXQUFPLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLFVBQUMsTUFBTTthQUFLLE1BQU0sQ0FBQyxJQUFJLEVBQUU7S0FBQSxDQUFDLENBQUM7R0FDN0QsQ0FBQyxDQUFDLENBQUM7Q0FDTDs7Ozs7Ozs7QUFRRCxTQUFTLGdCQUFnQixDQUFDLGVBQWUsRUFBRTtBQUN6QyxNQUFJLFdBQVcsR0FBRyxjQUFjLENBQzlCLHNCQUFlLGFBQWEsQ0FBQyxlQUFlLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUNwRSxDQUFDOztBQUVGLE1BQUksR0FBRyxHQUFHLHNCQUFlLGFBQWEsQ0FDcEMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLGtCQUFrQixDQUMxRCxDQUFDOztBQUVGLE1BQUksTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDO0FBQ2xDLFNBQU8sTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBQyxlQUFlLEVBQUs7QUFDckUsUUFBSSxZQUFZLEdBQUcsSUFBSSxDQUFDLHNCQUFlLGFBQWEsQ0FDbEQsSUFBSSxVQUFVLENBQUMsZUFBZSxDQUFDLENBQ2hDLENBQUMsQ0FBQzs7QUFFSCxRQUFJLGFBQWEsR0FBRyxzQkFBZSxhQUFhLENBQzlDLDRCQUE0QixDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxZQUFZLENBQUMsQ0FDdkUsQ0FBQzs7QUFFRixXQUFPO0FBQ0wsY0FBUSxFQUFFLGFBQWE7QUFDdkIsYUFBTyxFQUFFLFdBQVc7S0FDckIsQ0FBQztHQUNILENBQUMsQ0FBQztDQUNKOzs7Ozs7Ozs7O0FBVUQsU0FBUyxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUU7QUFDOUQsTUFBSSxVQUFVLEdBQUcsQUFBQyxJQUFJLElBQUksSUFBSSxDQUFDLE1BQU0sSUFBSyxDQUFDLENBQUM7QUFDNUMsTUFBSSxVQUFVLEdBQUcsUUFBUSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7O0FBRWxDLE1BQUksVUFBVSxHQUFHLENBQUMsQ0FBQztBQUNuQixNQUFJLFVBQVUsSUFBSSxLQUFLLEVBQUU7QUFDdkIsY0FBVSxJQUFJLENBQUMsQ0FBQztBQUNoQixjQUFVLEdBQUcsR0FBRyxDQUFDO0dBQ2xCLE1BQU0sSUFBSSxVQUFVLEdBQUcsR0FBRyxFQUFFO0FBQzNCLGNBQVUsSUFBSSxDQUFDLENBQUM7QUFDaEIsY0FBVSxHQUFHLEdBQUcsQ0FBQztHQUNsQixNQUFNO0FBQ0wsY0FBVSxHQUFHLFVBQVUsQ0FBQztHQUN6Qjs7QUFFRCxNQUFJLFlBQVksR0FBRyxJQUFJLFVBQVUsQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDLENBQUM7OztBQUczRCxjQUFZLENBQUMsQ0FBQyxDQUFDLEdBQUcsVUFBVSxHQUFHLE1BQU0sR0FBRyxHQUFJLEdBQUcsTUFBTSxDQUFDO0FBQ3RELGNBQVksQ0FBQyxDQUFDLENBQUMsR0FBRyxRQUFRLEdBQUcsVUFBVSxHQUFHLEdBQUksR0FBRyxVQUFVLENBQUM7OztBQUc1RCxVQUFRLFVBQVU7QUFDaEIsU0FBSyxHQUFHO0FBQ04sNEJBQWUsV0FBVyxDQUFDLFlBQVksRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFDeEQsWUFBTTtBQUFBLEFBQ1IsU0FBSyxHQUFHO0FBQ04sNEJBQWUsV0FBVyxDQUFDLFlBQVksRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFDL0MsNEJBQWUsV0FBVyxDQUFDLFlBQVksRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFDeEQsWUFBTTtBQUFBLEdBQ1Q7O0FBRUQsTUFBSSxRQUFRLElBQUksVUFBVSxFQUFFO0FBQzFCLFFBQUksSUFBSSxHQUFHLHNCQUFlLGtCQUFrQixFQUFFLENBQUM7OztBQUcvQyxnQkFBWSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsVUFBVSxHQUFHLENBQUMsQ0FBQyxDQUFDOztBQUV2QywwQkFBZSxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0dBQ2pDOztBQUVELE9BQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxVQUFVLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDbEMsZ0JBQVksQ0FBQyxVQUFVLEdBQUcsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0dBQ3hDOztBQUVELFNBQU8sWUFBWSxDQUFDO0NBQ3JCOztBQUVELElBQUksUUFBUSxHQUFHO0FBQ2IsaUJBQWUsRUFBRSxNQUFNLENBQUMsWUFBWSxDQUFDO0FBQ3JDLDBCQUF3QixFQUFFLE1BQU0sQ0FBQywwQkFBMEIsQ0FBQztBQUM1RCx3QkFBc0IsRUFBRSxNQUFNLENBQUMsd0JBQXdCLENBQUM7O0FBRXhELGlCQUFlLEVBQUUsTUFBTSxDQUFDLGlCQUFpQixDQUFDO0FBQzFDLGtCQUFnQixFQUFFLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQzs7QUFFNUMsU0FBTyxFQUFFLE1BQU0sQ0FBQyxTQUFTLENBQUM7O0FBRTFCLGdCQUFjLEVBQUUsTUFBTSxDQUFDLGdCQUFnQixDQUFDO0NBQ3pDLENBQUM7Ozs7Ozs7SUFNSSxlQUFlO0FBQ1IsV0FEUCxlQUFlLENBQ1AsSUFBSSxFQUFFOzBCQURkLGVBQWU7O0FBRWpCLGlDQUFnQixLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsU0FBUyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7O0FBRWpELFFBQUksZUFBZSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLEdBQ2xELFNBQVMsQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsQ0FBQyxDQUFDOztBQUVyRSxtQkFBZSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLHdCQUF3QixDQUFDLENBQUMsSUFBSSxDQUN0RSxJQUFJLENBQ0wsQ0FBQzs7QUFFRixtQkFBZSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLHNCQUFzQixDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDOztBQUUzRSxRQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7R0FDcEM7O2VBZEcsZUFBZTs7Ozs7OztXQW9CZixjQUFDLElBQUksRUFBRTtBQUNULFVBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxZQUFZLFdBQVcsQ0FBQSxBQUFDLEVBQUU7QUFDL0QsWUFBSSxPQUFPLElBQUksS0FBSyxRQUFRLEVBQUU7QUFDNUIsY0FBSSxHQUFHLElBQUksVUFBVSxDQUFDLHNCQUFlLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1NBQzNELE1BQU0sSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFO0FBQzlCLGNBQUksR0FBRyxJQUFJLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztTQUM3QixNQUFNO0FBQ0wsZ0JBQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLEdBQUcsT0FBTyxJQUFJLENBQUMsQ0FBQztTQUMxRDtPQUNGOztBQUVELFVBQUksU0FBUyxHQUFHLGtCQUFrQixDQUNoQyxhQUFhLENBQUMsWUFBWSxFQUMxQixJQUFJLEVBQ0osSUFBSSxtQkFDSixLQUFLO09BQ04sQ0FBQzs7QUFFRixVQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxVQUFDLE1BQU0sRUFBSztBQUN6QyxjQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7T0FDM0QsQ0FBQyxDQUFDO0tBQ0o7Ozs7Ozs7V0FLRyxnQkFBRzs7O0FBQ0wsVUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxPQUFPLENBQUMsVUFBQyxNQUFNLEVBQUs7QUFDekMsY0FBSyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7T0FDaEQsQ0FBQyxDQUFDOztBQUVILFVBQUksZUFBZSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLENBQUM7QUFDckQsVUFBSSxlQUFlLEVBQUU7QUFDbkIsdUJBQWUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztBQUN4QixZQUFJLENBQUMsUUFBUSxDQUFDLHNCQUFzQixDQUFDLEVBQUUsQ0FBQztPQUN6QztLQUNGOztTQUVBLFFBQVEsQ0FBQyx3QkFBd0I7V0FBQyxVQUFDLFNBQVMsRUFBRTtBQUM3QyxlQUFTLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQzdELGVBQVMsQ0FBQyxPQUFPLEdBQUcsU0FBUyxDQUFDLE9BQU8sR0FDbkMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUM7S0FDekQ7O1NBTUEsUUFBUSxDQUFDLGVBQWU7Ozs7OztXQUFDLFVBQUMsV0FBVyxFQUFFOzs7QUFDdEMsVUFBSSxNQUFNLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQztBQUNoQyxVQUFJLFFBQVEsR0FBRyxNQUFNLENBQUMsSUFBSSxHQUFHLEdBQUcsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDO0FBQy9DLFVBQUksTUFBTSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDOztBQUVsRCxVQUFJLFNBQVMsR0FBRyxJQUFJLFVBQVUsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7OztBQUdqRCxVQUFJLENBQUMsTUFBTSxFQUFFO0FBQ1gsd0JBQWdCLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQUMsU0FBUyxFQUFLO0FBQzlDLGNBQUksQ0FBQyxTQUFTLEVBQUU7QUFDZCxrQkFBTSxJQUFJLEtBQUssQ0FDYixrQ0FBa0MsRUFBRSxNQUFNLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQzdELENBQUM7V0FDSDs7QUFFRCxnQkFBTSxDQUFDLElBQUksQ0FDVCxTQUFTLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsU0FBUyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQzVELENBQUM7O0FBRUYsY0FBSSxNQUFNLEdBQUc7QUFDWCxrQkFBTSxFQUFFLE1BQU07QUFDZCxtQkFBTyxFQUFFLFNBQVMsQ0FBQyxPQUFPO0FBQzFCLGtCQUFNLEVBQUUsaUNBQTBCO1dBQ25DLENBQUM7O0FBRUYsZ0JBQU0sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUNkLE9BQU8sRUFBRSxPQUFLLFFBQVEsQ0FBQyxjQUFjLENBQUMsQ0FBQyxJQUFJLFNBQU8sTUFBTSxDQUFDLENBQzFELENBQUM7O0FBRUYsaUJBQUssUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsTUFBTSxDQUFDLENBQUM7U0FDOUMsQ0FBQyxTQUFNLENBQUMsWUFBTTtBQUNiLGlCQUFLLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1NBQ3pDLENBQUMsQ0FBQztBQUNILGVBQU87T0FDUjs7QUFFRCxZQUFNLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQztLQUM5Qjs7U0FPQSxRQUFRLENBQUMsY0FBYzs7Ozs7OztXQUFDLFVBQUMsTUFBTSxFQUFFOzs7QUFDaEMsWUFBTSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQUMsV0FBVyxFQUFLO0FBQ3pDLFlBQUksS0FBSyxHQUFHO0FBQ1YscUJBQVcsRUFBRSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFJLENBQUEsS0FBTSxHQUFJO0FBQzdDLGtCQUFRLEVBQUUsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBSSxDQUFBLEtBQU0sR0FBSTtBQUMxQyxzQkFBWSxFQUFFLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUksQ0FBQSxLQUFNLEVBQUk7QUFDOUMsZ0JBQU0sRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRztBQUM1QixvQkFBVSxFQUFFLFdBQVcsQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFJO0FBQ2pDLGNBQUksRUFBRSxJQUFJO0FBQ1YsY0FBSSxFQUFFLEVBQUU7U0FDVCxDQUFDOztBQUVGLFlBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxhQUFhLENBQUMsa0JBQWtCLEVBQUU7QUFDckQsZ0JBQU0sSUFBSSxLQUFLLENBQUMsMENBQTBDLENBQUMsQ0FBQztTQUM3RDs7QUFFRCxZQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssYUFBYSxDQUFDLElBQUksRUFBRTtBQUN2QyxnQkFBTSxJQUFJLEtBQUssQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1NBQ3JEOztBQUVELFlBQUksS0FBSyxDQUFDLE1BQU0sSUFBSSxDQUFDLElBQUksS0FBSyxDQUFDLE1BQU0sSUFBSSxDQUFDLEVBQUU7QUFDMUMsZ0JBQU0sSUFBSSxLQUFLLENBQ2IsMkRBQTJELENBQzVELENBQUM7U0FDSDs7QUFFRCxZQUFJLEtBQUssQ0FBQyxNQUFNLEdBQUcsRUFBRSxFQUFFO0FBQ3JCLGdCQUFNLElBQUksS0FBSyxDQUNiLHVEQUF1RCxDQUN4RCxDQUFDO1NBQ0g7O0FBRUQsZUFBTyxLQUFLLENBQUM7T0FDZCxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQUMsS0FBSyxFQUFLO0FBQ2pCLFlBQUksaUJBQWlCLENBQUM7QUFDdEIsWUFBSSxLQUFLLENBQUMsVUFBVSxLQUFLLEdBQUcsRUFBRTtBQUM1QiwyQkFBaUIsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQzNDLFVBQUMsSUFBSTttQkFBSyxzQkFBZSxVQUFVLENBQUMsSUFBSSxDQUFDO1dBQUEsQ0FDMUMsQ0FBQztTQUNILE1BQU0sSUFBSSxLQUFLLENBQUMsVUFBVSxJQUFJLEdBQUcsRUFBRTtBQUNsQywyQkFBaUIsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQzNDLFVBQUMsSUFBSTttQkFBSyxzQkFBZSxVQUFVLENBQUMsSUFBSSxDQUFDO1dBQUEsQ0FDMUMsQ0FBQztTQUNILE1BQU07QUFDTCwyQkFBaUIsR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQztTQUN2RDs7QUFFRCxlQUFPLGlCQUFpQixDQUFDLElBQUksQ0FBQyxVQUFDLFVBQVUsRUFBSztBQUM1QyxlQUFLLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztBQUM5QixpQkFBTyxLQUFLLENBQUM7U0FDZCxDQUFDLENBQUM7T0FDSixDQUFDLENBQUMsSUFBSSxDQUFDLFVBQUMsS0FBSyxFQUFLO0FBQ2pCLFlBQUksS0FBSyxDQUFDLFFBQVEsRUFBRTtBQUNsQixpQkFBTyxNQUFNLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBQyxJQUFJLEVBQUs7QUFDekMsaUJBQUssQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQ2xCLG1CQUFPLEtBQUssQ0FBQztXQUNkLENBQUMsQ0FBQztTQUNKO0FBQ0QsZUFBTyxLQUFLLENBQUM7T0FDZCxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQUMsS0FBSyxFQUFLO0FBQ2pCLFlBQUksS0FBSyxDQUFDLFVBQVUsRUFBRTtBQUNwQixpQkFBTyxNQUFNLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQUMsSUFBSSxFQUFLO0FBQ3hELGlCQUFLLENBQUMsSUFBSSxHQUFHLHNCQUFlLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ25ELG1CQUFPLEtBQUssQ0FBQztXQUNkLENBQUMsQ0FBQztTQUNKO0FBQ0QsZUFBTyxLQUFLLENBQUM7T0FDZCxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQUMsS0FBSyxFQUFLO0FBQ2pCLFlBQUksU0FBUyxDQUFDO0FBQ2QsWUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLGFBQWEsQ0FBQyxnQkFBZ0IsRUFBRTtBQUNuRCxjQUFJLElBQUksR0FBRyxDQUFDLENBQUM7QUFDYixjQUFJLE1BQU0sR0FBRyxTQUFTLENBQUM7O0FBRXZCLGNBQUksS0FBSyxDQUFDLFVBQVUsR0FBRyxDQUFDLEVBQUU7QUFDeEIsZ0JBQUksR0FBSSxzQkFBZSxVQUFVLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQzlDLGdCQUFJLEtBQUssQ0FBQyxVQUFVLEdBQUcsQ0FBQyxFQUFFO0FBQ3hCLG9CQUFNLEdBQUcsc0JBQWUsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFDL0Q7V0FDRjs7QUFFRCxpQkFBTyxDQUFDLEdBQUcsQ0FBQyxtQ0FBbUMsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7O0FBRS9ELG1CQUFTLEdBQUcsa0JBQWtCLENBQzVCLGFBQWEsQ0FBQyxnQkFBZ0IsRUFBRSxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUk7V0FDakQsQ0FBQztBQUNGLGdCQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDMUQsaUJBQUssUUFBUSxDQUFDLGdCQUFnQixDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1NBQ2hELE1BQU0sSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLGFBQWEsQ0FBQyxVQUFVLElBQ3pDLEtBQUssQ0FBQyxNQUFNLEtBQUssYUFBYSxDQUFDLFlBQVksRUFBRTtBQUN0RCxpQkFBSyxJQUFJLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztTQUNsQyxNQUFNLElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxhQUFhLENBQUMsSUFBSSxFQUFFO0FBQzlDLGlCQUFPLENBQUMsR0FBRyxDQUNULGtEQUFrRCxFQUNsRCxLQUFLLENBQUMsUUFBUSxFQUNkLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUNiLENBQUM7O0FBRUYsY0FBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUU7QUFDdEIsa0JBQU0sSUFBSSxLQUFLLENBQUMseUNBQXlDLENBQUMsQ0FBQztXQUM1RDs7QUFFRCxjQUFJLEtBQUssQ0FBQyxVQUFVLEdBQUcsR0FBRyxFQUFFO0FBQzFCLGtCQUFNLElBQUksS0FBSyxDQUNiLHNEQUFzRCxDQUN2RCxDQUFDO1dBQ0g7O0FBRUQsbUJBQVMsR0FBRyxrQkFBa0IsQ0FDNUIsYUFBYSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksbUJBQW9CLEtBQUssQ0FBQyxRQUFRLENBQ3ZFLENBQUM7QUFDRixnQkFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1NBQzNEOztBQUVELFlBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxFQUFFO0FBQzVCLGlCQUFLLFFBQVEsQ0FBQyxjQUFjLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztTQUN2QztPQUNGLENBQUMsU0FBTSxDQUFDLFVBQUMsQ0FBQyxFQUFLO0FBQ2QsWUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQ2hCLFlBQUksTUFBTSxHQUFHLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxDQUFDLElBQUksSUFBSSwyQkFBMkIsQ0FBQzs7QUFFaEUsZUFBTyxDQUFDLEdBQUcsQ0FBQyxtQ0FBbUMsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7OztBQUcvRCxZQUFJLElBQUksR0FBRyxJQUFJLFVBQVUsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQzdDLDhCQUFlLFdBQVcsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO0FBQzFDLFlBQUksQ0FBQyxHQUFHLENBQUMsc0JBQWUsYUFBYSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDOztBQUVsRCxZQUFJLFNBQVMsR0FBRyxrQkFBa0IsQ0FDaEMsYUFBYSxDQUFDLGdCQUFnQixFQUFFLElBQUksRUFBRSxJQUFJO1NBQzNDLENBQUM7QUFDRixjQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDMUQsZUFBSyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7T0FDaEQsQ0FBQyxDQUFDO0tBQ0o7O1NBRUEsUUFBUSxDQUFDLGdCQUFnQjtXQUFDLFVBQUMsTUFBTSxFQUFFO0FBQ2xDLFVBQUksQ0FBQyxNQUFNLEVBQUU7QUFDWCxlQUFPO09BQ1I7O0FBRUQsVUFBSTtBQUNGLGNBQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztBQUNmLGNBQU0sQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQztPQUN4RCxDQUFDLE9BQU0sQ0FBQyxFQUFFO0FBQ1QsZUFBTyxDQUFDLEdBQUcsQ0FDVCx3Q0FBd0MsRUFBRSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQzlELENBQUM7T0FDSDs7QUFFRCxVQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxVQUFPLENBQUMsTUFBTSxDQUFDLElBQUksR0FBRyxHQUFHLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQ2hFOztTQUVBLFFBQVEsQ0FBQyxzQkFBc0I7V0FBQyxZQUFHO0FBQ2xDLFVBQUksZUFBZSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLENBQUM7O0FBRXJELFVBQUksQ0FBQyxlQUFlLEVBQUU7QUFDcEIsZUFBTztPQUNSOztBQUVELHFCQUFlLENBQUMsU0FBUyxHQUFHLGVBQWUsQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDOztBQUUzRCxVQUFJLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxHQUFHLElBQUksQ0FBQzs7QUFFdEMsVUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztLQUNuQjs7O1NBclJHLGVBQWU7OztxQkF3Uk47QUFDYixRQUFNLEVBQUUsZUFBZTtBQUN2QixPQUFLLHVCQUFnQjtBQUNyQixhQUFXLDZCQUFzQjtDQUNsQzs7OztBQzFiRDs7Ozs7Ozs7Ozs7Ozs7K0JDQTRCLGlCQUFpQjs7OztBQUU3QyxJQUFJLFFBQVEsR0FBRztBQUNiLE1BQUksRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDO0FBQ3BCLG9CQUFrQixFQUFFLE1BQU0sQ0FBQyxvQkFBb0IsQ0FBQztBQUNoRCxRQUFNLEVBQUUsTUFBTSxDQUFDLFFBQVEsQ0FBQztDQUN6QixDQUFDOztJQUVJLG9CQUFvQjtBQUNiLFdBRFAsb0JBQW9CLEdBQ1Y7MEJBRFYsb0JBQW9COztBQUV0QixpQ0FBZ0IsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDOztBQUUvQyxRQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3hDLFFBQUksQ0FBQyxRQUFRLENBQUMsa0JBQWtCLENBQUMsR0FBRyxJQUFJLENBQUM7QUFDekMsUUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsR0FBRyxVQUFTLE1BQU0sRUFBRTtBQUN2QyxVQUFJLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDOztBQUUvQixVQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQztBQUMzQyxVQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQzs7QUFFekQsYUFBTyxXQUFXLENBQUM7S0FDcEIsQ0FBQztHQUNIOztlQWRHLG9CQUFvQjs7V0FnQnJCLGFBQUMsU0FBUyxFQUFFO0FBQ2IsVUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQzs7QUFFL0IsVUFBSSxPQUFPLEdBQUcsSUFBSSxVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDN0QsYUFBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNsQixhQUFPLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDcEMsVUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsR0FBRyxPQUFPLENBQUM7O0FBRTlCLFVBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7OztBQUdsQixVQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFO0FBQ3RDLFlBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7T0FDcEI7S0FDRjs7O1dBRUUsYUFBQyxVQUFVLEVBQUU7OztBQUNkLFVBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFO0FBQ3JDLGNBQU0sSUFBSSxLQUFLLENBQUMsaUNBQWlDLENBQUMsQ0FBQztPQUNwRDs7QUFFRCxVQUFJLENBQUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsSUFBSSxPQUFPLENBQUMsVUFBQyxPQUFPLEVBQUs7QUFDM0QsWUFBSSxJQUFJLEdBQUcsTUFBSyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDL0IsWUFBSSxJQUFJLENBQUMsTUFBTSxJQUFJLFVBQVUsRUFBRTtBQUM3QixpQkFBTyxPQUFPLENBQUMsTUFBSyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztTQUNuRDs7QUFFRCxZQUFJLElBQUksUUFBTyxDQUFDO0FBQ2hCLGNBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxTQUFTLE1BQU0sR0FBRztBQUNoQyxjQUFJLElBQUksQ0FBQyxNQUFNLEdBQUcsVUFBVSxFQUFFO0FBQzVCLG1CQUFPO1dBQ1I7O0FBRUQsY0FBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7QUFDekIsaUJBQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7U0FDNUMsQ0FBQyxDQUFDO09BQ0osQ0FBQyxDQUFDOztBQUVILGFBQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFDLElBQUksRUFBSztBQUN0RCxjQUFLLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLElBQUksQ0FBQztBQUN6QyxlQUFPLElBQUksQ0FBQztPQUNiLENBQUMsQ0FBQztLQUNKOzs7V0FFTSxtQkFBRztBQUNSLGFBQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDO0tBQ3pDOzs7U0E5REcsb0JBQW9COzs7cUJBaUVYLG9CQUFvQjs7Ozs7Ozs7O0FDekVuQyxJQUFJLGNBQWMsR0FBRzs7Ozs7OztBQU9uQixNQUFJLEVBQUEsY0FBQyxLQUFJLEVBQUUsS0FBSyxFQUFFO0FBQ2hCLFFBQUksS0FBSSxFQUFFO0FBQ1IsV0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDckMsYUFBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO09BQ25DO0tBQ0Y7QUFDRCxXQUFPLEtBQUssQ0FBQztHQUNkOzs7Ozs7QUFNRCxvQkFBa0IsRUFBQSw4QkFBRztBQUNuQixRQUFJLE1BQU0sR0FBRyxJQUFJLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQzs7QUFFL0IsVUFBTSxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLENBQUM7O0FBRXRDLFdBQU8sTUFBTSxDQUFDO0dBQ2Y7Ozs7Ozs7QUFPRCxlQUFhLEVBQUEsdUJBQUMsV0FBVyxFQUFFO0FBQ3pCLFFBQUksT0FBTyxXQUFXLEtBQUssUUFBUSxFQUFFO0FBQ25DLFlBQU0sSUFBSSxLQUFLLENBQUMscUNBQXFDLENBQUMsQ0FBQztLQUN4RDs7QUFFRCxRQUFJLEtBQUssR0FBRyxJQUFJLFVBQVUsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDL0MsU0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDM0MsV0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7S0FDdEM7O0FBRUQsV0FBTyxLQUFLLENBQUM7R0FDZDs7Ozs7OztBQU9ELGVBQWEsRUFBQSx1QkFBQyxLQUFLLEVBQUU7QUFDbkIsV0FBTyxNQUFNLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7R0FDL0M7Ozs7Ozs7O0FBUUQsWUFBVSxFQUFBLG9CQUFDLEtBQUssRUFBRSxNQUFNLEVBQUU7QUFDeEIsVUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLENBQUM7QUFDckIsV0FBTyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUEsR0FBSSxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO0dBQ2pEOzs7Ozs7OztBQVFELFlBQVUsRUFBQSxvQkFBQyxLQUFLLEVBQUUsTUFBTSxFQUFFO0FBQ3hCLFVBQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxDQUFDO0FBQ3JCLFdBQU8sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFBLElBQ3hCLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFBLEFBQUMsSUFDeEIsS0FBSyxDQUFFLE1BQU0sR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUEsQUFBQyxHQUN6QixLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO0dBQ3JCOzs7Ozs7Ozs7QUFTRCxhQUFXLEVBQUEscUJBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUU7QUFDaEMsVUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLENBQUM7QUFDckIsU0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxHQUFHLEtBQU0sQ0FBQSxJQUFLLENBQUMsQ0FBQztBQUN0QyxTQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxHQUFHLEtBQUssR0FBRyxHQUFJLENBQUM7R0FDbEM7Ozs7Ozs7OztBQVNELGFBQVcsRUFBQSxxQkFBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRTtBQUNoQyxVQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsQ0FBQztBQUNyQixTQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEdBQUcsVUFBVSxDQUFBLElBQUssRUFBRSxDQUFDO0FBQzNDLFNBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEdBQUcsUUFBUSxDQUFBLElBQUssRUFBRSxDQUFDO0FBQzdDLFNBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEdBQUcsS0FBTSxDQUFBLElBQUssQ0FBQyxDQUFDO0FBQzFDLFNBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEdBQUcsS0FBSyxHQUFHLEdBQUksQ0FBQztHQUNsQztDQUNGLENBQUM7O3FCQUVhLGNBQWMiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiaW1wb3J0IEV2ZW50RGlzcGF0Y2hlciBmcm9tICdFdmVudERpc3BhdGNoZXInO1xuaW1wb3J0IFdlYlNvY2tldEZyYW1lQnVmZmVyIGZyb20gJy4vZnJhbWUtYnVmZmVyLmVzNic7XG5pbXBvcnQgV2ViU29ja2V0VXRpbHMgZnJvbSAnLi91dGlscy5lczYnO1xuXG4vKipcbiAqIFNlcXVlbmNlIHVzZWQgdG8gc2VwYXJhdGUgSFRUUCByZXF1ZXN0IGhlYWRlcnMgYW5kIGJvZHkuXG4gKiBAY29uc3Qge3N0cmluZ31cbiAqL1xuY29uc3QgQ1JMRiA9ICdcXHJcXG4nO1xuXG4vKipcbiAqIE1hZ2ljIEdVSUQgZGVmaW5lZCBieSBSRkMgdG8gY29uY2F0ZW5hdGUgd2l0aCB3ZWIgc29ja2V0IGtleSBkdXJpbmdcbiAqIHdlYnNvY2tldCBoYW5kc2hha2UuXG4gKiBAY29uc3Qge3N0cmluZ31cbiAqL1xuY29uc3QgV0VCU09DS0VUX0tFWV9HVUlEID0gJzI1OEVBRkE1LUU5MTQtNDdEQS05NUNBLUM1QUIwREM4NUIxMSc7XG5cbi8qKlxuICogV2Vic29ja2V0IGhhbmRzaGFrZSByZXNwb25zZSB0ZW1wbGF0ZSBzdHJpbmcsIHt3ZWItc29ja2V0LWtleX0gc2hvdWxkIGJlXG4gKiByZXBsYWNlZCB3aXRoIHRoZSBhcHByb3ByaWF0ZSBrZXkuXG4gKiBAY29uc3Qge3N0cmluZ31cbiAqL1xuY29uc3QgV0VCU09DS0VUX0hBTkRTSEFLRV9SRVNQT05TRSA9XG4gICdIVFRQLzEuMSAxMDEgU3dpdGNoaW5nIFByb3RvY29scycgKyBDUkxGICtcbiAgJ0Nvbm5lY3Rpb246IFVwZ3JhZGUnICsgQ1JMRiArXG4gICdVcGdyYWRlOiB3ZWJzb2NrZXQnICsgQ1JMRiArXG4gICdTZWMtV2ViU29ja2V0LUFjY2VwdDoge3dlYi1zb2NrZXQta2V5fScgKyBDUkxGICsgQ1JMRjtcblxuLyoqXG4gKiBFbnVtZXJhdGlvbiBvZiBhbGwgcG9zc2libGUgb3BlcmF0aW9uIGNvZGVzLlxuICogQGVudW0ge251bWJlcn1cbiAqL1xuY29uc3QgT3BlcmF0aW9uQ29kZSA9IHtcbiAgQ09OVElOVUFUSU9OX0ZSQU1FOiAwLFxuICBURVhUX0ZSQU1FOiAxLFxuICBCSU5BUllfRlJBTUU6IDIsXG4gIENPTk5FQ1RJT05fQ0xPU0U6IDgsXG4gIFBJTkc6IDksXG4gIFBPTkc6IDEwXG59O1xuXG4vKipcbiAqIEV4dHJhY3RzIEhUVFAgaGVhZGVyIG1hcCBmcm9tIEhUVFAgaGVhZGVyIHN0cmluZy5cbiAqIEBwYXJhbSB7c3RyaW5nfSBodHRwSGVhZGVyU3RyaW5nIEhUVFAgaGVhZGVyIHN0cmluZy5cbiAqIEByZXR1cm5zIHtNYXAuPHN0cmluZywgc3RyaW5nPn0gSFRUUCBoZWFkZXIga2V5LXZhbHVlIG1hcC5cbiAqL1xuZnVuY3Rpb24gZ2V0SHR0cEhlYWRlcnMoaHR0cEhlYWRlclN0cmluZykge1xuICB2YXIgaHR0cEhlYWRlcnMgPSBodHRwSGVhZGVyU3RyaW5nLnRyaW0oKS5zcGxpdChDUkxGKTtcbiAgcmV0dXJuIG5ldyBNYXAoaHR0cEhlYWRlcnMubWFwKChodHRwSGVhZGVyKSA9PiB7XG4gICAgcmV0dXJuIGh0dHBIZWFkZXIuc3BsaXQoJzonKS5tYXAoKGVudGl0eSkgPT4gZW50aXR5LnRyaW0oKSk7XG4gIH0pKTtcbn1cblxuLyoqXG4gKiBQZXJmb3JtcyBXZWJTb2NrZXQgSFRUUCBIYW5kc2hha2UuXG4gKiBAcGFyYW0ge1VpbnQ4QXJyYXl9IGh0dHBSZXF1ZXN0RGF0YSBIVFRQIEhhbmRzaGFrZSBkYXRhIGFycmF5LlxuICogQHJldHVybnMge1Byb21pc2UuPHsgcmVzcG9uc2U6IFVpbnQ4QXJyYXksIGhlYWRlcnM6IE1hcDxzdHJpbmcsIHN0cmluZz59Pn1cbiAqIENvbnRhaW5zIGhhbmRzaGFrZSBoZWFkZXJzIHJlY2VpdmVkIGZyb20gY2xpZW50IGFuZCByZXNwb25zZSB0byBzZW5kLlxuICovXG5mdW5jdGlvbiBwZXJmb3JtSGFuZHNoYWtlKGh0dHBSZXF1ZXN0RGF0YSkge1xuICB2YXIgaHR0cEhlYWRlcnMgPSBnZXRIdHRwSGVhZGVycyhcbiAgICBXZWJTb2NrZXRVdGlscy5hcnJheVRvU3RyaW5nKGh0dHBSZXF1ZXN0RGF0YSkuc3BsaXQoQ1JMRiArIENSTEYpWzBdXG4gICk7XG5cbiAgdmFyIGtleSA9IFdlYlNvY2tldFV0aWxzLnN0cmluZ1RvQXJyYXkoXG4gICAgaHR0cEhlYWRlcnMuZ2V0KCdTZWMtV2ViU29ja2V0LUtleScpICsgV0VCU09DS0VUX0tFWV9HVUlEXG4gICk7XG5cbiAgdmFyIHN1YnRsZSA9IHdpbmRvdy5jcnlwdG8uc3VidGxlO1xuICByZXR1cm4gc3VidGxlLmRpZ2VzdCh7IG5hbWU6ICdTSEEtMScgfSwga2V5KS50aGVuKChoYXNoQXJyYXlCdWZmZXIpID0+IHtcbiAgICB2YXIgd2ViU29ja2V0S2V5ID0gYnRvYShXZWJTb2NrZXRVdGlscy5hcnJheVRvU3RyaW5nKFxuICAgICAgbmV3IFVpbnQ4QXJyYXkoaGFzaEFycmF5QnVmZmVyKVxuICAgICkpO1xuXG4gICAgdmFyIGFycmF5UmVzcG9uc2UgPSBXZWJTb2NrZXRVdGlscy5zdHJpbmdUb0FycmF5KFxuICAgICAgV0VCU09DS0VUX0hBTkRTSEFLRV9SRVNQT05TRS5yZXBsYWNlKCd7d2ViLXNvY2tldC1rZXl9Jywgd2ViU29ja2V0S2V5KVxuICAgICk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgcmVzcG9uc2U6IGFycmF5UmVzcG9uc2UsXG4gICAgICBoZWFkZXJzOiBodHRwSGVhZGVyc1xuICAgIH07XG4gIH0pO1xufVxuXG4vKipcbiAqIENyZWF0ZXMgb3V0Z29pbmcgd2Vic29ja2V0IG1lc3NhZ2UgZnJhbWUuXG4gKiBAcGFyYW0ge051bWJlcn0gb3BDb2RlIEZyYW1lIG9wZXJhdGlvbiBjb2RlLlxuICogQHBhcmFtIHtVaW50OEFycmF5fSBkYXRhIERhdGEgYXJyYXkuXG4gKiBAcGFyYW0ge0Jvb2xlYW59IGlzQ29tcGxldGUgSW5kaWNhdGVzIGlmIGZyYW1lIGlzIGNvbXBsZXRlZC5cbiAqIEBwYXJhbSB7Qm9vbGVhbj99IGlzTWFza2VkIEluZGljYXRlcyBpZiBmcmFtZSBkYXRhIHNob3VsZCBiZSBtYXNrZWQuXG4gKiBAcmV0dXJucyB7VWludDhBcnJheX0gQ29uc3RydWN0ZWQgZnJhbWUgZGF0YS5cbiAqL1xuZnVuY3Rpb24gY3JlYXRlTWVzc2FnZUZyYW1lKG9wQ29kZSwgZGF0YSwgaXNDb21wbGV0ZSwgaXNNYXNrZWQpIHtcbiAgdmFyIGRhdGFMZW5ndGggPSAoZGF0YSAmJiBkYXRhLmxlbmd0aCkgfHwgMDtcbiAgdmFyIGRhdGFPZmZzZXQgPSBpc01hc2tlZCA/IDYgOiAyO1xuXG4gIHZhciBzZWNvbmRCeXRlID0gMDtcbiAgaWYgKGRhdGFMZW5ndGggPj0gNjU1MzYpIHtcbiAgICBkYXRhT2Zmc2V0ICs9IDg7XG4gICAgc2Vjb25kQnl0ZSA9IDEyNztcbiAgfSBlbHNlIGlmIChkYXRhTGVuZ3RoID4gMTI1KSB7XG4gICAgZGF0YU9mZnNldCArPSAyO1xuICAgIHNlY29uZEJ5dGUgPSAxMjY7XG4gIH0gZWxzZSB7XG4gICAgc2Vjb25kQnl0ZSA9IGRhdGFMZW5ndGg7XG4gIH1cblxuICB2YXIgb3V0cHV0QnVmZmVyID0gbmV3IFVpbnQ4QXJyYXkoZGF0YU9mZnNldCArIGRhdGFMZW5ndGgpO1xuXG4gIC8vIFdyaXRpbmcgT1BDT0RFLCBGSU4gYW5kIExFTkdUSFxuICBvdXRwdXRCdWZmZXJbMF0gPSBpc0NvbXBsZXRlID8gb3BDb2RlIHwgMHg4MCA6IG9wQ29kZTtcbiAgb3V0cHV0QnVmZmVyWzFdID0gaXNNYXNrZWQgPyBzZWNvbmRCeXRlIHwgMHg4MCA6IHNlY29uZEJ5dGU7XG5cbiAgLy8gV3JpdGluZyBEQVRBIExFTkdUSFxuICBzd2l0Y2ggKHNlY29uZEJ5dGUpIHtcbiAgICBjYXNlIDEyNjpcbiAgICAgIFdlYlNvY2tldFV0aWxzLndyaXRlVUludDE2KG91dHB1dEJ1ZmZlciwgZGF0YUxlbmd0aCwgMik7XG4gICAgICBicmVhaztcbiAgICBjYXNlIDEyNzpcbiAgICAgIFdlYlNvY2tldFV0aWxzLndyaXRlVUludDMyKG91dHB1dEJ1ZmZlciwgMCwgMik7XG4gICAgICBXZWJTb2NrZXRVdGlscy53cml0ZVVJbnQzMihvdXRwdXRCdWZmZXIsIGRhdGFMZW5ndGgsIDYpO1xuICAgICAgYnJlYWs7XG4gIH1cblxuICBpZiAoaXNNYXNrZWQgJiYgZGF0YUxlbmd0aCkge1xuICAgIHZhciBtYXNrID0gV2ViU29ja2V0VXRpbHMuZ2VuZXJhdGVSYW5kb21NYXNrKCk7XG5cbiAgICAvLyBXcml0aW5nIE1BU0tcbiAgICBvdXRwdXRCdWZmZXIuc2V0KG1hc2ssIGRhdGFPZmZzZXQgLSA0KTtcblxuICAgIFdlYlNvY2tldFV0aWxzLm1hc2sobWFzaywgZGF0YSk7XG4gIH1cblxuICBmb3IodmFyIGkgPSAwOyBpIDwgZGF0YUxlbmd0aDsgaSsrKSB7XG4gICAgb3V0cHV0QnVmZmVyW2RhdGFPZmZzZXQgKyBpXSA9IGRhdGFbaV07XG4gIH1cblxuICByZXR1cm4gb3V0cHV0QnVmZmVyO1xufVxuXG52YXIgcHJpdmF0ZXMgPSB7XG4gIHRjcFNlcnZlclNvY2tldDogU3ltYm9sKCd0Y3Atc29ja2V0JyksXG4gIG9uVENQU2VydmVyU29ja2V0Q29ubmVjdDogU3ltYm9sKCdvblRDUFNlcnZlclNvY2tldENvbm5lY3QnKSxcbiAgb25UQ1BTZXJ2ZXJTb2NrZXRDbG9zZTogU3ltYm9sKCdvblRDUFNlcnZlclNvY2tldENsb3NlJyksXG5cbiAgb25UQ1BTb2NrZXREYXRhOiBTeW1ib2woJ29uVENQU29ja2V0RGF0YScpLFxuICBvblRDUFNvY2tldENsb3NlOiBTeW1ib2woJ29uVENQU29ja2V0Q2xvc2UnKSxcblxuICBjbGllbnRzOiBTeW1ib2woJ2NsaWVudHMnKSxcblxuICBvbk1lc3NhZ2VGcmFtZTogU3ltYm9sKCdvbk1lc3NhZ2VGcmFtZScpXG59O1xuXG4vKipcbiAqIFdlYlNvY2tldFNlcnZlciBjb25zdHJ1Y3RvciB0aGF0IGFjY2VwdHMgcG9ydCB0byBsaXN0ZW4gb24uXG4gKiBAcGFyYW0ge051bWJlcn0gcG9ydCBOdW1iZXIgdG8gbGlzdGVuIGZvciB3ZWJzb2NrZXQgY29ubmVjdGlvbnMuXG4gKi9cbmNsYXNzIFdlYlNvY2tldFNlcnZlciB7XG4gIGNvbnN0cnVjdG9yKHBvcnQpIHtcbiAgICBFdmVudERpc3BhdGNoZXIubWl4aW4odGhpcywgWydtZXNzYWdlJywgJ3N0b3AnXSk7XG5cbiAgICB2YXIgdGNwU2VydmVyU29ja2V0ID0gdGhpc1twcml2YXRlcy50Y3BTZXJ2ZXJTb2NrZXRdID1cbiAgICAgIG5hdmlnYXRvci5tb3pUQ1BTb2NrZXQubGlzdGVuKHBvcnQsIHsgYmluYXJ5VHlwZTogJ2FycmF5YnVmZmVyJyB9KTtcblxuICAgIHRjcFNlcnZlclNvY2tldC5vbmNvbm5lY3QgPSB0aGlzW3ByaXZhdGVzLm9uVENQU2VydmVyU29ja2V0Q29ubmVjdF0uYmluZChcbiAgICAgIHRoaXNcbiAgICApO1xuXG4gICAgdGNwU2VydmVyU29ja2V0Lm9uZXJyb3IgPSB0aGlzW3ByaXZhdGVzLm9uVENQU2VydmVyU29ja2V0Q2xvc2VdLmJpbmQodGhpcyk7XG5cbiAgICB0aGlzW3ByaXZhdGVzLmNsaWVudHNdID0gbmV3IE1hcCgpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNlbmQgZGF0YSB0byB0aGUgY29ubmVjdGVkIGNsaWVudFxuICAgKiBAcGFyYW0ge0FycmF5QnVmZmVyfEFycmF5fHN0cmluZ30gZGF0YSBEYXRhIHRvIHNlbmQuXG4gICAqL1xuICBzZW5kKGRhdGEpIHtcbiAgICBpZiAoIUFycmF5QnVmZmVyLmlzVmlldyhkYXRhKSAmJiAhKGRhdGEgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikpIHtcbiAgICAgIGlmICh0eXBlb2YgZGF0YSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgZGF0YSA9IG5ldyBVaW50OEFycmF5KFdlYlNvY2tldFV0aWxzLnN0cmluZ1RvQXJyYXkoZGF0YSkpO1xuICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgICAgIGRhdGEgPSBuZXcgVWludDhBcnJheShkYXRhKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVW5zdXBwb3J0ZWQgZGF0YSB0eXBlOiAnICsgdHlwZW9mIGRhdGEpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBkYXRhRnJhbWUgPSBjcmVhdGVNZXNzYWdlRnJhbWUoXG4gICAgICBPcGVyYXRpb25Db2RlLkJJTkFSWV9GUkFNRSxcbiAgICAgIGRhdGEsXG4gICAgICB0cnVlIC8qIGlzQ29tcGxldGVkICovLFxuICAgICAgZmFsc2UgLyogaXNNYXNrZWQgKi9cbiAgICApO1xuXG4gICAgdGhpc1twcml2YXRlcy5jbGllbnRzXS5mb3JFYWNoKChjbGllbnQpID0+IHtcbiAgICAgIGNsaWVudC5zb2NrZXQuc2VuZChkYXRhRnJhbWUuYnVmZmVyLCAwLCBkYXRhRnJhbWUubGVuZ3RoKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBEZXN0cm95cyBzb2NrZXQgY29ubmVjdGlvbi5cbiAgICovXG4gIHN0b3AoKSB7XG4gICAgdGhpc1twcml2YXRlcy5jbGllbnRzXS5mb3JFYWNoKChjbGllbnQpID0+IHtcbiAgICAgIHRoaXNbcHJpdmF0ZXMub25UQ1BTb2NrZXRDbG9zZV0oY2xpZW50LnNvY2tldCk7XG4gICAgfSk7XG5cbiAgICB2YXIgdGNwU2VydmVyU29ja2V0ID0gdGhpc1twcml2YXRlcy50Y3BTZXJ2ZXJTb2NrZXRdO1xuICAgIGlmICh0Y3BTZXJ2ZXJTb2NrZXQpIHtcbiAgICAgIHRjcFNlcnZlclNvY2tldC5jbG9zZSgpO1xuICAgICAgdGhpc1twcml2YXRlcy5vblRDUFNlcnZlclNvY2tldENsb3NlXSgpO1xuICAgIH1cbiAgfVxuXG4gIFtwcml2YXRlcy5vblRDUFNlcnZlclNvY2tldENvbm5lY3RdKHRjcFNvY2tldCkge1xuICAgIHRjcFNvY2tldC5vbmRhdGEgPSB0aGlzW3ByaXZhdGVzLm9uVENQU29ja2V0RGF0YV0uYmluZCh0aGlzKTtcbiAgICB0Y3BTb2NrZXQub25jbG9zZSA9IHRjcFNvY2tldC5vbmVycm9yID1cbiAgICAgIHRoaXNbcHJpdmF0ZXMub25UQ1BTb2NrZXRDbG9zZV0uYmluZCh0aGlzLCB0Y3BTb2NrZXQpO1xuICB9XG5cbiAgLyoqXG4gICAqIE1velRjcFNvY2tldCBkYXRhIGhhbmRsZXIuXG4gICAqIEBwYXJhbSB7VENQU29ja2V0RXZlbnR9IHNvY2tldEV2ZW50IFRDUFNvY2tldCBkYXRhIGV2ZW50LlxuICAgKi9cbiAgW3ByaXZhdGVzLm9uVENQU29ja2V0RGF0YV0oc29ja2V0RXZlbnQpIHtcbiAgICB2YXIgc29ja2V0ID0gc29ja2V0RXZlbnQudGFyZ2V0O1xuICAgIHZhciBjbGllbnRJZCA9IHNvY2tldC5ob3N0ICsgJzonICsgc29ja2V0LnBvcnQ7XG4gICAgdmFyIGNsaWVudCA9IHRoaXNbcHJpdmF0ZXMuY2xpZW50c10uZ2V0KGNsaWVudElkKTtcblxuICAgIHZhciBmcmFtZURhdGEgPSBuZXcgVWludDhBcnJheShzb2NrZXRFdmVudC5kYXRhKTtcblxuICAgIC8vIElmIHdlIGRvbid0IGhhdmUgY29ubmVjdGlvbiBpbmZvIGZyb20gdGhpcyBob3N0IGxldCdzIHBlcmZvcm0gaGFuZHNoYWtlLlxuICAgIGlmICghY2xpZW50KSB7XG4gICAgICBwZXJmb3JtSGFuZHNoYWtlKGZyYW1lRGF0YSkudGhlbigoaGFuZHNoYWtlKSA9PiB7XG4gICAgICAgIGlmICghaGFuZHNoYWtlKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgJ0hhbmRzaGFrZSB3aXRoIGhvc3QgJXM6JXMgZmFpbGVkJywgc29ja2V0Lmhvc3QsIHNvY2tldC5wb3J0XG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHNvY2tldC5zZW5kKFxuICAgICAgICAgIGhhbmRzaGFrZS5yZXNwb25zZS5idWZmZXIsIDAsIGhhbmRzaGFrZS5yZXNwb25zZS5ieXRlTGVuZ3RoXG4gICAgICAgICk7XG5cbiAgICAgICAgdmFyIGNsaWVudCA9IHtcbiAgICAgICAgICBzb2NrZXQ6IHNvY2tldCxcbiAgICAgICAgICBoZWFkZXJzOiBoYW5kc2hha2UuaGVhZGVycyxcbiAgICAgICAgICBidWZmZXI6IG5ldyBXZWJTb2NrZXRGcmFtZUJ1ZmZlcigpXG4gICAgICAgIH07XG5cbiAgICAgICAgY2xpZW50LmJ1ZmZlci5vbihcbiAgICAgICAgICAnZnJhbWUnLCB0aGlzW3ByaXZhdGVzLm9uTWVzc2FnZUZyYW1lXS5iaW5kKHRoaXMsIGNsaWVudClcbiAgICAgICAgKTtcblxuICAgICAgICB0aGlzW3ByaXZhdGVzLmNsaWVudHNdLnNldChjbGllbnRJZCwgY2xpZW50KTtcbiAgICAgIH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgdGhpc1twcml2YXRlcy5vblRDUFNvY2tldENsb3NlXShzb2NrZXQpO1xuICAgICAgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY2xpZW50LmJ1ZmZlci5wdXQoZnJhbWVEYXRhKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBQcm9jZXNzIFdlYlNvY2tldCBpbmNvbWluZyBmcmFtZS5cbiAgICogQHBhcmFtIHt7c29ja2V0OiBUQ1BTb2NrZXQsIGJ1ZmZlcjogV2ViU29ja2V0RnJhbWVCdWZmZXJ9fSBjbGllbnQgQ2xpZW50XG4gICAqIGRlc2NyaXB0b3Igb2JqZWN0LlxuICAgKi9cbiAgW3ByaXZhdGVzLm9uTWVzc2FnZUZyYW1lXShjbGllbnQpIHtcbiAgICBjbGllbnQuYnVmZmVyLmdldCgyKS50aGVuKChjb250cm9sRGF0YSkgPT4ge1xuICAgICAgdmFyIHN0YXRlID0ge1xuICAgICAgICBpc0NvbXBsZXRlZDogKGNvbnRyb2xEYXRhWzBdICYgMHg4MCkgPT09IDB4ODAsXG4gICAgICAgIGlzTWFza2VkOiAoY29udHJvbERhdGFbMV0gJiAweDgwKSA9PT0gMHg4MCxcbiAgICAgICAgaXNDb21wcmVzc2VkOiAoY29udHJvbERhdGFbMF0gJiAweDQwKSA9PT0gMHg0MCxcbiAgICAgICAgb3BDb2RlOiBjb250cm9sRGF0YVswXSAmIDB4ZixcbiAgICAgICAgZGF0YUxlbmd0aDogY29udHJvbERhdGFbMV0gJiAweDdmLFxuICAgICAgICBtYXNrOiBudWxsLFxuICAgICAgICBkYXRhOiBbXVxuICAgICAgfTtcblxuICAgICAgaWYgKHN0YXRlLm9wQ29kZSA9PT0gT3BlcmF0aW9uQ29kZS5DT05USU5VQVRJT05fRlJBTUUpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDb250aW51YXRpb24gZnJhbWUgaXMgbm90IHlldCBzdXBwb3J0ZWQhJyk7XG4gICAgICB9XG5cbiAgICAgIGlmIChzdGF0ZS5vcENvZGUgPT09IE9wZXJhdGlvbkNvZGUuUE9ORykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BvbmcgZnJhbWUgaXMgbm90IHlldCBzdXBwb3J0ZWQhJyk7XG4gICAgICB9XG5cbiAgICAgIGlmIChzdGF0ZS5vcENvZGUgPj0gMyAmJiBzdGF0ZS5vcENvZGUgPD0gNykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgJ1Jlc2VydmVkIGZvciBmdXR1cmUgbm9uLWNvbnRyb2wgZnJhbWVzIGFyZSBub3Qgc3VwcG9ydGVkISdcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHN0YXRlLm9wQ29kZSA+IDEwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAnUmVzZXJ2ZWQgZm9yIGZ1dHVyZSBjb250cm9sIGZyYW1lcyBhcmUgbm90IHN1cHBvcnRlZCEnXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBzdGF0ZTtcbiAgICB9KS50aGVuKChzdGF0ZSkgPT4ge1xuICAgICAgdmFyIGRhdGFMZW5ndGhQcm9taXNlO1xuICAgICAgaWYgKHN0YXRlLmRhdGFMZW5ndGggPT09IDEyNikge1xuICAgICAgICBkYXRhTGVuZ3RoUHJvbWlzZSA9IGNsaWVudC5idWZmZXIuZ2V0KDIpLnRoZW4oXG4gICAgICAgICAgKGRhdGEpID0+IFdlYlNvY2tldFV0aWxzLnJlYWRVSW50MTYoZGF0YSlcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoc3RhdGUuZGF0YUxlbmd0aCA9PSAxMjcpIHtcbiAgICAgICAgZGF0YUxlbmd0aFByb21pc2UgPSBjbGllbnQuYnVmZmVyLmdldCg0KS50aGVuKFxuICAgICAgICAgIChkYXRhKSA9PiBXZWJTb2NrZXRVdGlscy5yZWFkVUludDMyKGRhdGEpXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkYXRhTGVuZ3RoUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShzdGF0ZS5kYXRhTGVuZ3RoKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGRhdGFMZW5ndGhQcm9taXNlLnRoZW4oKGRhdGFMZW5ndGgpID0+IHtcbiAgICAgICAgc3RhdGUuZGF0YUxlbmd0aCA9IGRhdGFMZW5ndGg7XG4gICAgICAgIHJldHVybiBzdGF0ZTtcbiAgICAgIH0pO1xuICAgIH0pLnRoZW4oKHN0YXRlKSA9PiB7XG4gICAgICBpZiAoc3RhdGUuaXNNYXNrZWQpIHtcbiAgICAgICAgcmV0dXJuIGNsaWVudC5idWZmZXIuZ2V0KDQpLnRoZW4oKG1hc2spID0+IHtcbiAgICAgICAgICBzdGF0ZS5tYXNrID0gbWFzaztcbiAgICAgICAgICByZXR1cm4gc3RhdGU7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN0YXRlO1xuICAgIH0pLnRoZW4oKHN0YXRlKSA9PiB7XG4gICAgICBpZiAoc3RhdGUuZGF0YUxlbmd0aCkge1xuICAgICAgICByZXR1cm4gY2xpZW50LmJ1ZmZlci5nZXQoc3RhdGUuZGF0YUxlbmd0aCkudGhlbigoZGF0YSkgPT4ge1xuICAgICAgICAgIHN0YXRlLmRhdGEgPSBXZWJTb2NrZXRVdGlscy5tYXNrKHN0YXRlLm1hc2ssIGRhdGEpO1xuICAgICAgICAgIHJldHVybiBzdGF0ZTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc3RhdGU7XG4gICAgfSkudGhlbigoc3RhdGUpID0+IHtcbiAgICAgIHZhciBkYXRhRnJhbWU7XG4gICAgICBpZiAoc3RhdGUub3BDb2RlID09PSBPcGVyYXRpb25Db2RlLkNPTk5FQ1RJT05fQ0xPU0UpIHtcbiAgICAgICAgdmFyIGNvZGUgPSAwO1xuICAgICAgICB2YXIgcmVhc29uID0gJ1Vua25vd24nO1xuXG4gICAgICAgIGlmIChzdGF0ZS5kYXRhTGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNvZGUgPSAgV2ViU29ja2V0VXRpbHMucmVhZFVJbnQxNihzdGF0ZS5kYXRhKTtcbiAgICAgICAgICBpZiAoc3RhdGUuZGF0YUxlbmd0aCA+IDIpIHtcbiAgICAgICAgICAgIHJlYXNvbiA9IFdlYlNvY2tldFV0aWxzLmFycmF5VG9TdHJpbmcoc3RhdGUuZGF0YS5zdWJhcnJheSgyKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc29sZS5sb2coJ1NvY2tldCBpcyBjbG9zZWQ6ICVzIChjb2RlIGlzICVzKScsIHJlYXNvbiwgY29kZSk7XG5cbiAgICAgICAgZGF0YUZyYW1lID0gY3JlYXRlTWVzc2FnZUZyYW1lKFxuICAgICAgICAgIE9wZXJhdGlvbkNvZGUuQ09OTkVDVElPTl9DTE9TRSwgc3RhdGUuZGF0YSwgdHJ1ZSAvKiBpc0NvbXBsZXRlZCAqL1xuICAgICAgICApO1xuICAgICAgICBjbGllbnQuc29ja2V0LnNlbmQoZGF0YUZyYW1lLmJ1ZmZlciwgMCwgZGF0YUZyYW1lLmxlbmd0aCk7XG4gICAgICAgIHRoaXNbcHJpdmF0ZXMub25UQ1BTb2NrZXRDbG9zZV0oY2xpZW50LnNvY2tldCk7XG4gICAgICB9IGVsc2UgaWYgKHN0YXRlLm9wQ29kZSA9PT0gT3BlcmF0aW9uQ29kZS5URVhUX0ZSQU1FIHx8XG4gICAgICAgICAgICAgICAgIHN0YXRlLm9wQ29kZSA9PT0gT3BlcmF0aW9uQ29kZS5CSU5BUllfRlJBTUUpIHtcbiAgICAgICAgdGhpcy5lbWl0KCdtZXNzYWdlJywgc3RhdGUuZGF0YSk7XG4gICAgICB9IGVsc2UgaWYgKHN0YXRlLm9wQ29kZSA9PT0gT3BlcmF0aW9uQ29kZS5QSU5HKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICdQSU5HIGZyYW1lIGlzIHJlY2VpdmVkIChtYXNrZWQ6ICVzLCBoYXNEYXRhOiAlcyknLFxuICAgICAgICAgIHN0YXRlLmlzTWFza2VkLFxuICAgICAgICAgICEhc3RhdGUuZGF0YVxuICAgICAgICApO1xuXG4gICAgICAgIGlmICghc3RhdGUuaXNDb21wbGV0ZWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZyYWdtZW50ZWQgUGluZyBmcmFtZSBpcyBub3Qgc3VwcG9ydGVkIScpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLmRhdGFMZW5ndGggPiAxMjUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAnUGluZyBmcmFtZSBjYW4gbm90IGhhdmUgbW9yZSB0aGFuIDEyNSBieXRlcyBvZiBkYXRhISdcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgZGF0YUZyYW1lID0gY3JlYXRlTWVzc2FnZUZyYW1lKFxuICAgICAgICAgIE9wZXJhdGlvbkNvZGUuUE9ORywgc3RhdGUuZGF0YSwgdHJ1ZSAvKiBpc0NvbXBsZXRlZCAqLywgc3RhdGUuaXNNYXNrZWRcbiAgICAgICAgKTtcbiAgICAgICAgY2xpZW50LnNvY2tldC5zZW5kKGRhdGFGcmFtZS5idWZmZXIsIDAsIGRhdGFGcmFtZS5sZW5ndGgpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIWNsaWVudC5idWZmZXIuaXNFbXB0eSgpKSB7XG4gICAgICAgIHRoaXNbcHJpdmF0ZXMub25NZXNzYWdlRnJhbWVdKGNsaWVudCk7XG4gICAgICB9XG4gICAgfSkuY2F0Y2goKGUpID0+IHtcbiAgICAgIHZhciBjb2RlID0gMTAwMjtcbiAgICAgIHZhciByZWFzb24gPSBlLm1lc3NhZ2UgfHwgZS5uYW1lIHx8ICdVbmtub3duIGZhaWx1cmUgb24gc2VydmVyJztcblxuICAgICAgY29uc29sZS5sb2coJ1NvY2tldCBpcyBjbG9zZWQ6ICVzIChjb2RlIGlzICVzKScsIHJlYXNvbiwgY29kZSk7XG5cbiAgICAgIC8vIDIgYnl0ZXMgZm9yIHRoZSBjb2RlIGFuZCB0aGUgcmVzdCBmb3IgdGhlIHJlYXNvbi5cbiAgICAgIHZhciBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoMiArIHJlYXNvbi5sZW5ndGgpO1xuICAgICAgV2ViU29ja2V0VXRpbHMud3JpdGVVSW50MTYoZGF0YSwgY29kZSwgMCk7XG4gICAgICBkYXRhLnNldChXZWJTb2NrZXRVdGlscy5zdHJpbmdUb0FycmF5KHJlYXNvbiksIDIpO1xuXG4gICAgICB2YXIgZGF0YUZyYW1lID0gY3JlYXRlTWVzc2FnZUZyYW1lKFxuICAgICAgICBPcGVyYXRpb25Db2RlLkNPTk5FQ1RJT05fQ0xPU0UsIGRhdGEsIHRydWUgLyogaXNDb21wbGV0ZWQgKi9cbiAgICAgICk7XG4gICAgICBjbGllbnQuc29ja2V0LnNlbmQoZGF0YUZyYW1lLmJ1ZmZlciwgMCwgZGF0YUZyYW1lLmxlbmd0aCk7XG4gICAgICB0aGlzW3ByaXZhdGVzLm9uVENQU29ja2V0Q2xvc2VdKGNsaWVudC5zb2NrZXQpO1xuICAgIH0pO1xuICB9XG5cbiAgW3ByaXZhdGVzLm9uVENQU29ja2V0Q2xvc2VdKHNvY2tldCkge1xuICAgIGlmICghc29ja2V0KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIHNvY2tldC5jbG9zZSgpO1xuICAgICAgc29ja2V0Lm9uZGF0YSA9IHNvY2tldC5vbmVycm9yID0gc29ja2V0Lm9uY2xvc2UgPSBudWxsO1xuICAgIH0gY2F0Y2goZSkge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICdFcnJvciBvY2N1cnJlZCB3aGlsZSBjbG9zaW5nIHNvY2tldCAlcycsIGUubWVzc2FnZSB8fCBlLm5hbWVcbiAgICAgICk7XG4gICAgfVxuXG4gICAgdGhpc1twcml2YXRlcy5jbGllbnRzXS5kZWxldGUoc29ja2V0Lmhvc3QgKyAnOicgKyBzb2NrZXQucG9ydCk7XG4gIH1cblxuICBbcHJpdmF0ZXMub25UQ1BTZXJ2ZXJTb2NrZXRDbG9zZV0oKSB7XG4gICAgdmFyIHRjcFNlcnZlclNvY2tldCA9IHRoaXNbcHJpdmF0ZXMudGNwU2VydmVyU29ja2V0XTtcblxuICAgIGlmICghdGNwU2VydmVyU29ja2V0KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGNwU2VydmVyU29ja2V0Lm9uY29ubmVjdCA9IHRjcFNlcnZlclNvY2tldC5vbmVycm9yID0gbnVsbDtcblxuICAgIHRoaXNbcHJpdmF0ZXMudGNwU2VydmVyU29ja2V0XSA9IG51bGw7XG5cbiAgICB0aGlzLmVtaXQoJ3N0b3AnKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCB7XG4gIFNlcnZlcjogV2ViU29ja2V0U2VydmVyLFxuICBVdGlsczogV2ViU29ja2V0VXRpbHMsXG4gIEZyYW1lQnVmZmVyOiBXZWJTb2NrZXRGcmFtZUJ1ZmZlclxufTtcbiIsbnVsbCwiaW1wb3J0IEV2ZW50RGlzcGF0Y2hlciBmcm9tICdFdmVudERpc3BhdGNoZXInO1xuXG52YXIgcHJpdmF0ZXMgPSB7XG4gIGRhdGE6IFN5bWJvbCgnZGF0YScpLFxuICBwZW5kaW5nRGF0YVJlcXVlc3Q6IFN5bWJvbCgncGVuZGluZ0RhdGFSZXF1ZXN0JyksXG4gIHNwbGljZTogU3ltYm9sKCdzcGxpY2UnKVxufTtcblxuY2xhc3MgV2ViU29ja2V0RnJhbWVCdWZmZXIge1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBFdmVudERpc3BhdGNoZXIubWl4aW4odGhpcywgWydmcmFtZScsICdkYXRhJ10pO1xuXG4gICAgdGhpc1twcml2YXRlcy5kYXRhXSA9IG5ldyBVaW50OEFycmF5KDApO1xuICAgIHRoaXNbcHJpdmF0ZXMucGVuZGluZ0RhdGFSZXF1ZXN0XSA9IG51bGw7XG4gICAgdGhpc1twcml2YXRlcy5zcGxpY2VdID0gZnVuY3Rpb24obGVuZ3RoKSB7XG4gICAgICB2YXIgZGF0YSA9IHRoaXNbcHJpdmF0ZXMuZGF0YV07XG5cbiAgICAgIHZhciBzcGxpY2VkRGF0YSA9IGRhdGEuc3ViYXJyYXkoMCwgbGVuZ3RoKTtcbiAgICAgIHRoaXNbcHJpdmF0ZXMuZGF0YV0gPSBkYXRhLnN1YmFycmF5KGxlbmd0aCwgZGF0YS5sZW5ndGgpO1xuXG4gICAgICByZXR1cm4gc3BsaWNlZERhdGE7XG4gICAgfTtcbiAgfVxuXG4gIHB1dChkYXRhVG9QdXQpIHtcbiAgICB2YXIgZGF0YSA9IHRoaXNbcHJpdmF0ZXMuZGF0YV07XG5cbiAgICB2YXIgbmV3RGF0YSA9IG5ldyBVaW50OEFycmF5KGRhdGEubGVuZ3RoICsgZGF0YVRvUHV0Lmxlbmd0aCk7XG4gICAgbmV3RGF0YS5zZXQoZGF0YSk7XG4gICAgbmV3RGF0YS5zZXQoZGF0YVRvUHV0LCBkYXRhLmxlbmd0aCk7XG4gICAgdGhpc1twcml2YXRlcy5kYXRhXSA9IG5ld0RhdGE7XG5cbiAgICB0aGlzLmVtaXQoJ2RhdGEnKTtcblxuICAgIC8vIElmIG5vIG9uZSB3YWl0aW5nIGZvciBkYXRhLCBsZXQncyBzaWduYWwgdGhhdCB3ZSBoYXZlIG5ldyBmcmFtZSFcbiAgICBpZiAoIXRoaXNbcHJpdmF0ZXMucGVuZGluZ0RhdGFSZXF1ZXN0XSkge1xuICAgICAgdGhpcy5lbWl0KCdmcmFtZScpO1xuICAgIH1cbiAgfVxuXG4gIGdldChkYXRhTGVuZ3RoKSB7XG4gICAgaWYgKHRoaXNbcHJpdmF0ZXMucGVuZGluZ0RhdGFSZXF1ZXN0XSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDb25jdXJyZW50IHJlYWQgaXMgbm90IGFsbG93ZWQuJyk7XG4gICAgfVxuXG4gICAgdGhpc1twcml2YXRlcy5wZW5kaW5nRGF0YVJlcXVlc3RdID0gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgIHZhciBkYXRhID0gdGhpc1twcml2YXRlcy5kYXRhXTtcbiAgICAgIGlmIChkYXRhLmxlbmd0aCA+PSBkYXRhTGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKHRoaXNbcHJpdmF0ZXMuc3BsaWNlXShkYXRhTGVuZ3RoKSk7XG4gICAgICB9XG5cbiAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgIHRoaXMub24oJ2RhdGEnLCBmdW5jdGlvbiBvbkRhdGEoKSB7XG4gICAgICAgIGlmIChkYXRhLmxlbmd0aCA8IGRhdGFMZW5ndGgpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBzZWxmLm9mZignZGF0YScsIG9uRGF0YSk7XG4gICAgICAgIHJlc29sdmUodGhpc1twcml2YXRlcy5zcGxpY2VdKGRhdGFMZW5ndGgpKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHRoaXNbcHJpdmF0ZXMucGVuZGluZ0RhdGFSZXF1ZXN0XS50aGVuKChkYXRhKSA9PiB7XG4gICAgICB0aGlzW3ByaXZhdGVzLnBlbmRpbmdEYXRhUmVxdWVzdF0gPSBudWxsO1xuICAgICAgcmV0dXJuIGRhdGE7XG4gICAgfSk7XG4gIH1cblxuICBpc0VtcHR5KCkge1xuICAgIHJldHVybiB0aGlzW3ByaXZhdGVzLmRhdGFdLmxlbmd0aCA9PT0gMDtcbiAgfTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgV2ViU29ja2V0RnJhbWVCdWZmZXI7XG4iLCJ2YXIgV2ViU29ja2V0VXRpbHMgPSB7XG4gIC8qKlxuICAgKiBNYXNrIGV2ZXJ5IGRhdGEgZWxlbWVudCB3aXRoIHRoZSBtYXNrIChXZWJTb2NrZXQgc3BlY2lmaWMgYWxnb3JpdGhtKS5cbiAgICogQHBhcmFtIHtVaW50OEFycmF5fSBtYXNrIE1hc2sgYXJyYXkuXG4gICAqIEBwYXJhbSB7VWludDhBcnJheX0gYXJyYXkgRGF0YSBhcnJheSB0byBtYXNrLlxuICAgKiBAcmV0dXJucyB7VWludDhBcnJheX0gTWFza2VkIGRhdGEgYXJyYXkuXG4gICAqL1xuICBtYXNrKG1hc2ssIGFycmF5KSB7XG4gICAgaWYgKG1hc2spIHtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYXJyYXlbaV0gPSBhcnJheVtpXSBeIG1hc2tbaSAlIDRdO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gYXJyYXk7XG4gIH0sXG5cbiAgLyoqXG4gICAqIEdlbmVyYXRlcyA0LWl0ZW0gYXJyYXksIGV2ZXJ5IGl0ZW0gb2Ygd2hpY2ggaXMgZWxlbWVudCBvZiBieXRlIG1hc2suXG4gICAqIEByZXR1cm5zIHtVaW50OEFycmF5fVxuICAgKi9cbiAgZ2VuZXJhdGVSYW5kb21NYXNrKCkge1xuICAgIHZhciByYW5kb20gPSBuZXcgVWludDhBcnJheSg0KTtcblxuICAgIHdpbmRvdy5jcnlwdG8uZ2V0UmFuZG9tVmFsdWVzKHJhbmRvbSk7XG5cbiAgICByZXR1cm4gcmFuZG9tO1xuICB9LFxuXG4gIC8qKlxuICAgKiBDb252ZXJ0cyBzdHJpbmcgdG8gVWludDhBcnJheS5cbiAgICogQHBhcmFtIHtzdHJpbmd9IHN0cmluZ1ZhbHVlIFN0cmluZyB2YWx1ZSB0byBjb252ZXJ0LlxuICAgKiBAcmV0dXJucyB7VWludDhBcnJheX1cbiAgICovXG4gIHN0cmluZ1RvQXJyYXkoc3RyaW5nVmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHN0cmluZ1ZhbHVlICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzdHJpbmdWYWx1ZSBzaG91bGQgYmUgdmFsaWQgc3RyaW5nIScpO1xuICAgIH1cblxuICAgIHZhciBhcnJheSA9IG5ldyBVaW50OEFycmF5KHN0cmluZ1ZhbHVlLmxlbmd0aCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHJpbmdWYWx1ZS5sZW5ndGg7IGkrKykge1xuICAgICAgYXJyYXlbaV0gPSBzdHJpbmdWYWx1ZS5jaGFyQ29kZUF0KGkpO1xuICAgIH1cblxuICAgIHJldHVybiBhcnJheTtcbiAgfSxcblxuICAvKipcbiAgICogQ29udmVydHMgYXJyYXkgdG8gc3RyaW5nLiBFdmVyeSBhcnJheSBlbGVtZW50IGlzIGNvbnNpZGVyZWQgYXMgY2hhciBjb2RlLlxuICAgKiBAcGFyYW0ge1VpbnQ4QXJyYXl9IGFycmF5IEFycmF5IHdpdGggdGhlIGNoYXIgY29kZXMuXG4gICAqIEByZXR1cm5zIHtzdHJpbmd9XG4gICAqL1xuICBhcnJheVRvU3RyaW5nKGFycmF5KSB7XG4gICAgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgYXJyYXkpO1xuICB9LFxuXG4gIC8qKlxuICAgKiBSZWFkcyB1bnNpZ25lZCAxNiBiaXQgdmFsdWUgZnJvbSB0d28gY29uc2VxdWVudCA4LWJpdCBhcnJheSBlbGVtZW50cy5cbiAgICogQHBhcmFtIHtVaW50OEFycmF5fSBhcnJheSBBcnJheSB0byByZWFkIGZyb20uXG4gICAqIEBwYXJhbSB7TnVtYmVyP30gb2Zmc2V0IEluZGV4IHRvIHN0YXJ0IHJlYWQgdmFsdWUuXG4gICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAqL1xuICByZWFkVUludDE2KGFycmF5LCBvZmZzZXQpIHtcbiAgICBvZmZzZXQgPSBvZmZzZXQgfHwgMDtcbiAgICByZXR1cm4gKGFycmF5W29mZnNldF0gPDwgOCkgKyBhcnJheVtvZmZzZXQgKyAxXTtcbiAgfSxcblxuICAvKipcbiAgICogUmVhZHMgdW5zaWduZWQgMzIgYml0IHZhbHVlIGZyb20gZm91ciBjb25zZXF1ZW50IDgtYml0IGFycmF5IGVsZW1lbnRzLlxuICAgKiBAcGFyYW0ge1VpbnQ4QXJyYXl9IGFycmF5IEFycmF5IHRvIHJlYWQgZnJvbS5cbiAgICogQHBhcmFtIHtOdW1iZXI/fSBvZmZzZXQgSW5kZXggdG8gc3RhcnQgcmVhZCB2YWx1ZS5cbiAgICogQHJldHVybnMge051bWJlcn1cbiAgICovXG4gIHJlYWRVSW50MzIoYXJyYXksIG9mZnNldCkge1xuICAgIG9mZnNldCA9IG9mZnNldCB8fCAwO1xuICAgIHJldHVybiAoYXJyYXlbb2Zmc2V0XSA8PCAyNCkgK1xuICAgICAgKGFycmF5W29mZnNldCArIDFdIDw8IDE2KSArXG4gICAgICAoYXJyYXkgW29mZnNldCArIDJdIDw8IDgpICtcbiAgICAgIGFycmF5W29mZnNldCArIDNdO1xuICB9LFxuXG4gIC8qKlxuICAgKiBXcml0ZXMgdW5zaWduZWQgMTYgYml0IHZhbHVlIHRvIHR3byBjb25zZXF1ZW50IDgtYml0IGFycmF5IGVsZW1lbnRzLlxuICAgKiBAcGFyYW0ge1VpbnQ4QXJyYXl9IGFycmF5IEFycmF5IHRvIHdyaXRlIHRvLlxuICAgKiBAcGFyYW0ge051bWJlcn0gdmFsdWUgMTYgYml0IHVuc2lnbmVkIHZhbHVlIHRvIHdyaXRlIGludG8gYXJyYXkuXG4gICAqIEBwYXJhbSB7TnVtYmVyP30gb2Zmc2V0IEluZGV4IHRvIHN0YXJ0IHdyaXRlIHZhbHVlLlxuICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgKi9cbiAgd3JpdGVVSW50MTYoYXJyYXksIHZhbHVlLCBvZmZzZXQpIHtcbiAgICBvZmZzZXQgPSBvZmZzZXQgfHwgMDtcbiAgICBhcnJheVtvZmZzZXRdID0gKHZhbHVlICYgMHhmZjAwKSA+PiA4O1xuICAgIGFycmF5W29mZnNldCArIDFdID0gdmFsdWUgJiAweGZmO1xuICB9LFxuXG4gIC8qKlxuICAgKiBXcml0ZXMgdW5zaWduZWQgMTYgYml0IHZhbHVlIHRvIHR3byBjb25zZXF1ZW50IDgtYml0IGFycmF5IGVsZW1lbnRzLlxuICAgKiBAcGFyYW0ge1VpbnQ4QXJyYXl9IGFycmF5IEFycmF5IHRvIHdyaXRlIHRvLlxuICAgKiBAcGFyYW0ge051bWJlcn0gdmFsdWUgMTYgYml0IHVuc2lnbmVkIHZhbHVlIHRvIHdyaXRlIGludG8gYXJyYXkuXG4gICAqIEBwYXJhbSB7TnVtYmVyP30gb2Zmc2V0IEluZGV4IHRvIHN0YXJ0IHdyaXRlIHZhbHVlLlxuICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgKi9cbiAgd3JpdGVVSW50MzIoYXJyYXksIHZhbHVlLCBvZmZzZXQpIHtcbiAgICBvZmZzZXQgPSBvZmZzZXQgfHwgMDtcbiAgICBhcnJheVtvZmZzZXRdID0gKHZhbHVlICYgMHhmZjAwMDAwMCkgPj4gMjQ7XG4gICAgYXJyYXlbb2Zmc2V0ICsgMV0gPSAodmFsdWUgJiAweGZmMDAwMCkgPj4gMTY7XG4gICAgYXJyYXlbb2Zmc2V0ICsgMl0gPSAodmFsdWUgJiAweGZmMDApID4+IDg7XG4gICAgYXJyYXlbb2Zmc2V0ICsgM10gPSB2YWx1ZSAmIDB4ZmY7XG4gIH1cbn07XG5cbmV4cG9ydCBkZWZhdWx0IFdlYlNvY2tldFV0aWxzO1xuIl19
