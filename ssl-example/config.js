const debug = require("debug");
const fs = require("fs");

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
    ssl: true,
    sslOptions: {
      // https://nodejs.org/dist/latest-v8.x/docs/api/tls.html#tls_tls_createsecurecontext_options
      rejectUnauthorized: true,
      key: fs.readFileSync("../certs/ca-key"),
      cert: fs.readFileSync("../certs/ca-cert"),
      ca:[fs.readFileSync("../certs/ca-cert")],
      passphrase: "nodesinek"
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
