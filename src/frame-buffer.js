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
