"use strict";

const Promise = require("bluebird");
const EventEmitter = require("events");
const debug = require("debug");
const { Kafka } = require("kafkajs");

const { ConsumerAnalytics } = require("./../shared/Analytics.js");
const { ConsumerHealth } = require("./../shared/Health.js");
const Metadata = require("./../shared/Metadata.js");

const MESSAGE_CHARSET = "utf8";

const DEFAULT_LOGGER = {
  debug: debug("sinek:jsconsumer:debug"),
  info: debug("sinek:jsconsumer:info"),
  warn: debug("sinek:jsconsumer:warn"),
  error: debug("sinek:jsconsumer:error")
};

/**
 * wrapper around kafkajs that immitates nconsumer
 * @extends EventEmitter
 */
class JSConsumer extends EventEmitter {

  /**
   * creates a new consumer instance
   * @param {string|Array} topics - topic or topics to subscribe to
   * @param {object} config - configuration object
   */
  constructor(topics, config = { options: {}, health: {} }) {
    super();

    if (!config) {
      throw new Error("You are missing a config object.");
    }

    if (!config.logger || typeof config.logger !== "object") {
      config.logger = DEFAULT_LOGGER;
    }

    if (!config.options) {
      config.options = {};
    }

    if (!config.noptions) {
      config.noptions = {};
    }

    const brokers = config.kafkaHost ||
      (config.noptions["metadata.broker.list"] && config.noptions["metadata.broker.list"].split(","));
    const clientId = config.noptions["client.id"];

    if (!brokers || !clientId) {
      throw new Error("You are missing a broker or group configs");
    }

    if (config.noptions["security.protocol"]) {
      this.kafkaClient = new Kafka({
        brokers,
        clientId,
        ssl: {
          ca: [fs.readFileSync(config.noptions["ssl.ca.location"], "utf-8")],
          cert: fs.readFileSync(config.noptions["ssl.certificate.location"], "utf-8"),
          key: fs.readFileSync(config.noptions["ssl.key.location"], "utf-8"),
          passphrase: config.noptions["ssl.key.password"],
        },
        sasl: {
          mechanism: config.noptions["sasl.mechanisms"],
          username: config.noptions["sasl.username"],
          password: config.noptions["sasl.password"],
        },
      });
    } else {
      this.kafkaClient = new Kafka({ brokers, clientId });
    }

    this._adminClient = this.kafkaClient.admin();
    this.topics = Array.isArray(topics) ? topics : [topics];
    this.config = config;
    this._health = new ConsumerHealth(this, this.config.health || {});

    this.consumer = null;
    this._inClosing = false;
    this._firstMessageConsumed = false;
    this._totalIncomingMessages = 0;
    this._lastReceived = null;
    this._totalProcessedMessages = 0;
    this._lastProcessed = null;
    this._isAutoCommitting = null;
    this._batchCount = 0;
    this._batchCommitts = 0;
    this._totalBatches = 0;
    this._lagCache = null;
    this._analyticsOptions = null;
    this._analytics = null;
    this._lastLagStatus = null;
    this._consumedSinceCommit = 0;
    this._emptyFetches = 0;
    this._avgBatchProcessingTime = 0;
    this._extCommitCallback = null;
    this._uncommitedOffsets = null;
    this._asString = true;
    this._asJSON = false;

    this._errors = 0;

    super.on("error", () => {
      this._errors++
    });

    super.on("batch", (messages, { resolveOffset, syncEvent }) => {

      const startBPT = Date.now();
      this._totalIncomingMessages += messages.length;
      this._lastReceived = Date.now();

      const messageOffstes = [];

      const mappedMessages = messages.map((message) => {
        this.config.logger.debug(message);
        message.value = this._convertMessageValue(message.value, this.asString, this.asJSON);
        super.emit("message", message);
        messageOffstes.push(message.offset);
        return message;
      });

      //execute sync event and wrap callback (in this mode the sync event recieves all messages as batch)
      syncEvent(mappedMessages, async (__error) => {

        /* ### sync event callback does not handle errors ### */
        if (__error && this.config && this.config.logger && this.config.logger.warn) {
          this.config.logger.warn("Please dont pass errors to sinek consume callback", __error);
        }

        this._bumpVariableOfBatch(startBPT, mappedMessages.length);

        try {
          messageOffstes.forEach((offset) => {
            resolveOffset(offset);
          });
        } catch (error) {
          super.emit("error", error);
        }
      });
    });
  }

  /**
   * connect to broker
   * @param {boolean} asStream - optional, if client should be started in streaming mode
   * @param {object} opts - optional, options asString, asJSON (booleans)
   * @returns {Promise.<*>}
   */
  connect(asStream = false, opts = {}) {

    if (asStream) {
      return Promise.reject(new Error("JSConsumer does not support streaming mode."));
    }

    let { zkConStr, kafkaHost, logger, groupId, options, noptions, tconf } = this.config;

    let conStr = null;

    if (typeof kafkaHost === "string") {
      conStr = kafkaHost;
    }

    if (typeof zkConStr === "string") {
      conStr = zkConStr;
    }

    if (conStr === null && !noptions) {
      return Promise.reject(new Error("One of the following: zkConStr or kafkaHost must be defined."));
    }

    if (conStr === zkConStr) {
      return Promise.reject(new Error("NProducer does not support zookeeper connection."));
    }

    const config = {
      "metadata.broker.list": conStr,
      "group.id": typeof groupId === "string" ? groupId : "",
      "enable.auto.commit": false, // default in librdkafka is true - what makes this dangerous for our batching logic(s)
    };

    const overwriteConfig = {
      "offset_commit_cb": this._onOffsetCommit.bind(this)
    };

    if (noptions && noptions["offset_commit_cb"]) {
      if (typeof noptions["offset_commit_cb"] !== "function") {
        return Promise.reject(new Error("offset_commit_cb must be a function."));
      }
      this._extCommitCallback = noptions["offset_commit_cb"];
    }

    noptions = noptions || {};
    noptions = Object.assign({}, config, noptions, overwriteConfig);
    logger.debug(noptions);
    this._isAutoCommitting = noptions["enable.auto.commit"];

    tconf = tconf || undefined;
    logger.debug(tconf);

    this._groupId = noptions["group.id"];

    if (!this._groupId) {
      return Promise.reject(new Error("Group need to be configured on noptions['groupId.id']"));
    }

    return this._connectInFlow(logger);
  }

  /**
   * @private
   * event handler for async offset committs
   * @param {Error} error
   * @param {Array} partitions
   */
  _onOffsetCommit(error, partitions) {

    if (this._extCommitCallback) {
      try {
        this._extCommitCallback(error, partitions);
      } catch (error) {
        super.emit("error", error);
      }
    }

    if (error) {
      return this.config.logger.warn("commit request failed with an error: " + JSON.stringify(error));
    }

    this.config.logger.debug(partitions);
  }

  /**
   * @private
   * connects in flow mode mode
   * @param {object} logger
   * @param {object} noptions
   * @param {object} tconf
   * @returns {Promise.<*>}
   */
  _connectInFlow(logger) {

    return new Promise(async (resolve, reject) => {

      this.consumer = this.kafkaClient.consumer({ groupId: this._groupId });
      const { CONNECT, CRASH, DISCONNECT } = this.consumer.events;

      this.consumer.on(CRASH, error => {
        super.emit("error", error);
      });

      this.consumer.on(DISCONNECT, () => {
        if (this._inClosing) {
          this._reset();
        }
        logger.warn("Disconnected.");
        //auto-reconnect --> handled by consumer.consume();
      });

      this.consumer.on(CONNECT, payload => {
        logger.info(`KafkaJS consumer (flow) ready with group. Info: ${payload}.`);
        super.emit("ready");
      });

      logger.debug("Connecting..");

      try {
        await Promise.all([
          this.consumer.connect(),
          this._adminClient.connect(),
        ]);
      } catch (error) {
        super.emit("error", error);
        return reject(error);
      }

      resolve();
    });
  }

  /**
   * @private
   * runs (and calls itself) until it has successfully
   * read a certain size of messages from the broker
   * @returns {boolean}
   */
  _consumerRun(syncEvent) {

    if (!this.resume || !this.consumer) {
      return false;
    }

    this.consumer.run({
      eachBatchAutoResolve: false,
      eachBatch: async ({ batch, uncommittedOffsets, resolveOffset, heartbeat, isRunning, isStale }) => {

        const messages = batch.messages;

        if (!isRunning() || isStale() || !messages.length) {

          //always ensure longer wait on consume error
          if (!isRunning() || isStale()) {

            if (this.config && this.config.logger && this.config.logger.debug) {
              this.config.logger.debug(`Consumed recursively with error ${error.message}`);
            }

            super.emit("error", error);
          }

          //retry asap
          this._emptyFetches++;
        } else {

          if (this.config && this.config.logger && this.config.logger.debug) {
            this.config.logger.debug(`Consumed recursively with success ${messages.length}`);
          }

          this._emptyFetches = 0; //reset
          this._uncommitedOffsets = await uncommittedOffsets();
          super.emit("batch", batch.messages, { resolveOffset, syncEvent });
        }
        await heartbeat();
      }
    });
  }

  /**
   * @private
   * converts message value according to booleans
   * @param {Buffer} _value
   * @param {boolean} asString
   * @param {boolean} asJSON
   * @returns {Buffer|string|object}
   */
  _convertMessageValue(_value, asString = true, asJSON = false) {
    if (!_value) {
      return _value;
    }

    let value = _value;

    if (!asString && !asJSON) {
      return value;
    }

    if (asString || asJSON) {
      value = value.toString(MESSAGE_CHARSET);
    }

    if (asJSON) {
      try {
        value = JSON.parse(value);
      } catch (error) {
        this.config.logger.warn(`Failed to parse message value as json: ${error.message}, ${value}`);
      }
    }

    return value;
  }

  _bumpVariableOfBatch(startBPT, batchLength) {

    this._totalProcessedMessages += batchLength;
    this._lastProcessed = Date.now();

    //when all messages from the batch are processed
    this._avgBatchProcessingTime = (this._avgBatchProcessingTime + (Date.now() - startBPT)) / 2;
    this._consumedSinceCommit += batchLength;
    this._totalBatches++;
    this._batchCount++;

    this.config.logger.debug("committing after", this._batchCount, "batches, messages: " + this._consumedSinceCommit);
    super.emit("commit", this._consumedSinceCommit);
    this._batchCount = 0;
    this._batchCommitts++;
    this._consumedSinceCommit = 0;
  }

  async _consumeHandler(syncEvent, {
    manualBatching,
  }) {

    if (this._isAutoCommitting !== null && typeof this._isAutoCommitting !== "undefined") {
      this.config.logger.warn("enable.auto.commit has no effect in 1:n consume-mode, set to null or undefined to remove this message." +
        "You can pass 'noBatchCommits' as true via options to .consume(), if you want to commit manually.");
    }

    if (this._isAutoCommitting) {
      throw new Error("Please disable enable.auto.commit when using 1:n consume-mode.");
    }

    if (!manualBatching) {
      this.config.logger.warn("The consumer only allow manual batching for now");
    }

    this.config.logger.info("Batching manually..");
    this._consumerRun(syncEvent);
  }

  /**
   *  subscribe and start to consume, should be called only once after connection is successfull
   *  options object supports the following fields:
   *  batchSize amount of messages that is max. fetched per round
   *  commitEveryNBatch amount of messages that should be processed before committing
   *  concurrency the concurrency of the execution per batch
   *  commitSync if the commit action should be blocking or non-blocking
   *  noBatchCommits defaults to false, if set to true, no commits will be made for batches
   *
   * @param {function} syncEvent - callback (receives messages and callback as params)
   * @param {string} asString - optional, if message value should be decoded to utf8
   * @param {boolean} asJSON - optional, if message value should be json deserialised
   * @param {object} options - optional object containing options for 1:n mode:
   * @returns {Promise.<*>}
   */
  consume(syncEvent = null, asString = true, asJSON = false, options = {}) {

    let {
      batchSize,
      commitEveryNBatch,
      concurrency,
      commitSync,
      noBatchCommits,
      manualBatching,
      sortedManualBatch,
    } = options;

    batchSize = batchSize || 1;
    commitEveryNBatch = commitEveryNBatch || 1;
    concurrency = concurrency || 1;
    commitSync = typeof commitSync === "undefined" ? true : commitSync; //default is true
    noBatchCommits = typeof noBatchCommits === "undefined" ? false : noBatchCommits; //default is false
    manualBatching = typeof manualBatching === "undefined" ? true : manualBatching; //default is true
    sortedManualBatch = typeof sortedManualBatch === "undefined" ? false : sortedManualBatch; //default is false

    this._asString = asString;
    this._asJSON = asJSON;

    if (!this.consumer) {
      return Promise.reject(new Error("You must call and await .connect() before trying to consume messages."));
    }

    if (syncEvent && this._asStream) {
      return Promise.reject(new Error("Usage of syncEvent is not permitted in streaming mode."));
    }

    if (this._asStream) {
      return Promise.reject(new Error("Calling .consume() is not required in streaming mode."));
    }

    if (sortedManualBatch && !manualBatching) {
      return Promise.reject(new Error("manualBatching batch option must be enabled, if you enable sortedManualBatch batch option."));
    }

    if (this.config && this.config.logger) {
      this.config.logger.warn("batchSize is not supported by KafkaJS");
    }

    const topics = this.topics;

    if (topics && topics.length) {
      this.config.logger.info(`Subscribing to topics: ${topics.join(", ")}.`);
      topics.forEach(async (topic) => {
        await this.consumer.subscribe({ topic });
      });
    } else {
      this.config.logger.info("Not subscribing to any topics initially.");
    }

    if (!syncEvent) {
      return this.consumer.run({
        eachMessage: async ({ message }) => {

          this.config.logger.debug(message);

          this._totalIncomingMessages++;
          this._lastReceived = Date.now();
          message.value = this._convertMessageValue(message.value, asString, asJSON);

          if (!this._firstMessageConsumed) {
            this._firstMessageConsumed = true;
            super.emit("first-drain-message", message);
          }

          super.emit("message", message);
        }
      });
    }

    return this._consumeHandler(syncEvent, {
      manualBatching,
    });
  }

  /**
   * pause the consumer for specific topics (partitions)
   * @param {Array.<{}>} topicPartitions
   * @throws {LibrdKafkaError}
   */
  pause(topicPartitions = []) {
    if (this.consumer) {
      return this.consumer.pause(topicPartitions);
    }
  }

  /**
   * resume the consumer for specific topic (partitions)
   * @param {Array.<{}>} topicPartitions
   * @throws {LibrdKafkaError}
   */
  resume(topicPartitions = []) {
    if (this.consumer) {
      return this.consumer.resume(topicPartitions);
    }
  }

  /**
   * returns consumer statistics
   * @returns {object}
   */
  getStats() {
    return {
      totalIncoming: this._totalIncomingMessages,
      lastMessage: this._lastReceived,
      receivedFirstMsg: this._firstMessageConsumed,
      totalProcessed: this._totalProcessedMessages,
      lastProcessed: this._lastProcessed,
      queueSize: null,
      isPaused: false,
      drainStats: null,
      omittingQueue: true,
      autoComitting: this._isAutoCommitting,
      consumedSinceCommit: this._consumedSinceCommit,
      batch: {
        current: this._batchCount,
        committs: this._batchCommitts,
        total: this._totalBatches,
        currentEmptyFetches: this._emptyFetches,
        avgProcessingTime: this._avgBatchProcessingTime
      },
      lag: this._lagCache, //read from private cache
      totalErrors: this._errors
    };
  }

  /**
   * @private
   * resets internal values
   */
  _reset() {
    this._firstMessageConsumed = false;
    this._inClosing = false;
    this._totalIncomingMessages = 0;
    this._lastReceived = null;
    this._totalProcessedMessages = 0;
    this._lastProcessed = null;
    this._asStream = null;
    this._batchCount = 0;
    this._batchCommitts = 0;
    this._totalBatches = 0;
    this._lagCache = null;
    this._analytics = null;
    this._lastLagStatus = null;
    this._consumedSinceCommit = 0;
    this._emptyFetches = 0;
    this._avgBatchProcessingTime = 0;
    this._errors = 0;
    this._extCommitCallback = null;
  }

  /**
   * closes connection if open
   */
  async close() {

    if (this.consumer) {
      this._inClosing = true;

      return Promise.all([
        this.consumer.disconnect(),
        this._adminClient.disconnect(),
      ]);
    }
  }

  /**
   * gets the lowest and highest offset that is available
   * for a given kafka topic
   * @param {string} topic - name of the kafka topic
   * @param {number} partition - optional, default is 0
   * @param {number} timeout - optional, default is 2500
   * @returns {Promise.<object>}
   */
  async getOffsetForTopicPartition(topic, partition = 0, timeout = 2500) {

    if (!this.consumer) {
      return Promise.reject(new Error("Consumer not yet connected."));
    }

    if (this.config && this.config.logger && this.config.logger.debug) {
      this.config.logger.debug(`Fetching offsets for topic partition ${topic} ${partition}.`);
    }

    const offsetInfos = await this._adminClient.fetchOffsets({ groupId: this._groupId, topic });

    return offsetInfos.filter((offsetInfo) => offsetInfo.partition === partition)[0];
  }

  /**
   * gets all comitted offsets
   * @param {number} timeout - optional, default is 2500
   * @returns {Promise.<Array>}
   */
  async getComittedOffsets(timeout = 2500) {

    if (!this.consumer) {
      return [];
    }

    if (this.config && this.config.logger && this.config.logger.debug) {
      this.config.logger.debug(`Fetching committed offsets ${timeout}`);
    }

    return [].concat.apply([],
      await Promise.all(

        this.topics.map(async (topic) => {

          const offsets = await this._adminClient.fetchOffsets({
            groupId: this._groupId,
            topic,
          });

          return offsets.map((offsetInfo) => {
            offsetInfo.topic = topic;
            return offsetInfo;
          });
        })
      )
    );
  }

  /**
   * gets all topic-partitions which are assigned to this consumer
   * @returns {Array}
   */
  async getAssignedPartitions() {
    try {
      return (await this.getComittedOffsets());
    } catch (error) {
      super.emit("error", error);
      return [];
    }
  }

  /**
   * @static
   * return the offset that has been comitted for a given topic and partition
   * @param {string} topic - topic name
   * @param {number} partition - partition
   * @param {Array} offsets - commit offsets from getComittedOffsets()
   */
  static findPartitionOffset(topic, partition, offsets) {

    for (let i = 0; i < offsets.length; i++) {
      if (offsets[i].topic === topic && offsets[i].partition === partition) {
        return offsets[i].offset;
      }
    }

    throw new Error(`no offset found for ${topic}:${partition} in comitted offsets.`);
  }

  /**
   * compares the local commit offset status with the remote broker
   * status for the topic partitions, for all assigned partitions of
   * the consumer
   * @param {boolean} noCache - when analytics are enabled the results can be taken from cache
   * @returns {Promise.<Array>}
   */
  async getLagStatus(noCache = false) {

    if (!this.consumer) {
      return [];
    }

    //if allowed serve from cache
    if (!noCache && this._lagCache && this._lagCache.status) {
      return this._lagCache.status;
    }

    if (this.config && this.config.logger && this.config.logger.debug) {
      this.config.logger.debug(`Getting lag status ${noCache}`);
    }

    const startT = Date.now();
    const assigned = this.getAssignedPartitions();
    const comitted = await this.getComittedOffsets();

    const status = await Promise.all(assigned.map(async topicPartition => {
      try {
        const brokerState = await this.getOffsetForTopicPartition(topicPartition.topic, topicPartition.partition);
        const comittedOffset = NConsumer.findPartitionOffset(topicPartition.topic, topicPartition.partition, comitted);
        return {
          topic: topicPartition.topic,
          partition: topicPartition.partition,
          lowDistance: comittedOffset - brokerState.lowOffset,
          highDistance: brokerState.highOffset - comittedOffset,
          detail: {
            lowOffset: brokerState.lowOffset,
            highOffset: brokerState.highOffset,
            comittedOffset
          }
        };
      } catch (error) {
        return {
          topic: topicPartition.topic,
          partition: topicPartition.partition,
          error
        };
      }
    }));

    const duration = Date.now() - startT;
    this.config.logger.info(`fetching and comparing lag status took: ${duration} ms.`);

    //store cached version
    if (status && Array.isArray(status)) {

      //keep last version
      if (this._lagCache && this._lagCache.status) {
        this._lastLagStatus = Object.assign({}, this._lagCache);
      }

      //cache new version
      this._lagCache = {
        status,
        at: startT,
        took: Date.now() - startT
      };
    }

    return status;
  }

  /**
   * called in interval
   * @private
   */
  _runAnalytics() {

    if (!this._analytics) {
      this._analytics = new ConsumerAnalytics(this, this._analyticsOptions || {}, this.config.logger);
    }

    return this._analytics.run()
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
   * called in interval
   * @private
   */
  _runLagCheck() {
    return this.getLagStatus(true).catch(() => { });
  }

  /**
   * runs a health check and returns object with status and message
   * @returns {Promise.<object>}
   */
  checkHealth() {
    return this._health.check();
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

      if (!this.consumer) {
        return reject(new Error("You must call and await .connect() before trying to get metadata."));
      }

      if (this.config && this.config.logger && this.config.logger.debug) {
        this.config.logger.debug(`Fetching topic metadata ${topic}`);
      }

      this._adminClient.fetchTopicMetadata({
        topics: [topic],
        timeout
      }, (error, raw) => {

        if (error) {
          return reject(error);
        }

        resolve(new Metadata(raw[0]));
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
   * returns a list of available kafka topics on the connected brokers
   * @param {number} timeout
   */
  async getTopicList(timeout = 2500) {
    const metadata = await this.getMetadata(timeout);
    return metadata.asTopicList();
  }
}

module.exports = JSConsumer;
