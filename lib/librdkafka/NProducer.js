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

/**
 * native producer wrapper around node-librdkafka
 * @extends EventEmitter
 */
class NProducer extends EventEmitter {

  /**
   * default constructor
   * @param {object} config - configuration object
   * @param {*} _ - ignore this param (api compatability)
   * @param {number} defaultPartitionCount  - amount of default partitions for the topics to produce to
   */
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

  /**
   * connects to the broker
   * @returns {Promise.<*>}
   */
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
        logger.debug("DeliveryReport: " + JSON.stringify(report));
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

  /**
   * returns a partition for a key
   * @private
   * @param {string} - message key
   * @param {number} - partition count of topic, if 0 defaultPartitionCount is used
   * @returns {string} - deterministic partition value for key
   */
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

  /**
   * produces a kafka message to a certain topic
   * @param {string} topicName - name of the topic to produce to
   * @param {object} message - value object for the message
   * @param {number} _partition - optional partition to produce to
   * @param {string} _key - optional message key
   * @returns {Promise.<object>}
   */
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
      partition = NProducer._getRandomIntInclusive(0, this.defaultPartitionCount - 1);
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

  /**
   * produces a formatted message to a topic
   * @param {string} topic - topic to produce to
   * @param {string} identifier - identifier of message (is the key)
   * @param {object} payload - object (part of message value)
   * @param {number} partition - optional partition to produce to
   * @param {number} version - optional version of the message value
   * @returns {Promise.<object>}
   */
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

  /**
   * @private
   * produces a specially formatted message to a topic
   * @param {string} topic - topic to produce to
   * @param {string} identifier - identifier of message (is the key)
   * @param {object} _payload - object message value payload
   * @param {number} version - optional version (default is 1)
   * @param {*} _ -ignoreable, here for api compatibility
   * @param {string} partitionKey - optional key to deterministcally detect partition
   * @param {number} partition - optional partition (overwrites partitionKey)
   * @param {string} messageType - optional messageType (for the formatted message value)
   * @returns {Promise.<object>}
   */
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
   * an alias for bufferFormatPublish()
   * @alias bufferFormatPublish
   */
  bufferFormat(topic, identifier, payload, version = 1, compressionType = 0, partitionKey = null) {
    return this.bufferFormatPublish(topic, identifier, payload, version, compressionType, partitionKey);
  }

  /**
   * produces a specially formatted message to a topic, with type "publish"
   * @param {string} topic - topic to produce to
   * @param {string} identifier - identifier of message (is the key)
   * @param {object} _payload - object message value payload
   * @param {number} version - optional version (default is 1)
   * @param {*} _ -ignoreable, here for api compatibility
   * @param {string} partitionKey - optional key to deterministcally detect partition
   * @param {number} partition - optional partition (overwrites partitionKey)
   * @returns {Promise.<object>}
   */
  bufferFormatPublish(topic, identifier, _payload, version = 1, _, partitionKey = null, partition = null){
    return this._sendBufferFormat(topic, identifier, _payload, version, _, partitionKey, partition, MESSAGE_TYPES.PUBLISH);
  }

  /**
   * produces a specially formatted message to a topic, with type "update"
   * @param {string} topic - topic to produce to
   * @param {string} identifier - identifier of message (is the key)
   * @param {object} _payload - object message value payload
   * @param {number} version - optional version (default is 1)
   * @param {*} _ -ignoreable, here for api compatibility
   * @param {string} partitionKey - optional key to deterministcally detect partition
   * @param {number} partition - optional partition (overwrites partitionKey)
   * @returns {Promise.<object>}
   */
  bufferFormatUpdate(topic, identifier, _payload, version = 1, _, partitionKey = null, partition = null){
    return this._sendBufferFormat(topic, identifier, _payload, version, _, partitionKey, partition, MESSAGE_TYPES.UPDATE);
  }

  /**
   * produces a specially formatted message to a topic, with type "unpublish"
   * @param {string} topic - topic to produce to
   * @param {string} identifier - identifier of message (is the key)
   * @param {object} _payload - object message value payload
   * @param {number} version - optional version (default is 1)
   * @param {*} _ -ignoreable, here for api compatibility
   * @param {string} partitionKey - optional key to deterministcally detect partition
   * @param {number} partition - optional partition (overwrites partitionKey)
   * @returns {Promise.<object>}
   */
  bufferFormatUnpublish(topic, identifier, _payload, version = 1, _, partitionKey = null, partition = null){
    return this._sendBufferFormat(topic, identifier, _payload, version, _, partitionKey, partition, MESSAGE_TYPES.UNPUBLISH);
  }

  /**
   * pauses production (sends will not be queued)
   */
  pause() {
    this.paused = true;
  }

  /**
   * resumes production
   */
  resume() {
    this.paused = false;
  }

  /**
   * returns producer statistics
   * @returns {object}
   */
  getStats() {
    return {
      totalPublished: this._totalSentMessages,
      last: this._lastProcessed,
      isPaused: this.paused
    };
  }

  /**
   * @deprecated
   */
  refreshMetadata() {
    throw new Error("refreshMetadata is not available for NProducer.");
  }

  /**
   * resets internal private values
   * @private
   */
  _reset(){
    this._lastProcessed = null;
    this._totalSentMessages = 0;
    this.paused = false;
    this._inClosing = false;
  }

  /**
   * closes connection if open
   * stops poll interval if open
   */
  close() {

    if (this.producer) {
      this._inClosing = true;
      clearInterval(this._producerPollIntv);
      this.producer.disconnect();
      //this.producer = null;
    }
  }

  /**
   * @static
   * @private
   * returns random number in range
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  static _getRandomIntInclusive(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

module.exports = NProducer;
