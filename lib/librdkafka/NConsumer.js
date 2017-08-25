"use strict";

const Promise = require("bluebird");
const EventEmitter = require("events");

//@OPTIONAL
let BlizzKafka = null;

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

    this.topic = topics;
    this.config = config;
    this.consumer = null;
  }

  connect(backpressure = false) {

    if(backpressure){
      return Promise.reject("backpressure is not supported in NConsumer."); //TODO handle
    }

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
        logger.debug(log);
      });

      this.consumer.on("event.error", error => {
        super.emit("error", error);
      });

      this.consumer.on("disconnted", arg => {
        logger.warn("disconnected.");
        //TODO auto-reconnect?
      });
    
      this.consumer.on("ready", arg => {
        logger.info(`native consumer ready v. ${BlizzKafka.librdkafkaVersion}, e. ${BlizzKafka.features.join(", ")}.`);
        resolve();
      });
    
      this.consumer.connect();
    });
  }

  consume(syncEvent = null) {
    return new Promise(resolve => {

      this.consumer.on("data", message => {

        super.emit("message", message);

        if(!syncEvent){
          return;
        }

        syncEvent(message, () => {}); //TODO handle single commits
      });

      const topics = Array.isArray(this.topics) ? this.topics : [this.topics];
      this.consumer.subscribe(topics);
      this.consumer.consume(); //TODO switch mode if single commits should be handled
      console.log("asd");
      //this.consumer.once("first-drain-message", () => resolve()); //TODO
      resolve();
    });
  }

  commit(){
    if(this.consumer){
      this.consumer.commit();
    }
  }

  consumeOnce() {
    return Promise.reject(new Error("consumeOnce is not implemented for nconsumer."));
  }

  pause() {
    //TODO implement
    throw new Error("pause not implemented for nconsumer.");
  }

  resume() {
    //TODO implement
    throw new Error("resume not implemented for nconsumer.");
  }

  getStats() {
    return {}; //TODO get stats
  }

  close() {
    //TODO commit on close
    if (this.consumer) {
      this.consumer.disconnect();
      this.consumer = null;
    }
  }
}

module.exports = NConsumer;
