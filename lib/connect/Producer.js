"use strict";

const EventEmitter = require("events");
const Promise = require("bluebird");
const uuid = require("uuid");

const Kafka = require("./../kafka/Kafka.js");
const Publisher = require("./../kafka/Publisher.js");

class Producer extends EventEmitter {

  constructor(config, topic = [], defaultPartitionCount = 1) {
    super();

    this.targetTopics = Array.isArray(topic) ? topic : [topic];
    this.config = config;

    this.kafkaProducerClient = null;
    this.producer = null;
    this.defaultPartitionCount = defaultPartitionCount;
  }

  connect() {
    return new Promise(resolve => {

      const { zkConStr, kafkaHost, logger, clientName, options } = this.config;

      let conStr = null;

      if(typeof kafkaHost === "string"){
        conStr = kafkaHost;
      }

      if(typeof zkConStr === "string"){
        conStr = zkConStr;
      }

      if(conStr === null){
        throw new Error("One of the following: zkConStr or kafkaHost must be defined.");
      }

      this.kafkaProducerClient = new Kafka(conStr, logger, conStr === kafkaHost);

      this.kafkaProducerClient.on("ready", () => resolve());
      this.kafkaProducerClient.on("error", error => super.emit("error", error));

      this.kafkaProducerClient.becomeProducer(this.targetTopics, clientName, options);
      this.producer = new Publisher(this.kafkaProducerClient, this.defaultPartitionCount);
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
      partition = Producer._getRandomIntInclusive(0, this.defaultPartitionCount - 1);
    }

    return this.producer.send(topic,
      Array.isArray(message) ? message : [message],
      null,
      partition,
      0
    );
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

    return this.producer.appendBuffer(topic, identifier, payload, compressionType);
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

    return this.producer.bufferPublishMessage(topic, identifier, payload, version, compressionType, partitionKey);
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

    return this.producer.bufferPublishMessage(topic, identifier, payload, version, compressionType, partitionKey);
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

    return this.producer.bufferUpdateMessage(topic, identifier, payload, version, compressionType, partitionKey);
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

    return this.producer.bufferUnpublishMessage(topic, identifier, payload, version, compressionType, partitionKey);
  }

  pause() {

    if (this.producer) {
      this.producer.pause();
    }
  }

  resume() {

    if (this.producer) {
      this.producer.resume();
    }
  }

  getStats() {
    return this.producer ? this.producer.getStats() : {};
  }

  refreshMetadata(topics = []) {
    return this.producer.refreshMetadata(topics);
  }

  close() {

    if (this.producer) {
      this.producer.close();
      this.producer = null;
    }
  }

  static _getRandomIntInclusive(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

module.exports = Producer;
