import Kafka from "./Kafka";
import Promise from "bluebird";
import {v3 as murmur} from "murmurhash";
import uuid from "uuid";
import {KeyedMessage} from "kafka-node";

import {CompressionTypes} from "./../tools/index";

const MESSAGE_TYPES = {
    PUBLISH: "-published",
    UNPUBLISH: "-unpublished",
    UPDATE: "-updated"
};

export default class Publisher {
    private raw;
    private _lastProcessed: number;
    private _totalSentMessages: number;
    private _paused: boolean;
    private _buffer;
    private _flushIntv;
    private CompressionTypes;
    private _bufferDisabled: boolean;

    constructor(public producer = null, public partitionCount = 1, private autoFlushBuffer = 0, private flushPeriod = 100) {

        if (!producer || !(producer instanceof Kafka) || !producer.isProducer) {
            throw new Error("producer is not a valid Sinek Kafka(Producer)");
        }

        this.raw = producer.producer;

        this._lastProcessed = Date.now();
        this._totalSentMessages = 0;

        this._paused = false;

        this._buffer = {};
        this._flushIntv = null;

        this.CompressionTypes = CompressionTypes;


        this._bufferDisabled = false;
        this.disableBuffer();
    }

    /**
     * default behaviour
     */
    disableBuffer() {
        this._getLogger().info("[Publisher] buffer disabled.");
        this._stopAutoBufferFlushInterval();
        this._bufferDisabled = true;
    }

    /**
     * BETA
     */
    enableBuffer() {

        this._getLogger().info("[Publisher] buffer enabled.");

        if (this.autoFlushBuffer > 0) {
            this.setAutoFlushBuffer(this.autoFlushBuffer, this.flushPeriod);
        }
    }

    setAutoFlushBuffer(minBufferSize = 0, period = 100) {

        if (typeof minBufferSize !== "number" || minBufferSize < 0) {
            throw new Error("minBufferSize must be a number and higher or equal to 0.");
        }

        if (typeof period !== "number" || period < 5 || period > 60000) {
            throw new Error("period must be a number and > 5 and < 60000.");
        }

        this._getLogger().info(`[Publisher] Adjusting auto flush buffer size: ${minBufferSize} and period: ${period}.`);
        this._runAutoBufferFlushInterval(minBufferSize, period);
    }

    stopAutoFlushBuffer() {
        this._stopAutoBufferFlushInterval();
    }

    _runAutoBufferFlushInterval(minSize, ms) {
        this._flushIntv = setInterval(() => {

            Promise.all(Object
                .keys(this._buffer)
                .filter(k => this._buffer[k].length >= minSize)
                .map(topic => this.flushBuffer(topic)))
                .then(() => {
                    this._getLogger().debug("[Publisher] flushed buffer.");
                }, e => {
                    this._getLogger().error(`[Publisher] failed to flush buffer: ${e}.`);
                });
        }, ms);
    }

    _stopAutoBufferFlushInterval() {

        if (this._flushIntv) {
            this._getLogger().debug("[Publisher] stopping auto-buffer flush interval.");
            clearInterval(this._flushIntv);
        }
    }

    _getLogger() {
        return this.producer._getLogger();
    }

    /**
     * closes the publisher (and the underlying producer/client)
     */
    close() {
        this._getLogger().info("[Publisher] closed.");
        this._stopAutoBufferFlushInterval();
        return this.producer.close();
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
    getPartitionForKey(key, partitionCount = 0) {

        if (typeof key !== "string") {
            return Promise.reject("key must be a valid string");
        }

        if (partitionCount === 0) {
            partitionCount = this.partitionCount;
        }

        // @ts-ignore
        return Promise.resolve(murmur(key) % partitionCount);
    }

    getRandomPartition(partitionCount = 0) {
        return this.getPartitionForKey(uuid.v4(), partitionCount);
    }

    /**
     * create topics (be aware that this requires
     * certain settings in your broker to be active)
     * @param topics
     */
    createTopics(topics = ["t"]) {
        return new Promise((resolve, reject) => {
            this._getLogger().info(`[Publisher] creating topics ${JSON.stringify(topics)}.`);
            this.raw.createTopics(topics, true, (err, data) => {

                if (err) {
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
    static getKafkaBaseMessage() {
        return {
            topic: "",
            messages: [],
            key: null,
            partition: 0,
            attributes: 0
        };
    }

    /**
     * returns a kafka producer payload ready to be sent
     * identifies partition of message by using identifier
     * @param topic
     * @param identifier
     * @param object
     * @param compressionType
     * @param {string | null} partitionKey base string for partition determination
     * @returns {*}
     */
    getKeyedPayload(topic = "t", identifier = "", object = {}, compressionType = 0, partitionKey = null) {

        if (!this.CompressionTypes.isValid(compressionType)) {
            return Promise.reject("compressionType is not valid checkout publisher.CompressionTypes.");
        }

        partitionKey = typeof partitionKey === "string" ? partitionKey : identifier;

        return this.getPartitionForKey(partitionKey).then(partition => {
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
     * @param {string | null} partitionKey base string for partition determination
     * @returns {*}
     */
    bufferPublishMessage(topic, identifier, object, version = 1, compressionType = 0, partitionKey = null) {

        if (typeof identifier !== "string") {
            return Promise.reject("expecting identifier to be of type string.");
        }

        if (typeof object !== "object") {
            return Promise.reject("expecting object to be of type object.");
        }

        if (!object.id) {
            object.id = identifier;
        }

        if (typeof object.version === "undefined") {
            object.version = version;
        }

        return this.appendBuffer(topic, identifier, {
            payload: object,
            key: identifier,
            id: uuid.v4(),
            time: (new Date()).toISOString(),
            type: topic + MESSAGE_TYPES.PUBLISH
        }, compressionType, partitionKey);
    }

    /**
     * easy access to compliant kafka topic api
     * this will create a store a message payload describing a "DELETE" event
     * @param topic
     * @param identifier
     * @param object
     * @param version
     * @param compressionType
     * @param partitionKey
     * @returns {*}
     */
    bufferUnpublishMessage(topic, identifier, object = {}, version = 1, compressionType = 0, partitionKey = null) {

        if (typeof identifier !== "string") {
            return Promise.reject("expecting identifier to be of type string.");
        }

        if (typeof object !== "object") {
            return Promise.reject("expecting object to be of type object.");
        }

        // @ts-ignore
        if (!object.id) {
            // @ts-ignore
            object.id = identifier;
        }

        // @ts-ignore
        if (typeof object.version === "undefined") {
            // @ts-ignore
            object.version = version;
        }

        return this.appendBuffer(topic, identifier, {
            payload: object,
            key: identifier,
            id: uuid.v4(),
            time: (new Date()).toISOString(),
            type: topic + MESSAGE_TYPES.UNPUBLISH
        }, compressionType, partitionKey);
    }

    /**
     * easy access to compliant kafka topic api
     * this will create a store a message payload describing an "UPDATE" event
     * @param topic
     * @param identifier
     * @param object
     * @param version
     * @param compressionType
     * @param partitionKey
     * @returns {*}
     */
    bufferUpdateMessage(topic, identifier, object, version = 1, compressionType = 0, partitionKey = null) {

        if (typeof identifier !== "string") {
            return Promise.reject("expecting identifier to be of type string.");
        }

        if (typeof object !== "object") {
            return Promise.reject("expecting object to be of type object.");
        }

        if (!object.id) {
            object.id = identifier;
        }

        if (typeof object.version === "undefined") {
            object.version = version;
        }

        return this.appendBuffer(topic, identifier, {
            payload: object,
            key: identifier,
            id: uuid.v4(),
            time: (new Date()).toISOString(),
            type: topic + MESSAGE_TYPES.UPDATE
        }, compressionType, partitionKey);
    }

    /**
     * build a buffer per topic for message payloads
     * if autoBufferFlush is > 0 flushBuffer might be called
     * @param topic
     * @param identifier
     * @param object
     * @param compressionType
     * @param {string | null} partitionKey base string for partition determination
     * @returns {Promise.<TResult>}
     */
    appendBuffer(topic, identifier, object, compressionType = 0, partitionKey = null) {

        return this.getKeyedPayload(topic, identifier, object, compressionType, partitionKey).then(payload => {

            //if buffer is disbaled, this message will be send instantly
            if (this._bufferDisabled) {
                return this.batch([payload]);
            }

            if (!this._buffer[topic]) {
                this._buffer[topic] = [];
            }

            this._buffer[topic].push(payload);
        });
    }

    /**
     * send all message payloads in buffer for a topic
     * in a single batch request
     * @param topic
     * @param skipBlock
     * @returns {*}
     */
    flushBuffer(topic) {

        if (!this._buffer[topic]) {
            return Promise.reject(`topic ${topic} has no buffer, you should call appendBuffer() first.`);
        }

        const batch = this._buffer[topic];
        this._buffer[topic] = [];

        return this.batch(batch);
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
    appendAndFlushBuffer(topic, identifier, object, compressionType = 0) {
        return this.appendBuffer(topic, identifier, object, compressionType).then(() => {
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
    send(topic = "t", messages = [], partitionKey = null, partition = null, compressionType = 0) {

        if (!this.CompressionTypes.isValid(compressionType)) {
            return Promise.reject("compressionType is not valid checkout publisher.CompressionTypes.");
        }

        const payload = {
            topic,
            messages,
            attributes: compressionType
        };

        if (partitionKey !== null) {
            // @ts-ignore
            payload.key = partitionKey;
        }

        if (partition !== null) {
            // @ts-ignore
            payload.partition = partition;
        }

        return this.batch([payload]);
    }

    /**
     * leaves full flexibility when sending different message definitions (e.g. mulitple topics)
     * at once use with care: https://www.npmjs.com/package/kafka-node#sendpayloads-cb
     * @param payloads
     * @returns {Promise.<{}>}
     */
    batch(payloads) {

        if (this._paused) {
            return Promise.resolve({});
        }

        return new Promise((resolve, reject) => {
            this.raw.send(payloads, (err, data) => {

                if (err) {
                    return reject(err);
                }

                //update stats
                this._lastProcessed = Date.now();
                payloads.forEach(p => {
                    if (p && p.messages) {
                        if (Array.isArray(p.messages)) {
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

    pause() {
        this._paused = true;
    }

    resume() {
        this._paused = false;
    }

    isPaused() {
        return this._paused;
    }

    refreshMetadata(topics = []) {
        return this.producer.refreshMetadata(topics);
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
    once(...args) {
        this.producer.once(...args);
    }

    /**
     * producer proxy
     * @param args
     */
    removeListener(...args) {
        this.producer.removeListener(...args);
    }

    /**
     * producer proxy
     * @param args
     */
    emit(...args) {
        this.producer.emit(...args);
    }
}
