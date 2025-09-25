# npm-rabbitmq

[![Maintainability](https://api.codeclimate.com/v1/badges/bb0ede39e5bbf0862934/maintainability)](https://codeclimate.com/github/FunNode/npm-rabbitmq/maintainability)
![npm package](https://github.com/FunNode/npm-rabbitmq/workflows/npm%20package/badge.svg)
[![Test Coverage](https://api.codeclimate.com/v1/badges/bb0ede39e5bbf0862934/test_coverage)](https://codeclimate.com/github/FunNode/npm-rabbitmq/test_coverage)

A RabbitMQ wrapper used by FunNode repositories with support for delayed message delivery.

## Features

- **Standard RabbitMQ operations**: Connect, send, receive, acknowledge messages
- **Delayed message delivery**: Schedule messages to be delivered after a specified delay
- **Automatic reconnection**: Handles connection failures with exponential backoff
- **Exchange management**: Automatic exchange and queue declaration
- **Error handling**: Graceful fallbacks for delayed delivery failures

## Installation

```bash
npm install @funnode/rabbitmq
```

## Usage

### Basic Setup

```javascript
const Rabbitmq = require('@funnode/rabbitmq');

const rabbitmq = new Rabbitmq('localhost', 'guest', 'guest', 'development');
await rabbitmq.connect({
  exchange_name: 'my_exchange',
  queue_name: 'my_queue',
  message_type: 'my_message_type'
});
```

### Sending Messages

```javascript
// Send immediate message
await rabbitmq.send({ type: 'user_action', data: 'hello' });

// Send delayed message (delivered after 5 seconds)
await rabbitmq.sendDelayed({ type: 'reminder', data: 'wake up' }, 5000);

// Send delayed message using options
await rabbitmq.send({ type: 'notification', data: 'ping' }, {
  delayMs: 3000,
  headers: { 'priority': 'high' }
});
```

### Receiving Messages

```javascript
// Bind a consumer
await rabbitmq.bind(async (msg, message) => {
  console.log('Received:', message);
  rabbitmq.ack(msg, message);
});

// Or get a single message
const { msg, message } = await rabbitmq.get();
if (message) {
  console.log('Got message:', message);
  rabbitmq.ack(msg, message);
}
```

### Delayed Message Delivery

The library supports RabbitMQ's `x-delayed-message` plugin for efficient delayed delivery:

```javascript
// Schedule a message for 10 seconds from now
await rabbitmq.sendDelayed(
  { type: 'scheduled_task', task: 'cleanup' },
  10000
);

// Using send with delayMs option
await rabbitmq.send(
  { type: 'reminder', text: 'Check your email' },
  { delayMs: 30000 } // 30 seconds
);
```

**Benefits of delayed delivery:**
- **No resource blocking**: Messages are scheduled at the broker level
- **Reliability**: Messages persist even if services restart
- **Scalability**: Multiple service instances can handle delayed messages
- **Automatic retry**: Failed delayed messages are automatically reprocessed

### Error Handling

```javascript
try {
  await rabbitmq.sendDelayed(message, 5000);
} catch (error) {
  // If delayed delivery fails, the library automatically
  // falls back to immediate delivery
  console.log('Delayed delivery failed, sent immediately');
}
```

## API Reference

### Constructor

```javascript
new Rabbitmq(host, user, pass, vhost = 'development')
```

### Methods

#### `connect(config)`
Connects to RabbitMQ and sets up exchanges/queues.

**Parameters:**
- `config.exchange_name` - Name of the exchange
- `config.queue_name` - Name of the queue
- `config.message_type` - Message type for routing

#### `send(message, options = {})`
Sends a message immediately or with delay.

**Parameters:**
- `message` - The message object to send
- `options.delayMs` - Delay in milliseconds (optional)
- `options.headers` - Custom headers (optional)

#### `sendDelayed(message, delayMs, headers = {})`
Convenience method for sending delayed messages.

**Parameters:**
- `message` - The message object to send
- `delayMs` - Delay in milliseconds
- `headers` - Custom headers (optional)

#### `bind(callback, reconnecting = false)`
Binds a consumer to receive messages.

#### `get()`
Gets a single message from the queue.

#### `ack(msg, message = {})`
Acknowledges a received message.

#### `disconnect()`
Closes the connection and channel.

## Requirements

- RabbitMQ server with `rabbitmq_delayed_message_exchange` plugin enabled
- Node.js 12+
- amqplib ^0.10.7

## Publishing

Use the following steps to update and publish the package (https://www.npmjs.com/package/@funnode/rabbitmq)

1. Update version number in package.json
2. Execute command `npm publish`
