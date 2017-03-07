const expect = require("expect.js");
const uuid = require("uuid");

const {Kafka, Drainer, Publisher} = require("./../../index.js");

/*
const TEST_TOPIC = "sinek-test-topic-" + uuid.v4();
const CONSUMER_NAME = "sinek-consumer-" + uuid.v4();
const PRODUCER_NAME = "sinek-producer-" + uuid.v4();
*/

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

const CON_STR = "localhost:2181";

describe("Sinek INT", function(){

    let consumer = null;
    let producer = null;
    const consumedMessages = [];

    before(function(done){
        done();
    });

    after(function(done){

        if(consumer){
            consumer.close();
        }

        if(producer){
            producer.close();
        }

        setTimeout(done, 1500);
    });

    it("should be able to start a producer", function(done){

        const kp = new Kafka(CON_STR, PRODUCER_TEST_LOGGER);
        kp.becomeProducer([TEST_TOPIC], PRODUCER_NAME);

        kp.on("ready", () => {
            producer = new Publisher(kp);
            done();
        });
    });

    it("halt threshold", function(done){
        setTimeout(done, 500);
    });

    xit("should be able to delete the topic if present", function(done){
        consumer.removeTopics([TEST_TOPIC]).then(rt => {
            console.log(rt);
            done();
        });
    });

    it("should be able to create topic", function(done){
        producer.createTopics([TEST_TOPIC]).then(ct => {
            console.log(ct);
            done();
        });
    });

    function populateQueue(){
        const map = [];
        const me = [1,2,3,4,5,6,7,8,9,10];
        for(let i = 0; i < MESSAGE_COUNT / me.length; i++){
            const batch = me.map(_ => JSON.stringify(DUMMY_MESSAGE));
            map.push(producer.send(TEST_TOPIC, batch));
        }
        return Promise.all(map);
    }

    it("should be able to publish messages", function(done){
        populateQueue().then(_ => {
            expect(producer.getProcessingStats().totalPublished).to.be.equal(MESSAGE_COUNT);
            done();
        });
    });

    it("halt threshold", function(done){
        setTimeout(done, 1900);
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

    xit("should be able to enforce offset", function(done){
        consumer.resetConsumer([TEST_TOPIC]).then(_ => {
            done();
        });
    });

    it("halt threshold", function(done){
        setTimeout(done, 1900);
    });

    it("should have consumed a decent amount of messages", function(done){
        console.log(consumedMessages.length);

        //dependingon your zk and broker configuration this will not work
        //because you have not received any messages yet
        //expect(consumedMessages.length).to.be.equal(MESSAGE_COUNT);
        //expect(consumedMessages[0].msg).to.be.equal(DUMMY_MESSAGE.msg);
        done();
    });

});