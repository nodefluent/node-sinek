"use strict";

const THRESHOLDS = {
  CONSUMER: {
    ERRORS: 5,
    LAG: 1000,
    STALL_LAG: 10,
    MIN_MESSAGES: 1
  },
  PRODUCER: {
    ERRORS: 4,
    MIN_MESSAGES: 1
  }
};

const STATES = {
  DIS_ANALYTICS: -4,
  NO_ANALYTICS: -3,
  UNKNOWN: -2,
  UNCONNECTED: -1,
  HEALTHY: 0,
  RISK: 1,
  WARNING: 2,
  CRITICAL: 3
};

const MESSAGES = {
  DIS_ANALYTICS: "Analytics are disabled, cannot measure required parameters. Please enable.",
  NO_ANALYTICS: "Analytics have not yet run, checks will be available after first run.",
  UNKNOWN: "State is unknown.",
  UNCONNECTED: "The client is not connected.",
  HEALTHY: "No problems detected, client is healthy."
};

/**
 * little pojso class around the check object
 */
class Check {

  /**
   * creates a new instance
   * @param {number} status - status code
   * @param {Array|string} message - message/s, pass an empty array to initialise clean
   */
  constructor(status = STATES.HEALTHY, message = MESSAGES.HEALTHY){
    this.status = status;
    this.messages = Array.isArray(message) ? message : [message];
  }

  /**
   *
   * @param {number} status - new status code
   * @returns {boolean}
   */
  changeStatus(status = STATES.UNKNOWN){

    if(status > this.status){
      this.status = status;
      return true;
    }

    return false;
  }

  /**
   * adds a message to the check
   * @param {string} message - string message to attach
   * @returns {number}
   */
  add(message = MESSAGES.UNKNOWN){
    return this.messages.push(message);
  }
}

/**
 * health parent class
 */
class Health {

  /**
   * creates a new instance
   * @param {NConsumer|NProducer} client
   */
  constructor(client){
    this.client = client;

    //make them accessable
    this.STATES = STATES;
    this.MESSAGES = MESSAGES;
  }

  /**
   * returns a new check instance
   * @param {number} status
   * @param {Array|string} message
   */
  createCheck(status, message){
    return new Check(status, message);
  }
}

/**
 * health check adapted for NConsumers
 * @extends Health
 */
class ConsumerHealth extends Health {

  /**
   * creates a new instance
   * @param {NConsumer} nconsumer
   */
  constructor(nconsumer){
    super(nconsumer);
  }

  /**
   * runs the health check
   * @async
   * @returns {Promise.<Check>}
   */
  async check(){

    /* ### preparation ### */

    if(!this.client.consumer){
      return super.createCheck(STATES.UNCONNECTED, MESSAGES.UNCONNECTED);
    }

    if(!this.client._analytics){
      return super.createCheck(STATES.DIS_ANALYTICS, MESSAGES.DIS_ANALYTICS);
    }

    const analytics = this.client._analytics.getLastResult();

    if(!analytics){
      return super.createCheck(STATES.NO_ANALYTICS, MESSAGES.NO_ANALYTICS);
    }

    /* ### eof preparation ### */

    const check = new Check(STATES.HEALTHY, []);

    if(analytics.errors !== null && analytics.errors >= THRESHOLDS.CONSUMER.ERRORS){
      check.changeStatus(STATES.CRITICAL);
      check.add(MESSAGES.ERRORS);
    }

    if(analytics.largestLag !== null && analytics.largestLag.highDistance &&
        analytics.largestLag.highDistance > THRESHOLDS.CONSUMER.LAG){
      check.changeStatus(STATES.WARNING);
      check.add(`Lag exceeds threshold with a lag of ${analytics.largestLag.highDistance}` +
        ` on ${analytics.largestLag.topic}:${analytics.largestLag.partition}.`);
    }

    if(analytics.lagChange !== null && typeof analytics.lagChange.stallLags === "object" &&
        Object.keys(analytics.lagChange.stallLags).length > THRESHOLDS.CONSUMER.STALL_LAG){
      check.changeStatus(STATES.RISK);
      check.add(`Amount of stall lags exceeds threshold with ${Object.keys(analytics.lagChange.stallLags).length} unchanged lagging offsets.`);
    }

    if(analytics.consumed !== null && analytics.consumed < THRESHOLDS.CONSUMER.MIN_MESSAGES){
      check.changeStatus(STATES.RISK);
      check.add(`Amount of consumed messages is low ${analytics.consumed}.`);
    }

    if(check.status === STATES.HEALTHY){
      check.add(MESSAGES.HEALTHY);
      check.add(`Consumed ${analytics.consumed} message/s in the last interval, with ${analytics.errors} errors.`);
    }

    return check;
  }
}

/**
 * health check adapted for NProducers
 * @extends Health
 */
class ProducerHealth extends Health {

  /**
   * creates a new instance
   * @param {NProducer} nproducer
   */
  constructor(nproducer){
    super(nproducer);
  }

  /**
   * runs the health check
   * @async
   * @returns {Promise.<Check>}
   */
  async check(){

    /* ### preparation ### */

    if(!this.client.producer){
      return super.createCheck(STATES.UNCONNECTED, MESSAGES.UNCONNECTED);
    }

    if(!this.client._analytics){
      return super.createCheck(STATES.DIS_ANALYTICS, MESSAGES.DIS_ANALYTICS);
    }

    const analytics = this.client._analytics.getLastResult();

    if(!analytics){
      return super.createCheck(STATES.NO_ANALYTICS, MESSAGES.NO_ANALYTICS);
    }

    /* ### eof preparation ### */

    const check = new Check(STATES.HEALTHY, []);

    if(analytics.errors !== null && analytics.errors >= THRESHOLDS.PRODUCER.ERRORS){
      check.changeStatus(STATES.CRITICAL);
      check.add(MESSAGES.ERRORS);
    }

    if(analytics.produced !== null && analytics.produced < THRESHOLDS.PRODUCER.MIN_MESSAGES){
      check.changeStatus(STATES.RISK);
      check.add(`Amount of produced messages is low ${analytics.produced}.`);
    }

    if(check.status === STATES.HEALTHY){
      check.add(MESSAGES.HEALTHY);
      check.add(`Produced ${analytics.produced} message/s in the last interval, with ${analytics.errors} errors.`);
    }

    return check;
  }
}

module.exports = {
  ConsumerHealth,
  ProducerHealth
};
