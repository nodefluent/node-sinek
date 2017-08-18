"use strict";

const {Consumer} = require("sinek");
const consumer = new Consumer("test", require("./config.js"));

consumer.on("error", error => console.error(error));

consumer.connect(false).then(_ => {
    console.log("connected");
    consumer.consume();
}).catch(error => console.error(error));

consumer.on("message", message => console.log(message.offset, message.value));
