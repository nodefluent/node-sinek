"use strict";

const Kafka = require("./Kafka.js");
const Promise = require("bluebird");

class Publisher {

    constructor(producer = null) {

        if (!producer || !(producer instanceof Kafka) || !producer.isProducer) {
            throw new Error("producer is not a valid Sinek Kafka(Producer)");
        }

        this.producer = producer;
        this.raw = producer.producer;

        this._lastProcessed = Date.now();
        this._totalSentMessages = 0;

        this._paused = false;
    }

    _getLogger() {
        return this.producer._getLogger();
    }

    close() {
        this._getLogger().info("[Publisher] closed.");
        this.producer.close();
    }

    getProcessingStats() {
        return {
            totalPublished: this._totalSentMessages,
            last: this._lastProcessed,
            isPaused: this.isPaused()
        };
    }

    createTopics(topics = ["t"]){
        return new Promise((resolve, reject) => {
            this._getLogger().info(`[Publisher] creating topics ${JSON.stringify(topics)}.`);
            this.raw.createTopics(topics, true, (err, data) => {

                if(err){
                    return reject(err);
                }

                resolve(data);
            });
        });
    }

    send(topic = "t", messages = [], key = false, attributes = 1){
        return this.batch([
            {
                topic,
                messages,
                key,
                attributes
            }
        ]);
    }

    batch(payloads){

        if(this._paused){
            return Promise.resolve({});
        }

        return new Promise((resolve, reject) => {
            this.last = Date.now();
            this.raw.send(payloads, (err, data) => {

                if(err){
                    return reject(err);
                }

                payloads.forEach(p => {
                    this._totalSentMessages += p.messages.length;
                });

                resolve(data);
            });
        });
    }

    pause(){
        this._paused = true;
    }

    resume(){
        this._paused = false;
    }

    isPaused(){
        return this._paused;
    }
}

module.exports = Publisher;