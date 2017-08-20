const debug = require("debug");
const config = {
  kafkaHost: "localhost:9093",
  logger: {
    debug: debug("sinek:debug"),
    info: debug("sinek:info"),
    warn: debug("sinek:warn"),
    error: debug("sinek:error")
  },
  groupId: "example-group",
  clientName: "example-name",
  workerPerPartition: 1,
  options: {
      ssl: false,
      sessionTimeout: 8000,
      protocol: ["roundrobin"],
      fromOffset: "latest",
      fetchMaxBytes: 1024 * 1024,
      fetchMinBytes: 1,
      fetchMaxWaitMs: 10,
      heartbeatInterval: 250,
      retryMinTimeout: 250,
      autoCommit: true,
      autoCommitIntervalMs: 1000,
      requireAcks: 1,
      ackTimeoutMs: 100,
      partitionerType: 3
  }
};

module.exports = config;
