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
