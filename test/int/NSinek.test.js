"use strict";

const assert = require("assert");
const {NConsumer, NProducer} = require("./../../index.js");

const config = {
  logger: {
    debug: console.log,
    info: console.log,
    warn: console.log,
    error: console.log
  },
  options: {
    pollIntervalMs: 100
  }
};

const producerConfig = Object.assign({}, config, {
  noptions: {
    "client.id": "n-test-producer",
    "metadata.broker.list": "localhost:9092",
    //"debug": "all",
    "dr_cb": true,
    "event_cb": true,
    "compression.codec": "snappy",
    "retry.backoff.ms": 200,
    "message.send.max.retries": 10,
    "socket.keepalive.enable": true,
    "queue.buffering.max.messages": 100000,
    "queue.buffering.max.ms": 1000,
    "batch.num.messages": 1000000
  }
});

const consumerConfig = Object.assign({}, config, {
  noptions: {
    "metadata.broker.list": "localhost:9092",
    "group.id": "n-test-group",
    "enable.auto.commit": false,
    //"debug": "all",
    "event_cb": true
  }
});

const topic = "n-test-topic";

describe("NSinek INT", () => {

  let consumer = null;
  let producer = null;
  const consumedMessages = [];
  let firstMessageReceived = false;

  before(done => {

    producer = new NProducer(producerConfig);
    consumer = new NConsumer([topic], consumerConfig);

    producer.on("error", error => console.error(error));
    consumer.on("error", error => console.error(error));

    Promise.all([
      producer.connect(),
      consumer.connect()
    ]).then(() => {
      consumer.on("message", m => consumedMessages.push(m));
      consumer.consume().then(() => {
        firstMessageReceived = true;
      });
      setTimeout(done, 1000);
    });
  });

  after(done => {
    if(producer && consumer){
      producer.close();
      consumer.close();
      setTimeout(done, 500);
    }
  });

  it("should be able to produce messages", () => {

    const promises = [
      producer.send(topic, "a message").then(console.log),
      producer.bufferFormatPublish(topic, "1", {content: "a message 1"}, 1, null, 0).then(console.log),
      producer.bufferFormatUpdate(topic, "2", {content: "a message 2"}, 1, null, 0).then(console.log),
      producer.bufferFormatUnpublish(topic, "3", {content: "a message 3"}, 1, null, 0).then(console.log)
    ];

    return Promise.all(promises);
  });

  it("should be able to wait", done => {
    setTimeout(done, 1500);
  });

  it("should have received first message", done => {
    assert.ok(firstMessageReceived);
    done();
  });

  it("should be able to consume messages", done => {
    //console.log(consumedMessages);
    assert.ok(consumedMessages.length);
    assert.equal(consumedMessages[0].value.toString("utf8"), "a message");
    assert.equal(JSON.parse(consumedMessages[1].value.toString("utf8")).payload.content, "a message 1");
    assert.equal(JSON.parse(consumedMessages[2].value.toString("utf8")).payload.content, "a message 2");
    assert.equal(JSON.parse(consumedMessages[3].value.toString("utf8")).payload.content, "a message 3");
    done();
  });
});
