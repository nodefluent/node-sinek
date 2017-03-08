const Kafka = require("./kafka/Kafka.js");
const Drainer = require("./kafka/Drainer.js");
const Publisher = require("./kafka/Publisher.js");
const PartitionDrainer = require("./kafka/PartitionDrainer.js");

const Sinek = {
    Kafka,
    Drainer,
    PartitionDrainer,
    Publisher
};

module.exports = Sinek;