"use strict";

const { JSConsumer } = require("sinek");

// const { NConsumer } = require("sinek");
// simply replace to use the native lib-rdkafka consumer

const kafkaTopics = ["one", "two", "three"];

const consumerConfiguration = {
    noptions: {
        "metadata.broker.list": "localhost:9092",
        "group.id": "example-group",
        "enable.auto.commit": false,
        "socket.keepalive.enable": true,
        "api.version.request": true,
        "socket.blocking.max.ms": 100,
    },
    tconf: {
        "auto.offset.reset": "earliest",
    },
};

(async () => {
    const consumer = new JSConsumer(kafkaTopics, consumerConfiguration);
    consumer.on("error", (error) => console.error(error));
    await consumer.connect();
    consumer.consume(async (messages, callback) => {
        // deal with array of messages
        // and when your done call the callback to commit (depending on your batch settings)
        callback();
    }, true, false); // batchOptions are only supported with NConsumer
})().catch(console.error);
