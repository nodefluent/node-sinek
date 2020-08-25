import { LagStatus, AnalyticsLagChange, KafkaLogger, AnalyticsConfig, ConsumerStats, ProducerStats } from "../interfaces";
import { JSConsumer, JSProducer } from "../kafkajs";
export declare const defaultAnalyticsInterval: number;
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
            lowOffset: number;
            highOffset: number;
            comittedOffset: number;
        };
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
declare abstract class Analytics {
    abstract client: JSConsumer | JSProducer;
    config: AnalyticsConfig | null;
    logger: KafkaLogger;
    _lastErrors: number;
    _consumedCount: number;
    abstract _lastRes: RunResult | null;
    _producedCount: number;
    /**
     * creates a new instance
     * @param {object} config
     * @param {object} logger
     */
    constructor(config: AnalyticsConfig | null | undefined, logger: KafkaLogger);
    /**
     * @private
     * returns occured errors in interval
     * @param {object} stats - getStats() client result
     * @returns {number}
     */
    _errorsInInterval(stats: any): number;
    /**
     * @static
     * @param {Array} offsets
     */
    static statusArrayToKeyedObject(offsets?: LagStatus[]): {};
    abstract run(): any;
}
/**
 * outsourced analytics for nconsumers
 */
export declare class ConsumerAnalytics extends Analytics {
    _lastRes: ConsumerRunResult | null;
    client: JSConsumer;
    /**
     * creates a new instance
     * @param {NConsumer|NProducer} client
     * @param {object} config
     * @param {object} logger
     */
    constructor(client: JSConsumer, config: AnalyticsConfig | null | undefined, logger: KafkaLogger);
    /**
     * resolves a comparison between lag states
     * @private
     * @returns {Promise.<object>}
     */
    _checkLagChanges(): Promise<AnalyticsLagChange | {
        error: string;
    }>;
    /**
     * gets the largest lag in all assigned offsets
     * @private
     * @returns {object}
     */
    _identifyLargestLag(): {
        highDistance?: number;
        error?: string;
    };
    /**
     * returns consumed amount of messages in interval
     * @private
     * @param {object} stats - getStats() client result
     * @returns {number}
     */
    _consumed(stats: ConsumerStats): number;
    /**
     * @async
     * called in interval
     * @returns {object}
     */
    run(): Promise<ConsumerRunResult>;
    /**
     * returns the last result of run()
     * @returns {object}
     */
    getLastResult(): ConsumerRunResult | null;
}
/**
 * outsourced analytics for nproducers
 */
export declare class ProducerAnalytics extends Analytics {
    _lastRes: ProducerRunResult | null;
    client: JSProducer;
    /**
     * creates a new instance
     * @param {object} config
     * @param {object} logger
     */
    constructor(client: JSProducer, config: AnalyticsConfig | null | undefined, logger: KafkaLogger);
    /**
     * returns produced amount of messages in interval
     * @private
     * @param {object} stats - getStats() client result
     * @returns {number}
     */
    _produced(stats: ProducerStats): number;
    /**
     * called in interval
     * @returns {object}
     */
    run(): Promise<ProducerRunResult>;
    /**
     * returns the last result of run()
     * @returns {object}
     */
    getLastResult(): ProducerRunResult | null;
}
export {};
//# sourceMappingURL=Analytics.d.ts.map