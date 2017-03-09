const expect = require("expect.js");

const {Kafka, Drainer, Publisher, PartitionDrainer} = require("./../../index.js");


const uuid = require("uuid");
const TEST_TOPIC = "sinek-test-topic-" + uuid.v4();
const CONSUMER_NAME = "sinek-consumer-" + uuid.v4();
const PRODUCER_NAME = "sinek-producer-" + uuid.v4();

/*
const TEST_TOPIC = "sinek-test-topic-1";
const CONSUMER_NAME = "sinek-consumer-1";
const PRODUCER_NAME = "sinek-producer-1";
*/

const DUMMY_MESSAGE = {
    a: "funny",
    msg: "payload",
    that: "is super cool"
};

const MESSAGE_COUNT = 150;

const CONSUMER_TEST_LOGGER = {
    debug: msg => console.log("consumer: " + msg),
    //debug: msg => {}, //silence
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
const DRAIN_TIMEOUT = 35000;

describe("Sinek INT", function(){

    let consumer = null;
    let producer = null;
    let consumedMessages = [];
    let lastConsumedSize = 0;
    let drainDone = false;
    let firstDrainFired = false;

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

        kp.on("error", err => console.log("producer error: " + err));
    });

    it("should be able to start the a consumer", function(done){

        const kc = new Kafka(CON_STR, CONSUMER_TEST_LOGGER);
        kc.becomeConsumer([TEST_TOPIC], CONSUMER_NAME);

        kc.on("ready", () => {
            consumer = new Drainer(kc, 1);
            done();
        });

        kc.on("error", err => console.log("consumer error: " + err));
    });

    it("halt threshold", function(done){
        setTimeout(done, 500);
    });

    it("should be able to delete the topic if present", function(done){
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
            expect(producer.getStats().totalPublished).to.be.equal(MESSAGE_COUNT);
            done();
        });
    });

    it("halt threshold", function(done){
        setTimeout(done, 200);
    });

    it("should be able to drain messages from consumer", function(done){
        consumer.drain((message, _done) => {
            consumedMessages.push(message);
            _done();
        });
        done();
    });

    it("should be able to enforce offset", function(done){
        consumer.resetConsumer([TEST_TOPIC]).then(_ => {
            done();
        });
    });

    it("halt threshold", function(done){
        setTimeout(done, 200);
    });

    it("should have consumed a decent amount of messages", function(done){
        console.log(consumedMessages.length);

        //depending your zk and broker configuration this will not work
        //because you have not received any messages yet
        expect(consumedMessages.length >= MESSAGE_COUNT).to.be.equal(true);
        lastConsumedSize = consumedMessages.length;
        expect(consumedMessages[0].value.msg).to.be.equal(DUMMY_MESSAGE.msg);
        done();
    });

    it("should be able to drainOnce for all messages", function(done){
        consumer.stopDrain();
        consumer.DRAIN_INTV = 200; //speed up for testing
        consumer.drainOnce((message, _done) => {
            consumedMessages.push(message);
            _done();
        }, 760, DRAIN_TIMEOUT).then(r => {
            console.log(r);
            drainDone = true;
        });

        //listen once for first drain message
        let fdm = null;
        fdm = function(){
            consumer.removeListener("first-drain-message", fdm);
            firstDrainFired = true;
        };
        consumer.on("first-drain-message", fdm);
        done();
    });

    it("should be able to enforce offset", function(done){
        consumer.resetConsumer([TEST_TOPIC]).then(_ => {
            done();
        });
    });

    it("should be able to get stats", function(done){
        setTimeout(() => {
            console.log(consumer.getStats());
            console.log(producer.getStats());
            done();
        }, 250);
    });

    it("await drain done", function(done){
        this.timeout(DRAIN_TIMEOUT);
        let intv = null;
        intv = setInterval(() => {
            if(drainDone){
                clearInterval(intv);
                done();
            }
        }, 100);
    });

    it("should have drained messages until stall", function(done){
        console.log(consumedMessages.length - lastConsumedSize);
        expect(consumedMessages.length).not.to.be.equal(lastConsumedSize);
        expect(drainDone).to.be.equal(true);
        expect(firstDrainFired).to.be.equal(true);
        console.log(consumedMessages[0], consumedMessages[100], consumedMessages[200], consumedMessages[250]);
        done();
    });

    it("should be able to close consumer", function(done){
       setTimeout(() => {
            consumer.close();
            consumer = null;
           done();
       }, 300);
    });

    it("should be able to setup partition drainer", function(done){

        //reset
        consumedMessages = [];
        firstDrainFired = false;
        drainDone = false;

        const kc = new Kafka(CON_STR, CONSUMER_TEST_LOGGER);
        kc.becomeConsumer([TEST_TOPIC], CONSUMER_NAME);

        kc.on("ready", () => {
            consumer = new PartitionDrainer(kc, 1);
            done();
        });

        kc.on("error", err => console.log("consumer error: " + err));
    });

    it("should be able to enforce offset", function(done){
        consumer.resetConsumer([TEST_TOPIC]).then(_ => {
            done();
        });
    });

    it("should be able to drainOnce again for all messages", function(done){

        consumer.DRAIN_INTV = 400; //speed up for testing
        consumer.drainOnce(TEST_TOPIC, (message, _done) => {
            consumedMessages.push(message);
            _done();
        }, 700, DRAIN_TIMEOUT).then(r => {
            console.log(r);
            drainDone = true;
        });

        //listen once for first drain message
        let fdm = null;
        fdm = function(){
            consumer.removeListener("first-drain-message", fdm);
            firstDrainFired = true;
        };
        consumer.on("first-drain-message", fdm);
        done();
    });

    it("await drain 2 done", function(done){
        this.timeout(DRAIN_TIMEOUT);
        let intv = null;
        intv = setInterval(() => {
            console.log(consumer.getStats());
            if(drainDone){
                clearInterval(intv);
                done();
            }
        }, 500);
    });

    it("should have drained messages until stall 2", function(done){
        console.log(consumedMessages.length);
        expect(consumedMessages.length).not.to.be.equal(0);
        expect(drainDone).to.be.equal(true);
        expect(firstDrainFired).to.be.equal(true);
        console.log(consumedMessages[0], consumedMessages[100], consumedMessages[200], consumedMessages[250]);
        done();
    });
});