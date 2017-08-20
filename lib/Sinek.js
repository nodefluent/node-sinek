const Kafka = require("./kafka/Kafka.js");
const Drainer = require("./kafka/Drainer.js");
const Publisher = require("./kafka/Publisher.js");
const PartitionDrainer = require("./kafka/PartitionDrainer.js");

const Consumer = require("./connect/Consumer.js");
const Producer = require("./connect/Producer.js");

const Sinek = {
  Kafka,
  Drainer,
  PartitionDrainer,
  Publisher,
  Consumer,
  Producer
};

module.exports = Sinek;