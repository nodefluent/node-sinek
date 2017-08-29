"use strict";

const Promise = require("bluebird");
const EventEmitter = require("events");
const debug = require("debug");

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
*/

const SINGLE_CONSUME_GRACE_TIME_MS = 22;
const MESSAGE_CHARSET = "utf8";

const DEFAULT_LOGGER = {
  debug: debug("sinek:nconsumer:debug"),
  info: debug("sinek:nconsumer:info"),
  warn: debug("sinek:nconsumer:warn"),
  error: debug("sinek:nconsumer:error")
};

class NConsumer extends EventEmitter {

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

    this.topics = topics;
    this.config = config;
    this.consumer = null;
    this._resume = true;
    this._inClosing = false;
    this._firstMessageConsumed = false;
    this._totalIncomingMessages = 0;
    this._lastReceived = null;
    this._totalProcessedMessages = 0;
    this._lastProcessed = null;
  }

  connect() {
    return new Promise((resolve, reject) => {

      let { zkConStr, kafkaHost, logger, groupId, options, noptions } = this.config;
      const { autoCommit } = options;

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
        "group.id": typeof groupId === "string" ? groupId : "",
        "enable.auto.commit": typeof autoCommit === "boolean" ? autoCommit : true
      }; //TODO transfer rest of config fields

      noptions = noptions || {};
      noptions = Object.assign({}, config, noptions);
      logger.debug(noptions);
      this.consumer = new BlizzKafka.KafkaConsumer(noptions);

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
        logger.info(`Native consumer ready v. ${BlizzKafka.librdkafkaVersion}, e. ${BlizzKafka.features.join(", ")}.`);
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
   * runs (and calls itself) until it has successfully read a
   * single message from the broker
   */
  _singleConsumeRecursive(){

    if(!this._resume){
      return false;
    }

    this.consumer.consume(1, (error, messages) => {
      if(error || !messages.length){
        error ? super.emit("error", error) : undefined;
        //retry asap
        setTimeout(this._singleConsumeRecursive.bind(this), SINGLE_CONSUME_GRACE_TIME_MS);
      } else {
        //do nothing, await syncEvent callback
      }
      return true;
    });
  }

  _convertMessageValue(_value, asString = true, asJSON = false){

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

  consume(syncEvent = null, asString = true, asJSON = false) {
    return new Promise(resolve => {

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

        //if a sync event is present, we only consume a single message
        //await its callback and commit
        if(!syncEvent){
          return;
        }

        syncEvent(message, () => {
          this.consumer.commitMessage(message); // commit the last consumed message
          this._totalProcessedMessages++;
          this._lastProcessed = Date.now();
          this._singleConsumeRecursive(); //recall
        });
      });

      const topics = Array.isArray(this.topics) ? this.topics : [this.topics];
      this.config.logger.info(`Subscribing to topics: ${topics.join(", ")}.`);
      this.consumer.subscribe(topics);

      if(!syncEvent){
        //if sync event is not present, consume as fast as possible
        this.consumer.consume();
      } else {
        //if sync event is present, we have to keep single messages coming
        this._singleConsumeRecursive();
      }

      //TODO per default, messages must be converted to strings and parsed to json objects
      //but should still be able to consume raw buffers
    });
  }

  /**
   * partition param is optional
   * @param {*} partition
   */
  commit(partition = undefined){
    if(this.consumer){
      return this.consumer.commit(partition);
    }
  }

  consumeOnce() {
    return Promise.reject(new Error("consumeOnce is not implemented for nconsumer."));
  }

  pause() {
    throw new Error("pause not implemented for nconsumer.");
  }

  resume() {
    throw new Error("resume not implemented for nconsumer.");
  }

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
      omittingQueue: true
    };
  }

  _reset(){
    this._firstMessageConsumed = false;
    this._resume = true;
    this._inClosing = false;
    this._totalIncomingMessages = 0;
    this._lastReceived = null;
    this._totalProcessedMessages = 0;
    this._lastProcessed = null;
  }

  close(commit = false) {
    if (this.consumer) {
      this._inClosing = true;
      this._resume = false; //abort any running recursive consumption
      if(!commit){
        this.consumer.disconnect();
        this.consumer = null;
      } else {
        this.consumer.commit();
        this.config.logger.info("Committing on close.");
        process.nextTick(() => {
          this.consumer.disconnect();
          this.consumer = null;
        });
      }
    }
  }
}

module.exports = NConsumer;
