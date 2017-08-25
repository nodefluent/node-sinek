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
  options: {},
  noptions: {
    "metadata.broker.list": "localhost:9092",
    "group.id": "n-test-group",
    "enable.auto.commit": true
  }
};

describe("NSinek INT", () => {

  let consumer = null;
  let producer = null;
  const consumedMessages = [];

  before(done => {

    producer = new NProducer(config, ["n-test-topic"]);
    consumer = new NConsumer(["n-test-topic"], config);
    
    Promise.all([
      producer.connect(),
      consumer.connect()
    ]).then(() => {
      consumer.on("message", m => consumedMessages.push(m));
      consumer.consume().then(done);
    });
  });

  after(done => {
    if(producer && consumer){
      producer.close();
      consumer.close();
      setTimeout(done, 500);
    }
  });

  it("should be able to produce messages", done => {
    producer.send("n-test-topic", "a message");
    done();
  });

  it("should be able to wait", done => {
    setTimeout(done, 500);
  });

  it("should be able to consume messages", done => {
    console.log(consumedMessages);
    assert.ok(consumedMessages.length);
    done();
  });
});
