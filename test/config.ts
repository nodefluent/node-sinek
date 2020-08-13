import { JSKafkaProducerConfig, JSKafkaConsumerConfig } from "../src/lib/interfaces";
import { CompressionTypes } from "kafkajs";

export const jsProducerConfig: JSKafkaProducerConfig = {
  noptions: {
    "metadata.broker.list": "localhost:9092",
    "client.id": "n-test-produce-js",
    "compression.codec": CompressionTypes.None,
    "socket.keepalive.enable": true,
    "queue.buffering.max.ms": 100,
    "batch.num.messages": 5,
    "log_level": 0,
  },
  options: {
    murmurHashVersion: "2",
  },
  tconf: {
    "request.required.acks": 1,
    "message.timeout.ms": 1000,
  },
};

export const jsConsumerConfig: JSKafkaConsumerConfig = {
  noptions: {
    "metadata.broker.list": "localhost:9092",
    "client.id": "n-test-consumer-js",
    "group.id": "n-test-group-js",
    "enable.auto.commit": false,
    "socket.keepalive.enable": true,
    "socket.blocking.max.ms": 5,
  },
  options: {},
  tconf: {
    "auto.offset.reset": "earliest",
  },
};

export const topic = "n-test-topic";

export const batchOptions = {
  batchSize: 1000,
  commitEveryNBatch: 1,
  manualBatching: true,
};
