/* eslint-disable brace-style, camelcase, semi */
/* global R5 */

require('dotenv').config();
module.exports = Rabbitmq;

if (!global.R5) {
  global.R5 = {
    out: console
  };
}

// Constructors

function Rabbitmq (host, user, pass, vhost = 'development') {
  this.host = host;
  this.user = user;
  this.pass = pass;
  this.vhost = vhost;
}

// Public Methods

Rabbitmq.prototype.connect = function (config, retry_after_time = 5, callback = function () {}) {
  let _this = this;
  this.config = config;

  _this.amqp = require('amqplib/callback_api');
  _this.amqp.connect(`amqp://${_this.user}:${_this.pass}@${_this.host}/${_this.vhost}`, function (err, conn) {
    if (err) { throw new Error(err.message); }
    _this.conn = conn;

    _this.conn.createChannel(function (err, ch) {
      if (err) { throw new Error(err.message); }
      retry_after_time = 5;

      _this.ch = ch;
      _this.ch.assertExchange(config.exchange_name, 'topic', { durable: false });
      R5.out.log(`Connected to RabbitMQ (queue: ${config.queue_name})`);
      return callback();
    });

    _this.conn.on('close', function () {
      R5.out.error(`[AMQP] reconnecting on close in ${retry_after_time} seconds`);
      retry_after_time = retry_after_time + 5;
      setTimeout(function () {
        _this.connect(_this.config, retry_after_time);
      }, (retry_after_time - 5) * 1000);
    });
  });
}

Rabbitmq.prototype.ack = function (msg) {
  this.ch.ack(msg);
}

Rabbitmq.prototype.bind = function (callback) {
  this.ch.assertQueue(this.config.queue_name, { durable: true });
  this.ch.prefetch(1);

  R5.out.log(`Waiting for messages from ${this.config.message_type}..`);
  this.ch.consume(this.config.queue_name, function (msg) {
    let message = parse_json(msg.content.toString());
    callback(msg, message);
  }, { noAck: false });
};

Rabbitmq.prototype.send = function (message, callback = function () {}) {
  let message_string = JSON.stringify(message);

  this.ch.assertQueue(this.config.queue_name, { durable: true });
  this.ch.sendToQueue(this.config.queue_name, Buffer.from(message_string, 'utf8'), {
    persistent: true
  });

  R5.out.log(`SEND ${message.category}:${message.type}`);
  return callback();
};

// Private Methods

function json_is_valid (json_str) {
  try {
    return (JSON.parse(json_str) && !!json_str);
  } catch (e) {
    return false;
  }
}

function parse_json (str) {
  let parsed_result = null;

  if (json_is_valid(str)) {
    parsed_result = JSON.parse(str)
  }
  else {
    R5.out.error(`JSON is invalid: ${str}`);
  }

  return parsed_result;
}
