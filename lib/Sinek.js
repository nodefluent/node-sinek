"use strict";

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

const Sinek = {
  Kafka,
  Drainer,
  PartitionDrainer,
  Publisher,
  Consumer,
  Producer,
  NConsumer,
  NProducer,
  Health,
  Analytics
};

module.exports = Sinek;
