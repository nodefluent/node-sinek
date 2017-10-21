"use strict";

const INTERESTING_DISTANCE = 10;

/**
 * parent analytics class
 */
class Analytics {

  /**
   * creates a new instance
   * @param {NConsumer|NProducer} client
   * @param {object} config
   * @param {object} logger
   */
  constructor(client, config, logger){
    this.client = client;
    this.config = config;
    this.logger = logger;

    this._lastErrors = 0;
  }

  /**
   * @private
   * returns occured errors in interval
   * @param {object} stats - getStats() client result
   * @returns {number}
   */
  _errorsInInterval(stats){
    const diff = (stats.totalErrors || 0) - this._lastErrors;
    this._lastErrors = stats.totalErrors || 0;
    return diff;
  }

  /**
   * @static
   * @param {Array} offsets
   */
  static statusArrayToKeyedObject(offsets = []){

    const obj = {};

    offsets.forEach(offset => {

      if(!obj[offset.topic]){
        obj[offset.topic] = {};
      }

      obj[offset.topic][offset.partition] = {
        lowDistance: offset.lowDistance,
        highDistance: offset.highDistance,
        detail: offset.detail
      };
    });

    return obj;
  }
}

/**
 * outsourced analytics for nconsumers
 */
class ConsumerAnalytics extends Analytics {

  /**
   * creates a new instance
   * @param {NConsumer} nconsumer
   * @param {object} config
   * @param {object} logger
   */
  constructor(nconsumer, config, logger){
    super(nconsumer, config, logger);

    this._lastRes = null;
    this._consumedCount = 0;
  }

  /**
   * resolves a comparison between lag states
   * @private
   * @returns {Promise.<object>}
   */
  async _checkLagChanges(){

    const last = this.client._lastLagStatus;
    await this.client.getLagStatus(); //await potential refresh
    const newest = this.client._lagCache;

    if(!last || !newest){
      return {
        error: "No lag status fetched yet."
      };
    }

    if(!last){
      return {
        error: "Only newest status fetched yet."
      };
    }

    if(!newest){
      return {
        error: "Only last status fetched yet."
      };
    }

    const newLags = {};
    const changedLags = {};
    const resolvedLags = {};
    const stallLags = {};

    const lastKeyed = Analytics.statusArrayToKeyedObject(last.status);

    newest.status.forEach(offset => {

      //didnt exist in last check
      if(!lastKeyed[offset.topic] || !lastKeyed[offset.topic][offset.partition]){
        //distance is interesting
        if(offset.highDistance >= INTERESTING_DISTANCE){
          if(!newLags[offset.topic]){
            newLags[offset.topic] = {};
          }

          //store new lag for this partition
          newLags[offset.topic][offset.partition] = offset.highDistance;
        }
        return;
      }
      //did exist in last check

      //distance decreased
      if(offset.highDistance < INTERESTING_DISTANCE){

        if(!resolvedLags[offset.topic]){
          resolvedLags[offset.topic] = {};
        }

        resolvedLags[offset.topic][offset.partition] = offset.highDistance;
        return;
      }

      //distance equals
      if(offset.highDistance === lastKeyed[offset.topic][offset.partition].highDistance){

        if(!stallLags[offset.topic]){
          stallLags[offset.topic] = {};
        }

        stallLags[offset.topic][offset.partition] = offset.highDistance;
        return;
      }

      //distance changed (but did not decrease enough)
      if(!changedLags[offset.topic]){
        changedLags[offset.topic] = {};
      }

      changedLags[offset.topic][offset.partition] = offset.highDistance;
    });

    return {
      timelyDifference: newest.at - last.at,
      fetchPerformance: last.took - newest.took,
      newLags,
      changedLags,
      resolvedLags,
      stallLags
    };
  }

  /**
   * gets the largest lag in all assigned offsets
   * @private
   * @returns {object}
   */
  _identifyLargestLag(){

    let lag = {
      highDistance: -1
    };

    const newest = this.client._lagCache;

    if(!newest){
      return {
        error: "Only last status fetched yet."
      };
    }

    newest.status.forEach(offset => {
      if(offset.highDistance > lag.highDistance){
        lag = offset;
      }
    });

    return lag;
  }

  /**
   * returns consumed amount of messages in interval
   * @private
   * @param {object} stats - getStats() client result
   * @returns {number}
   */
  _consumed(stats){
    const diff = (stats.totalIncoming || 0) - this._consumedCount;
    this._consumedCount = stats.totalIncoming || 0;
    return diff;
  }

  /**
   * @async
   * called in interval
   * @returns {object}
   */
  async run(){

    const res = {
      generatedAt: Date.now(),
      interval: this.config.analyticsInterval
    };

    try {
      res.lagChange = await this._checkLagChanges();
    } catch(error){
      this.logger.error(`Failed to calculate lag changes ${error.message}.`);
      res.lagChange = null;
    }

    try {
      res.largestLag = this._identifyLargestLag();
    } catch(error){
      this.logger.error(`Failed to calculate largest lag ${error.message}.`);
      res.largestLag = null;
    }

    const stats = this.client.getStats();

    try {
      res.consumed = this._consumed(stats);
    } catch(error){
      this.logger.error(`Failed to get consumed count ${error.message}.`);
      res.consumed = null;
    }

    try {
      res.errors = this._errorsInInterval(stats);
    } catch(error){
      this.logger.error(`Failed to get error count ${error.message}.`);
      res.errors = null;
    }

    this.logger.debug(res);
    this._lastRes = res;
    return res;
  }

  /**
   * returns the last result of run()
   * @returns {object}
   */
  getLastResult(){
    return this._lastRes;
  }
}

/**
 * outsourced analytics for nproducers
 */
class ProducerAnalytics extends Analytics {

  /**
   * creates a new instance
   * @param {NProducer} nproducer
   * @param {object} config
   * @param {object} logger
   */
  constructor(nproducer, config, logger){
    super(nproducer, config, logger);

    this._lastRes = null;
    this._producedCount = 0;
  }

  /**
   * returns produced amount of messages in interval
   * @private
   * @param {object} stats - getStats() client result
   * @returns {number}
   */
  _produced(stats){
    const diff = (stats.totalPublished || 0) - this._producedCount;
    this._producedCount = stats.totalPublished || 0;
    return diff;
  }

  /**
   * called in interval
   * @returns {object}
   */
  async run(){

    const res = {
      generatedAt: Date.now(),
      interval: this.config.analyticsInterval
    };

    const stats = this.client.getStats();

    try {
      res.produced = this._produced(stats);
    } catch(error){
      this.logger.error(`Failed to get produced count ${error.message}.`);
      res.produced = null;
    }

    try {
      res.errors = this._errorsInInterval(stats);
    } catch(error){
      this.logger.error(`Failed to get error count ${error.message}.`);
      res.errors = null;
    }

    this.logger.debug(res);
    this._lastRes = res;
    return res;
  }

  /**
   * returns the last result of run()
   * @returns {object}
   */
  getLastResult(){
    return this._lastRes;
  }
}

module.exports = {
  ConsumerAnalytics,
  ProducerAnalytics
};
