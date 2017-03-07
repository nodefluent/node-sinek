const Kafka = require("./kafka/Kafka.js");
const Drainer = require("./kafka/Drainer.js");
const Publisher = require("./kafka/Publisher.js");

const Sinek = {
    Kafka,
    Drainer,
    Publisher
};

module.exports = Sinek;