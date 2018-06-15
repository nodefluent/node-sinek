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
    murmurHashVersion: "2"
  }
};

const producerConfig = Object.assign({}, config, {
  noptions: {
    "client.id": "n-test-producer",
    "metadata.broker.list": "localhost:9092",
    //"debug": "all",
    "dr_cb": true,
    "event_cb": true,
    "compression.codec": "snappy",
    "retry.backoff.ms": 200,
    "message.send.max.retries": 10,
    "socket.keepalive.enable": true,
    "queue.buffering.max.messages": 100000,
    "queue.buffering.max.ms": 1000,
    "batch.num.messages": 1000000
  }
});

const consumerConfig = Object.assign({}, config, {
  noptions: {
    "metadata.broker.list": "localhost:9092",
    "group.id": "n-test-group",
    "enable.auto.commit": false,
    //"debug": "all",
    "event_cb": true
  }
});

const jsProducerConfig = {
  kafkaHost: "localhost:9092",
  clientName: "n-test-producer-js",
  options: {}
};

const jsConsumerConfig = {
  kafkaHost: "localhost:9092",
  groupId: "n-test-group-js",
  options: {
    autoCommit: true
  }
};

const topic = "n-test-topic";

module.exports = {
  producerConfig, 
  consumerConfig, 
  jsProducerConfig, 
  jsConsumerConfig, 
  topic
};
