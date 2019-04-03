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

export const producerConfig = Object.assign({}, config, {
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

export const consumerConfig = Object.assign({}, config, {
  noptions: {
    "metadata.broker.list": "localhost:9092",
    "group.id": "n-test-group",
    "enable.auto.commit": false,
    "socket.keepalive.enable": true,
    "socket.blocking.max.ms": 5,
  },
  tconf: {
    "auto.offset.reset": "earliest",
  },
});

export const jsProducerConfig = {
  kafkaHost: "localhost:9092",
  clientName: "n-test-producer-js",
  options: {},
};

export const jsConsumerConfig = {
  kafkaHost: "localhost:9092",
  groupId: "n-test-group-js",
  options: {
    autoCommit: true,
  },
};

export const topic = "n-test-topic";

export const batchOptions = {
  batchSize: 1000,
  commitEveryNBatch: 1,
  manualBatching: true,
};
