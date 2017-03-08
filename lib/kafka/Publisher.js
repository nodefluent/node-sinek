"use strict";

const Kafka = require("./Kafka.js");
const Promise = require("bluebird");

const {CompressionTypes} = require("./../tools/index.js");

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

        this.CompressionTypes = CompressionTypes;
    }

    _getLogger() {
        return this.producer._getLogger();
    }

    /**
     * closes the publisher (and the underlying producer/client)
     */
    close() {
        this._getLogger().info("[Publisher] closed.");
        this.producer.close();
    }

    /**
     * returns a few insights
     * @returns {{totalPublished: (number|*), last: (number|*), isPaused: *}}
     */
    getStats() {
        return {
            totalPublished: this._totalSentMessages,
            last: this._lastProcessed,
            isPaused: this.isPaused()
        };
    }

    /**
     * create topics (be aware that this requires
     * certain settings in your broker to be active)
     * @param topics
     */
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

    /**
     * returns a default message type object
     * @returns {{topic: string, messages: Array, key: null, partition: number, attributes: number}}
     */
    static getKafkaBaseMessage(){
        return {
            topic: "",
            messages: [],
            key: null,
            partition: 0,
            attributes: 0
        };
    };

    /**
     * most versatile function to produce a message on a topic(s)
     * you can send multiple messages at once (but keep them to the same topic!)
     * if you need full flexibility on payload (message definition) basis
     * you should use .batch([])
     * @param topic
     * @param messages
     * @param partitionKey
     * @param partition
     * @param compressionType
     * @returns {*}
     */
    send(topic = "t", messages = [], partitionKey = null, partition = null, compressionType = 0){

        if(!this.CompressionTypes.isValid(compressionType)){
            return Promise.reject("compressionType is not valid checkout publisher.CompressionTypes.");
        }

        const payload = {
            topic,
            messages,
            attributes: compressionType
        };

        if(partitionKey !== null){
            payload.key = partitionKey;
        }

        if(partition !== null){
            payload.partition = partition;
        }

        return this.batch([ payload ]);
    }

    /**
     * leaves full flexibility when sending different message definitions (e.g. mulitple topics)
     * at once use with care: https://www.npmjs.com/package/kafka-node#sendpayloads-cb
     * @param payloads
     * @returns {Promise.<{}>}
     */
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

    /**
     * producer proxy
     * @param args
     */
    on(...args) {
        this.producer.on(...args);
    }

    /**
     * producer proxy
     * @param args
     */
    removeListener(...args){
        this.producer.removeListener(...args);
    }

    /**
     * producer proxy
     * @param args
     */
    emit(...args){
        this.producer.emit(...args);
    }
}

module.exports = Publisher;