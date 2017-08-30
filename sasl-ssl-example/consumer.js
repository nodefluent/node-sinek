"use strict";

const {NConsumer} = require("./../index.js");
const { consumerConfig: config } = require("./config.js");
const consumer = new NConsumer("test", config);

consumer.on("error", error => config.logger.error(error));

consumer.connect().then(() => {
  config.logger.info("connected");
  consumer.consume();
}).catch(error => config.logger.error(error));

consumer.on("message", message => config.logger.log(message.offset, message.value));
