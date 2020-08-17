import { LagStatus, AnalyticsLagChange, KafkaLogger, AnalyticsConfig, ConsumerStats, ProducerStats } from "../interfaces";
import { JSConsumer, JSProducer } from "../kafkajs";

const INTERESTING_DISTANCE = 10;
export const defaultAnalyticsInterval = 1000 * 150;

interface RunResult {
  generatedAt: number;
  interval: number;
  errors: number | null;
}

export interface ConsumerRunResult extends RunResult {
  lagChange: AnalyticsLagChange;
  largestLag: {
    topic: string;
    partition: number;
    lowDistance: number;
    highDistance: number;
    detail: {
      lowOffset: number,
      highOffset: number,
      comittedOffset: number
    }
  };
  consumed: number | null;
}

export interface ProducerRunResult extends RunResult {
  produced: number | null;
  interval: number;
}

/**
 * parent analytics class
 */
abstract class Analytics {

  abstract client: JSConsumer | JSProducer;
  config: AnalyticsConfig | null = null;
  logger: KafkaLogger;

  _lastErrors =  0;
  _consumedCount = 0;

  abstract _lastRes: RunResult | null = null;
  _producedCount = 0;

  /**
   * creates a new instance
   * @param {object} config
   * @param {object} logger
   */
  constructor(config: AnalyticsConfig | null = null, logger: KafkaLogger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * @private
   * returns occured errors in interval
   * @param {object} stats - getStats() client result
   * @returns {number}
   */
  _errorsInInterval(stats): number {
    const diff = (stats.totalErrors || 0) - this._lastErrors;
    this._lastErrors = stats.totalErrors || 0;
    return diff;
  }

  /**
   * @static
   * @param {Array} offsets
   */
  static statusArrayToKeyedObject(offsets: LagStatus[] = []) {

    const obj = {};

    offsets.forEach(offset => {

      if (!obj[offset.topic]) {
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

  abstract run();
}

/**
 * outsourced analytics for nconsumers
 */
export class ConsumerAnalytics extends Analytics {

  _lastRes: ConsumerRunResult | null = null;

  client: JSConsumer;

  /**
   * creates a new instance
   * @param {NConsumer|NProducer} client
   * @param {object} config
   * @param {object} logger
   */
  constructor(client: JSConsumer, config: AnalyticsConfig | null = null, logger: KafkaLogger) {
    super(config, logger);
    this.client = client; // consumer or producer.
  }

  /**
   * resolves a comparison between lag states
   * @private
   * @returns {Promise.<object>}
   */
  async _checkLagChanges(): Promise<AnalyticsLagChange | {error: string}> {

    const last = this.client.getLastLagStatus();
    await this.client.getLagStatus(); //await potential refresh
    const newest = this.client.getLagCache();

    if (!last || !newest) {
      return {
        error: "No lag status fetched yet."
      };
    }

    if (!last) {
      return {
        error: "Only newest status fetched yet."
      };
    }

    if (!newest) {
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
      if (!lastKeyed[offset.topic] || !lastKeyed[offset.topic][offset.partition]) {
        //distance is interesting
        if (offset.highDistance >= INTERESTING_DISTANCE) {
          if (!newLags[offset.topic]) {
            newLags[offset.topic] = {};
          }

          //store new lag for this partition
          newLags[offset.topic][offset.partition] = offset.highDistance;
        }
        return;
      }
      //did exist in last check

      //distance decreased
      if (offset.highDistance < INTERESTING_DISTANCE) {

        if (!resolvedLags[offset.topic]) {
          resolvedLags[offset.topic] = {};
        }

        resolvedLags[offset.topic][offset.partition] = offset.highDistance;
        return;
      }

      //distance equals
      if (offset.highDistance === lastKeyed[offset.topic][offset.partition].highDistance) {

        if (!stallLags[offset.topic]) {
          stallLags[offset.topic] = {};
        }

        stallLags[offset.topic][offset.partition] = offset.highDistance;
        return;
      }

      //distance changed (but did not decrease enough)
      if (!changedLags[offset.topic]) {
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
  _identifyLargestLag(): { highDistance?: number, error?: string } {

    let lag = {
      highDistance: -1
    };

    const newest = this.client.getLagCache();

    if (!newest) {
      return {
        error: "Only last status fetched yet."
      };
    }

    newest.status.forEach(offset => {
      if (offset.highDistance > lag.highDistance) {
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
  _consumed(stats: ConsumerStats): number {
    const diff = (stats.totalIncoming || 0) - this._consumedCount;
    this._consumedCount = stats.totalIncoming || 0;
    return diff;
  }

  /**
   * @async
   * called in interval
   * @returns {object}
   */
  async run(): Promise<ConsumerRunResult> {

    const res = {
      generatedAt: Date.now(),
      interval: (this.config) ? this.config.analyticsInterval : defaultAnalyticsInterval,
      lagChange: {},
      largestLag: {},
      consumed: 0,
      errors: 0,
    };

    try {
      res.lagChange = await this._checkLagChanges();
    } catch (error) {
      this.logger.error(`Failed to calculate lag changes ${error.message}.`);
      // res.lagChange = null;
    }

    try {
      res.largestLag = this._identifyLargestLag();
    } catch (error) {
      this.logger.error(`Failed to calculate largest lag ${error.message}.`);
      // res.largestLag = null;
    }

    const stats = this.client.getStats();

    try {
      res.consumed = this._consumed(stats);
    } catch (error) {
      this.logger.error(`Failed to get consumed count ${error.message}.`);
      // res.consumed = null;
    }

    try {
      res.errors = this._errorsInInterval(stats);
    } catch (error) {
      this.logger.error(`Failed to get error count ${error.message}.`);
      // res.errors = null;
    }

    this.logger.debug(JSON.stringify(res));
    this._lastRes = res as ConsumerRunResult;
    return res as ConsumerRunResult;
  }

  /**
   * returns the last result of run()
   * @returns {object}
   */
  getLastResult(): ConsumerRunResult | null {
    return this._lastRes;
  }
}

/**
 * outsourced analytics for nproducers
 */
export class ProducerAnalytics extends Analytics {

  _lastRes: ProducerRunResult | null = null;

  client: JSProducer;

  /**
   * creates a new instance
   * @param {object} config
   * @param {object} logger
   */
  constructor(client: JSProducer, config: AnalyticsConfig | null = null, logger: KafkaLogger) {
    super(config, logger);
    this.client = client; // consumer or producer.
  }

  /**
   * returns produced amount of messages in interval
   * @private
   * @param {object} stats - getStats() client result
   * @returns {number}
   */
  _produced(stats: ProducerStats): number {
    const diff = (stats.totalPublished || 0) - this._producedCount;
    this._producedCount = stats.totalPublished || 0;
    return diff;
  }

  /**
   * called in interval
   * @returns {object}
   */
  async run(): Promise<ProducerRunResult> {

    const res: ProducerRunResult = {
      generatedAt: Date.now(),
      interval: (this.config) ? this.config.analyticsInterval : defaultAnalyticsInterval,
      produced: 0,
      errors: null,
    };

    const stats = this.client.getStats();

    try {
      res.produced = this._produced(stats);
    } catch (error) {
      this.logger.error(`Failed to get produced count ${error.message}.`);
      res.produced = null;
    }

    try {
      res.errors = this._errorsInInterval(stats);
    } catch (error) {
      this.logger.error(`Failed to get error count ${error.message}.`);
      res.errors = null;
    }

    this.logger.debug(JSON.stringify(res));
    this._lastRes = res;
    return res;
  }

  /**
   * returns the last result of run()
   * @returns {object}
   */
  getLastResult(): ProducerRunResult | null {
    return this._lastRes;
  }
}
