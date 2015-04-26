import EventDispatcher from 'event-dispatcher-js';

var privates = {
  data: Symbol('data'),
  pendingDataRequest: Symbol('pendingDataRequest'),
  splice: Symbol('splice')
};

class WebSocketFrameBuffer {
  constructor() {
    EventDispatcher.mixin(this, ['frame', 'data']);

    this[privates.data] = new Uint8Array(0);
    this[privates.pendingDataRequest] = null;
    this[privates.splice] = function(length) {
      var data = this[privates.data];

      var splicedData = data.subarray(0, length);
      this[privates.data] = data.subarray(length, data.length);

      return splicedData;
    };
  }

  put(dataToPut) {
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

  get(dataLength) {
    if (this[privates.pendingDataRequest]) {
      throw new Error('Concurrent read is not allowed.');
    }

    this[privates.pendingDataRequest] = new Promise((resolve) => {
      var data = this[privates.data];
      if (data.length >= dataLength) {
        return resolve(this[privates.splice](dataLength));
      }

      var self = this;
      this.on('data', function onData() {
        if (data.length < dataLength) {
          return;
        }

        self.off('data', onData);
        resolve(this[privates.splice](dataLength));
      });
    });

    return this[privates.pendingDataRequest].then((data) => {
      this[privates.pendingDataRequest] = null;
      return data;
    });
  }

  isEmpty() {
    return this[privates.data].length === 0;
  };
}

export default WebSocketFrameBuffer;
