const expect = require("expect.js");

const {Kafka, Drainer, Publisher} = require("./../../index.js");

const TEST_TOPIC = "sinek-test-topic-1";
const CONSUMER_NAME = "sinek-consumer-1";
const PRODUCER_NAME = "sinek-producer-1";

const DUMMY_MESSAGE = {
    a: "funny",
    msg: "payload",
    that: "is super cool"
};

const MESSAGE_COUNT = 20;

const CONSUMER_TEST_LOGGER = {
    debug: msg => console.log("consumer: " + msg),
    info: msg => console.log("consumer: " + msg),
    warn: msg => console.log("consumer: " + msg),
    error: msg => console.log("consumer: " + msg)
};

const PRODUCER_TEST_LOGGER = {
    debug: msg => console.log("producer: " + msg),
    info: msg => console.log("producer: " + msg),
    warn: msg => console.log("producer: " + msg),
    error: msg => console.log("producer: " + msg)
};

describe("Sinek UNIT", function() {

    it("should be able to start a producer", function(done){

        const kp = new Kafka(CON_STR, PRODUCER_TEST_LOGGER);
        kp.becomeProducer([TEST_TOPIC], PRODUCER_NAME);

        kp.on("ready", () => {
            producer = new Publisher(kp);
            done();
        });
    });

    it("should be able to start the a consumer", function(done){

        const kc = new Kafka(CON_STR, CONSUMER_TEST_LOGGER);
        kc.becomeConsumer([TEST_TOPIC], CONSUMER_NAME);

        kc.on("ready", () => {
            consumer = new Drainer(kc, 1);
            consumer.drain((message, cb) => {
                consumedMessages.push(message);
                cb(null, true);
            });
            done();
        });
    });

});