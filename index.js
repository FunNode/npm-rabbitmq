/* global R5 */

module.exports = Rabbitmq;

if (!global.R5) {
  global.R5 = {
    out: console
  };
}

const amqp = require('amqplib');

// Constructors

function Rabbitmq (host, user, pass, vhost = 'development') {
  this.host = host;
  this.user = user;
  this.pass = pass;
  this.vhost = vhost;
  this.connect_retries = 0;
  this.error_timeout = 10000;
  this.consumers = [];
}

// Public Methods

Rabbitmq.prototype = {
  connect: async function (config) {
    this.config = config;
    const url = `amqp://${this.user}:${this.pass}@${this.host}/${this.vhost}`;
    try {
      this.conn = await amqp.connect(url);
    }
    catch (err) {
      if (this.connect_retries++ < 10) {
        R5.out.error(`RabbitMQ connecting (retrying [${this.connect_retries}]): ${err.code}`);
        await delay(this.error_timeout * this.connect_retries);
        return this.connect(config);
      }
      R5.out.error(`RabbitMQ connecting: ${err.stack}`);
      throw err;
    }
    this.ch = await this.conn.createChannel();
    await this.ch.assertExchange(config.exchange_name, 'topic', { durable: false });
    R5.out.log(`Connected to RabbitMQ (queue: ${config.queue_name})`);
    for (const consumer of this.consumers) {
      await this.bind(consumer, true);
    }
    this.connect_retries = 0;
    const _this = this;
    this.conn.on('close', async function (err) {
      if (err) {
        R5.out.error(`[AMQP] reconnecting on close`);
        return _this.connect(config);
      }
    });
  },

  disconnect: async function () {
    await this.ch.close();
    await this.conn.close();
  },

  ack: function (msg) {
    this.ch.ack(msg);
  },

  // eslint-disable-next-line no-unused-vars
  bind: async function (callback = async (msg, message) => {}, reconnecting = false) {
    await this.ch.assertQueue(this.config.queue_name, { durable: true });
    await this.ch.prefetch(1);

    R5.out.log(`Waiting for messages from #${this.config.queue_name}..`);
    await this.ch.consume(this.config.queue_name, function (msg) {
      let message = parse_json(msg.content.toString());
      return callback(msg, message);
    }, { noAck: false });
    if (!reconnecting) {
      this.consumers.push(callback);
    }
  },

  get: async function () {
    await this.ch.assertQueue(this.config.queue_name, { durable: true });
    const msg = await this.ch.get(this.config.queue_name, { noAck: false });
    let message;
    if (msg) {
      message = parse_json(msg.content.toString());
    }
    return { msg, message };
  },

  send: async function (message) {
    let message_string = JSON.stringify(message);

    await this.ch.assertQueue(this.config.queue_name, { durable: true });
    await this.ch.sendToQueue(this.config.queue_name, Buffer.from(message_string, 'utf8'), {
      persistent: true
    });

    R5.out.log(`SEND ${message.category}:${message.type}`);
  },
};

// Private Methods

function json_is_valid (json_str) {
  try {
    return (JSON.parse(json_str) && !!json_str);
  }
  catch (e) {
    return false;
  }
}

function parse_json (str) {
  let parsed_result = null;

  if (json_is_valid(str)) {
    parsed_result = JSON.parse(str);
  }
  else {
    R5.out.error(`JSON is invalid: ${str}`);
  }

  return parsed_result;
}

function delay (ms) {
  return new Promise((res) => setTimeout(res, ms));
}
