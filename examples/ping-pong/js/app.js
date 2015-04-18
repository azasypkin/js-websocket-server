/* global FxOSWebSocket */

(function(exports) {
  'use strict';

  exports.addEventListener('load', function() {
    var messages = document.getElementById('messages');

    var websocketServer = new FxOSWebSocket.Server(8008);
    websocketServer.on('message', (message) => {
      var dataArray = new Uint8Array(message);
      var dataString = String.fromCharCode.apply(null, dataArray);

      var li = document.createElement('li');
      li.textContent = 'Date: ' + (new Date()) + ', message: ' + dataString;
      messages.appendChild(li);

      websocketServer.send(
        FxOSWebSocket.Utils.stringToArray('Echo: ' + dataString)
      );
    });
  });
})(window);
