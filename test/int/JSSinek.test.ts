import assert from "assert";
import { JSConsumer, JSProducer } from '../../src'
import { jsProducerConfig, jsConsumerConfig, topic } from '../config';

describe("Javascript Client INT", () => {

  let consumer: JSConsumer;
  let producer: JSProducer;
  const consumedMessages: any[] = [];
  let firstMessageReceived = false;
  let messagesChecker;

  before(done => {

    try {

      producer = new JSProducer(jsProducerConfig);
      consumer = new JSConsumer(topic, jsConsumerConfig);

      producer.on("error", error => console.error(error));
      consumer.on("error", error => console.error(error));

      Promise.all([
        producer.connect(),
        consumer.connect(false)
      ]).then(() => {
        consumer.consume(async (messages, callback) => {
          messages.forEach((message) => {
            if(!firstMessageReceived){
              firstMessageReceived = true;
            }
            consumedMessages.push(message);
          });
          callback();
        }, true, false, {
          batchSize: 1000,
          commitEveryNBatch: 1,
          manualBatching: true,
        });
        setTimeout(done, 1000);
      });
    } catch (e) {
      console.log(e);
    }

  });

  after(done => {
    if (producer && consumer) {

      try {
        producer.close();
        consumer.close(); //commit
      } catch (error) {
        console.error(error);
      }

      setTimeout(done, 500);
    }
  });

  it("should be able to produce messages", () => {

    const promises = [
      producer.send(topic, "a message"),
      producer.bufferFormatPublish(topic, "1", { content: "a message 1" }, 1, null, null, 0),
      producer.bufferFormatUpdate(topic, "2", { content: "a message 2" }, 1, null, null, 0),
      producer.bufferFormatUnpublish(topic, "3", { content: "a message 3" }, 1, null, null, 0),
      producer.send(topic, new Buffer("a message buffer"))
    ];

    return Promise.all(promises);
  });

  it("should be able to wait", done => {
    messagesChecker = setInterval(() => {
      if (consumedMessages.length >= 5) {
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
