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
 * @param {TCPSocket} tcpSocket Connection socket.
 * @param {Uint8Array} httpRequestData HTTP Handshake data array.
 * @returns {Map.<string, string>} Parsed http headers
 */
function performHandshake(tcpSocket, httpRequestData) {
  var httpHeaders = getHttpHeaders(_utilsEs62['default'].arrayToString(httpRequestData).split(CRLF + CRLF)[0]);

  var key = _utilsEs62['default'].stringToArray(httpHeaders.get('Sec-WebSocket-Key') + WEBSOCKET_KEY_GUID);

  var subtle = window.crypto.subtle;
  return subtle.digest({ name: 'SHA-1' }, key).then(function (hashArrayBuffer) {
    var webSocketKey = btoa(_utilsEs62['default'].arrayToString(new Uint8Array(hashArrayBuffer)));
    var arrayResponse = _utilsEs62['default'].stringToArray(WEBSOCKET_HANDSHAKE_RESPONSE.replace('{web-socket-key}', webSocketKey));

    tcpSocket.send(arrayResponse.buffer, 0, arrayResponse.byteLength);

    return httpHeaders;
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

  tcpSocket: Symbol('tcpSocket'),
  onTCPSocketData: Symbol('onTCPSocketData'),
  onTCPSocketClose: Symbol('onTCPSocketClose'),

  clients: Symbol('clients'),
  frameBuffer: Symbol('frameBuffer'),

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

    var tcpServerSocket = navigator.mozTCPSocket.listen(port, {
      binaryType: 'arraybuffer'
    });

    this[privates.tcpServerSocket] = tcpServerSocket;
    this[privates.clients] = new Map();
    this[privates.frameBuffer] = new _frameBufferEs62['default']();

    this[privates.onMessageFrame] = this[privates.onMessageFrame].bind(this);

    tcpServerSocket.onconnect = this[privates.onTCPServerSocketConnect].bind(this);
    tcpServerSocket.onerror = this[privates.onTCPServerSocketClose].bind(this);
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

      this[privates.tcpSocket].send(dataFrame.buffer, 0, dataFrame.length);
    }
  }, {
    key: 'stop',

    /**
     * Destroys socket connection.
     */
    value: function stop() {
      var tcpSocket = this[privates.tcpSocket];
      if (tcpSocket) {
        tcpSocket.close();
        this[privates.onTCPSocketClose]();
      }

      var tcpServerSocket = this[privates.tcpServerSocket];
      if (tcpServerSocket) {
        tcpServerSocket.close();
        this[privates.onTCPServerSocketClose]();
      }

      this[privates.clients].clear();
    }
  }, {
    key: privates.onTCPServerSocketConnect,
    value: function (tcpSocket) {
      this[privates.tcpSocket] = tcpSocket;

      this[privates.frameBuffer].on('frame', this[privates.onMessageFrame]);

      tcpSocket.ondata = this[privates.onTCPSocketData].bind(this);
      tcpSocket.onclose = tcpSocket.onerror = this[privates.onTCPSocketClose].bind(this);
    }
  }, {
    key: privates.onTCPSocketData,

    /**
     * MozTcpSocket data handler.
     * @param {TCPSocketEvent} socketEvent TCPSocket data event.
     */
    value: function (socketEvent) {
      var clients = this[privates.clients];
      var tcpSocket = this[privates.tcpSocket];

      var frameData = new Uint8Array(socketEvent.data);

      // If we don't have connection info from this host let's perform handshake
      // Currently we support only ONE client from host.
      if (!clients.has(tcpSocket.host)) {
        performHandshake(tcpSocket, frameData).then(function (handshakeResult) {
          if (handshakeResult) {
            clients.set(tcpSocket.host, handshakeResult);
          }
        });
        return;
      }

      this[privates.frameBuffer].put(frameData);
    }
  }, {
    key: privates.onMessageFrame,

    /**
     * Process WebSocket incoming frame.
     * @param {Uint8Array} frame Message frame data in view of Uint8Array.
     */
    value: function (frame) {
      var _this = this;

      var buffer = this[privates.frameBuffer];

      buffer.get(2).then(function (controlData) {
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
          dataLengthPromise = buffer.get(2).then(function (data) {
            return _utilsEs62['default'].readUInt16(data);
          });
        } else if (state.dataLength == 127) {
          dataLengthPromise = buffer.get(4).then(function (data) {
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
          return buffer.get(4).then(function (mask) {
            state.mask = mask;
            return state;
          });
        }
        return state;
      }).then(function (state) {
        return state.dataLength ? buffer.get(state.dataLength).then(function (data) {
          state.data = _utilsEs62['default'].mask(state.mask, data);
          return state;
        }) : state;
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
          _this[privates.tcpSocket].send(dataFrame.buffer, 0, dataFrame.length);
          _this[privates.onTCPSocketClose]();
        } else if (state.opCode === OperationCode.TEXT_FRAME || state.opCode === OperationCode.BINARY_FRAME) {
          _this.emit('message', state.data);
        } else if (state.opCode === OperationCode.PING) {
          console.log('PING frame is received (masked: %s, hasData: %s)', state.isMasked, !!state.data);

          if (!state.isCompleted) {
            throw new Error('Fragmented Ping frame is not supported!');
          }

          if (state.dataLength > 125) {
            throw new Error('Ping frame can not have more than 125 bytes of data!');
          }

          dataFrame = createMessageFrame(OperationCode.PONG, state.data, true, /* isCompleted */state.isMasked);
          _this[privates.tcpSocket].send(dataFrame.buffer, 0, dataFrame.length);
        }

        if (!buffer.isEmpty()) {
          _this[privates.onMessageFrame]();
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
        _this[privates.tcpSocket].send(dataFrame.buffer, 0, dataFrame.length);
        _this[privates.onTCPSocketClose]();
      });
    }
  }, {
    key: privates.onTCPSocketClose,
    value: function () {
      var tcpSocket = this[privates.tcpSocket];

      if (!tcpSocket) {
        return;
      }

      this[privates.clients]['delete'](tcpSocket.host);

      tcpSocket.ondata = tcpSocket.onerror = tcpSocket.onclose = null;

      this[privates.tcpSocket] = null;
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
   * @param {Array} mask Mask array.
   * @param {Array} array Data array to mask.
   * @returns {Array} Masked data array.
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
   * @param {Number} offset Index to start read value.
   * @returns {Number}
   */
  readUInt16: function readUInt16(array, offset) {
    offset = offset || 0;
    return (array[offset] << 8) + array[offset + 1];
  },

  /**
   * Reads unsigned 32 bit value from four consequent 8-bit array elements.
   * @param {Uint8Array} array Array to read from.
   * @param {Number} offset Index to start read value.
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
   * @param {Number} offset Index to start write value.
   * @returns {Number}
   */
  writeUInt16: function writeUInt16(array, value, offset) {
    array[offset] = (value & 65280) >> 8;
    array[offset + 1] = value & 255;
  },

  /**
   * Writes unsigned 16 bit value to two consequent 8-bit array elements.
   * @param {Uint8Array} array Array to write to.
   * @param {Number} value 16 bit unsigned value to write into array.
   * @param {Number} offset Index to start write value.
   * @returns {Number}
   */
  writeUInt32: function writeUInt32(array, value, offset) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvbWVkaWEvYXphc3lwa2luL3Byb2plY3RzL2dpdGh1Yi9meG9zLXdlYnNvY2tldC1zZXJ2ZXIvc3JjL3NlcnZlci5lczYuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9saWIvX2VtcHR5LmpzIiwiL21lZGlhL2F6YXN5cGtpbi9wcm9qZWN0cy9naXRodWIvZnhvcy13ZWJzb2NrZXQtc2VydmVyL3NyYy9mcmFtZS1idWZmZXIuZXM2LmpzIiwiL21lZGlhL2F6YXN5cGtpbi9wcm9qZWN0cy9naXRodWIvZnhvcy13ZWJzb2NrZXQtc2VydmVyL3NyYy91dGlscy5lczYuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7Ozs7Ozs7Ozs7K0JDQTRCLGlCQUFpQjs7Ozs4QkFDWixvQkFBb0I7Ozs7d0JBQzFCLGFBQWE7Ozs7Ozs7O0FBTXhDLElBQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQzs7Ozs7OztBQU9wQixJQUFNLGtCQUFrQixHQUFHLHNDQUFzQyxDQUFDOzs7Ozs7O0FBT2xFLElBQU0sNEJBQTRCLEdBQ2hDLGtDQUFrQyxHQUFHLElBQUksR0FDekMscUJBQXFCLEdBQUcsSUFBSSxHQUM1QixvQkFBb0IsR0FBRyxJQUFJLEdBQzNCLHdDQUF3QyxHQUFHLElBQUksR0FBRyxJQUFJLENBQUM7Ozs7OztBQU16RCxJQUFNLGFBQWEsR0FBRztBQUNwQixvQkFBa0IsRUFBRSxDQUFDO0FBQ3JCLFlBQVUsRUFBRSxDQUFDO0FBQ2IsY0FBWSxFQUFFLENBQUM7QUFDZixrQkFBZ0IsRUFBRSxDQUFDO0FBQ25CLE1BQUksRUFBRSxDQUFDO0FBQ1AsTUFBSSxFQUFFLEVBQUU7Q0FDVCxDQUFDOzs7Ozs7O0FBT0YsU0FBUyxjQUFjLENBQUMsZ0JBQWdCLEVBQUU7QUFDeEMsTUFBSSxXQUFXLEdBQUcsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLENB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QyxJQUFJLEVBQUUsQ0FBQSxJQUN4QixLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQSxBQUFDLElBQ3hCLEtBQUssQ0FBRSxNQUFNLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFBLEFBQUMsR0FDekIsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztHQUNyQjs7Ozs7Ozs7O0FBU0QsYUFBVyxFQUFBLHFCQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFO0FBQ2hDLFNBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssR0FBRyxLQUFNLENBQUEsSUFBSyxDQUFDLENBQUM7QUFDdEMsU0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsR0FBRyxLQUFLLEdBQUcsR0FBSSxDQUFDO0dBQ2xDOzs7Ozs7Ozs7QUFTRCxhQUFXLEVBQUEscUJBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUU7QUFDaEMsU0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxHQUFHLFVBQVUsQ0FBQSxJQUFLLEVBQUUsQ0FBQztBQUMzQyxTQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxHQUFHLFFBQVEsQ0FBQSxJQUFLLEVBQUUsQ0FBQztBQUM3QyxTQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxHQUFHLEtBQU0sQ0FBQSxJQUFLLENBQUMsQ0FBQztBQUMxQyxTQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxHQUFHLEtBQUssR0FBRyxHQUFJLENBQUM7R0FDbEM7Q0FDRixDQUFDOztxQkFFYSxjQUFjIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsImltcG9ydCBFdmVudERpc3BhdGNoZXIgZnJvbSAnRXZlbnREaXNwYXRjaGVyJztcbmltcG9ydCBXZWJTb2NrZXRGcmFtZUJ1ZmZlciBmcm9tICcuL2ZyYW1lLWJ1ZmZlci5lczYnO1xuaW1wb3J0IFdlYlNvY2tldFV0aWxzIGZyb20gJy4vdXRpbHMuZXM2JztcblxuLyoqXG4gKiBTZXF1ZW5jZSB1c2VkIHRvIHNlcGFyYXRlIEhUVFAgcmVxdWVzdCBoZWFkZXJzIGFuZCBib2R5LlxuICogQGNvbnN0IHtzdHJpbmd9XG4gKi9cbmNvbnN0IENSTEYgPSAnXFxyXFxuJztcblxuLyoqXG4gKiBNYWdpYyBHVUlEIGRlZmluZWQgYnkgUkZDIHRvIGNvbmNhdGVuYXRlIHdpdGggd2ViIHNvY2tldCBrZXkgZHVyaW5nXG4gKiB3ZWJzb2NrZXQgaGFuZHNoYWtlLlxuICogQGNvbnN0IHtzdHJpbmd9XG4gKi9cbmNvbnN0IFdFQlNPQ0tFVF9LRVlfR1VJRCA9ICcyNThFQUZBNS1FOTE0LTQ3REEtOTVDQS1DNUFCMERDODVCMTEnO1xuXG4vKipcbiAqIFdlYnNvY2tldCBoYW5kc2hha2UgcmVzcG9uc2UgdGVtcGxhdGUgc3RyaW5nLCB7d2ViLXNvY2tldC1rZXl9IHNob3VsZCBiZVxuICogcmVwbGFjZWQgd2l0aCB0aGUgYXBwcm9wcmlhdGUga2V5LlxuICogQGNvbnN0IHtzdHJpbmd9XG4gKi9cbmNvbnN0IFdFQlNPQ0tFVF9IQU5EU0hBS0VfUkVTUE9OU0UgPVxuICAnSFRUUC8xLjEgMTAxIFN3aXRjaGluZyBQcm90b2NvbHMnICsgQ1JMRiArXG4gICdDb25uZWN0aW9uOiBVcGdyYWRlJyArIENSTEYgK1xuICAnVXBncmFkZTogd2Vic29ja2V0JyArIENSTEYgK1xuICAnU2VjLVdlYlNvY2tldC1BY2NlcHQ6IHt3ZWItc29ja2V0LWtleX0nICsgQ1JMRiArIENSTEY7XG5cbi8qKlxuICogRW51bWVyYXRpb24gb2YgYWxsIHBvc3NpYmxlIG9wZXJhdGlvbiBjb2Rlcy5cbiAqIEBlbnVtIHtudW1iZXJ9XG4gKi9cbmNvbnN0IE9wZXJhdGlvbkNvZGUgPSB7XG4gIENPTlRJTlVBVElPTl9GUkFNRTogMCxcbiAgVEVYVF9GUkFNRTogMSxcbiAgQklOQVJZX0ZSQU1FOiAyLFxuICBDT05ORUNUSU9OX0NMT1NFOiA4LFxuICBQSU5HOiA5LFxuICBQT05HOiAxMFxufTtcblxuLyoqXG4gKiBFeHRyYWN0cyBIVFRQIGhlYWRlciBtYXAgZnJvbSBIVFRQIGhlYWRlciBzdHJpbmcuXG4gKiBAcGFyYW0ge3N0cmluZ30gaHR0cEhlYWRlclN0cmluZyBIVFRQIGhlYWRlciBzdHJpbmcuXG4gKiBAcmV0dXJucyB7TWFwLjxzdHJpbmcsIHN0cmluZz59IEhUVFAgaGVhZGVyIGtleS12YWx1ZSBtYXAuXG4gKi9cbmZ1bmN0aW9uIGdldEh0dHBIZWFkZXJzKGh0dHBIZWFkZXJTdHJpbmcpIHtcbiAgdmFyIGh0dHBIZWFkZXJzID0gaHR0cEhlYWRlclN0cmluZy50cmltKCkuc3BsaXQoQ1JMRik7XG4gIHJldHVybiBuZXcgTWFwKGh0dHBIZWFkZXJzLm1hcCgoaHR0cEhlYWRlcikgPT4ge1xuICAgIHJldHVybiBodHRwSGVhZGVyLnNwbGl0KCc6JykubWFwKChlbnRpdHkpID0+IGVudGl0eS50cmltKCkpO1xuICB9KSk7XG59XG5cbi8qKlxuICogUGVyZm9ybXMgV2ViU29ja2V0IEhUVFAgSGFuZHNoYWtlLlxuICogQHBhcmFtIHtUQ1BTb2NrZXR9IHRjcFNvY2tldCBDb25uZWN0aW9uIHNvY2tldC5cbiAqIEBwYXJhbSB7VWludDhBcnJheX0gaHR0cFJlcXVlc3REYXRhIEhUVFAgSGFuZHNoYWtlIGRhdGEgYXJyYXkuXG4gKiBAcmV0dXJucyB7TWFwLjxzdHJpbmcsIHN0cmluZz59IFBhcnNlZCBodHRwIGhlYWRlcnNcbiAqL1xuZnVuY3Rpb24gcGVyZm9ybUhhbmRzaGFrZSh0Y3BTb2NrZXQsIGh0dHBSZXF1ZXN0RGF0YSkge1xuICB2YXIgaHR0cEhlYWRlcnMgPSBnZXRIdHRwSGVhZGVycyhcbiAgICBXZWJTb2NrZXRVdGlscy5hcnJheVRvU3RyaW5nKGh0dHBSZXF1ZXN0RGF0YSkuc3BsaXQoQ1JMRiArIENSTEYpWzBdXG4gICk7XG5cbiAgdmFyIGtleSA9IFdlYlNvY2tldFV0aWxzLnN0cmluZ1RvQXJyYXkoXG4gICAgaHR0cEhlYWRlcnMuZ2V0KCdTZWMtV2ViU29ja2V0LUtleScpICsgV0VCU09DS0VUX0tFWV9HVUlEXG4gICk7XG5cbiAgdmFyIHN1YnRsZSA9IHdpbmRvdy5jcnlwdG8uc3VidGxlO1xuICByZXR1cm4gc3VidGxlLmRpZ2VzdCh7IG5hbWU6ICdTSEEtMScgfSwga2V5KS50aGVuKChoYXNoQXJyYXlCdWZmZXIpID0+IHtcbiAgICB2YXIgd2ViU29ja2V0S2V5ID0gYnRvYShXZWJTb2NrZXRVdGlscy5hcnJheVRvU3RyaW5nKFxuICAgICAgbmV3IFVpbnQ4QXJyYXkoaGFzaEFycmF5QnVmZmVyKVxuICAgICkpO1xuICAgIHZhciBhcnJheVJlc3BvbnNlID0gV2ViU29ja2V0VXRpbHMuc3RyaW5nVG9BcnJheShcbiAgICAgIFdFQlNPQ0tFVF9IQU5EU0hBS0VfUkVTUE9OU0UucmVwbGFjZSgne3dlYi1zb2NrZXQta2V5fScsIHdlYlNvY2tldEtleSlcbiAgICApO1xuXG4gICAgdGNwU29ja2V0LnNlbmQoYXJyYXlSZXNwb25zZS5idWZmZXIsIDAsIGFycmF5UmVzcG9uc2UuYnl0ZUxlbmd0aCk7XG5cbiAgICByZXR1cm4gaHR0cEhlYWRlcnM7XG4gIH0pO1xufVxuXG4vKipcbiAqIENyZWF0ZXMgb3V0Z29pbmcgd2Vic29ja2V0IG1lc3NhZ2UgZnJhbWUuXG4gKiBAcGFyYW0ge051bWJlcn0gb3BDb2RlIEZyYW1lIG9wZXJhdGlvbiBjb2RlLlxuICogQHBhcmFtIHtVaW50OEFycmF5fSBkYXRhIERhdGEgYXJyYXkuXG4gKiBAcGFyYW0ge0Jvb2xlYW59IGlzQ29tcGxldGUgSW5kaWNhdGVzIGlmIGZyYW1lIGlzIGNvbXBsZXRlZC5cbiAqIEBwYXJhbSB7Qm9vbGVhbj99IGlzTWFza2VkIEluZGljYXRlcyBpZiBmcmFtZSBkYXRhIHNob3VsZCBiZSBtYXNrZWQuXG4gKiBAcmV0dXJucyB7VWludDhBcnJheX0gQ29uc3RydWN0ZWQgZnJhbWUgZGF0YS5cbiAqL1xuZnVuY3Rpb24gY3JlYXRlTWVzc2FnZUZyYW1lKG9wQ29kZSwgZGF0YSwgaXNDb21wbGV0ZSwgaXNNYXNrZWQpIHtcbiAgdmFyIGRhdGFMZW5ndGggPSAoZGF0YSAmJiBkYXRhLmxlbmd0aCkgfHwgMDtcbiAgdmFyIGRhdGFPZmZzZXQgPSBpc01hc2tlZCA/IDYgOiAyO1xuXG4gIHZhciBzZWNvbmRCeXRlID0gMDtcbiAgaWYgKGRhdGFMZW5ndGggPj0gNjU1MzYpIHtcbiAgICBkYXRhT2Zmc2V0ICs9IDg7XG4gICAgc2Vjb25kQnl0ZSA9IDEyNztcbiAgfSBlbHNlIGlmIChkYXRhTGVuZ3RoID4gMTI1KSB7XG4gICAgZGF0YU9mZnNldCArPSAyO1xuICAgIHNlY29uZEJ5dGUgPSAxMjY7XG4gIH0gZWxzZSB7XG4gICAgc2Vjb25kQnl0ZSA9IGRhdGFMZW5ndGg7XG4gIH1cblxuICB2YXIgb3V0cHV0QnVmZmVyID0gbmV3IFVpbnQ4QXJyYXkoZGF0YU9mZnNldCArIGRhdGFMZW5ndGgpO1xuXG4gIC8vIFdyaXRpbmcgT1BDT0RFLCBGSU4gYW5kIExFTkdUSFxuICBvdXRwdXRCdWZmZXJbMF0gPSBpc0NvbXBsZXRlID8gb3BDb2RlIHwgMHg4MCA6IG9wQ29kZTtcbiAgb3V0cHV0QnVmZmVyWzFdID0gaXNNYXNrZWQgPyBzZWNvbmRCeXRlIHwgMHg4MCA6IHNlY29uZEJ5dGU7XG5cbiAgLy8gV3JpdGluZyBEQVRBIExFTkdUSFxuICBzd2l0Y2ggKHNlY29uZEJ5dGUpIHtcbiAgICBjYXNlIDEyNjpcbiAgICAgIFdlYlNvY2tldFV0aWxzLndyaXRlVUludDE2KG91dHB1dEJ1ZmZlciwgZGF0YUxlbmd0aCwgMik7XG4gICAgICBicmVhaztcbiAgICBjYXNlIDEyNzpcbiAgICAgIFdlYlNvY2tldFV0aWxzLndyaXRlVUludDMyKG91dHB1dEJ1ZmZlciwgMCwgMik7XG4gICAgICBXZWJTb2NrZXRVdGlscy53cml0ZVVJbnQzMihvdXRwdXRCdWZmZXIsIGRhdGFMZW5ndGgsIDYpO1xuICAgICAgYnJlYWs7XG4gIH1cblxuICBpZiAoaXNNYXNrZWQgJiYgZGF0YUxlbmd0aCkge1xuICAgIHZhciBtYXNrID0gV2ViU29ja2V0VXRpbHMuZ2VuZXJhdGVSYW5kb21NYXNrKCk7XG5cbiAgICAvLyBXcml0aW5nIE1BU0tcbiAgICBvdXRwdXRCdWZmZXIuc2V0KG1hc2ssIGRhdGFPZmZzZXQgLSA0KTtcblxuICAgIFdlYlNvY2tldFV0aWxzLm1hc2sobWFzaywgZGF0YSk7XG4gIH1cblxuICBmb3IodmFyIGkgPSAwOyBpIDwgZGF0YUxlbmd0aDsgaSsrKSB7XG4gICAgb3V0cHV0QnVmZmVyW2RhdGFPZmZzZXQgKyBpXSA9IGRhdGFbaV07XG4gIH1cblxuICByZXR1cm4gb3V0cHV0QnVmZmVyO1xufVxuXG52YXIgcHJpdmF0ZXMgPSB7XG4gIHRjcFNlcnZlclNvY2tldDogU3ltYm9sKCd0Y3Atc29ja2V0JyksXG4gIG9uVENQU2VydmVyU29ja2V0Q29ubmVjdDogU3ltYm9sKCdvblRDUFNlcnZlclNvY2tldENvbm5lY3QnKSxcbiAgb25UQ1BTZXJ2ZXJTb2NrZXRDbG9zZTogU3ltYm9sKCdvblRDUFNlcnZlclNvY2tldENsb3NlJyksXG5cbiAgdGNwU29ja2V0OiBTeW1ib2woJ3RjcFNvY2tldCcpLFxuICBvblRDUFNvY2tldERhdGE6IFN5bWJvbCgnb25UQ1BTb2NrZXREYXRhJyksXG4gIG9uVENQU29ja2V0Q2xvc2U6IFN5bWJvbCgnb25UQ1BTb2NrZXRDbG9zZScpLFxuXG4gIGNsaWVudHM6IFN5bWJvbCgnY2xpZW50cycpLFxuICBmcmFtZUJ1ZmZlcjogU3ltYm9sKCdmcmFtZUJ1ZmZlcicpLFxuXG4gIG9uTWVzc2FnZUZyYW1lOiBTeW1ib2woJ29uTWVzc2FnZUZyYW1lJylcbn07XG5cbi8qKlxuICogV2ViU29ja2V0U2VydmVyIGNvbnN0cnVjdG9yIHRoYXQgYWNjZXB0cyBwb3J0IHRvIGxpc3RlbiBvbi5cbiAqIEBwYXJhbSB7TnVtYmVyfSBwb3J0IE51bWJlciB0byBsaXN0ZW4gZm9yIHdlYnNvY2tldCBjb25uZWN0aW9ucy5cbiAqL1xuY2xhc3MgV2ViU29ja2V0U2VydmVyIHtcbiAgY29uc3RydWN0b3IocG9ydCkge1xuICAgIEV2ZW50RGlzcGF0Y2hlci5taXhpbih0aGlzLCBbJ21lc3NhZ2UnLCAnc3RvcCddKTtcblxuICAgIHZhciB0Y3BTZXJ2ZXJTb2NrZXQgPSBuYXZpZ2F0b3IubW96VENQU29ja2V0Lmxpc3Rlbihwb3J0LCB7XG4gICAgICBiaW5hcnlUeXBlOiAnYXJyYXlidWZmZXInXG4gICAgfSk7XG5cbiAgICB0aGlzW3ByaXZhdGVzLnRjcFNlcnZlclNvY2tldF0gPSB0Y3BTZXJ2ZXJTb2NrZXQ7XG4gICAgdGhpc1twcml2YXRlcy5jbGllbnRzXSA9IG5ldyBNYXAoKTtcbiAgICB0aGlzW3ByaXZhdGVzLmZyYW1lQnVmZmVyXSA9IG5ldyBXZWJTb2NrZXRGcmFtZUJ1ZmZlcigpO1xuXG4gICAgdGhpc1twcml2YXRlcy5vbk1lc3NhZ2VGcmFtZV0gPSB0aGlzW3ByaXZhdGVzLm9uTWVzc2FnZUZyYW1lXS5iaW5kKHRoaXMpO1xuXG4gICAgdGNwU2VydmVyU29ja2V0Lm9uY29ubmVjdCA9XG4gICAgICB0aGlzW3ByaXZhdGVzLm9uVENQU2VydmVyU29ja2V0Q29ubmVjdF0uYmluZCh0aGlzKTtcbiAgICB0Y3BTZXJ2ZXJTb2NrZXQub25lcnJvciA9IHRoaXNbcHJpdmF0ZXMub25UQ1BTZXJ2ZXJTb2NrZXRDbG9zZV0uYmluZCh0aGlzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZW5kIGRhdGEgdG8gdGhlIGNvbm5lY3RlZCBjbGllbnRcbiAgICogQHBhcmFtIHtBcnJheUJ1ZmZlcnxBcnJheXxzdHJpbmd9IGRhdGEgRGF0YSB0byBzZW5kLlxuICAgKi9cbiAgc2VuZChkYXRhKSB7XG4gICAgaWYgKCFBcnJheUJ1ZmZlci5pc1ZpZXcoZGF0YSkgJiYgIShkYXRhIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpKSB7XG4gICAgICBpZiAodHlwZW9mIGRhdGEgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGRhdGEgPSBuZXcgVWludDhBcnJheShXZWJTb2NrZXRVdGlscy5zdHJpbmdUb0FycmF5KGRhdGEpKTtcbiAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuICAgICAgICBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoZGF0YSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vuc3VwcG9ydGVkIGRhdGEgdHlwZTogJyArIHR5cGVvZiBkYXRhKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgZGF0YUZyYW1lID0gY3JlYXRlTWVzc2FnZUZyYW1lKFxuICAgICAgT3BlcmF0aW9uQ29kZS5CSU5BUllfRlJBTUUsXG4gICAgICBkYXRhLFxuICAgICAgdHJ1ZSAvKiBpc0NvbXBsZXRlZCAqLyxcbiAgICAgIGZhbHNlIC8qIGlzTWFza2VkICovXG4gICAgKTtcblxuICAgIHRoaXNbcHJpdmF0ZXMudGNwU29ja2V0XS5zZW5kKGRhdGFGcmFtZS5idWZmZXIsIDAsIGRhdGFGcmFtZS5sZW5ndGgpO1xuICB9XG5cbiAgLyoqXG4gICAqIERlc3Ryb3lzIHNvY2tldCBjb25uZWN0aW9uLlxuICAgKi9cbiAgc3RvcCgpIHtcbiAgICB2YXIgdGNwU29ja2V0ID0gdGhpc1twcml2YXRlcy50Y3BTb2NrZXRdO1xuICAgIGlmICh0Y3BTb2NrZXQpIHtcbiAgICAgIHRjcFNvY2tldC5jbG9zZSgpO1xuICAgICAgdGhpc1twcml2YXRlcy5vblRDUFNvY2tldENsb3NlXSgpO1xuICAgIH1cblxuICAgIHZhciB0Y3BTZXJ2ZXJTb2NrZXQgPSB0aGlzW3ByaXZhdGVzLnRjcFNlcnZlclNvY2tldF07XG4gICAgaWYgKHRjcFNlcnZlclNvY2tldCkge1xuICAgICAgdGNwU2VydmVyU29ja2V0LmNsb3NlKCk7XG4gICAgICB0aGlzW3ByaXZhdGVzLm9uVENQU2VydmVyU29ja2V0Q2xvc2VdKCk7XG4gICAgfVxuXG4gICAgdGhpc1twcml2YXRlcy5jbGllbnRzXS5jbGVhcigpO1xuICB9XG5cbiAgW3ByaXZhdGVzLm9uVENQU2VydmVyU29ja2V0Q29ubmVjdF0odGNwU29ja2V0KSB7XG4gICAgdGhpc1twcml2YXRlcy50Y3BTb2NrZXRdID0gdGNwU29ja2V0O1xuXG4gICAgdGhpc1twcml2YXRlcy5mcmFtZUJ1ZmZlcl0ub24oJ2ZyYW1lJywgdGhpc1twcml2YXRlcy5vbk1lc3NhZ2VGcmFtZV0pO1xuXG4gICAgdGNwU29ja2V0Lm9uZGF0YSA9IHRoaXNbcHJpdmF0ZXMub25UQ1BTb2NrZXREYXRhXS5iaW5kKHRoaXMpO1xuICAgIHRjcFNvY2tldC5vbmNsb3NlID0gdGNwU29ja2V0Lm9uZXJyb3IgPVxuICAgICAgdGhpc1twcml2YXRlcy5vblRDUFNvY2tldENsb3NlXS5iaW5kKHRoaXMpO1xuICB9XG5cbiAgLyoqXG4gICAqIE1velRjcFNvY2tldCBkYXRhIGhhbmRsZXIuXG4gICAqIEBwYXJhbSB7VENQU29ja2V0RXZlbnR9IHNvY2tldEV2ZW50IFRDUFNvY2tldCBkYXRhIGV2ZW50LlxuICAgKi9cbiAgW3ByaXZhdGVzLm9uVENQU29ja2V0RGF0YV0oc29ja2V0RXZlbnQpIHtcbiAgICB2YXIgY2xpZW50cyA9IHRoaXNbcHJpdmF0ZXMuY2xpZW50c107XG4gICAgdmFyIHRjcFNvY2tldCA9IHRoaXNbcHJpdmF0ZXMudGNwU29ja2V0XTtcblxuICAgIHZhciBmcmFtZURhdGEgPSBuZXcgVWludDhBcnJheShzb2NrZXRFdmVudC5kYXRhKTtcblxuICAgIC8vIElmIHdlIGRvbid0IGhhdmUgY29ubmVjdGlvbiBpbmZvIGZyb20gdGhpcyBob3N0IGxldCdzIHBlcmZvcm0gaGFuZHNoYWtlXG4gICAgLy8gQ3VycmVudGx5IHdlIHN1cHBvcnQgb25seSBPTkUgY2xpZW50IGZyb20gaG9zdC5cbiAgICBpZiAoIWNsaWVudHMuaGFzKHRjcFNvY2tldC5ob3N0KSkge1xuICAgICAgcGVyZm9ybUhhbmRzaGFrZSh0Y3BTb2NrZXQsIGZyYW1lRGF0YSkudGhlbigoaGFuZHNoYWtlUmVzdWx0KSA9PiB7XG4gICAgICAgIGlmIChoYW5kc2hha2VSZXN1bHQpIHtcbiAgICAgICAgICBjbGllbnRzLnNldCh0Y3BTb2NrZXQuaG9zdCwgaGFuZHNoYWtlUmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpc1twcml2YXRlcy5mcmFtZUJ1ZmZlcl0ucHV0KGZyYW1lRGF0YSk7XG4gIH1cblxuICAvKipcbiAgICogUHJvY2VzcyBXZWJTb2NrZXQgaW5jb21pbmcgZnJhbWUuXG4gICAqIEBwYXJhbSB7VWludDhBcnJheX0gZnJhbWUgTWVzc2FnZSBmcmFtZSBkYXRhIGluIHZpZXcgb2YgVWludDhBcnJheS5cbiAgICovXG4gIFtwcml2YXRlcy5vbk1lc3NhZ2VGcmFtZV0oZnJhbWUpIHtcbiAgICB2YXIgYnVmZmVyID0gdGhpc1twcml2YXRlcy5mcmFtZUJ1ZmZlcl07XG5cbiAgICBidWZmZXIuZ2V0KDIpLnRoZW4oKGNvbnRyb2xEYXRhKSA9PiB7XG4gICAgICB2YXIgc3RhdGUgPSB7XG4gICAgICAgIGlzQ29tcGxldGVkOiAoY29udHJvbERhdGFbMF0gJiAweDgwKSA9PT0gMHg4MCxcbiAgICAgICAgaXNNYXNrZWQ6IChjb250cm9sRGF0YVsxXSAmIDB4ODApID09PSAweDgwLFxuICAgICAgICBpc0NvbXByZXNzZWQ6IChjb250cm9sRGF0YVswXSAmIDB4NDApID09PSAweDQwLFxuICAgICAgICBvcENvZGU6IGNvbnRyb2xEYXRhWzBdICYgMHhmLFxuICAgICAgICBkYXRhTGVuZ3RoOiBjb250cm9sRGF0YVsxXSAmIDB4N2YsXG4gICAgICAgIG1hc2s6IG51bGwsXG4gICAgICAgIGRhdGE6IFtdXG4gICAgICB9O1xuXG4gICAgICBpZiAoc3RhdGUub3BDb2RlID09PSBPcGVyYXRpb25Db2RlLkNPTlRJTlVBVElPTl9GUkFNRSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvbnRpbnVhdGlvbiBmcmFtZSBpcyBub3QgeWV0IHN1cHBvcnRlZCEnKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHN0YXRlLm9wQ29kZSA9PT0gT3BlcmF0aW9uQ29kZS5QT05HKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUG9uZyBmcmFtZSBpcyBub3QgeWV0IHN1cHBvcnRlZCEnKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHN0YXRlLm9wQ29kZSA+PSAzICYmIHN0YXRlLm9wQ29kZSA8PSA3KSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAnUmVzZXJ2ZWQgZm9yIGZ1dHVyZSBub24tY29udHJvbCBmcmFtZXMgYXJlIG5vdCBzdXBwb3J0ZWQhJ1xuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBpZiAoc3RhdGUub3BDb2RlID4gMTApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICdSZXNlcnZlZCBmb3IgZnV0dXJlIGNvbnRyb2wgZnJhbWVzIGFyZSBub3Qgc3VwcG9ydGVkISdcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHN0YXRlO1xuICAgIH0pLnRoZW4oKHN0YXRlKSA9PiB7XG4gICAgICB2YXIgZGF0YUxlbmd0aFByb21pc2U7XG4gICAgICBpZiAoc3RhdGUuZGF0YUxlbmd0aCA9PT0gMTI2KSB7XG4gICAgICAgIGRhdGFMZW5ndGhQcm9taXNlID0gYnVmZmVyLmdldCgyKS50aGVuKFxuICAgICAgICAgIChkYXRhKSA9PiBXZWJTb2NrZXRVdGlscy5yZWFkVUludDE2KGRhdGEpXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKHN0YXRlLmRhdGFMZW5ndGggPT0gMTI3KSB7XG4gICAgICAgIGRhdGFMZW5ndGhQcm9taXNlID0gYnVmZmVyLmdldCg0KS50aGVuKFxuICAgICAgICAgIChkYXRhKSA9PiBXZWJTb2NrZXRVdGlscy5yZWFkVUludDMyKGRhdGEpXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkYXRhTGVuZ3RoUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShzdGF0ZS5kYXRhTGVuZ3RoKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGRhdGFMZW5ndGhQcm9taXNlLnRoZW4oKGRhdGFMZW5ndGgpID0+IHtcbiAgICAgICAgc3RhdGUuZGF0YUxlbmd0aCA9IGRhdGFMZW5ndGg7XG4gICAgICAgIHJldHVybiBzdGF0ZTtcbiAgICAgIH0pO1xuICAgIH0pLnRoZW4oKHN0YXRlKSA9PiB7XG4gICAgICBpZiAoc3RhdGUuaXNNYXNrZWQpIHtcbiAgICAgICAgcmV0dXJuIGJ1ZmZlci5nZXQoNCkudGhlbigobWFzaykgPT4ge1xuICAgICAgICAgIHN0YXRlLm1hc2sgPSBtYXNrO1xuICAgICAgICAgIHJldHVybiBzdGF0ZTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc3RhdGU7XG4gICAgfSkudGhlbigoc3RhdGUpID0+IHtcbiAgICAgIHJldHVybiBzdGF0ZS5kYXRhTGVuZ3RoID8gYnVmZmVyLmdldChzdGF0ZS5kYXRhTGVuZ3RoKS50aGVuKChkYXRhKSA9PiB7XG4gICAgICAgIHN0YXRlLmRhdGEgPSBXZWJTb2NrZXRVdGlscy5tYXNrKHN0YXRlLm1hc2ssIGRhdGEpO1xuICAgICAgICByZXR1cm4gc3RhdGU7XG4gICAgICB9KSA6IHN0YXRlO1xuICAgIH0pLnRoZW4oKHN0YXRlKSA9PiB7XG4gICAgICB2YXIgZGF0YUZyYW1lO1xuICAgICAgaWYgKHN0YXRlLm9wQ29kZSA9PT0gT3BlcmF0aW9uQ29kZS5DT05ORUNUSU9OX0NMT1NFKSB7XG4gICAgICAgIHZhciBjb2RlID0gMDtcbiAgICAgICAgdmFyIHJlYXNvbiA9ICdVbmtub3duJztcblxuICAgICAgICBpZiAoc3RhdGUuZGF0YUxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjb2RlID0gIFdlYlNvY2tldFV0aWxzLnJlYWRVSW50MTYoc3RhdGUuZGF0YSk7XG4gICAgICAgICAgaWYgKHN0YXRlLmRhdGFMZW5ndGggPiAyKSB7XG4gICAgICAgICAgICByZWFzb24gPSBXZWJTb2NrZXRVdGlscy5hcnJheVRvU3RyaW5nKHN0YXRlLmRhdGEuc3ViYXJyYXkoMikpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnNvbGUubG9nKCdTb2NrZXQgaXMgY2xvc2VkOiAlcyAoY29kZSBpcyAlcyknLCByZWFzb24sIGNvZGUpO1xuXG4gICAgICAgIGRhdGFGcmFtZSA9IGNyZWF0ZU1lc3NhZ2VGcmFtZShcbiAgICAgICAgICBPcGVyYXRpb25Db2RlLkNPTk5FQ1RJT05fQ0xPU0UsIHN0YXRlLmRhdGEsIHRydWUgLyogaXNDb21wbGV0ZWQgKi9cbiAgICAgICAgKTtcbiAgICAgICAgdGhpc1twcml2YXRlcy50Y3BTb2NrZXRdLnNlbmQoZGF0YUZyYW1lLmJ1ZmZlciwgMCwgZGF0YUZyYW1lLmxlbmd0aCk7XG4gICAgICAgIHRoaXNbcHJpdmF0ZXMub25UQ1BTb2NrZXRDbG9zZV0oKTtcbiAgICAgIH0gZWxzZSBpZiAoc3RhdGUub3BDb2RlID09PSBPcGVyYXRpb25Db2RlLlRFWFRfRlJBTUUgfHxcbiAgICAgICAgICAgICAgICAgc3RhdGUub3BDb2RlID09PSBPcGVyYXRpb25Db2RlLkJJTkFSWV9GUkFNRSkge1xuICAgICAgICB0aGlzLmVtaXQoJ21lc3NhZ2UnLCBzdGF0ZS5kYXRhKTtcbiAgICAgIH0gZWxzZSBpZiAoc3RhdGUub3BDb2RlID09PSBPcGVyYXRpb25Db2RlLlBJTkcpIHtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgJ1BJTkcgZnJhbWUgaXMgcmVjZWl2ZWQgKG1hc2tlZDogJXMsIGhhc0RhdGE6ICVzKScsXG4gICAgICAgICAgc3RhdGUuaXNNYXNrZWQsXG4gICAgICAgICAgISFzdGF0ZS5kYXRhXG4gICAgICAgICk7XG5cbiAgICAgICAgaWYgKCFzdGF0ZS5pc0NvbXBsZXRlZCkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRnJhZ21lbnRlZCBQaW5nIGZyYW1lIGlzIG5vdCBzdXBwb3J0ZWQhJyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUuZGF0YUxlbmd0aCA+IDEyNSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgICdQaW5nIGZyYW1lIGNhbiBub3QgaGF2ZSBtb3JlIHRoYW4gMTI1IGJ5dGVzIG9mIGRhdGEhJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBkYXRhRnJhbWUgPSBjcmVhdGVNZXNzYWdlRnJhbWUoXG4gICAgICAgICAgT3BlcmF0aW9uQ29kZS5QT05HLCBzdGF0ZS5kYXRhLCB0cnVlIC8qIGlzQ29tcGxldGVkICovLCBzdGF0ZS5pc01hc2tlZFxuICAgICAgICApO1xuICAgICAgICB0aGlzW3ByaXZhdGVzLnRjcFNvY2tldF0uc2VuZChkYXRhRnJhbWUuYnVmZmVyLCAwLCBkYXRhRnJhbWUubGVuZ3RoKTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFidWZmZXIuaXNFbXB0eSgpKSB7XG4gICAgICAgIHRoaXNbcHJpdmF0ZXMub25NZXNzYWdlRnJhbWVdKCk7XG4gICAgICB9XG4gICAgfSkuY2F0Y2goKGUpID0+IHtcbiAgICAgIHZhciBjb2RlID0gMTAwMjtcbiAgICAgIHZhciByZWFzb24gPSBlLm1lc3NhZ2UgfHwgZS5uYW1lIHx8ICdVbmtub3duIGZhaWx1cmUgb24gc2VydmVyJztcblxuICAgICAgY29uc29sZS5sb2coJ1NvY2tldCBpcyBjbG9zZWQ6ICVzIChjb2RlIGlzICVzKScsIHJlYXNvbiwgY29kZSk7XG5cbiAgICAgIC8vIDIgYnl0ZXMgZm9yIHRoZSBjb2RlIGFuZCB0aGUgcmVzdCBmb3IgdGhlIHJlYXNvbi5cbiAgICAgIHZhciBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoMiArIHJlYXNvbi5sZW5ndGgpO1xuICAgICAgV2ViU29ja2V0VXRpbHMud3JpdGVVSW50MTYoZGF0YSwgY29kZSwgMCk7XG4gICAgICBkYXRhLnNldChXZWJTb2NrZXRVdGlscy5zdHJpbmdUb0FycmF5KHJlYXNvbiksIDIpO1xuXG4gICAgICB2YXIgZGF0YUZyYW1lID0gY3JlYXRlTWVzc2FnZUZyYW1lKFxuICAgICAgICBPcGVyYXRpb25Db2RlLkNPTk5FQ1RJT05fQ0xPU0UsIGRhdGEsIHRydWUgLyogaXNDb21wbGV0ZWQgKi9cbiAgICAgICk7XG4gICAgICB0aGlzW3ByaXZhdGVzLnRjcFNvY2tldF0uc2VuZChkYXRhRnJhbWUuYnVmZmVyLCAwLCBkYXRhRnJhbWUubGVuZ3RoKTtcbiAgICAgIHRoaXNbcHJpdmF0ZXMub25UQ1BTb2NrZXRDbG9zZV0oKTtcbiAgICB9KTtcbiAgfVxuXG4gIFtwcml2YXRlcy5vblRDUFNvY2tldENsb3NlXSgpIHtcbiAgICB2YXIgdGNwU29ja2V0ID0gdGhpc1twcml2YXRlcy50Y3BTb2NrZXRdO1xuXG4gICAgaWYgKCF0Y3BTb2NrZXQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzW3ByaXZhdGVzLmNsaWVudHNdLmRlbGV0ZSh0Y3BTb2NrZXQuaG9zdCk7XG5cbiAgICB0Y3BTb2NrZXQub25kYXRhID0gdGNwU29ja2V0Lm9uZXJyb3IgPSB0Y3BTb2NrZXQub25jbG9zZSA9IG51bGw7XG5cbiAgICB0aGlzW3ByaXZhdGVzLnRjcFNvY2tldF0gPSBudWxsO1xuICB9XG5cbiAgW3ByaXZhdGVzLm9uVENQU2VydmVyU29ja2V0Q2xvc2VdKCkge1xuICAgIHZhciB0Y3BTZXJ2ZXJTb2NrZXQgPSB0aGlzW3ByaXZhdGVzLnRjcFNlcnZlclNvY2tldF07XG5cbiAgICBpZiAoIXRjcFNlcnZlclNvY2tldCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRjcFNlcnZlclNvY2tldC5vbmNvbm5lY3QgPSB0Y3BTZXJ2ZXJTb2NrZXQub25lcnJvciA9IG51bGw7XG5cbiAgICB0aGlzW3ByaXZhdGVzLnRjcFNlcnZlclNvY2tldF0gPSBudWxsO1xuXG4gICAgdGhpcy5lbWl0KCdzdG9wJyk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQge1xuICBTZXJ2ZXI6IFdlYlNvY2tldFNlcnZlcixcbiAgVXRpbHM6IFdlYlNvY2tldFV0aWxzLFxuICBGcmFtZUJ1ZmZlcjogV2ViU29ja2V0RnJhbWVCdWZmZXJcbn07XG4iLG51bGwsImltcG9ydCBFdmVudERpc3BhdGNoZXIgZnJvbSAnRXZlbnREaXNwYXRjaGVyJztcblxudmFyIHByaXZhdGVzID0ge1xuICBkYXRhOiBTeW1ib2woJ2RhdGEnKSxcbiAgcGVuZGluZ0RhdGFSZXF1ZXN0OiBTeW1ib2woJ3BlbmRpbmdEYXRhUmVxdWVzdCcpLFxuICBzcGxpY2U6IFN5bWJvbCgnc3BsaWNlJylcbn07XG5cbmNsYXNzIFdlYlNvY2tldEZyYW1lQnVmZmVyIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgRXZlbnREaXNwYXRjaGVyLm1peGluKHRoaXMsIFsnZnJhbWUnLCAnZGF0YSddKTtcblxuICAgIHRoaXNbcHJpdmF0ZXMuZGF0YV0gPSBuZXcgVWludDhBcnJheSgwKTtcbiAgICB0aGlzW3ByaXZhdGVzLnBlbmRpbmdEYXRhUmVxdWVzdF0gPSBudWxsO1xuICAgIHRoaXNbcHJpdmF0ZXMuc3BsaWNlXSA9IGZ1bmN0aW9uKGxlbmd0aCkge1xuICAgICAgdmFyIGRhdGEgPSB0aGlzW3ByaXZhdGVzLmRhdGFdO1xuXG4gICAgICB2YXIgc3BsaWNlZERhdGEgPSBkYXRhLnN1YmFycmF5KDAsIGxlbmd0aCk7XG4gICAgICB0aGlzW3ByaXZhdGVzLmRhdGFdID0gZGF0YS5zdWJhcnJheShsZW5ndGgsIGRhdGEubGVuZ3RoKTtcblxuICAgICAgcmV0dXJuIHNwbGljZWREYXRhO1xuICAgIH07XG4gIH1cblxuICBwdXQoZGF0YVRvUHV0KSB7XG4gICAgdmFyIGRhdGEgPSB0aGlzW3ByaXZhdGVzLmRhdGFdO1xuXG4gICAgdmFyIG5ld0RhdGEgPSBuZXcgVWludDhBcnJheShkYXRhLmxlbmd0aCArIGRhdGFUb1B1dC5sZW5ndGgpO1xuICAgIG5ld0RhdGEuc2V0KGRhdGEpO1xuICAgIG5ld0RhdGEuc2V0KGRhdGFUb1B1dCwgZGF0YS5sZW5ndGgpO1xuICAgIHRoaXNbcHJpdmF0ZXMuZGF0YV0gPSBuZXdEYXRhO1xuXG4gICAgdGhpcy5lbWl0KCdkYXRhJyk7XG5cbiAgICAvLyBJZiBubyBvbmUgd2FpdGluZyBmb3IgZGF0YSwgbGV0J3Mgc2lnbmFsIHRoYXQgd2UgaGF2ZSBuZXcgZnJhbWUhXG4gICAgaWYgKCF0aGlzW3ByaXZhdGVzLnBlbmRpbmdEYXRhUmVxdWVzdF0pIHtcbiAgICAgIHRoaXMuZW1pdCgnZnJhbWUnKTtcbiAgICB9XG4gIH1cblxuICBnZXQoZGF0YUxlbmd0aCkge1xuICAgIGlmICh0aGlzW3ByaXZhdGVzLnBlbmRpbmdEYXRhUmVxdWVzdF0pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ29uY3VycmVudCByZWFkIGlzIG5vdCBhbGxvd2VkLicpO1xuICAgIH1cblxuICAgIHRoaXNbcHJpdmF0ZXMucGVuZGluZ0RhdGFSZXF1ZXN0XSA9IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICB2YXIgZGF0YSA9IHRoaXNbcHJpdmF0ZXMuZGF0YV07XG4gICAgICBpZiAoZGF0YS5sZW5ndGggPj0gZGF0YUxlbmd0aCkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZSh0aGlzW3ByaXZhdGVzLnNwbGljZV0oZGF0YUxlbmd0aCkpO1xuICAgICAgfVxuXG4gICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICB0aGlzLm9uKCdkYXRhJywgZnVuY3Rpb24gb25EYXRhKCkge1xuICAgICAgICBpZiAoZGF0YS5sZW5ndGggPCBkYXRhTGVuZ3RoKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgc2VsZi5vZmYoJ2RhdGEnLCBvbkRhdGEpO1xuICAgICAgICByZXNvbHZlKHRoaXNbcHJpdmF0ZXMuc3BsaWNlXShkYXRhTGVuZ3RoKSk7XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJldHVybiB0aGlzW3ByaXZhdGVzLnBlbmRpbmdEYXRhUmVxdWVzdF0udGhlbigoZGF0YSkgPT4ge1xuICAgICAgdGhpc1twcml2YXRlcy5wZW5kaW5nRGF0YVJlcXVlc3RdID0gbnVsbDtcbiAgICAgIHJldHVybiBkYXRhO1xuICAgIH0pO1xuICB9XG5cbiAgaXNFbXB0eSgpIHtcbiAgICByZXR1cm4gdGhpc1twcml2YXRlcy5kYXRhXS5sZW5ndGggPT09IDA7XG4gIH07XG59XG5cbmV4cG9ydCBkZWZhdWx0IFdlYlNvY2tldEZyYW1lQnVmZmVyO1xuIiwidmFyIFdlYlNvY2tldFV0aWxzID0ge1xuICAvKipcbiAgICogTWFzayBldmVyeSBkYXRhIGVsZW1lbnQgd2l0aCB0aGUgbWFzayAoV2ViU29ja2V0IHNwZWNpZmljIGFsZ29yaXRobSkuXG4gICAqIEBwYXJhbSB7QXJyYXl9IG1hc2sgTWFzayBhcnJheS5cbiAgICogQHBhcmFtIHtBcnJheX0gYXJyYXkgRGF0YSBhcnJheSB0byBtYXNrLlxuICAgKiBAcmV0dXJucyB7QXJyYXl9IE1hc2tlZCBkYXRhIGFycmF5LlxuICAgKi9cbiAgbWFzayhtYXNrLCBhcnJheSkge1xuICAgIGlmIChtYXNrKSB7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGFycmF5W2ldID0gYXJyYXlbaV0gXiBtYXNrW2kgJSA0XTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGFycmF5O1xuICB9LFxuXG4gIC8qKlxuICAgKiBHZW5lcmF0ZXMgNC1pdGVtIGFycmF5LCBldmVyeSBpdGVtIG9mIHdoaWNoIGlzIGVsZW1lbnQgb2YgYnl0ZSBtYXNrLlxuICAgKiBAcmV0dXJucyB7VWludDhBcnJheX1cbiAgICovXG4gIGdlbmVyYXRlUmFuZG9tTWFzaygpIHtcbiAgICB2YXIgcmFuZG9tID0gbmV3IFVpbnQ4QXJyYXkoNCk7XG5cbiAgICB3aW5kb3cuY3J5cHRvLmdldFJhbmRvbVZhbHVlcyhyYW5kb20pO1xuXG4gICAgcmV0dXJuIHJhbmRvbTtcbiAgfSxcblxuICAvKipcbiAgICogQ29udmVydHMgc3RyaW5nIHRvIFVpbnQ4QXJyYXkuXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBzdHJpbmdWYWx1ZSBTdHJpbmcgdmFsdWUgdG8gY29udmVydC5cbiAgICogQHJldHVybnMge1VpbnQ4QXJyYXl9XG4gICAqL1xuICBzdHJpbmdUb0FycmF5KHN0cmluZ1ZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiBzdHJpbmdWYWx1ZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignc3RyaW5nVmFsdWUgc2hvdWxkIGJlIHZhbGlkIHN0cmluZyEnKTtcbiAgICB9XG5cbiAgICB2YXIgYXJyYXkgPSBuZXcgVWludDhBcnJheShzdHJpbmdWYWx1ZS5sZW5ndGgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyaW5nVmFsdWUubGVuZ3RoOyBpKyspIHtcbiAgICAgIGFycmF5W2ldID0gc3RyaW5nVmFsdWUuY2hhckNvZGVBdChpKTtcbiAgICB9XG5cbiAgICByZXR1cm4gYXJyYXk7XG4gIH0sXG5cbiAgLyoqXG4gICAqIENvbnZlcnRzIGFycmF5IHRvIHN0cmluZy4gRXZlcnkgYXJyYXkgZWxlbWVudCBpcyBjb25zaWRlcmVkIGFzIGNoYXIgY29kZS5cbiAgICogQHBhcmFtIHtVaW50OEFycmF5fSBhcnJheSBBcnJheSB3aXRoIHRoZSBjaGFyIGNvZGVzLlxuICAgKiBAcmV0dXJucyB7c3RyaW5nfVxuICAgKi9cbiAgYXJyYXlUb1N0cmluZyhhcnJheSkge1xuICAgIHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIGFycmF5KTtcbiAgfSxcblxuICAvKipcbiAgICogUmVhZHMgdW5zaWduZWQgMTYgYml0IHZhbHVlIGZyb20gdHdvIGNvbnNlcXVlbnQgOC1iaXQgYXJyYXkgZWxlbWVudHMuXG4gICAqIEBwYXJhbSB7VWludDhBcnJheX0gYXJyYXkgQXJyYXkgdG8gcmVhZCBmcm9tLlxuICAgKiBAcGFyYW0ge051bWJlcn0gb2Zmc2V0IEluZGV4IHRvIHN0YXJ0IHJlYWQgdmFsdWUuXG4gICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAqL1xuICByZWFkVUludDE2KGFycmF5LCBvZmZzZXQpIHtcbiAgICBvZmZzZXQgPSBvZmZzZXQgfHwgMDtcbiAgICByZXR1cm4gKGFycmF5W29mZnNldF0gPDwgOCkgKyBhcnJheVtvZmZzZXQgKyAxXTtcbiAgfSxcblxuICAvKipcbiAgICogUmVhZHMgdW5zaWduZWQgMzIgYml0IHZhbHVlIGZyb20gZm91ciBjb25zZXF1ZW50IDgtYml0IGFycmF5IGVsZW1lbnRzLlxuICAgKiBAcGFyYW0ge1VpbnQ4QXJyYXl9IGFycmF5IEFycmF5IHRvIHJlYWQgZnJvbS5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9mZnNldCBJbmRleCB0byBzdGFydCByZWFkIHZhbHVlLlxuICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgKi9cbiAgcmVhZFVJbnQzMihhcnJheSwgb2Zmc2V0KSB7XG4gICAgb2Zmc2V0ID0gb2Zmc2V0IHx8IDA7XG4gICAgcmV0dXJuIChhcnJheVtvZmZzZXRdIDw8IDI0KSArXG4gICAgICAoYXJyYXlbb2Zmc2V0ICsgMV0gPDwgMTYpICtcbiAgICAgIChhcnJheSBbb2Zmc2V0ICsgMl0gPDwgOCkgK1xuICAgICAgYXJyYXlbb2Zmc2V0ICsgM107XG4gIH0sXG5cbiAgLyoqXG4gICAqIFdyaXRlcyB1bnNpZ25lZCAxNiBiaXQgdmFsdWUgdG8gdHdvIGNvbnNlcXVlbnQgOC1iaXQgYXJyYXkgZWxlbWVudHMuXG4gICAqIEBwYXJhbSB7VWludDhBcnJheX0gYXJyYXkgQXJyYXkgdG8gd3JpdGUgdG8uXG4gICAqIEBwYXJhbSB7TnVtYmVyfSB2YWx1ZSAxNiBiaXQgdW5zaWduZWQgdmFsdWUgdG8gd3JpdGUgaW50byBhcnJheS5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9mZnNldCBJbmRleCB0byBzdGFydCB3cml0ZSB2YWx1ZS5cbiAgICogQHJldHVybnMge051bWJlcn1cbiAgICovXG4gIHdyaXRlVUludDE2KGFycmF5LCB2YWx1ZSwgb2Zmc2V0KSB7XG4gICAgYXJyYXlbb2Zmc2V0XSA9ICh2YWx1ZSAmIDB4ZmYwMCkgPj4gODtcbiAgICBhcnJheVtvZmZzZXQgKyAxXSA9IHZhbHVlICYgMHhmZjtcbiAgfSxcblxuICAvKipcbiAgICogV3JpdGVzIHVuc2lnbmVkIDE2IGJpdCB2YWx1ZSB0byB0d28gY29uc2VxdWVudCA4LWJpdCBhcnJheSBlbGVtZW50cy5cbiAgICogQHBhcmFtIHtVaW50OEFycmF5fSBhcnJheSBBcnJheSB0byB3cml0ZSB0by5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IHZhbHVlIDE2IGJpdCB1bnNpZ25lZCB2YWx1ZSB0byB3cml0ZSBpbnRvIGFycmF5LlxuICAgKiBAcGFyYW0ge051bWJlcn0gb2Zmc2V0IEluZGV4IHRvIHN0YXJ0IHdyaXRlIHZhbHVlLlxuICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgKi9cbiAgd3JpdGVVSW50MzIoYXJyYXksIHZhbHVlLCBvZmZzZXQpIHtcbiAgICBhcnJheVtvZmZzZXRdID0gKHZhbHVlICYgMHhmZjAwMDAwMCkgPj4gMjQ7XG4gICAgYXJyYXlbb2Zmc2V0ICsgMV0gPSAodmFsdWUgJiAweGZmMDAwMCkgPj4gMTY7XG4gICAgYXJyYXlbb2Zmc2V0ICsgMl0gPSAodmFsdWUgJiAweGZmMDApID4+IDg7XG4gICAgYXJyYXlbb2Zmc2V0ICsgM10gPSB2YWx1ZSAmIDB4ZmY7XG4gIH1cbn07XG5cbmV4cG9ydCBkZWZhdWx0IFdlYlNvY2tldFV0aWxzO1xuIl19
