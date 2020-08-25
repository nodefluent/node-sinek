import { KafkaHealthConfig } from "../interfaces";
import { JSProducer, JSConsumer } from "../kafkajs";
export declare const STATES: {
    DIS_ANALYTICS: number;
    NO_ANALYTICS: number;
    UNKNOWN: number;
    UNCONNECTED: number;
    HEALTHY: number;
    RISK: number;
    WARNING: number;
    CRITICAL: number;
};
/**
 * little pojso class around the check object
 */
export declare class Check {
    status: number;
    messages: string[];
    /**
     * creates a new instance
     * @param {number} status - status code
     * @param {Array|string} message - message/s, pass an empty array to initialise clean
     */
    constructor(status?: number, message?: string | string[]);
    /**
     *
     * @param {number} status - new status code
     * @returns {boolean}
     */
    changeStatus(status?: number): boolean;
    /**
     * adds a message to the check
     * @param {string} message - string message to attach
     * @returns {number}
     */
    add(message?: string): number;
}
/**
 * health parent class
 */
declare abstract class Health {
    config: KafkaHealthConfig;
    abstract client: any;
    STATES: {
        DIS_ANALYTICS: number;
        NO_ANALYTICS: number;
        UNKNOWN: number;
        UNCONNECTED: number;
        HEALTHY: number;
        RISK: number;
        WARNING: number;
        CRITICAL: number;
    };
    MESSAGES: {
        DIS_ANALYTICS: string;
        NO_ANALYTICS: string;
        UNKNOWN: string;
        UNCONNECTED: string;
        HEALTHY: string;
        ERRORS: string;
    };
    /**
     * creates a new instance
     * @param {config} config
     */
    constructor(config?: KafkaHealthConfig);
    /**
     * returns a new check instance
     * @param {number} status
     * @param {Array|string} message
     */
    createCheck(status: number, message: string | string[]): Check;
}
/**
 * health check adapted for NConsumers
 * @extends Health
 */
export declare class ConsumerHealth extends Health {
    client: JSConsumer;
    /**
     * creates a new instance
     * @param {NConsumer} nconsumer
     * @param {config} config optional
     */
    constructor(nconsumer: JSConsumer, config?: KafkaHealthConfig);
    /**
     * runs the health check
     * @async
     * @returns {Promise.<Check>}
     */
    check(): Promise<Check>;
}
/**
 * health check adapted for NProducers
 * @extends Health
 */
export declare class ProducerHealth extends Health {
    client: JSProducer;
    /**
     * creates a new instance
     * @param {NProducer} nproducer
     * @param {config} config
     */
    constructor(nproducer: JSProducer, config?: KafkaHealthConfig);
    /**
     * runs the health check
     * @async
     * @returns {Promise.<Check>}
     */
    check(): Promise<Check>;
}
export {};
//# sourceMappingURL=Health.d.ts.map