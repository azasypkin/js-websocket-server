(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.FxOSWebSocket = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

var _interopRequireWildcard = function (obj) { return obj && obj.__esModule ? obj : { 'default': obj }; };

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } };

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _EventDispatcher = require('event-dispatcher-js');

var _EventDispatcher2 = _interopRequireWildcard(_EventDispatcher);

var _WebSocketFrameBuffer = require('./frame-buffer.es6');

var _WebSocketFrameBuffer2 = _interopRequireWildcard(_WebSocketFrameBuffer);

var _WebSocketUtils = require('./utils.es6');

var _WebSocketUtils2 = _interopRequireWildcard(_WebSocketUtils);

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
  var httpHeaders = getHttpHeaders(_WebSocketUtils2['default'].arrayToString(httpRequestData).split(CRLF + CRLF)[0]);

  var key = _WebSocketUtils2['default'].stringToArray(httpHeaders.get('Sec-WebSocket-Key') + WEBSOCKET_KEY_GUID);

  var subtle = window.crypto.subtle;
  return subtle.digest({ name: 'SHA-1' }, key).then(function (hashArrayBuffer) {
    var webSocketKey = btoa(_WebSocketUtils2['default'].arrayToString(new Uint8Array(hashArrayBuffer)));
    var arrayResponse = _WebSocketUtils2['default'].stringToArray(WEBSOCKET_HANDSHAKE_RESPONSE.replace('{web-socket-key}', webSocketKey));

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
      _WebSocketUtils2['default'].writeUInt16(outputBuffer, dataLength, 2);
      break;
    case 127:
      _WebSocketUtils2['default'].writeUInt32(outputBuffer, 0, 2);
      _WebSocketUtils2['default'].writeUInt32(outputBuffer, dataLength, 6);
      break;
  }

  if (isMasked && dataLength) {
    var mask = _WebSocketUtils2['default'].generateRandomMask();

    // Writing MASK
    outputBuffer.set(mask, dataOffset - 4);

    _WebSocketUtils2['default'].mask(mask, data);
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
    this[privates.frameBuffer] = new _WebSocketFrameBuffer2['default']();

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
          data = new Uint8Array(_WebSocketUtils2['default'].stringToArray(data));
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
            return _WebSocketUtils2['default'].readUInt16(data);
          });
        } else if (state.dataLength == 127) {
          dataLengthPromise = buffer.get(4).then(function (data) {
            return _WebSocketUtils2['default'].readUInt32(data);
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
          state.data = _WebSocketUtils2['default'].mask(state.mask, data);
          return state;
        }) : state;
      }).then(function (state) {
        if (state.opCode === OperationCode.CONNECTION_CLOSE) {
          var code = 0;
          var reason = 'Unknown';

          if (state.dataLength > 0) {
            code = _WebSocketUtils2['default'].readUInt16(state.data);
            if (state.dataLength > 2) {
              reason = _WebSocketUtils2['default'].arrayToString(state.data.subarray(2));
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
  Utils: _WebSocketUtils2['default'],
  FrameBuffer: _WebSocketFrameBuffer2['default']
};
module.exports = exports['default'];

},{"./frame-buffer.es6":3,"./utils.es6":4,"event-dispatcher-js":2}],2:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});
/*global Map, Set */

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

var _interopRequireWildcard = function (obj) { return obj && obj.__esModule ? obj : { 'default': obj }; };

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } };

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _EventDispatcher = require('event-dispatcher-js');

var _EventDispatcher2 = _interopRequireWildcard(_EventDispatcher);

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
  mask: (function (_mask) {
    function mask(_x, _x2) {
      return _mask.apply(this, arguments);
    }

    mask.toString = function () {
      return _mask.toString();
    };

    return mask;
  })(function (mask, array) {
    if (mask) {
      for (var i = 0; i < array.length; i++) {
        array[i] = array[i] ^ mask[i % 4];
      }
    }
    return array;
  }),

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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvcHJvamVjdHMvZ2l0aHViL2Z4b3Mtd2Vic29ja2V0LXNlcnZlci9zcmMvc2VydmVyLmVzNi5qcyIsIi9wcm9qZWN0cy9naXRodWIvZnhvcy13ZWJzb2NrZXQtc2VydmVyL2NvbXBvbmVudHMvZXZlbnQtZGlzcGF0Y2hlci1qcy9ldmVudC1kaXNwYXRjaGVyLmVzNi5qcyIsIi9wcm9qZWN0cy9naXRodWIvZnhvcy13ZWJzb2NrZXQtc2VydmVyL3NyYy9mcmFtZS1idWZmZXIuZXM2LmpzIiwiL3Byb2plY3RzL2dpdGh1Yi9meG9zLXdlYnNvY2tldC1zZXJ2ZXIvc3JjL3V0aWxzLmVzNi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7Ozs7Ozs7OzsrQkNBNEIscUJBQXFCOzs7O29DQUNoQixvQkFBb0I7Ozs7OEJBQzFCLGFBQWE7Ozs7Ozs7O0FBTXhDLElBQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQzs7Ozs7OztBQU9wQixJQUFNLGtCQUFrQixHQUFHLHNDQUFzQyxDQUFDOzs7Ozs7O0FBT2xFLElBQU0sNEJBQTRCLEdBQ2hDLGtDQUFrQyxHQUFHLElBQUksR0FDekMscUJBQXFCLEdBQUcsSUFBSSxHQUM1QixvQkFBb0IsR0FBRyxJQUFJLEdBQzNCLHdDQUF3QyxHQUFHLElBQUksR0FBRyxJQUFJLENBQUM7Ozs7OztBQU16RCxJQUFNLGFBQWEsR0FBRztBQUNwQixvQkFBa0IsRUFBRSxDQUFDO0FBQ3JCLFlBQVUsRUFBRSxDQUFDO0FBQ2IsY0FBWSxFQUFFLENBQUM7QUFDZixrQkFBZ0IsRUFBRSxDQUFDO0FBQ25CLE1BQUksRUFBRSxDQUFDO0FBQ1AsTUFBSSxFQUFFLEVBQUU7Q0FDVCxDQUFDOzs7Ozs7O0FBT0YsU0FBUyxjQUFjLENBQUMsZ0JBQWdCLEVBQUU7QUFDeEMsTUFBSSxXQUFXLEdBQUcsZ0JBQWdCLENBQUMsSUFB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QyxTQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxHQUFHLEtBQUssR0FBRyxHQUFJLENBQUM7R0FDbEM7Ozs7Ozs7OztBQVNELGFBQVcsRUFBQSxxQkFBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRTtBQUNoQyxTQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEdBQUcsVUFBVSxDQUFBLElBQUssRUFBRSxDQUFDO0FBQzNDLFNBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEdBQUcsUUFBUSxDQUFBLElBQUssRUFBRSxDQUFDO0FBQzdDLFNBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEdBQUcsS0FBTSxDQUFBLElBQUssQ0FBQyxDQUFDO0FBQzFDLFNBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEdBQUcsS0FBSyxHQUFHLEdBQUksQ0FBQztHQUNsQztDQUNGLENBQUM7O3FCQUVhLGNBQWMiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiaW1wb3J0IEV2ZW50RGlzcGF0Y2hlciBmcm9tICdldmVudC1kaXNwYXRjaGVyLWpzJztcbmltcG9ydCBXZWJTb2NrZXRGcmFtZUJ1ZmZlciBmcm9tICcuL2ZyYW1lLWJ1ZmZlci5lczYnO1xuaW1wb3J0IFdlYlNvY2tldFV0aWxzIGZyb20gJy4vdXRpbHMuZXM2JztcblxuLyoqXG4gKiBTZXF1ZW5jZSB1c2VkIHRvIHNlcGFyYXRlIEhUVFAgcmVxdWVzdCBoZWFkZXJzIGFuZCBib2R5LlxuICogQGNvbnN0IHtzdHJpbmd9XG4gKi9cbmNvbnN0IENSTEYgPSAnXFxyXFxuJztcblxuLyoqXG4gKiBNYWdpYyBHVUlEIGRlZmluZWQgYnkgUkZDIHRvIGNvbmNhdGVuYXRlIHdpdGggd2ViIHNvY2tldCBrZXkgZHVyaW5nXG4gKiB3ZWJzb2NrZXQgaGFuZHNoYWtlLlxuICogQGNvbnN0IHtzdHJpbmd9XG4gKi9cbmNvbnN0IFdFQlNPQ0tFVF9LRVlfR1VJRCA9ICcyNThFQUZBNS1FOTE0LTQ3REEtOTVDQS1DNUFCMERDODVCMTEnO1xuXG4vKipcbiAqIFdlYnNvY2tldCBoYW5kc2hha2UgcmVzcG9uc2UgdGVtcGxhdGUgc3RyaW5nLCB7d2ViLXNvY2tldC1rZXl9IHNob3VsZCBiZVxuICogcmVwbGFjZWQgd2l0aCB0aGUgYXBwcm9wcmlhdGUga2V5LlxuICogQGNvbnN0IHtzdHJpbmd9XG4gKi9cbmNvbnN0IFdFQlNPQ0tFVF9IQU5EU0hBS0VfUkVTUE9OU0UgPVxuICAnSFRUUC8xLjEgMTAxIFN3aXRjaGluZyBQcm90b2NvbHMnICsgQ1JMRiArXG4gICdDb25uZWN0aW9uOiBVcGdyYWRlJyArIENSTEYgK1xuICAnVXBncmFkZTogd2Vic29ja2V0JyArIENSTEYgK1xuICAnU2VjLVdlYlNvY2tldC1BY2NlcHQ6IHt3ZWItc29ja2V0LWtleX0nICsgQ1JMRiArIENSTEY7XG5cbi8qKlxuICogRW51bWVyYXRpb24gb2YgYWxsIHBvc3NpYmxlIG9wZXJhdGlvbiBjb2Rlcy5cbiAqIEBlbnVtIHtudW1iZXJ9XG4gKi9cbmNvbnN0IE9wZXJhdGlvbkNvZGUgPSB7XG4gIENPTlRJTlVBVElPTl9GUkFNRTogMCxcbiAgVEVYVF9GUkFNRTogMSxcbiAgQklOQVJZX0ZSQU1FOiAyLFxuICBDT05ORUNUSU9OX0NMT1NFOiA4LFxuICBQSU5HOiA5LFxuICBQT05HOiAxMFxufTtcblxuLyoqXG4gKiBFeHRyYWN0cyBIVFRQIGhlYWRlciBtYXAgZnJvbSBIVFRQIGhlYWRlciBzdHJpbmcuXG4gKiBAcGFyYW0ge3N0cmluZ30gaHR0cEhlYWRlclN0cmluZyBIVFRQIGhlYWRlciBzdHJpbmcuXG4gKiBAcmV0dXJucyB7TWFwLjxzdHJpbmcsIHN0cmluZz59IEhUVFAgaGVhZGVyIGtleS12YWx1ZSBtYXAuXG4gKi9cbmZ1bmN0aW9uIGdldEh0dHBIZWFkZXJzKGh0dHBIZWFkZXJTdHJpbmcpIHtcbiAgdmFyIGh0dHBIZWFkZXJzID0gaHR0cEhlYWRlclN0cmluZy50cmltKCkuc3BsaXQoQ1JMRik7XG4gIHJldHVybiBuZXcgTWFwKGh0dHBIZWFkZXJzLm1hcCgoaHR0cEhlYWRlcikgPT4ge1xuICAgIHJldHVybiBodHRwSGVhZGVyLnNwbGl0KCc6JykubWFwKChlbnRpdHkpID0+IGVudGl0eS50cmltKCkpO1xuICB9KSk7XG59XG5cbi8qKlxuICogUGVyZm9ybXMgV2ViU29ja2V0IEhUVFAgSGFuZHNoYWtlLlxuICogQHBhcmFtIHtUQ1BTb2NrZXR9IHRjcFNvY2tldCBDb25uZWN0aW9uIHNvY2tldC5cbiAqIEBwYXJhbSB7VWludDhBcnJheX0gaHR0cFJlcXVlc3REYXRhIEhUVFAgSGFuZHNoYWtlIGRhdGEgYXJyYXkuXG4gKiBAcmV0dXJucyB7TWFwLjxzdHJpbmcsIHN0cmluZz59IFBhcnNlZCBodHRwIGhlYWRlcnNcbiAqL1xuZnVuY3Rpb24gcGVyZm9ybUhhbmRzaGFrZSh0Y3BTb2NrZXQsIGh0dHBSZXF1ZXN0RGF0YSkge1xuICB2YXIgaHR0cEhlYWRlcnMgPSBnZXRIdHRwSGVhZGVycyhcbiAgICBXZWJTb2NrZXRVdGlscy5hcnJheVRvU3RyaW5nKGh0dHBSZXF1ZXN0RGF0YSkuc3BsaXQoQ1JMRiArIENSTEYpWzBdXG4gICk7XG5cbiAgdmFyIGtleSA9IFdlYlNvY2tldFV0aWxzLnN0cmluZ1RvQXJyYXkoXG4gICAgaHR0cEhlYWRlcnMuZ2V0KCdTZWMtV2ViU29ja2V0LUtleScpICsgV0VCU09DS0VUX0tFWV9HVUlEXG4gICk7XG5cbiAgdmFyIHN1YnRsZSA9IHdpbmRvdy5jcnlwdG8uc3VidGxlO1xuICByZXR1cm4gc3VidGxlLmRpZ2VzdCh7IG5hbWU6ICdTSEEtMScgfSwga2V5KS50aGVuKChoYXNoQXJyYXlCdWZmZXIpID0+IHtcbiAgICB2YXIgd2ViU29ja2V0S2V5ID0gYnRvYShXZWJTb2NrZXRVdGlscy5hcnJheVRvU3RyaW5nKFxuICAgICAgbmV3IFVpbnQ4QXJyYXkoaGFzaEFycmF5QnVmZmVyKVxuICAgICkpO1xuICAgIHZhciBhcnJheVJlc3BvbnNlID0gV2ViU29ja2V0VXRpbHMuc3RyaW5nVG9BcnJheShcbiAgICAgIFdFQlNPQ0tFVF9IQU5EU0hBS0VfUkVTUE9OU0UucmVwbGFjZSgne3dlYi1zb2NrZXQta2V5fScsIHdlYlNvY2tldEtleSlcbiAgICApO1xuXG4gICAgdGNwU29ja2V0LnNlbmQoYXJyYXlSZXNwb25zZS5idWZmZXIsIDAsIGFycmF5UmVzcG9uc2UuYnl0ZUxlbmd0aCk7XG5cbiAgICByZXR1cm4gaHR0cEhlYWRlcnM7XG4gIH0pO1xufVxuXG4vKipcbiAqIENyZWF0ZXMgb3V0Z29pbmcgd2Vic29ja2V0IG1lc3NhZ2UgZnJhbWUuXG4gKiBAcGFyYW0ge051bWJlcn0gb3BDb2RlIEZyYW1lIG9wZXJhdGlvbiBjb2RlLlxuICogQHBhcmFtIHtVaW50OEFycmF5fSBkYXRhIERhdGEgYXJyYXkuXG4gKiBAcGFyYW0ge0Jvb2xlYW59IGlzQ29tcGxldGUgSW5kaWNhdGVzIGlmIGZyYW1lIGlzIGNvbXBsZXRlZC5cbiAqIEBwYXJhbSB7Qm9vbGVhbn0gaXNNYXNrZWQgSW5kaWNhdGVzIGlmIGZyYW1lIGRhdGEgc2hvdWxkIGJlIG1hc2tlZC5cbiAqIEByZXR1cm5zIHtVaW50OEFycmF5fSBDb25zdHJ1Y3RlZCBmcmFtZSBkYXRhLlxuICovXG5mdW5jdGlvbiBjcmVhdGVNZXNzYWdlRnJhbWUob3BDb2RlLCBkYXRhLCBpc0NvbXBsZXRlLCBpc01hc2tlZCkge1xuICB2YXIgZGF0YUxlbmd0aCA9IChkYXRhICYmIGRhdGEubGVuZ3RoKSB8fCAwO1xuICB2YXIgZGF0YU9mZnNldCA9IGlzTWFza2VkID8gNiA6IDI7XG5cbiAgdmFyIHNlY29uZEJ5dGUgPSAwO1xuICBpZiAoZGF0YUxlbmd0aCA+PSA2NTUzNikge1xuICAgIGRhdGFPZmZzZXQgKz0gODtcbiAgICBzZWNvbmRCeXRlID0gMTI3O1xuICB9IGVsc2UgaWYgKGRhdGFMZW5ndGggPiAxMjUpIHtcbiAgICBkYXRhT2Zmc2V0ICs9IDI7XG4gICAgc2Vjb25kQnl0ZSA9IDEyNjtcbiAgfSBlbHNlIHtcbiAgICBzZWNvbmRCeXRlID0gZGF0YUxlbmd0aDtcbiAgfVxuXG4gIHZhciBvdXRwdXRCdWZmZXIgPSBuZXcgVWludDhBcnJheShkYXRhT2Zmc2V0ICsgZGF0YUxlbmd0aCk7XG5cbiAgLy8gV3JpdGluZyBPUENPREUsIEZJTiBhbmQgTEVOR1RIXG4gIG91dHB1dEJ1ZmZlclswXSA9IGlzQ29tcGxldGUgPyBvcENvZGUgfCAweDgwIDogb3BDb2RlO1xuICBvdXRwdXRCdWZmZXJbMV0gPSBpc01hc2tlZCA/IHNlY29uZEJ5dGUgfCAweDgwIDogc2Vjb25kQnl0ZTtcblxuICAvLyBXcml0aW5nIERBVEEgTEVOR1RIXG4gIHN3aXRjaCAoc2Vjb25kQnl0ZSkge1xuICAgIGNhc2UgMTI2OlxuICAgICAgV2ViU29ja2V0VXRpbHMud3JpdGVVSW50MTYob3V0cHV0QnVmZmVyLCBkYXRhTGVuZ3RoLCAyKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgMTI3OlxuICAgICAgV2ViU29ja2V0VXRpbHMud3JpdGVVSW50MzIob3V0cHV0QnVmZmVyLCAwLCAyKTtcbiAgICAgIFdlYlNvY2tldFV0aWxzLndyaXRlVUludDMyKG91dHB1dEJ1ZmZlciwgZGF0YUxlbmd0aCwgNik7XG4gICAgICBicmVhaztcbiAgfVxuXG4gIGlmIChpc01hc2tlZCAmJiBkYXRhTGVuZ3RoKSB7XG4gICAgdmFyIG1hc2sgPSBXZWJTb2NrZXRVdGlscy5nZW5lcmF0ZVJhbmRvbU1hc2soKTtcblxuICAgIC8vIFdyaXRpbmcgTUFTS1xuICAgIG91dHB1dEJ1ZmZlci5zZXQobWFzaywgZGF0YU9mZnNldCAtIDQpO1xuXG4gICAgV2ViU29ja2V0VXRpbHMubWFzayhtYXNrLCBkYXRhKTtcbiAgfVxuXG4gIGZvcih2YXIgaSA9IDA7IGkgPCBkYXRhTGVuZ3RoOyBpKyspIHtcbiAgICBvdXRwdXRCdWZmZXJbZGF0YU9mZnNldCArIGldID0gZGF0YVtpXTtcbiAgfVxuXG4gIHJldHVybiBvdXRwdXRCdWZmZXI7XG59XG5cbnZhciBwcml2YXRlcyA9IHtcbiAgdGNwU2VydmVyU29ja2V0OiBTeW1ib2woJ3RjcC1zb2NrZXQnKSxcbiAgb25UQ1BTZXJ2ZXJTb2NrZXRDb25uZWN0OiBTeW1ib2woJ29uVENQU2VydmVyU29ja2V0Q29ubmVjdCcpLFxuICBvblRDUFNlcnZlclNvY2tldENsb3NlOiBTeW1ib2woJ29uVENQU2VydmVyU29ja2V0Q2xvc2UnKSxcblxuICB0Y3BTb2NrZXQ6IFN5bWJvbCgndGNwU29ja2V0JyksXG4gIG9uVENQU29ja2V0RGF0YTogU3ltYm9sKCdvblRDUFNvY2tldERhdGEnKSxcbiAgb25UQ1BTb2NrZXRDbG9zZTogU3ltYm9sKCdvblRDUFNvY2tldENsb3NlJyksXG5cbiAgY2xpZW50czogU3ltYm9sKCdjbGllbnRzJyksXG4gIGZyYW1lQnVmZmVyOiBTeW1ib2woJ2ZyYW1lQnVmZmVyJyksXG5cbiAgb25NZXNzYWdlRnJhbWU6IFN5bWJvbCgnb25NZXNzYWdlRnJhbWUnKVxufTtcblxuLyoqXG4gKiBXZWJTb2NrZXRTZXJ2ZXIgY29uc3RydWN0b3IgdGhhdCBhY2NlcHRzIHBvcnQgdG8gbGlzdGVuIG9uLlxuICogQHBhcmFtIHtOdW1iZXJ9IHBvcnQgTnVtYmVyIHRvIGxpc3RlbiBmb3Igd2Vic29ja2V0IGNvbm5lY3Rpb25zLlxuICovXG5jbGFzcyBXZWJTb2NrZXRTZXJ2ZXIge1xuICBjb25zdHJ1Y3Rvcihwb3J0KSB7XG4gICAgRXZlbnREaXNwYXRjaGVyLm1peGluKHRoaXMsIFsnbWVzc2FnZScsICdzdG9wJ10pO1xuXG4gICAgdmFyIHRjcFNlcnZlclNvY2tldCA9IG5hdmlnYXRvci5tb3pUQ1BTb2NrZXQubGlzdGVuKHBvcnQsIHtcbiAgICAgIGJpbmFyeVR5cGU6ICdhcnJheWJ1ZmZlcidcbiAgICB9KTtcblxuICAgIHRoaXNbcHJpdmF0ZXMudGNwU2VydmVyU29ja2V0XSA9IHRjcFNlcnZlclNvY2tldDtcbiAgICB0aGlzW3ByaXZhdGVzLmNsaWVudHNdID0gbmV3IE1hcCgpO1xuICAgIHRoaXNbcHJpdmF0ZXMuZnJhbWVCdWZmZXJdID0gbmV3IFdlYlNvY2tldEZyYW1lQnVmZmVyKCk7XG5cbiAgICB0aGlzW3ByaXZhdGVzLm9uTWVzc2FnZUZyYW1lXSA9IHRoaXNbcHJpdmF0ZXMub25NZXNzYWdlRnJhbWVdLmJpbmQodGhpcyk7XG5cbiAgICB0Y3BTZXJ2ZXJTb2NrZXQub25jb25uZWN0ID1cbiAgICAgIHRoaXNbcHJpdmF0ZXMub25UQ1BTZXJ2ZXJTb2NrZXRDb25uZWN0XS5iaW5kKHRoaXMpO1xuICAgIHRjcFNlcnZlclNvY2tldC5vbmVycm9yID0gdGhpc1twcml2YXRlcy5vblRDUFNlcnZlclNvY2tldENsb3NlXS5iaW5kKHRoaXMpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNlbmQgZGF0YSB0byB0aGUgY29ubmVjdGVkIGNsaWVudFxuICAgKiBAcGFyYW0ge0FycmF5QnVmZmVyfEFycmF5fHN0cmluZ30gZGF0YSBEYXRhIHRvIHNlbmQuXG4gICAqL1xuICBzZW5kKGRhdGEpIHtcbiAgICBpZiAoIUFycmF5QnVmZmVyLmlzVmlldyhkYXRhKSAmJiAhKGRhdGEgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikpIHtcbiAgICAgIGlmICh0eXBlb2YgZGF0YSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgZGF0YSA9IG5ldyBVaW50OEFycmF5KFdlYlNvY2tldFV0aWxzLnN0cmluZ1RvQXJyYXkoZGF0YSkpO1xuICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgICAgIGRhdGEgPSBuZXcgVWludDhBcnJheShkYXRhKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVW5zdXBwb3J0ZWQgZGF0YSB0eXBlOiAnICsgdHlwZW9mIGRhdGEpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBkYXRhRnJhbWUgPSBjcmVhdGVNZXNzYWdlRnJhbWUoMHgyLCBkYXRhLCB0cnVlLCBmYWxzZSk7XG5cbiAgICB0aGlzW3ByaXZhdGVzLnRjcFNvY2tldF0uc2VuZChkYXRhRnJhbWUuYnVmZmVyLCAwLCBkYXRhRnJhbWUubGVuZ3RoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBEZXN0cm95cyBzb2NrZXQgY29ubmVjdGlvbi5cbiAgICovXG4gIHN0b3AoKSB7XG4gICAgdmFyIHRjcFNvY2tldCA9IHRoaXNbcHJpdmF0ZXMudGNwU29ja2V0XTtcbiAgICBpZiAodGNwU29ja2V0KSB7XG4gICAgICB0Y3BTb2NrZXQuY2xvc2UoKTtcbiAgICAgIHRoaXNbcHJpdmF0ZXMub25UQ1BTb2NrZXRDbG9zZV0oKTtcbiAgICB9XG5cbiAgICB2YXIgdGNwU2VydmVyU29ja2V0ID0gdGhpc1twcml2YXRlcy50Y3BTZXJ2ZXJTb2NrZXRdO1xuICAgIGlmICh0Y3BTZXJ2ZXJTb2NrZXQpIHtcbiAgICAgIHRjcFNlcnZlclNvY2tldC5jbG9zZSgpO1xuICAgICAgdGhpc1twcml2YXRlcy5vblRDUFNlcnZlclNvY2tldENsb3NlXSgpO1xuICAgIH1cblxuICAgIHRoaXNbcHJpdmF0ZXMuY2xpZW50c10uY2xlYXIoKTtcbiAgfVxuXG4gIFtwcml2YXRlcy5vblRDUFNlcnZlclNvY2tldENvbm5lY3RdKHRjcFNvY2tldCkge1xuICAgIHRoaXNbcHJpdmF0ZXMudGNwU29ja2V0XSA9IHRjcFNvY2tldDtcblxuICAgIHRoaXNbcHJpdmF0ZXMuZnJhbWVCdWZmZXJdLm9uKCdmcmFtZScsIHRoaXNbcHJpdmF0ZXMub25NZXNzYWdlRnJhbWVdKTtcblxuICAgIHRjcFNvY2tldC5vbmRhdGEgPSB0aGlzW3ByaXZhdGVzLm9uVENQU29ja2V0RGF0YV0uYmluZCh0aGlzKTtcbiAgICB0Y3BTb2NrZXQub25jbG9zZSA9IHRjcFNvY2tldC5vbmVycm9yID1cbiAgICAgIHRoaXNbcHJpdmF0ZXMub25UQ1BTb2NrZXRDbG9zZV0uYmluZCh0aGlzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBNb3pUY3BTb2NrZXQgZGF0YSBoYW5kbGVyLlxuICAgKiBAcGFyYW0ge1RDUFNvY2tldEV2ZW50fSBzb2NrZXRFdmVudCBUQ1BTb2NrZXQgZGF0YSBldmVudC5cbiAgICovXG4gIFtwcml2YXRlcy5vblRDUFNvY2tldERhdGFdKHNvY2tldEV2ZW50KSB7XG4gICAgdmFyIGNsaWVudHMgPSB0aGlzW3ByaXZhdGVzLmNsaWVudHNdO1xuICAgIHZhciB0Y3BTb2NrZXQgPSB0aGlzW3ByaXZhdGVzLnRjcFNvY2tldF07XG5cbiAgICB2YXIgZnJhbWVEYXRhID0gbmV3IFVpbnQ4QXJyYXkoc29ja2V0RXZlbnQuZGF0YSk7XG5cbiAgICAvLyBJZiB3ZSBkb24ndCBoYXZlIGNvbm5lY3Rpb24gaW5mbyBmcm9tIHRoaXMgaG9zdCBsZXQncyBwZXJmb3JtIGhhbmRzaGFrZVxuICAgIC8vIEN1cnJlbnRseSB3ZSBzdXBwb3J0IG9ubHkgT05FIGNsaWVudCBmcm9tIGhvc3QuXG4gICAgaWYgKCFjbGllbnRzLmhhcyh0Y3BTb2NrZXQuaG9zdCkpIHtcbiAgICAgIHBlcmZvcm1IYW5kc2hha2UodGNwU29ja2V0LCBmcmFtZURhdGEpLnRoZW4oKGhhbmRzaGFrZVJlc3VsdCkgPT4ge1xuICAgICAgICBpZiAoaGFuZHNoYWtlUmVzdWx0KSB7XG4gICAgICAgICAgY2xpZW50cy5zZXQodGNwU29ja2V0Lmhvc3QsIGhhbmRzaGFrZVJlc3VsdCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXNbcHJpdmF0ZXMuZnJhbWVCdWZmZXJdLnB1dChmcmFtZURhdGEpO1xuICB9XG5cbiAgLyoqXG4gICAqIFByb2Nlc3MgV2ViU29ja2V0IGluY29taW5nIGZyYW1lLlxuICAgKiBAcGFyYW0ge1VpbnQ4QXJyYXl9IGZyYW1lIE1lc3NhZ2UgZnJhbWUgZGF0YSBpbiB2aWV3IG9mIFVpbnQ4QXJyYXkuXG4gICAqL1xuICBbcHJpdmF0ZXMub25NZXNzYWdlRnJhbWVdKGZyYW1lKSB7XG4gICAgdmFyIGJ1ZmZlciA9IHRoaXNbcHJpdmF0ZXMuZnJhbWVCdWZmZXJdO1xuXG4gICAgYnVmZmVyLmdldCgyKS50aGVuKChjb250cm9sRGF0YSkgPT4ge1xuICAgICAgdmFyIHN0YXRlID0ge1xuICAgICAgICBpc0NvbXBsZXRlZDogKGNvbnRyb2xEYXRhWzBdICYgMHg4MCkgPT09IDB4ODAsXG4gICAgICAgIGlzTWFza2VkOiAoY29udHJvbERhdGFbMV0gJiAweDgwKSA9PT0gMHg4MCxcbiAgICAgICAgaXNDb21wcmVzc2VkOiAoY29udHJvbERhdGFbMF0gJiAweDQwKSA9PT0gMHg0MCxcbiAgICAgICAgb3BDb2RlOiBjb250cm9sRGF0YVswXSAmIDB4ZixcbiAgICAgICAgZGF0YUxlbmd0aDogY29udHJvbERhdGFbMV0gJiAweDdmLFxuICAgICAgICBtYXNrOiBudWxsLFxuICAgICAgICBkYXRhOiBbXVxuICAgICAgfTtcblxuICAgICAgaWYgKHN0YXRlLm9wQ29kZSA9PT0gT3BlcmF0aW9uQ29kZS5DT05USU5VQVRJT05fRlJBTUUpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDb250aW51YXRpb24gZnJhbWUgaXMgbm90IHlldCBzdXBwb3J0ZWQhJyk7XG4gICAgICB9XG5cbiAgICAgIGlmIChzdGF0ZS5vcENvZGUgPT09IE9wZXJhdGlvbkNvZGUuUElORykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BpbmcgZnJhbWUgaXMgbm90IHlldCBzdXBwb3J0ZWQhJyk7XG4gICAgICB9XG5cbiAgICAgIGlmIChzdGF0ZS5vcENvZGUgPT09IE9wZXJhdGlvbkNvZGUuUE9ORykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BvbmcgZnJhbWUgaXMgbm90IHlldCBzdXBwb3J0ZWQhJyk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBzdGF0ZTtcbiAgICB9KS50aGVuKChzdGF0ZSkgPT4ge1xuICAgICAgdmFyIGRhdGFMZW5ndGhQcm9taXNlO1xuICAgICAgaWYgKHN0YXRlLmRhdGFMZW5ndGggPT09IDEyNikge1xuICAgICAgICBkYXRhTGVuZ3RoUHJvbWlzZSA9IGJ1ZmZlci5nZXQoMikudGhlbihcbiAgICAgICAgICAoZGF0YSkgPT4gV2ViU29ja2V0VXRpbHMucmVhZFVJbnQxNihkYXRhKVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChzdGF0ZS5kYXRhTGVuZ3RoID09IDEyNykge1xuICAgICAgICBkYXRhTGVuZ3RoUHJvbWlzZSA9IGJ1ZmZlci5nZXQoNCkudGhlbihcbiAgICAgICAgICAoZGF0YSkgPT4gV2ViU29ja2V0VXRpbHMucmVhZFVJbnQzMihkYXRhKVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGF0YUxlbmd0aFByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoc3RhdGUuZGF0YUxlbmd0aCk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBkYXRhTGVuZ3RoUHJvbWlzZS50aGVuKChkYXRhTGVuZ3RoKSA9PiB7XG4gICAgICAgIHN0YXRlLmRhdGFMZW5ndGggPSBkYXRhTGVuZ3RoO1xuICAgICAgICByZXR1cm4gc3RhdGU7XG4gICAgICB9KTtcbiAgICB9KS50aGVuKChzdGF0ZSkgPT4ge1xuICAgICAgaWYgKHN0YXRlLmlzTWFza2VkKSB7XG4gICAgICAgIHJldHVybiBidWZmZXIuZ2V0KDQpLnRoZW4oKG1hc2spID0+IHtcbiAgICAgICAgICBzdGF0ZS5tYXNrID0gbWFzaztcbiAgICAgICAgICByZXR1cm4gc3RhdGU7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN0YXRlO1xuICAgIH0pLnRoZW4oKHN0YXRlKSA9PiB7XG4gICAgICByZXR1cm4gc3RhdGUuZGF0YUxlbmd0aCA/IGJ1ZmZlci5nZXQoc3RhdGUuZGF0YUxlbmd0aCkudGhlbigoZGF0YSkgPT4ge1xuICAgICAgICBzdGF0ZS5kYXRhID0gV2ViU29ja2V0VXRpbHMubWFzayhzdGF0ZS5tYXNrLCBkYXRhKTtcbiAgICAgICAgcmV0dXJuIHN0YXRlO1xuICAgICAgfSkgOiBzdGF0ZTtcbiAgICB9KS50aGVuKChzdGF0ZSkgPT4ge1xuICAgICAgaWYgKHN0YXRlLm9wQ29kZSA9PT0gT3BlcmF0aW9uQ29kZS5DT05ORUNUSU9OX0NMT1NFKSB7XG4gICAgICAgIHZhciBjb2RlID0gMDtcbiAgICAgICAgdmFyIHJlYXNvbiA9ICdVbmtub3duJztcblxuICAgICAgICBpZiAoc3RhdGUuZGF0YUxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjb2RlID0gIFdlYlNvY2tldFV0aWxzLnJlYWRVSW50MTYoc3RhdGUuZGF0YSk7XG4gICAgICAgICAgaWYgKHN0YXRlLmRhdGFMZW5ndGggPiAyKSB7XG4gICAgICAgICAgICByZWFzb24gPSBXZWJTb2NrZXRVdGlscy5hcnJheVRvU3RyaW5nKHN0YXRlLmRhdGEuc3ViYXJyYXkoMikpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnNvbGUubG9nKCdTb2NrZXQgaXMgY2xvc2VkOiAnICsgY29kZSArICcgJyArIHJlYXNvbik7XG5cbiAgICAgICAgdmFyIGRhdGFGcmFtZSA9IGNyZWF0ZU1lc3NhZ2VGcmFtZSgweDgsIHN0YXRlLmRhdGEsIHRydWUpO1xuICAgICAgICB0aGlzW3ByaXZhdGVzLnRjcFNvY2tldF0uc2VuZChkYXRhRnJhbWUuYnVmZmVyLCAwLCBkYXRhRnJhbWUubGVuZ3RoKTtcbiAgICAgICAgdGhpc1twcml2YXRlcy5vblRDUFNvY2tldENsb3NlXSgpO1xuICAgICAgfSBlbHNlIGlmIChzdGF0ZS5vcENvZGUgPT09IE9wZXJhdGlvbkNvZGUuVEVYVF9GUkFNRSB8fFxuICAgICAgICAgICAgICAgICBzdGF0ZS5vcENvZGUgPT09IE9wZXJhdGlvbkNvZGUuQklOQVJZX0ZSQU1FKSB7XG4gICAgICAgIHRoaXMuZW1pdCgnbWVzc2FnZScsIHN0YXRlLmRhdGEpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIWJ1ZmZlci5pc0VtcHR5KCkpIHtcbiAgICAgICAgdGhpc1twcml2YXRlcy5vbk1lc3NhZ2VGcmFtZV0oKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIFtwcml2YXRlcy5vblRDUFNvY2tldENsb3NlXSgpIHtcbiAgICB2YXIgdGNwU29ja2V0ID0gdGhpc1twcml2YXRlcy50Y3BTb2NrZXRdO1xuXG4gICAgaWYgKCF0Y3BTb2NrZXQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzW3ByaXZhdGVzLmNsaWVudHNdLmRlbGV0ZSh0Y3BTb2NrZXQuaG9zdCk7XG5cbiAgICB0Y3BTb2NrZXQub25kYXRhID0gdGNwU29ja2V0Lm9uZXJyb3IgPSB0Y3BTb2NrZXQub25jbG9zZSA9IG51bGw7XG5cbiAgICB0aGlzW3ByaXZhdGVzLnRjcFNvY2tldF0gPSBudWxsO1xuICB9XG5cbiAgW3ByaXZhdGVzLm9uVENQU2VydmVyU29ja2V0Q2xvc2VdKCkge1xuICAgIHZhciB0Y3BTZXJ2ZXJTb2NrZXQgPSB0aGlzW3ByaXZhdGVzLnRjcFNlcnZlclNvY2tldF07XG5cbiAgICBpZiAoIXRjcFNlcnZlclNvY2tldCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRjcFNlcnZlclNvY2tldC5vbmNvbm5lY3QgPSB0Y3BTZXJ2ZXJTb2NrZXQub25lcnJvciA9IG51bGw7XG5cbiAgICB0aGlzW3ByaXZhdGVzLnRjcFNlcnZlclNvY2tldF0gPSBudWxsO1xuXG4gICAgdGhpcy5lbWl0KCdzdG9wJyk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQge1xuICBTZXJ2ZXI6IFdlYlNvY2tldFNlcnZlcixcbiAgVXRpbHM6IFdlYlNvY2tldFV0aWxzLFxuICBGcmFtZUJ1ZmZlcjogV2ViU29ja2V0RnJhbWVCdWZmZXJcbn07XG4iLCIvKmdsb2JhbCBNYXAsIFNldCAqL1xuXG5mdW5jdGlvbiBlbnN1cmVWYWxpZEV2ZW50TmFtZShldmVudE5hbWUpIHtcbiAgaWYgKCFldmVudE5hbWUgfHwgdHlwZW9mIGV2ZW50TmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0V2ZW50IG5hbWUgc2hvdWxkIGJlIGEgdmFsaWQgbm9uLWVtcHR5IHN0cmluZyEnKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBlbnN1cmVWYWxpZEhhbmRsZXIoaGFuZGxlcikge1xuICBpZiAodHlwZW9mIGhhbmRsZXIgIT09ICdmdW5jdGlvbicpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0hhbmRsZXIgc2hvdWxkIGJlIGEgZnVuY3Rpb24hJyk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZW5zdXJlQWxsb3dlZEV2ZW50TmFtZShhbGxvd2VkRXZlbnRzLCBldmVudE5hbWUpIHtcbiAgaWYgKGFsbG93ZWRFdmVudHMgJiYgYWxsb3dlZEV2ZW50cy5pbmRleE9mKGV2ZW50TmFtZSkgPCAwKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdFdmVudCBcIicgKyBldmVudE5hbWUgKyAnXCIgaXMgbm90IGFsbG93ZWQhJyk7XG4gIH1cbn1cblxuLy8gSW1wbGVtZW50cyBwdWJsaXNoL3N1YnNjcmliZSBiZWhhdmlvdXIgdGhhdCBjYW4gYmUgYXBwbGllZCB0byBhbnkgb2JqZWN0LFxuLy8gc28gdGhhdCBvYmplY3QgY2FuIGJlIGxpc3RlbmVkIGZvciBjdXN0b20gZXZlbnRzLiBcInRoaXNcIiBjb250ZXh0IGlzIHRoZVxuLy8gb2JqZWN0IHdpdGggTWFwIFwibGlzdGVuZXJzXCIgcHJvcGVydHkgdXNlZCB0byBzdG9yZSBoYW5kbGVycy5cbnZhciBldmVudERpc3BhdGNoZXIgPSB7XG4gIC8qKlxuICAgKiBSZWdpc3RlcnMgbGlzdGVuZXIgZnVuY3Rpb24gdG8gYmUgZXhlY3V0ZWQgb25jZSBldmVudCBvY2N1cnMuXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBldmVudE5hbWUgTmFtZSBvZiB0aGUgZXZlbnQgdG8gbGlzdGVuIGZvci5cbiAgICogQHBhcmFtIHtmdW5jdGlvbn0gaGFuZGxlciBIYW5kbGVyIHRvIGJlIGV4ZWN1dGVkIG9uY2UgZXZlbnQgb2NjdXJzLlxuICAgKi9cbiAgb246IGZ1bmN0aW9uKGV2ZW50TmFtZSwgaGFuZGxlcikge1xuICAgIGVuc3VyZVZhbGlkRXZlbnROYW1lKGV2ZW50TmFtZSk7XG4gICAgZW5zdXJlQWxsb3dlZEV2ZW50TmFtZSh0aGlzLmFsbG93ZWRFdmVudHMsIGV2ZW50TmFtZSk7XG4gICAgZW5zdXJlVmFsaWRIYW5kbGVyKGhhbmRsZXIpO1xuXG4gICAgdmFyIGhhbmRsZXJzID0gdGhpcy5saXN0ZW5lcnMuZ2V0KGV2ZW50TmFtZSk7XG5cbiAgICBpZiAoIWhhbmRsZXJzKSB7XG4gICAgICBoYW5kbGVycyA9IG5ldyBTZXQoKTtcbiAgICAgIHRoaXMubGlzdGVuZXJzLnNldChldmVudE5hbWUsIGhhbmRsZXJzKTtcbiAgICB9XG5cbiAgICAvLyBTZXQuYWRkIGlnbm9yZXMgaGFuZGxlciBpZiBpdCBoYXMgYmVlbiBhbHJlYWR5IHJlZ2lzdGVyZWRcbiAgICBoYW5kbGVycy5hZGQoaGFuZGxlcik7XG4gIH0sXG5cbiAgLyoqXG4gICAqIFJlbW92ZXMgcmVnaXN0ZXJlZCBsaXN0ZW5lciBmb3IgdGhlIHNwZWNpZmllZCBldmVudC5cbiAgICogQHBhcmFtIHtzdHJpbmd9IGV2ZW50TmFtZSBOYW1lIG9mIHRoZSBldmVudCB0byByZW1vdmUgbGlzdGVuZXIgZm9yLlxuICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBoYW5kbGVyIEhhbmRsZXIgdG8gcmVtb3ZlLCBzbyBpdCB3b24ndCBiZSBleGVjdXRlZFxuICAgKiBuZXh0IHRpbWUgZXZlbnQgb2NjdXJzLlxuICAgKi9cbiAgb2ZmOiBmdW5jdGlvbihldmVudE5hbWUsIGhhbmRsZXIpIHtcbiAgICBlbnN1cmVWYWxpZEV2ZW50TmFtZShldmVudE5hbWUpO1xuICAgIGVuc3VyZUFsbG93ZWRFdmVudE5hbWUodGhpcy5hbGxvd2VkRXZlbnRzLCBldmVudE5hbWUpO1xuICAgIGVuc3VyZVZhbGlkSGFuZGxlcihoYW5kbGVyKTtcblxuICAgIHZhciBoYW5kbGVycyA9IHRoaXMubGlzdGVuZXJzLmdldChldmVudE5hbWUpO1xuXG4gICAgaWYgKCFoYW5kbGVycykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGhhbmRsZXJzLmRlbGV0ZShoYW5kbGVyKTtcblxuICAgIGlmICghaGFuZGxlcnMuc2l6ZSkge1xuICAgICAgdGhpcy5saXN0ZW5lcnMuZGVsZXRlKGV2ZW50TmFtZSk7XG4gICAgfVxuICB9LFxuXG4gIC8qKlxuICAgKiBSZW1vdmVzIGFsbCByZWdpc3RlcmVkIGxpc3RlbmVycyBmb3IgdGhlIHNwZWNpZmllZCBldmVudC5cbiAgICogQHBhcmFtIHtzdHJpbmd9IGV2ZW50TmFtZSBOYW1lIG9mIHRoZSBldmVudCB0byByZW1vdmUgYWxsIGxpc3RlbmVycyBmb3IuXG4gICAqL1xuICBvZmZBbGw6IGZ1bmN0aW9uKGV2ZW50TmFtZSkge1xuICAgIGlmICh0eXBlb2YgZXZlbnROYW1lID09PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhpcy5saXN0ZW5lcnMuY2xlYXIoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBlbnN1cmVWYWxpZEV2ZW50TmFtZShldmVudE5hbWUpO1xuICAgIGVuc3VyZUFsbG93ZWRFdmVudE5hbWUodGhpcy5hbGxvd2VkRXZlbnRzLCBldmVudE5hbWUpO1xuXG4gICAgdmFyIGhhbmRsZXJzID0gdGhpcy5saXN0ZW5lcnMuZ2V0KGV2ZW50TmFtZSk7XG5cbiAgICBpZiAoIWhhbmRsZXJzKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaGFuZGxlcnMuY2xlYXIoKTtcblxuICAgIHRoaXMubGlzdGVuZXJzLmRlbGV0ZShldmVudE5hbWUpO1xuICB9LFxuXG4gIC8qKlxuICAgKiBFbWl0cyBzcGVjaWZpZWQgZXZlbnQgc28gdGhhdCBhbGwgcmVnaXN0ZXJlZCBoYW5kbGVycyB3aWxsIGJlIGNhbGxlZFxuICAgKiB3aXRoIHRoZSBzcGVjaWZpZWQgcGFyYW1ldGVycy5cbiAgICogQHBhcmFtIHtzdHJpbmd9IGV2ZW50TmFtZSBOYW1lIG9mIHRoZSBldmVudCB0byBjYWxsIGhhbmRsZXJzIGZvci5cbiAgICogQHBhcmFtIHtPYmplY3R9IHBhcmFtZXRlcnMgT3B0aW9uYWwgcGFyYW1ldGVycyB0aGF0IHdpbGwgYmUgcGFzc2VkIHRvXG4gICAqIGV2ZXJ5IHJlZ2lzdGVyZWQgaGFuZGxlci5cbiAgICovXG4gIGVtaXQ6IGZ1bmN0aW9uKGV2ZW50TmFtZSwgcGFyYW1ldGVycykge1xuICAgIGVuc3VyZVZhbGlkRXZlbnROYW1lKGV2ZW50TmFtZSk7XG4gICAgZW5zdXJlQWxsb3dlZEV2ZW50TmFtZSh0aGlzLmFsbG93ZWRFdmVudHMsIGV2ZW50TmFtZSk7XG5cbiAgICB2YXIgaGFuZGxlcnMgPSB0aGlzLmxpc3RlbmVycy5nZXQoZXZlbnROYW1lKTtcblxuICAgIGlmICghaGFuZGxlcnMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBoYW5kbGVycy5mb3JFYWNoKGZ1bmN0aW9uKGhhbmRsZXIpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGhhbmRsZXIocGFyYW1ldGVycyk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn07XG5cbmV4cG9ydCBkZWZhdWx0IHtcbiAgLyoqXG4gICAqIE1peGVzIGRpc3BhdGNoZXIgbWV0aG9kcyBpbnRvIHRhcmdldCBvYmplY3QuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSB0YXJnZXQgT2JqZWN0IHRvIG1peCBkaXNwYXRjaGVyIG1ldGhvZHMgaW50by5cbiAgICogQHBhcmFtIHtBcnJheS48c3RyaW5nPn0gYWxsb3dlZEV2ZW50cyBPcHRpb25hbCBsaXN0IG9mIHRoZSBhbGxvd2VkIGV2ZW50XG4gICAqIG5hbWVzIHRoYXQgY2FuIGJlIGVtaXR0ZWQgYW5kIGxpc3RlbmVkIGZvci5cbiAgICogQHJldHVybnMge09iamVjdH0gVGFyZ2V0IG9iamVjdCB3aXRoIGFkZGVkIGRpc3BhdGNoZXIgbWV0aG9kcy5cbiAgICovXG4gIG1peGluOiBmdW5jdGlvbih0YXJnZXQsIGFsbG93ZWRFdmVudHMpIHtcbiAgICBpZiAoIXRhcmdldCB8fCB0eXBlb2YgdGFyZ2V0ICE9PSAnb2JqZWN0Jykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdPYmplY3QgdG8gbWl4IGludG8gc2hvdWxkIGJlIHZhbGlkIG9iamVjdCEnKTtcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIGFsbG93ZWRFdmVudHMgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICAgICFBcnJheS5pc0FycmF5KGFsbG93ZWRFdmVudHMpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0FsbG93ZWQgZXZlbnRzIHNob3VsZCBiZSBhIHZhbGlkIGFycmF5IG9mIHN0cmluZ3MhJyk7XG4gICAgfVxuXG4gICAgT2JqZWN0LmtleXMoZXZlbnREaXNwYXRjaGVyKS5mb3JFYWNoKGZ1bmN0aW9uKG1ldGhvZCkge1xuICAgICAgaWYgKHR5cGVvZiB0YXJnZXRbbWV0aG9kXSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICdPYmplY3QgdG8gbWl4IGludG8gYWxyZWFkeSBoYXMgXCInICsgbWV0aG9kICsgJ1wiIHByb3BlcnR5IGRlZmluZWQhJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgdGFyZ2V0W21ldGhvZF0gPSBldmVudERpc3BhdGNoZXJbbWV0aG9kXS5iaW5kKHRoaXMpO1xuICAgIH0sIHsgbGlzdGVuZXJzOiBuZXcgTWFwKCksIGFsbG93ZWRFdmVudHM6IGFsbG93ZWRFdmVudHMgfSk7XG5cbiAgICByZXR1cm4gdGFyZ2V0O1xuICB9XG59O1xuIiwiaW1wb3J0IEV2ZW50RGlzcGF0Y2hlciBmcm9tICdldmVudC1kaXNwYXRjaGVyLWpzJztcblxudmFyIHByaXZhdGVzID0ge1xuICBkYXRhOiBTeW1ib2woJ2RhdGEnKSxcbiAgcGVuZGluZ0RhdGFSZXF1ZXN0OiBTeW1ib2woJ3BlbmRpbmdEYXRhUmVxdWVzdCcpLFxuICBzcGxpY2U6IFN5bWJvbCgnc3BsaWNlJylcbn07XG5cbmNsYXNzIFdlYlNvY2tldEZyYW1lQnVmZmVyIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgRXZlbnREaXNwYXRjaGVyLm1peGluKHRoaXMsIFsnZnJhbWUnLCAnZGF0YSddKTtcblxuICAgIHRoaXNbcHJpdmF0ZXMuZGF0YV0gPSBuZXcgVWludDhBcnJheSgwKTtcbiAgICB0aGlzW3ByaXZhdGVzLnBlbmRpbmdEYXRhUmVxdWVzdF0gPSBudWxsO1xuICAgIHRoaXNbcHJpdmF0ZXMuc3BsaWNlXSA9IGZ1bmN0aW9uKGxlbmd0aCkge1xuICAgICAgdmFyIGRhdGEgPSB0aGlzW3ByaXZhdGVzLmRhdGFdO1xuXG4gICAgICB2YXIgc3BsaWNlZERhdGEgPSBkYXRhLnN1YmFycmF5KDAsIGxlbmd0aCk7XG4gICAgICB0aGlzW3ByaXZhdGVzLmRhdGFdID0gZGF0YS5zdWJhcnJheShsZW5ndGgsIGRhdGEubGVuZ3RoKTtcblxuICAgICAgcmV0dXJuIHNwbGljZWREYXRhO1xuICAgIH07XG4gIH1cblxuICBwdXQoZGF0YVRvUHV0KSB7XG4gICAgdmFyIGRhdGEgPSB0aGlzW3ByaXZhdGVzLmRhdGFdO1xuXG4gICAgdmFyIG5ld0RhdGEgPSBuZXcgVWludDhBcnJheShkYXRhLmxlbmd0aCArIGRhdGFUb1B1dC5sZW5ndGgpO1xuICAgIG5ld0RhdGEuc2V0KGRhdGEpO1xuICAgIG5ld0RhdGEuc2V0KGRhdGFUb1B1dCwgZGF0YS5sZW5ndGgpO1xuICAgIHRoaXNbcHJpdmF0ZXMuZGF0YV0gPSBuZXdEYXRhO1xuXG4gICAgdGhpcy5lbWl0KCdkYXRhJyk7XG5cbiAgICAvLyBJZiBubyBvbmUgd2FpdGluZyBmb3IgZGF0YSwgbGV0J3Mgc2lnbmFsIHRoYXQgd2UgaGF2ZSBuZXcgZnJhbWUhXG4gICAgaWYgKCF0aGlzW3ByaXZhdGVzLnBlbmRpbmdEYXRhUmVxdWVzdF0pIHtcbiAgICAgIHRoaXMuZW1pdCgnZnJhbWUnKTtcbiAgICB9XG4gIH1cblxuICBnZXQoZGF0YUxlbmd0aCkge1xuICAgIGlmICh0aGlzW3ByaXZhdGVzLnBlbmRpbmdEYXRhUmVxdWVzdF0pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ29uY3VycmVudCByZWFkIGlzIG5vdCBhbGxvd2VkLicpO1xuICAgIH1cblxuICAgIHRoaXNbcHJpdmF0ZXMucGVuZGluZ0RhdGFSZXF1ZXN0XSA9IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICB2YXIgZGF0YSA9IHRoaXNbcHJpdmF0ZXMuZGF0YV07XG4gICAgICBpZiAoZGF0YS5sZW5ndGggPj0gZGF0YUxlbmd0aCkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZSh0aGlzW3ByaXZhdGVzLnNwbGljZV0oZGF0YUxlbmd0aCkpO1xuICAgICAgfVxuXG4gICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICB0aGlzLm9uKCdkYXRhJywgZnVuY3Rpb24gb25EYXRhKCkge1xuICAgICAgICBpZiAoZGF0YS5sZW5ndGggPCBkYXRhTGVuZ3RoKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgc2VsZi5vZmYoJ2RhdGEnLCBvbkRhdGEpO1xuICAgICAgICByZXNvbHZlKHRoaXNbcHJpdmF0ZXMuc3BsaWNlXShkYXRhTGVuZ3RoKSk7XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJldHVybiB0aGlzW3ByaXZhdGVzLnBlbmRpbmdEYXRhUmVxdWVzdF0udGhlbigoZGF0YSkgPT4ge1xuICAgICAgdGhpc1twcml2YXRlcy5wZW5kaW5nRGF0YVJlcXVlc3RdID0gbnVsbDtcbiAgICAgIHJldHVybiBkYXRhO1xuICAgIH0pO1xuICB9XG5cbiAgaXNFbXB0eSgpIHtcbiAgICByZXR1cm4gdGhpc1twcml2YXRlcy5kYXRhXS5sZW5ndGggPT09IDA7XG4gIH07XG59XG5cbmV4cG9ydCBkZWZhdWx0IFdlYlNvY2tldEZyYW1lQnVmZmVyO1xuIiwidmFyIFdlYlNvY2tldFV0aWxzID0ge1xuICAvKipcbiAgICogTWFzayBldmVyeSBkYXRhIGVsZW1lbnQgd2l0aCB0aGUgbWFzayAoV2ViU29ja2V0IHNwZWNpZmljIGFsZ29yaXRobSkuXG4gICAqIEBwYXJhbSB7QXJyYXl9IG1hc2sgTWFzayBhcnJheS5cbiAgICogQHBhcmFtIHtBcnJheX0gYXJyYXkgRGF0YSBhcnJheSB0byBtYXNrLlxuICAgKiBAcmV0dXJucyB7QXJyYXl9IE1hc2tlZCBkYXRhIGFycmF5LlxuICAgKi9cbiAgbWFzayhtYXNrLCBhcnJheSkge1xuICAgIGlmIChtYXNrKSB7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGFycmF5W2ldID0gYXJyYXlbaV0gXiBtYXNrW2kgJSA0XTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGFycmF5O1xuICB9LFxuXG4gIC8qKlxuICAgKiBHZW5lcmF0ZXMgNC1pdGVtIGFycmF5LCBldmVyeSBpdGVtIG9mIHdoaWNoIGlzIGVsZW1lbnQgb2YgYnl0ZSBtYXNrLlxuICAgKiBAcmV0dXJucyB7VWludDhBcnJheX1cbiAgICovXG4gIGdlbmVyYXRlUmFuZG9tTWFzaygpIHtcbiAgICB2YXIgcmFuZG9tID0gbmV3IFVpbnQ4QXJyYXkoNCk7XG5cbiAgICB3aW5kb3cuY3J5cHRvLmdldFJhbmRvbVZhbHVlcyhyYW5kb20pO1xuXG4gICAgcmV0dXJuIHJhbmRvbTtcbiAgfSxcblxuICAvKipcbiAgICogQ29udmVydHMgc3RyaW5nIHRvIFVpbnQ4QXJyYXkuXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBzdHJpbmdWYWx1ZSBTdHJpbmcgdmFsdWUgdG8gY29udmVydC5cbiAgICogQHJldHVybnMge1VpbnQ4QXJyYXl9XG4gICAqL1xuICBzdHJpbmdUb0FycmF5KHN0cmluZ1ZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiBzdHJpbmdWYWx1ZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignc3RyaW5nVmFsdWUgc2hvdWxkIGJlIHZhbGlkIHN0cmluZyEnKTtcbiAgICB9XG5cbiAgICB2YXIgYXJyYXkgPSBuZXcgVWludDhBcnJheShzdHJpbmdWYWx1ZS5sZW5ndGgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyaW5nVmFsdWUubGVuZ3RoOyBpKyspIHtcbiAgICAgIGFycmF5W2ldID0gc3RyaW5nVmFsdWUuY2hhckNvZGVBdChpKTtcbiAgICB9XG5cbiAgICByZXR1cm4gYXJyYXk7XG4gIH0sXG5cbiAgLyoqXG4gICAqIENvbnZlcnRzIGFycmF5IHRvIHN0cmluZy4gRXZlcnkgYXJyYXkgZWxlbWVudCBpcyBjb25zaWRlcmVkIGFzIGNoYXIgY29kZS5cbiAgICogQHBhcmFtIHtVaW50OEFycmF5fSBhcnJheSBBcnJheSB3aXRoIHRoZSBjaGFyIGNvZGVzLlxuICAgKiBAcmV0dXJucyB7c3RyaW5nfVxuICAgKi9cbiAgYXJyYXlUb1N0cmluZyhhcnJheSkge1xuICAgIHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIGFycmF5KTtcbiAgfSxcblxuICAvKipcbiAgICogUmVhZHMgdW5zaWduZWQgMTYgYml0IHZhbHVlIGZyb20gdHdvIGNvbnNlcXVlbnQgOC1iaXQgYXJyYXkgZWxlbWVudHMuXG4gICAqIEBwYXJhbSB7VWludDhBcnJheX0gYXJyYXkgQXJyYXkgdG8gcmVhZCBmcm9tLlxuICAgKiBAcGFyYW0ge051bWJlcn0gb2Zmc2V0IEluZGV4IHRvIHN0YXJ0IHJlYWQgdmFsdWUuXG4gICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAqL1xuICByZWFkVUludDE2KGFycmF5LCBvZmZzZXQpIHtcbiAgICBvZmZzZXQgPSBvZmZzZXQgfHwgMDtcbiAgICByZXR1cm4gKGFycmF5W29mZnNldF0gPDwgOCkgKyBhcnJheVtvZmZzZXQgKyAxXTtcbiAgfSxcblxuICAvKipcbiAgICogUmVhZHMgdW5zaWduZWQgMzIgYml0IHZhbHVlIGZyb20gZm91ciBjb25zZXF1ZW50IDgtYml0IGFycmF5IGVsZW1lbnRzLlxuICAgKiBAcGFyYW0ge1VpbnQ4QXJyYXl9IGFycmF5IEFycmF5IHRvIHJlYWQgZnJvbS5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9mZnNldCBJbmRleCB0byBzdGFydCByZWFkIHZhbHVlLlxuICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgKi9cbiAgcmVhZFVJbnQzMihhcnJheSwgb2Zmc2V0KSB7XG4gICAgb2Zmc2V0ID0gb2Zmc2V0IHx8IDA7XG4gICAgcmV0dXJuIChhcnJheVtvZmZzZXRdIDw8IDI0KSArXG4gICAgICAoYXJyYXlbb2Zmc2V0ICsgMV0gPDwgMTYpICtcbiAgICAgIChhcnJheSBbb2Zmc2V0ICsgMl0gPDwgOCkgK1xuICAgICAgYXJyYXlbb2Zmc2V0ICsgM107XG4gIH0sXG5cbiAgLyoqXG4gICAqIFdyaXRlcyB1bnNpZ25lZCAxNiBiaXQgdmFsdWUgdG8gdHdvIGNvbnNlcXVlbnQgOC1iaXQgYXJyYXkgZWxlbWVudHMuXG4gICAqIEBwYXJhbSB7VWludDhBcnJheX0gYXJyYXkgQXJyYXkgdG8gd3JpdGUgdG8uXG4gICAqIEBwYXJhbSB7TnVtYmVyfSB2YWx1ZSAxNiBiaXQgdW5zaWduZWQgdmFsdWUgdG8gd3JpdGUgaW50byBhcnJheS5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9mZnNldCBJbmRleCB0byBzdGFydCB3cml0ZSB2YWx1ZS5cbiAgICogQHJldHVybnMge051bWJlcn1cbiAgICovXG4gIHdyaXRlVUludDE2KGFycmF5LCB2YWx1ZSwgb2Zmc2V0KSB7XG4gICAgYXJyYXlbb2Zmc2V0XSA9ICh2YWx1ZSAmIDB4ZmYwMCkgPj4gODtcbiAgICBhcnJheVtvZmZzZXQgKyAxXSA9IHZhbHVlICYgMHhmZjtcbiAgfSxcblxuICAvKipcbiAgICogV3JpdGVzIHVuc2lnbmVkIDE2IGJpdCB2YWx1ZSB0byB0d28gY29uc2VxdWVudCA4LWJpdCBhcnJheSBlbGVtZW50cy5cbiAgICogQHBhcmFtIHtVaW50OEFycmF5fSBhcnJheSBBcnJheSB0byB3cml0ZSB0by5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IHZhbHVlIDE2IGJpdCB1bnNpZ25lZCB2YWx1ZSB0byB3cml0ZSBpbnRvIGFycmF5LlxuICAgKiBAcGFyYW0ge051bWJlcn0gb2Zmc2V0IEluZGV4IHRvIHN0YXJ0IHdyaXRlIHZhbHVlLlxuICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgKi9cbiAgd3JpdGVVSW50MzIoYXJyYXksIHZhbHVlLCBvZmZzZXQpIHtcbiAgICBhcnJheVtvZmZzZXRdID0gKHZhbHVlICYgMHhmZjAwMDAwMCkgPj4gMjQ7XG4gICAgYXJyYXlbb2Zmc2V0ICsgMV0gPSAodmFsdWUgJiAweGZmMDAwMCkgPj4gMTY7XG4gICAgYXJyYXlbb2Zmc2V0ICsgMl0gPSAodmFsdWUgJiAweGZmMDApID4+IDg7XG4gICAgYXJyYXlbb2Zmc2V0ICsgM10gPSB2YWx1ZSAmIDB4ZmY7XG4gIH1cbn07XG5cbmV4cG9ydCBkZWZhdWx0IFdlYlNvY2tldFV0aWxzO1xuIl19
