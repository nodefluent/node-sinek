"use strict";

const util = require("util");

const Kafka = require("./kafka/Kafka.js");
const Drainer = require("./kafka/Drainer.js");
const Publisher = require("./kafka/Publisher.js");
const PartitionDrainer = require("./kafka/PartitionDrainer.js");

const Consumer = require("./connect/Consumer.js");
const Producer = require("./connect/Producer.js");

const NConsumer = require("./librdkafka/NConsumer.js");
const NProducer = require("./librdkafka/NProducer.js");

const Health = require("./librdkafka/Health.js");
const Analytics = require("./librdkafka/Analytics.js");

module.exports = {
  Kafka: util.deprecate(Kafka, "Kafka is deprecated, please use 'NConsumer' if possible."),
  Drainer: util.deprecate(Drainer, "Drainer is deprecated, please use 'NConsumer' if possible."),
  PartitionDrainer: util.deprecate(PartitionDrainer, "PartitionDrainer is deprecated, please use 'NConsumer' if possible."),
  Publisher: util.deprecate(Publisher, "Publisher is deprecated, please use 'NProducer' if possible."),
  Consumer,
  Producer,
  NConsumer,
  NProducer,
  Health,
  Analytics
};