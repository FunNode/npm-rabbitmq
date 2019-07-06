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

Rabbitmq.prototype.connect = function (config, type, retry_after_time = 5, callback = function () { }) {
  let _this = this;
  this.config = config;

  _this.amqp = require('amqplib/callback_api');
  _this.amqp.connect(`amqp://${_this.user}:${_this.pass}@${_this.host}/${_this.vhost}`, function (err, conn) {
    if (err) { throw new Error(err.message); }
    _this.conn = conn;
    _this.conn.createChannel(function (err, ch) {
      if (err) { throw new Error(err.message); }
      retry_after_time = 5;
      if (type === 'send') {
        _this.ch = ch;
        _this.ch.assertExchange(config.exchange_name, 'topic', { durable: false });
        R5.out.log(`Connected to RabbitMQ (queue: ${config.queue_name})`);
        return callback();
      }
      else if (type === 'receive') {
        ch.assertExchange(config.exchange_name, 'topic', { durable: false });
        ch.assertQueue(config.queue_name, {}, function (err, q) {
          if (err) { throw new Error(err.message); }

          R5.out.log(`[*] Waiting for messages from ${config.message_type}. To exit press CTRL+C`);
          ch.bindQueue(q.queue, config.exchange_name, config.message_type);
          ch.consume(q.queue, function (msg) {
            let obj = parse_json(msg.content.toString());
            if (obj === null) {
              ch.ack(msg);
              return;
            }
            callback(obj);
            ch.ack(msg);
          }, { noAck: false });
        });
      }
      else {
        throw new Error(`Provided type '${type}' is invalid`);
      }
    });
    _this.conn.on('close', function () {
      R5.out.err(`[AMQP] reconnecting on close in ${retry_after_time} seconds`);
      retry_after_time = retry_after_time + 5;
      setTimeout(function () {
        _this.connect(type, retry_after_time);
      }, (retry_after_time - 5) * 1000);
    });
  });
}

Rabbitmq.prototype.queue_message = function (message_object, pause_time = 0, callback = function () {}) {
  let message_string = get_message_from_obj(message_object);
  setTimeout(function (_this) {
    _this.ch.publish(_this.config.exchange_name, _this.config.queue_name, Buffer.from(message_string, 'utf8'));
    R5.out.log(`SEND ${message_object.category}:${message_object.type}`);
    return callback();
  }, pause_time, this);
};

// Private Methods

function get_message_from_obj (obj) {
  return JSON.stringify(obj);
}

function parse_json (str) {
  let obj = null;
  let counter = 0;
  let max = 4;
  let initial_string = str;
  let initial_error;

  while (counter < max && !obj) {
    try {
      obj = JSON.parse(str);
    }
    catch (e) {
      if (counter === 0) { initial_error = e; }

      counter++;

      R5.out.log(`${e} Attempt #${counter} out of ${max}`);

      switch (counter) {
        case 1:
          break;
        case 2:
          let re = /"/g;
          str = str.replace(re, '\\"');
          break;
        case 3:
          re = /'/g;
          str = str.replace(re, '"');
          break;
        default:
          let msg = {
            text: `Error using JSON.parse on: <br>
                     <pre>${initial_string}</pre> <br>
                     This message was sent from rabbitmq.js. Error Message: <br>
                     <pre>${initial_error.stack}</pre>`
          };
          R5.out.err(`${msg.text}`);
          counter = max;
      }
    }
  }
  return obj;
}
