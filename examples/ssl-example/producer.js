"use strict";

const {Producer} = require("./../index.js");
const producer = new Producer(require("./config.js"), ["test"], 1);

producer.on("error", error => console.error(error));

producer.connect().then(() => {
  console.log("connected.");
  setInterval(() => {
    console.log("send");
    producer.send("test", "abc123");
  }, 1000);
}).catch(error => console.error(error));
