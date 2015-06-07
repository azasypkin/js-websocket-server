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
/*global Map, Set */

'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});
function ensureValidEventName(eventName) {
  if (!eventName || typeof eventName !== 'string') {
    throw new Error('Event name should be a valid non-empty string!');
  }
}

function ensureValidHandler(handler) {
  if (typeof handler !== 'function') {
    throw new Error('Handler should be a function!');
  }
}

function ensureAllowedEventName(allowedEvents, eventName) {
  if (allowedEvents && allowedEvents.indexOf(eventName) < 0) {
    throw new Error('Event "' + eventName + '" is not allowed!');
  }
}

// Implements publish/subscribe behaviour that can be applied to any object,
// so that object can be listened for custom events. "this" context is the
// object with Map "listeners" property used to store handlers.
var eventDispatcher = {
  /**
   * Registers listener function to be executed once event occurs.
   * @param {string} eventName Name of the event to listen for.
   * @param {function} handler Handler to be executed once event occurs.
   */
  on: function on(eventName, handler) {
    ensureValidEventName(eventName);
    ensureAllowedEventName(this.allowedEvents, eventName);
    ensureValidHandler(handler);

    var handlers = this.listeners.get(eventName);

    if (!handlers) {
      handlers = new Set();
      this.listeners.set(eventName, handlers);
    }

    // Set.add ignores handler if it has been already registered
    handlers.add(handler);
  },

  /**
   * Removes registered listener for the specified event.
   * @param {string} eventName Name of the event to remove listener for.
   * @param {function} handler Handler to remove, so it won't be executed
   * next time event occurs.
   */
  off: function off(eventName, handler) {
    ensureValidEventName(eventName);
    ensureAllowedEventName(this.allowedEvents, eventName);
    ensureValidHandler(handler);

    var handlers = this.listeners.get(eventName);

    if (!handlers) {
      return;
    }

    handlers['delete'](handler);

    if (!handlers.size) {
      this.listeners['delete'](eventName);
    }
  },

  /**
   * Removes all registered listeners for the specified event.
   * @param {string} eventName Name of the event to remove all listeners for.
   */
  offAll: function offAll(eventName) {
    if (typeof eventName === 'undefined') {
      this.listeners.clear();
      return;
    }

    ensureValidEventName(eventName);
    ensureAllowedEventName(this.allowedEvents, eventName);

    var handlers = this.listeners.get(eventName);

    if (!handlers) {
      return;
    }

    handlers.clear();

    this.listeners['delete'](eventName);
  },

  /**
   * Emits specified event so that all registered handlers will be called
   * with the specified parameters.
   * @param {string} eventName Name of the event to call handlers for.
   * @param {Object} parameters Optional parameters that will be passed to
   * every registered handler.
   */
  emit: function emit(eventName, parameters) {
    ensureValidEventName(eventName);
    ensureAllowedEventName(this.allowedEvents, eventName);

    var handlers = this.listeners.get(eventName);

    if (!handlers) {
      return;
    }

    handlers.forEach(function (handler) {
      try {
        handler(parameters);
      } catch (e) {
        console.error(e);
      }
    });
  }
};

exports['default'] = {
  /**
   * Mixes dispatcher methods into target object.
   * @param {Object} target Object to mix dispatcher methods into.
   * @param {Array.<string>} allowedEvents Optional list of the allowed event
   * names that can be emitted and listened for.
   * @returns {Object} Target object with added dispatcher methods.
   */
  mixin: function mixin(target, allowedEvents) {
    if (!target || typeof target !== 'object') {
      throw new Error('Object to mix into should be valid object!');
    }

    if (typeof allowedEvents !== 'undefined' && !Array.isArray(allowedEvents)) {
      throw new Error('Allowed events should be a valid array of strings!');
    }

    Object.keys(eventDispatcher).forEach(function (method) {
      if (typeof target[method] !== 'undefined') {
        throw new Error('Object to mix into already has "' + method + '" property defined!');
      }
      target[method] = eventDispatcher[method].bind(this);
    }, { listeners: new Map(), allowedEvents: allowedEvents });

    return target;
  }
};
module.exports = exports['default'];

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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvbWVkaWEvYXphc3lwa2luL3Byb2plY3RzL2dpdGh1Yi9meG9zLXdlYnNvY2tldC1zZXJ2ZXIvc3JjL3NlcnZlci5lczYuanMiLCIvbWVkaWEvYXphc3lwa2luL3Byb2plY3RzL2dpdGh1Yi9meG9zLXdlYnNvY2tldC1zZXJ2ZXIvY29tcG9uZW50cy9ldmVudC1kaXNwYXRjaGVyLWpzL2V2ZW50LWRpc3BhdGNoZXIuZXM2LmpzIiwiL21lZGlhL2F6YXN5cGtpbi9wcm9qZWN0cy9naXRodWIvZnhvcy13ZWJzb2NrZXQtc2VydmVyL3NyYy9mcmFtZS1idWZmZXIuZXM2LmpzIiwiL21lZGlhL2F6YXN5cGtpbi9wcm9qZWN0cy9naXRodWIvZnhvcy13ZWJzb2NrZXQtc2VydmVyL3NyYy91dGlscy5lczYuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7Ozs7Ozs7Ozs7K0JDQTRCLGlCQUFpQjs7Ozs4QkFDWixvQkFBb0I7Ozs7d0JBQzFCLGFBQWE7Ozs7Ozs7O0FBTXhDLElBQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQzs7Ozs7OztBQU9wQixJQUFNLGtCQUFrQixHQUFHLHNDQUFzQyxDQUFDOzs7Ozs7O0FBT2xFLElBQU0sNEJBQTRCLEdBQ2hDLGtDQUFrQyxHQUFHLElBQUksR0FDekMscUJBQXFCLEdBQUcsSUFBSSxHQUM1QixvQkFBb0IsR0FBRyxJQUFJLEdBQzNCLHdDQUF3QyxHQUFHLElBQUksR0FBRyxJQUFJLENBQUM7Ozs7OztBQU16RCxJQUFNLGFBQWEsR0FBRztBQUNwQixvQkFBa0IsRUFBRSxDQUFDO0FBQ3JCLFlBQVUsRUFBRSxDQUFDO0FBQ2IsY0FBWSxFQUFFLENBQUM7QUFDZixrQkFBZ0IsRUFBRSxDQUFDO0FBQ25CLE1BQUksRUFBRSxDQUFDO0FBQ1AsTUFBSSxFQUFFLEVBQUU7Q0FDVCxDQUFDOzs7Ozs7O0FBT0Ys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QUssR0FBRyxVQUFVLENBQUEsSUFBSyxFQUFFLENBQUM7QUFDM0MsU0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUEsSUFBSyxFQUFFLENBQUM7QUFDN0MsU0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssR0FBRyxLQUFNLENBQUEsSUFBSyxDQUFDLENBQUM7QUFDMUMsU0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsR0FBRyxLQUFLLEdBQUcsR0FBSSxDQUFDO0dBQ2xDO0NBQ0YsQ0FBQzs7cUJBRWEsY0FBYyIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJpbXBvcnQgRXZlbnREaXNwYXRjaGVyIGZyb20gJ0V2ZW50RGlzcGF0Y2hlcic7XG5pbXBvcnQgV2ViU29ja2V0RnJhbWVCdWZmZXIgZnJvbSAnLi9mcmFtZS1idWZmZXIuZXM2JztcbmltcG9ydCBXZWJTb2NrZXRVdGlscyBmcm9tICcuL3V0aWxzLmVzNic7XG5cbi8qKlxuICogU2VxdWVuY2UgdXNlZCB0byBzZXBhcmF0ZSBIVFRQIHJlcXVlc3QgaGVhZGVycyBhbmQgYm9keS5cbiAqIEBjb25zdCB7c3RyaW5nfVxuICovXG5jb25zdCBDUkxGID0gJ1xcclxcbic7XG5cbi8qKlxuICogTWFnaWMgR1VJRCBkZWZpbmVkIGJ5IFJGQyB0byBjb25jYXRlbmF0ZSB3aXRoIHdlYiBzb2NrZXQga2V5IGR1cmluZ1xuICogd2Vic29ja2V0IGhhbmRzaGFrZS5cbiAqIEBjb25zdCB7c3RyaW5nfVxuICovXG5jb25zdCBXRUJTT0NLRVRfS0VZX0dVSUQgPSAnMjU4RUFGQTUtRTkxNC00N0RBLTk1Q0EtQzVBQjBEQzg1QjExJztcblxuLyoqXG4gKiBXZWJzb2NrZXQgaGFuZHNoYWtlIHJlc3BvbnNlIHRlbXBsYXRlIHN0cmluZywge3dlYi1zb2NrZXQta2V5fSBzaG91bGQgYmVcbiAqIHJlcGxhY2VkIHdpdGggdGhlIGFwcHJvcHJpYXRlIGtleS5cbiAqIEBjb25zdCB7c3RyaW5nfVxuICovXG5jb25zdCBXRUJTT0NLRVRfSEFORFNIQUtFX1JFU1BPTlNFID1cbiAgJ0hUVFAvMS4xIDEwMSBTd2l0Y2hpbmcgUHJvdG9jb2xzJyArIENSTEYgK1xuICAnQ29ubmVjdGlvbjogVXBncmFkZScgKyBDUkxGICtcbiAgJ1VwZ3JhZGU6IHdlYnNvY2tldCcgKyBDUkxGICtcbiAgJ1NlYy1XZWJTb2NrZXQtQWNjZXB0OiB7d2ViLXNvY2tldC1rZXl9JyArIENSTEYgKyBDUkxGO1xuXG4vKipcbiAqIEVudW1lcmF0aW9uIG9mIGFsbCBwb3NzaWJsZSBvcGVyYXRpb24gY29kZXMuXG4gKiBAZW51bSB7bnVtYmVyfVxuICovXG5jb25zdCBPcGVyYXRpb25Db2RlID0ge1xuICBDT05USU5VQVRJT05fRlJBTUU6IDAsXG4gIFRFWFRfRlJBTUU6IDEsXG4gIEJJTkFSWV9GUkFNRTogMixcbiAgQ09OTkVDVElPTl9DTE9TRTogOCxcbiAgUElORzogOSxcbiAgUE9ORzogMTBcbn07XG5cbi8qKlxuICogRXh0cmFjdHMgSFRUUCBoZWFkZXIgbWFwIGZyb20gSFRUUCBoZWFkZXIgc3RyaW5nLlxuICogQHBhcmFtIHtzdHJpbmd9IGh0dHBIZWFkZXJTdHJpbmcgSFRUUCBoZWFkZXIgc3RyaW5nLlxuICogQHJldHVybnMge01hcC48c3RyaW5nLCBzdHJpbmc+fSBIVFRQIGhlYWRlciBrZXktdmFsdWUgbWFwLlxuICovXG5mdW5jdGlvbiBnZXRIdHRwSGVhZGVycyhodHRwSGVhZGVyU3RyaW5nKSB7XG4gIHZhciBodHRwSGVhZGVycyA9IGh0dHBIZWFkZXJTdHJpbmcudHJpbSgpLnNwbGl0KENSTEYpO1xuICByZXR1cm4gbmV3IE1hcChodHRwSGVhZGVycy5tYXAoKGh0dHBIZWFkZXIpID0+IHtcbiAgICByZXR1cm4gaHR0cEhlYWRlci5zcGxpdCgnOicpLm1hcCgoZW50aXR5KSA9PiBlbnRpdHkudHJpbSgpKTtcbiAgfSkpO1xufVxuXG4vKipcbiAqIFBlcmZvcm1zIFdlYlNvY2tldCBIVFRQIEhhbmRzaGFrZS5cbiAqIEBwYXJhbSB7VWludDhBcnJheX0gaHR0cFJlcXVlc3REYXRhIEhUVFAgSGFuZHNoYWtlIGRhdGEgYXJyYXkuXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48eyByZXNwb25zZTogVWludDhBcnJheSwgaGVhZGVyczogTWFwPHN0cmluZywgc3RyaW5nPn0+fVxuICogQ29udGFpbnMgaGFuZHNoYWtlIGhlYWRlcnMgcmVjZWl2ZWQgZnJvbSBjbGllbnQgYW5kIHJlc3BvbnNlIHRvIHNlbmQuXG4gKi9cbmZ1bmN0aW9uIHBlcmZvcm1IYW5kc2hha2UoaHR0cFJlcXVlc3REYXRhKSB7XG4gIHZhciBodHRwSGVhZGVycyA9IGdldEh0dHBIZWFkZXJzKFxuICAgIFdlYlNvY2tldFV0aWxzLmFycmF5VG9TdHJpbmcoaHR0cFJlcXVlc3REYXRhKS5zcGxpdChDUkxGICsgQ1JMRilbMF1cbiAgKTtcblxuICB2YXIga2V5ID0gV2ViU29ja2V0VXRpbHMuc3RyaW5nVG9BcnJheShcbiAgICBodHRwSGVhZGVycy5nZXQoJ1NlYy1XZWJTb2NrZXQtS2V5JykgKyBXRUJTT0NLRVRfS0VZX0dVSURcbiAgKTtcblxuICB2YXIgc3VidGxlID0gd2luZG93LmNyeXB0by5zdWJ0bGU7XG4gIHJldHVybiBzdWJ0bGUuZGlnZXN0KHsgbmFtZTogJ1NIQS0xJyB9LCBrZXkpLnRoZW4oKGhhc2hBcnJheUJ1ZmZlcikgPT4ge1xuICAgIHZhciB3ZWJTb2NrZXRLZXkgPSBidG9hKFdlYlNvY2tldFV0aWxzLmFycmF5VG9TdHJpbmcoXG4gICAgICBuZXcgVWludDhBcnJheShoYXNoQXJyYXlCdWZmZXIpXG4gICAgKSk7XG5cbiAgICB2YXIgYXJyYXlSZXNwb25zZSA9IFdlYlNvY2tldFV0aWxzLnN0cmluZ1RvQXJyYXkoXG4gICAgICBXRUJTT0NLRVRfSEFORFNIQUtFX1JFU1BPTlNFLnJlcGxhY2UoJ3t3ZWItc29ja2V0LWtleX0nLCB3ZWJTb2NrZXRLZXkpXG4gICAgKTtcblxuICAgIHJldHVybiB7XG4gICAgICByZXNwb25zZTogYXJyYXlSZXNwb25zZSxcbiAgICAgIGhlYWRlcnM6IGh0dHBIZWFkZXJzXG4gICAgfTtcbiAgfSk7XG59XG5cbi8qKlxuICogQ3JlYXRlcyBvdXRnb2luZyB3ZWJzb2NrZXQgbWVzc2FnZSBmcmFtZS5cbiAqIEBwYXJhbSB7TnVtYmVyfSBvcENvZGUgRnJhbWUgb3BlcmF0aW9uIGNvZGUuXG4gKiBAcGFyYW0ge1VpbnQ4QXJyYXl9IGRhdGEgRGF0YSBhcnJheS5cbiAqIEBwYXJhbSB7Qm9vbGVhbn0gaXNDb21wbGV0ZSBJbmRpY2F0ZXMgaWYgZnJhbWUgaXMgY29tcGxldGVkLlxuICogQHBhcmFtIHtCb29sZWFuP30gaXNNYXNrZWQgSW5kaWNhdGVzIGlmIGZyYW1lIGRhdGEgc2hvdWxkIGJlIG1hc2tlZC5cbiAqIEByZXR1cm5zIHtVaW50OEFycmF5fSBDb25zdHJ1Y3RlZCBmcmFtZSBkYXRhLlxuICovXG5mdW5jdGlvbiBjcmVhdGVNZXNzYWdlRnJhbWUob3BDb2RlLCBkYXRhLCBpc0NvbXBsZXRlLCBpc01hc2tlZCkge1xuICB2YXIgZGF0YUxlbmd0aCA9IChkYXRhICYmIGRhdGEubGVuZ3RoKSB8fCAwO1xuICB2YXIgZGF0YU9mZnNldCA9IGlzTWFza2VkID8gNiA6IDI7XG5cbiAgdmFyIHNlY29uZEJ5dGUgPSAwO1xuICBpZiAoZGF0YUxlbmd0aCA+PSA2NTUzNikge1xuICAgIGRhdGFPZmZzZXQgKz0gODtcbiAgICBzZWNvbmRCeXRlID0gMTI3O1xuICB9IGVsc2UgaWYgKGRhdGFMZW5ndGggPiAxMjUpIHtcbiAgICBkYXRhT2Zmc2V0ICs9IDI7XG4gICAgc2Vjb25kQnl0ZSA9IDEyNjtcbiAgfSBlbHNlIHtcbiAgICBzZWNvbmRCeXRlID0gZGF0YUxlbmd0aDtcbiAgfVxuXG4gIHZhciBvdXRwdXRCdWZmZXIgPSBuZXcgVWludDhBcnJheShkYXRhT2Zmc2V0ICsgZGF0YUxlbmd0aCk7XG5cbiAgLy8gV3JpdGluZyBPUENPREUsIEZJTiBhbmQgTEVOR1RIXG4gIG91dHB1dEJ1ZmZlclswXSA9IGlzQ29tcGxldGUgPyBvcENvZGUgfCAweDgwIDogb3BDb2RlO1xuICBvdXRwdXRCdWZmZXJbMV0gPSBpc01hc2tlZCA/IHNlY29uZEJ5dGUgfCAweDgwIDogc2Vjb25kQnl0ZTtcblxuICAvLyBXcml0aW5nIERBVEEgTEVOR1RIXG4gIHN3aXRjaCAoc2Vjb25kQnl0ZSkge1xuICAgIGNhc2UgMTI2OlxuICAgICAgV2ViU29ja2V0VXRpbHMud3JpdGVVSW50MTYob3V0cHV0QnVmZmVyLCBkYXRhTGVuZ3RoLCAyKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgMTI3OlxuICAgICAgV2ViU29ja2V0VXRpbHMud3JpdGVVSW50MzIob3V0cHV0QnVmZmVyLCAwLCAyKTtcbiAgICAgIFdlYlNvY2tldFV0aWxzLndyaXRlVUludDMyKG91dHB1dEJ1ZmZlciwgZGF0YUxlbmd0aCwgNik7XG4gICAgICBicmVhaztcbiAgfVxuXG4gIGlmIChpc01hc2tlZCAmJiBkYXRhTGVuZ3RoKSB7XG4gICAgdmFyIG1hc2sgPSBXZWJTb2NrZXRVdGlscy5nZW5lcmF0ZVJhbmRvbU1hc2soKTtcblxuICAgIC8vIFdyaXRpbmcgTUFTS1xuICAgIG91dHB1dEJ1ZmZlci5zZXQobWFzaywgZGF0YU9mZnNldCAtIDQpO1xuXG4gICAgV2ViU29ja2V0VXRpbHMubWFzayhtYXNrLCBkYXRhKTtcbiAgfVxuXG4gIGZvcih2YXIgaSA9IDA7IGkgPCBkYXRhTGVuZ3RoOyBpKyspIHtcbiAgICBvdXRwdXRCdWZmZXJbZGF0YU9mZnNldCArIGldID0gZGF0YVtpXTtcbiAgfVxuXG4gIHJldHVybiBvdXRwdXRCdWZmZXI7XG59XG5cbnZhciBwcml2YXRlcyA9IHtcbiAgdGNwU2VydmVyU29ja2V0OiBTeW1ib2woJ3RjcC1zb2NrZXQnKSxcbiAgb25UQ1BTZXJ2ZXJTb2NrZXRDb25uZWN0OiBTeW1ib2woJ29uVENQU2VydmVyU29ja2V0Q29ubmVjdCcpLFxuICBvblRDUFNlcnZlclNvY2tldENsb3NlOiBTeW1ib2woJ29uVENQU2VydmVyU29ja2V0Q2xvc2UnKSxcblxuICBvblRDUFNvY2tldERhdGE6IFN5bWJvbCgnb25UQ1BTb2NrZXREYXRhJyksXG4gIG9uVENQU29ja2V0Q2xvc2U6IFN5bWJvbCgnb25UQ1BTb2NrZXRDbG9zZScpLFxuXG4gIGNsaWVudHM6IFN5bWJvbCgnY2xpZW50cycpLFxuXG4gIG9uTWVzc2FnZUZyYW1lOiBTeW1ib2woJ29uTWVzc2FnZUZyYW1lJylcbn07XG5cbi8qKlxuICogV2ViU29ja2V0U2VydmVyIGNvbnN0cnVjdG9yIHRoYXQgYWNjZXB0cyBwb3J0IHRvIGxpc3RlbiBvbi5cbiAqIEBwYXJhbSB7TnVtYmVyfSBwb3J0IE51bWJlciB0byBsaXN0ZW4gZm9yIHdlYnNvY2tldCBjb25uZWN0aW9ucy5cbiAqL1xuY2xhc3MgV2ViU29ja2V0U2VydmVyIHtcbiAgY29uc3RydWN0b3IocG9ydCkge1xuICAgIEV2ZW50RGlzcGF0Y2hlci5taXhpbih0aGlzLCBbJ21lc3NhZ2UnLCAnc3RvcCddKTtcblxuICAgIHZhciB0Y3BTZXJ2ZXJTb2NrZXQgPSB0aGlzW3ByaXZhdGVzLnRjcFNlcnZlclNvY2tldF0gPVxuICAgICAgbmF2aWdhdG9yLm1velRDUFNvY2tldC5saXN0ZW4ocG9ydCwgeyBiaW5hcnlUeXBlOiAnYXJyYXlidWZmZXInIH0pO1xuXG4gICAgdGNwU2VydmVyU29ja2V0Lm9uY29ubmVjdCA9IHRoaXNbcHJpdmF0ZXMub25UQ1BTZXJ2ZXJTb2NrZXRDb25uZWN0XS5iaW5kKFxuICAgICAgdGhpc1xuICAgICk7XG5cbiAgICB0Y3BTZXJ2ZXJTb2NrZXQub25lcnJvciA9IHRoaXNbcHJpdmF0ZXMub25UQ1BTZXJ2ZXJTb2NrZXRDbG9zZV0uYmluZCh0aGlzKTtcblxuICAgIHRoaXNbcHJpdmF0ZXMuY2xpZW50c10gPSBuZXcgTWFwKCk7XG4gIH1cblxuICAvKipcbiAgICogU2VuZCBkYXRhIHRvIHRoZSBjb25uZWN0ZWQgY2xpZW50XG4gICAqIEBwYXJhbSB7QXJyYXlCdWZmZXJ8QXJyYXl8c3RyaW5nfSBkYXRhIERhdGEgdG8gc2VuZC5cbiAgICovXG4gIHNlbmQoZGF0YSkge1xuICAgIGlmICghQXJyYXlCdWZmZXIuaXNWaWV3KGRhdGEpICYmICEoZGF0YSBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSkge1xuICAgICAgaWYgKHR5cGVvZiBkYXRhID09PSAnc3RyaW5nJykge1xuICAgICAgICBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoV2ViU29ja2V0VXRpbHMuc3RyaW5nVG9BcnJheShkYXRhKSk7XG4gICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcbiAgICAgICAgZGF0YSA9IG5ldyBVaW50OEFycmF5KGRhdGEpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbnN1cHBvcnRlZCBkYXRhIHR5cGU6ICcgKyB0eXBlb2YgZGF0YSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIGRhdGFGcmFtZSA9IGNyZWF0ZU1lc3NhZ2VGcmFtZShcbiAgICAgIE9wZXJhdGlvbkNvZGUuQklOQVJZX0ZSQU1FLFxuICAgICAgZGF0YSxcbiAgICAgIHRydWUgLyogaXNDb21wbGV0ZWQgKi8sXG4gICAgICBmYWxzZSAvKiBpc01hc2tlZCAqL1xuICAgICk7XG5cbiAgICB0aGlzW3ByaXZhdGVzLmNsaWVudHNdLmZvckVhY2goKGNsaWVudCkgPT4ge1xuICAgICAgY2xpZW50LnNvY2tldC5zZW5kKGRhdGFGcmFtZS5idWZmZXIsIDAsIGRhdGFGcmFtZS5sZW5ndGgpO1xuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIERlc3Ryb3lzIHNvY2tldCBjb25uZWN0aW9uLlxuICAgKi9cbiAgc3RvcCgpIHtcbiAgICB0aGlzW3ByaXZhdGVzLmNsaWVudHNdLmZvckVhY2goKGNsaWVudCkgPT4ge1xuICAgICAgdGhpc1twcml2YXRlcy5vblRDUFNvY2tldENsb3NlXShjbGllbnQuc29ja2V0KTtcbiAgICB9KTtcblxuICAgIHZhciB0Y3BTZXJ2ZXJTb2NrZXQgPSB0aGlzW3ByaXZhdGVzLnRjcFNlcnZlclNvY2tldF07XG4gICAgaWYgKHRjcFNlcnZlclNvY2tldCkge1xuICAgICAgdGNwU2VydmVyU29ja2V0LmNsb3NlKCk7XG4gICAgICB0aGlzW3ByaXZhdGVzLm9uVENQU2VydmVyU29ja2V0Q2xvc2VdKCk7XG4gICAgfVxuICB9XG5cbiAgW3ByaXZhdGVzLm9uVENQU2VydmVyU29ja2V0Q29ubmVjdF0odGNwU29ja2V0KSB7XG4gICAgdGNwU29ja2V0Lm9uZGF0YSA9IHRoaXNbcHJpdmF0ZXMub25UQ1BTb2NrZXREYXRhXS5iaW5kKHRoaXMpO1xuICAgIHRjcFNvY2tldC5vbmNsb3NlID0gdGNwU29ja2V0Lm9uZXJyb3IgPVxuICAgICAgdGhpc1twcml2YXRlcy5vblRDUFNvY2tldENsb3NlXS5iaW5kKHRoaXMsIHRjcFNvY2tldCk7XG4gIH1cblxuICAvKipcbiAgICogTW96VGNwU29ja2V0IGRhdGEgaGFuZGxlci5cbiAgICogQHBhcmFtIHtUQ1BTb2NrZXRFdmVudH0gc29ja2V0RXZlbnQgVENQU29ja2V0IGRhdGEgZXZlbnQuXG4gICAqL1xuICBbcHJpdmF0ZXMub25UQ1BTb2NrZXREYXRhXShzb2NrZXRFdmVudCkge1xuICAgIHZhciBzb2NrZXQgPSBzb2NrZXRFdmVudC50YXJnZXQ7XG4gICAgdmFyIGNsaWVudElkID0gc29ja2V0Lmhvc3QgKyAnOicgKyBzb2NrZXQucG9ydDtcbiAgICB2YXIgY2xpZW50ID0gdGhpc1twcml2YXRlcy5jbGllbnRzXS5nZXQoY2xpZW50SWQpO1xuXG4gICAgdmFyIGZyYW1lRGF0YSA9IG5ldyBVaW50OEFycmF5KHNvY2tldEV2ZW50LmRhdGEpO1xuXG4gICAgLy8gSWYgd2UgZG9uJ3QgaGF2ZSBjb25uZWN0aW9uIGluZm8gZnJvbSB0aGlzIGhvc3QgbGV0J3MgcGVyZm9ybSBoYW5kc2hha2UuXG4gICAgaWYgKCFjbGllbnQpIHtcbiAgICAgIHBlcmZvcm1IYW5kc2hha2UoZnJhbWVEYXRhKS50aGVuKChoYW5kc2hha2UpID0+IHtcbiAgICAgICAgaWYgKCFoYW5kc2hha2UpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAnSGFuZHNoYWtlIHdpdGggaG9zdCAlczolcyBmYWlsZWQnLCBzb2NrZXQuaG9zdCwgc29ja2V0LnBvcnRcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgc29ja2V0LnNlbmQoXG4gICAgICAgICAgaGFuZHNoYWtlLnJlc3BvbnNlLmJ1ZmZlciwgMCwgaGFuZHNoYWtlLnJlc3BvbnNlLmJ5dGVMZW5ndGhcbiAgICAgICAgKTtcblxuICAgICAgICB2YXIgY2xpZW50ID0ge1xuICAgICAgICAgIHNvY2tldDogc29ja2V0LFxuICAgICAgICAgIGhlYWRlcnM6IGhhbmRzaGFrZS5oZWFkZXJzLFxuICAgICAgICAgIGJ1ZmZlcjogbmV3IFdlYlNvY2tldEZyYW1lQnVmZmVyKClcbiAgICAgICAgfTtcblxuICAgICAgICBjbGllbnQuYnVmZmVyLm9uKFxuICAgICAgICAgICdmcmFtZScsIHRoaXNbcHJpdmF0ZXMub25NZXNzYWdlRnJhbWVdLmJpbmQodGhpcywgY2xpZW50KVxuICAgICAgICApO1xuXG4gICAgICAgIHRoaXNbcHJpdmF0ZXMuY2xpZW50c10uc2V0KGNsaWVudElkLCBjbGllbnQpO1xuICAgICAgfSkuY2F0Y2goKCkgPT4ge1xuICAgICAgICB0aGlzW3ByaXZhdGVzLm9uVENQU29ja2V0Q2xvc2VdKHNvY2tldCk7XG4gICAgICB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjbGllbnQuYnVmZmVyLnB1dChmcmFtZURhdGEpO1xuICB9XG5cbiAgLyoqXG4gICAqIFByb2Nlc3MgV2ViU29ja2V0IGluY29taW5nIGZyYW1lLlxuICAgKiBAcGFyYW0ge3tzb2NrZXQ6IFRDUFNvY2tldCwgYnVmZmVyOiBXZWJTb2NrZXRGcmFtZUJ1ZmZlcn19IGNsaWVudCBDbGllbnRcbiAgICogZGVzY3JpcHRvciBvYmplY3QuXG4gICAqL1xuICBbcHJpdmF0ZXMub25NZXNzYWdlRnJhbWVdKGNsaWVudCkge1xuICAgIGNsaWVudC5idWZmZXIuZ2V0KDIpLnRoZW4oKGNvbnRyb2xEYXRhKSA9PiB7XG4gICAgICB2YXIgc3RhdGUgPSB7XG4gICAgICAgIGlzQ29tcGxldGVkOiAoY29udHJvbERhdGFbMF0gJiAweDgwKSA9PT0gMHg4MCxcbiAgICAgICAgaXNNYXNrZWQ6IChjb250cm9sRGF0YVsxXSAmIDB4ODApID09PSAweDgwLFxuICAgICAgICBpc0NvbXByZXNzZWQ6IChjb250cm9sRGF0YVswXSAmIDB4NDApID09PSAweDQwLFxuICAgICAgICBvcENvZGU6IGNvbnRyb2xEYXRhWzBdICYgMHhmLFxuICAgICAgICBkYXRhTGVuZ3RoOiBjb250cm9sRGF0YVsxXSAmIDB4N2YsXG4gICAgICAgIG1hc2s6IG51bGwsXG4gICAgICAgIGRhdGE6IFtdXG4gICAgICB9O1xuXG4gICAgICBpZiAoc3RhdGUub3BDb2RlID09PSBPcGVyYXRpb25Db2RlLkNPTlRJTlVBVElPTl9GUkFNRSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvbnRpbnVhdGlvbiBmcmFtZSBpcyBub3QgeWV0IHN1cHBvcnRlZCEnKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHN0YXRlLm9wQ29kZSA9PT0gT3BlcmF0aW9uQ29kZS5QT05HKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUG9uZyBmcmFtZSBpcyBub3QgeWV0IHN1cHBvcnRlZCEnKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHN0YXRlLm9wQ29kZSA+PSAzICYmIHN0YXRlLm9wQ29kZSA8PSA3KSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAnUmVzZXJ2ZWQgZm9yIGZ1dHVyZSBub24tY29udHJvbCBmcmFtZXMgYXJlIG5vdCBzdXBwb3J0ZWQhJ1xuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBpZiAoc3RhdGUub3BDb2RlID4gMTApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICdSZXNlcnZlZCBmb3IgZnV0dXJlIGNvbnRyb2wgZnJhbWVzIGFyZSBub3Qgc3VwcG9ydGVkISdcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHN0YXRlO1xuICAgIH0pLnRoZW4oKHN0YXRlKSA9PiB7XG4gICAgICB2YXIgZGF0YUxlbmd0aFByb21pc2U7XG4gICAgICBpZiAoc3RhdGUuZGF0YUxlbmd0aCA9PT0gMTI2KSB7XG4gICAgICAgIGRhdGFMZW5ndGhQcm9taXNlID0gY2xpZW50LmJ1ZmZlci5nZXQoMikudGhlbihcbiAgICAgICAgICAoZGF0YSkgPT4gV2ViU29ja2V0VXRpbHMucmVhZFVJbnQxNihkYXRhKVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChzdGF0ZS5kYXRhTGVuZ3RoID09IDEyNykge1xuICAgICAgICBkYXRhTGVuZ3RoUHJvbWlzZSA9IGNsaWVudC5idWZmZXIuZ2V0KDQpLnRoZW4oXG4gICAgICAgICAgKGRhdGEpID0+IFdlYlNvY2tldFV0aWxzLnJlYWRVSW50MzIoZGF0YSlcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRhdGFMZW5ndGhQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKHN0YXRlLmRhdGFMZW5ndGgpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gZGF0YUxlbmd0aFByb21pc2UudGhlbigoZGF0YUxlbmd0aCkgPT4ge1xuICAgICAgICBzdGF0ZS5kYXRhTGVuZ3RoID0gZGF0YUxlbmd0aDtcbiAgICAgICAgcmV0dXJuIHN0YXRlO1xuICAgICAgfSk7XG4gICAgfSkudGhlbigoc3RhdGUpID0+IHtcbiAgICAgIGlmIChzdGF0ZS5pc01hc2tlZCkge1xuICAgICAgICByZXR1cm4gY2xpZW50LmJ1ZmZlci5nZXQoNCkudGhlbigobWFzaykgPT4ge1xuICAgICAgICAgIHN0YXRlLm1hc2sgPSBtYXNrO1xuICAgICAgICAgIHJldHVybiBzdGF0ZTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc3RhdGU7XG4gICAgfSkudGhlbigoc3RhdGUpID0+IHtcbiAgICAgIGlmIChzdGF0ZS5kYXRhTGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBjbGllbnQuYnVmZmVyLmdldChzdGF0ZS5kYXRhTGVuZ3RoKS50aGVuKChkYXRhKSA9PiB7XG4gICAgICAgICAgc3RhdGUuZGF0YSA9IFdlYlNvY2tldFV0aWxzLm1hc2soc3RhdGUubWFzaywgZGF0YSk7XG4gICAgICAgICAgcmV0dXJuIHN0YXRlO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzdGF0ZTtcbiAgICB9KS50aGVuKChzdGF0ZSkgPT4ge1xuICAgICAgdmFyIGRhdGFGcmFtZTtcbiAgICAgIGlmIChzdGF0ZS5vcENvZGUgPT09IE9wZXJhdGlvbkNvZGUuQ09OTkVDVElPTl9DTE9TRSkge1xuICAgICAgICB2YXIgY29kZSA9IDA7XG4gICAgICAgIHZhciByZWFzb24gPSAnVW5rbm93bic7XG5cbiAgICAgICAgaWYgKHN0YXRlLmRhdGFMZW5ndGggPiAwKSB7XG4gICAgICAgICAgY29kZSA9ICBXZWJTb2NrZXRVdGlscy5yZWFkVUludDE2KHN0YXRlLmRhdGEpO1xuICAgICAgICAgIGlmIChzdGF0ZS5kYXRhTGVuZ3RoID4gMikge1xuICAgICAgICAgICAgcmVhc29uID0gV2ViU29ja2V0VXRpbHMuYXJyYXlUb1N0cmluZyhzdGF0ZS5kYXRhLnN1YmFycmF5KDIpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjb25zb2xlLmxvZygnU29ja2V0IGlzIGNsb3NlZDogJXMgKGNvZGUgaXMgJXMpJywgcmVhc29uLCBjb2RlKTtcblxuICAgICAgICBkYXRhRnJhbWUgPSBjcmVhdGVNZXNzYWdlRnJhbWUoXG4gICAgICAgICAgT3BlcmF0aW9uQ29kZS5DT05ORUNUSU9OX0NMT1NFLCBzdGF0ZS5kYXRhLCB0cnVlIC8qIGlzQ29tcGxldGVkICovXG4gICAgICAgICk7XG4gICAgICAgIGNsaWVudC5zb2NrZXQuc2VuZChkYXRhRnJhbWUuYnVmZmVyLCAwLCBkYXRhRnJhbWUubGVuZ3RoKTtcbiAgICAgICAgdGhpc1twcml2YXRlcy5vblRDUFNvY2tldENsb3NlXShjbGllbnQuc29ja2V0KTtcbiAgICAgIH0gZWxzZSBpZiAoc3RhdGUub3BDb2RlID09PSBPcGVyYXRpb25Db2RlLlRFWFRfRlJBTUUgfHxcbiAgICAgICAgICAgICAgICAgc3RhdGUub3BDb2RlID09PSBPcGVyYXRpb25Db2RlLkJJTkFSWV9GUkFNRSkge1xuICAgICAgICB0aGlzLmVtaXQoJ21lc3NhZ2UnLCBzdGF0ZS5kYXRhKTtcbiAgICAgIH0gZWxzZSBpZiAoc3RhdGUub3BDb2RlID09PSBPcGVyYXRpb25Db2RlLlBJTkcpIHtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgJ1BJTkcgZnJhbWUgaXMgcmVjZWl2ZWQgKG1hc2tlZDogJXMsIGhhc0RhdGE6ICVzKScsXG4gICAgICAgICAgc3RhdGUuaXNNYXNrZWQsXG4gICAgICAgICAgISFzdGF0ZS5kYXRhXG4gICAgICAgICk7XG5cbiAgICAgICAgaWYgKCFzdGF0ZS5pc0NvbXBsZXRlZCkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRnJhZ21lbnRlZCBQaW5nIGZyYW1lIGlzIG5vdCBzdXBwb3J0ZWQhJyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUuZGF0YUxlbmd0aCA+IDEyNSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgICdQaW5nIGZyYW1lIGNhbiBub3QgaGF2ZSBtb3JlIHRoYW4gMTI1IGJ5dGVzIG9mIGRhdGEhJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBkYXRhRnJhbWUgPSBjcmVhdGVNZXNzYWdlRnJhbWUoXG4gICAgICAgICAgT3BlcmF0aW9uQ29kZS5QT05HLCBzdGF0ZS5kYXRhLCB0cnVlIC8qIGlzQ29tcGxldGVkICovLCBzdGF0ZS5pc01hc2tlZFxuICAgICAgICApO1xuICAgICAgICBjbGllbnQuc29ja2V0LnNlbmQoZGF0YUZyYW1lLmJ1ZmZlciwgMCwgZGF0YUZyYW1lLmxlbmd0aCk7XG4gICAgICB9XG5cbiAgICAgIGlmICghY2xpZW50LmJ1ZmZlci5pc0VtcHR5KCkpIHtcbiAgICAgICAgdGhpc1twcml2YXRlcy5vbk1lc3NhZ2VGcmFtZV0oY2xpZW50KTtcbiAgICAgIH1cbiAgICB9KS5jYXRjaCgoZSkgPT4ge1xuICAgICAgdmFyIGNvZGUgPSAxMDAyO1xuICAgICAgdmFyIHJlYXNvbiA9IGUubWVzc2FnZSB8fCBlLm5hbWUgfHwgJ1Vua25vd24gZmFpbHVyZSBvbiBzZXJ2ZXInO1xuXG4gICAgICBjb25zb2xlLmxvZygnU29ja2V0IGlzIGNsb3NlZDogJXMgKGNvZGUgaXMgJXMpJywgcmVhc29uLCBjb2RlKTtcblxuICAgICAgLy8gMiBieXRlcyBmb3IgdGhlIGNvZGUgYW5kIHRoZSByZXN0IGZvciB0aGUgcmVhc29uLlxuICAgICAgdmFyIGRhdGEgPSBuZXcgVWludDhBcnJheSgyICsgcmVhc29uLmxlbmd0aCk7XG4gICAgICBXZWJTb2NrZXRVdGlscy53cml0ZVVJbnQxNihkYXRhLCBjb2RlLCAwKTtcbiAgICAgIGRhdGEuc2V0KFdlYlNvY2tldFV0aWxzLnN0cmluZ1RvQXJyYXkocmVhc29uKSwgMik7XG5cbiAgICAgIHZhciBkYXRhRnJhbWUgPSBjcmVhdGVNZXNzYWdlRnJhbWUoXG4gICAgICAgIE9wZXJhdGlvbkNvZGUuQ09OTkVDVElPTl9DTE9TRSwgZGF0YSwgdHJ1ZSAvKiBpc0NvbXBsZXRlZCAqL1xuICAgICAgKTtcbiAgICAgIGNsaWVudC5zb2NrZXQuc2VuZChkYXRhRnJhbWUuYnVmZmVyLCAwLCBkYXRhRnJhbWUubGVuZ3RoKTtcbiAgICAgIHRoaXNbcHJpdmF0ZXMub25UQ1BTb2NrZXRDbG9zZV0oY2xpZW50LnNvY2tldCk7XG4gICAgfSk7XG4gIH1cblxuICBbcHJpdmF0ZXMub25UQ1BTb2NrZXRDbG9zZV0oc29ja2V0KSB7XG4gICAgaWYgKCFzb2NrZXQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgc29ja2V0LmNsb3NlKCk7XG4gICAgICBzb2NrZXQub25kYXRhID0gc29ja2V0Lm9uZXJyb3IgPSBzb2NrZXQub25jbG9zZSA9IG51bGw7XG4gICAgfSBjYXRjaChlKSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgJ0Vycm9yIG9jY3VycmVkIHdoaWxlIGNsb3Npbmcgc29ja2V0ICVzJywgZS5tZXNzYWdlIHx8IGUubmFtZVxuICAgICAgKTtcbiAgICB9XG5cbiAgICB0aGlzW3ByaXZhdGVzLmNsaWVudHNdLmRlbGV0ZShzb2NrZXQuaG9zdCArICc6JyArIHNvY2tldC5wb3J0KTtcbiAgfVxuXG4gIFtwcml2YXRlcy5vblRDUFNlcnZlclNvY2tldENsb3NlXSgpIHtcbiAgICB2YXIgdGNwU2VydmVyU29ja2V0ID0gdGhpc1twcml2YXRlcy50Y3BTZXJ2ZXJTb2NrZXRdO1xuXG4gICAgaWYgKCF0Y3BTZXJ2ZXJTb2NrZXQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0Y3BTZXJ2ZXJTb2NrZXQub25jb25uZWN0ID0gdGNwU2VydmVyU29ja2V0Lm9uZXJyb3IgPSBudWxsO1xuXG4gICAgdGhpc1twcml2YXRlcy50Y3BTZXJ2ZXJTb2NrZXRdID0gbnVsbDtcblxuICAgIHRoaXMuZW1pdCgnc3RvcCcpO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IHtcbiAgU2VydmVyOiBXZWJTb2NrZXRTZXJ2ZXIsXG4gIFV0aWxzOiBXZWJTb2NrZXRVdGlscyxcbiAgRnJhbWVCdWZmZXI6IFdlYlNvY2tldEZyYW1lQnVmZmVyXG59O1xuIiwiLypnbG9iYWwgTWFwLCBTZXQgKi9cblxuZnVuY3Rpb24gZW5zdXJlVmFsaWRFdmVudE5hbWUoZXZlbnROYW1lKSB7XG4gIGlmICghZXZlbnROYW1lIHx8IHR5cGVvZiBldmVudE5hbWUgIT09ICdzdHJpbmcnKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdFdmVudCBuYW1lIHNob3VsZCBiZSBhIHZhbGlkIG5vbi1lbXB0eSBzdHJpbmchJyk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZW5zdXJlVmFsaWRIYW5kbGVyKGhhbmRsZXIpIHtcbiAgaWYgKHR5cGVvZiBoYW5kbGVyICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdIYW5kbGVyIHNob3VsZCBiZSBhIGZ1bmN0aW9uIScpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGVuc3VyZUFsbG93ZWRFdmVudE5hbWUoYWxsb3dlZEV2ZW50cywgZXZlbnROYW1lKSB7XG4gIGlmIChhbGxvd2VkRXZlbnRzICYmIGFsbG93ZWRFdmVudHMuaW5kZXhPZihldmVudE5hbWUpIDwgMCkge1xuICAgIHRocm93IG5ldyBFcnJvcignRXZlbnQgXCInICsgZXZlbnROYW1lICsgJ1wiIGlzIG5vdCBhbGxvd2VkIScpO1xuICB9XG59XG5cbi8vIEltcGxlbWVudHMgcHVibGlzaC9zdWJzY3JpYmUgYmVoYXZpb3VyIHRoYXQgY2FuIGJlIGFwcGxpZWQgdG8gYW55IG9iamVjdCxcbi8vIHNvIHRoYXQgb2JqZWN0IGNhbiBiZSBsaXN0ZW5lZCBmb3IgY3VzdG9tIGV2ZW50cy4gXCJ0aGlzXCIgY29udGV4dCBpcyB0aGVcbi8vIG9iamVjdCB3aXRoIE1hcCBcImxpc3RlbmVyc1wiIHByb3BlcnR5IHVzZWQgdG8gc3RvcmUgaGFuZGxlcnMuXG52YXIgZXZlbnREaXNwYXRjaGVyID0ge1xuICAvKipcbiAgICogUmVnaXN0ZXJzIGxpc3RlbmVyIGZ1bmN0aW9uIHRvIGJlIGV4ZWN1dGVkIG9uY2UgZXZlbnQgb2NjdXJzLlxuICAgKiBAcGFyYW0ge3N0cmluZ30gZXZlbnROYW1lIE5hbWUgb2YgdGhlIGV2ZW50IHRvIGxpc3RlbiBmb3IuXG4gICAqIEBwYXJhbSB7ZnVuY3Rpb259IGhhbmRsZXIgSGFuZGxlciB0byBiZSBleGVjdXRlZCBvbmNlIGV2ZW50IG9jY3Vycy5cbiAgICovXG4gIG9uOiBmdW5jdGlvbihldmVudE5hbWUsIGhhbmRsZXIpIHtcbiAgICBlbnN1cmVWYWxpZEV2ZW50TmFtZShldmVudE5hbWUpO1xuICAgIGVuc3VyZUFsbG93ZWRFdmVudE5hbWUodGhpcy5hbGxvd2VkRXZlbnRzLCBldmVudE5hbWUpO1xuICAgIGVuc3VyZVZhbGlkSGFuZGxlcihoYW5kbGVyKTtcblxuICAgIHZhciBoYW5kbGVycyA9IHRoaXMubGlzdGVuZXJzLmdldChldmVudE5hbWUpO1xuXG4gICAgaWYgKCFoYW5kbGVycykge1xuICAgICAgaGFuZGxlcnMgPSBuZXcgU2V0KCk7XG4gICAgICB0aGlzLmxpc3RlbmVycy5zZXQoZXZlbnROYW1lLCBoYW5kbGVycyk7XG4gICAgfVxuXG4gICAgLy8gU2V0LmFkZCBpZ25vcmVzIGhhbmRsZXIgaWYgaXQgaGFzIGJlZW4gYWxyZWFkeSByZWdpc3RlcmVkXG4gICAgaGFuZGxlcnMuYWRkKGhhbmRsZXIpO1xuICB9LFxuXG4gIC8qKlxuICAgKiBSZW1vdmVzIHJlZ2lzdGVyZWQgbGlzdGVuZXIgZm9yIHRoZSBzcGVjaWZpZWQgZXZlbnQuXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBldmVudE5hbWUgTmFtZSBvZiB0aGUgZXZlbnQgdG8gcmVtb3ZlIGxpc3RlbmVyIGZvci5cbiAgICogQHBhcmFtIHtmdW5jdGlvbn0gaGFuZGxlciBIYW5kbGVyIHRvIHJlbW92ZSwgc28gaXQgd29uJ3QgYmUgZXhlY3V0ZWRcbiAgICogbmV4dCB0aW1lIGV2ZW50IG9jY3Vycy5cbiAgICovXG4gIG9mZjogZnVuY3Rpb24oZXZlbnROYW1lLCBoYW5kbGVyKSB7XG4gICAgZW5zdXJlVmFsaWRFdmVudE5hbWUoZXZlbnROYW1lKTtcbiAgICBlbnN1cmVBbGxvd2VkRXZlbnROYW1lKHRoaXMuYWxsb3dlZEV2ZW50cywgZXZlbnROYW1lKTtcbiAgICBlbnN1cmVWYWxpZEhhbmRsZXIoaGFuZGxlcik7XG5cbiAgICB2YXIgaGFuZGxlcnMgPSB0aGlzLmxpc3RlbmVycy5nZXQoZXZlbnROYW1lKTtcblxuICAgIGlmICghaGFuZGxlcnMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBoYW5kbGVycy5kZWxldGUoaGFuZGxlcik7XG5cbiAgICBpZiAoIWhhbmRsZXJzLnNpemUpIHtcbiAgICAgIHRoaXMubGlzdGVuZXJzLmRlbGV0ZShldmVudE5hbWUpO1xuICAgIH1cbiAgfSxcblxuICAvKipcbiAgICogUmVtb3ZlcyBhbGwgcmVnaXN0ZXJlZCBsaXN0ZW5lcnMgZm9yIHRoZSBzcGVjaWZpZWQgZXZlbnQuXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBldmVudE5hbWUgTmFtZSBvZiB0aGUgZXZlbnQgdG8gcmVtb3ZlIGFsbCBsaXN0ZW5lcnMgZm9yLlxuICAgKi9cbiAgb2ZmQWxsOiBmdW5jdGlvbihldmVudE5hbWUpIHtcbiAgICBpZiAodHlwZW9mIGV2ZW50TmFtZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHRoaXMubGlzdGVuZXJzLmNsZWFyKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZW5zdXJlVmFsaWRFdmVudE5hbWUoZXZlbnROYW1lKTtcbiAgICBlbnN1cmVBbGxvd2VkRXZlbnROYW1lKHRoaXMuYWxsb3dlZEV2ZW50cywgZXZlbnROYW1lKTtcblxuICAgIHZhciBoYW5kbGVycyA9IHRoaXMubGlzdGVuZXJzLmdldChldmVudE5hbWUpO1xuXG4gICAgaWYgKCFoYW5kbGVycykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGhhbmRsZXJzLmNsZWFyKCk7XG5cbiAgICB0aGlzLmxpc3RlbmVycy5kZWxldGUoZXZlbnROYW1lKTtcbiAgfSxcblxuICAvKipcbiAgICogRW1pdHMgc3BlY2lmaWVkIGV2ZW50IHNvIHRoYXQgYWxsIHJlZ2lzdGVyZWQgaGFuZGxlcnMgd2lsbCBiZSBjYWxsZWRcbiAgICogd2l0aCB0aGUgc3BlY2lmaWVkIHBhcmFtZXRlcnMuXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBldmVudE5hbWUgTmFtZSBvZiB0aGUgZXZlbnQgdG8gY2FsbCBoYW5kbGVycyBmb3IuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBwYXJhbWV0ZXJzIE9wdGlvbmFsIHBhcmFtZXRlcnMgdGhhdCB3aWxsIGJlIHBhc3NlZCB0b1xuICAgKiBldmVyeSByZWdpc3RlcmVkIGhhbmRsZXIuXG4gICAqL1xuICBlbWl0OiBmdW5jdGlvbihldmVudE5hbWUsIHBhcmFtZXRlcnMpIHtcbiAgICBlbnN1cmVWYWxpZEV2ZW50TmFtZShldmVudE5hbWUpO1xuICAgIGVuc3VyZUFsbG93ZWRFdmVudE5hbWUodGhpcy5hbGxvd2VkRXZlbnRzLCBldmVudE5hbWUpO1xuXG4gICAgdmFyIGhhbmRsZXJzID0gdGhpcy5saXN0ZW5lcnMuZ2V0KGV2ZW50TmFtZSk7XG5cbiAgICBpZiAoIWhhbmRsZXJzKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaGFuZGxlcnMuZm9yRWFjaChmdW5jdGlvbihoYW5kbGVyKSB7XG4gICAgICB0cnkge1xuICAgICAgICBoYW5kbGVyKHBhcmFtZXRlcnMpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKGUpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG59O1xuXG5leHBvcnQgZGVmYXVsdCB7XG4gIC8qKlxuICAgKiBNaXhlcyBkaXNwYXRjaGVyIG1ldGhvZHMgaW50byB0YXJnZXQgb2JqZWN0LlxuICAgKiBAcGFyYW0ge09iamVjdH0gdGFyZ2V0IE9iamVjdCB0byBtaXggZGlzcGF0Y2hlciBtZXRob2RzIGludG8uXG4gICAqIEBwYXJhbSB7QXJyYXkuPHN0cmluZz59IGFsbG93ZWRFdmVudHMgT3B0aW9uYWwgbGlzdCBvZiB0aGUgYWxsb3dlZCBldmVudFxuICAgKiBuYW1lcyB0aGF0IGNhbiBiZSBlbWl0dGVkIGFuZCBsaXN0ZW5lZCBmb3IuXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRhcmdldCBvYmplY3Qgd2l0aCBhZGRlZCBkaXNwYXRjaGVyIG1ldGhvZHMuXG4gICAqL1xuICBtaXhpbjogZnVuY3Rpb24odGFyZ2V0LCBhbGxvd2VkRXZlbnRzKSB7XG4gICAgaWYgKCF0YXJnZXQgfHwgdHlwZW9mIHRhcmdldCAhPT0gJ29iamVjdCcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignT2JqZWN0IHRvIG1peCBpbnRvIHNob3VsZCBiZSB2YWxpZCBvYmplY3QhJyk7XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBhbGxvd2VkRXZlbnRzICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgICAhQXJyYXkuaXNBcnJheShhbGxvd2VkRXZlbnRzKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdBbGxvd2VkIGV2ZW50cyBzaG91bGQgYmUgYSB2YWxpZCBhcnJheSBvZiBzdHJpbmdzIScpO1xuICAgIH1cblxuICAgIE9iamVjdC5rZXlzKGV2ZW50RGlzcGF0Y2hlcikuZm9yRWFjaChmdW5jdGlvbihtZXRob2QpIHtcbiAgICAgIGlmICh0eXBlb2YgdGFyZ2V0W21ldGhvZF0gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAnT2JqZWN0IHRvIG1peCBpbnRvIGFscmVhZHkgaGFzIFwiJyArIG1ldGhvZCArICdcIiBwcm9wZXJ0eSBkZWZpbmVkISdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHRhcmdldFttZXRob2RdID0gZXZlbnREaXNwYXRjaGVyW21ldGhvZF0uYmluZCh0aGlzKTtcbiAgICB9LCB7IGxpc3RlbmVyczogbmV3IE1hcCgpLCBhbGxvd2VkRXZlbnRzOiBhbGxvd2VkRXZlbnRzIH0pO1xuXG4gICAgcmV0dXJuIHRhcmdldDtcbiAgfVxufTtcbiIsImltcG9ydCBFdmVudERpc3BhdGNoZXIgZnJvbSAnRXZlbnREaXNwYXRjaGVyJztcblxudmFyIHByaXZhdGVzID0ge1xuICBkYXRhOiBTeW1ib2woJ2RhdGEnKSxcbiAgcGVuZGluZ0RhdGFSZXF1ZXN0OiBTeW1ib2woJ3BlbmRpbmdEYXRhUmVxdWVzdCcpLFxuICBzcGxpY2U6IFN5bWJvbCgnc3BsaWNlJylcbn07XG5cbmNsYXNzIFdlYlNvY2tldEZyYW1lQnVmZmVyIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgRXZlbnREaXNwYXRjaGVyLm1peGluKHRoaXMsIFsnZnJhbWUnLCAnZGF0YSddKTtcblxuICAgIHRoaXNbcHJpdmF0ZXMuZGF0YV0gPSBuZXcgVWludDhBcnJheSgwKTtcbiAgICB0aGlzW3ByaXZhdGVzLnBlbmRpbmdEYXRhUmVxdWVzdF0gPSBudWxsO1xuICAgIHRoaXNbcHJpdmF0ZXMuc3BsaWNlXSA9IGZ1bmN0aW9uKGxlbmd0aCkge1xuICAgICAgdmFyIGRhdGEgPSB0aGlzW3ByaXZhdGVzLmRhdGFdO1xuXG4gICAgICB2YXIgc3BsaWNlZERhdGEgPSBkYXRhLnN1YmFycmF5KDAsIGxlbmd0aCk7XG4gICAgICB0aGlzW3ByaXZhdGVzLmRhdGFdID0gZGF0YS5zdWJhcnJheShsZW5ndGgsIGRhdGEubGVuZ3RoKTtcblxuICAgICAgcmV0dXJuIHNwbGljZWREYXRhO1xuICAgIH07XG4gIH1cblxuICBwdXQoZGF0YVRvUHV0KSB7XG4gICAgdmFyIGRhdGEgPSB0aGlzW3ByaXZhdGVzLmRhdGFdO1xuXG4gICAgdmFyIG5ld0RhdGEgPSBuZXcgVWludDhBcnJheShkYXRhLmxlbmd0aCArIGRhdGFUb1B1dC5sZW5ndGgpO1xuICAgIG5ld0RhdGEuc2V0KGRhdGEpO1xuICAgIG5ld0RhdGEuc2V0KGRhdGFUb1B1dCwgZGF0YS5sZW5ndGgpO1xuICAgIHRoaXNbcHJpdmF0ZXMuZGF0YV0gPSBuZXdEYXRhO1xuXG4gICAgdGhpcy5lbWl0KCdkYXRhJyk7XG5cbiAgICAvLyBJZiBubyBvbmUgd2FpdGluZyBmb3IgZGF0YSwgbGV0J3Mgc2lnbmFsIHRoYXQgd2UgaGF2ZSBuZXcgZnJhbWUhXG4gICAgaWYgKCF0aGlzW3ByaXZhdGVzLnBlbmRpbmdEYXRhUmVxdWVzdF0pIHtcbiAgICAgIHRoaXMuZW1pdCgnZnJhbWUnKTtcbiAgICB9XG4gIH1cblxuICBnZXQoZGF0YUxlbmd0aCkge1xuICAgIGlmICh0aGlzW3ByaXZhdGVzLnBlbmRpbmdEYXRhUmVxdWVzdF0pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ29uY3VycmVudCByZWFkIGlzIG5vdCBhbGxvd2VkLicpO1xuICAgIH1cblxuICAgIHRoaXNbcHJpdmF0ZXMucGVuZGluZ0RhdGFSZXF1ZXN0XSA9IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICB2YXIgZGF0YSA9IHRoaXNbcHJpdmF0ZXMuZGF0YV07XG4gICAgICBpZiAoZGF0YS5sZW5ndGggPj0gZGF0YUxlbmd0aCkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZSh0aGlzW3ByaXZhdGVzLnNwbGljZV0oZGF0YUxlbmd0aCkpO1xuICAgICAgfVxuXG4gICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICB0aGlzLm9uKCdkYXRhJywgZnVuY3Rpb24gb25EYXRhKCkge1xuICAgICAgICBpZiAoZGF0YS5sZW5ndGggPCBkYXRhTGVuZ3RoKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgc2VsZi5vZmYoJ2RhdGEnLCBvbkRhdGEpO1xuICAgICAgICByZXNvbHZlKHRoaXNbcHJpdmF0ZXMuc3BsaWNlXShkYXRhTGVuZ3RoKSk7XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJldHVybiB0aGlzW3ByaXZhdGVzLnBlbmRpbmdEYXRhUmVxdWVzdF0udGhlbigoZGF0YSkgPT4ge1xuICAgICAgdGhpc1twcml2YXRlcy5wZW5kaW5nRGF0YVJlcXVlc3RdID0gbnVsbDtcbiAgICAgIHJldHVybiBkYXRhO1xuICAgIH0pO1xuICB9XG5cbiAgaXNFbXB0eSgpIHtcbiAgICByZXR1cm4gdGhpc1twcml2YXRlcy5kYXRhXS5sZW5ndGggPT09IDA7XG4gIH07XG59XG5cbmV4cG9ydCBkZWZhdWx0IFdlYlNvY2tldEZyYW1lQnVmZmVyO1xuIiwidmFyIFdlYlNvY2tldFV0aWxzID0ge1xuICAvKipcbiAgICogTWFzayBldmVyeSBkYXRhIGVsZW1lbnQgd2l0aCB0aGUgbWFzayAoV2ViU29ja2V0IHNwZWNpZmljIGFsZ29yaXRobSkuXG4gICAqIEBwYXJhbSB7VWludDhBcnJheX0gbWFzayBNYXNrIGFycmF5LlxuICAgKiBAcGFyYW0ge1VpbnQ4QXJyYXl9IGFycmF5IERhdGEgYXJyYXkgdG8gbWFzay5cbiAgICogQHJldHVybnMge1VpbnQ4QXJyYXl9IE1hc2tlZCBkYXRhIGFycmF5LlxuICAgKi9cbiAgbWFzayhtYXNrLCBhcnJheSkge1xuICAgIGlmIChtYXNrKSB7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGFycmF5W2ldID0gYXJyYXlbaV0gXiBtYXNrW2kgJSA0XTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGFycmF5O1xuICB9LFxuXG4gIC8qKlxuICAgKiBHZW5lcmF0ZXMgNC1pdGVtIGFycmF5LCBldmVyeSBpdGVtIG9mIHdoaWNoIGlzIGVsZW1lbnQgb2YgYnl0ZSBtYXNrLlxuICAgKiBAcmV0dXJucyB7VWludDhBcnJheX1cbiAgICovXG4gIGdlbmVyYXRlUmFuZG9tTWFzaygpIHtcbiAgICB2YXIgcmFuZG9tID0gbmV3IFVpbnQ4QXJyYXkoNCk7XG5cbiAgICB3aW5kb3cuY3J5cHRvLmdldFJhbmRvbVZhbHVlcyhyYW5kb20pO1xuXG4gICAgcmV0dXJuIHJhbmRvbTtcbiAgfSxcblxuICAvKipcbiAgICogQ29udmVydHMgc3RyaW5nIHRvIFVpbnQ4QXJyYXkuXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBzdHJpbmdWYWx1ZSBTdHJpbmcgdmFsdWUgdG8gY29udmVydC5cbiAgICogQHJldHVybnMge1VpbnQ4QXJyYXl9XG4gICAqL1xuICBzdHJpbmdUb0FycmF5KHN0cmluZ1ZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiBzdHJpbmdWYWx1ZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignc3RyaW5nVmFsdWUgc2hvdWxkIGJlIHZhbGlkIHN0cmluZyEnKTtcbiAgICB9XG5cbiAgICB2YXIgYXJyYXkgPSBuZXcgVWludDhBcnJheShzdHJpbmdWYWx1ZS5sZW5ndGgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyaW5nVmFsdWUubGVuZ3RoOyBpKyspIHtcbiAgICAgIGFycmF5W2ldID0gc3RyaW5nVmFsdWUuY2hhckNvZGVBdChpKTtcbiAgICB9XG5cbiAgICByZXR1cm4gYXJyYXk7XG4gIH0sXG5cbiAgLyoqXG4gICAqIENvbnZlcnRzIGFycmF5IHRvIHN0cmluZy4gRXZlcnkgYXJyYXkgZWxlbWVudCBpcyBjb25zaWRlcmVkIGFzIGNoYXIgY29kZS5cbiAgICogQHBhcmFtIHtVaW50OEFycmF5fSBhcnJheSBBcnJheSB3aXRoIHRoZSBjaGFyIGNvZGVzLlxuICAgKiBAcmV0dXJucyB7c3RyaW5nfVxuICAgKi9cbiAgYXJyYXlUb1N0cmluZyhhcnJheSkge1xuICAgIHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIGFycmF5KTtcbiAgfSxcblxuICAvKipcbiAgICogUmVhZHMgdW5zaWduZWQgMTYgYml0IHZhbHVlIGZyb20gdHdvIGNvbnNlcXVlbnQgOC1iaXQgYXJyYXkgZWxlbWVudHMuXG4gICAqIEBwYXJhbSB7VWludDhBcnJheX0gYXJyYXkgQXJyYXkgdG8gcmVhZCBmcm9tLlxuICAgKiBAcGFyYW0ge051bWJlcj99IG9mZnNldCBJbmRleCB0byBzdGFydCByZWFkIHZhbHVlLlxuICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgKi9cbiAgcmVhZFVJbnQxNihhcnJheSwgb2Zmc2V0KSB7XG4gICAgb2Zmc2V0ID0gb2Zmc2V0IHx8IDA7XG4gICAgcmV0dXJuIChhcnJheVtvZmZzZXRdIDw8IDgpICsgYXJyYXlbb2Zmc2V0ICsgMV07XG4gIH0sXG5cbiAgLyoqXG4gICAqIFJlYWRzIHVuc2lnbmVkIDMyIGJpdCB2YWx1ZSBmcm9tIGZvdXIgY29uc2VxdWVudCA4LWJpdCBhcnJheSBlbGVtZW50cy5cbiAgICogQHBhcmFtIHtVaW50OEFycmF5fSBhcnJheSBBcnJheSB0byByZWFkIGZyb20uXG4gICAqIEBwYXJhbSB7TnVtYmVyP30gb2Zmc2V0IEluZGV4IHRvIHN0YXJ0IHJlYWQgdmFsdWUuXG4gICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAqL1xuICByZWFkVUludDMyKGFycmF5LCBvZmZzZXQpIHtcbiAgICBvZmZzZXQgPSBvZmZzZXQgfHwgMDtcbiAgICByZXR1cm4gKGFycmF5W29mZnNldF0gPDwgMjQpICtcbiAgICAgIChhcnJheVtvZmZzZXQgKyAxXSA8PCAxNikgK1xuICAgICAgKGFycmF5IFtvZmZzZXQgKyAyXSA8PCA4KSArXG4gICAgICBhcnJheVtvZmZzZXQgKyAzXTtcbiAgfSxcblxuICAvKipcbiAgICogV3JpdGVzIHVuc2lnbmVkIDE2IGJpdCB2YWx1ZSB0byB0d28gY29uc2VxdWVudCA4LWJpdCBhcnJheSBlbGVtZW50cy5cbiAgICogQHBhcmFtIHtVaW50OEFycmF5fSBhcnJheSBBcnJheSB0byB3cml0ZSB0by5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IHZhbHVlIDE2IGJpdCB1bnNpZ25lZCB2YWx1ZSB0byB3cml0ZSBpbnRvIGFycmF5LlxuICAgKiBAcGFyYW0ge051bWJlcj99IG9mZnNldCBJbmRleCB0byBzdGFydCB3cml0ZSB2YWx1ZS5cbiAgICogQHJldHVybnMge051bWJlcn1cbiAgICovXG4gIHdyaXRlVUludDE2KGFycmF5LCB2YWx1ZSwgb2Zmc2V0KSB7XG4gICAgb2Zmc2V0ID0gb2Zmc2V0IHx8IDA7XG4gICAgYXJyYXlbb2Zmc2V0XSA9ICh2YWx1ZSAmIDB4ZmYwMCkgPj4gODtcbiAgICBhcnJheVtvZmZzZXQgKyAxXSA9IHZhbHVlICYgMHhmZjtcbiAgfSxcblxuICAvKipcbiAgICogV3JpdGVzIHVuc2lnbmVkIDE2IGJpdCB2YWx1ZSB0byB0d28gY29uc2VxdWVudCA4LWJpdCBhcnJheSBlbGVtZW50cy5cbiAgICogQHBhcmFtIHtVaW50OEFycmF5fSBhcnJheSBBcnJheSB0byB3cml0ZSB0by5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IHZhbHVlIDE2IGJpdCB1bnNpZ25lZCB2YWx1ZSB0byB3cml0ZSBpbnRvIGFycmF5LlxuICAgKiBAcGFyYW0ge051bWJlcj99IG9mZnNldCBJbmRleCB0byBzdGFydCB3cml0ZSB2YWx1ZS5cbiAgICogQHJldHVybnMge051bWJlcn1cbiAgICovXG4gIHdyaXRlVUludDMyKGFycmF5LCB2YWx1ZSwgb2Zmc2V0KSB7XG4gICAgb2Zmc2V0ID0gb2Zmc2V0IHx8IDA7XG4gICAgYXJyYXlbb2Zmc2V0XSA9ICh2YWx1ZSAmIDB4ZmYwMDAwMDApID4+IDI0O1xuICAgIGFycmF5W29mZnNldCArIDFdID0gKHZhbHVlICYgMHhmZjAwMDApID4+IDE2O1xuICAgIGFycmF5W29mZnNldCArIDJdID0gKHZhbHVlICYgMHhmZjAwKSA+PiA4O1xuICAgIGFycmF5W29mZnNldCArIDNdID0gdmFsdWUgJiAweGZmO1xuICB9XG59O1xuXG5leHBvcnQgZGVmYXVsdCBXZWJTb2NrZXRVdGlscztcbiJdfQ==
