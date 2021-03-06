import EventDispatcher from 'EventDispatcher';
import WebSocketFrameBuffer from './frame-buffer.es6';
import WebSocketUtils from './utils.es6';

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
 * @param {Uint8Array} httpRequestData HTTP Handshake data array.
 * @returns {Promise.<{ response: Uint8Array, headers: Map<string, string>}>}
 * Contains handshake headers received from client and response to send.
 */
function performHandshake(httpRequestData) {
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
class WebSocketServer {
  constructor(port) {
    EventDispatcher.mixin(this, ['message', 'stop']);

    var tcpServerSocket = this[privates.tcpServerSocket] =
      navigator.mozTCPSocket.listen(port, { binaryType: 'arraybuffer' });

    tcpServerSocket.onconnect = this[privates.onTCPServerSocketConnect].bind(
      this
    );

    tcpServerSocket.onerror = this[privates.onTCPServerSocketClose].bind(this);

    this[privates.clients] = new Map();
  }

  /**
   * Send data to the connected client
   * @param {ArrayBuffer|Array|string} data Data to send.
   */
  send(data) {
    if (!ArrayBuffer.isView(data) && !(data instanceof ArrayBuffer)) {
      if (typeof data === 'string') {
        data = new Uint8Array(WebSocketUtils.stringToArray(data));
      } else if (Array.isArray(data)) {
        data = new Uint8Array(data);
      } else {
        throw new Error('Unsupported data type: ' + typeof data);
      }
    }

    var dataFrame = createMessageFrame(
      OperationCode.BINARY_FRAME,
      data,
      true /* isCompleted */,
      false /* isMasked */
    );

    this[privates.clients].forEach((client) => {
      client.socket.send(dataFrame.buffer, 0, dataFrame.length);
    });
  }

  /**
   * Destroys socket connection.
   */
  stop() {
    this[privates.clients].forEach((client) => {
      this[privates.onTCPSocketClose](client.socket);
    });

    var tcpServerSocket = this[privates.tcpServerSocket];
    if (tcpServerSocket) {
      tcpServerSocket.close();
      this[privates.onTCPServerSocketClose]();
    }
  }

  [privates.onTCPServerSocketConnect](tcpSocket) {
    tcpSocket.ondata = this[privates.onTCPSocketData].bind(this);
    tcpSocket.onclose = tcpSocket.onerror =
      this[privates.onTCPSocketClose].bind(this, tcpSocket);
  }

  /**
   * MozTcpSocket data handler.
   * @param {TCPSocketEvent} socketEvent TCPSocket data event.
   */
  [privates.onTCPSocketData](socketEvent) {
    var socket = socketEvent.target;
    var clientId = socket.host + ':' + socket.port;
    var client = this[privates.clients].get(clientId);

    var frameData = new Uint8Array(socketEvent.data);

    // If we don't have connection info from this host let's perform handshake.
    if (!client) {
      performHandshake(frameData).then((handshake) => {
        if (!handshake) {
          throw new Error(
            'Handshake with host %s:%s failed', socket.host, socket.port
          );
        }

        socket.send(
          handshake.response.buffer, 0, handshake.response.byteLength
        );

        var client = {
          socket: socket,
          headers: handshake.headers,
          buffer: new WebSocketFrameBuffer()
        };

        client.buffer.on(
          'frame', this[privates.onMessageFrame].bind(this, client)
        );

        this[privates.clients].set(clientId, client);
      }).catch(() => {
        this[privates.onTCPSocketClose](socket);
      });
      return;
    }

    client.buffer.put(frameData);
  }

  /**
   * Process WebSocket incoming frame.
   * @param {{socket: TCPSocket, buffer: WebSocketFrameBuffer}} client Client
   * descriptor object.
   */
  [privates.onMessageFrame](client) {
    client.buffer.get(2).then((controlData) => {
      var state = {
        isCompleted: (controlData[0] & 0x80) === 0x80,
        isMasked: (controlData[1] & 0x80) === 0x80,
        isCompressed: (controlData[0] & 0x40) === 0x40,
        opCode: controlData[0] & 0xf,
        dataLength: controlData[1] & 0x7f,
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
        throw new Error(
          'Reserved for future non-control frames are not supported!'
        );
      }

      if (state.opCode > 10) {
        throw new Error(
          'Reserved for future control frames are not supported!'
        );
      }

      return state;
    }).then((state) => {
      var dataLengthPromise;
      if (state.dataLength === 126) {
        dataLengthPromise = client.buffer.get(2).then(
          (data) => WebSocketUtils.readUInt16(data)
        );
      } else if (state.dataLength == 127) {
        dataLengthPromise = client.buffer.get(4).then(
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
        return client.buffer.get(4).then((mask) => {
          state.mask = mask;
          return state;
        });
      }
      return state;
    }).then((state) => {
      if (state.dataLength) {
        return client.buffer.get(state.dataLength).then((data) => {
          state.data = WebSocketUtils.mask(state.mask, data);
          return state;
        });
      }
      return state;
    }).then((state) => {
      var dataFrame;
      if (state.opCode === OperationCode.CONNECTION_CLOSE) {
        var code = 0;
        var reason = 'Unknown';

        if (state.dataLength > 0) {
          code =  WebSocketUtils.readUInt16(state.data);
          if (state.dataLength > 2) {
            reason = WebSocketUtils.arrayToString(state.data.subarray(2));
          }
        }

        console.log('Socket is closed: %s (code is %s)', reason, code);

        dataFrame = createMessageFrame(
          OperationCode.CONNECTION_CLOSE, state.data, true /* isCompleted */
        );
        client.socket.send(dataFrame.buffer, 0, dataFrame.length);
        this[privates.onTCPSocketClose](client.socket);
      } else if (state.opCode === OperationCode.TEXT_FRAME ||
                 state.opCode === OperationCode.BINARY_FRAME) {
        this.emit('message', state.data);
      } else if (state.opCode === OperationCode.PING) {
        console.log(
          'PING frame is received (masked: %s, hasData: %s)',
          state.isMasked,
          !!state.data
        );

        if (!state.isCompleted) {
          throw new Error('Fragmented Ping frame is not supported!');
        }

        if (state.dataLength > 125) {
          throw new Error(
            'Ping frame can not have more than 125 bytes of data!'
          );
        }

        dataFrame = createMessageFrame(
          OperationCode.PONG, state.data, true /* isCompleted */, state.isMasked
        );
        client.socket.send(dataFrame.buffer, 0, dataFrame.length);
      }

      if (!client.buffer.isEmpty()) {
        this[privates.onMessageFrame](client);
      }
    }).catch((e) => {
      var code = 1002;
      var reason = e.message || e.name || 'Unknown failure on server';

      console.log('Socket is closed: %s (code is %s)', reason, code);

      // 2 bytes for the code and the rest for the reason.
      var data = new Uint8Array(2 + reason.length);
      WebSocketUtils.writeUInt16(data, code, 0);
      data.set(WebSocketUtils.stringToArray(reason), 2);

      var dataFrame = createMessageFrame(
        OperationCode.CONNECTION_CLOSE, data, true /* isCompleted */
      );
      client.socket.send(dataFrame.buffer, 0, dataFrame.length);
      this[privates.onTCPSocketClose](client.socket);
    });
  }

  [privates.onTCPSocketClose](socket) {
    if (!socket) {
      return;
    }

    try {
      socket.close();
      socket.ondata = socket.onerror = socket.onclose = null;
    } catch(e) {
      console.log(
        'Error occurred while closing socket %s', e.message || e.name
      );
    }

    this[privates.clients].delete(socket.host + ':' + socket.port);
  }

  [privates.onTCPServerSocketClose]() {
    var tcpServerSocket = this[privates.tcpServerSocket];

    if (!tcpServerSocket) {
      return;
    }

    tcpServerSocket.onconnect = tcpServerSocket.onerror = null;

    this[privates.tcpServerSocket] = null;

    this.emit('stop');
  }
}

export default {
  Server: WebSocketServer,
  Utils: WebSocketUtils,
  FrameBuffer: WebSocketFrameBuffer
};
