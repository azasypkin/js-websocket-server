(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.FxOSWebSocket = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _eventDispatcherJs = require('event-dispatcher-js');

var _eventDispatcherJs2 = _interopRequireDefault(_eventDispatcherJs);

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
 * @param {Boolean} isMasked Indicates if frame data should be masked.
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

    _eventDispatcherJs2['default'].mixin(this, ['message', 'stop']);

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

      var dataFrame = createMessageFrame(2, data, true, false);

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

        if (state.opCode === OperationCode.PING) {
          throw new Error('Ping frame is not yet supported!');
        }

        if (state.opCode === OperationCode.PONG) {
          throw new Error('Pong frame is not yet supported!');
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
        if (state.opCode === OperationCode.CONNECTION_CLOSE) {
          var code = 0;
          var reason = 'Unknown';

          if (state.dataLength > 0) {
            code = _utilsEs62['default'].readUInt16(state.data);
            if (state.dataLength > 2) {
              reason = _utilsEs62['default'].arrayToString(state.data.subarray(2));
            }
          }

          console.log('Socket is closed: ' + code + ' ' + reason);

          var dataFrame = createMessageFrame(8, state.data, true);
          _this[privates.tcpSocket].send(dataFrame.buffer, 0, dataFrame.length);
          _this[privates.onTCPSocketClose]();
        } else if (state.opCode === OperationCode.TEXT_FRAME || state.opCode === OperationCode.BINARY_FRAME) {
          _this.emit('message', state.data);
        }

        if (!buffer.isEmpty()) {
          _this[privates.onMessageFrame]();
        }
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

},{"./frame-buffer.es6":3,"./utils.es6":4,"event-dispatcher-js":2}],2:[function(require,module,exports){

},{}],3:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _eventDispatcherJs = require('event-dispatcher-js');

var _eventDispatcherJs2 = _interopRequireDefault(_eventDispatcherJs);

var privates = {
  data: Symbol('data'),
  pendingDataRequest: Symbol('pendingDataRequest'),
  splice: Symbol('splice')
};

var WebSocketFrameBuffer = (function () {
  function WebSocketFrameBuffer() {
    _classCallCheck(this, WebSocketFrameBuffer);

    _eventDispatcherJs2['default'].mixin(this, ['frame', 'data']);

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

},{"event-dispatcher-js":2}],4:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvbWVkaWEvYXphc3lwa2luL3Byb2plY3RzL2dpdGh1Yi9meG9zLXdlYnNvY2tldC1zZXJ2ZXIvc3JjL3NlcnZlci5lczYuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9saWIvX2VtcHR5LmpzIiwiL21lZGlhL2F6YXN5cGtpbi9wcm9qZWN0cy9naXRodWIvZnhvcy13ZWJzb2NrZXQtc2VydmVyL3NyYy9mcmFtZS1idWZmZXIuZXM2LmpzIiwiL21lZGlhL2F6YXN5cGtpbi9wcm9qZWN0cy9naXRodWIvZnhvcy13ZWJzb2NrZXQtc2VydmVyL3NyYy91dGlscy5lczYuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7Ozs7Ozs7Ozs7aUNDQTRCLHFCQUFxQjs7Ozs4QkFDaEIsb0JBQW9COzs7O3dCQUMxQixhQUFhOzs7Ozs7OztBQU14QyxJQUFNLElBQUksR0FBRyxNQUFNLENBQUM7Ozs7Ozs7QUFPcEIsSUFBTSxrQkFBa0IsR0FBRyxzQ0FBc0MsQ0FBQzs7Ozs7OztBQU9sRSxJQUFNLDRCQUE0QixHQUNoQyxrQ0FBa0MsR0FBRyxJQUFJLEdBQ3pDLHFCQUFxQixHQUFHLElBQUksR0FDNUIsb0JBQW9CLEdBQUcsSUFBSSxHQUMzQix3Q0FBd0MsR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDOzs7Ozs7QUFNekQsSUFBTSxhQUFhLEdBQUc7QUFDcEIsb0JBQWtCLEVBQUUsQ0FBQztBQUNyQixZQUFVLEVBQUUsQ0FBQztBQUNiLGNBQVksRUFBRSxDQUFDO0FBQ2Ysa0JBQWdCLEVBQUUsQ0FBQztBQUNuQixNQUFJLEVBQUUsQ0FBQztBQUNQLE1BQUksRUFBRSxFQUFFO0NBQ1QsQ0FBQzs7Ozs7OztBQU9GLFNBQVMsY0FBYyxDQUFDLGdCQUFnQixFQUFFO0FBQ3hDLE1BQUksV0FBVyxHQUFHLGdCQUFnQixDQUFDLElBQUksRUFBRSxD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QUUsS0FBSyxFQUFFLE1BQU0sRUFBRTtBQUNoQyxTQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEdBQUcsVUFBVSxDQUFBLElBQUssRUFBRSxDQUFDO0FBQzNDLFNBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEdBQUcsUUFBUSxDQUFBLElBQUssRUFBRSxDQUFDO0FBQzdDLFNBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEdBQUcsS0FBTSxDQUFBLElBQUssQ0FBQyxDQUFDO0FBQzFDLFNBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEdBQUcsS0FBSyxHQUFHLEdBQUksQ0FBQztHQUNsQztDQUNGLENBQUM7O3FCQUVhLGNBQWMiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiaW1wb3J0IEV2ZW50RGlzcGF0Y2hlciBmcm9tICdldmVudC1kaXNwYXRjaGVyLWpzJztcbmltcG9ydCBXZWJTb2NrZXRGcmFtZUJ1ZmZlciBmcm9tICcuL2ZyYW1lLWJ1ZmZlci5lczYnO1xuaW1wb3J0IFdlYlNvY2tldFV0aWxzIGZyb20gJy4vdXRpbHMuZXM2JztcblxuLyoqXG4gKiBTZXF1ZW5jZSB1c2VkIHRvIHNlcGFyYXRlIEhUVFAgcmVxdWVzdCBoZWFkZXJzIGFuZCBib2R5LlxuICogQGNvbnN0IHtzdHJpbmd9XG4gKi9cbmNvbnN0IENSTEYgPSAnXFxyXFxuJztcblxuLyoqXG4gKiBNYWdpYyBHVUlEIGRlZmluZWQgYnkgUkZDIHRvIGNvbmNhdGVuYXRlIHdpdGggd2ViIHNvY2tldCBrZXkgZHVyaW5nXG4gKiB3ZWJzb2NrZXQgaGFuZHNoYWtlLlxuICogQGNvbnN0IHtzdHJpbmd9XG4gKi9cbmNvbnN0IFdFQlNPQ0tFVF9LRVlfR1VJRCA9ICcyNThFQUZBNS1FOTE0LTQ3REEtOTVDQS1DNUFCMERDODVCMTEnO1xuXG4vKipcbiAqIFdlYnNvY2tldCBoYW5kc2hha2UgcmVzcG9uc2UgdGVtcGxhdGUgc3RyaW5nLCB7d2ViLXNvY2tldC1rZXl9IHNob3VsZCBiZVxuICogcmVwbGFjZWQgd2l0aCB0aGUgYXBwcm9wcmlhdGUga2V5LlxuICogQGNvbnN0IHtzdHJpbmd9XG4gKi9cbmNvbnN0IFdFQlNPQ0tFVF9IQU5EU0hBS0VfUkVTUE9OU0UgPVxuICAnSFRUUC8xLjEgMTAxIFN3aXRjaGluZyBQcm90b2NvbHMnICsgQ1JMRiArXG4gICdDb25uZWN0aW9uOiBVcGdyYWRlJyArIENSTEYgK1xuICAnVXBncmFkZTogd2Vic29ja2V0JyArIENSTEYgK1xuICAnU2VjLVdlYlNvY2tldC1BY2NlcHQ6IHt3ZWItc29ja2V0LWtleX0nICsgQ1JMRiArIENSTEY7XG5cbi8qKlxuICogRW51bWVyYXRpb24gb2YgYWxsIHBvc3NpYmxlIG9wZXJhdGlvbiBjb2Rlcy5cbiAqIEBlbnVtIHtudW1iZXJ9XG4gKi9cbmNvbnN0IE9wZXJhdGlvbkNvZGUgPSB7XG4gIENPTlRJTlVBVElPTl9GUkFNRTogMCxcbiAgVEVYVF9GUkFNRTogMSxcbiAgQklOQVJZX0ZSQU1FOiAyLFxuICBDT05ORUNUSU9OX0NMT1NFOiA4LFxuICBQSU5HOiA5LFxuICBQT05HOiAxMFxufTtcblxuLyoqXG4gKiBFeHRyYWN0cyBIVFRQIGhlYWRlciBtYXAgZnJvbSBIVFRQIGhlYWRlciBzdHJpbmcuXG4gKiBAcGFyYW0ge3N0cmluZ30gaHR0cEhlYWRlclN0cmluZyBIVFRQIGhlYWRlciBzdHJpbmcuXG4gKiBAcmV0dXJucyB7TWFwLjxzdHJpbmcsIHN0cmluZz59IEhUVFAgaGVhZGVyIGtleS12YWx1ZSBtYXAuXG4gKi9cbmZ1bmN0aW9uIGdldEh0dHBIZWFkZXJzKGh0dHBIZWFkZXJTdHJpbmcpIHtcbiAgdmFyIGh0dHBIZWFkZXJzID0gaHR0cEhlYWRlclN0cmluZy50cmltKCkuc3BsaXQoQ1JMRik7XG4gIHJldHVybiBuZXcgTWFwKGh0dHBIZWFkZXJzLm1hcCgoaHR0cEhlYWRlcikgPT4ge1xuICAgIHJldHVybiBodHRwSGVhZGVyLnNwbGl0KCc6JykubWFwKChlbnRpdHkpID0+IGVudGl0eS50cmltKCkpO1xuICB9KSk7XG59XG5cbi8qKlxuICogUGVyZm9ybXMgV2ViU29ja2V0IEhUVFAgSGFuZHNoYWtlLlxuICogQHBhcmFtIHtUQ1BTb2NrZXR9IHRjcFNvY2tldCBDb25uZWN0aW9uIHNvY2tldC5cbiAqIEBwYXJhbSB7VWludDhBcnJheX0gaHR0cFJlcXVlc3REYXRhIEhUVFAgSGFuZHNoYWtlIGRhdGEgYXJyYXkuXG4gKiBAcmV0dXJucyB7TWFwLjxzdHJpbmcsIHN0cmluZz59IFBhcnNlZCBodHRwIGhlYWRlcnNcbiAqL1xuZnVuY3Rpb24gcGVyZm9ybUhhbmRzaGFrZSh0Y3BTb2NrZXQsIGh0dHBSZXF1ZXN0RGF0YSkge1xuICB2YXIgaHR0cEhlYWRlcnMgPSBnZXRIdHRwSGVhZGVycyhcbiAgICBXZWJTb2NrZXRVdGlscy5hcnJheVRvU3RyaW5nKGh0dHBSZXF1ZXN0RGF0YSkuc3BsaXQoQ1JMRiArIENSTEYpWzBdXG4gICk7XG5cbiAgdmFyIGtleSA9IFdlYlNvY2tldFV0aWxzLnN0cmluZ1RvQXJyYXkoXG4gICAgaHR0cEhlYWRlcnMuZ2V0KCdTZWMtV2ViU29ja2V0LUtleScpICsgV0VCU09DS0VUX0tFWV9HVUlEXG4gICk7XG5cbiAgdmFyIHN1YnRsZSA9IHdpbmRvdy5jcnlwdG8uc3VidGxlO1xuICByZXR1cm4gc3VidGxlLmRpZ2VzdCh7IG5hbWU6ICdTSEEtMScgfSwga2V5KS50aGVuKChoYXNoQXJyYXlCdWZmZXIpID0+IHtcbiAgICB2YXIgd2ViU29ja2V0S2V5ID0gYnRvYShXZWJTb2NrZXRVdGlscy5hcnJheVRvU3RyaW5nKFxuICAgICAgbmV3IFVpbnQ4QXJyYXkoaGFzaEFycmF5QnVmZmVyKVxuICAgICkpO1xuICAgIHZhciBhcnJheVJlc3BvbnNlID0gV2ViU29ja2V0VXRpbHMuc3RyaW5nVG9BcnJheShcbiAgICAgIFdFQlNPQ0tFVF9IQU5EU0hBS0VfUkVTUE9OU0UucmVwbGFjZSgne3dlYi1zb2NrZXQta2V5fScsIHdlYlNvY2tldEtleSlcbiAgICApO1xuXG4gICAgdGNwU29ja2V0LnNlbmQoYXJyYXlSZXNwb25zZS5idWZmZXIsIDAsIGFycmF5UmVzcG9uc2UuYnl0ZUxlbmd0aCk7XG5cbiAgICByZXR1cm4gaHR0cEhlYWRlcnM7XG4gIH0pO1xufVxuXG4vKipcbiAqIENyZWF0ZXMgb3V0Z29pbmcgd2Vic29ja2V0IG1lc3NhZ2UgZnJhbWUuXG4gKiBAcGFyYW0ge051bWJlcn0gb3BDb2RlIEZyYW1lIG9wZXJhdGlvbiBjb2RlLlxuICogQHBhcmFtIHtVaW50OEFycmF5fSBkYXRhIERhdGEgYXJyYXkuXG4gKiBAcGFyYW0ge0Jvb2xlYW59IGlzQ29tcGxldGUgSW5kaWNhdGVzIGlmIGZyYW1lIGlzIGNvbXBsZXRlZC5cbiAqIEBwYXJhbSB7Qm9vbGVhbn0gaXNNYXNrZWQgSW5kaWNhdGVzIGlmIGZyYW1lIGRhdGEgc2hvdWxkIGJlIG1hc2tlZC5cbiAqIEByZXR1cm5zIHtVaW50OEFycmF5fSBDb25zdHJ1Y3RlZCBmcmFtZSBkYXRhLlxuICovXG5mdW5jdGlvbiBjcmVhdGVNZXNzYWdlRnJhbWUob3BDb2RlLCBkYXRhLCBpc0NvbXBsZXRlLCBpc01hc2tlZCkge1xuICB2YXIgZGF0YUxlbmd0aCA9IChkYXRhICYmIGRhdGEubGVuZ3RoKSB8fCAwO1xuICB2YXIgZGF0YU9mZnNldCA9IGlzTWFza2VkID8gNiA6IDI7XG5cbiAgdmFyIHNlY29uZEJ5dGUgPSAwO1xuICBpZiAoZGF0YUxlbmd0aCA+PSA2NTUzNikge1xuICAgIGRhdGFPZmZzZXQgKz0gODtcbiAgICBzZWNvbmRCeXRlID0gMTI3O1xuICB9IGVsc2UgaWYgKGRhdGFMZW5ndGggPiAxMjUpIHtcbiAgICBkYXRhT2Zmc2V0ICs9IDI7XG4gICAgc2Vjb25kQnl0ZSA9IDEyNjtcbiAgfSBlbHNlIHtcbiAgICBzZWNvbmRCeXRlID0gZGF0YUxlbmd0aDtcbiAgfVxuXG4gIHZhciBvdXRwdXRCdWZmZXIgPSBuZXcgVWludDhBcnJheShkYXRhT2Zmc2V0ICsgZGF0YUxlbmd0aCk7XG5cbiAgLy8gV3JpdGluZyBPUENPREUsIEZJTiBhbmQgTEVOR1RIXG4gIG91dHB1dEJ1ZmZlclswXSA9IGlzQ29tcGxldGUgPyBvcENvZGUgfCAweDgwIDogb3BDb2RlO1xuICBvdXRwdXRCdWZmZXJbMV0gPSBpc01hc2tlZCA/IHNlY29uZEJ5dGUgfCAweDgwIDogc2Vjb25kQnl0ZTtcblxuICAvLyBXcml0aW5nIERBVEEgTEVOR1RIXG4gIHN3aXRjaCAoc2Vjb25kQnl0ZSkge1xuICAgIGNhc2UgMTI2OlxuICAgICAgV2ViU29ja2V0VXRpbHMud3JpdGVVSW50MTYob3V0cHV0QnVmZmVyLCBkYXRhTGVuZ3RoLCAyKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgMTI3OlxuICAgICAgV2ViU29ja2V0VXRpbHMud3JpdGVVSW50MzIob3V0cHV0QnVmZmVyLCAwLCAyKTtcbiAgICAgIFdlYlNvY2tldFV0aWxzLndyaXRlVUludDMyKG91dHB1dEJ1ZmZlciwgZGF0YUxlbmd0aCwgNik7XG4gICAgICBicmVhaztcbiAgfVxuXG4gIGlmIChpc01hc2tlZCAmJiBkYXRhTGVuZ3RoKSB7XG4gICAgdmFyIG1hc2sgPSBXZWJTb2NrZXRVdGlscy5nZW5lcmF0ZVJhbmRvbU1hc2soKTtcblxuICAgIC8vIFdyaXRpbmcgTUFTS1xuICAgIG91dHB1dEJ1ZmZlci5zZXQobWFzaywgZGF0YU9mZnNldCAtIDQpO1xuXG4gICAgV2ViU29ja2V0VXRpbHMubWFzayhtYXNrLCBkYXRhKTtcbiAgfVxuXG4gIGZvcih2YXIgaSA9IDA7IGkgPCBkYXRhTGVuZ3RoOyBpKyspIHtcbiAgICBvdXRwdXRCdWZmZXJbZGF0YU9mZnNldCArIGldID0gZGF0YVtpXTtcbiAgfVxuXG4gIHJldHVybiBvdXRwdXRCdWZmZXI7XG59XG5cbnZhciBwcml2YXRlcyA9IHtcbiAgdGNwU2VydmVyU29ja2V0OiBTeW1ib2woJ3RjcC1zb2NrZXQnKSxcbiAgb25UQ1BTZXJ2ZXJTb2NrZXRDb25uZWN0OiBTeW1ib2woJ29uVENQU2VydmVyU29ja2V0Q29ubmVjdCcpLFxuICBvblRDUFNlcnZlclNvY2tldENsb3NlOiBTeW1ib2woJ29uVENQU2VydmVyU29ja2V0Q2xvc2UnKSxcblxuICB0Y3BTb2NrZXQ6IFN5bWJvbCgndGNwU29ja2V0JyksXG4gIG9uVENQU29ja2V0RGF0YTogU3ltYm9sKCdvblRDUFNvY2tldERhdGEnKSxcbiAgb25UQ1BTb2NrZXRDbG9zZTogU3ltYm9sKCdvblRDUFNvY2tldENsb3NlJyksXG5cbiAgY2xpZW50czogU3ltYm9sKCdjbGllbnRzJyksXG4gIGZyYW1lQnVmZmVyOiBTeW1ib2woJ2ZyYW1lQnVmZmVyJyksXG5cbiAgb25NZXNzYWdlRnJhbWU6IFN5bWJvbCgnb25NZXNzYWdlRnJhbWUnKVxufTtcblxuLyoqXG4gKiBXZWJTb2NrZXRTZXJ2ZXIgY29uc3RydWN0b3IgdGhhdCBhY2NlcHRzIHBvcnQgdG8gbGlzdGVuIG9uLlxuICogQHBhcmFtIHtOdW1iZXJ9IHBvcnQgTnVtYmVyIHRvIGxpc3RlbiBmb3Igd2Vic29ja2V0IGNvbm5lY3Rpb25zLlxuICovXG5jbGFzcyBXZWJTb2NrZXRTZXJ2ZXIge1xuICBjb25zdHJ1Y3Rvcihwb3J0KSB7XG4gICAgRXZlbnREaXNwYXRjaGVyLm1peGluKHRoaXMsIFsnbWVzc2FnZScsICdzdG9wJ10pO1xuXG4gICAgdmFyIHRjcFNlcnZlclNvY2tldCA9IG5hdmlnYXRvci5tb3pUQ1BTb2NrZXQubGlzdGVuKHBvcnQsIHtcbiAgICAgIGJpbmFyeVR5cGU6ICdhcnJheWJ1ZmZlcidcbiAgICB9KTtcblxuICAgIHRoaXNbcHJpdmF0ZXMudGNwU2VydmVyU29ja2V0XSA9IHRjcFNlcnZlclNvY2tldDtcbiAgICB0aGlzW3ByaXZhdGVzLmNsaWVudHNdID0gbmV3IE1hcCgpO1xuICAgIHRoaXNbcHJpdmF0ZXMuZnJhbWVCdWZmZXJdID0gbmV3IFdlYlNvY2tldEZyYW1lQnVmZmVyKCk7XG5cbiAgICB0aGlzW3ByaXZhdGVzLm9uTWVzc2FnZUZyYW1lXSA9IHRoaXNbcHJpdmF0ZXMub25NZXNzYWdlRnJhbWVdLmJpbmQodGhpcyk7XG5cbiAgICB0Y3BTZXJ2ZXJTb2NrZXQub25jb25uZWN0ID1cbiAgICAgIHRoaXNbcHJpdmF0ZXMub25UQ1BTZXJ2ZXJTb2NrZXRDb25uZWN0XS5iaW5kKHRoaXMpO1xuICAgIHRjcFNlcnZlclNvY2tldC5vbmVycm9yID0gdGhpc1twcml2YXRlcy5vblRDUFNlcnZlclNvY2tldENsb3NlXS5iaW5kKHRoaXMpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNlbmQgZGF0YSB0byB0aGUgY29ubmVjdGVkIGNsaWVudFxuICAgKiBAcGFyYW0ge0FycmF5QnVmZmVyfEFycmF5fHN0cmluZ30gZGF0YSBEYXRhIHRvIHNlbmQuXG4gICAqL1xuICBzZW5kKGRhdGEpIHtcbiAgICBpZiAoIUFycmF5QnVmZmVyLmlzVmlldyhkYXRhKSAmJiAhKGRhdGEgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikpIHtcbiAgICAgIGlmICh0eXBlb2YgZGF0YSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgZGF0YSA9IG5ldyBVaW50OEFycmF5KFdlYlNvY2tldFV0aWxzLnN0cmluZ1RvQXJyYXkoZGF0YSkpO1xuICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgICAgIGRhdGEgPSBuZXcgVWludDhBcnJheShkYXRhKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVW5zdXBwb3J0ZWQgZGF0YSB0eXBlOiAnICsgdHlwZW9mIGRhdGEpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBkYXRhRnJhbWUgPSBjcmVhdGVNZXNzYWdlRnJhbWUoMHgyLCBkYXRhLCB0cnVlLCBmYWxzZSk7XG5cbiAgICB0aGlzW3ByaXZhdGVzLnRjcFNvY2tldF0uc2VuZChkYXRhRnJhbWUuYnVmZmVyLCAwLCBkYXRhRnJhbWUubGVuZ3RoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBEZXN0cm95cyBzb2NrZXQgY29ubmVjdGlvbi5cbiAgICovXG4gIHN0b3AoKSB7XG4gICAgdmFyIHRjcFNvY2tldCA9IHRoaXNbcHJpdmF0ZXMudGNwU29ja2V0XTtcbiAgICBpZiAodGNwU29ja2V0KSB7XG4gICAgICB0Y3BTb2NrZXQuY2xvc2UoKTtcbiAgICAgIHRoaXNbcHJpdmF0ZXMub25UQ1BTb2NrZXRDbG9zZV0oKTtcbiAgICB9XG5cbiAgICB2YXIgdGNwU2VydmVyU29ja2V0ID0gdGhpc1twcml2YXRlcy50Y3BTZXJ2ZXJTb2NrZXRdO1xuICAgIGlmICh0Y3BTZXJ2ZXJTb2NrZXQpIHtcbiAgICAgIHRjcFNlcnZlclNvY2tldC5jbG9zZSgpO1xuICAgICAgdGhpc1twcml2YXRlcy5vblRDUFNlcnZlclNvY2tldENsb3NlXSgpO1xuICAgIH1cblxuICAgIHRoaXNbcHJpdmF0ZXMuY2xpZW50c10uY2xlYXIoKTtcbiAgfVxuXG4gIFtwcml2YXRlcy5vblRDUFNlcnZlclNvY2tldENvbm5lY3RdKHRjcFNvY2tldCkge1xuICAgIHRoaXNbcHJpdmF0ZXMudGNwU29ja2V0XSA9IHRjcFNvY2tldDtcblxuICAgIHRoaXNbcHJpdmF0ZXMuZnJhbWVCdWZmZXJdLm9uKCdmcmFtZScsIHRoaXNbcHJpdmF0ZXMub25NZXNzYWdlRnJhbWVdKTtcblxuICAgIHRjcFNvY2tldC5vbmRhdGEgPSB0aGlzW3ByaXZhdGVzLm9uVENQU29ja2V0RGF0YV0uYmluZCh0aGlzKTtcbiAgICB0Y3BTb2NrZXQub25jbG9zZSA9IHRjcFNvY2tldC5vbmVycm9yID1cbiAgICAgIHRoaXNbcHJpdmF0ZXMub25UQ1BTb2NrZXRDbG9zZV0uYmluZCh0aGlzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBNb3pUY3BTb2NrZXQgZGF0YSBoYW5kbGVyLlxuICAgKiBAcGFyYW0ge1RDUFNvY2tldEV2ZW50fSBzb2NrZXRFdmVudCBUQ1BTb2NrZXQgZGF0YSBldmVudC5cbiAgICovXG4gIFtwcml2YXRlcy5vblRDUFNvY2tldERhdGFdKHNvY2tldEV2ZW50KSB7XG4gICAgdmFyIGNsaWVudHMgPSB0aGlzW3ByaXZhdGVzLmNsaWVudHNdO1xuICAgIHZhciB0Y3BTb2NrZXQgPSB0aGlzW3ByaXZhdGVzLnRjcFNvY2tldF07XG5cbiAgICB2YXIgZnJhbWVEYXRhID0gbmV3IFVpbnQ4QXJyYXkoc29ja2V0RXZlbnQuZGF0YSk7XG5cbiAgICAvLyBJZiB3ZSBkb24ndCBoYXZlIGNvbm5lY3Rpb24gaW5mbyBmcm9tIHRoaXMgaG9zdCBsZXQncyBwZXJmb3JtIGhhbmRzaGFrZVxuICAgIC8vIEN1cnJlbnRseSB3ZSBzdXBwb3J0IG9ubHkgT05FIGNsaWVudCBmcm9tIGhvc3QuXG4gICAgaWYgKCFjbGllbnRzLmhhcyh0Y3BTb2NrZXQuaG9zdCkpIHtcbiAgICAgIHBlcmZvcm1IYW5kc2hha2UodGNwU29ja2V0LCBmcmFtZURhdGEpLnRoZW4oKGhhbmRzaGFrZVJlc3VsdCkgPT4ge1xuICAgICAgICBpZiAoaGFuZHNoYWtlUmVzdWx0KSB7XG4gICAgICAgICAgY2xpZW50cy5zZXQodGNwU29ja2V0Lmhvc3QsIGhhbmRzaGFrZVJlc3VsdCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXNbcHJpdmF0ZXMuZnJhbWVCdWZmZXJdLnB1dChmcmFtZURhdGEpO1xuICB9XG5cbiAgLyoqXG4gICAqIFByb2Nlc3MgV2ViU29ja2V0IGluY29taW5nIGZyYW1lLlxuICAgKiBAcGFyYW0ge1VpbnQ4QXJyYXl9IGZyYW1lIE1lc3NhZ2UgZnJhbWUgZGF0YSBpbiB2aWV3IG9mIFVpbnQ4QXJyYXkuXG4gICAqL1xuICBbcHJpdmF0ZXMub25NZXNzYWdlRnJhbWVdKGZyYW1lKSB7XG4gICAgdmFyIGJ1ZmZlciA9IHRoaXNbcHJpdmF0ZXMuZnJhbWVCdWZmZXJdO1xuXG4gICAgYnVmZmVyLmdldCgyKS50aGVuKChjb250cm9sRGF0YSkgPT4ge1xuICAgICAgdmFyIHN0YXRlID0ge1xuICAgICAgICBpc0NvbXBsZXRlZDogKGNvbnRyb2xEYXRhWzBdICYgMHg4MCkgPT09IDB4ODAsXG4gICAgICAgIGlzTWFza2VkOiAoY29udHJvbERhdGFbMV0gJiAweDgwKSA9PT0gMHg4MCxcbiAgICAgICAgaXNDb21wcmVzc2VkOiAoY29udHJvbERhdGFbMF0gJiAweDQwKSA9PT0gMHg0MCxcbiAgICAgICAgb3BDb2RlOiBjb250cm9sRGF0YVswXSAmIDB4ZixcbiAgICAgICAgZGF0YUxlbmd0aDogY29udHJvbERhdGFbMV0gJiAweDdmLFxuICAgICAgICBtYXNrOiBudWxsLFxuICAgICAgICBkYXRhOiBbXVxuICAgICAgfTtcblxuICAgICAgaWYgKHN0YXRlLm9wQ29kZSA9PT0gT3BlcmF0aW9uQ29kZS5DT05USU5VQVRJT05fRlJBTUUpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDb250aW51YXRpb24gZnJhbWUgaXMgbm90IHlldCBzdXBwb3J0ZWQhJyk7XG4gICAgICB9XG5cbiAgICAgIGlmIChzdGF0ZS5vcENvZGUgPT09IE9wZXJhdGlvbkNvZGUuUElORykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BpbmcgZnJhbWUgaXMgbm90IHlldCBzdXBwb3J0ZWQhJyk7XG4gICAgICB9XG5cbiAgICAgIGlmIChzdGF0ZS5vcENvZGUgPT09IE9wZXJhdGlvbkNvZGUuUE9ORykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BvbmcgZnJhbWUgaXMgbm90IHlldCBzdXBwb3J0ZWQhJyk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBzdGF0ZTtcbiAgICB9KS50aGVuKChzdGF0ZSkgPT4ge1xuICAgICAgdmFyIGRhdGFMZW5ndGhQcm9taXNlO1xuICAgICAgaWYgKHN0YXRlLmRhdGFMZW5ndGggPT09IDEyNikge1xuICAgICAgICBkYXRhTGVuZ3RoUHJvbWlzZSA9IGJ1ZmZlci5nZXQoMikudGhlbihcbiAgICAgICAgICAoZGF0YSkgPT4gV2ViU29ja2V0VXRpbHMucmVhZFVJbnQxNihkYXRhKVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChzdGF0ZS5kYXRhTGVuZ3RoID09IDEyNykge1xuICAgICAgICBkYXRhTGVuZ3RoUHJvbWlzZSA9IGJ1ZmZlci5nZXQoNCkudGhlbihcbiAgICAgICAgICAoZGF0YSkgPT4gV2ViU29ja2V0VXRpbHMucmVhZFVJbnQzMihkYXRhKVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGF0YUxlbmd0aFByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoc3RhdGUuZGF0YUxlbmd0aCk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBkYXRhTGVuZ3RoUHJvbWlzZS50aGVuKChkYXRhTGVuZ3RoKSA9PiB7XG4gICAgICAgIHN0YXRlLmRhdGFMZW5ndGggPSBkYXRhTGVuZ3RoO1xuICAgICAgICByZXR1cm4gc3RhdGU7XG4gICAgICB9KTtcbiAgICB9KS50aGVuKChzdGF0ZSkgPT4ge1xuICAgICAgaWYgKHN0YXRlLmlzTWFza2VkKSB7XG4gICAgICAgIHJldHVybiBidWZmZXIuZ2V0KDQpLnRoZW4oKG1hc2spID0+IHtcbiAgICAgICAgICBzdGF0ZS5tYXNrID0gbWFzaztcbiAgICAgICAgICByZXR1cm4gc3RhdGU7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN0YXRlO1xuICAgIH0pLnRoZW4oKHN0YXRlKSA9PiB7XG4gICAgICByZXR1cm4gc3RhdGUuZGF0YUxlbmd0aCA/IGJ1ZmZlci5nZXQoc3RhdGUuZGF0YUxlbmd0aCkudGhlbigoZGF0YSkgPT4ge1xuICAgICAgICBzdGF0ZS5kYXRhID0gV2ViU29ja2V0VXRpbHMubWFzayhzdGF0ZS5tYXNrLCBkYXRhKTtcbiAgICAgICAgcmV0dXJuIHN0YXRlO1xuICAgICAgfSkgOiBzdGF0ZTtcbiAgICB9KS50aGVuKChzdGF0ZSkgPT4ge1xuICAgICAgaWYgKHN0YXRlLm9wQ29kZSA9PT0gT3BlcmF0aW9uQ29kZS5DT05ORUNUSU9OX0NMT1NFKSB7XG4gICAgICAgIHZhciBjb2RlID0gMDtcbiAgICAgICAgdmFyIHJlYXNvbiA9ICdVbmtub3duJztcblxuICAgICAgICBpZiAoc3RhdGUuZGF0YUxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjb2RlID0gIFdlYlNvY2tldFV0aWxzLnJlYWRVSW50MTYoc3RhdGUuZGF0YSk7XG4gICAgICAgICAgaWYgKHN0YXRlLmRhdGFMZW5ndGggPiAyKSB7XG4gICAgICAgICAgICByZWFzb24gPSBXZWJTb2NrZXRVdGlscy5hcnJheVRvU3RyaW5nKHN0YXRlLmRhdGEuc3ViYXJyYXkoMikpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnNvbGUubG9nKCdTb2NrZXQgaXMgY2xvc2VkOiAnICsgY29kZSArICcgJyArIHJlYXNvbik7XG5cbiAgICAgICAgdmFyIGRhdGFGcmFtZSA9IGNyZWF0ZU1lc3NhZ2VGcmFtZSgweDgsIHN0YXRlLmRhdGEsIHRydWUpO1xuICAgICAgICB0aGlzW3ByaXZhdGVzLnRjcFNvY2tldF0uc2VuZChkYXRhRnJhbWUuYnVmZmVyLCAwLCBkYXRhRnJhbWUubGVuZ3RoKTtcbiAgICAgICAgdGhpc1twcml2YXRlcy5vblRDUFNvY2tldENsb3NlXSgpO1xuICAgICAgfSBlbHNlIGlmIChzdGF0ZS5vcENvZGUgPT09IE9wZXJhdGlvbkNvZGUuVEVYVF9GUkFNRSB8fFxuICAgICAgICAgICAgICAgICBzdGF0ZS5vcENvZGUgPT09IE9wZXJhdGlvbkNvZGUuQklOQVJZX0ZSQU1FKSB7XG4gICAgICAgIHRoaXMuZW1pdCgnbWVzc2FnZScsIHN0YXRlLmRhdGEpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIWJ1ZmZlci5pc0VtcHR5KCkpIHtcbiAgICAgICAgdGhpc1twcml2YXRlcy5vbk1lc3NhZ2VGcmFtZV0oKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIFtwcml2YXRlcy5vblRDUFNvY2tldENsb3NlXSgpIHtcbiAgICB2YXIgdGNwU29ja2V0ID0gdGhpc1twcml2YXRlcy50Y3BTb2NrZXRdO1xuXG4gICAgaWYgKCF0Y3BTb2NrZXQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzW3ByaXZhdGVzLmNsaWVudHNdLmRlbGV0ZSh0Y3BTb2NrZXQuaG9zdCk7XG5cbiAgICB0Y3BTb2NrZXQub25kYXRhID0gdGNwU29ja2V0Lm9uZXJyb3IgPSB0Y3BTb2NrZXQub25jbG9zZSA9IG51bGw7XG5cbiAgICB0aGlzW3ByaXZhdGVzLnRjcFNvY2tldF0gPSBudWxsO1xuICB9XG5cbiAgW3ByaXZhdGVzLm9uVENQU2VydmVyU29ja2V0Q2xvc2VdKCkge1xuICAgIHZhciB0Y3BTZXJ2ZXJTb2NrZXQgPSB0aGlzW3ByaXZhdGVzLnRjcFNlcnZlclNvY2tldF07XG5cbiAgICBpZiAoIXRjcFNlcnZlclNvY2tldCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRjcFNlcnZlclNvY2tldC5vbmNvbm5lY3QgPSB0Y3BTZXJ2ZXJTb2NrZXQub25lcnJvciA9IG51bGw7XG5cbiAgICB0aGlzW3ByaXZhdGVzLnRjcFNlcnZlclNvY2tldF0gPSBudWxsO1xuXG4gICAgdGhpcy5lbWl0KCdzdG9wJyk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQge1xuICBTZXJ2ZXI6IFdlYlNvY2tldFNlcnZlcixcbiAgVXRpbHM6IFdlYlNvY2tldFV0aWxzLFxuICBGcmFtZUJ1ZmZlcjogV2ViU29ja2V0RnJhbWVCdWZmZXJcbn07XG4iLG51bGwsImltcG9ydCBFdmVudERpc3BhdGNoZXIgZnJvbSAnZXZlbnQtZGlzcGF0Y2hlci1qcyc7XG5cbnZhciBwcml2YXRlcyA9IHtcbiAgZGF0YTogU3ltYm9sKCdkYXRhJyksXG4gIHBlbmRpbmdEYXRhUmVxdWVzdDogU3ltYm9sKCdwZW5kaW5nRGF0YVJlcXVlc3QnKSxcbiAgc3BsaWNlOiBTeW1ib2woJ3NwbGljZScpXG59O1xuXG5jbGFzcyBXZWJTb2NrZXRGcmFtZUJ1ZmZlciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIEV2ZW50RGlzcGF0Y2hlci5taXhpbih0aGlzLCBbJ2ZyYW1lJywgJ2RhdGEnXSk7XG5cbiAgICB0aGlzW3ByaXZhdGVzLmRhdGFdID0gbmV3IFVpbnQ4QXJyYXkoMCk7XG4gICAgdGhpc1twcml2YXRlcy5wZW5kaW5nRGF0YVJlcXVlc3RdID0gbnVsbDtcbiAgICB0aGlzW3ByaXZhdGVzLnNwbGljZV0gPSBmdW5jdGlvbihsZW5ndGgpIHtcbiAgICAgIHZhciBkYXRhID0gdGhpc1twcml2YXRlcy5kYXRhXTtcblxuICAgICAgdmFyIHNwbGljZWREYXRhID0gZGF0YS5zdWJhcnJheSgwLCBsZW5ndGgpO1xuICAgICAgdGhpc1twcml2YXRlcy5kYXRhXSA9IGRhdGEuc3ViYXJyYXkobGVuZ3RoLCBkYXRhLmxlbmd0aCk7XG5cbiAgICAgIHJldHVybiBzcGxpY2VkRGF0YTtcbiAgICB9O1xuICB9XG5cbiAgcHV0KGRhdGFUb1B1dCkge1xuICAgIHZhciBkYXRhID0gdGhpc1twcml2YXRlcy5kYXRhXTtcblxuICAgIHZhciBuZXdEYXRhID0gbmV3IFVpbnQ4QXJyYXkoZGF0YS5sZW5ndGggKyBkYXRhVG9QdXQubGVuZ3RoKTtcbiAgICBuZXdEYXRhLnNldChkYXRhKTtcbiAgICBuZXdEYXRhLnNldChkYXRhVG9QdXQsIGRhdGEubGVuZ3RoKTtcbiAgICB0aGlzW3ByaXZhdGVzLmRhdGFdID0gbmV3RGF0YTtcblxuICAgIHRoaXMuZW1pdCgnZGF0YScpO1xuXG4gICAgLy8gSWYgbm8gb25lIHdhaXRpbmcgZm9yIGRhdGEsIGxldCdzIHNpZ25hbCB0aGF0IHdlIGhhdmUgbmV3IGZyYW1lIVxuICAgIGlmICghdGhpc1twcml2YXRlcy5wZW5kaW5nRGF0YVJlcXVlc3RdKSB7XG4gICAgICB0aGlzLmVtaXQoJ2ZyYW1lJyk7XG4gICAgfVxuICB9XG5cbiAgZ2V0KGRhdGFMZW5ndGgpIHtcbiAgICBpZiAodGhpc1twcml2YXRlcy5wZW5kaW5nRGF0YVJlcXVlc3RdKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvbmN1cnJlbnQgcmVhZCBpcyBub3QgYWxsb3dlZC4nKTtcbiAgICB9XG5cbiAgICB0aGlzW3ByaXZhdGVzLnBlbmRpbmdEYXRhUmVxdWVzdF0gPSBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgdmFyIGRhdGEgPSB0aGlzW3ByaXZhdGVzLmRhdGFdO1xuICAgICAgaWYgKGRhdGEubGVuZ3RoID49IGRhdGFMZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUodGhpc1twcml2YXRlcy5zcGxpY2VdKGRhdGFMZW5ndGgpKTtcbiAgICAgIH1cblxuICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgdGhpcy5vbignZGF0YScsIGZ1bmN0aW9uIG9uRGF0YSgpIHtcbiAgICAgICAgaWYgKGRhdGEubGVuZ3RoIDwgZGF0YUxlbmd0aCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHNlbGYub2ZmKCdkYXRhJywgb25EYXRhKTtcbiAgICAgICAgcmVzb2x2ZSh0aGlzW3ByaXZhdGVzLnNwbGljZV0oZGF0YUxlbmd0aCkpO1xuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gdGhpc1twcml2YXRlcy5wZW5kaW5nRGF0YVJlcXVlc3RdLnRoZW4oKGRhdGEpID0+IHtcbiAgICAgIHRoaXNbcHJpdmF0ZXMucGVuZGluZ0RhdGFSZXF1ZXN0XSA9IG51bGw7XG4gICAgICByZXR1cm4gZGF0YTtcbiAgICB9KTtcbiAgfVxuXG4gIGlzRW1wdHkoKSB7XG4gICAgcmV0dXJuIHRoaXNbcHJpdmF0ZXMuZGF0YV0ubGVuZ3RoID09PSAwO1xuICB9O1xufVxuXG5leHBvcnQgZGVmYXVsdCBXZWJTb2NrZXRGcmFtZUJ1ZmZlcjtcbiIsInZhciBXZWJTb2NrZXRVdGlscyA9IHtcbiAgLyoqXG4gICAqIE1hc2sgZXZlcnkgZGF0YSBlbGVtZW50IHdpdGggdGhlIG1hc2sgKFdlYlNvY2tldCBzcGVjaWZpYyBhbGdvcml0aG0pLlxuICAgKiBAcGFyYW0ge0FycmF5fSBtYXNrIE1hc2sgYXJyYXkuXG4gICAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IERhdGEgYXJyYXkgdG8gbWFzay5cbiAgICogQHJldHVybnMge0FycmF5fSBNYXNrZWQgZGF0YSBhcnJheS5cbiAgICovXG4gIG1hc2sobWFzaywgYXJyYXkpIHtcbiAgICBpZiAobWFzaykge1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7IGkrKykge1xuICAgICAgICBhcnJheVtpXSA9IGFycmF5W2ldIF4gbWFza1tpICUgNF07XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBhcnJheTtcbiAgfSxcblxuICAvKipcbiAgICogR2VuZXJhdGVzIDQtaXRlbSBhcnJheSwgZXZlcnkgaXRlbSBvZiB3aGljaCBpcyBlbGVtZW50IG9mIGJ5dGUgbWFzay5cbiAgICogQHJldHVybnMge1VpbnQ4QXJyYXl9XG4gICAqL1xuICBnZW5lcmF0ZVJhbmRvbU1hc2soKSB7XG4gICAgdmFyIHJhbmRvbSA9IG5ldyBVaW50OEFycmF5KDQpO1xuXG4gICAgd2luZG93LmNyeXB0by5nZXRSYW5kb21WYWx1ZXMocmFuZG9tKTtcblxuICAgIHJldHVybiByYW5kb207XG4gIH0sXG5cbiAgLyoqXG4gICAqIENvbnZlcnRzIHN0cmluZyB0byBVaW50OEFycmF5LlxuICAgKiBAcGFyYW0ge3N0cmluZ30gc3RyaW5nVmFsdWUgU3RyaW5nIHZhbHVlIHRvIGNvbnZlcnQuXG4gICAqIEByZXR1cm5zIHtVaW50OEFycmF5fVxuICAgKi9cbiAgc3RyaW5nVG9BcnJheShzdHJpbmdWYWx1ZSkge1xuICAgIGlmICh0eXBlb2Ygc3RyaW5nVmFsdWUgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3N0cmluZ1ZhbHVlIHNob3VsZCBiZSB2YWxpZCBzdHJpbmchJyk7XG4gICAgfVxuXG4gICAgdmFyIGFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoc3RyaW5nVmFsdWUubGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHN0cmluZ1ZhbHVlLmxlbmd0aDsgaSsrKSB7XG4gICAgICBhcnJheVtpXSA9IHN0cmluZ1ZhbHVlLmNoYXJDb2RlQXQoaSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGFycmF5O1xuICB9LFxuXG4gIC8qKlxuICAgKiBDb252ZXJ0cyBhcnJheSB0byBzdHJpbmcuIEV2ZXJ5IGFycmF5IGVsZW1lbnQgaXMgY29uc2lkZXJlZCBhcyBjaGFyIGNvZGUuXG4gICAqIEBwYXJhbSB7VWludDhBcnJheX0gYXJyYXkgQXJyYXkgd2l0aCB0aGUgY2hhciBjb2Rlcy5cbiAgICogQHJldHVybnMge3N0cmluZ31cbiAgICovXG4gIGFycmF5VG9TdHJpbmcoYXJyYXkpIHtcbiAgICByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBhcnJheSk7XG4gIH0sXG5cbiAgLyoqXG4gICAqIFJlYWRzIHVuc2lnbmVkIDE2IGJpdCB2YWx1ZSBmcm9tIHR3byBjb25zZXF1ZW50IDgtYml0IGFycmF5IGVsZW1lbnRzLlxuICAgKiBAcGFyYW0ge1VpbnQ4QXJyYXl9IGFycmF5IEFycmF5IHRvIHJlYWQgZnJvbS5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9mZnNldCBJbmRleCB0byBzdGFydCByZWFkIHZhbHVlLlxuICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgKi9cbiAgcmVhZFVJbnQxNihhcnJheSwgb2Zmc2V0KSB7XG4gICAgb2Zmc2V0ID0gb2Zmc2V0IHx8IDA7XG4gICAgcmV0dXJuIChhcnJheVtvZmZzZXRdIDw8IDgpICsgYXJyYXlbb2Zmc2V0ICsgMV07XG4gIH0sXG5cbiAgLyoqXG4gICAqIFJlYWRzIHVuc2lnbmVkIDMyIGJpdCB2YWx1ZSBmcm9tIGZvdXIgY29uc2VxdWVudCA4LWJpdCBhcnJheSBlbGVtZW50cy5cbiAgICogQHBhcmFtIHtVaW50OEFycmF5fSBhcnJheSBBcnJheSB0byByZWFkIGZyb20uXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBvZmZzZXQgSW5kZXggdG8gc3RhcnQgcmVhZCB2YWx1ZS5cbiAgICogQHJldHVybnMge051bWJlcn1cbiAgICovXG4gIHJlYWRVSW50MzIoYXJyYXksIG9mZnNldCkge1xuICAgIG9mZnNldCA9IG9mZnNldCB8fCAwO1xuICAgIHJldHVybiAoYXJyYXlbb2Zmc2V0XSA8PCAyNCkgK1xuICAgICAgKGFycmF5W29mZnNldCArIDFdIDw8IDE2KSArXG4gICAgICAoYXJyYXkgW29mZnNldCArIDJdIDw8IDgpICtcbiAgICAgIGFycmF5W29mZnNldCArIDNdO1xuICB9LFxuXG4gIC8qKlxuICAgKiBXcml0ZXMgdW5zaWduZWQgMTYgYml0IHZhbHVlIHRvIHR3byBjb25zZXF1ZW50IDgtYml0IGFycmF5IGVsZW1lbnRzLlxuICAgKiBAcGFyYW0ge1VpbnQ4QXJyYXl9IGFycmF5IEFycmF5IHRvIHdyaXRlIHRvLlxuICAgKiBAcGFyYW0ge051bWJlcn0gdmFsdWUgMTYgYml0IHVuc2lnbmVkIHZhbHVlIHRvIHdyaXRlIGludG8gYXJyYXkuXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBvZmZzZXQgSW5kZXggdG8gc3RhcnQgd3JpdGUgdmFsdWUuXG4gICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAqL1xuICB3cml0ZVVJbnQxNihhcnJheSwgdmFsdWUsIG9mZnNldCkge1xuICAgIGFycmF5W29mZnNldF0gPSAodmFsdWUgJiAweGZmMDApID4+IDg7XG4gICAgYXJyYXlbb2Zmc2V0ICsgMV0gPSB2YWx1ZSAmIDB4ZmY7XG4gIH0sXG5cbiAgLyoqXG4gICAqIFdyaXRlcyB1bnNpZ25lZCAxNiBiaXQgdmFsdWUgdG8gdHdvIGNvbnNlcXVlbnQgOC1iaXQgYXJyYXkgZWxlbWVudHMuXG4gICAqIEBwYXJhbSB7VWludDhBcnJheX0gYXJyYXkgQXJyYXkgdG8gd3JpdGUgdG8uXG4gICAqIEBwYXJhbSB7TnVtYmVyfSB2YWx1ZSAxNiBiaXQgdW5zaWduZWQgdmFsdWUgdG8gd3JpdGUgaW50byBhcnJheS5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9mZnNldCBJbmRleCB0byBzdGFydCB3cml0ZSB2YWx1ZS5cbiAgICogQHJldHVybnMge051bWJlcn1cbiAgICovXG4gIHdyaXRlVUludDMyKGFycmF5LCB2YWx1ZSwgb2Zmc2V0KSB7XG4gICAgYXJyYXlbb2Zmc2V0XSA9ICh2YWx1ZSAmIDB4ZmYwMDAwMDApID4+IDI0O1xuICAgIGFycmF5W29mZnNldCArIDFdID0gKHZhbHVlICYgMHhmZjAwMDApID4+IDE2O1xuICAgIGFycmF5W29mZnNldCArIDJdID0gKHZhbHVlICYgMHhmZjAwKSA+PiA4O1xuICAgIGFycmF5W29mZnNldCArIDNdID0gdmFsdWUgJiAweGZmO1xuICB9XG59O1xuXG5leHBvcnQgZGVmYXVsdCBXZWJTb2NrZXRVdGlscztcbiJdfQ==
