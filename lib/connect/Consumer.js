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

            const { zkConStr, logger, groupId, workerPerPartition, options } = this.config;
            this.kafkaConsumerClient = new Kafka(zkConStr, logger);

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
                    done();
                });
            });

            this.consumer.once("first-drain-message", () => resolve());
        });
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
            this.consumer.close(commit);
            this.consumer = null;
        }
    }
}

module.exports = Consumer;