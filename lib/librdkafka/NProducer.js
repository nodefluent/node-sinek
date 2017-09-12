"use strict";

const EventEmitter = require("events");
const Promise = require("bluebird");
const uuid = require("uuid");
const murmur = require("murmurhash").v3;
const debug = require("debug");

//@OPTIONAL
let BlizzKafka = null;

const MESSAGE_TYPES = {
  PUBLISH: "-published",
  UNPUBLISH: "-unpublished",
  UPDATE: "-updated"
};

const DEFAULT_LOGGER = {
  debug: debug("sinek:nproducer:debug"),
  info: debug("sinek:nproducer:info"),
  warn: debug("sinek:nproducer:warn"),
  error: debug("sinek:nproducer:error")
};

/*
  BREAKING CHANGES (compared to connect/Producer):
  - send does not support arrays of messages
  - compressionType does not work anymore
  - no topics are passed in the constructor
  - send can now exactly write to a partition or with a specific key
  - there is an optional options object for the config named: noptions
  - there is an optional topic options object for the config named: tconf
  - sending now rejects if paused
  - you can now define a strict partition for send bufferFormat types
  - _lastProcessed is now null if no message has been send
  - closing will reset stats
  - tconf config field sets topic configuration
*/

class NProducer extends EventEmitter {

  constructor(config, _, defaultPartitionCount = 1) {
    super();

    try {
      if(!BlizzKafka){
        BlizzKafka = require("node-rdkafka");
      }
    } catch(error){
      throw new Error("You have to install node-rdkafka to use NProducer.");
    }

    if(!config){
      throw new Error("You are missing a config object.");
    }

    if(!config.logger || typeof config.logger !== "object"){
      config.logger = DEFAULT_LOGGER;
    }

    if(!config.options){
      config.options = {};
    }

    this.config = config;

    this.paused = false;
    this.producer = null;
    this._producerPollIntv = null;
    this.defaultPartitionCount = defaultPartitionCount;
    this._inClosing = false;

    this._totalSentMessages = 0;
    this._lastProcessed = null;
  }

  connect() {
    return new Promise((resolve, reject) => {

      let { zkConStr, kafkaHost, logger, options, noptions, tconf } = this.config;
      const { pollIntervalMs } = options;

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
        "dr_cb": true
      }; //TODO transfer rest of config fields

      noptions = noptions || {};
      noptions = Object.assign({}, config, noptions);
      logger.debug(noptions);

      tconf = tconf ? tconf : {
        "request.required.acks": 1
      };
      logger.debug(tconf);

      this.producer = new BlizzKafka.Producer(noptions, tconf);

      this.producer.on("event.log", log => {
        logger.debug(log.message);
      });

      this.producer.on("event.error", error => {
        super.emit("error", error);
      });

      this.producer.on("error", error => {
        super.emit("error", error);
      });

      this.producer.on("delivery-report", (error, report) => {
        logger.info("DeliveryReport: " + JSON.stringify(report));
      });

      this.producer.on("disconnected", () => {
        if(this._inClosing){
          this._reset();
        }
        logger.warn("Disconnected.");
        //auto-reconnect??? -> handled by producer.poll()
      });

      this.producer.on("ready", () => {

        logger.info(`Native producer ready v. ${BlizzKafka.librdkafkaVersion}, e. ${BlizzKafka.features.join(", ")}.`);

        //poll broker for updates
        this._producerPollIntv = setInterval(() => {
          if(this.producer){
            this.producer.poll();
          }
        }, pollIntervalMs || 100);

        super.emit("ready");
      });

      logger.debug("Connecting..");
      this.producer.connect(null, (error, metadata) => {

        if(error){
          super.emit("error", error);
          return reject(error);
        }

        logger.debug(metadata);
        resolve();
      });
    });
  }

  _getPartitionForKey(key, partitionCount = 0){

    /*
    if(typeof key !== "string"){
      return Promise.reject("Key must be a valid string");
    } */

    if(partitionCount === 0){
      partitionCount = this.defaultPartitionCount;
    }

    return murmur(key) % partitionCount;
  }

  send(topicName, message, _partition = null, _key = null) {

    if (!this.producer) {
      return Promise.reject("producer is not yet setup.");
    }

    if(this.paused){
      return Promise.reject("producer is paused.");
    }

    if(!message || !(typeof message === "string" || Buffer.isBuffer(message))){
      return Promise.reject("message must be a string or an instance of Buffer.");
    }

    let partition = -1;
    if (this.defaultPartitionCount < 2) {
      partition = 0;
    } else {
      partition = NProducer._getRandomIntInclusive(0, this.defaultPartitionCount);
    }

    partition = _partition ? _partition : partition;
    const key = _key ? _key : uuid.v4();
    message = Buffer.isBuffer(message) ? message : new Buffer(message);

    this.config.logger.debug(JSON.stringify({topicName, partition, key}));
    const producedAt = Date.now();

    try {
      this.producer.produce(topicName, partition, message, key, producedAt);
      this._lastProcessed = producedAt;
      this._totalSentMessages++;
      return Promise.resolve({
        key,
        partition
      });
    } catch(error){
      return Promise.reject(error);
    }
  }

  buffer(topic, identifier, payload, partition = null, version = null) {

    if (typeof identifier === "undefined") {
      identifier = uuid.v4();
    }

    if (typeof identifier !== "string") {
      identifier = identifier + "";
    }

    if(typeof payload !== "object"){
      return Promise.reject("expecting payload to be of type object.");
    }

    if(typeof payload.id === "undefined"){
      payload.id = identifier;
    }

    if(version && typeof payload.version === "undefined"){
      payload.version = version;
    }

    partition = partition ? partition : this._getPartitionForKey(identifier);

    return this.send(topic, JSON.stringify(payload), partition, identifier);
  }

  _sendBufferFormat(topic, identifier, _payload, version = 1, _, partitionKey = null, partition = null, messageType = "") {

    if (typeof identifier === "undefined") {
      identifier = uuid.v4();
    }

    if (typeof identifier !== "string") {
      identifier = identifier + "";
    }

    if(typeof _payload !== "object"){
      return Promise.reject("expecting payload to be of type object.");
    }

    if(typeof _payload.id === "undefined"){
      _payload.id = identifier;
    }

    if(version && typeof _payload.version === "undefined"){
      _payload.version = version;
    }

    const payload = {
      payload: _payload,
      key: identifier,
      id: uuid.v4(),
      time: (new Date()).toISOString(),
      type: topic + messageType
    };

    partition = partition ? partition : this._getPartitionForKey(partitionKey ? partitionKey : identifier);
    return this.send(topic, JSON.stringify(payload), partition, identifier);
  }

  /**
   * alias
   */
  bufferFormat(topic, identifier, payload, version = 1, compressionType = 0, partitionKey = null) {
    this.bufferFormatPublish(topic, identifier, payload, version, compressionType, partitionKey);
  }

  bufferFormatPublish(topic, identifier, _payload, version = 1, _, partitionKey = null, partition = null){
    return this._sendBufferFormat(topic, identifier, _payload, version, _, partitionKey, partition, MESSAGE_TYPES.PUBLISH);
  }

  bufferFormatUpdate(topic, identifier, _payload, version = 1, _, partitionKey = null, partition = null){
    return this._sendBufferFormat(topic, identifier, _payload, version, _, partitionKey, partition, MESSAGE_TYPES.UPDATE);
  }

  bufferFormatUnpublish(topic, identifier, _payload, version = 1, _, partitionKey = null, partition = null){
    return this._sendBufferFormat(topic, identifier, _payload, version, _, partitionKey, partition, MESSAGE_TYPES.UNPUBLISH);
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  getStats() {
    return {
      totalPublished: this._totalSentMessages,
      last: this._lastProcessed,
      isPaused: this.paused
    };
  }

  refreshMetadata() {
    throw new Error("refreshMetadata is not available for NProducer.");
  }

  _reset(){
    this._lastProcessed = null;
    this._totalSentMessages = 0;
    this.paused = false;
    this._inClosing = false;
  }

  close() {

    if (this.producer) {
      this._inClosing = true;
      clearInterval(this._producerPollIntv);
      this.producer.disconnect();
      //this.producer = null;
    }
  }

  static _getRandomIntInclusive(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

module.exports = NProducer;
