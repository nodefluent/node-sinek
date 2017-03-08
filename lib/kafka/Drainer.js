"use strict";

const Kafka = require("./Kafka.js");
const async = require("async");
const Promise = require("bluebird");

const DRAIN_INTV = 3000;

class Drainer {

    constructor(consumer = null, asyncLimit = 1) {

        if (!consumer || !(consumer instanceof Kafka) ||
            !consumer.isConsumer) {
            throw new Error("consumer is not a valid Sinek Kafka(Consumer)");
        }

        this.consumer = consumer;
        this.raw = consumer.consumer;

        this.asyncLimit = asyncLimit;

        this._drainEvent = null;
        this._q = null;

        this._lastProcessed = Date.now();
        this._totalIncomingMessages = 0;
        this._timeSinceLastDrain = 0;
        this._receivedFirst = false;
        this._drainStart = null;

        this._lastMessageHandlerRef = null;
    }

    _getLogger(){
        return this.consumer._getLogger();
    }

    /**
     * stops any active drain process
     * closes the consumer and its client
     */
    close() {
        this.raw.removeListener("message", this._lastMessageHandlerRef);
        this._getLogger().info("[Drainer] closed.");
        this.consumer.close();
    }

    getProcessingStats() {
        return {
            totalIncoming: this._totalIncomingMessages,
            last: this._lastProcessed,
            isPaused: this.isPaused()
        };
    }

    /**
     * resets all offsets and starts from being
     * also un-pauses consumer if necessary
     * @param topics
     * @returns {Promise.<TResult>}
     */
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
            throw new Error("a drain process is currently active.");
        }

        this._lastProcessed = Date.now(); //reset
        this._timeSinceLastDrain = this._totalIncomingMessages;
        this._drainEvent = drainEvent;
        this._startToReceiveMessages();

        if(this.isPaused()){
            this.resume();
        }
    }

    /**
     * main req. function, pass it a function to receive messages
     * under flow control, until they are stall for a certain amount
     * of time (e.g. when all messages on the queue are consumed)
     * returns a Promise
     * @param drainEvent
     * @param drainThreshold
     * @param timeout
     */
    drainOnce(drainEvent = null, drainThreshold = 10000, timeout = 0){
        return new Promise((resolve, reject) => {

            if(!drainEvent || typeof drainEvent !== "function"){
                return reject("drainEvent must be a valid function");
            }

            if(this._drainEvent){
                return reject("a drain process is currently active.");
            }

            if(timeout !== 0 && timeout < DRAIN_INTV){
                return reject(`timeout must be either 0 or > ${DRAIN_INTV}.`);
            }

            if(timeout !== 0 && timeout <= drainThreshold){
                return reject(`timeout ${timeout} must be greater than the drainThreshold ${drainThreshold}.`);
            }

            let t = null;
            let intv = null;

            intv = setInterval(() => {
                const span = Date.now() - this._lastProcessed;
                this._getLogger().debug(`drainOnce interval running, current span: ${span} ms.`);

                if(span >= drainThreshold){
                    this._getLogger().info(`drainOnce span ${span} hit threshold ${drainThreshold}.`);
                    clearInterval(intv);
                    clearTimeout(t);
                    this.stopDrain();
                    resolve(this._totalIncomingMessages - this._timeSinceLastDrain);
                }
            }, DRAIN_INTV);

            if(timeout !== 0){
                this._getLogger().info(`drainOnce timeout active: ${timeout} ms.`);
                t = setTimeout(() => {
                    this._getLogger().warn(`drainOnce timeout hit after ${timeout} ms.`);
                    clearInterval(intv);
                    this.stopDrain();
                    reject("drainOnce ran into timeout.");
                }, timeout);
            }

            //start the drain process
            this.drain(drainEvent);
        });
    }

    /**
     * stops any active drain process
     */
    stopDrain(){

        if(!this._drainEvent){
            throw new Error("there is no drain active.");
        }

        //reset
        this.raw.removeListener("message", this._lastMessageHandlerRef);
        this._drainEvent = null;
        this._q = null;
        this._receivedFirst = false;

        const duration = (Date.now() - this._drainStart) / 1000;
        this._getLogger().info(`[Drainer] stopped drain process, had been open for ${duration} seconds.`);
    }

    /**
     * removes kafka topics (if broker allows this action)
     * @param topics
     */
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

    _startToReceiveMessages(){

        this._q = async.queue((...args) => {
            if(this._drainEvent){
                setImmediate(() => this._drainEvent(...args));
            } else {
                this._getLogger().debug("drainEvent not present, message is dropped.");
            }
        }, this.asyncLimit);

        this._q.drain = () => {
            this.resume();
        };

        this._lastMessageHandlerRef = this._onMessage.bind(this);
        this.raw.on("message", this._lastMessageHandlerRef);
        this._getLogger().info("[Drainer] started drain process.");
        this._drainStart = Date.now();
    }

    _onMessage(message){

        this._getLogger().debug("received kafka message => length: " + message.value.length + ", offset: " +
            message.offset + ", partition: " + message.partition + ", on topic: " + message.topic);

        try {
            message.value = JSON.parse(message.value);
        } catch(e){
            return this.emit("error", "failed to json parse message value: " + message);
        }

        if(!message.value){
            return this.emit("error", "message value is empty: " + message);
        }

        this._q.push(message, err => {
            if (err) {
                this._getLogger().warn("error was passed back to consumer queue, dropping it silently: " + JSON.stringify(err));
            } else {
                this._getLogger().debug("consumer queue callback returned.");
            }
        });

        this.pause();

        this._totalIncomingMessages += 1;
        this._lastProcessed = Date.now();

        if(!this._receivedFirst){
            this._receivedFirst = true;
            this._getLogger().info("consumer received first message.");
            this.emit("first-drain-message", message.value);
        }
    }

    on(...args) {
        this.consumer.on(...args);
    }

    removeListener(...args){
        this.consumer.removeListener(...args);
    }

    emit(...args){
        this.consumer.emit(...args);
    }
}

module.exports = Drainer;
