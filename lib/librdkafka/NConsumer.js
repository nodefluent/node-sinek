"use strict";

const Promise = require("bluebird");
const EventEmitter = require("events");

//@OPTIONAL
let BlizzKafka = null;

/*
  BREAKING CHANGES (compared to connect/Consumer):
  - there is an optional options object for the config named: noptions
  - pause and resume have been removed
*/

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

    this.topics = topics;
    this.config = config;
    this.consumer = null;
    this._firstMessageConsumed = false;
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
        throw new Error("One of the following: zkConStr or kafkaHost must be defined.");
      }

      if(conStr === zkConStr){
        return reject(new Error("NProducer does not support zookeeper connection."));
      }

      const config = {
        "metadata.broker.list": conStr,
        "group.id": groupId,
        "enable.auto.commit": autoCommit
      };
      noptions = noptions || {};
      this.consumer = new BlizzKafka.KafkaConsumer(Object.assign({}, config, noptions));

      this.consumer.on("event.log", log => {
        logger.debug(log.message);
      });

      this.consumer.on("event.error", error => {
        super.emit("error", error);
      });

      this.consumer.on("error", error => {
        super.emit("error", error);
      });

      this.consumer.on("disconnted", () => {
        logger.warn("disconnected.");
        //TODO auto-reconnect?
      });

      this.consumer.on("ready", () => {
        logger.info(`native consumer ready v. ${BlizzKafka.librdkafkaVersion}, e. ${BlizzKafka.features.join(", ")}.`);
        resolve();
      });

      this.consumer.connect();
    });
  }

  consume(syncEvent = null) {
    return new Promise(resolve => {

      this.consumer.on("data", message => {

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
          this.consumer.consume(1); //only consume 1 message
        });
      });

      const topics = Array.isArray(this.topics) ? this.topics : [this.topics];
      this.config.logger.info(`subscribing to topics: ${topics.join(", ")}.`);
      this.consumer.subscribe(topics);

      if(!syncEvent){
        //if sync event is not present, consume as fast as possible
        this.consumer.consume();
        return;
      }

      //if sync event is present, we have to keep the messages coming
      //TODO

      //TODO per default, messages must be converted to strings and parsed to json objects
      //but should still be able to consume raw buffers

      /*
      setInterval(() => {
        this.consumer.consume(1, function(){
          console.log(arguments);
        });
      }, 500);`*/
      //TODO switch mode if single commits should be handled

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
    return {}; //TODO get stats
  }

  _reset(){
    this._firstMessageConsumed = false;
  }

  close(commit = false) {
    if (this.consumer) {
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
      this._reset();
    }
  }
}

module.exports = NConsumer;
