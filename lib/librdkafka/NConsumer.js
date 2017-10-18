"use strict";

const Promise = require("bluebird");
const EventEmitter = require("events");
const debug = require("debug");
const async = require("async");

//@OPTIONAL
let BlizzKafka = null;

/*
  BREAKING CHANGES (compared to connect/Consumer):
  - there is an optional options object for the config named: noptions
  - pause and resume have been removed
  - consumeOnce is not implemented
  - backpressure mode is not implemented (given in 1 message only commit mode)
  - 1 message only & consume asap modes can be controlled via consumer.consume(syncEvent);
  (if syncEvent is present it will consume & commit single messages on callback)
  - lastProcessed and lastReceived are now set to null as default value
  - closing will reset stats
  - no internal async-queue is used to manage messages
  - tconf config field sets topic configuration
*/

const SINGLE_CONSUME_GRACE_TIME_MS = 1000;
const ASYNC_COMMIT_REQ_TIME_MS = 250;
const MESSAGE_CHARSET = "utf8";

const DEFAULT_LOGGER = {
  debug: debug("sinek:nconsumer:debug"),
  info: debug("sinek:nconsumer:info"),
  warn: debug("sinek:nconsumer:warn"),
  error: debug("sinek:nconsumer:error")
};

/**
 * native consumer wrapper for node-librdkafka
 * @extends EventEmitter
 */
class NConsumer extends EventEmitter {

  /**
   * creates a new consumer instance
   * @param {string|Array} topics - topic or topics to subscribe to
   * @param {object} config - configuration object
   */
  constructor(topics, config = { options: {} }) {
    super();

    try {
      if(!BlizzKafka){
        BlizzKafka = require("node-rdkafka");
      }
    } catch(error){
      throw new Error("You have to install node-rdkafka to use NConsumer.");
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

    this.topics = Array.isArray(topics) ? topics : [topics];
    this.config = config;
    this.consumer = null;
    this._resume = true;
    this._inClosing = false;
    this._firstMessageConsumed = false;
    this._totalIncomingMessages = 0;
    this._lastReceived = null;
    this._totalProcessedMessages = 0;
    this._lastProcessed = null;
    this._stream = null;
    this._asStream = null;
    this._isAutoCommitting = false;
    this._batchCount = 0;
    this._batchCommitts = 0;
    this._totalBatches = 0;
    this._batchConfig = null;
  }

  /**
   * connect to broker
   * @param {boolean} asStream - optional, if client should be started in streaming mode
   * @param {object} opts - optional, options asString, asJSON (booleans)
   * @returns {Promise.<*>}
   */
  connect(asStream = false, opts = {}) {

    let { zkConStr, kafkaHost, logger, groupId, options, noptions, tconf } = this.config;
    const { autoCommit } = options;
    const {asString = false, asJSON = false} = opts;

    let conStr = null;

    if(typeof kafkaHost === "string"){
      conStr = kafkaHost;
    }

    if(typeof zkConStr === "string"){
      conStr = zkConStr;
    }

    if(conStr === null && !noptions){
      return Promise.reject(new Error("One of the following: zkConStr or kafkaHost must be defined."));
    }

    if(conStr === zkConStr){
      return Promise.reject(new Error("NProducer does not support zookeeper connection."));
    }

    const config = {
      "metadata.broker.list": conStr,
      "group.id": typeof groupId === "string" ? groupId : "",
      "enable.auto.commit": typeof autoCommit === "boolean" ? autoCommit : true,
      "queued.min.messages": 1000,
      "queued.max.messages.kbytes": 5000,
      "fetch.message.max.bytes": 524288
    };

    const overwriteConfig = {
      "offset_commit_cb": this._onOffsetCommit.bind(this)
    };

    noptions = noptions || {};
    noptions = Object.assign({}, config, noptions, overwriteConfig);
    logger.debug(noptions);
    this._isAutoCommitting = noptions["enable.auto.commit"];

    tconf = tconf || undefined;
    logger.debug(tconf);

    this._asStream = asStream;

    if(asStream){
      return this._connectAsStream(logger, noptions, tconf, {asString, asJSON});
    }

    return this._connectInFlow(logger, noptions, tconf);
  }

  /**
   * @private
   * event handler for async offset committs
   * @param {Error} error
   * @param {Array} partitions
   */
  _onOffsetCommit(error, partitions){

    if(error){
      return this.config.logger.warn("commit request failed with an error: " + error.message);
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
  _connectInFlow(logger, noptions, tconf =  {}){
    return new Promise((resolve, reject) => {

      this.consumer = new BlizzKafka.KafkaConsumer(noptions, tconf);

      this.consumer.on("event.log", log => {
        logger.debug(log.message);
      });

      this.consumer.on("event.error", error => {
        super.emit("error", error);
      });

      this.consumer.on("error", error => {
        super.emit("error", error);
      });

      this.consumer.on("disconnected", () => {
        if(this._inClosing){
          this._reset();
        }
        logger.warn("Disconnected.");
        //auto-reconnect --> handled by consumer.consume();
      });

      this.consumer.on("ready", () => {
        logger.info(`Native consumer (flow) ready v. ${BlizzKafka.librdkafkaVersion}, e. ${BlizzKafka.features.join(", ")}.`);
        super.emit("ready");
      });

      logger.debug("Connecting..");
      this.consumer.connect(null, (error, metadata) => {

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
   * @private
   * connects in streaming mode
   * @param {object} logger
   * @param {object} noptions
   * @param {object} tconf
   * @param {object} opts
   * @returns {Promise.<*>}
   */
  _connectAsStream(logger, noptions, tconf = {}, opts = {}){
    return new Promise(resolve => {

      const {asString = false, asJSON = false} = opts;

      const topics = this.topics;
      if(topics && topics.length){
        this.config.logger.info(`Subscribing to topics: ${topics.join(", ")}.`);
      } else {
        this.config.logger.info("Not subscribing to any topics initially.");
      }

      const stream = BlizzKafka.KafkaConsumer.createReadStream(noptions, tconf, {
        topics,
        waitInterval: 1,
        objectMode: true
      });

      this._stream = stream;
      this.consumer = stream.consumer;

      stream.on("error", error => {

        //bugfix-hack
        if (this.consumer && this.consumer._isDisconnecting) {
          return;
        }

        super.emit("error", error);
      });

      stream.on("data", message => {

        this.config.logger.debug(message);

        this._totalIncomingMessages++;
        this._lastReceived = Date.now();
        message.value = this._convertMessageValue(message.value, asString, asJSON);

        if(!this._firstMessageConsumed){
          this._firstMessageConsumed = true;
          super.emit("first-drain-message", message);
        }

        super.emit("message", message);
      });

      this.consumer.on("event.log", log => {
        logger.debug(log.message);
      });

      this.consumer.on("event.error", error => {

        //bugfix-hack
        if (this.consumer && this.consumer._isDisconnecting) {
          return;
        }

        super.emit("error", error);
      });

      this.consumer.on("disconnected", () => {
        if(this._inClosing){
          this._reset();
        }
        logger.warn("Disconnected.");
        //auto-reconnect --> handled by stream
      });

      this.consumer.on("ready", () => {
        logger.info(`Native consumer (stream) ready v. ${BlizzKafka.librdkafkaVersion}, e. ${BlizzKafka.features.join(", ")}.`);
        super.emit("ready");
        resolve();
      });

      logger.debug("Connecting..");
    });
  }

  /**
   * @private
   * runs (and calls itself) until it has successfully
   * read a certain size of messages from the broker
   * @param {number} batchSize
   * @returns {boolean}
   */
  _singleConsumeRecursive(batchSize = 1){

    if(!this._resume || !this.consumer || !this.consumer.consume){
      return false;
    }

    this.consumer.consume(batchSize, (error, messages) => {
      if(error || !messages.length){
        error ? super.emit("error", error) : undefined;
        //retry asap
        setTimeout(this._singleConsumeRecursive.bind(this),
          this.config.options.consumeGraceMs || SINGLE_CONSUME_GRACE_TIME_MS);
      } else {
        super.emit("batch", messages);
      }
      return true;
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
  _convertMessageValue(_value, asString = true, asJSON = false){
    if(!_value){
      return _value;
    }

    let value = _value;

    if(!asString && !asJSON){
      return value;
    }

    if(asString || asJSON){
      value = value.toString(MESSAGE_CHARSET);
    }

    if(asJSON){
      try {
        value = JSON.parse(value);
      } catch(error){
        this.config.logger.warn(`Failed to parse message value as json: ${error.message}, ${value}`);
      }
    }

    return value;
  }

  /**
   *  subscribe and start to consume, should be called only once after connection is successfull
   *  options object supports the following fields:
   *  batchSize amount of messages that is max. fetched per round
   *  commitEveryNBatch amount of messages that should be processed before committing
   *  concurrency the concurrency of the execution per batch
   *  commitSync if the commit action should be blocking or non-blocking
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
      commitSync
    } = options;

    batchSize = batchSize || 1;
    commitEveryNBatch = commitEveryNBatch || 1;
    concurrency = concurrency || 1;
    commitSync = typeof commitSync === "undefined" ? true : commitSync; //default is true

    if(syncEvent && this._asStream){
      return Promise.reject("Usage of syncEvent is not permitted in streaming mode.");
    }

    if(this._asStream){
      return Promise.reject("Calling .conumse() is not required in streaming mode.");
    }

    return new Promise((resolve, reject) => {

      //if a sync event is present, we only consume a single message
      //await its callback and commit, if its not present, we just consume
      //asap, convert and emit the message event
      if(!syncEvent){

        this.consumer.on("data", message => {

          this.config.logger.debug(message);

          this._totalIncomingMessages++;
          this._lastReceived = Date.now();
          message.value = this._convertMessageValue(message.value, asString, asJSON);

          if(!this._firstMessageConsumed){
            this._firstMessageConsumed = true;
            super.emit("first-drain-message", message);
            resolve(); //resolves on first message
          }

          super.emit("message", message);
        });

      } else {

        if(this._isAutoCommitting){
          return reject(new Error("Please disable enable.auto.commit when using 1:n consume-mode."));
        }

        this.config.logger.info("running in", `1:${batchSize}`, "mode");
        this._batchConfig = options; //store for stats

        //we do not listen to "data" here
        //we have to grab the whole batch that is delivered via consume(count)
        super.on("batch", messages => {

          async.eachLimit(messages, concurrency, (message, _callback) => {

            this.config.logger.debug(message);

            this._totalIncomingMessages++;
            this._lastReceived = Date.now();
            message.value = this._convertMessageValue(message.value, asString, asJSON);

            if(!this._firstMessageConsumed){
              this._firstMessageConsumed = true;
              super.emit("first-drain-message", message);
              resolve(); //resolves on first message
            }

            super.emit("message", message);

            //execute sync event and wrap callback
            syncEvent(message, () => {
              this._totalProcessedMessages++;
              this._lastProcessed = Date.now();
              _callback(); //return async cb
            });

          }, () => {
            //when all messages from the batch are processed

            this._totalBatches++;
            this._batchCount++;
            //check whether we have to commit first
            if(this._batchCount < commitEveryNBatch){
              return this._singleConsumeRecursive(batchSize);
            }

            this._batchCount = 0;
            this._batchCommitts++;
            this.config.logger.debug("committing after", this._batchCount, "batches.");
            //commit last state (of all offsets)
            if(commitSync){
              try {
                this.consumer.commitSync();
              } catch(error){
                super.emit("error", error);
              }
              this._singleConsumeRecursive(batchSize); //recall instant
            } else {
              this.consumer.commit();
              setTimeout(() => {
                this._singleConsumeRecursive(batchSize); //recall with some grace time
              }, ASYNC_COMMIT_REQ_TIME_MS);
            }
          }); //EOF everyLimit

        }); //EOF super.on("batch")

      } //EOF else !syncEvent

      const topics = this.topics;
      if(topics && topics.length){
        this.config.logger.info(`Subscribing to topics: ${topics.join(", ")}.`);
        this.consumer.subscribe(topics);
      } else {
        this.config.logger.info("Not subscribing to any topics initially.");
      }

      if(!syncEvent){
        //if sync event is not present, consume as fast as possible
        this.consumer.consume();
      } else {
        //if sync event is present, we have to keep single messages coming
        this._singleConsumeRecursive(batchSize);
      }
    });
  }

  /**
   * Subscribe to additional topics
   * this function is synchronous
   * (yet the action is a long running native function)
   * @param {Array} topics - topics array
   * @returns {Array}
   */
  addSubscriptions(topics = []){

    const subscribedTo = this.consumer.subscription();
    if(subscribedTo && !!subscribedTo.length){
      return this.adjustSubscription(topics.concat(subscribedTo));
    }

    return this.adjustSubscription(topics);
  }

  /**
   * Change subscription and re-subscribe.
   * this function is synchronous
   * (yet the action is a long running native function)
   * @param {string|Array} topics - topics string or array
   * @returns {Array}
   */
  adjustSubscription(topics = []){

    if(!Array.isArray(topics)){
      topics = [topics];
    }

    const subscribedTo = this.consumer.subscription();
    if(subscribedTo && !!subscribedTo.length){
      this.config.logger.info("Unsubscribing current topics.");
      this.consumer.unsubscribe();
    }

    this.config.logger.info("Subscribing to new topics.");
    this.consumer.subscribe(topics);
    this.topics = topics; //update member field
    return this.topics;
  }

  /**
   * commit all stored offsets
   * @param {boolean} async - optional, if commit should be async (default is false)
   * @returns {boolean}
   */
  commit(async = false){

    if(!this.consumer){
      return false;
    }

    if(async){
      this.consumer.commit();
      return true;
    }

    try {
      this.consumer.commitSync();
      return true;
    } catch(error){
      super.emit("error", error);
      return false;
    }
  }

  /**
   * @deprecated
   */
  consumeOnce() {
    return Promise.reject(new Error("consumeOnce is not implemented for nconsumer."));
  }

  /**
   * @deprecated
   */
  pause() {
    throw new Error("pause not implemented for nconsumer.");
  }

  /**
   * @deprecated
   */
  resume() {
    throw new Error("resume not implemented for nconsumer.");
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
      batch: {
        current: this._batchCount,
        committs: this._batchCommitts,
        total: this._totalBatches,
        config: this._batchConfig
      }
    };
  }

  /**
   * @private
   * resets internal values
   */
  _reset(){
    this._firstMessageConsumed = false;
    this._resume = true;
    this._inClosing = false;
    this._totalIncomingMessages = 0;
    this._lastReceived = null;
    this._totalProcessedMessages = 0;
    this._lastProcessed = null;
    this._stream = null;
    this._asStream = null;
    this._batchCount = 0;
    this._batchCommitts = 0;
    this._totalBatches = 0;
    this._batchConfig = null;
  }

  /**
   * closes connection if open
   * @param {boolean} commit - if last offsets should be commited before closing connection
   */
  close(commit = false) {
    if (this.consumer) {
      this._inClosing = true;
      this._resume = false; //abort any running recursive consumption
      if(!commit){
        this.consumer.disconnect();
        //this.consumer = null;
      } else {
        this.consumer.commit();
        this.config.logger.info("Committing on close.");
        process.nextTick(() => {
          this.consumer.disconnect();
          //this.consumer = null;
        });
      }
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
  getOffsetForTopicPartition(topic, partition = 0, timeout = 2500){
    return new Promise((resolve, reject) => {
      this.consumer.queryWatermarkOffsets(topic, partition, timeout, (error, offsets) => {

        if(error){
          return reject(error);
        }

        resolve(offsets);
      });
    });
  }

  /**
   * gets all comitted offsets
   * @param {number} timeout - optional, default is 2500
   * @returns {Promise.<Array>}
   */
  getComittedOffsets(timeout = 2500){
    return new Promise((resolve, reject) => {
      this.consumer.committed(timeout, (error, partitions) => {

        if(error){
          return reject(error);
        }

        resolve(partitions);
      });
    });
  }

  /**
   * gets all topic-partitions which are assigned to this consumer
   * @returns {Array}
   */
  getAssignedPartitions(){
    try {
      return this.consumer.assignments();
    } catch(error){
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
  static findPartitionOffset(topic, partition, offsets){

    for(let i = 0; i < offsets.length; i++){
      if(offsets[i].topic === topic && offsets[i].partition === partition){
        return offsets[i].offset;
      }
    }

    throw new Error(`no offset found for ${topic}:${partition} in comitted offsets.`);
  }

  /**
   * compares the local commit offset status with the remote broker
   * status for the topic partitions, for all assigned partitions of
   * the consumer
   * @returns {Promise.<Array>}
   */
  async getLagStatus(){

    const startT = Date.now();
    const assigned = this.getAssignedPartitions();
    const comitted = await this.getComittedOffsets();

    const awass = await Promise.all(assigned.map(async topicPartition => {
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
      } catch(error){
        return {
          topic: topicPartition.topic,
          partition: topicPartition.partition,
          error
        };
      }
    }));

    const duration = Date.now() - startT;
    this.config.logger.info(`fetching and comparing lag status took: ${duration} ms.`);

    return awass;
  }
}

module.exports = NConsumer;
