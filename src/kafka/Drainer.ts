"use strict";

const Kafka = require("./Kafka.js");
const async = require("async");
const Promise = require("bluebird");

const DEFAULT_DRAIN_INTV = 3000;
const NOOP = () => {};

class Drainer {

  constructor(consumer = null, asyncLimit = 1, autoJsonParsing = true, omitQueue = false, commitOnDrain = false) {

    if (!consumer || !(consumer instanceof Kafka) ||
            !consumer.isConsumer) {
      throw new Error("Consumer is not a valid Sinek Kafka(Consumer)");
    }

    if (omitQueue && commitOnDrain) {
      throw new Error("Cannot run drain commits when queue is omitted. Please either run: " +
                " a manual committer with backpressure OR an auto-commiter without backpressure.");
    }

    this.consumer = consumer;
    this.raw = consumer.consumer;

    this.asyncLimit = asyncLimit;
    this.commitOnDrain = commitOnDrain;
    this.autoJsonParsing = autoJsonParsing;
    this.omitQueue = omitQueue;

    this._drainEvent = null;
    this._q = null;

    this._lastProcessed = Date.now();
    this._lastReceived = Date.now();

    this._totalIncomingMessages = 0;
    this._totalProcessedMessages = 0;

    this._messagesSinceLastDrain = 0;
    this._receivedFirst = false;
    this._drainStart = null;

    this._stats = {};

    this._lastMessageHandlerRef = null;

    this.DRAIN_INTV = DEFAULT_DRAIN_INTV;
  }

  _getLogger() {
    return this.consumer._getLogger();
  }

  /**
     * stops any active drain process
     * closes the consumer and its client
     */
  close() {

    if (this._lastMessageHandlerRef) {
      this.raw.removeListener("message", this._lastMessageHandlerRef);
      this._lastMessageHandlerRef = null;
    } else {
      this._getLogger().warn("message handler ref not present during close, could not remove listener.");
    }

    this._getLogger().info("[Drainer] closed.");
    return this.consumer.close();
  }

  /**
     * returns a few insights
     * @returns {{totalIncoming: number, last: (number|*), isPaused: *}}
     */
  getStats() {
    return {
      totalIncoming: this._totalIncomingMessages,
      lastMessage: this._lastReceived,

      receivedFirstMsg: this._receivedFirst,

      totalProcessed: this._totalProcessedMessages,
      lastProcessed: this._lastProcessed,

      queueSize: this._q ? this._q.length() : null,

      isPaused: this.consumer && this.consumer.isConsumer ? this.isPaused() : null,

      drainStats: this._stats,
      omittingQueue: this.omitQueue
    };
  }

  /**
     * resets all offsets and starts from being
     * also un-pauses consumer if necessary
     * @param topics
     * @returns {Promise.<TResult>}
     */
  resetConsumer() {
    return Promise.reject("resetConsumer has been removed, due to supporting bad kafka consumer behaviour.");
  }

  /**
     * resets all offsets and makes sure the consumer is paused
     * @param topics
     * @returns {Promise.<TResult>}
     */
  resetOffset() {
    return Promise.reject("resetOffset has been removed, due to supporting bad kafka consumer behaviour.");
  }

  /**
     * main reg. function, pass it a function to receive messages
     * under flow control
     * @param drainEvent
     */
  drain(drainEvent = null) {

    if (!drainEvent || typeof drainEvent !== "function") {
      throw new Error("drainEvent must be a valid function");
    }

    if (this._drainEvent) {
      throw new Error("a drain process is currently active.");
    }

    //reset
    this._lastProcessed = Date.now();
    this._lastReceived = Date.now();
    this._stats = {};

    this._messagesSinceLastDrain = this._totalIncomingMessages;
    this._drainEvent = drainEvent;
    this._startToReceiveMessages();

    if (this.isPaused()) {
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
  drainOnce(drainEvent = null, drainThreshold = 10000, timeout = 0) {
    return new Promise((resolve, reject) => {

      if (!drainEvent || typeof drainEvent !== "function") {
        return reject("drainEvent must be a valid function");
      }

      if (this._drainEvent) {
        return reject("a drain process is currently active.");
      }

      if (timeout !== 0 && timeout < this.DRAIN_INTV) {
        return reject(`timeout must be either 0 or > ${this.DRAIN_INTV}.`);
      }

      if (timeout !== 0 && timeout <= drainThreshold) {
        return reject(`timeout ${timeout} must be greater than the drainThreshold ${drainThreshold}.`);
      }

      let t = null;
      let intv = null;

      intv = setInterval(() => {

        const spanProcessed = Date.now() - this._lastProcessed;
        const spanReceived = Date.now() - this._lastReceived;

        this._getLogger().debug("drainOnce interval running, current span-rec: " +
                    `${spanReceived} / span-proc: ${spanProcessed} ms.`);

        //set stats
        this._countStats("intv-cycle");
        this._stats["last-proc-since"] = spanProcessed;
        this._stats["last-rec-since"] = spanReceived;

        //choose the smaller span
        const span = spanProcessed < spanReceived ? spanProcessed : spanReceived;

        if (span >= drainThreshold) {
          this._getLogger().info(`drainOnce span ${span} hit threshold ${drainThreshold}.`);
          clearInterval(intv);
          clearTimeout(t);
          this.stopDrain();
          resolve(this._totalIncomingMessages - this._messagesSinceLastDrain);
        }
      }, this.DRAIN_INTV);

      if (timeout !== 0) {
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
  stopDrain() {

    if (!this._drainEvent) {
      throw new Error("there is no drain active.");
    }

    //reset
    if (this._lastMessageHandlerRef) {
      this.raw.removeListener("message", this._lastMessageHandlerRef);
      this._lastMessageHandlerRef = null;
    } else {
      this._getLogger().warn("message handler ref not present during close, could not remove listener.");
    }

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
  removeTopics(topics = []) {
    return new Promise((resolve, reject) => {
      this._getLogger().info(`deleting topics ${JSON.stringify(topics)}.`);
      this.raw.client.removeTopicMetadata(topics, (err, data) => {

        if (err) {
          return reject(err);
        }

        resolve(data);
      });
    });
  }

  pause() {

    if (!this.isPaused()) {
      this._countStats("paused");
    }

    return this.consumer.pause();
  }

  resume() {

    if (this.isPaused()) {
      this._countStats("resumed");
    }

    return this.consumer.resume();
  }

  isPaused() {
    return this.consumer.isPaused();
  }

  _startToReceiveMessages() {

    if (!this.omitQueue) {
      this._startToReceiveMessagesThroughQueue();
    } else {
      this._startToReceiveMessagesWithoutQueue();
    }
  }

  _startToReceiveMessagesThroughQueue() {

    this._q = async.queue((msg, done) => {
      if (this._drainEvent) {
        setImmediate(() => this._drainEvent(msg, err => {
          this._lastProcessed = Date.now();
          this._totalProcessedMessages++;
          done(err);
        }));
      } else {
        this._getLogger().debug("drainEvent not present, message is dropped.");
      }
    }, this.asyncLimit);

    this._q.drain = () => {

      if (!this.commitOnDrain) {
        return this.resume();
      }

      //commit state first, before resuming
      this._getLogger().debug("committing manually, reason: drain event.");
      this._commit().then(() => {
        this._getLogger().debug("committed successfully, resuming.");
        this.resume();
      }).catch(error => {
        this._getLogger().error("failed to commit offsets, resuming anyway after: " + error);
        this.resume();
      });
    };

    this._q.error(err => {
      if (err) {
        this._countStats("msg-process-fail");
        this._getLogger().warn("error was passed back to consumer queue, dropping it silently: " + JSON.stringify(err));
      }
    });

    this._lastMessageHandlerRef = this._onMessageForQueue.bind(this);
    this.raw.on("message", this._lastMessageHandlerRef);
    this._getLogger().info("[Drainer] started drain process.");
    this._drainStart = Date.now();
  }

  _commit() {
    return this.consumer.commitCurrentOffsets();
  }

  _startToReceiveMessagesWithoutQueue() {

    this._lastMessageHandlerRef = this._onMessageNoQueue.bind(this);
    this.raw.on("message", this._lastMessageHandlerRef);
    this._getLogger().info("[Drainer] started drain process.");
    this._drainStart = Date.now();
  }

  /**
     * with backpressure
     * @param {*} message
     */
  _onMessageForQueue(message) {

    this._getLogger().debug("received kafka message => length: " + (message.value && message.value.length) + ", offset: " +
            message.offset + ", partition: " + message.partition + ", on topic: " + message.topic);

    if (this.autoJsonParsing) {
      try {
        message.value = JSON.parse(message.value);
      } catch (e) {
        this._countStats("msg-parse-fail");
        return this.emit("error", "failed to json parse message value: " + message);
      }

      if (!message.value) {
        this._countStats("msg-empty");
        return this.emit("error", "message value is empty: " + message);
      }
    }

    this._q.push(message);
    //error handling happens directly on the queue object initialisation

    this.pause();

    this._totalIncomingMessages++;
    this._lastReceived = Date.now();

    if (!this._receivedFirst) {
      this._receivedFirst = true;
      this._getLogger().info("consumer received first message.");
      this.emit("first-drain-message", message);
    }
  }

  /**
     * no backpressure
     * @param {*} message
     */
  _onMessageNoQueue(message) {

    this._getLogger().debug("received kafka message => length: " + (message.value && message.value.length) + ", offset: " +
            message.offset + ", partition: " + message.partition + ", on topic: " + message.topic);

    if (this.autoJsonParsing) {
      try {
        message.value = JSON.parse(message.value);
      } catch (e) {
        this._countStats("msg-parse-fail");
        return this.emit("error", "failed to json parse message value: " + message);
      }

      if (!message.value) {
        this._countStats("msg-empty");
        return this.emit("error", "message value is empty: " + message);
      }
    }

    this._totalIncomingMessages++;
    this._lastReceived = Date.now();

    if (this._drainEvent) {
      this._drainEvent(message, NOOP);
      this._lastProcessed = Date.now();
      this._totalProcessedMessages++;
    }

    if (!this._receivedFirst) {
      this._receivedFirst = true;
      this._getLogger().info("consumer received first message.");
      this.emit("first-drain-message", message);
    }
  }

  _countStats(key) {

    if (!this._stats) {
      return;
    }

    if (!this._stats[key]) {
      this._stats[key] = 1;
      return;
    }

    this._stats[key]++;
  }

  /**
     * consumer proxy
     * @param args
     */
  on(...args) {
    this.consumer.on(...args);
  }

  /**
     * consumer proxy
     * @param args
     */
  once(...args) {
    this.consumer.once(...args);
  }

  /**
     * consumer proxy
     * @param args
     */
  removeListener(...args) {
    this.consumer.removeListener(...args);
  }

  /**
     * consumer proxy
     * @param args
     */
  emit(...args) {
    this.consumer.emit(...args);
  }
}

module.exports = Drainer;
