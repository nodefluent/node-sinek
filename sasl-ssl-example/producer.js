"use strict";

const {NProducer} = require("./../index.js");
const config = require("./config.js");
const producer = new NProducer(config, ["test"], 1);

producer.on("error", error => config.logger.error(error));
producer.on("event.log", function(event) {
  const loggedEvent = {
    severity: event.severity,
    fac: event.fac
  };

  if (event.severity >= 7) {
    config.logger.debug(loggedEvent, event.message);
  } else if (event.severity === 6 || event.severity === 5) {
    config.logger.info(loggedEvent, event.message);
  } else if (event.severity === 4) {
    config.logger.warn(loggedEvent, event.message);
  } else if (event.severity > 0) {
    config.logger.error(loggedEvent, event.message);
  } else {
    config.logger.error(loggedEvent, event.message);
  }
});

producer.connect().then(() => {
  config.logger.info("connected.");
  setInterval(() => {
    config.logger.info("send");
    producer.send("test", "abc123");
  }, 1000);
}).catch(error => config.logger.error(error));
