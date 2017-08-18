const config = {
  kafkaHost: "localhost:9092",
  logger: {
      debug: msg => console.log(msg),
      info: msg => console.log(msg),
      warn: msg => console.log(msg),
      error: msg => console.log(msg)
  },
  groupId: "example-group",
  clientName: "example-name",
  workerPerPartition: 1,
  options: {
      ssl: true,
      sslOptions: {
          rejectUnauthorized: false
      },
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
