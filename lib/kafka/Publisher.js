"use strict";

const Kafka = require("./Kafka.js");
const Promise = require("bluebird");
const murmur = require("murmurhash").v3;
const uuid = require("uuid");
const {KeyedMessage} = require("kafka-node");

const {CompressionTypes} = require("./../tools/index.js");

const MESSAGE_TYPES = {
    PUBLISH: "-published",
    UNPUBLISH: "-unpublished",
    UPDATE: "-updated"
};

class Publisher {

    constructor(producer = null, partitionCount = 1, autoFlushBuffer = 0) {

        if (!producer || !(producer instanceof Kafka) || !producer.isProducer) {
            throw new Error("producer is not a valid Sinek Kafka(Producer)");
        }

        this.producer = producer;
        this.raw = producer.producer;
        this.partitionCount = partitionCount;
        this.autoFlushBuffer = autoFlushBuffer;

        this._lastProcessed = Date.now();
        this._totalSentMessages = 0;

        this._paused = false;

        this._buffer = {};
        this._flushBlock = {};

        this.CompressionTypes = CompressionTypes;
    }

    setAutoFlushBuffer(bufferFlushSize = 0){

        if(typeof bufferFlushSize !== "number" || bufferFlushSize < 0){
            throw new Error("bufferFlushSize must be a number and higher or equal to 0.");
        }

        this._getLogger().info(`[Publisher] Adjusting auto flush buffer size: ${bufferFlushSize}.`);
        this.autoFlushBuffer = bufferFlushSize;
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
            isPaused: this.producer && this.producer.isProducer ? this.isPaused() : null
        };
    }

    /**
     * uses the partition count to identify
     * a partition in range using a hashed representation
     * of the key's string value
     * @param key
     * @param partitionCount
     * @returns {Promise}
     */
    getPartitionForKey(key, partitionCount = 0){

        if(typeof key !== "string"){
            return Promise.reject("key must be a valid string");
        }

        if(partitionCount === 0){
            partitionCount = this.partitionCount;
        }

        return Promise.resolve(murmur(key) % partitionCount);
    }

    getRandomPartition(partitionCount = 0){
        return this.getPartitionForKey(uuid.v4(), partitionCount);
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
     * returns a kafka producer payload ready to be sent
     * identifies partition of message by using identifier
     * @param topic
     * @param identifier
     * @param object
     * @param compressionType
     * @returns {*}
     */
    getKeyedPayload(topic = "t", identifier = "", object = {}, compressionType = 0) {

        if(!this.CompressionTypes.isValid(compressionType)){
            return Promise.reject("compressionType is not valid checkout publisher.CompressionTypes.");
        }

        return this.getPartitionForKey(identifier).then(partition => {
            return {
                topic,
                partition,
                messages: new KeyedMessage(identifier, JSON.stringify(object)),
                attributes: compressionType
            };
        });
    }

    /**
     * easy access to compliant kafka topic api
     * this will create a store a message payload describing a "CREATE" event
     * @param topic
     * @param identifier
     * @param object
     * @param version
     * @param compressionType
     * @returns {*}
     */
    bufferPublishMessage(topic, identifier, object, version = 1, compressionType = 0){

        if(typeof identifier !== "string"){
            return Promise.reject("expecting identifier to be of type string.");
        }

        if(typeof object !== "object"){
            return Promise.reject("expecting object to be of type object.");
        }

        if(!object.id){
            object.id = identifier;
        }

        if(typeof object.version === "undefined"){
            object.version = version;
        }

        return this.appendBuffer(topic, identifier, {
            payload: object,
            key: identifier,
            id: uuid.v4(),
            time: (new Date()).toISOString(),
            type: topic + MESSAGE_TYPES.PUBLISH
        }, compressionType);
    }

    /**
     * easy access to compliant kafka topic api
     * this will create a store a message payload describing a "DELETE" event
     * @param topic
     * @param identifier
     * @param object
     * @param version
     * @param compressionType
     * @returns {*}
     */
    bufferUnpublishMessage(topic, identifier, object = {}, version = 1, compressionType = 0){

        if(typeof identifier !== "string"){
            return Promise.reject("expecting identifier to be of type string.");
        }

        if(typeof object !== "object"){
            return Promise.reject("expecting object to be of type object.");
        }

        if(!object.id){
            object.id = identifier;
        }

        if(typeof object.version === "undefined"){
            object.version = version;
        }

        return this.appendBuffer(topic, identifier, {
            payload: object,
            key: identifier,
            id: uuid.v4(),
            time: (new Date()).toISOString(),
            type: topic + MESSAGE_TYPES.UNPUBLISH
        }, compressionType);
    }

    /**
     * easy access to compliant kafka topic api
     * this will create a store a message payload describing an "UPDATE" event
     * @param topic
     * @param identifier
     * @param object
     * @param version
     * @param compressionType
     * @returns {*}
     */
    bufferUpdateMessage(topic, identifier, object, version = 1, compressionType = 0){

        if(typeof identifier !== "string"){
            return Promise.reject("expecting identifier to be of type string.");
        }

        if(typeof object !== "object"){
            return Promise.reject("expecting object to be of type object.");
        }

        if(!object.id){
            object.id = identifier;
        }

        if(typeof object.version === "undefined"){
            object.version = version;
        }

        return this.appendBuffer(topic, identifier, {
            payload: object,
            key: identifier,
            id: uuid.v4(),
            time: (new Date()).toISOString(),
            type: topic + MESSAGE_TYPES.UPDATE
        }, compressionType);
    }

    /**
     * build a buffer per topic for message payloads
     * if autoBufferFlush is > 0 flushBuffer might be called
     * @param topic
     * @param identifier
     * @param object
     * @param compressionType
     * @returns {Promise.<TResult>}
     */
    appendBuffer(topic, identifier, object, compressionType = 0){

        let flushBuffer = false;
        if(this.autoFlushBuffer > 0 && this._buffer[topic] &&
            this._buffer[topic].length >= this.autoFlushBuffer){
            this._getLogger().debug(`[Publisher] ${topic}'s buffer exceeds auto-flush value: ${this.autoFlushBuffer}.`);
            flushBuffer = true;
            this._flushBlock[topic] = true;
        }

        return this.getKeyedPayload(topic, identifier, object, compressionType).then(payload => {

            if(!this._buffer[topic]){
                this._buffer[topic] = [];
            }

            this._buffer[topic].push(payload);

            if(!flushBuffer){
                return 1;
            }

            //buffer should be flushed according to configured autoBufferFlush size
            return this.flushBuffer(topic, true);

        }, e => {
            //remove block in case of error
            this._getLogger().error(e);
            if(flushBuffer){
                delete this._flushBlock[topic];
            }
        });
    }

    /**
     * send all message payloads in buffer for a topic
     * in a single batch request
     * @param topic
     * @param skipBlock
     * @returns {*}
     */
    flushBuffer(topic, skipBlock = false){

        if(!skipBlock && this._flushBlock[topic]){
            return Promise.reject(`buffer for topic ${topic} is currently blocked.`);
        }

        if(!this._buffer[topic]){
            return Promise.reject(`topic ${topic} has no buffer, you should call appendBuffer() first.`);
        }

        return this.batch(this._buffer[topic]).then(res => {
            delete this._buffer[topic];

            //remove block, if it was active
            if(skipBlock && this._flushBlock[topic]){
                delete this._flushBlock[topic];
            }

            return res;
        });
    }

    /**
     * appends and sends the message payloads in the buffer
     * (you can also use this so send a single message immediately)
     * @param topic
     * @param identifier
     * @param object
     * @param compressionType
     * @returns {Promise.<TResult>}
     */
    appendAndFlushBuffer(topic, identifier, object, compressionType = 0){
        return this.appendBuffer(topic, identifier, object, compressionType).then(_ => {
            return this.flushBuffer(topic);
        });
    }

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
            this.raw.send(payloads, (err, data) => {

                if(err){
                    return reject(err);
                }

                //update stats
                this._lastProcessed = Date.now();
                payloads.forEach(p => {
                    if(p && p.messages){
                        if(Array.isArray(p.messages)){
                            this._totalSentMessages += p.messages.length;
                        } else {
                            this._totalSentMessages++;
                        }
                    }
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
