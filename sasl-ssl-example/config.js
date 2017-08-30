const debug = require("debug");
const path = require("path");

const logger = {
  debug: debug("sinek:debug"),
  info: debug("sinek:info"),
  warn: debug("sinek:warn"),
  error: debug("sinek:error")
};

const consumerConfig = {
  logger,
  noptions: {
    //"debug": "all",
    "metadata.broker.list": "localhost:9193",
    "group.id": "example-group",
    "enable.auto.commit": false,
    "event_cb": true,
    "compression.codec": "none",
    "retry.backoff.ms": 200,
    "message.send.max.retries": 10,
    "socket.keepalive.enable": true,
    "queue.buffering.max.messages": 100000,
    "queue.buffering.max.ms": 1000,
    "batch.num.messages": 1000000,

    "security.protocol": "sasl_ssl",
    "ssl.key.location": path.join(__dirname, "../certs/ca-key"),
    "ssl.key.password": "nodesinek",
    "ssl.certificate.location": path.join(__dirname,"../certs/ca-cert"),
    "ssl.ca.location": path.join(__dirname,"../certs/ca-cert"),
    "sasl.mechanisms": "PLAIN",
    "sasl.username": "admin",
    "sasl.password": "nodesinek",
    "api.version.request": true,
  },
  tconf: {
    "auto.offset.reset": "earliest"
  }
};

const producerConfig = {
  logger,
  noptions: {
    //"debug": "all",
    "metadata.broker.list": "localhost:9193",
    "client.id": "example-client",
    "event_cb": true,
    "compression.codec": "none",
    "retry.backoff.ms": 200,
    "message.send.max.retries": 10,
    "socket.keepalive.enable": true,
    "queue.buffering.max.messages": 100000,
    "queue.buffering.max.ms": 1000,
    "batch.num.messages": 1000000,

    "security.protocol": "sasl_ssl",
    "ssl.key.location": path.join(__dirname, "../certs/ca-key"),
    "ssl.key.password": "nodesinek",
    "ssl.certificate.location": path.join(__dirname,"../certs/ca-cert"),
    "ssl.ca.location": path.join(__dirname,"../certs/ca-cert"),
    "sasl.mechanisms": "PLAIN",
    "sasl.username": "admin",
    "sasl.password": "nodesinek",
    "api.version.request": true,
  },
  tconf: {
    "request.required.acks": 1
  }
};

module.exports = {
  consumerConfig,
  producerConfig
};
