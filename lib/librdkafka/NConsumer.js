"use strict";

const Promise = require("bluebird");
const EventEmitter = require("events");
const debug = require("debug");
const async = require("async");

const {ConsumerAnalytics} = require("./Analytics.js");
const {ConsumerHealth} = require("./Health.js");

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

const SINGLE_CONSUME_GRACE_TIME_MS = 100;
const GRACE_TIME_FACTOR = 1.5;
const MAX_EMPTY_FETCH_COUNT = 26; // 3,9 seconds
const FETCH_ERROR_GRACE_TIME_MS = 1500;
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

    if(!config){
      throw new Error("You are missing a config object.");
    }

    if(!config.logger || typeof config.logger !== "object"){
      config.logger = DEFAULT_LOGGER;
    }

    try {
      if(!BlizzKafka){
        BlizzKafka = require("node-rdkafka");
      }
    } catch(error){
      config.logger.error(error);
      throw new Error("You have to install node-rdkafka to use NConsumer. " + error.message);
    }

    if(!config.options){
      config.options = {};
    }

    this.topics = Array.isArray(topics) ? topics : [topics];
    this.config = config;
    this._health = new ConsumerHealth(this);

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
    this._isAutoCommitting = null;
    this._batchCount = 0;
    this._batchCommitts = 0;
    this._totalBatches = 0;
    this._batchConfig = null;
    this._analyticsIntv = null;
    this._lagCheckIntv = null;
    this._lagCache = null;
    this._analyticsOptions = null;
    this._analytics = null;
    this._lastLagStatus = null;
    this._consumedSinceCommit = 0;
    this._emptyFetches = 0;
    this._avgBatchProcessingTime = 0;
    this._extCommitCallback = null;

    this._errors = 0;
    super.on("error", () => this._errors++);
  }

  /**
   * @throws
   * starts analytics tasks
   * @param {object} options - analytic options
   * @returns {Promise} resolves after as soon as analytics are available
   */
  enableAnalytics(options = {}){

    if(this._analyticsIntv || this._lagCheckIntv){
      throw new Error("analytics intervals are already running.");
    }

    let {
      analyticsInterval,
      lagFetchInterval
    } = options;
    this._analyticsOptions = options;

    analyticsInterval = analyticsInterval || 1e6 * 45; //45 sec
    lagFetchInterval = lagFetchInterval || 1e6 * 60 * 3; //3 minutes

    this._analyticsIntv = setInterval(this._runAnalytics.bind(this), analyticsInterval);
    this._lagCheckIntv = setInterval(this._runLagCheck.bind(this), lagFetchInterval);

    // Make analytics available immediately
    return this._runAnalytics()
      .then(() => this._runLagCheck());
  }

  /**
   * halts all analytics tasks
   */
  haltAnalytics(){

    if(this._analyticsIntv){
      clearInterval(this._analyticsIntv);
    }

    if(this._lagCheckIntv){
      clearInterval(this._lagCheckIntv);
    }
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
      //"enable.auto.commit": typeof autoCommit === "boolean" ? autoCommit : true,
      "queued.min.messages": 1000,
      "queued.max.messages.kbytes": 5000,
      "fetch.message.max.bytes": 524288
    };

    const overwriteConfig = {
      "offset_commit_cb": this._onOffsetCommit.bind(this)
    };

    if(noptions && noptions["offset_commit_cb"]){
      if(typeof noptions["offset_commit_cb"] !== "function"){
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

    if(this._extCommitCallback){
      try {
        this._extCommitCallback(error, partitions);
      } catch(error){
        super.emit("error", error);
      }
    }

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

        //always ensure longer wait on consume error
        if(error){
          super.emit("error", error);
          return setTimeout(this._singleConsumeRecursive.bind(this), FETCH_ERROR_GRACE_TIME_MS);
        }

        //retry asap
        this._emptyFetches++;
        let graceTime = (this.config.options.consumeGraceMs || SINGLE_CONSUME_GRACE_TIME_MS) * GRACE_TIME_FACTOR;
        graceTime = graceTime * (this._emptyFetches > MAX_EMPTY_FETCH_COUNT ? MAX_EMPTY_FETCH_COUNT : this._emptyFetches);
        setTimeout(this._singleConsumeRecursive.bind(this), graceTime);

      } else {
        this._emptyFetches = 0; //reset
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
      noBatchCommits
    } = options;

    batchSize = batchSize || 1;
    commitEveryNBatch = commitEveryNBatch || 1;
    concurrency = concurrency || 1;
    commitSync = typeof commitSync === "undefined" ? true : commitSync; //default is true
    noBatchCommits = typeof noBatchCommits === "undefined" ? false : noBatchCommits; //default is false

    if(!this.consumer){
      return Promise.reject(new Error("You must call and await .connect() before trying to consume messages."));
    }

    if(syncEvent && this._asStream){
      return Promise.reject(new Error("Usage of syncEvent is not permitted in streaming mode."));
    }

    if(this._asStream){
      return Promise.reject(new Error("Calling .conumse() is not required in streaming mode."));
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

        if(this._isAutoCommitting !== null && typeof this._isAutoCommitting !== "undefined"){
          this.config.logger.warn("enable.auto.commit has no effect in 1:n consume-mode, set to null or undefined to remove this message." +
            "You can pass 'noBatchCommits' as true via options to .consume(), if you want to commit manually.");
        }

        if(this._isAutoCommitting){
          return reject(new Error("Please disable enable.auto.commit when using 1:n consume-mode."));
        }

        this.config.logger.info("running in", `1:${batchSize}`, "mode");
        this._batchConfig = options; //store for stats

        //we do not listen to "data" here
        //we have to grab the whole batch that is delivered via consume(count)
        super.on("batch", messages => {

          const startBPT = Date.now();
          this._totalIncomingMessages += messages.length;
          this._lastReceived = Date.now();

          async.eachLimit(messages, concurrency, (message, _callback) => {

            this.config.logger.debug(message);

            message.value = this._convertMessageValue(message.value, asString, asJSON);

            if(!this._firstMessageConsumed){
              this._firstMessageConsumed = true;
              super.emit("first-drain-message", message);
              resolve(); //resolves on first message
            }

            super.emit("message", message);

            //execute sync event and wrap callback
            syncEvent(message, (__error) => {

              /* ### sync event callback does not handle errors ### */
              if(__error && this.config && this.config.logger && this.config.logger.warn){
                this.config.logger.warn("Please dont pass errors to sinek consume callback", __error);
              }

              this._totalProcessedMessages++;
              this._lastProcessed = Date.now();
              _callback(); //return async cb
            });

          }, () => {
            //when all messages from the batch are processed

            this._avgBatchProcessingTime = (this._avgBatchProcessingTime + (Date.now() - startBPT)) / 2;
            this._consumedSinceCommit += messages.length;
            this._totalBatches++;
            this._batchCount++;

            //check whether we have to commit first
            //we do not commit after a certain amount of batches
            //we commit whenever the exepected amount of batches in messages is rconsoleeached
            //we also do not commit, if noBatchCommits is true
            if(noBatchCommits === true || this._consumedSinceCommit < (batchSize * commitEveryNBatch)){
              return this._singleConsumeRecursive(batchSize);
            }

            this.config.logger.debug("committing after", this._batchCount, "batches, messages: " + this._consumedSinceCommit);
            super.emit("commit", this._consumedSinceCommit);
            this._batchCount = 0;
            this._batchCommitts++;
            this._consumedSinceCommit = 0;

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
   * commit given message
   * @param {Boolean} async - optional, if commit should be async (default is false)
   * @param {{topic, partition, offset}} message
   * @returns {boolean}
   */
  commitMessage(async = false, message) {
    if(!this.consumer){
      return false;
    }

    if(async){
      this.consumer.commitMessage(message);
      return true;
    }

    try {
      this.consumer.commitMessageSync(message);
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
   * pause the consumer for specific topics (partitions)
   * @param {Array.<{}>} topicPartitions
   * @throws {LibrdKafkaError}
   */
  pause(topicPartitions = []) {
    if(this.consumer){
      return this.consumer.pause(topicPartitions);
    }
  }

  /**
   * resume the consumer for specific topic (partitions)
   * @param {Array.<{}>} topicPartitions
   * @throws {LibrdKafkaError}
   */
  resume(topicPartitions = []) {
    if(this.consumer){
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
        config: this._batchConfig,
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
   * @param {boolean} commit - if last offsets should be commited before closing connection
   */
  close(commit = false) {

    this.haltAnalytics();

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

    if(!this.consumer){
      return Promise.reject(new Error("Consumer not yet connected."));
    }

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

    if(!this.consumer){
      return Promise.resolve([]);
    }

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
   * @param {boolean} noCache - when analytics are enabled the results can be taken from cache
   * @returns {Promise.<Array>}
   */
  async getLagStatus(noCache = false){

    if(!this.consumer){
      return [];
    }

    //if allowed serve from cache
    if(!noCache && this._lagCache && this._lagCache.status){
      return this._lagCache.status;
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

    //store cached version
    if(status && Array.isArray(status)){

      //keep last version
      if(this._lagCache && this._lagCache.status){
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
  _runAnalytics(){

    if(!this._analytics){
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
  getAnalytics(){

    if(!this._analytics){
      super.emit("error", new Error("You have not enabled analytics on this consumer instance."));
      return {};
    }

    return this._analytics.getLastResult();
  }

  /**
   * called in interval
   * @private
   */
  _runLagCheck(){
    return this.getLagStatus(true).catch(() => {});
  }

  /**
   * runs a health check and returns object with status and message
   * @returns {Promise.<object>}
   */
  checkHealth(){
    return this._health.check();
  }
}

module.exports = NConsumer;
