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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvbWVkaWEvYXphc3lwa2luL3Byb2plY3RzL2dpdGh1Yi9meG9zLXdlYnNvY2tldC1zZXJ2ZXIvc3JjL3NlcnZlci5lczYuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9saWIvX2VtcHR5LmpzIiwiL21lZGlhL2F6YXN5cGtpbi9wcm9qZWN0cy9naXRodWIvZnhvcy13ZWJzb2NrZXQtc2VydmVyL3NyYy9mcmFtZS1idWZmZXIuZXM2LmpzIiwiL21lZGlhL2F6YXN5cGtpbi9wcm9qZWN0cy9naXRodWIvZnhvcy13ZWJzb2NrZXQtc2VydmVyL3NyYy91dGlscy5lczYuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7Ozs7Ozs7Ozs7K0JDQTRCLGlCQUFpQjs7Ozs4QkFDWixvQkFBb0I7Ozs7d0JBQzFCLGFBQWE7Ozs7Ozs7O0FBTXhDLElBQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQzs7Ozs7OztBQU9wQixJQUFNLGtCQUFrQixHQUFHLHNDQUFzQyxDQUFDOzs7Ozs7O0FBT2xFLElBQU0sNEJBQTRCLEdBQ2hDLGtDQUFrQyxHQUFHLElBQUksR0FDekMscUJBQXFCLEdBQUcsSUFBSSxHQUM1QixvQkFBb0IsR0FBRyxJQUFJLEdBQzNCLHdDQUF3QyxHQUFHLElBQUksR0FBRyxJQUFJLENBQUM7Ozs7OztBQU16RCxJQUFNLGFBQWEsR0FBRztBQUNwQixvQkFBa0IsRUFBRSxDQUFDO0FBQ3JCLFlBQVUsRUFBRSxDQUFDO0FBQ2IsY0FBWSxFQUFFLENBQUM7QUFDZixrQkFBZ0IsRUFBRSxDQUFDO0FBQ25CLE1BQUksRUFBRSxDQUFDO0FBQ1AsTUFBSSxFQUFFLEVBQUU7Q0FDVCxDQUFDOzs7Ozs7O0FBT0YsU0FBUyxjQUFjLENBQUMsZ0JBQWdCLEVBQUU7QUFDeEMsTUFBSSxXQUFXLEdBQUcsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3RELFNBQU8sSUFBSSxHQUFHLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFDLFVBQVUsRUFBSztBQUM3QyxXQUFPLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLFVBQUMsTUFBTTthQUFLLE1BQU0sQ0FBQyxJQUFJLEVBQUU7S0FBQSxDQUFDLENBQUM7R0FDN0QsQ0FBQyxDQUFDLENBQUM7Q0FDTDs7Ozs7Ozs7QUFRRCxTQUFTLGdCQUFnQixDQUFDLFNBQVMsRUFBRSxlQUFlLEVBQUU7QUFDcEQsTUFBSSxXQUFXLEdBQUcsY0FBYyxDQUM5QixzQkFBZSxhQUFhLENBQUMsZUFBZSxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FDcEUsQ0FBQzs7QUFFRixNQUFJLEdBQUcsR0FBRyxzQkFBZSxhQUFhLENBQ3BDLFdBQVcsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsR0FBRyxrQkFBa0IsQ0FDMUQsQ0FBQzs7QUFFRixNQUFJLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQztBQUNsQyxTQUFPLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLEVBQUUsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQUMsZUFBZSxFQUFLO0FBQ3JFLFFBQUksWUFBWSxHQUFHLElBQUksQ0FBQyxzQkFBZSxhQUFhLENBQ2xELElBQUksVUFBVSxDQUFDLGVBQWUsQ0FBQyxDQUNoQyxDQUFDLENBQUM7QUFDSCxRQUFJLGFBQWEsR0FBRyxzQkFBZSxhQUFhLENBQzlDLDRCQUE0QixDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxZQUFZLENBQUMsQ0FDdkUsQ0FBQzs7QUFFRixhQUFTLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQzs7QUFFbEUsV0FBTyxXQUFXLENBQUM7R0FDcEIsQ0FBQyxDQUFDO0NBQ0o7Ozs7Ozs7Ozs7QUFVRCxTQUFTLGtCQUFrQixDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRTtBQUM5RCxNQUFJLFVBQVUsR0FBRyxBQUFDLElBQUksSUFBSSxJQUFJLENBQUMsTUFBTSxJQUFLLENBQUMsQ0FBQztBQUM1QyxNQUFJLFVBQVUsR0FBRyxRQUFRLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQzs7QUFFbEMsTUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQ25CLE1BQUksVUFBVSxJQUFJLEtBQUssRUFBRTtBQUN2QixjQUFVLElBQUksQ0FBQyxDQUFDO0FBQ2hCLGNBQVUsR0FBRyxHQUFHLENBQUM7R0FDbEIsTUFBTSxJQUFJLFVBQVUsR0FBRyxHQUFHLEVBQUU7QUFDM0IsY0FBVSxJQUFJLENBQUMsQ0FBQztBQUNoQixjQUFVLEdBQUcsR0FBRyxDQUFDO0dBQ2xCLE1BQU07QUFDTCxjQUFVLEdBQUcsVUFBVSxDQUFDO0dBQ3pCOztBQUVELE1BQUksWUFBWSxHQUFHLElBQUksVUFBVSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUMsQ0FBQzs7O0FBRzNELGNBQVksQ0FBQyxDQUFDLENBQUMsR0FBRyxVQUFVLEdBQUcsTUFBTSxHQUFHLEdBQUksR0FBRyxNQUFNLENBQUM7QUFDdEQsY0FBWSxDQUFDLENBQUMsQ0FBQyxHQUFHLFFBQVEsR0FBRyxVQUFVLEdBQUcsR0FBSSxHQUFHLFVBQVUsQ0FBQzs7O0FBRzVELFVBQVEsVUFBVTtBQUNoQixTQUFLLEdBQUc7QUFDTiw0QkFBZSxXQUFXLENBQUMsWUFBWSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUN4RCxZQUFNO0FBQUEsQUFDUixTQUFLLEdBQUc7QUFDTiw0QkFBZSxXQUFXLENBQUMsWUFBWSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUMvQyw0QkFBZSxXQUFXLENBQUMsWUFBWSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUN4RCxZQUFNO0FBQUEsR0FDVDs7QUFFRCxNQUFJLFFBQVEsSUFBSSxVQUFVLEVBQUU7QUFDMUIsUUFBSSxJQUFJLEdBQUcsc0JBQWUsa0JBQWtCLEVBQUUsQ0FBQzs7O0FBRy9DLGdCQUFZLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxVQUFVLEdBQUcsQ0FBQyxDQUFDLENBQUM7O0FBRXZDLDBCQUFlLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7R0FDakM7O0FBRUQsT0FBSSxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFVBQVUsRUFBRSxDQUFDLEVBQUUsRUFBRTtBQUNsQyxnQkFBWSxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7R0FDeEM7O0FBRUQsU0FBTyxZQUFZLENBQUM7Q0FDckI7O0FBRUQsSUFBSSxRQUFRLEdBQUc7QUFDYixpQkFBZSxFQUFFLE1BQU0sQ0FBQyxZQUFZLENBQUM7QUFDckMsMEJBQXdCLEVBQUUsTUFBTSxDQUFDLDBCQUEwQixDQUFDO0FBQzVELHdCQUFzQixFQUFFLE1BQU0sQ0FBQyx3QkFBd0IsQ0FBQzs7QUFFeEQsV0FBUyxFQUFFLE1BQU0sQ0FBQyxXQUFXLENBQUM7QUFDOUIsaUJBQWUsRUFBRSxNQUFNLENBQUMsaUJBQWlCLENBQUM7QUFDMUMsa0JBQWdCLEVBQUUsTUFBTSxDQUFDLGtCQUFrQixDQUFDOztBQUU1QyxTQUFPLEVBQUUsTUFBTSxDQUFDLFNBQVMsQ0FBQztBQUMxQixhQUFXLEVBQUUsTUFBTSxDQUFDLGFBQWEsQ0FBQzs7QUFFbEMsZ0JBQWMsRUFBRSxNQUFNLENBQUMsZ0JBQWdCLENBQUM7Q0FDekMsQ0FBQzs7Ozs7OztJQU1JLGVBQWU7QUFDUixXQURQLGVBQWUsQ0FDUCxJQUFJLEVBQUU7MEJBRGQsZUFBZTs7QUFFakIsaUNBQWdCLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQzs7QUFFakQsUUFBSSxlQUFlLEdBQUcsU0FBUyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFO0FBQ3hELGdCQUFVLEVBQUUsYUFBYTtLQUMxQixDQUFDLENBQUM7O0FBRUgsUUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsR0FBRyxlQUFlLENBQUM7QUFDakQsUUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO0FBQ25DLFFBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLEdBQUcsaUNBQTBCLENBQUM7O0FBRXhELFFBQUksQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7O0FBRXpFLG1CQUFlLENBQUMsU0FBUyxHQUN2QixJQUFJLENBQUMsUUFBUSxDQUFDLHdCQUF3QixDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3JELG1CQUFlLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7R0FDNUU7O2VBakJHLGVBQWU7Ozs7Ozs7V0F1QmYsY0FBQyxJQUFJLEVBQUU7QUFDVCxVQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksWUFBWSxXQUFXLENBQUEsQUFBQyxFQUFFO0FBQy9ELFlBQUksT0FBTyxJQUFJLEtBQUssUUFBUSxFQUFFO0FBQzVCLGNBQUksR0FBRyxJQUFJLFVBQVUsQ0FBQyxzQkFBZSxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztTQUMzRCxNQUFNLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRTtBQUM5QixjQUFJLEdBQUcsSUFBSSxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDN0IsTUFBTTtBQUNMLGdCQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixHQUFHLE9BQU8sSUFBSSxDQUFDLENBQUM7U0FDMUQ7T0FDRjs7QUFFRCxVQUFJLFNBQVMsR0FBRyxrQkFBa0IsQ0FBQyxDQUFHLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQzs7QUFFM0QsVUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0tBQ3RFOzs7Ozs7O1dBS0csZ0JBQUc7QUFDTCxVQUFJLFNBQVMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQ3pDLFVBQUksU0FBUyxFQUFFO0FBQ2IsaUJBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztBQUNsQixZQUFJLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLEVBQUUsQ0FBQztPQUNuQzs7QUFFRCxVQUFJLGVBQWUsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxDQUFDO0FBQ3JELFVBQUksZUFBZSxFQUFFO0FBQ25CLHVCQUFlLENBQUMsS0FBSyxFQUFFLENBQUM7QUFDeEIsWUFBSSxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFLENBQUM7T0FDekM7O0FBRUQsVUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztLQUNoQzs7U0FFQSxRQUFRLENBQUMsd0JBQXdCO1dBQUMsVUFBQyxTQUFTLEVBQUU7QUFDN0MsVUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsR0FBRyxTQUFTLENBQUM7O0FBRXJDLFVBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUM7O0FBRXRFLGVBQVMsQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDN0QsZUFBUyxDQUFDLE9BQU8sR0FBRyxTQUFTLENBQUMsT0FBTyxHQUNuQyxJQUFJLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQzlDOztTQU1BLFFBQVEsQ0FBQyxlQUFlOzs7Ozs7V0FBQyxVQUFDLFdBQVcsRUFBRTtBQUN0QyxVQUFJLE9BQU8sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0FBQ3JDLFVBQUksU0FBUyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUM7O0FBRXpDLFVBQUksU0FBUyxHQUFHLElBQUksVUFBVSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQzs7OztBQUlqRCxVQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUU7QUFDaEMsd0JBQWdCLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFDLGVBQWUsRUFBSztBQUMvRCxjQUFJLGVBQWUsRUFBRTtBQUNuQixtQkFBTyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGVBQWUsQ0FBQyxDQUFDO1dBQzlDO1NBQ0YsQ0FBQyxDQUFDO0FBQ0gsZUFBTztPQUNSOztBQUVELFVBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0tBQzNDOztTQU1BLFFBQVEsQ0FBQyxjQUFjOzs7Ozs7V0FBQyxVQUFDLEtBQUssRUFBRTs7O0FBQy9CLFVBQUksTUFBTSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUM7O0FBRXhDLFlBQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQUMsV0FBVyxFQUFLO0FBQ2xDLFlBQUksS0FBSyxHQUFHO0FBQ1YscUJBQVcsRUFBRSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFJLENBQUEsS0FBTSxHQUFJO0FBQzdDLGtCQUFRLEVBQUUsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBSSxDQUFBLEtBQU0sR0FBSTtBQUMxQyxzQkFBWSxFQUFFLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUksQ0FBQSxLQUFNLEVBQUk7QUFDOUMsZ0JBQU0sRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRztBQUM1QixvQkFBVSxFQUFFLFdBQVcsQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFJO0FBQ2pDLGNBQUksRUFBRSxJQUFJO0FBQ1YsY0FBSSxFQUFFLEVBQUU7U0FDVCxDQUFDOztBQUVGLFlBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxhQUFhLENBQUMsa0JBQWtCLEVBQUU7QUFDckQsZ0JBQU0sSUFBSSxLQUFLLENBQUMsMENBQTBDLENBQUMsQ0FBQztTQUM3RDs7QUFFRCxZQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssYUFBYSxDQUFDLElBQUksRUFBRTtBQUN2QyxnQkFBTSxJQUFJLEtBQUssQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1NBQ3JEOztBQUVELFlBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxhQUFhLENBQUMsSUFBSSxFQUFFO0FBQ3ZDLGdCQUFNLElBQUksS0FBSyxDQUFDLGtDQUFrQyxDQUFDLENBQUM7U0FDckQ7O0FBRUQsZUFBTyxLQUFLLENBQUM7T0FDZCxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQUMsS0FBSyxFQUFLO0FBQ2pCLFlBQUksaUJBQWlCLENBQUM7QUFDdEIsWUFBSSxLQUFLLENBQUMsVUFBVSxLQUFLLEdBQUcsRUFBRTtBQUM1QiwyQkFBaUIsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FDcEMsVUFBQyxJQUFJO21CQUFLLHNCQUFlLFVBQVUsQ0FBQyxJQUFJLENBQUM7V0FBQSxDQUMxQyxDQUFDO1NBQ0gsTUFBTSxJQUFJLEtBQUssQ0FBQyxVQUFVLElBQUksR0FBRyxFQUFFO0FBQ2xDLDJCQUFpQixHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUNwQyxVQUFDLElBQUk7bUJBQUssc0JBQWUsVUFBVSxDQUFDLElBQUksQ0FBQztXQUFBLENBQzFDLENBQUM7U0FDSCxNQUFNO0FBQ0wsMkJBQWlCLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUM7U0FDdkQ7O0FBRUQsZUFBTyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsVUFBQyxVQUFVLEVBQUs7QUFDNUMsZUFBSyxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUM7QUFDOUIsaUJBQU8sS0FBSyxDQUFDO1NBQ2QsQ0FBQyxDQUFDO09BQ0osQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFDLEtBQUssRUFBSztBQUNqQixZQUFJLEtBQUssQ0FBQyxRQUFRLEVBQUU7QUFDbEIsaUJBQU8sTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBQyxJQUFJLEVBQUs7QUFDbEMsaUJBQUssQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQ2xCLG1CQUFPLEtBQUssQ0FBQztXQUNkLENBQUMsQ0FBQztTQUNKO0FBQ0QsZUFBTyxLQUFLLENBQUM7T0FDZCxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQUMsS0FBSyxFQUFLO0FBQ2pCLGVBQU8sS0FBSyxDQUFDLFVBQVUsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBQyxJQUFJLEVBQUs7QUFDcEUsZUFBSyxDQUFDLElBQUksR0FBRyxzQkFBZSxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztBQUNuRCxpQkFBTyxLQUFLLENBQUM7U0FDZCxDQUFDLEdBQUcsS0FBSyxDQUFDO09BQ1osQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFDLEtBQUssRUFBSztBQUNqQixZQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssYUFBYSxDQUFDLGdCQUFnQixFQUFFO0FBQ25ELGNBQUksSUFBSSxHQUFHLENBQUMsQ0FBQztBQUNiLGNBQUksTUFBTSxHQUFHLFNBQVMsQ0FBQzs7QUFFdkIsY0FBSSxLQUFLLENBQUMsVUFBVSxHQUFHLENBQUMsRUFBRTtBQUN4QixnQkFBSSxHQUFJLHNCQUFlLFVBQVUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDOUMsZ0JBQUksS0FBSyxDQUFDLFVBQVUsR0FBRyxDQUFDLEVBQUU7QUFDeEIsb0JBQU0sR0FBRyxzQkFBZSxhQUFhLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUMvRDtXQUNGOztBQUVELGlCQUFPLENBQUMsR0FBRyxDQUFDLG9CQUFvQixHQUFHLElBQUksR0FBRyxHQUFHLEdBQUcsTUFBTSxDQUFDLENBQUM7O0FBRXhELGNBQUksU0FBUyxHQUFHLGtCQUFrQixDQUFDLENBQUcsRUFBRSxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQzFELGdCQUFLLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ3JFLGdCQUFLLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLENBQUM7U0FDbkMsTUFBTSxJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssYUFBYSxDQUFDLFVBQVUsSUFDekMsS0FBSyxDQUFDLE1BQU0sS0FBSyxhQUFhLENBQUMsWUFBWSxFQUFFO0FBQ3RELGdCQUFLLElBQUksQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1NBQ2xDOztBQUVELFlBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLEVBQUU7QUFDckIsZ0JBQUssUUFBUSxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUM7U0FDakM7T0FDRixDQUFDLENBQUM7S0FDSjs7U0FFQSxRQUFRLENBQUMsZ0JBQWdCO1dBQUMsWUFBRztBQUM1QixVQUFJLFNBQVMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDOztBQUV6QyxVQUFJLENBQUMsU0FBUyxFQUFFO0FBQ2QsZUFBTztPQUNSOztBQUVELFVBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLFVBQU8sQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7O0FBRTlDLGVBQVMsQ0FBQyxNQUFNLEdBQUcsU0FBUyxDQUFDLE9BQU8sR0FBRyxTQUFTLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQzs7QUFFaEUsVUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsR0FBRyxJQUFJLENBQUM7S0FDakM7O1NBRUEsUUFBUSxDQUFDLHNCQUFzQjtXQUFDLFlBQUc7QUFDbEMsVUFBSSxlQUFlLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsQ0FBQzs7QUFFckQsVUFBSSxDQUFDLGVBQWUsRUFBRTtBQUNwQixlQUFPO09BQ1I7O0FBRUQscUJBQWUsQ0FBQyxTQUFTLEdBQUcsZUFBZSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUM7O0FBRTNELFVBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLEdBQUcsSUFBSSxDQUFDOztBQUV0QyxVQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0tBQ25COzs7U0FoTkcsZUFBZTs7O3FCQW1OTjtBQUNiLFFBQU0sRUFBRSxlQUFlO0FBQ3ZCLE9BQUssdUJBQWdCO0FBQ3JCLGFBQVcsNkJBQXNCO0NBQ2xDOzs7O0FDclhEOzs7Ozs7Ozs7Ozs7OzsrQkNBNEIsaUJBQWlCOzs7O0FBRTdDLElBQUksUUFBUSxHQUFHO0FBQ2IsTUFBSSxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUM7QUFDcEIsb0JBQWtCLEVBQUUsTUFBTSxDQUFDLG9CQUFvQixDQUFDO0FBQ2hELFFBQU0sRUFBRSxNQUFNLENBQUMsUUFBUSxDQUFDO0NBQ3pCLENBQUM7O0lBRUksb0JBQW9CO0FBQ2IsV0FEUCxvQkFBb0IsR0FDVjswQkFEVixvQkFBb0I7O0FBRXRCLGlDQUFnQixLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7O0FBRS9DLFFBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDeEMsUUFBSSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLElBQUksQ0FBQztBQUN6QyxRQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxHQUFHLFVBQVMsTUFBTSxFQUFFO0FBQ3ZDLFVBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7O0FBRS9CLFVBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0FBQzNDLFVBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDOztBQUV6RCxhQUFPLFdBQVcsQ0FBQztLQUNwQixDQUFDO0dBQ0g7O2VBZEcsb0JBQW9COztXQWdCckIsYUFBQyxTQUFTLEVBQUU7QUFDYixVQUFJLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDOztBQUUvQixVQUFJLE9BQU8sR0FBRyxJQUFJLFVBQVUsQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUM3RCxhQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ2xCLGFBQU8sQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUNwQyxVQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLE9BQU8sQ0FBQzs7QUFFOUIsVUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQzs7O0FBR2xCLFVBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLEVBQUU7QUFDdEMsWUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztPQUNwQjtLQUNGOzs7V0FFRSxhQUFDLFVBQVUsRUFBRTs7O0FBQ2QsVUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLEVBQUU7QUFDckMsY0FBTSxJQUFJLEtBQUssQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO09BQ3BEOztBQUVELFVBQUksQ0FBQyxRQUFRLENBQUMsa0JBQWtCLENBQUMsR0FBRyxJQUFJLE9BQU8sQ0FBQyxVQUFDLE9BQU8sRUFBSztBQUMzRCxZQUFJLElBQUksR0FBRyxNQUFLLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUMvQixZQUFJLElBQUksQ0FBQyxNQUFNLElBQUksVUFBVSxFQUFFO0FBQzdCLGlCQUFPLE9BQU8sQ0FBQyxNQUFLLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1NBQ25EOztBQUVELFlBQUksSUFBSSxRQUFPLENBQUM7QUFDaEIsY0FBSyxFQUFFLENBQUMsTUFBTSxFQUFFLFNBQVMsTUFBTSxHQUFHO0FBQ2hDLGNBQUksSUFBSSxDQUFDLE1BQU0sR0FBRyxVQUFVLEVBQUU7QUFDNUIsbUJBQU87V0FDUjs7QUFFRCxjQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztBQUN6QixpQkFBTyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztTQUM1QyxDQUFDLENBQUM7T0FDSixDQUFDLENBQUM7O0FBRUgsYUFBTyxJQUFJLENBQUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLENBQUMsSUFBSSxDQUFDLFVBQUMsSUFBSSxFQUFLO0FBQ3RELGNBQUssUUFBUSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsSUFBSSxDQUFDO0FBQ3pDLGVBQU8sSUFBSSxDQUFDO09BQ2IsQ0FBQyxDQUFDO0tBQ0o7OztXQUVNLG1CQUFHO0FBQ1IsYUFBTyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUM7S0FDekM7OztTQTlERyxvQkFBb0I7OztxQkFpRVgsb0JBQW9COzs7Ozs7Ozs7QUN6RW5DLElBQUksY0FBYyxHQUFHOzs7Ozs7O0FBT25CLE1BQUksRUFBQSxjQUFDLEtBQUksRUFBRSxLQUFLLEVBQUU7QUFDaEIsUUFBSSxLQUFJLEVBQUU7QUFDUixXQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtBQUNyQyxhQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLEtBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7T0FDbkM7S0FDRjtBQUNELFdBQU8sS0FBSyxDQUFDO0dBQ2Q7Ozs7OztBQU1ELG9CQUFrQixFQUFBLDhCQUFHO0FBQ25CLFFBQUksTUFBTSxHQUFHLElBQUksVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDOztBQUUvQixVQUFNLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQzs7QUFFdEMsV0FBTyxNQUFNLENBQUM7R0FDZjs7Ozs7OztBQU9ELGVBQWEsRUFBQSx1QkFBQyxXQUFXLEVBQUU7QUFDekIsUUFBSSxPQUFPLFdBQVcsS0FBSyxRQUFRLEVBQUU7QUFDbkMsWUFBTSxJQUFJLEtBQUssQ0FBQyxxQ0FBcUMsQ0FBQyxDQUFDO0tBQ3hEOztBQUVELFFBQUksS0FBSyxHQUFHLElBQUksVUFBVSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUMvQyxTQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtBQUMzQyxXQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUN0Qzs7QUFFRCxXQUFPLEtBQUssQ0FBQztHQUNkOzs7Ozs7O0FBT0QsZUFBYSxFQUFBLHVCQUFDLEtBQUssRUFBRTtBQUNuQixXQUFPLE1BQU0sQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztHQUMvQzs7Ozs7Ozs7QUFRRCxZQUFVLEVBQUEsb0JBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRTtBQUN4QixVQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsQ0FBQztBQUNyQixXQUFPLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQSxHQUFJLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7R0FDakQ7Ozs7Ozs7O0FBUUQsWUFBVSxFQUFBLG9CQUFDLEtBQUssRUFBRSxNQUFNLEVBQUU7QUFDeEIsVUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLENBQUM7QUFDckIsV0FBTyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUEsSUFDeEIsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUEsQUFBQyxJQUN4QixLQUFLLENBQUUsTUFBTSxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQSxBQUFDLEdBQ3pCLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7R0FDckI7Ozs7Ozs7OztBQVNELGFBQVcsRUFBQSxxQkFBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRTtBQUNoQyxTQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEdBQUcsS0FBTSxDQUFBLElBQUssQ0FBQyxDQUFDO0FBQ3RDLFNBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEdBQUcsS0FBSyxHQUFHLEdBQUksQ0FBQztHQUNsQzs7Ozs7Ozs7O0FBU0QsYUFBVyxFQUFBLHFCQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFO0FBQ2hDLFNBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssR0FBRyxVQUFVLENBQUEsSUFBSyxFQUFFLENBQUM7QUFDM0MsU0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUEsSUFBSyxFQUFFLENBQUM7QUFDN0MsU0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssR0FBRyxLQUFNLENBQUEsSUFBSyxDQUFDLENBQUM7QUFDMUMsU0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsR0FBRyxLQUFLLEdBQUcsR0FBSSxDQUFDO0dBQ2xDO0NBQ0YsQ0FBQzs7cUJBRWEsY0FBYyIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJpbXBvcnQgRXZlbnREaXNwYXRjaGVyIGZyb20gJ0V2ZW50RGlzcGF0Y2hlcic7XG5pbXBvcnQgV2ViU29ja2V0RnJhbWVCdWZmZXIgZnJvbSAnLi9mcmFtZS1idWZmZXIuZXM2JztcbmltcG9ydCBXZWJTb2NrZXRVdGlscyBmcm9tICcuL3V0aWxzLmVzNic7XG5cbi8qKlxuICogU2VxdWVuY2UgdXNlZCB0byBzZXBhcmF0ZSBIVFRQIHJlcXVlc3QgaGVhZGVycyBhbmQgYm9keS5cbiAqIEBjb25zdCB7c3RyaW5nfVxuICovXG5jb25zdCBDUkxGID0gJ1xcclxcbic7XG5cbi8qKlxuICogTWFnaWMgR1VJRCBkZWZpbmVkIGJ5IFJGQyB0byBjb25jYXRlbmF0ZSB3aXRoIHdlYiBzb2NrZXQga2V5IGR1cmluZ1xuICogd2Vic29ja2V0IGhhbmRzaGFrZS5cbiAqIEBjb25zdCB7c3RyaW5nfVxuICovXG5jb25zdCBXRUJTT0NLRVRfS0VZX0dVSUQgPSAnMjU4RUFGQTUtRTkxNC00N0RBLTk1Q0EtQzVBQjBEQzg1QjExJztcblxuLyoqXG4gKiBXZWJzb2NrZXQgaGFuZHNoYWtlIHJlc3BvbnNlIHRlbXBsYXRlIHN0cmluZywge3dlYi1zb2NrZXQta2V5fSBzaG91bGQgYmVcbiAqIHJlcGxhY2VkIHdpdGggdGhlIGFwcHJvcHJpYXRlIGtleS5cbiAqIEBjb25zdCB7c3RyaW5nfVxuICovXG5jb25zdCBXRUJTT0NLRVRfSEFORFNIQUtFX1JFU1BPTlNFID1cbiAgJ0hUVFAvMS4xIDEwMSBTd2l0Y2hpbmcgUHJvdG9jb2xzJyArIENSTEYgK1xuICAnQ29ubmVjdGlvbjogVXBncmFkZScgKyBDUkxGICtcbiAgJ1VwZ3JhZGU6IHdlYnNvY2tldCcgKyBDUkxGICtcbiAgJ1NlYy1XZWJTb2NrZXQtQWNjZXB0OiB7d2ViLXNvY2tldC1rZXl9JyArIENSTEYgKyBDUkxGO1xuXG4vKipcbiAqIEVudW1lcmF0aW9uIG9mIGFsbCBwb3NzaWJsZSBvcGVyYXRpb24gY29kZXMuXG4gKiBAZW51bSB7bnVtYmVyfVxuICovXG5jb25zdCBPcGVyYXRpb25Db2RlID0ge1xuICBDT05USU5VQVRJT05fRlJBTUU6IDAsXG4gIFRFWFRfRlJBTUU6IDEsXG4gIEJJTkFSWV9GUkFNRTogMixcbiAgQ09OTkVDVElPTl9DTE9TRTogOCxcbiAgUElORzogOSxcbiAgUE9ORzogMTBcbn07XG5cbi8qKlxuICogRXh0cmFjdHMgSFRUUCBoZWFkZXIgbWFwIGZyb20gSFRUUCBoZWFkZXIgc3RyaW5nLlxuICogQHBhcmFtIHtzdHJpbmd9IGh0dHBIZWFkZXJTdHJpbmcgSFRUUCBoZWFkZXIgc3RyaW5nLlxuICogQHJldHVybnMge01hcC48c3RyaW5nLCBzdHJpbmc+fSBIVFRQIGhlYWRlciBrZXktdmFsdWUgbWFwLlxuICovXG5mdW5jdGlvbiBnZXRIdHRwSGVhZGVycyhodHRwSGVhZGVyU3RyaW5nKSB7XG4gIHZhciBodHRwSGVhZGVycyA9IGh0dHBIZWFkZXJTdHJpbmcudHJpbSgpLnNwbGl0KENSTEYpO1xuICByZXR1cm4gbmV3IE1hcChodHRwSGVhZGVycy5tYXAoKGh0dHBIZWFkZXIpID0+IHtcbiAgICByZXR1cm4gaHR0cEhlYWRlci5zcGxpdCgnOicpLm1hcCgoZW50aXR5KSA9PiBlbnRpdHkudHJpbSgpKTtcbiAgfSkpO1xufVxuXG4vKipcbiAqIFBlcmZvcm1zIFdlYlNvY2tldCBIVFRQIEhhbmRzaGFrZS5cbiAqIEBwYXJhbSB7VENQU29ja2V0fSB0Y3BTb2NrZXQgQ29ubmVjdGlvbiBzb2NrZXQuXG4gKiBAcGFyYW0ge1VpbnQ4QXJyYXl9IGh0dHBSZXF1ZXN0RGF0YSBIVFRQIEhhbmRzaGFrZSBkYXRhIGFycmF5LlxuICogQHJldHVybnMge01hcC48c3RyaW5nLCBzdHJpbmc+fSBQYXJzZWQgaHR0cCBoZWFkZXJzXG4gKi9cbmZ1bmN0aW9uIHBlcmZvcm1IYW5kc2hha2UodGNwU29ja2V0LCBodHRwUmVxdWVzdERhdGEpIHtcbiAgdmFyIGh0dHBIZWFkZXJzID0gZ2V0SHR0cEhlYWRlcnMoXG4gICAgV2ViU29ja2V0VXRpbHMuYXJyYXlUb1N0cmluZyhodHRwUmVxdWVzdERhdGEpLnNwbGl0KENSTEYgKyBDUkxGKVswXVxuICApO1xuXG4gIHZhciBrZXkgPSBXZWJTb2NrZXRVdGlscy5zdHJpbmdUb0FycmF5KFxuICAgIGh0dHBIZWFkZXJzLmdldCgnU2VjLVdlYlNvY2tldC1LZXknKSArIFdFQlNPQ0tFVF9LRVlfR1VJRFxuICApO1xuXG4gIHZhciBzdWJ0bGUgPSB3aW5kb3cuY3J5cHRvLnN1YnRsZTtcbiAgcmV0dXJuIHN1YnRsZS5kaWdlc3QoeyBuYW1lOiAnU0hBLTEnIH0sIGtleSkudGhlbigoaGFzaEFycmF5QnVmZmVyKSA9PiB7XG4gICAgdmFyIHdlYlNvY2tldEtleSA9IGJ0b2EoV2ViU29ja2V0VXRpbHMuYXJyYXlUb1N0cmluZyhcbiAgICAgIG5ldyBVaW50OEFycmF5KGhhc2hBcnJheUJ1ZmZlcilcbiAgICApKTtcbiAgICB2YXIgYXJyYXlSZXNwb25zZSA9IFdlYlNvY2tldFV0aWxzLnN0cmluZ1RvQXJyYXkoXG4gICAgICBXRUJTT0NLRVRfSEFORFNIQUtFX1JFU1BPTlNFLnJlcGxhY2UoJ3t3ZWItc29ja2V0LWtleX0nLCB3ZWJTb2NrZXRLZXkpXG4gICAgKTtcblxuICAgIHRjcFNvY2tldC5zZW5kKGFycmF5UmVzcG9uc2UuYnVmZmVyLCAwLCBhcnJheVJlc3BvbnNlLmJ5dGVMZW5ndGgpO1xuXG4gICAgcmV0dXJuIGh0dHBIZWFkZXJzO1xuICB9KTtcbn1cblxuLyoqXG4gKiBDcmVhdGVzIG91dGdvaW5nIHdlYnNvY2tldCBtZXNzYWdlIGZyYW1lLlxuICogQHBhcmFtIHtOdW1iZXJ9IG9wQ29kZSBGcmFtZSBvcGVyYXRpb24gY29kZS5cbiAqIEBwYXJhbSB7VWludDhBcnJheX0gZGF0YSBEYXRhIGFycmF5LlxuICogQHBhcmFtIHtCb29sZWFufSBpc0NvbXBsZXRlIEluZGljYXRlcyBpZiBmcmFtZSBpcyBjb21wbGV0ZWQuXG4gKiBAcGFyYW0ge0Jvb2xlYW59IGlzTWFza2VkIEluZGljYXRlcyBpZiBmcmFtZSBkYXRhIHNob3VsZCBiZSBtYXNrZWQuXG4gKiBAcmV0dXJucyB7VWludDhBcnJheX0gQ29uc3RydWN0ZWQgZnJhbWUgZGF0YS5cbiAqL1xuZnVuY3Rpb24gY3JlYXRlTWVzc2FnZUZyYW1lKG9wQ29kZSwgZGF0YSwgaXNDb21wbGV0ZSwgaXNNYXNrZWQpIHtcbiAgdmFyIGRhdGFMZW5ndGggPSAoZGF0YSAmJiBkYXRhLmxlbmd0aCkgfHwgMDtcbiAgdmFyIGRhdGFPZmZzZXQgPSBpc01hc2tlZCA/IDYgOiAyO1xuXG4gIHZhciBzZWNvbmRCeXRlID0gMDtcbiAgaWYgKGRhdGFMZW5ndGggPj0gNjU1MzYpIHtcbiAgICBkYXRhT2Zmc2V0ICs9IDg7XG4gICAgc2Vjb25kQnl0ZSA9IDEyNztcbiAgfSBlbHNlIGlmIChkYXRhTGVuZ3RoID4gMTI1KSB7XG4gICAgZGF0YU9mZnNldCArPSAyO1xuICAgIHNlY29uZEJ5dGUgPSAxMjY7XG4gIH0gZWxzZSB7XG4gICAgc2Vjb25kQnl0ZSA9IGRhdGFMZW5ndGg7XG4gIH1cblxuICB2YXIgb3V0cHV0QnVmZmVyID0gbmV3IFVpbnQ4QXJyYXkoZGF0YU9mZnNldCArIGRhdGFMZW5ndGgpO1xuXG4gIC8vIFdyaXRpbmcgT1BDT0RFLCBGSU4gYW5kIExFTkdUSFxuICBvdXRwdXRCdWZmZXJbMF0gPSBpc0NvbXBsZXRlID8gb3BDb2RlIHwgMHg4MCA6IG9wQ29kZTtcbiAgb3V0cHV0QnVmZmVyWzFdID0gaXNNYXNrZWQgPyBzZWNvbmRCeXRlIHwgMHg4MCA6IHNlY29uZEJ5dGU7XG5cbiAgLy8gV3JpdGluZyBEQVRBIExFTkdUSFxuICBzd2l0Y2ggKHNlY29uZEJ5dGUpIHtcbiAgICBjYXNlIDEyNjpcbiAgICAgIFdlYlNvY2tldFV0aWxzLndyaXRlVUludDE2KG91dHB1dEJ1ZmZlciwgZGF0YUxlbmd0aCwgMik7XG4gICAgICBicmVhaztcbiAgICBjYXNlIDEyNzpcbiAgICAgIFdlYlNvY2tldFV0aWxzLndyaXRlVUludDMyKG91dHB1dEJ1ZmZlciwgMCwgMik7XG4gICAgICBXZWJTb2NrZXRVdGlscy53cml0ZVVJbnQzMihvdXRwdXRCdWZmZXIsIGRhdGFMZW5ndGgsIDYpO1xuICAgICAgYnJlYWs7XG4gIH1cblxuICBpZiAoaXNNYXNrZWQgJiYgZGF0YUxlbmd0aCkge1xuICAgIHZhciBtYXNrID0gV2ViU29ja2V0VXRpbHMuZ2VuZXJhdGVSYW5kb21NYXNrKCk7XG5cbiAgICAvLyBXcml0aW5nIE1BU0tcbiAgICBvdXRwdXRCdWZmZXIuc2V0KG1hc2ssIGRhdGFPZmZzZXQgLSA0KTtcblxuICAgIFdlYlNvY2tldFV0aWxzLm1hc2sobWFzaywgZGF0YSk7XG4gIH1cblxuICBmb3IodmFyIGkgPSAwOyBpIDwgZGF0YUxlbmd0aDsgaSsrKSB7XG4gICAgb3V0cHV0QnVmZmVyW2RhdGFPZmZzZXQgKyBpXSA9IGRhdGFbaV07XG4gIH1cblxuICByZXR1cm4gb3V0cHV0QnVmZmVyO1xufVxuXG52YXIgcHJpdmF0ZXMgPSB7XG4gIHRjcFNlcnZlclNvY2tldDogU3ltYm9sKCd0Y3Atc29ja2V0JyksXG4gIG9uVENQU2VydmVyU29ja2V0Q29ubmVjdDogU3ltYm9sKCdvblRDUFNlcnZlclNvY2tldENvbm5lY3QnKSxcbiAgb25UQ1BTZXJ2ZXJTb2NrZXRDbG9zZTogU3ltYm9sKCdvblRDUFNlcnZlclNvY2tldENsb3NlJyksXG5cbiAgdGNwU29ja2V0OiBTeW1ib2woJ3RjcFNvY2tldCcpLFxuICBvblRDUFNvY2tldERhdGE6IFN5bWJvbCgnb25UQ1BTb2NrZXREYXRhJyksXG4gIG9uVENQU29ja2V0Q2xvc2U6IFN5bWJvbCgnb25UQ1BTb2NrZXRDbG9zZScpLFxuXG4gIGNsaWVudHM6IFN5bWJvbCgnY2xpZW50cycpLFxuICBmcmFtZUJ1ZmZlcjogU3ltYm9sKCdmcmFtZUJ1ZmZlcicpLFxuXG4gIG9uTWVzc2FnZUZyYW1lOiBTeW1ib2woJ29uTWVzc2FnZUZyYW1lJylcbn07XG5cbi8qKlxuICogV2ViU29ja2V0U2VydmVyIGNvbnN0cnVjdG9yIHRoYXQgYWNjZXB0cyBwb3J0IHRvIGxpc3RlbiBvbi5cbiAqIEBwYXJhbSB7TnVtYmVyfSBwb3J0IE51bWJlciB0byBsaXN0ZW4gZm9yIHdlYnNvY2tldCBjb25uZWN0aW9ucy5cbiAqL1xuY2xhc3MgV2ViU29ja2V0U2VydmVyIHtcbiAgY29uc3RydWN0b3IocG9ydCkge1xuICAgIEV2ZW50RGlzcGF0Y2hlci5taXhpbih0aGlzLCBbJ21lc3NhZ2UnLCAnc3RvcCddKTtcblxuICAgIHZhciB0Y3BTZXJ2ZXJTb2NrZXQgPSBuYXZpZ2F0b3IubW96VENQU29ja2V0Lmxpc3Rlbihwb3J0LCB7XG4gICAgICBiaW5hcnlUeXBlOiAnYXJyYXlidWZmZXInXG4gICAgfSk7XG5cbiAgICB0aGlzW3ByaXZhdGVzLnRjcFNlcnZlclNvY2tldF0gPSB0Y3BTZXJ2ZXJTb2NrZXQ7XG4gICAgdGhpc1twcml2YXRlcy5jbGllbnRzXSA9IG5ldyBNYXAoKTtcbiAgICB0aGlzW3ByaXZhdGVzLmZyYW1lQnVmZmVyXSA9IG5ldyBXZWJTb2NrZXRGcmFtZUJ1ZmZlcigpO1xuXG4gICAgdGhpc1twcml2YXRlcy5vbk1lc3NhZ2VGcmFtZV0gPSB0aGlzW3ByaXZhdGVzLm9uTWVzc2FnZUZyYW1lXS5iaW5kKHRoaXMpO1xuXG4gICAgdGNwU2VydmVyU29ja2V0Lm9uY29ubmVjdCA9XG4gICAgICB0aGlzW3ByaXZhdGVzLm9uVENQU2VydmVyU29ja2V0Q29ubmVjdF0uYmluZCh0aGlzKTtcbiAgICB0Y3BTZXJ2ZXJTb2NrZXQub25lcnJvciA9IHRoaXNbcHJpdmF0ZXMub25UQ1BTZXJ2ZXJTb2NrZXRDbG9zZV0uYmluZCh0aGlzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZW5kIGRhdGEgdG8gdGhlIGNvbm5lY3RlZCBjbGllbnRcbiAgICogQHBhcmFtIHtBcnJheUJ1ZmZlcnxBcnJheXxzdHJpbmd9IGRhdGEgRGF0YSB0byBzZW5kLlxuICAgKi9cbiAgc2VuZChkYXRhKSB7XG4gICAgaWYgKCFBcnJheUJ1ZmZlci5pc1ZpZXcoZGF0YSkgJiYgIShkYXRhIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpKSB7XG4gICAgICBpZiAodHlwZW9mIGRhdGEgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGRhdGEgPSBuZXcgVWludDhBcnJheShXZWJTb2NrZXRVdGlscy5zdHJpbmdUb0FycmF5KGRhdGEpKTtcbiAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuICAgICAgICBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoZGF0YSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vuc3VwcG9ydGVkIGRhdGEgdHlwZTogJyArIHR5cGVvZiBkYXRhKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgZGF0YUZyYW1lID0gY3JlYXRlTWVzc2FnZUZyYW1lKDB4MiwgZGF0YSwgdHJ1ZSwgZmFsc2UpO1xuXG4gICAgdGhpc1twcml2YXRlcy50Y3BTb2NrZXRdLnNlbmQoZGF0YUZyYW1lLmJ1ZmZlciwgMCwgZGF0YUZyYW1lLmxlbmd0aCk7XG4gIH1cblxuICAvKipcbiAgICogRGVzdHJveXMgc29ja2V0IGNvbm5lY3Rpb24uXG4gICAqL1xuICBzdG9wKCkge1xuICAgIHZhciB0Y3BTb2NrZXQgPSB0aGlzW3ByaXZhdGVzLnRjcFNvY2tldF07XG4gICAgaWYgKHRjcFNvY2tldCkge1xuICAgICAgdGNwU29ja2V0LmNsb3NlKCk7XG4gICAgICB0aGlzW3ByaXZhdGVzLm9uVENQU29ja2V0Q2xvc2VdKCk7XG4gICAgfVxuXG4gICAgdmFyIHRjcFNlcnZlclNvY2tldCA9IHRoaXNbcHJpdmF0ZXMudGNwU2VydmVyU29ja2V0XTtcbiAgICBpZiAodGNwU2VydmVyU29ja2V0KSB7XG4gICAgICB0Y3BTZXJ2ZXJTb2NrZXQuY2xvc2UoKTtcbiAgICAgIHRoaXNbcHJpdmF0ZXMub25UQ1BTZXJ2ZXJTb2NrZXRDbG9zZV0oKTtcbiAgICB9XG5cbiAgICB0aGlzW3ByaXZhdGVzLmNsaWVudHNdLmNsZWFyKCk7XG4gIH1cblxuICBbcHJpdmF0ZXMub25UQ1BTZXJ2ZXJTb2NrZXRDb25uZWN0XSh0Y3BTb2NrZXQpIHtcbiAgICB0aGlzW3ByaXZhdGVzLnRjcFNvY2tldF0gPSB0Y3BTb2NrZXQ7XG5cbiAgICB0aGlzW3ByaXZhdGVzLmZyYW1lQnVmZmVyXS5vbignZnJhbWUnLCB0aGlzW3ByaXZhdGVzLm9uTWVzc2FnZUZyYW1lXSk7XG5cbiAgICB0Y3BTb2NrZXQub25kYXRhID0gdGhpc1twcml2YXRlcy5vblRDUFNvY2tldERhdGFdLmJpbmQodGhpcyk7XG4gICAgdGNwU29ja2V0Lm9uY2xvc2UgPSB0Y3BTb2NrZXQub25lcnJvciA9XG4gICAgICB0aGlzW3ByaXZhdGVzLm9uVENQU29ja2V0Q2xvc2VdLmJpbmQodGhpcyk7XG4gIH1cblxuICAvKipcbiAgICogTW96VGNwU29ja2V0IGRhdGEgaGFuZGxlci5cbiAgICogQHBhcmFtIHtUQ1BTb2NrZXRFdmVudH0gc29ja2V0RXZlbnQgVENQU29ja2V0IGRhdGEgZXZlbnQuXG4gICAqL1xuICBbcHJpdmF0ZXMub25UQ1BTb2NrZXREYXRhXShzb2NrZXRFdmVudCkge1xuICAgIHZhciBjbGllbnRzID0gdGhpc1twcml2YXRlcy5jbGllbnRzXTtcbiAgICB2YXIgdGNwU29ja2V0ID0gdGhpc1twcml2YXRlcy50Y3BTb2NrZXRdO1xuXG4gICAgdmFyIGZyYW1lRGF0YSA9IG5ldyBVaW50OEFycmF5KHNvY2tldEV2ZW50LmRhdGEpO1xuXG4gICAgLy8gSWYgd2UgZG9uJ3QgaGF2ZSBjb25uZWN0aW9uIGluZm8gZnJvbSB0aGlzIGhvc3QgbGV0J3MgcGVyZm9ybSBoYW5kc2hha2VcbiAgICAvLyBDdXJyZW50bHkgd2Ugc3VwcG9ydCBvbmx5IE9ORSBjbGllbnQgZnJvbSBob3N0LlxuICAgIGlmICghY2xpZW50cy5oYXModGNwU29ja2V0Lmhvc3QpKSB7XG4gICAgICBwZXJmb3JtSGFuZHNoYWtlKHRjcFNvY2tldCwgZnJhbWVEYXRhKS50aGVuKChoYW5kc2hha2VSZXN1bHQpID0+IHtcbiAgICAgICAgaWYgKGhhbmRzaGFrZVJlc3VsdCkge1xuICAgICAgICAgIGNsaWVudHMuc2V0KHRjcFNvY2tldC5ob3N0LCBoYW5kc2hha2VSZXN1bHQpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzW3ByaXZhdGVzLmZyYW1lQnVmZmVyXS5wdXQoZnJhbWVEYXRhKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBQcm9jZXNzIFdlYlNvY2tldCBpbmNvbWluZyBmcmFtZS5cbiAgICogQHBhcmFtIHtVaW50OEFycmF5fSBmcmFtZSBNZXNzYWdlIGZyYW1lIGRhdGEgaW4gdmlldyBvZiBVaW50OEFycmF5LlxuICAgKi9cbiAgW3ByaXZhdGVzLm9uTWVzc2FnZUZyYW1lXShmcmFtZSkge1xuICAgIHZhciBidWZmZXIgPSB0aGlzW3ByaXZhdGVzLmZyYW1lQnVmZmVyXTtcblxuICAgIGJ1ZmZlci5nZXQoMikudGhlbigoY29udHJvbERhdGEpID0+IHtcbiAgICAgIHZhciBzdGF0ZSA9IHtcbiAgICAgICAgaXNDb21wbGV0ZWQ6IChjb250cm9sRGF0YVswXSAmIDB4ODApID09PSAweDgwLFxuICAgICAgICBpc01hc2tlZDogKGNvbnRyb2xEYXRhWzFdICYgMHg4MCkgPT09IDB4ODAsXG4gICAgICAgIGlzQ29tcHJlc3NlZDogKGNvbnRyb2xEYXRhWzBdICYgMHg0MCkgPT09IDB4NDAsXG4gICAgICAgIG9wQ29kZTogY29udHJvbERhdGFbMF0gJiAweGYsXG4gICAgICAgIGRhdGFMZW5ndGg6IGNvbnRyb2xEYXRhWzFdICYgMHg3ZixcbiAgICAgICAgbWFzazogbnVsbCxcbiAgICAgICAgZGF0YTogW11cbiAgICAgIH07XG5cbiAgICAgIGlmIChzdGF0ZS5vcENvZGUgPT09IE9wZXJhdGlvbkNvZGUuQ09OVElOVUFUSU9OX0ZSQU1FKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignQ29udGludWF0aW9uIGZyYW1lIGlzIG5vdCB5ZXQgc3VwcG9ydGVkIScpO1xuICAgICAgfVxuXG4gICAgICBpZiAoc3RhdGUub3BDb2RlID09PSBPcGVyYXRpb25Db2RlLlBJTkcpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQaW5nIGZyYW1lIGlzIG5vdCB5ZXQgc3VwcG9ydGVkIScpO1xuICAgICAgfVxuXG4gICAgICBpZiAoc3RhdGUub3BDb2RlID09PSBPcGVyYXRpb25Db2RlLlBPTkcpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQb25nIGZyYW1lIGlzIG5vdCB5ZXQgc3VwcG9ydGVkIScpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gc3RhdGU7XG4gICAgfSkudGhlbigoc3RhdGUpID0+IHtcbiAgICAgIHZhciBkYXRhTGVuZ3RoUHJvbWlzZTtcbiAgICAgIGlmIChzdGF0ZS5kYXRhTGVuZ3RoID09PSAxMjYpIHtcbiAgICAgICAgZGF0YUxlbmd0aFByb21pc2UgPSBidWZmZXIuZ2V0KDIpLnRoZW4oXG4gICAgICAgICAgKGRhdGEpID0+IFdlYlNvY2tldFV0aWxzLnJlYWRVSW50MTYoZGF0YSlcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoc3RhdGUuZGF0YUxlbmd0aCA9PSAxMjcpIHtcbiAgICAgICAgZGF0YUxlbmd0aFByb21pc2UgPSBidWZmZXIuZ2V0KDQpLnRoZW4oXG4gICAgICAgICAgKGRhdGEpID0+IFdlYlNvY2tldFV0aWxzLnJlYWRVSW50MzIoZGF0YSlcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRhdGFMZW5ndGhQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKHN0YXRlLmRhdGFMZW5ndGgpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gZGF0YUxlbmd0aFByb21pc2UudGhlbigoZGF0YUxlbmd0aCkgPT4ge1xuICAgICAgICBzdGF0ZS5kYXRhTGVuZ3RoID0gZGF0YUxlbmd0aDtcbiAgICAgICAgcmV0dXJuIHN0YXRlO1xuICAgICAgfSk7XG4gICAgfSkudGhlbigoc3RhdGUpID0+IHtcbiAgICAgIGlmIChzdGF0ZS5pc01hc2tlZCkge1xuICAgICAgICByZXR1cm4gYnVmZmVyLmdldCg0KS50aGVuKChtYXNrKSA9PiB7XG4gICAgICAgICAgc3RhdGUubWFzayA9IG1hc2s7XG4gICAgICAgICAgcmV0dXJuIHN0YXRlO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzdGF0ZTtcbiAgICB9KS50aGVuKChzdGF0ZSkgPT4ge1xuICAgICAgcmV0dXJuIHN0YXRlLmRhdGFMZW5ndGggPyBidWZmZXIuZ2V0KHN0YXRlLmRhdGFMZW5ndGgpLnRoZW4oKGRhdGEpID0+IHtcbiAgICAgICAgc3RhdGUuZGF0YSA9IFdlYlNvY2tldFV0aWxzLm1hc2soc3RhdGUubWFzaywgZGF0YSk7XG4gICAgICAgIHJldHVybiBzdGF0ZTtcbiAgICAgIH0pIDogc3RhdGU7XG4gICAgfSkudGhlbigoc3RhdGUpID0+IHtcbiAgICAgIGlmIChzdGF0ZS5vcENvZGUgPT09IE9wZXJhdGlvbkNvZGUuQ09OTkVDVElPTl9DTE9TRSkge1xuICAgICAgICB2YXIgY29kZSA9IDA7XG4gICAgICAgIHZhciByZWFzb24gPSAnVW5rbm93bic7XG5cbiAgICAgICAgaWYgKHN0YXRlLmRhdGFMZW5ndGggPiAwKSB7XG4gICAgICAgICAgY29kZSA9ICBXZWJTb2NrZXRVdGlscy5yZWFkVUludDE2KHN0YXRlLmRhdGEpO1xuICAgICAgICAgIGlmIChzdGF0ZS5kYXRhTGVuZ3RoID4gMikge1xuICAgICAgICAgICAgcmVhc29uID0gV2ViU29ja2V0VXRpbHMuYXJyYXlUb1N0cmluZyhzdGF0ZS5kYXRhLnN1YmFycmF5KDIpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjb25zb2xlLmxvZygnU29ja2V0IGlzIGNsb3NlZDogJyArIGNvZGUgKyAnICcgKyByZWFzb24pO1xuXG4gICAgICAgIHZhciBkYXRhRnJhbWUgPSBjcmVhdGVNZXNzYWdlRnJhbWUoMHg4LCBzdGF0ZS5kYXRhLCB0cnVlKTtcbiAgICAgICAgdGhpc1twcml2YXRlcy50Y3BTb2NrZXRdLnNlbmQoZGF0YUZyYW1lLmJ1ZmZlciwgMCwgZGF0YUZyYW1lLmxlbmd0aCk7XG4gICAgICAgIHRoaXNbcHJpdmF0ZXMub25UQ1BTb2NrZXRDbG9zZV0oKTtcbiAgICAgIH0gZWxzZSBpZiAoc3RhdGUub3BDb2RlID09PSBPcGVyYXRpb25Db2RlLlRFWFRfRlJBTUUgfHxcbiAgICAgICAgICAgICAgICAgc3RhdGUub3BDb2RlID09PSBPcGVyYXRpb25Db2RlLkJJTkFSWV9GUkFNRSkge1xuICAgICAgICB0aGlzLmVtaXQoJ21lc3NhZ2UnLCBzdGF0ZS5kYXRhKTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFidWZmZXIuaXNFbXB0eSgpKSB7XG4gICAgICAgIHRoaXNbcHJpdmF0ZXMub25NZXNzYWdlRnJhbWVdKCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICBbcHJpdmF0ZXMub25UQ1BTb2NrZXRDbG9zZV0oKSB7XG4gICAgdmFyIHRjcFNvY2tldCA9IHRoaXNbcHJpdmF0ZXMudGNwU29ja2V0XTtcblxuICAgIGlmICghdGNwU29ja2V0KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpc1twcml2YXRlcy5jbGllbnRzXS5kZWxldGUodGNwU29ja2V0Lmhvc3QpO1xuXG4gICAgdGNwU29ja2V0Lm9uZGF0YSA9IHRjcFNvY2tldC5vbmVycm9yID0gdGNwU29ja2V0Lm9uY2xvc2UgPSBudWxsO1xuXG4gICAgdGhpc1twcml2YXRlcy50Y3BTb2NrZXRdID0gbnVsbDtcbiAgfVxuXG4gIFtwcml2YXRlcy5vblRDUFNlcnZlclNvY2tldENsb3NlXSgpIHtcbiAgICB2YXIgdGNwU2VydmVyU29ja2V0ID0gdGhpc1twcml2YXRlcy50Y3BTZXJ2ZXJTb2NrZXRdO1xuXG4gICAgaWYgKCF0Y3BTZXJ2ZXJTb2NrZXQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0Y3BTZXJ2ZXJTb2NrZXQub25jb25uZWN0ID0gdGNwU2VydmVyU29ja2V0Lm9uZXJyb3IgPSBudWxsO1xuXG4gICAgdGhpc1twcml2YXRlcy50Y3BTZXJ2ZXJTb2NrZXRdID0gbnVsbDtcblxuICAgIHRoaXMuZW1pdCgnc3RvcCcpO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IHtcbiAgU2VydmVyOiBXZWJTb2NrZXRTZXJ2ZXIsXG4gIFV0aWxzOiBXZWJTb2NrZXRVdGlscyxcbiAgRnJhbWVCdWZmZXI6IFdlYlNvY2tldEZyYW1lQnVmZmVyXG59O1xuIixudWxsLCJpbXBvcnQgRXZlbnREaXNwYXRjaGVyIGZyb20gJ0V2ZW50RGlzcGF0Y2hlcic7XG5cbnZhciBwcml2YXRlcyA9IHtcbiAgZGF0YTogU3ltYm9sKCdkYXRhJyksXG4gIHBlbmRpbmdEYXRhUmVxdWVzdDogU3ltYm9sKCdwZW5kaW5nRGF0YVJlcXVlc3QnKSxcbiAgc3BsaWNlOiBTeW1ib2woJ3NwbGljZScpXG59O1xuXG5jbGFzcyBXZWJTb2NrZXRGcmFtZUJ1ZmZlciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIEV2ZW50RGlzcGF0Y2hlci5taXhpbih0aGlzLCBbJ2ZyYW1lJywgJ2RhdGEnXSk7XG5cbiAgICB0aGlzW3ByaXZhdGVzLmRhdGFdID0gbmV3IFVpbnQ4QXJyYXkoMCk7XG4gICAgdGhpc1twcml2YXRlcy5wZW5kaW5nRGF0YVJlcXVlc3RdID0gbnVsbDtcbiAgICB0aGlzW3ByaXZhdGVzLnNwbGljZV0gPSBmdW5jdGlvbihsZW5ndGgpIHtcbiAgICAgIHZhciBkYXRhID0gdGhpc1twcml2YXRlcy5kYXRhXTtcblxuICAgICAgdmFyIHNwbGljZWREYXRhID0gZGF0YS5zdWJhcnJheSgwLCBsZW5ndGgpO1xuICAgICAgdGhpc1twcml2YXRlcy5kYXRhXSA9IGRhdGEuc3ViYXJyYXkobGVuZ3RoLCBkYXRhLmxlbmd0aCk7XG5cbiAgICAgIHJldHVybiBzcGxpY2VkRGF0YTtcbiAgICB9O1xuICB9XG5cbiAgcHV0KGRhdGFUb1B1dCkge1xuICAgIHZhciBkYXRhID0gdGhpc1twcml2YXRlcy5kYXRhXTtcblxuICAgIHZhciBuZXdEYXRhID0gbmV3IFVpbnQ4QXJyYXkoZGF0YS5sZW5ndGggKyBkYXRhVG9QdXQubGVuZ3RoKTtcbiAgICBuZXdEYXRhLnNldChkYXRhKTtcbiAgICBuZXdEYXRhLnNldChkYXRhVG9QdXQsIGRhdGEubGVuZ3RoKTtcbiAgICB0aGlzW3ByaXZhdGVzLmRhdGFdID0gbmV3RGF0YTtcblxuICAgIHRoaXMuZW1pdCgnZGF0YScpO1xuXG4gICAgLy8gSWYgbm8gb25lIHdhaXRpbmcgZm9yIGRhdGEsIGxldCdzIHNpZ25hbCB0aGF0IHdlIGhhdmUgbmV3IGZyYW1lIVxuICAgIGlmICghdGhpc1twcml2YXRlcy5wZW5kaW5nRGF0YVJlcXVlc3RdKSB7XG4gICAgICB0aGlzLmVtaXQoJ2ZyYW1lJyk7XG4gICAgfVxuICB9XG5cbiAgZ2V0KGRhdGFMZW5ndGgpIHtcbiAgICBpZiAodGhpc1twcml2YXRlcy5wZW5kaW5nRGF0YVJlcXVlc3RdKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvbmN1cnJlbnQgcmVhZCBpcyBub3QgYWxsb3dlZC4nKTtcbiAgICB9XG5cbiAgICB0aGlzW3ByaXZhdGVzLnBlbmRpbmdEYXRhUmVxdWVzdF0gPSBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgdmFyIGRhdGEgPSB0aGlzW3ByaXZhdGVzLmRhdGFdO1xuICAgICAgaWYgKGRhdGEubGVuZ3RoID49IGRhdGFMZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUodGhpc1twcml2YXRlcy5zcGxpY2VdKGRhdGFMZW5ndGgpKTtcbiAgICAgIH1cblxuICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgdGhpcy5vbignZGF0YScsIGZ1bmN0aW9uIG9uRGF0YSgpIHtcbiAgICAgICAgaWYgKGRhdGEubGVuZ3RoIDwgZGF0YUxlbmd0aCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHNlbGYub2ZmKCdkYXRhJywgb25EYXRhKTtcbiAgICAgICAgcmVzb2x2ZSh0aGlzW3ByaXZhdGVzLnNwbGljZV0oZGF0YUxlbmd0aCkpO1xuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gdGhpc1twcml2YXRlcy5wZW5kaW5nRGF0YVJlcXVlc3RdLnRoZW4oKGRhdGEpID0+IHtcbiAgICAgIHRoaXNbcHJpdmF0ZXMucGVuZGluZ0RhdGFSZXF1ZXN0XSA9IG51bGw7XG4gICAgICByZXR1cm4gZGF0YTtcbiAgICB9KTtcbiAgfVxuXG4gIGlzRW1wdHkoKSB7XG4gICAgcmV0dXJuIHRoaXNbcHJpdmF0ZXMuZGF0YV0ubGVuZ3RoID09PSAwO1xuICB9O1xufVxuXG5leHBvcnQgZGVmYXVsdCBXZWJTb2NrZXRGcmFtZUJ1ZmZlcjtcbiIsInZhciBXZWJTb2NrZXRVdGlscyA9IHtcbiAgLyoqXG4gICAqIE1hc2sgZXZlcnkgZGF0YSBlbGVtZW50IHdpdGggdGhlIG1hc2sgKFdlYlNvY2tldCBzcGVjaWZpYyBhbGdvcml0aG0pLlxuICAgKiBAcGFyYW0ge0FycmF5fSBtYXNrIE1hc2sgYXJyYXkuXG4gICAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IERhdGEgYXJyYXkgdG8gbWFzay5cbiAgICogQHJldHVybnMge0FycmF5fSBNYXNrZWQgZGF0YSBhcnJheS5cbiAgICovXG4gIG1hc2sobWFzaywgYXJyYXkpIHtcbiAgICBpZiAobWFzaykge1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7IGkrKykge1xuICAgICAgICBhcnJheVtpXSA9IGFycmF5W2ldIF4gbWFza1tpICUgNF07XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBhcnJheTtcbiAgfSxcblxuICAvKipcbiAgICogR2VuZXJhdGVzIDQtaXRlbSBhcnJheSwgZXZlcnkgaXRlbSBvZiB3aGljaCBpcyBlbGVtZW50IG9mIGJ5dGUgbWFzay5cbiAgICogQHJldHVybnMge1VpbnQ4QXJyYXl9XG4gICAqL1xuICBnZW5lcmF0ZVJhbmRvbU1hc2soKSB7XG4gICAgdmFyIHJhbmRvbSA9IG5ldyBVaW50OEFycmF5KDQpO1xuXG4gICAgd2luZG93LmNyeXB0by5nZXRSYW5kb21WYWx1ZXMocmFuZG9tKTtcblxuICAgIHJldHVybiByYW5kb207XG4gIH0sXG5cbiAgLyoqXG4gICAqIENvbnZlcnRzIHN0cmluZyB0byBVaW50OEFycmF5LlxuICAgKiBAcGFyYW0ge3N0cmluZ30gc3RyaW5nVmFsdWUgU3RyaW5nIHZhbHVlIHRvIGNvbnZlcnQuXG4gICAqIEByZXR1cm5zIHtVaW50OEFycmF5fVxuICAgKi9cbiAgc3RyaW5nVG9BcnJheShzdHJpbmdWYWx1ZSkge1xuICAgIGlmICh0eXBlb2Ygc3RyaW5nVmFsdWUgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3N0cmluZ1ZhbHVlIHNob3VsZCBiZSB2YWxpZCBzdHJpbmchJyk7XG4gICAgfVxuXG4gICAgdmFyIGFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoc3RyaW5nVmFsdWUubGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHN0cmluZ1ZhbHVlLmxlbmd0aDsgaSsrKSB7XG4gICAgICBhcnJheVtpXSA9IHN0cmluZ1ZhbHVlLmNoYXJDb2RlQXQoaSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGFycmF5O1xuICB9LFxuXG4gIC8qKlxuICAgKiBDb252ZXJ0cyBhcnJheSB0byBzdHJpbmcuIEV2ZXJ5IGFycmF5IGVsZW1lbnQgaXMgY29uc2lkZXJlZCBhcyBjaGFyIGNvZGUuXG4gICAqIEBwYXJhbSB7VWludDhBcnJheX0gYXJyYXkgQXJyYXkgd2l0aCB0aGUgY2hhciBjb2Rlcy5cbiAgICogQHJldHVybnMge3N0cmluZ31cbiAgICovXG4gIGFycmF5VG9TdHJpbmcoYXJyYXkpIHtcbiAgICByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBhcnJheSk7XG4gIH0sXG5cbiAgLyoqXG4gICAqIFJlYWRzIHVuc2lnbmVkIDE2IGJpdCB2YWx1ZSBmcm9tIHR3byBjb25zZXF1ZW50IDgtYml0IGFycmF5IGVsZW1lbnRzLlxuICAgKiBAcGFyYW0ge1VpbnQ4QXJyYXl9IGFycmF5IEFycmF5IHRvIHJlYWQgZnJvbS5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9mZnNldCBJbmRleCB0byBzdGFydCByZWFkIHZhbHVlLlxuICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgKi9cbiAgcmVhZFVJbnQxNihhcnJheSwgb2Zmc2V0KSB7XG4gICAgb2Zmc2V0ID0gb2Zmc2V0IHx8IDA7XG4gICAgcmV0dXJuIChhcnJheVtvZmZzZXRdIDw8IDgpICsgYXJyYXlbb2Zmc2V0ICsgMV07XG4gIH0sXG5cbiAgLyoqXG4gICAqIFJlYWRzIHVuc2lnbmVkIDMyIGJpdCB2YWx1ZSBmcm9tIGZvdXIgY29uc2VxdWVudCA4LWJpdCBhcnJheSBlbGVtZW50cy5cbiAgICogQHBhcmFtIHtVaW50OEFycmF5fSBhcnJheSBBcnJheSB0byByZWFkIGZyb20uXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBvZmZzZXQgSW5kZXggdG8gc3RhcnQgcmVhZCB2YWx1ZS5cbiAgICogQHJldHVybnMge051bWJlcn1cbiAgICovXG4gIHJlYWRVSW50MzIoYXJyYXksIG9mZnNldCkge1xuICAgIG9mZnNldCA9IG9mZnNldCB8fCAwO1xuICAgIHJldHVybiAoYXJyYXlbb2Zmc2V0XSA8PCAyNCkgK1xuICAgICAgKGFycmF5W29mZnNldCArIDFdIDw8IDE2KSArXG4gICAgICAoYXJyYXkgW29mZnNldCArIDJdIDw8IDgpICtcbiAgICAgIGFycmF5W29mZnNldCArIDNdO1xuICB9LFxuXG4gIC8qKlxuICAgKiBXcml0ZXMgdW5zaWduZWQgMTYgYml0IHZhbHVlIHRvIHR3byBjb25zZXF1ZW50IDgtYml0IGFycmF5IGVsZW1lbnRzLlxuICAgKiBAcGFyYW0ge1VpbnQ4QXJyYXl9IGFycmF5IEFycmF5IHRvIHdyaXRlIHRvLlxuICAgKiBAcGFyYW0ge051bWJlcn0gdmFsdWUgMTYgYml0IHVuc2lnbmVkIHZhbHVlIHRvIHdyaXRlIGludG8gYXJyYXkuXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBvZmZzZXQgSW5kZXggdG8gc3RhcnQgd3JpdGUgdmFsdWUuXG4gICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAqL1xuICB3cml0ZVVJbnQxNihhcnJheSwgdmFsdWUsIG9mZnNldCkge1xuICAgIGFycmF5W29mZnNldF0gPSAodmFsdWUgJiAweGZmMDApID4+IDg7XG4gICAgYXJyYXlbb2Zmc2V0ICsgMV0gPSB2YWx1ZSAmIDB4ZmY7XG4gIH0sXG5cbiAgLyoqXG4gICAqIFdyaXRlcyB1bnNpZ25lZCAxNiBiaXQgdmFsdWUgdG8gdHdvIGNvbnNlcXVlbnQgOC1iaXQgYXJyYXkgZWxlbWVudHMuXG4gICAqIEBwYXJhbSB7VWludDhBcnJheX0gYXJyYXkgQXJyYXkgdG8gd3JpdGUgdG8uXG4gICAqIEBwYXJhbSB7TnVtYmVyfSB2YWx1ZSAxNiBiaXQgdW5zaWduZWQgdmFsdWUgdG8gd3JpdGUgaW50byBhcnJheS5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9mZnNldCBJbmRleCB0byBzdGFydCB3cml0ZSB2YWx1ZS5cbiAgICogQHJldHVybnMge051bWJlcn1cbiAgICovXG4gIHdyaXRlVUludDMyKGFycmF5LCB2YWx1ZSwgb2Zmc2V0KSB7XG4gICAgYXJyYXlbb2Zmc2V0XSA9ICh2YWx1ZSAmIDB4ZmYwMDAwMDApID4+IDI0O1xuICAgIGFycmF5W29mZnNldCArIDFdID0gKHZhbHVlICYgMHhmZjAwMDApID4+IDE2O1xuICAgIGFycmF5W29mZnNldCArIDJdID0gKHZhbHVlICYgMHhmZjAwKSA+PiA4O1xuICAgIGFycmF5W29mZnNldCArIDNdID0gdmFsdWUgJiAweGZmO1xuICB9XG59O1xuXG5leHBvcnQgZGVmYXVsdCBXZWJTb2NrZXRVdGlscztcbiJdfQ==
