"use strict";

const assert = require("assert");
const {NConsumer, NProducer} = require("./../../index.js");
const {producerConfig, consumerConfig, topic} = require("./../nconfig.js");

describe("NSinek INT Buffer (1by1)", () => {

  let consumer = null;
  let producer = null;
  const consumedMessages = [];
  let firstMessageReceived = false;
  let messagesChecker;

  const oneByNModeOptions = {
    batchSize: 2,
    commitEveryNBatch: 1,
    concurrency: 1,
    commitSync: true
  };

  before(done => {

    producer = new NProducer(producerConfig);
    consumer = new NConsumer([topic], consumerConfig);

    producer.on("error", error => console.error(error));
    consumer.on("error", error => console.error(error));

    Promise.all([
      producer.connect(),
      consumer.connect()
    ]).then(() => {
      consumer.consume((message, callback) => {
        consumedMessages.push(message);
        callback();
      }, false, false, oneByNModeOptions).then(() => {
        firstMessageReceived = true;
      });
      setTimeout(done, 1900);
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

  it("should be able to wait", function(done){
    this.timeout(10000);
    messagesChecker = setInterval(()=>{
      if(consumedMessages.length >= 5){
        clearInterval(messagesChecker);
        done();
      }
    }, 500);
  });

  it("should have received first message", done => {
    assert.ok(firstMessageReceived);
    done();
  });

  it("should be able to consume messages", done => {
    //console.log(consumedMessages);
    assert.ok(consumedMessages.length);
    assert.ok(Buffer.isBuffer(consumedMessages[0].value));
    assert.equal(consumedMessages[0].value.toString("utf8"), "a message");
    assert.equal(JSON.parse(consumedMessages[1].value.toString("utf8")).payload.content, "a message 1");
    assert.equal(JSON.parse(consumedMessages[2].value.toString("utf8")).payload.content, "a message 2");
    assert.equal(JSON.parse(consumedMessages[3].value.toString("utf8")).payload.content, "a message 3");
    assert.equal(consumedMessages[4].value.toString("utf8"), "a message buffer");
    done();
  });
});
