"use strict";

const Kafka = require("./Kafka.js");
const async = require("async");
const Promise = require("bluebird");

class Drainer {

    constructor(consumer = null, asyncLimit = 1, queueEase = 3) {

        if (!consumer || !(consumer instanceof Kafka) ||
            !consumer.isConsumer) {
            throw new Error("consumer is not a valid Sinek Kafka(Consumer)");
        }

        this.consumer = consumer;
        this.raw = consumer.consumer;

        this.asyncLimit = asyncLimit;
        this.queueEase = queueEase;

        this._drainEvent = null;
        this._q = null;

        this._lastProcessed = Date.now();
        this._totalIncomingMessages = 0;
        this._totalProcessedMessages = 0;
    }

    _getLogger(){
        return this.consumer._getLogger();
    }

    close() {
        this.consumer.removeListener("message", this._onMessage);
        this._getLogger().info("[Drainer] closed.");
        this.consumer.close();
    }

    getProcessingStats() {
        return {
            totalIncoming: this._totalIncomingMessages,
            totalProcessed: this._totalProcessedMessages,
            last: this._lastProcessed,
            isPaused: this.isPaused()
        };
    }

    resetConsumer(topics) {

        let pauseConsumer = false;
        if (this.isPaused()) {
            pauseConsumer = true;
            this.resume();
        }

        return Promise.all(topics.map(t => this.consumer.hardOffsetReset(t)))
            .then(() => {
                if (pauseConsumer) {
                    this.pause();
                }
            });
    }

    /**
     * main reg. function, pass it a function to receive messages
     * under flow control
     * @param drainEvent
     */
    drain(drainEvent = null) {

        if(!drainEvent || typeof drainEvent !== "function"){
            throw new Error("drainEvent must be a valid function");
        }

        if(this._drainEvent){
            throw new Error("drain was already called on this instance");
        }
        this._drainEvent = drainEvent;

        this._startToReceiveMessages();
    }

    removeTopics(topics = []){
        return new Promise((resolve, reject) => {
            this._getLogger().info(`deleting topics ${JSON.stringify(topics)}.`);
            this.raw.client.removeTopicMetadata(topics, (err, data) => {

                if(err){
                    return reject(err);
                }

                resolve(data);
            });
        });
    }

    pause(){
        return this.consumer.pause();
    }

    resume(){
        return this.consumer.resume();
    }

    isPaused(){
        return this.consumer.isPaused();
    }

    /**
     * main req. function, pass it a function to receive messages
     * under flow control, until they are stall for a certain amount
     * of time (e.g. when all messages on the queue are consumed)
     */
    drainOnce(drainEvent = null, callbackEvent = null){
        throw new Error("not implemented yet.");
    }

    _onMessage(message) {

        this.pause();

        this._totalIncomingMessages += 1;
        this._lastProcessed = Date.now();

        //only pushing message value here
        this._q.push(message.value, err => {
            if (err) {
                this._getLogger().warn("error was passed back to consumer queue, dropping it silently: " + JSON.stringify(err));
            } else {
                this._getLogger().debug("consumer queue callback returned.");
            }
        });
    }

    _startToReceiveMessages(){

        this._q = async.queue((...args) => {
            setTimeout(() => {
                this._drainEvent(...args);
                this._totalProcessedMessages++;
            }, this.queueEase);
        }, this.asyncLimit);

        this._q.drain = () => {
            this.resume();
        };

        this.consumer.on("message", this._onMessage.bind(this));
        this._getLogger().info("[Drainer] ready to receive messages.");
    }

}

module.exports = Drainer;
