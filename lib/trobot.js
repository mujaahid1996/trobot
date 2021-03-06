var Trello = require("node-trello"),
    crypto = require('crypto'),
    util = require('util'),
    ee = require('events');

function dataparser(req, cb) {
  var str = '';

  req
    .on('error', cb)
    .on('data', function(chunk) {
      str += chunk;
    }).on('end', function() {
      req.body = str;
      cb(null, str);
    });
}

var Trobot = module.exports = function() {
  var self = this;
  self.grabUserdata();
  self.trello = new Trello(this.data.key, this.data.token);

  ee.call(self);

  self.on('error', function(err, statusCode, res){
    console.error(err.message || err);
    res.statusCode = statusCode;
    res.end();
  });

  self.on('request', function(req, res){
    
    res.on('finish', function(){
      self.emit('log', 'End response');
    });
    
    dataparser(req, function(err, str){
      if (err) {
        self.emit('error', err, 400, res);
        return
      }
      self.emit('log', 'dataparser ok');

      var flag = self.originIsTrello(req);
      if (!flag) {
        self.emit('error', 'origin is not trello', 401, res);
        return
      }
      self.emit('log', 'origin is trello');

      try {
        var data = JSON.parse(str),
            event = data.action.type,
            model = data.model.name || data.model.fullName,
            user = data.action.memberCreator.fullName;

        self.emit('log', user + ' triggered ' + event + ' on ' + model);

        if (self.listenerCount(event)) {
          self.emit(event, data, res);

        } else {
          self.emit('log', 'no handler for ' + event + ' found.');
          res.statusCode = 200;
          res.end();
        }

      } catch(err) {
        self.emit('error', err, 400, res);
      }
    });
  });

  self.on('reply', function(cardId, answer, res){
    var url = "/1/cards/" + cardId + "/actions/comments",
    		payload = {text: answer};

    self.trello.post(url, payload, function(err, data) {
      if (err) {
        self.emit('error', err, 500, res);
        return
      }
      self.emit('log', 'reply ok');
      res.statusCode = 200;
      res.end();
    });
  });
}

util.inherits(Trobot, ee);

Trobot.prototype.grabUserdata = function() {
  this.data = {};

  ['key', 'token', 'secret', 'userid', 'username', 'webhookcallbackurldefault']
    .forEach(function(key){
      this.data[key] = process.env[key.toUpperCase()];
    }, this);
}

Trobot.prototype.originIsTrello = function(request, secret, callbackURL) {
  var base64Digest = function (s) {
        return crypto.createHmac('sha1', secret).update(s).digest('base64');
      };
  secret = secret || this.data.secret;
  callbackURL = callbackURL || this.data.webhookcallbackurldefault;

  var content = request.body + callbackURL;
  var doubleHash = base64Digest(base64Digest(content));
  var headerHash = base64Digest(request.headers['x-trello-webhook']);
  return doubleHash == headerHash;
}
