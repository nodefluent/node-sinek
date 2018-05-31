"use strict";

const EventEmitter = require("events");
const Promise = require("bluebird");
const uuid = require("uuid");
const murmur = require("murmurhash");
const debug = require("debug");
const murmur2Partitioner = require("murmur2-partitioner");

const Metadata = require("./Metadata.js");
const {
  ProducerAnalytics
} = require("./Analytics.js");
const {
  ProducerHealth
} = require("./Health.js");

//@OPTIONAL
let BlizzKafka = null;

const MESSAGE_TYPES = {
  PUBLISH: "-published",
  UNPUBLISH: "-unpublished",
  UPDATE: "-updated"
};

const MAX_PART_AGE_MS = 1e3 * 60 * 5; //5 minutes
const MAX_PART_STORE_SIZE = 1e4;
const DEFAULT_MURMURHASH_VERSION = "3";

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
 * native producer wrapper for node-librdkafka
 * @extends EventEmitter
 */
class NProducer extends EventEmitter {

  /**
   * creates a new producer instance
   * @param {object} config - configuration object
   * @param {*} _ - ignore this param (api compatability)
   * @param {number|string} defaultPartitionCount  - amount of default partitions for the topics to produce to
   */
  constructor(config, _, defaultPartitionCount = 1) {
    super();

    if (!config) {
      throw new Error("You are missing a config object.");
    }

    if (!config.logger || typeof config.logger !== "object") {
      config.logger = DEFAULT_LOGGER;
    }

    try {
      if (!BlizzKafka) {
        BlizzKafka = require("node-rdkafka");
      }
    } catch (error) {
      config.logger.error(error);
      throw new Error("You have to install node-rdkafka to use NProducer. " + error.message);
    }

    if (!config.options) {
      config.options = {};
    }

    this.config = config;
    this._health = new ProducerHealth(this);

    this.paused = false;
    this.producer = null;
    this._producerPollIntv = null;
    this.defaultPartitionCount = defaultPartitionCount;
    this._partitionCounts = {};
    this._inClosing = false;
    this._totalSentMessages = 0;
    this._lastProcessed = null;
    this._analyticsOptions = null;
    this._analyticsIntv = null;
    this._analytics = null;

    this._murmurHashVersion = this.config.options.murmurHashVersion || DEFAULT_MURMURHASH_VERSION;
    this.config.logger.info(`using murmur ${this._murmurHashVersion} partitioner.`);

    switch (this._murmurHashVersion) {
    case "2":
      this._murmur = (key, partitionCount) => murmur2Partitioner.partition(key, partitionCount);
      break;

    case "3":
      this._murmur = (key, partitionCount) => murmur.v3(key) % partitionCount;
      break;

    default:
      throw new Error(`${this._murmurHashVersion} is not a supported murmur hash version. Choose '2' or '3'.`);
    }

    this._errors = 0;
    super.on("error", () => this._errors++);
  }

  /**
   * @throws
   * starts analytics tasks
   * @param {object} options - analytic options
   */
  enableAnalytics(options = {}) {

    if (this._analyticsIntv) {
      throw new Error("analytics intervals are already running.");
    }

    let {
      analyticsInterval
    } = options;
    this._analyticsOptions = options;

    analyticsInterval = analyticsInterval || 1e6 * 45; //45 sec

    this._analyticsIntv = setInterval(this._runAnalytics.bind(this), analyticsInterval);
  }

  /**
   * halts all analytics tasks
   */
  haltAnalytics() {

    if (this._analyticsIntv) {
      clearInterval(this._analyticsIntv);
    }
  }

  /**
   * connects to the broker
   * @returns {Promise.<*>}
   */
  connect() {
    return new Promise((resolve, reject) => {

      let {
        zkConStr,
        kafkaHost,
        logger,
        options,
        noptions,
        tconf
      } = this.config;
      const {
        pollIntervalMs
      } = options;

      let conStr = null;

      if (typeof kafkaHost === "string") {
        conStr = kafkaHost;
      }

      if (typeof zkConStr === "string") {
        conStr = zkConStr;
      }

      if (conStr === null && !noptions) {
        return reject(new Error("One of the following: zkConStr or kafkaHost must be defined."));
      }

      if (conStr === zkConStr) {
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
        if (this._inClosing) {
          this._reset();
        }
        logger.warn("Disconnected.");
        //auto-reconnect??? -> handled by producer.poll()
      });

      this.producer.on("ready", () => {

        logger.info(`Native producer ready v. ${BlizzKafka.librdkafkaVersion}, e. ${BlizzKafka.features.join(", ")}.`);

        //poll broker for updates
        this._producerPollIntv = setInterval(() => {
          if (this.producer) {
            this.producer.poll();
          }
        }, pollIntervalMs || 100);

        super.emit("ready");
      });

      logger.debug("Connecting..");
      this.producer.connect(null, (error, metadata) => {

        if (error) {
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
  _getPartitionForKey(key, partitionCount = 1) {
    if (typeof key !== "string") {
      throw new Error("key must be a string.");
    }

    if (typeof partitionCount !== "number") {
      throw new Error("partitionCount must be number.");
    }

    this._murmur(key, partitionCount);
  }

  /**
   * @async
   * produces a kafka message to a certain topic
   * @param {string} topicName - name of the topic to produce to
   * @param {object} message - value object for the message
   * @param {number} _partition - optional partition to produce to
   * @param {string} _key - optional message key
   * @param {string} _partitionKey - optional key to evaluate partition for this message
   * @param {*} _opaqueKey - optional opaque token, which gets passed along to your delivery reports
   * @returns {Promise.<object>}
   */
  async send(topicName, message, _partition = null, _key = null, _partitionKey = null, _opaqueKey = null) {

    if (!this.producer) {
      throw new Error("You must call and await .connect() before trying to produce messages.");
    }

    if (this.paused) {
      throw new Error("producer is paused.");
    }

    if (!message || !(typeof message === "string" || Buffer.isBuffer(message))) {
      throw new Error("message must be a string or an instance of Buffer.");
    }

    const key = _key ? _key : uuid.v4();
    message = Buffer.isBuffer(message) ? message : new Buffer(message);

    let maxPartitions = 0;
    //find correct max partition count
    if (this.defaultPartitionCount === "auto" && typeof _partition !== "number") { //manual check to improve performance
      maxPartitions = await this.getPartitionCountOfTopic(topicName);
      if (maxPartitions === -1) {
        throw new Error("defaultPartition set to 'auto', but was not able to resolve partition count for topic" +
          topicName + ", please make sure the topic exists before starting the producer in auto mode.");
      }
    } else {
      maxPartitions = this.defaultPartitionCount;
    }

    let partition = 0;
    //find correct partition for this key
    if (maxPartitions >= 2 && typeof _partition !== "number") { //manual check to improve performance
      partition = this._getPartitionForKey(_partitionKey ? _partitionKey : key, maxPartitions);
    }

    //if _partition (manual) is set, it always overwrites a selected partition
    partition = typeof _partition === "number" ? _partition : partition;

    this.config.logger.debug(JSON.stringify({
      topicName,
      partition,
      key
    }));
    const producedAt = Date.now();

    this._lastProcessed = producedAt;
    this._totalSentMessages++;

    this.producer.produce(topicName, partition, message, key, producedAt, _opaqueKey);

    return {
      key,
      partition
    };
  }

  /**
   * @async
   * produces a formatted message to a topic
   * @param {string} topic - topic to produce to
   * @param {string} identifier - identifier of message (is the key)
   * @param {object} payload - object (part of message value)
   * @param {number} partition - optional partition to produce to
   * @param {number} version - optional version of the message value
   * @param {string} partitionKey - optional key to evaluate partition for this message
   * @returns {Promise.<object>}
   */
  async buffer(topic, identifier, payload, partition = null, version = null, partitionKey = null) {

    if (typeof identifier === "undefined") {
      identifier = uuid.v4();
    }

    if (typeof identifier !== "string") {
      identifier = identifier + "";
    }

    if (typeof payload !== "object") {
      throw new Error("expecting payload to be of type object.");
    }

    if (typeof payload.id === "undefined") {
      payload.id = identifier;
    }

    if (version && typeof payload.version === "undefined") {
      payload.version = version;
    }

    return await this.send(topic, JSON.stringify(payload), partition, identifier, partitionKey);
  }

  /**
   * @async
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
  async _sendBufferFormat(topic, identifier, _payload, version = 1, _, partitionKey = null, partition = null, messageType = "") {

    if (typeof identifier === "undefined") {
      identifier = uuid.v4();
    }

    if (typeof identifier !== "string") {
      identifier = identifier + "";
    }

    if (typeof _payload !== "object") {
      throw new Error("expecting payload to be of type object.");
    }

    if (typeof _payload.id === "undefined") {
      _payload.id = identifier;
    }

    if (version && typeof _payload.version === "undefined") {
      _payload.version = version;
    }

    const payload = {
      payload: _payload,
      key: identifier,
      id: uuid.v4(),
      time: (new Date()).toISOString(),
      type: topic + messageType
    };

    return await this.send(topic, JSON.stringify(payload), partition, identifier, partitionKey);
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
  bufferFormatPublish(topic, identifier, _payload, version = 1, _, partitionKey = null, partition = null) {
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
  bufferFormatUpdate(topic, identifier, _payload, version = 1, _, partitionKey = null, partition = null) {
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
  bufferFormatUnpublish(topic, identifier, _payload, version = 1, _, partitionKey = null, partition = null) {
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
      isPaused: this.paused,
      totalErrors: this._errors
    };
  }

  /**
   * @deprecated
   */
  refreshMetadata() {
    throw new Error("refreshMetadata not implemented for nproducer.");
  }

  /**
   * resolve the metadata information for a give topic
   * will create topic if it doesnt exist
   * @param {string} topic - name of the topic to query metadata for
   * @param {number} timeout - optional, default is 2500
   * @returns {Promise.<Metadata>}
   */
  getTopicMetadata(topic, timeout = 2500) {
    return new Promise((resolve, reject) => {

      if (!this.producer) {
        return reject(new Error("You must call and await .connect() before trying to get metadata."));
      }

      this.producer.getMetadata({
        topic,
        timeout
      }, (error, raw) => {

        if (error) {
          return reject(error);
        }

        resolve(new Metadata(raw));
      });
    });
  }

  /**
   * @alias getTopicMetadata
   * @param {number} timeout - optional, default is 2500
   * @returns {Promise.<Metadata>}
   */
  getMetadata(timeout = 2500) {
    return this.getTopicMetadata(null, timeout);
  }

  /**
   * @async
   * gets the partition count of the topic from the brokers metadata
   * keeps a local cache to speed up future requests
   * resolves to -1 if an error occures
   * @param {string} topic - name of topic
   * @returns {Promise.<number>}
   */
  async getPartitionCountOfTopic(topic) {

    if (!this.producer) {
      throw new Error("You must call and await .connect() before trying to get metadata.");
    }

    //prevent long running leaks..
    if (Object.keys(this._partitionCounts).length > MAX_PART_STORE_SIZE) {
      this._partitionCounts = {};
    }

    const now = Date.now();
    if (!this._partitionCounts[topic] || this._partitionCounts[topic].requested + MAX_PART_AGE_MS < now) {

      let count = -1;
      try {
        const metadata = await this.getMetadata(); //prevent creation of topic, if it does not exist
        count = metadata.getPartitionCountOfTopic(topic);
      } catch (error) {
        super.emit("error", new Error(`Failed to get metadata for topic ${topic}, because: ${error.message}.`));
        return -1;
      }

      this._partitionCounts[topic] = {
        requested: now,
        count
      };

      return count;
    }

    return this._partitionCounts[topic].count;
  }

  /**
   * gets the local partition count cache
   * @returns {object}
   */
  getStoredPartitionCounts() {
    return this._partitionCounts;
  }

  /**
   * @private
   * resets internal values
   */
  _reset() {
    this._lastProcessed = null;
    this._totalSentMessages = 0;
    this.paused = false;
    this._inClosing = false;
    this._partitionCounts = {};
    this._analytics = null;
    this._errors = 0;
  }

  /**
   * closes connection if open
   * stops poll interval if open
   */
  close() {

    this.haltAnalytics();

    if (this.producer) {
      this._inClosing = true;
      clearInterval(this._producerPollIntv);
      this.producer.disconnect();
      //this.producer = null;
    }
  }

  /**
   * called in interval
   * @private
   */
  _runAnalytics() {

    if (!this._analytics) {
      this._analytics = new ProducerAnalytics(this, this._analyticsOptions || {}, this.config.logger);
    }

    this._analytics.run()
      .then(res => super.emit("analytics", res))
      .catch(error => super.emit("error", error));
  }

  /**
   * returns the last computed analytics results
   * @throws
   * @returns {object}
   */
  getAnalytics() {

    if (!this._analytics) {
      super.emit("error", new Error("You have not enabled analytics on this consumer instance."));
      return {};
    }

    return this._analytics.getLastResult();
  }

  /**
   * runs a health check and returns object with status and message
   * @returns {Promise.<object>}
   */
  checkHealth() {
    return this._health.check();
  }
}

module.exports = NProducer;
