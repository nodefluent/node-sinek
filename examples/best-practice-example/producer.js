"use strict";

const { JSProducer } = require("sinek");
// const { NProducer } = require("sinek");
// simply replace to use the native lib-rdkafka producer

const producerConfiguration = {
    noptions: {
        "metadata.broker.list": "localhost:9092",
        "client.id": "example-client",
        "compression.codec": "none",
        "socket.keepalive.enable": true,
        "api.version.request": true,
        "queue.buffering.max.ms": 1000,
        "batch.num.messages": 500,
      },
      tconf: {
        "request.required.acks": 1
      },
};

// amount of partitions of the topics this consumer produces to
const partitionCount = 1; // all messages to partition 0

(async () => {
    const producer = new JSProducer(producerConfiguration, null, partitionCount);
    producer.on("error", error => console.error(error));
    await producer.connect();
    const { offset } = await producer.send("my-topic", "my-message", 0, "my-key", "my-partition-key");

})().catch(console.error);
