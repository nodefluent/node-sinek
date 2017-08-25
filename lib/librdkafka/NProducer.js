"use strict";

const EventEmitter = require("events");
const Promise = require("bluebird");
const uuid = require("uuid");

//@OPTIONAL
let BlizzKafka = null;

class NProducer extends EventEmitter {

  constructor(config, topic = [], defaultPartitionCount = 1) {
    super();

    try {
      if(!BlizzKafka){
        BlizzKafka = require("node-rdkafka");
      }
    } catch(error){
      throw new Error("You have to install node-rdkafka to use NProducer.");
    }

    this.targetTopics = Array.isArray(topic) ? topic : [topic];
    this.config = config;

    this.paused = false;
    this.producer = null;
    this._producerPollIntv = null;
    this.defaultPartitionCount = defaultPartitionCount;
  }

  connect() {
    return new Promise((resolve, reject) => {

      let { zkConStr, kafkaHost, logger, noptions } = this.config;

      let conStr = null;

      if(typeof kafkaHost === "string"){
        conStr = kafkaHost;
      }

      if(typeof zkConStr === "string"){
        conStr = zkConStr;
      }

      if(conStr === null && !noptions){
        return reject(new Error("One of the following: zkConStr or kafkaHost must be defined."));
      }

      if(conStr === zkConStr){
        return reject(new Error("NProducer does not support zookeeper connection."));
      }

      const config = {
        "metadata.broker.list": conStr,
        "dr_cb": true //TODO transfer config
      };
      noptions = noptions || {};
      this.producer = new BlizzKafka.Producer(Object.assign({}, config, noptions));

      this.producer.on("event.log", log => {
        logger.debug(log);
      });

      this.producer.on("event.error", error => {
        super.emit("error", error);
      });

      this.producer.on("delivery-report", (error, report) => {
        logger.info("delivery-report: " + JSON.stringify(report));
      });

      this.producer.on("disconnected", arg => {
        logger.warn("disconnected");
        //TODO auto-reconnect???
      });

      this.producer.on("ready", arg => {

        logger.info(`native producer ready v. ${BlizzKafka.librdkafkaVersion}, e. ${BlizzKafka.features.join(", ")}.`);

        //poll broker for updates
        this._producerPollIntv = setInterval(() => {
          if(this.producer){
            this.producer.poll();
          }
        }, 1000);

        //TODO register topics?

        resolve();
      });

      this.producer.connect();
    });
  }

  send(topic, message) {

    if (!this.producer) {
      return Promise.reject("producer is not yet setup.");
    }

    let partition = -1;
    if (this.defaultPartitionCount < 2) {
      partition = 0;
    } else {
      partition = NProducer._getRandomIntInclusive(0, this.defaultPartitionCount);
    }

    /*
    return this.producer.send(topic,
      Array.isArray(message) ? message : [message],
      null,
      partition,
      0
    ); */

    const topicConfig = { //TODO map on connect
      "request.required.acks": 1
    };

    const topicObject = this.producer.Topic(topic, topicConfig); //TODO store on connect
    const key = uuid.v4();
    this.producer.produce(topicObject, partition, new Buffer(message), key);
    return Promise.resolve(key);
  }

  buffer(topic, identifier, payload, compressionType = 0) {

    if (!this.producer) {
      return Promise.reject("producer is not yet setup.");
    }

    if (typeof identifier === "undefined") {
      identifier = uuid.v4();
    }

    if (typeof identifier !== "string") {
      identifier = identifier + "";
    }

    //TODO implement buffer methods
  }

  bufferFormat(topic, identifier, payload, version = 1, compressionType = 0, partitionKey = null) {

    if (!this.producer) {
      return Promise.reject("producer is not yet setup.");
    }

    if (typeof identifier === "undefined") {
      identifier = uuid.v4();
    }

    if (typeof identifier !== "string") {
      identifier = identifier + "";
    }

    //TODO implement buffer methods
  }

  bufferFormatPublish(topic, identifier, payload, version = 1, compressionType = 0, partitionKey = null) {

    if (!this.producer) {
      return Promise.reject("producer is not yet setup.");
    }

    if (typeof identifier === "undefined") {
      identifier = uuid.v4();
    }

    if (typeof identifier !== "string") {
      identifier = identifier + "";
    }

    //TODO implement buffer methods
  }

  bufferFormatUpdate(topic, identifier, payload, version = 1, compressionType = 0, partitionKey = null) {

    if (!this.producer) {
      return Promise.reject("producer is not yet setup.");
    }

    if (typeof identifier === "undefined") {
      identifier = uuid.v4();
    }

    if (typeof identifier !== "string") {
      identifier = identifier + "";
    }

    //TODO implement buffer methods
  }

  bufferFormatUnpublish(topic, identifier, payload, version = 1, compressionType = 0, partitionKey = null) {

    if (!this.producer) {
      return Promise.reject("producer is not yet setup.");
    }

    if (typeof identifier === "undefined") {
      identifier = uuid.v4();
    }

    if (typeof identifier !== "string") {
      identifier = identifier + "";
    }

    //TODO implement buffer methods
  }

  pause() {
    this.paused = true; //TODO use this
  }

  resume() {
    this.paused = false;
  }

  getStats() {
    return {}; //TODO stats for native clients
  }

  refreshMetadata() {
    throw new Error("refreshMetadata is not available for NProducer.");
  }

  close() {

    if (this.producer) {
      clearInterval(this._producerPollIntv);
      this.producer.disconnect();
      this.producer = null;
    }
  }

  static _getRandomIntInclusive(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

module.exports = NProducer;
