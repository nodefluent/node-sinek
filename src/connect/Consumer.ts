"use strict";

const Promise = require("bluebird");
const EventEmitter = require("events");

const Kafka = require("./../kafka/Kafka.js");
const Drainer = require("./../kafka/Drainer.js");

class Consumer extends EventEmitter {

  constructor(topic, config = { options: {} }) {
    super();

    this.topic = topic;
    this.config = config;

    this.kafkaConsumerClient = null;
    this.consumer = null;
  }

  connect(backpressure = false) {
    return new Promise(resolve => {

      const { zkConStr, kafkaHost, logger, groupId, workerPerPartition, options } = this.config;

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

      this.kafkaConsumerClient = new Kafka(conStr, logger, conStr === kafkaHost);

      this.kafkaConsumerClient.on("ready", () => resolve());
      this.kafkaConsumerClient.on("error", error => super.emit("error", error));

      this.kafkaConsumerClient.becomeConsumer([this.topic], groupId, options);

      const commitManually = !options.autoCommit;
      this.consumer = new Drainer(this.kafkaConsumerClient, workerPerPartition, false, !backpressure, commitManually);
    });
  }

  consume(syncEvent = null) {
    return new Promise(resolve => {

      this.consumer.drain((message, done) => {

        super.emit("message", message);

        if (!syncEvent) {
          return done();
        }

        syncEvent(message, () => {

          /* ### sync event callback does not handle errors ### */

          done();
        });
      });

      this.consumer.once("first-drain-message", () => resolve());
    });
  }

  consumeOnce(syncEvent = null, drainThreshold = 10000, timeout = 0) {
    return this.consumer.drainOnce((message, done) => {

      super.emit("message", message);

      if (!syncEvent) {
        return done();
      }

      syncEvent(message, () => {

        /* ### sync event callback does not handle errors ### */

        done();
      });

    }, drainThreshold, timeout);
  }

  pause() {

    if (this.consumer) {
      this.consumer.pause();
    }
  }

  resume() {

    if (this.consumer) {
      this.consumer.resume();
    }
  }

  getStats() {
    return this.consumer ? this.consumer.getStats() : {};
  }

  close(commit = false) {

    if (this.consumer) {
      const result = this.consumer.close(commit);
      this.consumer = null;
      return result;
    }
  }
}

module.exports = Consumer;
