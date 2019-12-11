/* eslint-env mocha */
const chai = require('chai');
const { expect } = chai;
const sinon = require('sinon');
const proxyquire = require('proxyquire');

chai.use(require('sinon-chai'));
chai.use(require('chai-as-promised'));

describe('Rabbitmq', function () {
  const host = 'host';
  const user = 'user';
  const pass = 'pass';
  const vhost = 'vhost';
  const config = {
    exchange_name: 'exchange_name',
    queue_name: 'queue_name',
    message_type: 'message_type',
  };

  let sandbox;
  let message;
  let msg;
  let consumer;
  let closeChannel;
  let assertExchange;
  let assertQueue;
  let prefetch;
  let consume;
  let get;
  let ack;
  let sendToQueue;
  let closeConnection;
  let createChannel;
  let on;
  let connect;
  let amqplib;
  let Rabbitmq;
  let rabbitmq;
  
  async function inject () {
    amqplib = { connect };
    Rabbitmq = proxyquire('../index', {
      'amqplib': amqplib,
    });
    rabbitmq = new Rabbitmq(host, user, pass, vhost);
  }
  
  beforeEach(async function () {
    sandbox = sinon.createSandbox();
    message = { message: 'message' };
    msg = { content: Buffer.from(JSON.stringify(message)) };
    consumer = sandbox.stub().resolves();
    closeChannel = sandbox.stub().resolves();
    assertExchange = sandbox.stub().resolves();
    assertQueue = sandbox.stub().resolves();
    prefetch = sandbox.stub().resolves();
    consume = sandbox.stub().resolves();
    get = sandbox.stub().resolves(msg);
    ack = sandbox.stub();
    sendToQueue = sandbox.stub().resolves();
    closeConnection = sandbox.stub().resolves();
    on = sandbox.stub();
    createChannel = sandbox.stub().resolves({
      close: closeChannel,
      assertExchange,
      assertQueue,
      prefetch,
      consume,
      get,
      ack,
      sendToQueue,
      closeConnection,
    });
    connect = sandbox.stub().resolves({
      close: closeConnection,
      createChannel,
      on,
    });
    await inject();
  });

  afterEach(function () {
    sandbox.restore();
  });

  it('constructs', function () {
    Object.entries({
      host,
      user,
      pass,
      vhost,
    }).forEach(([k, v]) => expect(rabbitmq[k]).to.eql(v));
  });

  it('constructs with default vhost', function () {
    rabbitmq = new Rabbitmq(host, user, pass);
    expect(rabbitmq.vhost).to.eql('development');
  });

  it('connects', async function () {
    await rabbitmq.connect(config);
    expect(connect).to.have.been.calledOnce;
    expect(connect.args[0][0]).to.eql(`amqp://${user}:${pass}@${host}/${vhost}`);
  });

  it('retries connecting', async function () {
    connect = sandbox.stub();
    (new Array(10)).fill(0).forEach((_, i) => connect.onCall(i).rejects({ error: 'error' }));
    connect.onCall(10).resolves({
      close: closeConnection,
      createChannel,
      on,
    });
    await inject();
    rabbitmq.error_timeout = 0;
    await rabbitmq.connect(config);
    expect(connect.callCount).to.eql(11);
  });

  it('retries connecting and gives up', async function () {
    connect = sandbox.stub().rejects({ error: 'error' });
    await inject();
    rabbitmq.error_timeout = 0;
    await rabbitmq.connect(config)
      .then(() => expect.fail())
      .catch((err) => expect(err).to.eql({ error: 'error' }));
    expect(connect.callCount).to.eql(11);
  });

  it('reconnects on connection lost', async function () {
    await rabbitmq.connect(config);
    const errorCallback = on.args[0][1];
    await errorCallback({});
    expect(connect).to.have.been.calledTwice;
  });

  it('reconnects on connection lost with bound consumer', async function () {
    await rabbitmq.connect(config);
    await rabbitmq.bind(consumer);
    const errorCallback = on.args[0][1];
    await errorCallback({});
    expect(connect).to.have.been.calledTwice;
    expect(consume).to.have.been.calledTwice;
  });

  it('does not reconnect on proper close', async function () {
    await rabbitmq.connect(config);
    const errorCallback = on.args[0][1];
    await errorCallback();
    expect(connect).to.have.been.calledOnce;
  });

  it('disconnects', async function () {
    await rabbitmq.connect(config);
    await rabbitmq.disconnect();
    expect(closeChannel).to.have.been.calledOnce;
    expect(closeConnection).to.have.been.calledOnce;
  });

  it('acknowledges', async function () {
    await rabbitmq.connect(config);
    const msg = 'msg';
    rabbitmq.ack(msg);
    expect(ack).to.have.been.calledWith(msg);
  });

  it('binds', async function () {
    await rabbitmq.connect(config);
    await rabbitmq.bind(consumer);
    expect(consume).to.have.been.calledOnce;
  });

  it('binds with empty consumer', async function () {
    await rabbitmq.connect(config);
    await rabbitmq.bind();
    const callback = consume.args[0][1];
    await callback(msg);
    expect(consume).to.have.been.calledOnce;
  });

  it('binds when reconnecting', async function () {
    await rabbitmq.connect(config);
    await rabbitmq.bind(consumer);
    const errorCallback = on.args[0][1];
    await errorCallback({});
    expect(consume).to.have.been.calledTwice;
    expect(rabbitmq.consumers.length).to.eql(1);
  });

  it('parses msg before calling consumer', async function () {
    await rabbitmq.connect(config);
    await rabbitmq.bind(consumer);
    const callback = consume.args[0][1];
    await callback(msg);
    expect(consumer).to.have.been.calledWith(msg, message);
  });
  
  it('gets', async function () {
    await rabbitmq.connect(config);
    return expect(rabbitmq.get()).to.become({ msg, message });
  });

  it('gets when there is no new message', async function () {
    get = sandbox.stub().resolves(false);
    createChannel = sandbox.stub().resolves({
      close: closeChannel,
      assertExchange,
      assertQueue,
      prefetch,
      consume,
      get,
      ack,
      sendToQueue,
      closeConnection
    });
    connect = sandbox.stub().resolves({
      close: closeConnection,
      createChannel,
      on,
    });
    await inject();
    await rabbitmq.connect(config);
    return expect(rabbitmq.get()).to.become({ msg: false, message: undefined });
  });

  it('gets invalid message', async function () {
    const invalidMsg = { content: Buffer.from(JSON.stringify(message).slice(1)) };
    get = sandbox.stub().resolves(invalidMsg);
    createChannel = sandbox.stub().resolves({
      close: closeChannel,
      assertExchange,
      assertQueue,
      prefetch,
      consume,
      get,
      ack,
      sendToQueue,
      closeConnection
    });
    connect = sandbox.stub().resolves({
      close: closeConnection,
      createChannel,
      on,
    });
    await inject();
    await rabbitmq.connect(config);
    return expect(rabbitmq.get()).to.become({ msg: invalidMsg, message: null });
  });
  
  it('sends', async function () {
    await rabbitmq.connect(config);
    await rabbitmq.send(message);
    expect(sendToQueue).to.have.been.calledOnce;
  });
});
