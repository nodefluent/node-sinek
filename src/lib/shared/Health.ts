import merge from "lodash.merge";
import { KafkaHealthConfig } from "../interfaces";
import { JSProducer, JSConsumer } from "../kafkajs";

const defaultConfig = {
  thresholds: {
    consumer: {
      errors: 5,
      lag: 1000,
      stallLag: 10,
      minMessages: 1
    },
    producer: {
      errors: 4,
      minMessages: 1
    }
  }
};

export const STATES = {
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
  HEALTHY: "No problems detected, client is healthy.",
  ERRORS: "There was an error."
};

/**
 * little pojso class around the check object
 */
export class Check {

  status: number;
  messages: string[];

  /**
   * creates a new instance
   * @param {number} status - status code
   * @param {Array|string} message - message/s, pass an empty array to initialise clean
   */
  constructor(status = STATES.HEALTHY, message: string | string[] = MESSAGES.HEALTHY) {
    this.status = status;
    this.messages = Array.isArray(message) ? message : [message];
  }

  /**
   *
   * @param {number} status - new status code
   * @returns {boolean}
   */
  changeStatus(status: number = STATES.UNKNOWN): boolean {

    if (status > this.status) {
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
  add(message: string = MESSAGES.UNKNOWN): number {
    return this.messages.push(message);
  }
}

/**
 * health parent class
 */
abstract class Health {

  config: KafkaHealthConfig;
  abstract client;
  STATES = STATES;
  MESSAGES = MESSAGES

  /**
   * creates a new instance
   * @param {config} config
   */
  constructor(config?: KafkaHealthConfig) {
    this.config = merge({}, defaultConfig, config);
  }

  /**
   * returns a new check instance
   * @param {number} status
   * @param {Array|string} message
   */
  createCheck(status: number, message: string | string[]): Check {
    return new Check(status, message);
  }
}

/**
 * health check adapted for NConsumers
 * @extends Health
 */
export class ConsumerHealth extends Health {

  client: JSConsumer;

  /**
   * creates a new instance
   * @param {NConsumer} nconsumer
   * @param {config} config optional
   */
  constructor(nconsumer: JSConsumer, config?: KafkaHealthConfig) {
    super(config);
    this.client = nconsumer;
  }

  /**
   * runs the health check
   * @async
   * @returns {Promise.<Check>}
   */
  async check(): Promise<Check> {

    /* ### preparation ### */

    if (!this.client.consumer) {
      return super.createCheck(STATES.UNCONNECTED, MESSAGES.UNCONNECTED);
    }

    if (!this.client._analytics) {
      return super.createCheck(STATES.DIS_ANALYTICS, MESSAGES.DIS_ANALYTICS);
    }

    const analytics = this.client._analytics.getLastResult();

    if (!analytics || Object.keys(analytics).length === 0) {
      return super.createCheck(STATES.NO_ANALYTICS, MESSAGES.NO_ANALYTICS);
    }

    /* ### eof preparation ### */

    const check = new Check(STATES.HEALTHY, []);

    if (analytics.errors !== null && analytics.errors >= this.config.thresholds.consumer.errors) {
      check.changeStatus(STATES.CRITICAL);
      check.add(MESSAGES.ERRORS);
    }

    if (analytics.largestLag !== null && analytics.largestLag.highDistance &&
      analytics.largestLag.highDistance > this.config.thresholds.consumer.lag) {
      check.changeStatus(STATES.WARNING);
      check.add(`Lag exceeds threshold with a lag of ${analytics.largestLag.highDistance}` +
        ` on ${analytics.largestLag.topic}:${analytics.largestLag.partition}.`);
    }

    if (analytics.lagChange !== null && typeof analytics.lagChange.stallLags === "object" &&
      Object.keys(analytics.lagChange.stallLags).length > this.config.thresholds.consumer.stallLag) {
      check.changeStatus(STATES.RISK);
      check.add(`Amount of stall lags exceeds threshold with ${Object.keys(analytics.lagChange.stallLags).length} unchanged lagging offsets.`);
    }

    if (analytics.consumed !== null && analytics.consumed < this.config.thresholds.consumer.minMessages) {
      check.changeStatus(STATES.RISK);
      check.add(`Amount of consumed messages is low ${analytics.consumed}.`);
    }

    if (check.status === STATES.HEALTHY) {
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
export class ProducerHealth extends Health {

  client: JSProducer;

  /**
   * creates a new instance
   * @param {NProducer} nproducer
   * @param {config} config
   */
  constructor(nproducer: JSProducer, config?: KafkaHealthConfig) {
    super(config);
    this.client = nproducer;
  }

  /**
   * runs the health check
   * @async
   * @returns {Promise.<Check>}
   */
  async check(): Promise<Check> {

    /* ### preparation ### */

    if (!this.client.producer) {
      return super.createCheck(STATES.UNCONNECTED, MESSAGES.UNCONNECTED);
    }

    if (!this.client._analytics) {
      return super.createCheck(STATES.DIS_ANALYTICS, MESSAGES.DIS_ANALYTICS);
    }

    const analytics = this.client._analytics.getLastResult();

    if (!analytics || Object.keys(analytics).length === 0) {
      return super.createCheck(STATES.NO_ANALYTICS, MESSAGES.NO_ANALYTICS);
    }

    /* ### eof preparation ### */

    const check = new Check(STATES.HEALTHY);

    if (analytics.errors !== null && analytics.errors >= this.config.thresholds.producer.errors) {
      check.changeStatus(STATES.CRITICAL);
      check.add(MESSAGES.ERRORS);
    }

    if (analytics.produced !== null && analytics.produced < this.config.thresholds.producer.minMessages) {
      check.changeStatus(STATES.RISK);
      check.add(`Amount of produced messages is low ${analytics.produced}.`);
    }

    if (check.status === STATES.HEALTHY) {
      check.add(MESSAGES.HEALTHY);
      check.add(`Produced ${analytics.produced} message/s in the last interval, with ${analytics.errors} errors.`);
    }

    return check;
  }
}
