"use strict";

const {NProducer} = require("./../index.js");
const { producerConfig: config } = require("./config.js");
const producer = new NProducer(config, ["test"], 1);

producer.on("error", error => config.logger.error(error));

producer.connect().then(() => {
  config.logger.info("connected.");
  setInterval(() => {
    config.logger.info("send");
    producer.send("test", "abc123");
  }, 1000);
}).catch(error => config.logger.error(error));
