"use strict";

const Kafka = require("./Kafka.js");
const Promise = require("bluebird");

const PartitionQueue = require("./PartitionQueue.js");

const DEFAULT_DRAIN_INTV = 3000;

class PartitionDrainer {

  constructor(consumer = null, asyncLimit = 1, commitOnDrain = false, autoJsonParsing = true) {

    if (!consumer || !(consumer instanceof Kafka) ||
            !consumer.isConsumer) {
      throw new Error("consumer is not a valid Sinek Kafka(Consumer)");
    }

    this.consumer = consumer;
    this.raw = consumer.consumer;

    this.asyncLimit = asyncLimit;
    this.commitOnDrain = commitOnDrain;
    this.autoJsonParsing = autoJsonParsing;

    this._queueMap = null;
    this._drainMap = {};

    this._totalIncomingMessages = 0;
    this._incomingSinceLastDrain = 0;

    this._lastReceived = Date.now();
    this._receivedFirst = false;
    this._drainStart = null;

    this._lastMessageHandlerRef = null;

    this._stats = {};

    this.DRAIN_INTV = DEFAULT_DRAIN_INTV;

    this._drainTargetTopic = null;
    this.disablePauseResume = false;
  }

  _getLogger(){
    return this.consumer._getLogger();
  }

  /**
     * gets all partitions of the given topic
     * and builds a map of async.queues (PartionQueue)
     * with a single queue for each partition
     * they will all call the same queue-drain callback to control the message flow
     * and they will all call the same drain-event callback to process messages
     * queues also expose their own stats
     * @param topic
     * @param drainEvent
     * @param asyncLimit
     * @returns {*}
     * @private
     */
  _buildOffsetMap(topic, drainEvent, asyncLimit = 1){

    if(typeof topic !== "string"){
      return Promise.reject("offset map can only be build for a single topic.");
    }

    if(typeof drainEvent !== "function"){
      return Promise.reject("drainEvent must be a valid function.");
    }

    if(this.consumer.getTopics().indexOf(topic) === -1){
      return Promise.reject(topic + " is not a supported topic, it has to be set during becomeConsumer().");
    }

    return this.consumer.getPartitions(topic).then(partitions => {

      if(!partitions || partitions.length <= 0){
        return Promise.reject(`partitions request for topic ${topic} returned empty.`);
      }

      const queueMap = {};
      const drainMap = {};

      partitions.forEach(partition => {
        //build a parition queue for each partition
        queueMap[partition] = new PartitionQueue(partition, drainEvent, this, asyncLimit,
          this._onPartitionQueueDrain.bind(this)).build();
      });

      partitions.forEach(partition => {
        //drain map is build to check if all queues have been drained
        drainMap[partition] = false;
      });

      return {
        queueMap,
        drainMap
      };
    });
  }

  /**
     * partiton queue drain callback that makes sure to resume the consumer if
     * all queues have drained
     * @param partition
     * @param offset
     * @private
     */
  _onPartitionQueueDrain(partition){

    if(typeof this._drainMap[partition] === "undefined"){
      this._getLogger().warn(`partition queue drain called but ${partition} is not a present key.`);
      return;
    }

    this._drainMap[partition] = true;

    //this queue drained, lets commit the latest offset
    if(this.commitOnDrain && (this.consumer._isManual || !this.consumer._autoCommitEnabled)){

      if(this.consumer._autoCommitEnabled){
        throw new Error("you have started a consumer with auto commit enabled, but requested partition drainer" +
                    "to run commits manually for you - both cannot work at the same time.");
      }

      //running setConsumerOffset while commit manually is a bad idea
      //message offset is already hold in the client, only committing is needed
      //this.consumer.setConsumerOffset(this._drainTargetTopic, partition, offset);
    }

    if(Object.keys(this._drainMap).map(key => this._drainMap[key]).filter(v => !v).length){
      this._getLogger().debug("not all partition queues have drained yet.");
    } else {
      this._getLogger().debug("all partition queues have drained.");

      // reset drain map
      Object.keys(this._drainMap).forEach(key => {
        this._drainMap[key] = false;
      });

      if(!this.commitOnDrain){
        if(!this.disablePauseResume){
          this.resume();
        }
        return; //do not execute commit logic^
      }

      //resume consumer, which will cause new message to be pushed into the queues
      //but make sure to commit current offsets first
      this.consumer.commitCurrentOffsets().then(() => {
        if(!this.disablePauseResume){
          this.resume();
        }
      }).catch(e => {
        this._getLogger().error(`failed to commit offsets after all partitions have been drained. ${e}.`);
        if(!this.disablePauseResume){
          this.resume();
        }
      });
    }
  }

  _resetQueueMaps(){

    this._getLogger().info("resetting queue maps.");

    if(this._queueMap){
      Object.keys(this._queueMap).forEach(key => {
        this._queueMap[key].close();
      });
      this._queueMap = null;
      this._drainMap = {};
    }
  }

  /**
     * stops any active drain process
     * closes the consumer and its client
     */
  close() {

    if(this._lastMessageHandlerRef){
      this.raw.removeListener("message", this._lastMessageHandlerRef);
      this._lastMessageHandlerRef = null;
    } else {
      this._getLogger().warn("message handler ref not present during close, could not remove listener.");
    }

    this._resetQueueMaps();

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

      isPaused: this.consumer && this.consumer.isConsumer ? this.isPaused() : null,

      drainStats: this._stats,
      partitions: this._queueMap ? Object.keys(this._queueMap).length : null,
      queues: this._queueMap ? Object.keys(this._queueMap).map(key => this._queueMap[key].getStats()) : null
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
  resetOffset(){
    return Promise.reject("resetOffset has been removed, due to supporting bad kafka consumer behaviour.");
  }

  /**
     * main reg. function, pass it a function to receive messages
     * under flow control, returns a promise
     * @param topic
     * @param drainEvent
     */
  drain(topic = "t", drainEvent = null) {

    this._drainTargetTopic = topic;

    if(!drainEvent || typeof drainEvent !== "function"){
      throw new Error("drainEvent must be a valid function");
    }

    if(this._drainEvent){
      throw new Error("a drain process is currently active.");
    }

    this._incomingSinceLastDrain = this._totalIncomingMessages;
    this._drainEvent = drainEvent;
    this._lastReceived = Date.now();
    this._stats = {};

    return this._buildOffsetMap(topic, drainEvent, this.asyncLimit).then(maps => {

      this._queueMap = maps.queueMap;
      this._drainMap = maps.drainMap;

      this._startToReceiveMessages();

      if(this.isPaused()){
        this.resume();
      }
    });
  }

  _getEarliestProcessedOnQueues(){

    //error prevention
    if(!this._queueMap){
      return this._lastReceived;
    }

    let earliest = this._queueMap[Object.keys(this._queueMap)[0]].getLastProcessed();
    let ne = null;
    Object.keys(this._queueMap).forEach(key => {
      ne = this._queueMap[key].getLastProcessed();
      if(ne < earliest){
        earliest = ne;
      }
    });

    return earliest;
  }

  /**
     * main req. function, pass it a function to receive messages
     * under flow control, until they are stall for a certain amount
     * of time (e.g. when all messages on the queue are consumed)
     * returns a Promise
     * @param topic
     * @param drainEvent
     * @param drainThreshold
     * @param timeout
     */
  drainOnce(topic = "t", drainEvent = null, drainThreshold = 10000, timeout = 0){
    return new Promise((resolve, reject) => {

      if(!drainEvent || typeof drainEvent !== "function"){
        return reject("drainEvent must be a valid function");
      }

      if(this._drainEvent){
        return reject("a drain process is currently active.");
      }

      if(timeout !== 0 && timeout < this.DRAIN_INTV){
        return reject(`timeout must be either 0 or > ${this.DRAIN_INTV}.`);
      }

      if(timeout !== 0 && timeout <= drainThreshold){
        return reject(`timeout ${timeout} must be greater than the drainThreshold ${drainThreshold}.`);
      }

      let t = null;
      let intv = null;

      intv = setInterval(() => {

        const spanProcessed = Date.now() - this._getEarliestProcessedOnQueues();
        const spanReceived = Date.now() - this._lastReceived;

        this._getLogger().debug("drainOnce interval running, current span-rec: " +
                    `${spanReceived} / span-proc: ${spanProcessed} ms.`);

        //set stats
        this._countStats("intv-cycle");
        this._stats["last-proc-since"] = spanProcessed;
        this._stats["last-rec-since"] = spanReceived;

        //choose the smaller span
        const span = spanProcessed < spanReceived ? spanProcessed : spanReceived;

        if(span >= drainThreshold){
          this._getLogger().info(`drainOnce span ${span} hit threshold ${drainThreshold}.`);
          clearInterval(intv);
          clearTimeout(t);
          this.stopDrain();
          resolve(this._totalIncomingMessages - this._incomingSinceLastDrain);
        }
      }, this.DRAIN_INTV);

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
      this.drain(topic, drainEvent).then(() => {
        this._getLogger().info("drain process of drainOnce has started.");
      }).catch(e => {
        reject(`failed to start drain process of drainOnce, because: ${e}.`);
      });
    });
  }

  /**
     * stops any active drain process
     */
  stopDrain(){

    if(!this._drainEvent){
      throw new Error("there is no drain active.");
    }

    this._drainTargetTopic = null;

    //reset
    if(this._lastMessageHandlerRef){
      this.raw.removeListener("message", this._lastMessageHandlerRef);
      this._lastMessageHandlerRef = null;
    } else {
      this._getLogger().warn("message handler ref not present during close, could not remove listener.");
    }

    this._drainEvent = null;
    this._receivedFirst = false;

    this._resetQueueMaps();

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

    if(!this.isPaused()){
      this._countStats("paused");
    }

    return this.consumer.pause();
  }

  resume(){

    if(this.isPaused()){
      this._countStats("resumed");
    }

    return this.consumer.resume();
  }

  isPaused(){
    return this.consumer.isPaused();
  }

  _startToReceiveMessages(){
    this._lastMessageHandlerRef = this._onMessage.bind(this);
    this.raw.on("message", this._lastMessageHandlerRef);
    this._getLogger().info("[Drainer] started drain process.");
    this._drainStart = Date.now();
  }

  _onMessage(message){

    this._getLogger().debug("received kafka message => length: " + message.value.length + ", offset: " +
            message.offset + ", partition: " + message.partition + ", on topic: " + message.topic);

    if(this.autoJsonParsing){
      try {
        message.value = JSON.parse(message.value);
      } catch(e){
        this._countStats("msg-parse-fail");
        return this.emit("error", "failed to json parse message value: " + message);
      }

      if(!message.value){
        this._countStats("msg-empty");
        return this.emit("error", "message value is empty: " + message);
      }
    }

    //we only want to drain messages that belong to our topic
    if(message.topic === this._drainTargetTopic) {

      //identify queue for this topic
      if (!this._queueMap) {
        this._countStats("queue-map-missing");
        this._getLogger().warn("received message, but queue map is missing.");
      } else if (!this._queueMap[message.partition]) {
        this._countStats("queue-partition-missing");
        this._getLogger().warn("received message, but queue partition is missing for partition: " + message.partition);
      } else {
        //and push message into queue
        this._queueMap[message.partition].push(message);
      }
    } else {
      this._getLogger().warn(`receiving messages from other topic ${message.topic} only expecting to receive from ${this._drainTargetTopic} for this instance.`);
    }

    if(!this.disablePauseResume){
      this.pause();
    }

    this._totalIncomingMessages++;
    this._lastReceived = Date.now();

    if(!this._receivedFirst){
      this._receivedFirst = true;
      this._getLogger().info("consumer received first message.");
      this.emit("first-drain-message", message);
    }
  }

  _countStats(key){

    if(!this._stats){
      return;
    }

    if(!this._stats[key]){
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
  removeListener(...args){
    this.consumer.removeListener(...args);
  }

  /**
     * consumer proxy
     * @param args
     */
  emit(...args){
    this.consumer.emit(...args);
  }
}

module.exports = PartitionDrainer;
