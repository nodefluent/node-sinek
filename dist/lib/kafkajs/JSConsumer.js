"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JSConsumer = void 0;
const bluebird_1 = require("bluebird");
const debug_1 = __importDefault(require("debug"));
const kafkajs_1 = require("kafkajs");
const fs_1 = __importDefault(require("fs"));
const events_1 = require("events");
const shared_1 = require("../shared");
const MESSAGE_CHARSET = "utf8";
const DEFAULT_LOGGER = {
    debug: debug_1.default("sinek:jsconsumer:debug"),
    info: debug_1.default("sinek:jsconsumer:info"),
    warn: debug_1.default("sinek:jsconsumer:warn"),
    error: debug_1.default("sinek:jsconsumer:error")
};
const defaultLag = {
    status: [],
    at: 0,
    took: 0,
};
/**
 * wrapper around kafkajs that immitates nconsumer
 * @extends EventEmitter
 */
class JSConsumer extends events_1.EventEmitter {
    /**
     * creates a new consumer instance
     * @param {string|Array} topics - topic or topics to subscribe to
     * @param {object} config - configuration object
     */
    constructor(topics, config) {
        super();
        this.asString = true;
        this.asJSON = false;
        this.asStream = false;
        this._firstMessageConsumed = false;
        this._totalIncomingMessages = 0;
        this._lastReceived = 0;
        this._totalProcessedMessages = 0;
        this._lastProcessed = 0;
        this._isAutoCommitting = false;
        this._batchCount = 0;
        this._batchCommitts = 0;
        this._batchConfig = {};
        this._totalBatches = 0;
        this._lastLagStatus = defaultLag;
        this._lagCache = defaultLag;
        this._analyticsOptions = null;
        this._consumedSinceCommit = 0;
        this._emptyFetches = 0;
        this._avgBatchProcessingTime = 0;
        this._errors = 0;
        this._groupId = "";
        this._inClosing = false;
        if (!config) {
            throw new Error("You are missing a config object.");
        }
        if (!config.logger || typeof config.logger !== "object") {
            config.logger = DEFAULT_LOGGER;
        }
        const { "metadata.broker.list": brokerList, "client.id": clientId, "security.protocol": securityProtocol, "ssl.ca.location": sslCALocation, "ssl.certificate.location": sslCertLocation, "ssl.key.location": sslKeyLocation, "ssl.key.password": sslKeyPassword, "sasl.mechanisms": mechanism, "sasl.username": username, "sasl.password": password, } = config.noptions;
        const brokers = brokerList.split(",");
        if (!brokers || !clientId) {
            throw new Error("You are missing a broker or group configs");
        }
        if (securityProtocol) {
            this.kafkaClient = new kafkajs_1.Kafka({
                brokers,
                clientId,
                ssl: {
                    ca: [fs_1.default.readFileSync(sslCALocation, "utf-8")],
                    cert: fs_1.default.readFileSync(sslCertLocation, "utf-8"),
                    key: fs_1.default.readFileSync(sslKeyLocation, "utf-8"),
                    passphrase: sslKeyPassword,
                },
                sasl: {
                    mechanism: mechanism,
                    username: username,
                    password: password,
                },
            });
        }
        else {
            this.kafkaClient = new kafkajs_1.Kafka({ brokers, clientId });
        }
        this._adminClient = this.kafkaClient.admin();
        this.topics = Array.isArray(topics) ? topics : [topics];
        this.config = config;
        this._health = new shared_1.ConsumerHealth(this, this.config.health);
        this.on("error", () => {
            this._errors++;
        });
        this.on("batch", (messages, { resolveOffset, syncEvent }) => {
            const startBPT = Date.now();
            this._totalIncomingMessages += messages.length;
            this._lastReceived = Date.now();
            const messageOffsets = [];
            const mappedMessages = messages.map((message) => {
                this.config.logger.debug(message);
                message.value = this._convertMessageValue(message.value, this.asString, this.asJSON);
                this.emit("message", message);
                messageOffsets.push(message.offset);
                return message;
            });
            //execute sync event and wrap callback (in this mode the sync event recieves all messages as batch)
            syncEvent(mappedMessages, (__error) => __awaiter(this, void 0, void 0, function* () {
                /* ### sync event callback does not handle errors ### */
                if (__error && this.config && this.config.logger && this.config.logger.warn) {
                    this.config.logger.warn("Please dont pass errors to sinek consume callback", __error);
                }
                this._bumpVariableOfBatch(startBPT, mappedMessages.length);
                try {
                    messageOffsets.forEach((offset) => {
                        resolveOffset(offset);
                    });
                }
                catch (error) {
                    this.emit("error", error);
                }
            }));
        });
    }
    /**
     * connect to broker
     * @param {boolean} asStream - optional, if client should be started in streaming mode
     * @param {object} opts - optional, options asString, asJSON (booleans)
     * @returns {Promise.<*>}
     */
    connect(asStream = false) {
        if (asStream) {
            return bluebird_1.Promise.reject(new Error("JSConsumer does not support streaming mode."));
        }
        const { logger, groupId } = this.config;
        let { noptions, tconf } = this.config;
        const config = {
            "broker.list": null,
            "group.id": typeof groupId === "string" ? groupId : "",
            "enable.auto.commit": false,
        };
        const overwriteConfig = {
            "offset_commit_cb": this._onOffsetCommit.bind(this)
        };
        if (noptions && noptions["offset_commit_cb"]) {
            if (typeof noptions["offset_commit_cb"] !== "function") {
                return bluebird_1.Promise.reject(new Error("offset_commit_cb must be a function."));
            }
            this._extCommitCallback = noptions["offset_commit_cb"];
        }
        noptions = Object.assign({}, config, noptions, overwriteConfig);
        logger.debug(JSON.stringify(noptions));
        this._isAutoCommitting = noptions["enable.auto.commit"] || false;
        tconf = tconf || undefined;
        logger.debug(JSON.stringify(tconf));
        this._groupId = noptions["group.id"];
        if (!this._groupId) {
            return bluebird_1.Promise.reject(new Error("Group need to be configured on noptions['groupId.id']"));
        }
        return this._connectInFlow(logger);
    }
    /**
     * @private
     * event handler for async offset committs
     * @param {Error} error
     * @param {Array} partitions
     */
    _onOffsetCommit(error, partitions) {
        if (this._extCommitCallback) {
            try {
                this._extCommitCallback(error, partitions);
            }
            catch (error) {
                this.emit("error", error);
            }
        }
        if (error) {
            return this.config.logger.warn("commit request failed with an error: " + JSON.stringify(error));
        }
        this.config.logger.debug(JSON.stringify(partitions));
    }
    /**
     * @private
     * connects in flow mode mode
     * @param {object} logger
     * @param {object} noptions
     * @param {object} tconf
     * @returns {Promise.<*>}
     */
    _connectInFlow(logger) {
        return new bluebird_1.Promise((resolve, reject) => {
            this.consumer = this.kafkaClient.consumer({ groupId: this._groupId });
            const { CONNECT, CRASH, DISCONNECT } = this.consumer.events;
            this.consumer.on(CRASH, error => {
                this.emit("error", error);
            });
            this.consumer.on(DISCONNECT, () => {
                if (this._inClosing) {
                    this._reset();
                }
                logger.warn("Disconnected.");
                //auto-reconnect --> handled by consumer.consume();
            });
            this.consumer.on(CONNECT, payload => {
                logger.info(`KafkaJS consumer (flow) ready with group. Info: ${payload}.`);
                this.emit("ready");
            });
            logger.debug("Connecting..");
            try {
                bluebird_1.Promise.all([
                    this.consumer.connect(),
                    this._adminClient.connect(),
                ]).then(resolve);
            }
            catch (error) {
                this.emit("error", error);
                return reject(error);
            }
        });
    }
    /**
     * @private
     * runs (and calls itself) until it has successfully
     * read a certain size of messages from the broker
     * @returns {boolean}
     */
    _consumerRun(syncEvent) {
        if (!this.resume || !this.consumer) {
            return false;
        }
        this.consumer.run({
            eachBatchAutoResolve: false,
            eachBatch: ({ batch, uncommittedOffsets, resolveOffset, heartbeat, isRunning, isStale }) => __awaiter(this, void 0, void 0, function* () {
                const messages = batch.messages;
                if (!isRunning() || isStale() || !messages.length) {
                    //always ensure longer wait on consume error
                    if (!isRunning() || isStale()) {
                        if (this.config && this.config.logger && this.config.logger.debug) {
                            // @todo - not sure where error comes from?
                            // this.config.logger.debug(`Consumed recursively with error ${error.message}`);
                            this.config.logger.debug(`Consumed recursively with error ${messages}`);
                        }
                        this.emit("error", Error);
                    }
                    //retry asap
                    this._emptyFetches++;
                }
                else {
                    if (this.config && this.config.logger && this.config.logger.debug) {
                        this.config.logger.debug(`Consumed recursively with success ${messages.length}`);
                    }
                    this._emptyFetches = 0; //reset
                    yield uncommittedOffsets();
                    this.emit("batch", batch.messages, { resolveOffset, syncEvent });
                }
                yield heartbeat();
            })
        });
    }
    /**
     * @private
     * converts message value according to booleans
     * @param {Buffer} _value
     * @param {boolean} asString
     * @param {boolean} asJSON
     * @returns {Buffer|string|object}
     */
    _convertMessageValue(_value, asString = true, asJSON = false) {
        if (!_value) {
            return _value;
        }
        if (!asString && !asJSON) {
            return _value;
        }
        let value;
        if (asString || asJSON) {
            value = _value.toString(MESSAGE_CHARSET);
        }
        if (asJSON) {
            try {
                value = JSON.parse(value);
            }
            catch (error) {
                this.config.logger.warn(`Failed to parse message value as json: ${error.message}, ${value}`);
            }
        }
        return value;
    }
    _bumpVariableOfBatch(startBPT, batchLength) {
        this._totalProcessedMessages += batchLength;
        this._lastProcessed = Date.now();
        //when all messages from the batch are processed
        this._avgBatchProcessingTime = (this._avgBatchProcessingTime + (Date.now() - startBPT)) / 2;
        this._consumedSinceCommit += batchLength;
        this._totalBatches++;
        this._batchCount++;
        this.config.logger.debug(`committing after ${this._batchCount}, batches, messages: ${this._consumedSinceCommit}`);
        this.emit("commit", this._consumedSinceCommit);
        this._batchCount = 0;
        this._batchCommitts++;
        this._consumedSinceCommit = 0;
    }
    _consumeHandler(syncEvent, { manualBatching }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._isAutoCommitting !== null && typeof this._isAutoCommitting !== "undefined") {
                this.config.logger.warn("enable.auto.commit has no effect in 1:n consume-mode, set to null or undefined to remove this message." +
                    "You can pass 'noBatchCommits' as true via options to .consume(), if you want to commit manually.");
            }
            if (this._isAutoCommitting) {
                throw new Error("Please disable enable.auto.commit when using 1:n consume-mode.");
            }
            if (!manualBatching) {
                this.config.logger.warn("The consumer only allow manual batching for now");
            }
            this.config.logger.info("Batching manually..");
            this._consumerRun(syncEvent);
        });
    }
    /**
     *  subscribe and start to consume, should be called only once after connection is successfull
     *  options object supports the following fields:
     *  batchSize amount of messages that is max. fetched per round
     *  commitEveryNBatch amount of messages that should be processed before committing
     *  concurrency the concurrency of the execution per batch
     *  commitSync if the commit action should be blocking or non-blocking
     *  noBatchCommits defaults to false, if set to true, no commits will be made for batches
     *
     * @param {function} syncEvent - callback (receives messages and callback as params)
     * @param {string} asString - optional, if message value should be decoded to utf8
     * @param {boolean} asJSON - optional, if message value should be json deserialised
     * @param {object} options - optional object containing options for 1:n mode:
     * @returns {Promise.<*>}
     */
    consume(syncEvent = null, asString = true, asJSON = false, options) {
        let { batchSize, commitEveryNBatch, concurrency, commitSync, noBatchCommits, manualBatching, sortedManualBatch, } = options;
        batchSize = batchSize || 1;
        commitEveryNBatch = commitEveryNBatch || 1;
        concurrency = concurrency || 1;
        commitSync = typeof commitSync === "undefined" ? true : commitSync; //default is true
        noBatchCommits = typeof noBatchCommits === "undefined" ? false : noBatchCommits; //default is false
        manualBatching = typeof manualBatching === "undefined" ? true : manualBatching; //default is true
        sortedManualBatch = typeof sortedManualBatch === "undefined" ? false : sortedManualBatch; //default is false
        this._batchConfig = {
            batchSize,
            commitEveryNBatch,
            concurrency,
            commitSync,
            noBatchCommits,
            manualBatching,
            sortedManualBatch
        };
        this.asString = asString;
        this.asJSON = asJSON;
        if (!this.consumer) {
            return bluebird_1.Promise.reject(new Error("You must call and await .connect() before trying to consume messages."));
        }
        if (syncEvent && this.asStream) {
            return bluebird_1.Promise.reject(new Error("Usage of syncEvent is not permitted in streaming mode."));
        }
        if (this.asStream) {
            return bluebird_1.Promise.reject(new Error("Calling .consume() is not required in streaming mode."));
        }
        if (sortedManualBatch && !manualBatching) {
            return bluebird_1.Promise.reject(new Error("manualBatching batch option must be enabled, if you enable sortedManualBatch batch option."));
        }
        if (this.config && this.config.logger) {
            this.config.logger.warn("batchSize is not supported by KafkaJS");
        }
        const topics = this.topics;
        if (topics && topics.length) {
            this.config.logger.info(`Subscribing to topics: ${topics.join(", ")}.`);
            topics.forEach((topic) => __awaiter(this, void 0, void 0, function* () {
                yield this.consumer.subscribe({ topic });
            }));
        }
        else {
            this.config.logger.info("Not subscribing to any topics initially.");
        }
        if (!syncEvent) {
            return this.consumer.run({
                eachMessage: ({ message }) => __awaiter(this, void 0, void 0, function* () {
                    const m = message;
                    this.config.logger.debug(JSON.stringify(message));
                    this._totalIncomingMessages++;
                    this._lastReceived = Date.now();
                    m.value = this._convertMessageValue(message.value, asString, asJSON);
                    if (!this._firstMessageConsumed) {
                        this._firstMessageConsumed = true;
                        this.emit("first-drain-message", m);
                    }
                    this.emit("message", m);
                })
            });
        }
        return this._consumeHandler(syncEvent, {
            manualBatching,
        });
    }
    /**
     * pause the consumer for specific topics (partitions)
     * @param {Array.<{}>} topicPartitions
     * @throws {LibrdKafkaError}
     */
    pause(topicPartitions = []) {
        if (this.consumer) {
            return this.consumer.pause(topicPartitions);
        }
    }
    /**
     * resume the consumer for specific topic (partitions)
     * @param {Array.<{}>} topicPartitions
     * @throws {LibrdKafkaError}
     */
    resume(topicPartitions = []) {
        if (this.consumer) {
            return this.consumer.resume(topicPartitions);
        }
    }
    /**
     * returns consumer statistics
     * @todo -  update type for consumer stats.
     * @returns {object}
     */
    getStats() {
        return {
            totalIncoming: this._totalIncomingMessages,
            lastMessage: this._lastReceived,
            receivedFirstMsg: this._firstMessageConsumed,
            totalProcessed: this._totalProcessedMessages,
            lastProcessed: this._lastProcessed,
            queueSize: null,
            isPaused: false,
            drainStats: null,
            omittingQueue: true,
            autoComitting: this._isAutoCommitting,
            consumedSinceCommit: this._consumedSinceCommit,
            batch: {
                current: this._batchCount,
                committs: this._batchCommitts,
                total: this._totalBatches,
                currentEmptyFetches: this._emptyFetches,
                avgProcessingTime: this._avgBatchProcessingTime,
                config: this._batchConfig,
            },
            lag: this._lagCache,
            totalErrors: this._errors
        };
    }
    /**
     * @private
     * resets internal values
     */
    _reset() {
        this._firstMessageConsumed = false;
        this._inClosing = false;
        this._totalIncomingMessages = 0;
        this._lastReceived = 0;
        this._totalProcessedMessages = 0;
        this._lastProcessed = 0;
        this.asStream = false;
        this._batchCount = 0;
        this._batchCommitts = 0;
        this._totalBatches = 0;
        this._lagCache = defaultLag;
        this._analytics = undefined;
        this._consumedSinceCommit = 0;
        this._emptyFetches = 0;
        this._avgBatchProcessingTime = 0;
        this._errors = 0;
        this._extCommitCallback = undefined;
    }
    /**
     * closes connection if open
     */
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.consumer) {
                this._inClosing = true;
                return bluebird_1.Promise.all([
                    this.consumer.disconnect(),
                    this._adminClient.disconnect(),
                ]);
            }
        });
    }
    /**
     * gets the lowest and highest offset that is available
     * for a given kafka topic
     * @param {string} topic - name of the kafka topic
     * @param {number} partition - optional, default is 0
     * @returns {Promise.<object>}
     */
    getOffsetForTopicPartition(topic, partition = 0) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.consumer) {
                return bluebird_1.Promise.reject(new Error("Consumer not yet connected."));
            }
            if (this.config && this.config.logger && this.config.logger.debug) {
                this.config.logger.debug(`Fetching offsets for topic partition ${topic} ${partition}.`);
            }
            const offsetInfos = yield this._adminClient.fetchOffsets({ groupId: this._groupId, topic });
            return offsetInfos.filter((offsetInfo) => offsetInfo.partition === partition)[0];
        });
    }
    /**
     * gets all comitted offsets
     * @param {number} timeout - optional, default is 2500
     * @returns {Promise.<Array>}
     */
    getComittedOffsets(timeout = 2500) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.consumer) {
                return [];
            }
            if (this.config && this.config.logger && this.config.logger.debug) {
                this.config.logger.debug(`Fetching committed offsets ${timeout}`);
            }
            return [].concat([], yield bluebird_1.Promise.all(this.topics.map((topic) => __awaiter(this, void 0, void 0, function* () {
                const offsets = yield this._adminClient.fetchOffsets({
                    groupId: this._groupId,
                    topic,
                });
                return offsets.map((offsetInfo) => (Object.assign(Object.assign({}, offsetInfo), { topic })));
            }))));
        });
    }
    /**
     * gets all topic-partitions which are assigned to this consumer
     * @returns {Array}
     */
    getAssignedPartitions() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return (yield this.getComittedOffsets());
            }
            catch (error) {
                this.emit("error", error);
                return [];
            }
        });
    }
    /**
     * @static
     * return the offset that has been comitted for a given topic and partition
     * @param {string} topic - topic name
     * @param {number} partition - partition
     * @param {Array} offsets - commit offsets from getComittedOffsets()
     */
    static findPartitionOffset(topic, partition, offsets) {
        for (let i = 0; i < offsets.length; i++) {
            if (offsets[i].topic === topic && offsets[i].partition === partition) {
                return offsets[i].offset;
            }
        }
        throw new Error(`no offset found for ${topic}:${partition} in comitted offsets.`);
    }
    /**
     * compares the local commit offset status with the remote broker
     * status for the topic partitions, for all assigned partitions of
     * the consumer
     * @param {boolean} noCache - when analytics are enabled the results can be taken from cache
     * @returns {Promise.<Array>}
     */
    getLagStatus(noCache = false) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.consumer) {
                return [];
            }
            //if allowed serve from cache
            if (!noCache && this._lagCache && this._lagCache.status) {
                return this._lagCache.status;
            }
            if (this.config && this.config.logger && this.config.logger.debug) {
                this.config.logger.debug(`Getting lag status ${noCache}`);
            }
            const startT = Date.now();
            const assigned = this.getAssignedPartitions();
            const comitted = yield this.getComittedOffsets();
            const status = yield bluebird_1.Promise.all(assigned.map((topicPartition) => __awaiter(this, void 0, void 0, function* () {
                try {
                    const brokerState = yield this.getOffsetForTopicPartition(topicPartition.topic, topicPartition.partition);
                    // const comittedOffset = NConsumer.findPartitionOffset(topicPartition.topic, topicPartition.partition, comitted);
                    // const topicOffset = await (await this._adminClient.fetchTopicOffsets(topicPartition.topic)).pop();
                    // const comittedOffset = topicOffset.offset;
                    return {
                        topic: topicPartition.topic,
                        partition: topicPartition.partition,
                        lowDistance: comitted - brokerState.lowOffset,
                        highDistance: brokerState.highOffset - comitted,
                        detail: {
                            lowOffset: brokerState.lowOffset,
                            highOffset: brokerState.highOffset,
                        }
                    };
                }
                catch (error) {
                    return {
                        topic: topicPartition.topic,
                        partition: topicPartition.partition,
                        error
                    };
                }
            })));
            const duration = Date.now() - startT;
            this.config.logger.info(`fetching and comparing lag status took: ${duration} ms.`);
            //store cached version
            if (status && Array.isArray(status)) {
                //keep last version
                if (this._lagCache && this._lagCache.status) {
                    this._lastLagStatus = Object.assign({}, this._lagCache);
                }
                //cache new version
                this._lagCache = {
                    status,
                    at: startT,
                    took: Date.now() - startT
                };
            }
            return status;
        });
    }
    /**
     * called in interval
     * @private
     */
    _runAnalytics() {
        if (!this._analytics) {
            this._analytics = new shared_1.ConsumerAnalytics(this, this._analyticsOptions, this.config.logger);
        }
        return this._analytics.run()
            .then(res => this.emit("analytics", res))
            .catch(error => this.emit("error", error));
    }
    /**
     * returns the last computed analytics results
     * @throws
     * @returns {object}
     */
    getAnalytics() {
        if (!this._analytics) {
            this.emit("error", new Error("You have not enabled analytics on this consumer instance."));
            return null;
        }
        return this._analytics.getLastResult();
    }
    /**
     * called in interval
     * @private
     */
    _runLagCheck() {
        return this.getLagStatus(true).catch(error => this.emit("error", error));
    }
    /**
     * runs a health check and returns object with status and message
     * @returns {Promise.<object>}
     */
    checkHealth() {
        return this._health.check();
    }
    /**
     * resolve the metadata information for a give topic
     * will create topic if it doesnt exist
     * @param {string} topic - name of the topic to query metadata for
     * @returns {Promise.<Metadata>}
     */
    getTopicMetadata(topic) {
        return new bluebird_1.Promise((resolve, reject) => {
            if (!this.consumer) {
                return reject(new Error("You must call and await .connect() before trying to get metadata."));
            }
            if (this.config && this.config.logger && this.config.logger.debug) {
                this.config.logger.debug(`Fetching topic metadata ${topic}`);
            }
            this._adminClient.fetchTopicMetadata({
                topics: [topic],
            })
                .then((raw) => resolve(new shared_1.Metadata(raw[0])))
                .catch((e) => reject(e));
        });
    }
    /**
     * @alias getTopicMetadata
     * @param {number} timeout - optional, default is 2500
     * @returns {Promise.<Metadata>}
     */
    getMetadata() {
        return this.getTopicMetadata("");
    }
    /**
     * returns a list of available kafka topics on the connected brokers
     */
    getTopicList() {
        return __awaiter(this, void 0, void 0, function* () {
            const metadata = yield this.getMetadata();
            return metadata.asTopicList();
        });
    }
    /**
     * Gets the last lag status
     *
     * @returns {Lag}
     */
    getLastLagStatus() {
        return this._lastLagStatus;
    }
    /**
     * Gets the lag cache
     *
     * @returns {Lag}
     */
    getLagCache() {
        return this._lagCache;
    }
}
exports.JSConsumer = JSConsumer;
//# sourceMappingURL=JSConsumer.js.map