"use strict";

const assert = require("assert");
const {Consumer, Producer} = require("./../../index.js");
const {jsProducerConfig, jsConsumerConfig, topic} = require("../config");

describe("Javascript Client INT", () => {

  let consumer = null;
  let producer = null;
  const consumedMessages = [];
  let firstMessageReceived = false;
  let messagesChecker;

  before(done => {

    producer = new Producer(jsProducerConfig);
    consumer = new Consumer([topic], jsConsumerConfig);

    producer.on("error", error => console.error(error));
    consumer.on("error", error => console.error(error));

    Promise.all([
      producer.connect(),
      consumer.connect(false)
    ]).then(() => {
      consumer.consume();
      consumer.on("message", message => {
        consumedMessages.push(message);
        if(!firstMessageReceived){
          firstMessageReceived = true;
        }
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
    console.log(consumedMessages);
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
