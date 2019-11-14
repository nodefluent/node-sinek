"use strict";

const config = {
  /*logger: {
    debug: console.log,
    info: console.log,
    warn: console.log,
    error: console.log
  }, */
  options: {
    pollIntervalMs: 100,
    consumeGraceMs: 22,
    murmurHashVersion: "2",
  },
};

const producerConfig = Object.assign({}, config, {
  noptions: {
    "metadata.broker.list": "localhost:9092",
    "client.id": "n-test-producer",
    "compression.codec": "none",
    "socket.keepalive.enable": true,
    "queue.buffering.max.ms": 100,
    "batch.num.messages": 5,
  },
  tconf: {
    "request.required.acks": 1,
  },
});

const consumerConfig = Object.assign({}, config, {
  noptions: {
    "metadata.broker.list": "localhost:9092",
    "client.id": "n-test-consumer",
    "group.id": "n-test-group",
    "enable.auto.commit": false,
    "socket.keepalive.enable": true,
    "socket.blocking.max.ms": 5,
  },
  tconf: {
    "auto.offset.reset": "earliest",
  },
});

const jsProducerConfig = Object.assign({}, config, {
  noptions: {
    "metadata.broker.list": "localhost:9092",
    "client.id": "n-test-produce-js",
    "compression.codec": "none",
    "socket.keepalive.enable": true,
    "queue.buffering.max.ms": 100,
    "batch.num.messages": 5,
  },
  tconf: {
    "request.required.acks": 1,
  },
});

const jsConsumerConfig = Object.assign({}, config, {
  noptions: {
    "metadata.broker.list": "localhost:9092",
    "client.id": "n-test-consumer-js",
    "group.id": "n-test-group-js",
    "enable.auto.commit": false,
    "socket.keepalive.enable": true,
    "socket.blocking.max.ms": 5,
  },
  tconf: {
    "auto.offset.reset": "earliest",
  },
});

const topic = "n-test-topic";

const batchOptions = {
  batchSize: 1000,
  commitEveryNBatch: 1,
  manualBatching: true,
};

module.exports = {
  topic,
  producerConfig, 
  consumerConfig,
  batchOptions,
  jsProducerConfig,
  jsConsumerConfig,
};
