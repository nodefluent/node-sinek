import { Promise } from 'bluebird';
import Debug from 'debug';
import { EventEmitter } from 'events';
import { v4 as uuidv4} from 'uuid';
import { murmur } from 'murmurhash';
import { murmur2Partitioner } from 'murmur2-partitioner';
import { Kafka, SASLMechanism, Admin, Producer, RecordMetadata, CompressionTypes } from 'kafkajs';
import { Metadata, ProducerAnalytics, ProducerHealth, Check } from '../shared';
import { MessageReturn, JSKafkaProducerConfig } from '../interfaces';
import fs from 'fs';

const MESSAGE_TYPES = {
  PUBLISH: "-published",
  UNPUBLISH: "-unpublished",
  UPDATE: "-updated"
};

const MAX_PART_AGE_MS = 1e3 * 60 * 5; //5 minutes
const MAX_PART_STORE_SIZE = 1e4;
const DEFAULT_MURMURHASH_VERSION = "3";

const DEFAULT_LOGGER = {
  debug: Debug("sinek:jsproducer:debug"),
  info: Debug("sinek:jsproducer:info"),
  warn: Debug("sinek:jsproducer:warn"),
  error: Debug("sinek:jsproducer:error")
};

/**
 * native producer wrapper for node-librdkafka
 * @extends EventEmitter
 */
export class JSProducer extends EventEmitter {

  kafkaClient: Kafka;
  config: JSKafkaProducerConfig;

  paused: boolean = false;
  producer: Producer | undefined;

  private _health: ProducerHealth;
  private _adminClient: Admin;
  private _producerPollIntv: number = 0;
  private _partitionCounts = {};
  private _inClosing: boolean = false;
  private _totalSentMessages: number = 0;
  private _lastProcessed: number = 0;
  private _analyticsOptions: object = {};
  private _analyticsIntv: NodeJS.Timeout | null = null;
  _analytics: ProducerAnalytics | undefined;
  private _murmurHashVersion: string = DEFAULT_MURMURHASH_VERSION;
  private _murmur;
  private _errors: number = 0;
  
  defaultPartitionCount: number = 1;

  /**
   * creates a new producer instance
   * @param {object} config - configuration object
   * @param {*} _ - ignore this param (api compatability)
   * @param {number} defaultPartitionCount  - amount of default partitions for the topics to produce to
   */
  constructor(config: JSKafkaProducerConfig, defaultPartitionCount: number = 1) {
    super();

    if (!config) {
      throw new Error("You are missing a config object.");
    }

    // @ts-ignore
    if (!config.logger || typeof config.logger !== "object") {
      // @ts-ignore
      config.logger = DEFAULT_LOGGER;
    }

    if (!config.options) {
      config.options = {};
    }

    // @ts-ignore
    if (!config.noptions) {
      // @ts-ignore
      config.noptions = {};
    }

    const { 
      "metadata.broker.list": brokerList,
      "client.id": clientId,
      "security.protocol": securityProtocol,
      "ssl.ca.location": sslCALocation,
      "ssl.certificate.location": sslCertLocation,
      "ssl.key.location": sslKeyLocation,
      "ssl.key.password": sslKeyPassword,
      "sasl.mechanisms": mechanism,
      "sasl.username": username,
      "sasl.password": password,
    } = config.noptions;


    const brokers = brokerList.split(",");

    if (!brokers || !clientId) {
      throw new Error("You are missing a broker or group configs");
    }

    if (securityProtocol) {
      this.kafkaClient = new Kafka({
        brokers,
        clientId,
        ssl: {
          ca: [fs.readFileSync(sslCALocation as string, "utf-8")],
          cert: fs.readFileSync(sslCertLocation as string, "utf-8"),
          key: fs.readFileSync(sslKeyLocation as string, "utf-8"),
          passphrase: sslKeyPassword,
        },
        sasl: {
          mechanism: mechanism as SASLMechanism,
          username: username as string,
          password: password as string,
        },
      });
    } else {
      this.kafkaClient = new Kafka({ brokers, clientId });
    }

    this.config = config;
    this._health = new ProducerHealth(this, this.config.health);
    this._adminClient = this.kafkaClient.admin();

    this._murmurHashVersion = this.config.options!.murmurHashVersion || DEFAULT_MURMURHASH_VERSION;
    this.config.logger!.info(`using murmur ${this._murmurHashVersion} partitioner.`);

    this.defaultPartitionCount = defaultPartitionCount;

    switch (this._murmurHashVersion) {
      case "2":
        this._murmur = (key, partitionCount) => murmur2Partitioner.partition(key, partitionCount);
        break;

      case "3":
        this._murmur = (key, partitionCount) => murmur.v3(key) % partitionCount;
        break;

      default:
        throw new Error(`${this._murmurHashVersion} is not a supported murmur hash version. Choose '2' or '3'.`);
    }

    this.on("error", () => this._errors++);
  }

  /**
   * @throws
   * starts analytics tasks
   * @param {object} options - analytic options
   */
  enableAnalytics(options: { analyticsInterval: number } = {analyticsInterval: 1000 * 150}): void {

    if (this._analyticsIntv) {
      throw new Error("analytics intervals are already running.");
    }

    let { analyticsInterval } = options;
    this._analyticsOptions = options;

    analyticsInterval = analyticsInterval || 1000 * 150; // 150 sec

    this._analyticsIntv = setInterval(this._runAnalytics.bind(this), analyticsInterval);
  }

  /**
   * halts all analytics tasks
   */
  haltAnalytics(): void {

    if (this._analyticsIntv) {
      clearInterval(this._analyticsIntv);
    }
  }

  /**
   * connects to the broker
   * @returns {Promise.<*>}
   */
  connect(): Promise<void> {
    return new Promise(async (resolve, reject) => {

      let {
        kafkaHost,
        logger,
        noptions,
        tconf
      } = this.config;

      let conStr: string | null = null;

      if (typeof kafkaHost === "string") {
        conStr = kafkaHost;
      }

      if (conStr === null && !noptions) {
        return reject(new Error("KafkaHost must be defined."));
      }

      const config = {
        "metadata.broker.list": conStr,
        "dr_cb": true
      };

      noptions = noptions;
      noptions = Object.assign({}, config, noptions);
      logger!.debug(JSON.stringify(noptions));

      tconf = tconf ? tconf : {
        "request.required.acks": 1
      };

      logger!.debug(JSON.stringify(tconf));

      this.producer = this.kafkaClient.producer();
      const { CONNECT, DISCONNECT, REQUEST_TIMEOUT } = this.producer.events;

      this.producer.on(REQUEST_TIMEOUT, details => {
        this.emit("error", new Error(`Request Timed out. Info ${JSON.stringify(details)}`));
      });

      /* ### EOF STUFF ### */

      this.producer.on(DISCONNECT, () => {
        if (this._inClosing) {
          this._reset();
        }
        logger!.warn("Disconnected.");
        //auto-reconnect??? -> handled by producer.poll()
      });

      this.producer.on(CONNECT, () => {
        logger!.info(`KafkaJS producer is ready.`);
        this.emit("ready");
      });

      logger!.debug("Connecting..");

      try {

        await Promise.all([
          this.producer.connect(),
          this._adminClient.connect(),
        ]);

      } catch (error) {
        this.emit("error", error);
        return reject(error);
      }

      resolve();
    });
  }

  /**
   * returns a partition for a key
   * @private
   * @param {string} - message key
   * @param {number} - partition count of topic, if 0 defaultPartitionCount is used
   * @returns {string} - deterministic partition value for key
   */
  _getPartitionForKey(key, partitionCount = 1): number {

    if (typeof key !== "string") {
      throw new Error("key must be a string.");
    }

    if (typeof partitionCount !== "number") {
      throw new Error("partitionCount must be number.");
    }

    return this._murmur(key, partitionCount);
  }

  /**
   * @async
   * produces a kafka message to a certain topic
   * @param {string} topicName - name of the topic to produce to
   * @param {object|string|null} message - value object for the message
   * @param {number} _partition - optional partition to produce to
   * @param {string} _key - optional message key
   * @param {string} _partitionKey - optional key to evaluate partition for this message
   * @returns {Promise.<object>}
   */
  async send(
    topicName: string,
    message: object | string | null,
    _partition: number | null = null,
    _key: string | null = null,
    _partitionKey: string | null = null
  ): Promise<MessageReturn> {

    /*
      these are not supported in the HighLevelProducer of node-rdkafka
      _opaqueKey = null,
      _headers = null,
    */

    if (!this.producer) {
      throw new Error("You must call and await .connect() before trying to produce messages.");
    }

    if (this.paused) {
      throw new Error("producer is paused.");
    }

    if (typeof message === "undefined" || !(typeof message === "string" || Buffer.isBuffer(message) || message === null)) {
      throw new Error("message must be a string, an instance of Buffer or null.");
    }

    const key = _key ? _key : uuidv4();
    if (message !== null) {
      message = Buffer.isBuffer(message) ? message : Buffer.from(message);
    }
    console.log('raw string send...', key, message);
    let maxPartitions = 0;
    //find correct max partition count
    if (typeof _partition !== "number") { //manual check to improve performance
      maxPartitions = await this.getPartitionCountOfTopic(topicName);
      if (maxPartitions === -1) {
        console.log(maxPartitions, topicName);
        throw new Error("defaultPartition set to 'auto', but was not able to resolve partition count for topic" +
          topicName + ", please make sure the topic exists before starting the producer in auto mode.");
      }
    } else {
      maxPartitions = this.defaultPartitionCount;
    }

    let partition = 0;
    //find correct partition for this key
    if (maxPartitions >= 2 && typeof _partition !== "number") { //manual check to improve performance
      partition = this._getPartitionForKey(_partitionKey ? _partitionKey : key, maxPartitions);
    }

    //if _partition (manual) is set, it always overwrites a selected partition
    partition = typeof _partition === "number" ? _partition : partition;

    this.config.logger!.debug(JSON.stringify({
      topicName,
      partition,
      key
    }));

    const producedAt = Date.now();

    this._lastProcessed = producedAt;
    this._totalSentMessages++;
    const timestamp = producedAt.toString();
    const acks = this.config && this.config.tconf && this.config.tconf["request.required.acks"] || 1;
    const compression = (this.config.noptions) 
    ? this.config.noptions['compression.codec']
    : CompressionTypes.None

    return new Promise(async (resolve, reject) => {
      this.producer!.send({
        topic: topicName,
        acks,
        compression,
        messages: [{
          key, 
          value: message as string | Buffer | null,
          partition,
          timestamp
        }],
      })
      .then((metadata: RecordMetadata[] ) => {
        resolve({
          key,
          partition,
          offset: metadata[0].offset,
        });
      })
      .catch((error) => {
        reject(error);
      });

    });
  }

  /**
   * @async
   * produces a formatted message to a topic
   * @param {string} topic - topic to produce to
   * @param {string} identifier - identifier of message (is the key)
   * @param {object} payload - object (part of message value)
   * @param {number} partition - optional partition to produce to
   * @param {number} version - optional version of the message value
   * @param {string} partitionKey - optional key to evaluate partition for this message
   * @returns {Promise.<object>}
   */
  async buffer(
    topic: string,
    identifier: string,
    payload: object,
    partition: number | null = null,
    version: number | null = null,
    partitionKey: string | null = null
  ): Promise<MessageReturn> {

    if (typeof identifier === "undefined") {
      identifier = uuidv4();
    }

    if (typeof identifier !== "string") {
      identifier = identifier + "";
    }

    if (typeof payload !== "object") {
      throw new Error("expecting payload to be of type object.");
    }

    //@ts-ignore
    if (typeof payload.id === "undefined") {
      //@ts-ignore
      payload.id = identifier;
    }

    //@ts-ignore
    if (version && typeof payload.version === "undefined") {
      //@ts-ignore
      payload.version = version;
    }

    return await this.send(topic, JSON.stringify(payload), partition, identifier, partitionKey);
  }

  /**
   * @async
   * @private
   * produces a specially formatted message to a topic
   * @param {string} topic - topic to produce to
   * @param {string} identifier - identifier of message (is the key)
   * @param {object} _payload - object message value payload
   * @param {number} version - optional version (default is 1)
   * @param {*} _ -ignoreable, here for api compatibility
   * @param {string} partitionKey - optional key to deterministcally detect partition
   * @param {number} partition - optional partition (overwrites partitionKey)
   * @param {string} messageType - optional messageType (for the formatted message value)
   * @returns {Promise.<object>}
   */
  async _sendBufferFormat(
    topic: string,
    identifier: string,
    _payload: object,
    version: number = 1,
    _: null | number,
    partitionKey: string | null = null,
    partition: number | null = null,
    messageType: string = ""
  ): Promise<MessageReturn> {

    if (typeof identifier === "undefined") {
      identifier = uuidv4();
    }

    if (typeof identifier !== "string") {
      identifier = identifier + "";
    }

    if (typeof _payload !== "object") {
      throw new Error("expecting payload to be of type object.");
    }

    //@ts-ignore
    if (typeof _payload.id === "undefined") {
      //@ts-ignore
      _payload.id = identifier;
    }

    //@ts-ignore
    if (version && typeof _payload.version === "undefined") {
      //@ts-ignore
      _payload.version = version;
    }

    const payload = {
      payload: _payload,
      key: identifier,
      id: uuidv4(),
      time: (new Date()).toISOString(),
      type: topic + messageType
    };

    return await this.send(topic, JSON.stringify(payload), partition, identifier, partitionKey);
  }

  /**
   * an alias for bufferFormatPublish()
   * @alias bufferFormatPublish
   */
  bufferFormat(
    topic: string,
    identifier: string,
    payload: object,
    version: number = 1,
    compressionType: number = 0,
    partitionKey: string | null = null
  ): Promise<MessageReturn> {
    return this.bufferFormatPublish(topic, identifier, payload, version, compressionType, partitionKey);
  }

  /**
   * produces a specially formatted message to a topic, with type "publish"
   * @param {string} topic - topic to produce to
   * @param {string} identifier - identifier of message (is the key)
   * @param {object} _payload - object message value payload
   * @param {number} version - optional version (default is 1)
   * @param {*} _ -ignoreable, here for api compatibility
   * @param {string} partitionKey - optional key to deterministcally detect partition
   * @param {number} partition - optional partition (overwrites partitionKey)
   * @returns {Promise.<object>}
   */
  bufferFormatPublish(
    topic: string,
    identifier: string,
    _payload: object,
    version: number = 1,
    _: null | number,
    partitionKey: string | null = null,
    partition: number | null = null
  ): Promise<MessageReturn> {
    return this._sendBufferFormat(topic, identifier, _payload, version, _, partitionKey, partition, MESSAGE_TYPES.PUBLISH);
  }

  /**
   * produces a specially formatted message to a topic, with type "update"
   * @param {string} topic - topic to produce to
   * @param {string} identifier - identifier of message (is the key)
   * @param {object} _payload - object message value payload
   * @param {number} version - optional version (default is 1)
   * @param {*} _ -ignoreable, here for api compatibility
   * @param {string} partitionKey - optional key to deterministcally detect partition
   * @param {number} partition - optional partition (overwrites partitionKey)
   * @returns {Promise.<object>}
   */
  bufferFormatUpdate(
    topic: string,
    identifier: string,
    _payload: object,
    version: number = 1,
    _: null | number,
    partitionKey: string | null = null,
    partition: number | null = null
  ): Promise<MessageReturn> {
    return this._sendBufferFormat(topic, identifier, _payload, version, _, partitionKey, partition, MESSAGE_TYPES.UPDATE);
  }

  /**
   * produces a specially formatted message to a topic, with type "unpublish"
   * @param {string} topic - topic to produce to
   * @param {string} identifier - identifier of message (is the key)
   * @param {object} _payload - object message value payload
   * @param {number} version - optional version (default is 1)
   * @param {*} _ -ignoreable, here for api compatibility
   * @param {string} partitionKey - optional key to deterministcally detect partition
   * @param {number} partition - optional partition (overwrites partitionKey)
   * @returns {Promise.<object>}
   */
  bufferFormatUnpublish(
    topic: string,
    identifier: string,
    _payload: object,
    version: number = 1,
    _: null | number,
    partitionKey: string | null = null,
    partition: number | null = null
  ): Promise<MessageReturn> {
    return this._sendBufferFormat(topic, identifier, _payload, version, _, partitionKey, partition, MESSAGE_TYPES.UNPUBLISH);
  }

  /**
   * produces a tombstone (null payload with -1 size) message
   * on a key compacted topic/partition this will delete all occurances of the key
   * @param {string} topic - name of the topic
   * @param {string} key - key
   * @param {number|null} _partition - optional partition
   */
  tombstone(
    topic: string,
    key: string,
    _partition: number | null = null
  ): Promise<MessageReturn> {

    if (!key) {
      return Promise.reject(new Error("Tombstone messages only work on a key compacted topic, please provide a key."));
    }

    return this.send(topic, null, _partition, key, null);
  }

  /**
   * pauses production (sends will not be queued)
   */
  pause(): void {
    this.paused = true;
  }

  /**
   * resumes production
   */
  resume(): void {
    this.paused = false;
  }

  /**
   * returns producer statistics
   * * @todo -  update type for producer stats.
   * @returns {object}
   */
  getStats() {
    return {
      totalPublished: this._totalSentMessages,
      last: this._lastProcessed,
      isPaused: this.paused,
      totalErrors: this._errors
    };
  }

  /**
   * @deprecated
   */
  refreshMetadata(): void {
    throw new Error("refreshMetadata not implemented for nproducer.");
  }

  /**
   * resolve the metadata information for a give topic
   * will create topic if it doesnt exist
   * @param {string} topic - name of the topic to query metadata for
   * @param {number} timeout - optional, default is 2500
   * @returns {Promise.<Metadata>}
   */
  getTopicMetadata(topic: string): Promise<Metadata> {
    return new Promise((resolve, reject) => {

      if (!this.producer) {
        return reject(new Error("You must call and await .connect() before trying to get metadata."));
      }

      const topics = (topic === '')
        ? []
        : [topic];

      this._adminClient.fetchTopicMetadata({
        topics,
      }).then((raw) => {
        console.log('topic metadata', raw);
        resolve(new Metadata(raw));
      }).catch((e) => reject(e));
    });
  }

  /**
   * @alias getTopicMetadata
   * @returns {Promise.<Metadata>}
   */
  getMetadata(): Promise<Metadata> {
    return this.getTopicMetadata('');
  }

  /**
   * returns a list of available kafka topics on the connected brokers
   */
  async getTopicList() {
    const metadata: Metadata = await this.getMetadata();
    return metadata.asTopicList();
  }

  /**
   * @async
   * gets the partition count of the topic from the brokers metadata
   * keeps a local cache to speed up future requests
   * resolves to -1 if an error occures
   * @param {string} topic - name of topic
   * @returns {Promise.<number>}
   */
  async getPartitionCountOfTopic(topic): Promise<number> {

    if (!this.producer) {
      throw new Error("You must call and await .connect() before trying to get metadata.");
    }

    //prevent long running leaks..
    if (Object.keys(this._partitionCounts).length > MAX_PART_STORE_SIZE) {
      this._partitionCounts = {};
    }

    const now = Date.now();
    if (!this._partitionCounts[topic] || this._partitionCounts[topic].requested + MAX_PART_AGE_MS < now) {

      let count = -1;
      try {
        const metadata = await this.getMetadata(); //prevent creation of topic, if it does not exist
        console.log(metadata);
        count = metadata.getPartitionCountOfTopic(topic);
      } catch (error) {
        console.log(error);
        this.emit("error", new Error(`Failed to get metadata for topic ${topic}, because: ${error}.`));
        return -1;
      }

      this._partitionCounts[topic] = {
        requested: now,
        count
      };

      return count;
    }

    return this._partitionCounts[topic].count;
  }

  /**
   * gets the local partition count cache
   * @returns {object}
   */
  getStoredPartitionCounts() {
    return this._partitionCounts;
  }

  /**
   * @private
   * resets internal values
   */
  private _reset() {
    this._lastProcessed = 0;
    this._totalSentMessages = 0;
    this.paused = false;
    this._inClosing = false;
    this._partitionCounts = {};
    this._analytics = undefined;
    this._errors = 0;
  }

  /**
   * closes connection if open
   * stops poll interval if open
   */
  async close(): Promise<void> {

    this.haltAnalytics();

    if (this.producer) {
      this._inClosing = true;
      clearInterval(this._producerPollIntv);

      try {
        await Promise.all([
          this.producer.disconnect(),
          this._adminClient.disconnect(),
        ]);
      } catch(error) {
        // Do nothing, silently closing
      }

      //this.producer = null;
    }
  }

  /**
   * called in interval
   * @private
   */
  private _runAnalytics() {

    if (!this._analytics) {
      this._analytics = new ProducerAnalytics(this, this._analyticsOptions || {}, this.config.logger);
    }

    this._analytics.run()
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
      return {};
    }

    return this._analytics.getLastResult();
  }

  /**
   * runs a health check and returns object with status and message
   * @returns {Promise.<Check>}
   */
  checkHealth(): Promise<Check> {
    return this._health.check();
  }

  getLastLagStatus() {

  }

  getLagCache() {

  }

  async getLagStatus() {

  }
}
