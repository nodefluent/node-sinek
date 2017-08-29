"use strict";

const {NConsumer} = require("./../index.js");
const consumer = new NConsumer("test", require("./config.js"));

consumer.on("error", error => console.error(error));

consumer.connect(false).then(() => {
  console.log("connected");
  consumer.consume();
}).catch(error => console.error(error));

consumer.on("message", message => console.log(message.offset, message.value));
