!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.WebSocketServer=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*jshint esnext:true*/
/*global Map, Set */

/* exported EventDispatcher */

module.exports = window.EventDispatcher = (function() {
  'use strict';

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
    on: function(eventName, handler) {
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
    off: function(eventName, handler) {
      ensureValidEventName(eventName);
      ensureAllowedEventName(this.allowedEvents, eventName);
      ensureValidHandler(handler);

      var handlers = this.listeners.get(eventName);

      if (!handlers) {
        return;
      }

      handlers.delete(handler);

      if (!handlers.size) {
        this.listeners.delete(eventName);
      }
    },

    /**
     * Removes all registered listeners for the specified event.
     * @param {string} eventName Name of the event to remove all listeners for.
     */
    offAll: function(eventName) {
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

      this.listeners.delete(eventName);
    },

    /**
     * Emits specified event so that all registered handlers will be called
     * with the specified parameters.
     * @param {string} eventName Name of the event to call handlers for.
     * @param {Object} parameters Optional parameters that will be passed to
     * every registered handler.
     */
    emit: function(eventName, parameters) {
      ensureValidEventName(eventName);
      ensureAllowedEventName(this.allowedEvents, eventName);

      var handlers = this.listeners.get(eventName);

      if (!handlers) {
        return;
      }

      handlers.forEach(function(handler) {
        try {
          handler(parameters);
        } catch (e) {
          console.error(e);
        }
      });
    }
  };

  return {
    /**
     * Mixes dispatcher methods into target object.
     * @param {Object} target Object to mix dispatcher methods into.
     * @param {Array.<string>} allowedEvents Optional list of the allowed event
     * names that can be emitted and listened for.
     * @returns {Object} Target object with added dispatcher methods.
     */
    mixin: function(target, allowedEvents) {
      if (!target || typeof target !== 'object') {
        throw new Error('Object to mix into should be valid object!');
      }

      if (typeof allowedEvents !== 'undefined' &&
          !Array.isArray(allowedEvents)) {
        throw new Error('Allowed events should be a valid array of strings!');
      }

      Object.keys(eventDispatcher).forEach(function(method) {
        if (typeof target[method] !== 'undefined') {
          throw new Error(
            'Object to mix into already has "' + method + '" property defined!'
          );
        }
        target[method] = eventDispatcher[method].bind(this);
      }, { listeners: new Map(), allowedEvents: allowedEvents });

      return target;
    }
  };
})();

},{}],2:[function(require,module,exports){
/*jshint esnext:true*/
/* global EventDispatcher */
/* exported WebSocketFrameBuffer */

module.exports = window.WebSocketFrameBuffer = (function() {
  'use strict';

   /**
   * Map used to store private members for every WebSocketFrameBuffer instance.
   * @type {WeakMap}
   */
  var priv = new WeakMap();

  function splice(length) {
    /* jshint validthis: true */
    var members = priv.get(this);

    var splicedData = members.data.subarray(0, length);
    members.data = members.data.subarray(length, members.data.length);

    return splicedData;
  }

  var WebSocketFrameBuffer = function() {
    EventDispatcher.mixin(this, ['frame', 'data']);

    priv.set(this, {
      data: new Uint8Array(0),
      pendingDataRequest: null,

      splice: splice.bind(this)
    });
  };

  WebSocketFrameBuffer.prototype.put = function(data) {
    var members = priv.get(this);

    var newData = new Uint8Array(members.data.length + data.length);
    newData.set(members.data);
    newData.set(data, members.data.length);
    members.data = newData;

    this.emit('data');

    // If no one waiting for data, let's signal that we have new frame!
    if (!members.pendingDataRequest) {
      this.emit('frame');
    }
  };

  WebSocketFrameBuffer.prototype.get = function(dataLength) {
    var members = priv.get(this);

    if (members.pendingDataRequest) {
      throw new Error('Concurrent read is not allowed.');
    }

    members.pendingDataRequest = new Promise((resolve) => {
      if (members.data.length >= dataLength) {
        return resolve(members.splice(dataLength));
      }

      var self = this;
      this.on('data', function onData() {
        if (members.data.length < dataLength) {
          return;
        }

        self.off('data', onData);
        resolve(members.splice(dataLength));
      });
    });

    return members.pendingDataRequest.then((data) => {
      members.pendingDataRequest = null;
      return data;
    });
  };

  WebSocketFrameBuffer.prototype.isEmpty = function() {
    return priv.get(this).data.length === 0;
  };

  return WebSocketFrameBuffer;
})();

},{}],3:[function(require,module,exports){
/*jshint esnext:true*/
/* global EventDispatcher,
          Map,
          WeakMap,
          WebSocketFrameBuffer,
          WebSocketUtils
*/
/*exported WebSocketServer */

module.exports = window.WebSocketServer = (function() {
  'use strict';

  var EventDispatcher = require('./event-dispatcher');
  var WebSocketFrameBuffer = require('./frame-buffer');
  var WebSocketUtils = require('./utils');

  /**
   * Sequence used to separate HTTP request headers and body.
   * @const {string}
   */
  const CRLF = '\r\n';

  /**
   * Magic GUID defined by RFC to concatenate with web socket key during
   * websocket handshake.
   * @const {string}
   */
  const WEBSOCKET_KEY_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

  /**
   * Websocket handshake response template string, {web-socket-key} should be
   * replaced with the appropriate key.
   * @const {string}
   */
  const WEBSOCKET_HANDSHAKE_RESPONSE =
    'HTTP/1.1 101 Switching Protocols' + CRLF +
    'Connection: Upgrade' + CRLF +
    'Upgrade: websocket' + CRLF +
    'Sec-WebSocket-Accept: {web-socket-key}' + CRLF + CRLF;

  /**
   * Enumeration of all possible operation codes.
   * @enum {number}
   */
  const OperationCode = {
    CONTINUATION_FRAME: 0,
    TEXT_FRAME: 1,
    BINARY_FRAME: 2,
    CONNECTION_CLOSE: 8,
    PING: 9,
    PONG: 10
  };

  /**
   * Map used to store private members for every WebSocket instance.
   * @type {WeakMap}
   */
  var priv = new WeakMap();

  /**
   * Extracts HTTP header map from HTTP header string.
   * @param {string} httpHeaderString HTTP header string.
   * @returns {Map.<string, string>} HTTP header key-value map.
   */
  function getHttpHeaders(httpHeaderString) {
    var httpHeaders = httpHeaderString.trim().split(CRLF);
    return new Map(httpHeaders.map((httpHeader) => {
      return httpHeader.split(':').map((entity) => entity.trim());
    }));
  }

  /**
   * Performs WebSocket HTTP Handshake.
   * @param {TCPSocket} socket Connection socket.
   * @param {Uint8Array} httpRequestData HTTP Handshake data array.
   * @returns {Map.<string, string>} Parsed http headers
   */
  function performHandshake(socket, httpRequestData) {
    var httpHeaders = getHttpHeaders(
      WebSocketUtils.arrayToString(httpRequestData).split(CRLF + CRLF)[0]
    );

    var key = WebSocketUtils.stringToArray(
      httpHeaders.get('Sec-WebSocket-Key') + WEBSOCKET_KEY_GUID
    );

    var subtle = window.crypto.subtle;
    return subtle.digest({ name: 'SHA-1' }, key).then((hashArrayBuffer) => {
      var webSocketKey = btoa(WebSocketUtils.arrayToString(
        new Uint8Array(hashArrayBuffer)
      ));
      var arrayResponse = WebSocketUtils.stringToArray(
        WEBSOCKET_HANDSHAKE_RESPONSE.replace('{web-socket-key}', webSocketKey)
      );

      socket.send(arrayResponse.buffer, 0, arrayResponse.byteLength);

      return httpHeaders;
    });
  }

  /**
   * MozTcpSocket data handler.
   * @param {TCPSocketEvent} eData TCPSocket data event.
   */
  function onSocketData(eData) {
    /* jshint validthis: true */
    var members = priv.get(this);
    var frameData = new Uint8Array(eData.data);

    // If we don't have connection info from this host let's perform handshake
    // Currently we support only ONE client from host.
    if (!members.clients.has(members.socket.host)) {
      performHandshake(members.socket, frameData).then((handshakeResult) => {
        if (handshakeResult) {
          members.clients.set(members.socket.host, handshakeResult);
        }
      });
      return;
    }

    members.frameBuffer.put(frameData);
  }

  /**
   * Process WebSocket incoming frame.
   * @param {Uint8Array} frame Message frame data in view of Uint8Array.
   */
  function onMessageFrame() {
    /* jshint validthis: true */
    var members = priv.get(this);
    var buffer = members.frameBuffer;
    buffer.get(2).then((controlData) => {
      var state = {
        isCompleted: (controlData[0] & 0x80) == 0x80,
        isMasked: (controlData[1] & 0x80) == 0x80,
        isCompressed: (controlData[0] & 0x40) == 0x40,
        opCode: controlData[0] & 0xf,
        dataLength: controlData[1] & 0x7f,
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
    }).then((state) => {
      var dataLengthPromise;
      if (state.dataLength === 126) {
        dataLengthPromise = buffer.get(2).then(
          (data) => WebSocketUtils.readUInt16(data)
        );
      } else if (state.dataLength == 127) {
        dataLengthPromise = buffer.get(4).then(
          (data) => WebSocketUtils.readUInt32(data)
        );
      } else {
        dataLengthPromise = Promise.resolve(state.dataLength);
      }

      return dataLengthPromise.then((dataLength) => {
        state.dataLength = dataLength;
        return state;
      });
    }).then((state) => {
      if (state.isMasked) {
        return buffer.get(4).then((mask) => {
          state.mask = mask;
          return state;
        });
      }
      return state;
    }).then((state) => {
      return state.dataLength ? buffer.get(state.dataLength).then((data) => {
        state.data = WebSocketUtils.mask(state.mask, data);
        return state;
      }) : state;
    }).then((state) => {
      if (state.opCode === OperationCode.CONNECTION_CLOSE) {
        var code = 0;
        var reason = 'Unknown';

        if (state.dataLength > 0) {
          code =  WebSocketUtils.readUInt16(state.data);
          if (state.dataLength > 2) {
            reason = WebSocketUtils.arrayToString(state.data.subarray(2));
          }
        }

        console.log('Socket is closed: ' + code + ' ' + reason);

        var dataFrame = createMessageFrame(0x8, state.data, true);
        members.socket.send(dataFrame.buffer, 0, dataFrame.length);
        members.onSocketClose();
      } else if (state.opCode === OperationCode.TEXT_FRAME ||
                 state.opCode === OperationCode.BINARY_FRAME) {
        this.emit('message', state.data);
      }

      if (!buffer.isEmpty()) {
        members.onMessageFrame();
      }
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
    var dataLength = (data && data.length) || 0;
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
    outputBuffer[0] = isComplete ? opCode | 0x80 : opCode;
    outputBuffer[1] = isMasked ? secondByte | 0x80 : secondByte;

    // Writing DATA LENGTH
    switch (secondByte) {
      case 126:
        WebSocketUtils.writeUInt16(outputBuffer, dataLength, 2);
        break;
      case 127:
        WebSocketUtils.writeUInt32(outputBuffer, 0, 2);
        WebSocketUtils.writeUInt32(outputBuffer, dataLength, 6);
        break;
    }

    if (isMasked && dataLength) {
      var mask = WebSocketUtils.generateRandomMask();

      // Writing MASK
      outputBuffer.set(mask, dataOffset - 4);

      WebSocketUtils.mask(mask, data);
    }

    for(var i = 0; i < dataLength; i++) {
      outputBuffer[dataOffset + i] = data[i];
    }

    return outputBuffer;
  }

  function onSocketClose() {
    /* jshint validthis: true */
    var members = priv.get(this);

    members.clients.delete(members.socket.host);
    members.socket.ondata = null;
  }

  /**
   * WebSocketServer constructor that accepts port to listen on.
   * @param {Number} port Number to listen for websocket connections.
   * @constructor
   */
  var WebSocketServer = function(port) {
    EventDispatcher.mixin(this, ['message']);

    var privateMembers = {
      tcpSocket: navigator.mozTCPSocket.listen(port, {
        binaryType: 'arraybuffer'
      }),
      clients: new Map(),
      frameBuffer: new WebSocketFrameBuffer(),

      // Private methods
      onSocketData: onSocketData.bind(this),
      onMessageFrame: onMessageFrame.bind(this),
      onSocketClose: onSocketClose.bind(this)
    };

    privateMembers.tcpSocket.onconnect = (eSocket) => {
      privateMembers.socket = eSocket;

      privateMembers.frameBuffer.on('frame', privateMembers.onMessageFrame);

      eSocket.ondata = privateMembers.onSocketData;
      eSocket.onerror = eSocket.onclose = privateMembers.onSocketClose;
    };

    priv.set(this, privateMembers);
  };

  /**
   * Send data to the connected client
   * @param {ArrayBuffer|Array|string} data Data to send.
   */
  WebSocketServer.prototype.send = function(data) {
    if (!ArrayBuffer.isView(data) && !(data instanceof ArrayBuffer)) {
      if (typeof data === 'string') {
        data = new Uint8Array(WebSocketUtils.stringToArray(data));
      } else if (Array.isArray(data)) {
        data = new Uint8Array(data);
      } else {
        throw new Error('Unsupported data type: ' + typeof data);
      }
    }

    var dataFrame = createMessageFrame(0x2, data, true, false);

    priv.get(this).socket.send(dataFrame.buffer, 0, dataFrame.length);
  };

  /**
   * Destroys socket connection.
   */
  WebSocketServer.prototype.stop = function() {
    var members = priv.get(this);

    // close connection
    if (members.socket) {
      members.socket.close();
      members.socket = members.socket.ondata = members.socket.onerror = null;
    }

    if (members.tcpSocket) {
      members.tcpSocket.close();
      members.tcpSocket = members.tcpSocket.onconnect = null;
    }

    members.clients.clear();
  };

  return WebSocketServer;
})();

},{"./event-dispatcher":1,"./frame-buffer":2,"./utils":4}],4:[function(require,module,exports){
/*jshint esnext:true*/
/* exported WebSocketUtils */

module.exports = window.WebSocketUtils = (function() {
  'use strict';

  return {
    /**
     * Mask every data element with the mask (WebSocket specific algorithm).
     * @param {Array} mask Mask array.
     * @param {Array} array Data array to mask.
     * @returns {Array} Masked data array.
     */
    mask: function (mask, array) {
      if (mask) {
        for (var i = 0; i < array.length; i++) {
          array[i] = array[i] ^ mask[i % 4];
        }
      }
      return array;
    },

    /**
     * Generates 4-item array, every item of which is element of byte mask.
     * @returns {Uint8Array}
     */
    generateRandomMask: function () {
      var random = new Uint8Array(4);

      window.crypto.getRandomValues(random);

      return random;
    },

    /**
     * Converts string to Uint8Array.
     * @param {string} stringValue String value to convert.
     * @returns {Uint8Array}
     */
    stringToArray: function (stringValue) {
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
    arrayToString: function (array) {
      return String.fromCharCode.apply(null, array);
    },

    /**
     * Reads unsigned 16 bit value from two consequent 8-bit array elements.
     * @param {Uint8Array} array Array to read from.
     * @param {Number} offset Index to start read value.
     * @returns {Number}
     */
    readUInt16: function (array, offset) {
      offset = offset || 0;
      return (array[offset] << 8) + array[offset + 1];
    },

    /**
     * Reads unsigned 32 bit value from four consequent 8-bit array elements.
     * @param {Uint8Array} array Array to read from.
     * @param {Number} offset Index to start read value.
     * @returns {Number}
     */
    readUInt32: function (array, offset) {
      offset = offset || 0;
      return (array[offset] << 24) +
        (array[offset + 1] << 16) +
        (array [offset + 2] << 8) +
        array[offset + 3];
    },

    /**
     * Writes unsigned 16 bit value to two consequent 8-bit array elements.
     * @param {Uint8Array} array Array to write to.
     * @param {Number} value 16 bit unsigned value to write into array.
     * @param {Number} offset Index to start write value.
     * @returns {Number}
     */
    writeUInt16: function (array, value, offset) {
      array[offset] = (value & 0xff00) >> 8;
      array[offset + 1] = value & 0xff;
    },

    /**
     * Writes unsigned 16 bit value to two consequent 8-bit array elements.
     * @param {Uint8Array} array Array to write to.
     * @param {Number} value 16 bit unsigned value to write into array.
     * @param {Number} offset Index to start write value.
     * @returns {Number}
     */
    writeUInt32: function (array, value, offset) {
      array[offset] = (value & 0xff000000) >> 24;
      array[offset + 1] = (value & 0xff0000) >> 16;
      array[offset + 2] = (value & 0xff00) >> 8;
      array[offset + 3] = value & 0xff;
    }
  };
})(window);

},{}]},{},[3])(3)
});