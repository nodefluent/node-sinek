"use strict";

const assert = require("assert");
const {NConsumer, NProducer} = require("./../../index.js");
const {producerConfig, consumerConfig, topic} = require("./../nconfig.js");

describe("NSinek INT String (fast)", () => {

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
      consumer.on("message", message => consumedMessages.push(message));
      consumer.consume().then(() => {
        firstMessageReceived = true;
      });
      setTimeout(done, 1000);
    });
  });

  after(done => {
    if(producer && consumer){
      producer.close();
      consumer.close(true); //commit
      setTimeout(done, 500);
    }
  });

  it("should be able to produce messages", () => {

    const promises = [
      producer.send(topic, "a message"),
      producer.bufferFormatPublish(topic, "1", {content: "a message 1"}, 1, null, 0),
      producer.bufferFormatUpdate(topic, "2", {content: "a message 2"}, 1, null, 0),
      producer.bufferFormatUnpublish(topic, "3", {content: "a message 3"}, 1, null, 0),
      producer.send(topic, new Buffer("a message buffer"))
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
    assert.ok(!Buffer.isBuffer(consumedMessages[0].value));
    assert.equal(consumedMessages[0].value, "a message");
    assert.equal(JSON.parse(consumedMessages[1].value).payload.content, "a message 1");
    assert.equal(JSON.parse(consumedMessages[2].value).payload.content, "a message 2");
    assert.equal(JSON.parse(consumedMessages[3].value).payload.content, "a message 3");
    assert.equal(consumedMessages[4].value, "a message buffer");
    done();
  });
});
